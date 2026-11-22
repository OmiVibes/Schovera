param([string]$PiHost = '10.42.0.1')

$ErrorActionPreference = 'Stop'
$guardianPath = (Resolve-Path (Join-Path $PSScriptRoot 'pi-tunnel-guardian.ps1')).Path
$root = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$stateDir = Join-Path $root '.local/competition'
$stopPath = Join-Path $stateDir 'stop-pi-tunnel.signal'
$guardians = @(Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe'" -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like "*$guardianPath*" -and $_.CommandLine -like "*${PiHost}*" })
if ($guardians.Count -ne 1) { throw "Expected one Schovera tunnel guardian for $PiHost; found $($guardians.Count). No process was stopped." }
if (Test-Path -LiteralPath $stopPath) { throw 'Stop signal already exists; inspect the guardian state before retrying.' }
if (-not (Test-Path -LiteralPath $stateDir -PathType Container)) { [IO.Directory]::CreateDirectory($stateDir) | Out-Null }
[IO.File]::WriteAllText($stopPath, 'STOP_SCHOVERA_PI_TUNNEL', [Text.UTF8Encoding]::new($false))
$deadline = (Get-Date).AddSeconds(12)
do {
  Start-Sleep -Milliseconds 250
  $alive = Get-CimInstance Win32_Process -Filter "ProcessId = $($guardians[0].ProcessId)" -ErrorAction SilentlyContinue
} while ($alive -and (Get-Date) -lt $deadline)
if ($alive) { throw 'Guardian did not stop cleanly; stop signal retained for review.' }
if ((Get-Content -LiteralPath $stopPath -Raw) -ne 'STOP_SCHOVERA_PI_TUNNEL') { throw 'Stop signal changed; preserving it for review.' }
Remove-Item -LiteralPath $stopPath
Write-Host 'Schovera tunnel guardian stopped; no service or network setting was changed.'
