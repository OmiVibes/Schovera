param(
  [switch]$RequirePiTunnel,
  [string]$PiHost = '10.42.0.1'
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$origin = 'http://127.0.0.1:3104'
Set-Location -LiteralPath $root

function Stop-Startup([string]$Message) {
  throw "NOT READY: $Message"
}

if ($env:OS -ne 'Windows_NT' -or [Environment]::Is64BitOperatingSystem -ne $true) {
  Stop-Startup 'This guarded competition launcher requires 64-bit Windows.'
}

$nodeVersion = (& node --version 2>$null | Select-Object -First 1)
$nodeExitCode = $LASTEXITCODE
$nodeMatch = [regex]::Match([string]$nodeVersion, '^v22\.(\d+)\.\d+$')
if ($nodeExitCode -ne 0 -or -not $nodeMatch.Success -or [int]$nodeMatch.Groups[1].Value -lt 18) {
  Stop-Startup 'Use the rehearsed Node.js 22.18 or later 22.x runtime.'
}
$dockerVersion = & docker info --format '{{.ServerVersion}}' 2>$null
if ($LASTEXITCODE -ne 0 -or -not $dockerVersion) {
  Stop-Startup 'Docker Desktop is not ready. Start Docker Desktop, then run this shortcut again.'
}

$database = & docker inspect supabase_db_Schovera --format '{{json .}}' 2>$null
if ($LASTEXITCODE -ne 0 -or -not $database) {
  Stop-Startup 'The existing local Supabase database is not running. No reset or migration was attempted.'
}
$databaseInfo = $database | ConvertFrom-Json
$bindings = @($databaseInfo.NetworkSettings.Ports.'5432/tcp')
if (-not $databaseInfo.State.Running -or $bindings.Count -ne 1 -or
    $bindings[0].HostIp -ne '127.0.0.1' -or $bindings[0].HostPort -ne '54322') {
  Stop-Startup 'Local PostgreSQL is not healthy on the expected loopback-only port 54322.'
}

try {
  $auth = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:54321/auth/v1/health' -TimeoutSec 4
  $authStatus = $auth.StatusCode
} catch {
  $authStatus = 0
}
if ($authStatus -ne 200) { Stop-Startup 'Local Supabase Auth is unavailable or unhealthy on loopback port 54321.' }

$piTunnel = $false
$tunnelKey = Join-Path $env:USERPROFILE '.ssh/schovera-pi-tunnel-ed25519'
$guardianPath = Join-Path $PSScriptRoot 'pi-tunnel-guardian.ps1'
if ($RequirePiTunnel) {
  if ($PiHost -notmatch '^[A-Za-z0-9.-]{1,253}$' -or $PiHost.Contains('..')) {
    Stop-Startup 'Invalid Pi host.'
  }
  $ssh = Get-Command ssh.exe -ErrorAction SilentlyContinue
  if (-not $ssh) { Stop-Startup 'OpenSSH client is unavailable.' }
  $apiProbe = $null; $apiExitCode = 1
  try {
    $apiProbe = & curl.exe --silent --show-error --max-time 3 --output NUL --write-out '%{http_code}' --header 'Content-Type: application/json' --data '{}' 'http://127.0.0.1:3104/api/device/v2/events' 2>$null
    $apiExitCode = $LASTEXITCODE
  } catch { $apiExitCode = 1 }
  if ($apiExitCode -ne 0 -or ($apiProbe | Out-String).Trim() -ne '400') {
    Stop-Startup 'The reviewed Schovera RFID API did not return the expected safe invalid-envelope response on loopback port 3104.'
  }
  if (-not (Test-Path -LiteralPath $tunnelKey -PathType Leaf)) { Stop-Startup 'The dedicated Schovera Pi tunnel key is not installed on this Windows account.' }
}

# The existing competition CLI owns the isolated QA server and fictional fixture.
# It verifies source identity and role sign-ins, and refuses unowned listeners or data.
try {
  $startOutput = & node (Join-Path $root 'scripts/competition/cli.mjs') start 2>&1
  $startExitCode = $LASTEXITCODE
} catch {
  $startOutput = @()
  $startExitCode = 1
}
if ($startExitCode -ne 0) {
  Stop-Startup 'The guarded workflow refused startup (source mismatch, unowned fixture, or another precondition). Review the sanitized result from: npm run competition -- start'
}
$jsonLine = $startOutput | Where-Object { $_ -is [string] -and $_.TrimStart().StartsWith('{') } | Select-Object -Last 1
try { $readiness = $jsonLine | ConvertFrom-Json } catch { Stop-Startup 'The competition workflow returned no valid readiness result.' }
if (-not $readiness.ready -or $readiness.url -ne $origin -or
    -not $readiness.roleLoginsVerified.teacher -or
    -not $readiness.roleLoginsVerified.parent -or
    -not $readiness.roleLoginsVerified.principal) {
  Stop-Startup 'The local fictional role accounts or website did not pass readiness.'
}
try {
  $site = Invoke-WebRequest -UseBasicParsing -Uri $origin -TimeoutSec 5
  if ($site.StatusCode -ne 200) { Stop-Startup 'Schovera website health check failed.' }
} catch {
  Stop-Startup 'Schovera website is not ready on loopback port 3104.'
}

if ($RequirePiTunnel) {
  # Start the guardian even when the route is currently down. Its child uses
  # BatchMode and strict host checking, then retries without touching the Pi
  # network configuration. Local Schovera remains available as a simulation.
  $existingGuardian = @(Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe'" -ErrorAction SilentlyContinue | Where-Object {
    $_.CommandLine -match '(?i)(^|\s)-File(\s|$)' -and
    $_.CommandLine -like "*$guardianPath*" -and $_.CommandLine -like "*$PiHost*"
  })
  if ($existingGuardian.Count -eq 0) {
    $guardianArgs = '-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "' + $guardianPath + '" -PiHost "' + $PiHost + '"'
    Start-Process -FilePath (Join-Path $PSHOME 'powershell.exe') -ArgumentList $guardianArgs -WindowStyle Hidden | Out-Null
  }
  $tunnelDeadline = (Get-Date).AddSeconds(12)
  while ((Get-Date) -lt $tunnelDeadline -and -not $piTunnel) {
    try {
      $tunnelResult = & $ssh.Source -i $tunnelKey -o IdentitiesOnly=yes -o BatchMode=yes -o ConnectTimeout=4 -o StrictHostKeyChecking=yes -T "schovera@$PiHost" 'SCHOOVERA_TUNNEL_PROBE' 2>$null
      $piTunnel = ($LASTEXITCODE -eq 0 -and ($tunnelResult | Out-String).Trim() -eq 'TUNNEL_OK')
    } catch { $piTunnel = $false }
    if (-not $piTunnel) { Start-Sleep -Seconds 2 }
  }
}

Start-Process $origin
if ($piTunnel) { Write-Host 'SCHOOVERA READY' -ForegroundColor Green }
else { Write-Host 'SCHOOVERA LOCAL READY — Raspberry Pi tunnel pending' -ForegroundColor Yellow }
Write-Host "Website: $origin"
Write-Host 'Local PostgreSQL: ready (127.0.0.1 only)'
Write-Host 'Local Auth: ready; fictional Teacher, Parent, and Principal sign-ins verified'
if ($piTunnel) {
  Write-Host 'Raspberry Pi reverse tunnel: verified to reviewed Schovera on Windows loopback port 3104; strict SSH host checking passed'
} elseif ($RequirePiTunnel) {
  Write-Host 'Raspberry Pi tunnel: guardian is running and retrying; RFID delivery is not ready. Use the clearly labeled local simulation.' -ForegroundColor Yellow
} else {
  Write-Host 'Raspberry Pi tunnel: not checked; use only the labeled local simulation until verified'
}
Write-Host 'RFID: this launcher does not scan hardware; simulation remains explicitly simulated.'
