[CmdletBinding()]
param(
  [string]$OutputDirectory = (Join-Path $env:TEMP 'RuaDeAco-GoogleDriveBackup'),
  [switch]$ReuseExisting
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$projectsRoot = Split-Path -Parent $projectRoot
$contextRoot = Join-Path $projectRoot 'RuaDeAco_Contexto_GPTWork'
$audioMastersRoot = Join-Path $projectsRoot 'RuaDeAco_AudioMasters'

function Assert-Command {
  param([Parameter(Mandatory)][string]$Name)

  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Comando obrigatorio nao encontrado: $Name"
  }
}

function Get-ArchiveInfo {
  param([Parameter(Mandatory)][string]$Path)

  $item = Get-Item -LiteralPath $Path
  $hash = Get-FileHash -LiteralPath $Path -Algorithm SHA256

  [ordered]@{
    name = $item.Name
    bytes = $item.Length
    sha256 = $hash.Hash.ToLowerInvariant()
  }
}

function New-UploadParts {
  param(
    [Parameter(Mandatory)][string]$Path,
    [long]$MaximumPartBytes = 90MB
  )

  $item = Get-Item -LiteralPath $Path
  $partPattern = "$($item.Name).part*"
  Get-ChildItem -LiteralPath $item.DirectoryName -File -Filter $partPattern -ErrorAction SilentlyContinue |
    Remove-Item -Force

  if ($item.Length -le $MaximumPartBytes) {
    $info = Get-ArchiveInfo -Path $Path
    $info.source = $item.Name
    $info.part = 1
    $info.totalParts = 1
    return ,$info
  }

  $buffer = New-Object byte[] (4MB)
  $source = [System.IO.File]::OpenRead($Path)
  $created = [System.Collections.Generic.List[object]]::new()

  try {
    $partNumber = 0
    while ($source.Position -lt $source.Length) {
      $partNumber++
      $partPath = '{0}.part{1:D3}' -f $Path, $partNumber
      $destination = [System.IO.File]::Create($partPath)
      try {
        $written = 0L
        while (($written -lt $MaximumPartBytes) -and ($source.Position -lt $source.Length)) {
          $remaining = [math]::Min($buffer.Length, $MaximumPartBytes - $written)
          $read = $source.Read($buffer, 0, [int]$remaining)
          if ($read -le 0) { break }
          $destination.Write($buffer, 0, $read)
          $written += $read
        }
      }
      finally {
        $destination.Dispose()
      }

      $created.Add((Get-ArchiveInfo -Path $partPath))
    }
  }
  finally {
    $source.Dispose()
  }

  $totalParts = $created.Count
  for ($index = 0; $index -lt $created.Count; $index++) {
    $created[$index].source = $item.Name
    $created[$index].part = $index + 1
    $created[$index].totalParts = $totalParts
  }

  return $created.ToArray()
}

Assert-Command -Name 'git'
Assert-Command -Name 'tar.exe'

if (-not (Test-Path -LiteralPath (Join-Path $projectRoot '.git'))) {
  throw "Repositorio Git nao encontrado em: $projectRoot"
}

if (-not (Test-Path -LiteralPath $contextRoot)) {
  throw "Pasta de contexto nao encontrada em: $contextRoot"
}

if (-not (Test-Path -LiteralPath $audioMastersRoot)) {
  throw "Pasta de audios-mestres nao encontrada em: $audioMastersRoot"
}

New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null

$projectArchive = Join-Path $OutputDirectory 'RuaDeAco-Projeto-Atual.zip'
$productionArchive = Join-Path $OutputDirectory 'RuaDeAco-Material-Producao-Atual.zip'
$repositoryBundle = Join-Path $OutputDirectory 'RuaDeAco-Historico-Git-Atual.bundle'
$contextArchive = Join-Path $OutputDirectory 'RuaDeAco-Contexto-Atual.zip'
$audioArchive = Join-Path $OutputDirectory 'RuaDeAco-AudioMasters-Atual.zip'
$manifestPath = Join-Path $OutputDirectory 'MANIFESTO-RUA-DE-ACO-ATUAL.json'

foreach ($knownOutput in @(
  $projectArchive,
  $productionArchive,
  $repositoryBundle,
  $contextArchive,
  $audioArchive,
  $manifestPath
)) {
  if ((-not $ReuseExisting) -and (Test-Path -LiteralPath $knownOutput)) {
    Remove-Item -LiteralPath $knownOutput -Force
  }
}

$branch = (& git -C $projectRoot branch --show-current).Trim()
$head = (& git -C $projectRoot rev-parse HEAD).Trim()
$statusLines = @(& git -C $projectRoot status --porcelain=v1)

if ($ReuseExisting -and (Test-Path -LiteralPath $projectArchive)) {
  & tar.exe -tf $projectArchive | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "O snapshot existente do projeto nao passou na verificacao. Codigo: $LASTEXITCODE"
  }
}
else {
  Push-Location $projectRoot
  try {
    & tar.exe -a -cf $projectArchive `
      --exclude='./.git' `
      --exclude='./node_modules' `
      --exclude='./dist' `
      --exclude='./test-results' `
      --exclude='./playwright-report' `
      --exclude='./RuaDeAco_Contexto_GPTWork' `
      --exclude='./tmp' `
      .
    if ($LASTEXITCODE -ne 0) {
      throw "Falha ao criar o snapshot do projeto. Codigo: $LASTEXITCODE"
    }
  }
  finally {
    Pop-Location
  }
}

$productionRoot = Join-Path $projectRoot 'tmp'
if ($ReuseExisting -and (Test-Path -LiteralPath $productionArchive)) {
  & tar.exe -tf $productionArchive | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "O backup existente do material de producao nao passou na verificacao. Codigo: $LASTEXITCODE"
  }
}
elseif (Test-Path -LiteralPath $productionRoot) {
  Push-Location $productionRoot
  try {
    & tar.exe -a -cf $productionArchive .
    if ($LASTEXITCODE -ne 0) {
      throw "Falha ao criar o backup do material de producao. Codigo: $LASTEXITCODE"
    }
  }
  finally {
    Pop-Location
  }
}
else {
  throw "Pasta de material de producao nao encontrada em: $productionRoot"
}

if (-not ($ReuseExisting -and (Test-Path -LiteralPath $repositoryBundle))) {
  & git -C $projectRoot bundle create $repositoryBundle --all
  if ($LASTEXITCODE -ne 0) {
    throw "Falha ao criar o bundle Git. Codigo: $LASTEXITCODE"
  }
}

& git bundle verify $repositoryBundle | Out-Host
if ($LASTEXITCODE -ne 0) {
  throw "O bundle Git criado nao passou na verificacao. Codigo: $LASTEXITCODE"
}

if ($ReuseExisting -and (Test-Path -LiteralPath $contextArchive)) {
  & tar.exe -tf $contextArchive | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "O backup existente do contexto nao passou na verificacao. Codigo: $LASTEXITCODE"
  }
}
else {
  Push-Location $contextRoot
  try {
    & tar.exe -a -cf $contextArchive .
    if ($LASTEXITCODE -ne 0) {
      throw "Falha ao criar o backup do contexto. Codigo: $LASTEXITCODE"
    }
  }
  finally {
    Pop-Location
  }
}

if ($ReuseExisting -and (Test-Path -LiteralPath $audioArchive)) {
  & tar.exe -tf $audioArchive | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "O backup existente dos audios-mestres nao passou na verificacao. Codigo: $LASTEXITCODE"
  }
}
else {
  Push-Location $audioMastersRoot
  try {
    & tar.exe -a -cf $audioArchive .
    if ($LASTEXITCODE -ne 0) {
      throw "Falha ao criar o backup dos audios-mestres. Codigo: $LASTEXITCODE"
    }
  }
  finally {
    Pop-Location
  }
}

$archives = @(
  Get-ArchiveInfo -Path $projectArchive
  Get-ArchiveInfo -Path $productionArchive
  Get-ArchiveInfo -Path $repositoryBundle
  Get-ArchiveInfo -Path $contextArchive
  Get-ArchiveInfo -Path $audioArchive
)

$uploadFiles = @(
  foreach ($archivePath in @(
    $projectArchive,
    $productionArchive,
    $repositoryBundle,
    $contextArchive,
    $audioArchive
  )) {
    New-UploadParts -Path $archivePath
  }
)

$manifest = [ordered]@{
  schemaVersion = 1
  generatedAt = (Get-Date).ToString('o')
  projectRoot = $projectRoot
  contextRoot = $contextRoot
  audioMastersRoot = $audioMastersRoot
  git = [ordered]@{
    branch = $branch
    head = $head
    worktreeClean = ($statusLines.Count -eq 0)
    status = $statusLines
  }
  exclusions = @(
    '.git (preservado separadamente no bundle Git)'
    'node_modules'
    'dist'
    'test-results'
    'playwright-report'
    'tmp (preservado separadamente como material de producao)'
    'RuaDeAco_Contexto_GPTWork (preservado separadamente)'
  )
  files = $archives
  uploadFiles = $uploadFiles
}

$manifest | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $manifestPath -Encoding UTF8

Write-Host ''
Write-Host 'Backup local preparado com sucesso:' -ForegroundColor Green
$archives | ForEach-Object {
  [pscustomobject]@{
    Arquivo = $_.name
    MB = [math]::Round($_.bytes / 1MB, 2)
    SHA256 = $_.sha256
  }
} | Format-Table -AutoSize

Write-Host "Manifesto: $manifestPath"
Write-Host "Pasta de saida: $OutputDirectory"
Write-Host ''
Write-Host 'Arquivos para envio ao Google Drive:' -ForegroundColor Cyan
$uploadFiles | ForEach-Object {
  [pscustomobject]@{
    Arquivo = $_.name
    Origem = $_.source
    Parte = "$($_.part)/$($_.totalParts)"
    MB = [math]::Round($_.bytes / 1MB, 2)
  }
} | Format-Table -AutoSize
