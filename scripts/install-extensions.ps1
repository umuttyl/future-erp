<#
.SYNOPSIS
    Future ERP - Cursor / VSCode eklenti toplu kurulum scripti.

.DESCRIPTION
    .vscode/extensions.json icindeki 'recommendations' listesini okur ve
    Cursor (oncelikli) veya VSCode CLI ile sirayla kurulum yapar.

    NOTLAR:
    - 'cursor' veya 'code' komutu PATH'te olmali. Cursor'da: Cmd Palette
      (Ctrl+Shift+P) -> "Shell Command: Install 'cursor' command in PATH".
    - Eklentiler kullanici profiline kurulur (proje bazli degildir);
      yine de extensions.json sayesinde Cursor proje acilirken oneri
      bildirimi gosterir.

.EXAMPLE
    pwsh ./scripts/install-extensions.ps1
#>

[CmdletBinding()]
param(
    [string]$ExtensionsFile = "$PSScriptRoot/../.vscode/extensions.json"
)

$ErrorActionPreference = 'Stop'

function Get-Cli {
    foreach ($candidate in @('cursor', 'code')) {
        if (Get-Command $candidate -ErrorAction SilentlyContinue) {
            return $candidate
        }
    }
    return $null
}

$cli = Get-Cli
if (-not $cli) {
    Write-Host ""
    Write-Host "HATA: 'cursor' veya 'code' komutu PATH'te bulunamadi." -ForegroundColor Red
    Write-Host ""
    Write-Host "Cozum (Cursor):" -ForegroundColor Yellow
    Write-Host "  1. Cursor'i ac"
    Write-Host "  2. Ctrl+Shift+P -> 'Shell Command: Install cursor command in PATH'"
    Write-Host "  3. Yeni terminal acip bu scripti tekrar calistir"
    Write-Host ""
    exit 1
}

if (-not (Test-Path $ExtensionsFile)) {
    Write-Host "HATA: extensions.json bulunamadi: $ExtensionsFile" -ForegroundColor Red
    exit 1
}

Write-Host "CLI bulundu: $cli" -ForegroundColor Green
Write-Host "Kaynak: $ExtensionsFile"
Write-Host ""

$json = Get-Content $ExtensionsFile -Raw | ConvertFrom-Json
$extensions = $json.recommendations

if (-not $extensions -or $extensions.Count -eq 0) {
    Write-Host "Listede eklenti yok." -ForegroundColor Yellow
    exit 0
}

$total = $extensions.Count
$success = 0
$failed = @()
$index = 0

foreach ($ext in $extensions) {
    $index++
    Write-Host "[$index/$total] $ext " -NoNewline
    try {
        $output = & $cli --install-extension $ext --force 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Host "OK" -ForegroundColor Green
            $success++
        } else {
            Write-Host "BASARISIZ" -ForegroundColor Red
            $failed += $ext
        }
    } catch {
        Write-Host "BASARISIZ ($_)" -ForegroundColor Red
        $failed += $ext
    }
}

Write-Host ""
Write-Host "==================================="
Write-Host "Toplam:    $total"
Write-Host "Basarili:  $success" -ForegroundColor Green
Write-Host "Basarisiz: $($failed.Count)" -ForegroundColor $(if ($failed.Count -gt 0) {'Red'} else {'Green'})
if ($failed.Count -gt 0) {
    Write-Host ""
    Write-Host "Basarisiz olanlar (manuel deneyebilirsin):" -ForegroundColor Yellow
    $failed | ForEach-Object { Write-Host "  - $_" }
}
Write-Host "==================================="
