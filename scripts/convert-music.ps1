[CmdletBinding()]
param()

# Os WAVs mestres ficam fora do repositorio em:
# C:\Projetos\RuaDeAco_AudioMasters\music
# Para reconverter, copie temporariamente os tres WAVs de volta para
# tmp\audio-source\music, execute este script e depois devolva-os ao backup.

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$sourceDirectory = Join-Path $projectRoot 'tmp\audio-source\music'
$backupDirectory = Join-Path (Split-Path -Parent $projectRoot) 'RuaDeAco_AudioMasters\music'
$outputDirectory = Join-Path $projectRoot 'public\assets\audio\music'
$durationToleranceSeconds = 0.1
$trackNames = @(
    'menu-principal',
    'selecao-personagens',
    'cais-da-cidade'
)

function Assert-Tool {
    param([Parameter(Mandatory)][string]$Name)

    $command = Get-Command $Name -CommandType Application -ErrorAction SilentlyContinue
    if (-not $command) {
        throw "Ferramenta obrigatoria nao encontrada no PATH: $Name"
    }

    return $command.Source
}

function Invoke-CheckedCommand {
    param(
        [Parameter(Mandatory)][string]$Executable,
        [Parameter(Mandatory)][string[]]$Arguments,
        [Parameter(Mandatory)][string]$Description
    )

    & $Executable @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "$Description falhou com codigo de saida $LASTEXITCODE."
    }
}

function Get-AudioProbe {
    param(
        [Parameter(Mandatory)][string]$Ffprobe,
        [Parameter(Mandatory)][string]$Path
    )

    $json = & $Ffprobe @(
        '-v', 'error',
        '-select_streams', 'a:0',
        '-show_entries', 'format=format_name,duration,size,bit_rate:stream=codec_name,sample_rate,channels,bits_per_sample,bits_per_raw_sample,bit_rate',
        '-of', 'json',
        $Path
    )
    if ($LASTEXITCODE -ne 0) {
        throw "FFprobe nao conseguiu analisar: $Path"
    }

    $probe = ($json -join "`n") | ConvertFrom-Json
    if (-not $probe.streams -or $probe.streams.Count -eq 0) {
        throw "Nenhuma faixa de audio encontrada em: $Path"
    }

    $stream = $probe.streams[0]
    $format = $probe.format
    $rawBitDepthProperty = $stream.PSObject.Properties['bits_per_raw_sample']
    $bitDepthProperty = $stream.PSObject.Properties['bits_per_sample']
    $streamBitRateProperty = $stream.PSObject.Properties['bit_rate']
    $formatBitRateProperty = $format.PSObject.Properties['bit_rate']

    $rawBitDepth = if ($rawBitDepthProperty) { [int]$rawBitDepthProperty.Value } else { 0 }
    $sampleBitDepth = if ($bitDepthProperty) { [int]$bitDepthProperty.Value } else { 0 }
    $bitDepth = if ($rawBitDepth -gt 0) {
        $rawBitDepth
    } elseif ($sampleBitDepth -gt 0) {
        $sampleBitDepth
    } else {
        $null
    }

    return [pscustomobject]@{
        Path       = $Path
        Format     = [string]$format.format_name
        Codec      = [string]$stream.codec_name
        Duration   = [double]$format.duration
        Size       = [long]$format.size
        SampleRate = [int]$stream.sample_rate
        Channels   = [int]$stream.channels
        BitDepth   = $bitDepth
        BitRate    = if ($streamBitRateProperty -and $streamBitRateProperty.Value) {
            [long]$streamBitRateProperty.Value
        } elseif ($formatBitRateProperty -and $formatBitRateProperty.Value) {
            [long]$formatBitRateProperty.Value
        } else {
            $null
        }
    }
}

function Get-VolumeDiagnostic {
    param(
        [Parameter(Mandatory)][string]$Ffmpeg,
        [Parameter(Mandatory)][string]$Path
    )

    $diagnostic = & $Ffmpeg @(
        '-hide_banner', '-nostats',
        '-i', $Path,
        '-af', 'volumedetect',
        '-f', 'null',
        'NUL'
    ) 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "Analise de volume falhou para: $Path"
    }

    $text = $diagnostic -join "`n"
    $meanMatch = [regex]::Match($text, 'mean_volume:\s*([^\s]+\s*dB)')
    $maxMatch = [regex]::Match($text, 'max_volume:\s*([^\s]+\s*dB)')
    $maxValueMatch = [regex]::Match($text, 'max_volume:\s*(-?[0-9]+(?:\.[0-9]+)?)\s*dB')

    return [pscustomobject]@{
        MeanVolume = if ($meanMatch.Success) { $meanMatch.Groups[1].Value } else { 'indisponivel' }
        MaxVolume  = if ($maxMatch.Success) { $maxMatch.Groups[1].Value } else { 'indisponivel' }
        NearPeak   = $maxValueMatch.Success -and ([double]$maxValueMatch.Groups[1].Value -ge -0.1)
    }
}

function Assert-Decodable {
    param(
        [Parameter(Mandatory)][string]$Ffmpeg,
        [Parameter(Mandatory)][string]$Path
    )

    Invoke-CheckedCommand -Executable $Ffmpeg -Description "Validacao de decodificacao de $Path" -Arguments @(
        '-v', 'error',
        '-i', $Path,
        '-map', '0:a:0',
        '-f', 'null',
        'NUL'
    )
}

$ffmpeg = Assert-Tool -Name 'ffmpeg'
$ffprobe = Assert-Tool -Name 'ffprobe'
$ffplayCommand = Get-Command 'ffplay' -CommandType Application -ErrorAction SilentlyContinue

Write-Host "FFmpeg:  $ffmpeg"
Write-Host "FFprobe: $ffprobe"
Write-Host "Projeto: $projectRoot"

$sources = foreach ($name in $trackNames) {
    $path = Join-Path $sourceDirectory "$name.wav"
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
        throw "Arquivo-fonte obrigatorio nao encontrado: $path. Restaure-o temporariamente de $backupDirectory."
    }

    [pscustomobject]@{ Name = $name; Path = $path }
}

Write-Host "`nAnalise dos WAVs originais"
$sourceData = @{}
foreach ($source in $sources) {
    $probe = Get-AudioProbe -Ffprobe $ffprobe -Path $source.Path
    $volume = Get-VolumeDiagnostic -Ffmpeg $ffmpeg -Path $source.Path
    $sourceData[$source.Name] = [pscustomobject]@{ Probe = $probe; Volume = $volume }

    [pscustomobject]@{
        Faixa       = $source.Name
        Formato     = $probe.Format
        Codec       = $probe.Codec
        Duracao     = ('{0:N3} s' -f $probe.Duration)
        Tamanho     = ('{0:N2} MiB' -f ($probe.Size / 1MB))
        SampleRate  = $probe.SampleRate
        Canais      = $probe.Channels
        BitDepth    = if ($null -ne $probe.BitDepth) { $probe.BitDepth } else { 'n/d' }
        VolumeMedio = $volume.MeanVolume
        Pico        = $volume.MaxVolume
    } | Format-List

    if ($volume.NearPeak) {
        Write-Warning "$($source.Name): pico muito proximo de 0 dB; nenhuma correcao automatica sera aplicada."
    }
}

New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null

$formats = @(
    [pscustomobject]@{
        Extension = 'ogg'
        Codec = 'vorbis'
        Arguments = @('-c:a', 'libvorbis', '-q:a', '5')
    },
    [pscustomobject]@{
        Extension = 'mp3'
        Codec = 'mp3'
        Arguments = @('-c:a', 'libmp3lame', '-b:a', '192k')
    }
)

$results = [System.Collections.Generic.List[object]]::new()
$temporaryFiles = [System.Collections.Generic.List[string]]::new()

try {
    foreach ($source in $sources) {
        $inputProbe = $sourceData[$source.Name].Probe

        foreach ($format in $formats) {
            $finalPath = Join-Path $outputDirectory "$($source.Name).$($format.Extension)"
            $temporaryPath = Join-Path $outputDirectory "$($source.Name).tmp.$($format.Extension)"
            $temporaryFiles.Add($temporaryPath)
            Remove-Item -LiteralPath $temporaryPath -Force -ErrorAction SilentlyContinue

            $arguments = @(
                '-hide_banner', '-loglevel', 'warning', '-y',
                '-i', $source.Path,
                '-map', '0:a:0',
                '-vn',
                '-map_metadata', '-1'
            ) + $format.Arguments + @($temporaryPath)

            Write-Host "Convertendo $($source.Name) para $($format.Extension.ToUpperInvariant())..."
            Invoke-CheckedCommand -Executable $ffmpeg -Arguments $arguments -Description "Conversao de $($source.Name) para $($format.Extension)"
            Assert-Decodable -Ffmpeg $ffmpeg -Path $temporaryPath

            $outputProbe = Get-AudioProbe -Ffprobe $ffprobe -Path $temporaryPath
            if ($outputProbe.Codec -ne $format.Codec) {
                throw "Codec inesperado em ${temporaryPath}: esperado $($format.Codec), encontrado $($outputProbe.Codec)."
            }
            if ($outputProbe.SampleRate -ne $inputProbe.SampleRate) {
                throw "Sample rate alterado em ${temporaryPath}: $($inputProbe.SampleRate) -> $($outputProbe.SampleRate)."
            }
            if ($outputProbe.Channels -ne $inputProbe.Channels) {
                throw "Numero de canais alterado em ${temporaryPath}: $($inputProbe.Channels) -> $($outputProbe.Channels)."
            }

            $durationDifference = [math]::Abs($outputProbe.Duration - $inputProbe.Duration)
            if ($durationDifference -gt $durationToleranceSeconds) {
                Write-Warning "$($source.Name).$($format.Extension): diferenca de duracao de $('{0:N3}' -f $durationDifference) s."
            }

            Move-Item -LiteralPath $temporaryPath -Destination $finalPath -Force
            $temporaryFiles.Remove($temporaryPath) | Out-Null

            $savedBytes = $inputProbe.Size - $outputProbe.Size
            $savedPercent = if ($inputProbe.Size -gt 0) { 100 * $savedBytes / $inputProbe.Size } else { 0 }
            $results.Add([pscustomobject]@{
                Faixa          = $source.Name
                Formato        = $format.Extension.ToUpperInvariant()
                Codec          = $outputProbe.Codec
                DuracaoSeg     = [math]::Round($outputProbe.Duration, 3)
                DiferencaSeg   = [math]::Round($durationDifference, 3)
                SampleRate     = $outputProbe.SampleRate
                Canais         = $outputProbe.Channels
                BitrateKbps    = if ($outputProbe.BitRate) { [math]::Round($outputProbe.BitRate / 1000, 1) } else { 'n/d' }
                OriginalBytes  = $inputProbe.Size
                ConvertidoBytes = $outputProbe.Size
                EconomiaBytes  = $savedBytes
                EconomiaPct    = [math]::Round($savedPercent, 2)
                Caminho        = $finalPath
            })
        }
    }

    # Os WAVs publicados sao copias desnecessarias; os originais em tmp permanecem intactos.
    foreach ($name in $trackNames) {
        $publishedWav = Join-Path $outputDirectory "$name.wav"
        if (Test-Path -LiteralPath $publishedWav -PathType Leaf) {
            Remove-Item -LiteralPath $publishedWav -Force
        }
    }
}
finally {
    foreach ($temporaryFile in $temporaryFiles) {
        Remove-Item -LiteralPath $temporaryFile -Force -ErrorAction SilentlyContinue
    }
}

$expectedOutputNames = foreach ($name in $trackNames) {
    "$name.ogg"
    "$name.mp3"
}
$actualOutputNames = @(Get-ChildItem -LiteralPath $outputDirectory -File | Select-Object -ExpandProperty Name)
$unexpected = @($actualOutputNames | Where-Object { $_ -notin $expectedOutputNames })
$missing = @($expectedOutputNames | Where-Object { $_ -notin $actualOutputNames })
if ($missing.Count -gt 0) {
    throw "Arquivos finais ausentes: $($missing -join ', ')"
}
if ($unexpected.Count -gt 0) {
    Write-Warning "Arquivos adicionais encontrados na pasta de saida: $($unexpected -join ', ')"
}

Write-Host "`nResultado final"
$results | Sort-Object Faixa, Formato | Format-Table -AutoSize

Write-Host "`nEconomia detalhada"
$results | Select-Object Faixa, Formato, OriginalBytes, ConvertidoBytes, EconomiaBytes, EconomiaPct | Format-Table -AutoSize

Write-Host "`nValidacao concluida: os seis arquivos foram decodificados e conferidos com FFprobe."
if ($ffplayCommand) {
    Write-Host "FFplay disponivel em: $($ffplayCommand.Source)"
    Write-Host 'A verificacao auditiva exige escuta humana; use os comandos informados ao final desta execucao.'
} else {
    Write-Warning 'FFplay nao esta disponivel; a verificacao auditiva foi ignorada.'
}

Write-Host "`nPara executar novamente:"
Write-Host "  & '$PSCommandPath'"
Write-Host "`nPara ouvir os arquivos:"
foreach ($name in $trackNames) {
    Write-Host "  ffplay -nodisp -autoexit `"$(Join-Path $outputDirectory "$name.ogg")`""
}
