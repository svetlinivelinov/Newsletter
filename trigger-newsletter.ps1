<#
.SYNOPSIS
  Manually trigger the newsletter send without waiting for the 07:00 UTC cron job.

.DESCRIPTION
  Reads CRON_SECRET and SITE_URL from .env automatically.
  Defaults to production (SITE_URL) if set; pass -Env local to hit the dev server instead.

.PARAMETER Target
  'prod' (default when SITE_URL is in .env) or 'local' (requires dev.ps1 running)

.EXAMPLE
  # Trigger production — just run it
  .\trigger-newsletter.ps1

.EXAMPLE
  # Trigger local dev server
  .\trigger-newsletter.ps1 -Target local
#>

param(
  [ValidateSet('local', 'prod')]
  [string]$Target = ''
)

# ── Load .env ────────────────────────────────────────────────────────────────
$envFile = Join-Path $PSScriptRoot '.env'
if (-not (Test-Path $envFile)) {
  Write-Error ".env file not found at $envFile"
  exit 1
}

$cronSecret = $null
$siteUrl    = $null
foreach ($line in Get-Content $envFile) {
  if ($line -match '^CRON_SECRET\s*=\s*(.+)$') { $cronSecret = $Matches[1].Trim() }
  if ($line -match '^SITE_URL\s*=\s*(.+)$')    { $siteUrl    = $Matches[1].Trim() }
}

if (-not $cronSecret) {
  Write-Error "CRON_SECRET not found in .env"
  exit 1
}

# ── Resolve target ───────────────────────────────────────────────────────────
# Default: prod if SITE_URL is set, otherwise local
if (-not $Target) {
  $Target = if ($siteUrl) { 'prod' } else { 'local' }
}

if ($Target -eq 'prod') {
  if (-not $siteUrl) {
    Write-Error "Add SITE_URL=https://your-site.netlify.app to your .env file"
    exit 1
  }
  $baseUrl = $siteUrl.TrimEnd('/')
} else {
  $baseUrl = 'http://localhost:8888'
}

$url = "$baseUrl/.netlify/functions/send-newsletters-background"

# ── Fire ─────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "  Triggering newsletter send..." -ForegroundColor Cyan
Write-Host "  Target : $url" -ForegroundColor Gray
Write-Host ""

try {
  $response = Invoke-WebRequest `
    -Uri $url `
    -Method POST `
    -Headers @{ 'x-cron-secret' = $cronSecret } `
    -ContentType 'application/json' `
    -Body '{}' `
    -TimeoutSec 300   # function can take a few minutes

  Write-Host "  Status : $($response.StatusCode)" -ForegroundColor Green
  Write-Host "  Body   :" -ForegroundColor Gray
  $response.Content | ConvertFrom-Json | ConvertTo-Json -Depth 5
} catch {
  $resp   = $_.Exception.Response
  $status = if ($resp) { [int]$resp.StatusCode } else { 'N/A' }
  Write-Host "  Status : $status" -ForegroundColor Red
  Write-Host "  Error  : $($_.Exception.Message)" -ForegroundColor Red
  if ($_.ErrorDetails.Message) {
    try { $_.ErrorDetails.Message | ConvertFrom-Json | ConvertTo-Json -Depth 5 } catch {}
  }
  exit 1
}
