# OctoRent - Full local startup with Cloudflare Tunnel
# Run: powershell.exe -ExecutionPolicy Bypass -File ".\start_local.ps1"

$OutputEncoding = [System.Text.Encoding]::UTF8
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "  OctoRent - LOCAL START" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan

# --- Kill old processes ---
Write-Host ""
Write-Host "[0/6] Killing old python & cloudflared processes..." -ForegroundColor Yellow
Get-Process -Name "python" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Get-Process -Name "cloudflared" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1
Write-Host "  Done." -ForegroundColor Green

# --- Step 1: Start backend ---
Write-Host ""
Write-Host "[1/6] Starting live_server.py on port 8001..." -ForegroundColor Yellow
$serverJob = Start-Process -FilePath "python" -ArgumentList "live_server.py" `
    -PassThru -NoNewWindow -WorkingDirectory $ScriptDir
Write-Host "  PID: $($serverJob.Id)" -ForegroundColor Green
Start-Sleep -Seconds 2

# --- Step 2: Start Cloudflare Tunnel ---
Write-Host ""
Write-Host "[2/6] Starting Cloudflare Tunnel..." -ForegroundColor Yellow
Remove-Item "$ScriptDir\cf_tunnel.log", "$ScriptDir\cf_tunnel_err.log" -ErrorAction SilentlyContinue
$cfJob = Start-Process -FilePath "cloudflared" `
    -ArgumentList "tunnel --url http://localhost:8001" `
    -PassThru -NoNewWindow -WorkingDirectory $ScriptDir `
    -RedirectStandardOutput "$ScriptDir\cf_tunnel.log" `
    -RedirectStandardError "$ScriptDir\cf_tunnel_err.log"
Write-Host "  PID: $($cfJob.Id)" -ForegroundColor Green
# Extract tunnel URL (wait up to 15 seconds)
$tunnelUrl = $null
$maxRetries = 15
for ($i = 1; $i -le $maxRetries; $i++) {
    Start-Sleep -Seconds 1
    if (Test-Path "$ScriptDir\cf_tunnel_err.log") {
        $cfLog = Get-Content "$ScriptDir\cf_tunnel_err.log" -ErrorAction SilentlyContinue
        if ($cfLog) {
            $line = $cfLog | Select-String "trycloudflare.com" | Select-Object -Last 1
            if ($line) {
                if ($line -match "(https://[a-zA-Z0-9.-]+\.trycloudflare\.com)") {
                    $tunnelUrl = $matches[1]
                    break
                }
            }
        }
    }
}

if ($tunnelUrl) {
    Write-Host ""
    Write-Host "  === TUNNEL URL ===" -ForegroundColor Green
    Write-Host "  $tunnelUrl" -ForegroundColor Cyan
    Write-Host "  ==================" -ForegroundColor Green

    # Auto-update .env
    $envPath = Join-Path $ScriptDir ".env"
    if (Test-Path $envPath) {
        $envContent = Get-Content $envPath -Raw
        $newEnvContent = $envContent -replace "WEB_APP_URL=.*", "WEB_APP_URL=$tunnelUrl"
        [System.IO.File]::WriteAllText($envPath, $newEnvContent, [System.Text.UTF8Encoding]::new($false))
        Write-Host "  .env updated!" -ForegroundColor Green
    }
}
else {
    Write-Host "  WARNING: URL not found - check cf_tunnel_err.log" -ForegroundColor Red
}

# --- Step 3: Start background worker ---
Write-Host ""
Write-Host "[3/6] Starting background_worker.py..." -ForegroundColor Yellow
$bgJob = Start-Process -FilePath "python" -ArgumentList "background_worker.py" `
    -PassThru -NoNewWindow -WorkingDirectory $ScriptDir
Write-Host "  PID: $($bgJob.Id)" -ForegroundColor Green

# --- Step 4: Start auto buyer ---
Write-Host ""
Write-Host "[4/6] Starting auto_buyer.py..." -ForegroundColor Yellow
$buyerJob = Start-Process -FilePath "python" -ArgumentList "auto_buyer.py" `
    -PassThru -NoNewWindow -WorkingDirectory $ScriptDir
Write-Host "  PID: $($buyerJob.Id)" -ForegroundColor Green

# --- Step 5: Start parser ---
Write-Host ""
Write-Host "[5/6] Starting parser.py..." -ForegroundColor Yellow
$parserJob = Start-Process -FilePath "python" -ArgumentList "parser.py" `
    -PassThru -NoNewWindow -WorkingDirectory $ScriptDir
Write-Host "  PID: $($parserJob.Id)" -ForegroundColor Green

# --- Step 6: Start bot ---
Write-Host ""
Write-Host "[6/6] Starting bot.py..." -ForegroundColor Yellow
$botJob = Start-Process -FilePath "python" -ArgumentList "bot.py" `
    -PassThru -NoNewWindow -WorkingDirectory $ScriptDir
Write-Host "  PID: $($botJob.Id)" -ForegroundColor Green

Write-Host ""
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "  All started!" -ForegroundColor Green
Write-Host "    live_server:       $($serverJob.Id)" -ForegroundColor White
Write-Host "    cloudflared:       $($cfJob.Id)" -ForegroundColor White
Write-Host "    background_worker: $($bgJob.Id)" -ForegroundColor White
Write-Host "    auto_buyer:        $($buyerJob.Id)" -ForegroundColor White
Write-Host "    parser:            $($parserJob.Id)" -ForegroundColor White
Write-Host "    bot:               $($botJob.Id)" -ForegroundColor White
if ($tunnelUrl) {
    Write-Host "    URL: $tunnelUrl" -ForegroundColor Cyan
}
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Press CTRL+C to stop all..." -ForegroundColor Gray

$allPids = @($serverJob.Id, $cfJob.Id, $bgJob.Id, $buyerJob.Id, $parserJob.Id, $botJob.Id)

try {
    Wait-Process -Id $serverJob.Id -ErrorAction SilentlyContinue
}
finally {
    Write-Host ""
    Write-Host "Stopping all processes..." -ForegroundColor Red
    foreach ($p in $allPids) {
        Stop-Process -Id $p -Force -ErrorAction SilentlyContinue
    }
    Write-Host "Done!" -ForegroundColor Green
}
