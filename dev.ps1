param([switch]$Stop)

$Port3999 = 3999
$Port8888 = 8888
$Dir      = $PSScriptRoot

if ($Stop) {
    Write-Host "Stopping dev server..." -ForegroundColor Yellow
    Get-NetTCPConnection -LocalPort $Port3999,$Port8888 -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess | Sort-Object -Unique |
        ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
    Write-Host "Dev server stopped." -ForegroundColor Red
    exit
}

# Stop any leftover server first
Get-NetTCPConnection -LocalPort $Port3999,$Port8888 -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess | Sort-Object -Unique |
    ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }

Start-Sleep -Milliseconds 500

Write-Host ""
Write-Host "  Starting Newsletter Dev Server..." -ForegroundColor Cyan
Write-Host "  URL: http://localhost:8888" -ForegroundColor Green
Write-Host "  Press Ctrl+C to stop." -ForegroundColor Gray
Write-Host ""

netlify dev --dir "$Dir" --functions "$Dir\netlify\functions"
