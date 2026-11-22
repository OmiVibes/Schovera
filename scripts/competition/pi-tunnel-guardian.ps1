param(
  [string]$PiHost = '10.42.0.1',
  [string]$KeyPath = (Join-Path $env:USERPROFILE '.ssh/schovera-pi-tunnel-ed25519')
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$stateDir = Join-Path $root '.local/competition'
$stopPath = Join-Path $stateDir 'stop-pi-tunnel.signal'
$logPath = Join-Path $stateDir 'pi-tunnel-guardian.log'
$ssh = Get-Command ssh.exe -ErrorAction Stop

if (-not (Test-Path -LiteralPath $stateDir -PathType Container)) {
  [IO.Directory]::CreateDirectory($stateDir) | Out-Null
}

if ($PiHost -notmatch '^[A-Za-z0-9.-]{1,253}$' -or $PiHost.Contains('..')) { throw 'Invalid Pi host.' }
if (-not (Test-Path -LiteralPath $KeyPath -PathType Leaf)) { throw 'Dedicated tunnel key is missing.' }
if ((Get-Item -LiteralPath $KeyPath -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Linked tunnel key refused.' }
if (Test-Path -LiteralPath $stopPath) { throw 'A stop signal already exists; review it before starting.' }

function Write-TunnelState([string]$Message) {
  $line = "$(Get-Date -Format 'yyyy-MM-ddTHH:mm:ssK') $Message`r`n"
  [IO.File]::AppendAllText($logPath, $line, [Text.UTF8Encoding]::new($false))
}

function Test-TunnelHealth {
  try {
    $result = & $ssh.Source -i $KeyPath -o IdentitiesOnly=yes -o BatchMode=yes -o ConnectTimeout=5 -o StrictHostKeyChecking=yes -T "schovera@$PiHost" 'SCHOOVERA_TUNNEL_PROBE' 2>$null
    return ($LASTEXITCODE -eq 0 -and ($result | Out-String).Trim() -eq 'TUNNEL_OK')
  } catch { return $false }
}

function Get-ForwardProcesses {
  # Match only an SSH command that binds the exact Pi listener. Do not infer
  # ownership from the local port alone: 33106 can appear in unrelated text.
  # Do not start another forward if process enumeration itself is unavailable.
  $all = @(Get-CimInstance Win32_Process -Filter "Name = 'ssh.exe'" -ErrorAction Stop)
  return @($all | Where-Object {
    $_.CommandLine -match '(?i)(?:^|\s)-R\s+127\.0\.0\.1:33106:'
  })
}

function Test-ReviewedForwardProcess($Process) {
  $command = [string]$Process.CommandLine
  $expectedKey = [regex]::Escape([IO.Path]::GetFullPath($KeyPath))
  $keyPattern = '(?i)(?:^|\s)-i\s+' + $expectedKey + '(?:\s|$)'
  $hostPattern = '(?i)schovera@' + [regex]::Escape($PiHost) + '(?:\s|$)'
  return (
    $command -match '(?i)(?:^|\s)-R\s+127\.0\.0\.1:33106:127\.0\.0\.1:3104(?:\s|$)' -and
    $command -match $keyPattern -and
    $command -match '(?i)StrictHostKeyChecking=yes' -and
    $command -match $hostPattern
  )
}

# The mutex closes the race between two launchers both observing zero
# guardians. It is per interactive Windows session and needs no persistent
# service or lock file.
$guardianMutex = [Threading.Mutex]::new($false, 'Local\SchoveraPiTunnelGuardian')
$ownsGuardianMutex = $false
try {
  try { $ownsGuardianMutex = $guardianMutex.WaitOne(0) }
  catch [Threading.AbandonedMutexException] { $ownsGuardianMutex = $true }
  if (-not $ownsGuardianMutex) {
    Write-TunnelState 'duplicate_guardian_refused_existing_instance_owns_lifecycle'
    return
  }

$child = $null
$wasReady = $false
Write-TunnelState 'guardian_started'
try {
  while (-not (Test-Path -LiteralPath $stopPath)) {
    # Reuse a healthy exact reviewed route. If an unrelated SSH process owns
    # this remote listener, wait without killing it or creating a competing
    # -R request. An orphaned but exact child is adopted and monitored.
    $forwards = @(Get-ForwardProcesses)
    if ($forwards.Count -gt 0) {
      $reviewed = @($forwards | Where-Object { Test-ReviewedForwardProcess $_ })
      if ($reviewed.Count -eq 1 -and $forwards.Count -eq 1) {
        $child = Get-Process -Id $reviewed[0].ProcessId -ErrorAction SilentlyContinue
        if (-not $child) { Start-Sleep -Seconds 1; continue }
        Write-TunnelState 'reviewed_existing_forward_adopted'
      } else {
        Write-TunnelState 'conflicting_forward_preserved_waiting_no_duplicate_requested'
        Start-Sleep -Seconds 3
        continue
      }
    } else {
    if ($wasReady) { Write-TunnelState 'reviewed_tunnel_lost_reconnecting' }
    else { Write-TunnelState 'reviewed_tunnel_connecting' }
    $wasReady = $false
    $args = @(
      '-N', '-T', '-i', $KeyPath,
      '-o', 'IdentitiesOnly=yes', '-o', 'BatchMode=yes',
      '-o', 'StrictHostKeyChecking=yes', '-o', 'ExitOnForwardFailure=yes',
      '-o', 'ConnectTimeout=8', '-o', 'ServerAliveInterval=15', '-o', 'ServerAliveCountMax=2',
      '-R', '127.0.0.1:33106:127.0.0.1:3104', "schovera@$PiHost"
    )
    $child = Start-Process -FilePath $ssh.Source -ArgumentList $args -WindowStyle Hidden -PassThru
    }

    while (-not $child.HasExited -and -not (Test-Path -LiteralPath $stopPath)) {
      if (Test-TunnelHealth) {
        if (-not $wasReady) { Write-TunnelState 'reviewed_tunnel_ready' }
        $wasReady = $true
      } elseif ($wasReady) {
        $wasReady = $false
        Write-TunnelState 'reviewed_tunnel_probe_lost'
      }
      Start-Sleep -Seconds 2
      $child.Refresh()
    }

    if (Test-Path -LiteralPath $stopPath) {
      if (-not $child.HasExited) { Stop-Process -Id $child.Id -Force -ErrorAction SilentlyContinue }
      Write-TunnelState 'guardian_stop_requested'
      break
    }
    $child.Refresh()
    if ($child.HasExited) {
      Write-TunnelState 'reviewed_tunnel_process_exited_retrying'
      Start-Sleep -Seconds 3
    }
  }
} finally {
  if ($child -and -not $child.HasExited) { Stop-Process -Id $child.Id -Force -ErrorAction SilentlyContinue }
  Write-TunnelState 'guardian_stopped'
}
} finally {
  if ($ownsGuardianMutex) { $guardianMutex.ReleaseMutex() }
  $guardianMutex.Dispose()
}
