[CmdletBinding()]
param(
  [Parameter(Mandatory)][string]$BackupDirectory,
  [string]$DestinationRoot = 'C:\Projetos\RuaDeAco-Restaurado'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$manifestPath = Join-Path $BackupDirectory 'MANIFESTO-RUA-DE-ACO-ATUAL.json'
if (-not (Test-Path -LiteralPath $manifestPath)) {
  throw "Manifesto nao encontrado: $manifestPath"
}

if (Test-Path -LiteralPath $DestinationRoot) {
  $existing = @(Get-ChildItem -LiteralPath $DestinationRoot -Force -ErrorAction SilentlyContinue)
  if ($existing.Count -gt 0) {
    throw "O destino ja existe e nao esta vazio: $DestinationRoot"
  }
}

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  throw 'Git nao encontrado.'
}

if (-not (Get-Command tar.exe -ErrorAction SilentlyContinue)) {
  throw 'tar.exe nao encontrado.'
}

$manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
$assemblyRoot = Join-Path $env:TEMP 'RuaDeAco-GoogleDriveRestore'
New-Item -ItemType Directory -Path $assemblyRoot -Force | Out-Null

function Assert-Hash {
  param(
    [Parameter(Mandatory)][string]$Path,
    [Parameter(Mandatory)][string]$Expected
  )

  $actual = (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($actual -ne $Expected.ToLowerInvariant()) {
    throw "Hash invalido em $Path. Esperado: $Expected; encontrado: $actual"
  }
}

foreach ($uploadFile in $manifest.uploadFiles) {
  $partPath = Join-Path $BackupDirectory $uploadFile.name
  if (-not (Test-Path -LiteralPath $partPath)) {
    throw "Parte ausente: $partPath"
  }
  Assert-Hash -Path $partPath -Expected $uploadFile.sha256
}

foreach ($archive in $manifest.files) {
  $assembledPath = Join-Path $assemblyRoot $archive.name
  if (Test-Path -LiteralPath $assembledPath) {
    Remove-Item -LiteralPath $assembledPath -Force
  }

  $parts = @($manifest.uploadFiles | Where-Object { $_.source -eq $archive.name } | Sort-Object part)
  if ($parts.Count -eq 1 -and $parts[0].name -eq $archive.name) {
    Copy-Item -LiteralPath (Join-Path $BackupDirectory $parts[0].name) -Destination $assembledPath
  }
  else {
    $destination = [System.IO.File]::Create($assembledPath)
    try {
      foreach ($part in $parts) {
        $source = [System.IO.File]::OpenRead((Join-Path $BackupDirectory $part.name))
        try {
          $source.CopyTo($destination)
        }
        finally {
          $source.Dispose()
        }
      }
    }
    finally {
      $destination.Dispose()
    }
  }

  Assert-Hash -Path $assembledPath -Expected $archive.sha256
}

$bundle = Join-Path $assemblyRoot 'RuaDeAco-Historico-Git-Atual.bundle'
& git bundle verify $bundle | Out-Host
if ($LASTEXITCODE -ne 0) {
  throw 'O historico Git nao passou na verificacao.'
}

New-Item -ItemType Directory -Path (Split-Path -Parent $DestinationRoot) -Force | Out-Null
& git clone $bundle $DestinationRoot
if ($LASTEXITCODE -ne 0) {
  throw 'Nao foi possivel restaurar o repositorio a partir do bundle Git.'
}

& tar.exe -xf (Join-Path $assemblyRoot 'RuaDeAco-Projeto-Atual.zip') -C $DestinationRoot
if ($LASTEXITCODE -ne 0) { throw 'Falha ao extrair o snapshot do projeto.' }

$productionRoot = Join-Path $DestinationRoot 'tmp'
New-Item -ItemType Directory -Path $productionRoot -Force | Out-Null
& tar.exe -xf (Join-Path $assemblyRoot 'RuaDeAco-Material-Producao-Atual.zip') -C $productionRoot
if ($LASTEXITCODE -ne 0) { throw 'Falha ao extrair o material de producao.' }

$contextRoot = Join-Path $DestinationRoot 'RuaDeAco_Contexto_GPTWork'
New-Item -ItemType Directory -Path $contextRoot -Force | Out-Null
& tar.exe -xf (Join-Path $assemblyRoot 'RuaDeAco-Contexto-Atual.zip') -C $contextRoot
if ($LASTEXITCODE -ne 0) { throw 'Falha ao extrair o contexto.' }

$audioRoot = Join-Path (Split-Path -Parent $DestinationRoot) 'RuaDeAco_AudioMasters'
New-Item -ItemType Directory -Path $audioRoot -Force | Out-Null
& tar.exe -xf (Join-Path $assemblyRoot 'RuaDeAco-AudioMasters-Atual.zip') -C $audioRoot
if ($LASTEXITCODE -ne 0) { throw 'Falha ao extrair os audios-mestres.' }

Write-Host ''
Write-Host 'Restauracao concluida e hashes validados.' -ForegroundColor Green
Write-Host "Projeto: $DestinationRoot"
Write-Host "Contexto: $contextRoot"
Write-Host "Audios-mestres: $audioRoot"
