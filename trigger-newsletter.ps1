<#
.SYNOPSIS
  Manually trigger the newsletter send without waiting for the 05:30 UTC cron job.

.DESCRIPTION
  Runs the newsletter function directly via Node.js using your local .env.
  No server or Netlify connection needed.

.EXAMPLE
  .\trigger-newsletter.ps1
#>

$dir = $PSScriptRoot
Write-Host ""
Write-Host "  Running newsletter send..." -ForegroundColor Cyan
Write-Host ""
node "$dir\run-newsletter.mjs"
