param(
  [Parameter(Mandatory=$true)][string]$Port,
  [Parameter(Mandatory=$true)][string]$ConfirmPnpId,
  [Parameter(Mandatory=$true)][int]$Seconds,
  [Parameter(Mandatory=$true)][ValidateSet('on','off')][string]$Dtr,
  [switch]$ConfirmMonitorClosed,
  [switch]$AcknowledgeResetRisk
)
# Private IPC worker, never run directly or tee its byte records into ordinary logs.
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
[Console]::OutputEncoding=New-Object System.Text.UTF8Encoding($false)
$lifetime=[System.Diagnostics.Stopwatch]::StartNew()
$serial=$null
$reason='failure'
function Emit($value) { [Console]::Out.WriteLine(($value | ConvertTo-Json -Compress)); [Console]::Out.Flush() }
function Confirm-ReadOnlyIdentity([string]$ExpectedPort,[string]$ExpectedPnpId,[string[]]$AvailablePorts,[object[]]$Bindings) {
  # Pure comparison; also exercised with mock descriptors, without hardware APIs.
  $selected=@($Bindings | Where-Object {$_.port -ceq $ExpectedPort})
  if($AvailablePorts -cnotcontains $ExpectedPort -or $selected.Count -ne 1 -or $selected[0].pnpId -cne $ExpectedPnpId){throw 'identity_mismatch'}
}
function Assert-ExactIdentity {
  $availablePorts=@([System.IO.Ports.SerialPort]::GetPortNames())
  if ($availablePorts -cnotcontains $Port) { throw 'identity_mismatch' }
  $bindings=@(); $visited=0
  foreach($bus in @('USB','FTDIBUS')) {
    $base="Registry::HKEY_LOCAL_MACHINE\SYSTEM\CurrentControlSet\Enum\$bus"
    if(-not(Test-Path -LiteralPath $base)){continue}
    $models=@(Get-ChildItem -LiteralPath $base | Select-Object -First 257)
    if($models.Count -gt 256){throw 'preflight_refused'}
    foreach($model in $models) {
      foreach($device in Get-ChildItem -LiteralPath $model.PSPath | Select-Object -First 257) {
        $visited++; if($visited -gt 256){throw 'preflight_refused'}
        $settings=Get-ItemProperty -LiteralPath ($device.PSPath+'\Device Parameters') -ErrorAction SilentlyContinue
        if($settings.PortName -ceq $Port) {
          $id=$device.Name -replace '^HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Enum\\',''
          $bindings+=,@{port=$settings.PortName;pnpId=$id}
        }
      }
    }
  }
  Confirm-ReadOnlyIdentity -ExpectedPort $Port -ExpectedPnpId $ConfirmPnpId -AvailablePorts $availablePorts -Bindings $bindings
}
try {
  if($Port -cnotmatch '^COM[1-9][0-9]{0,4}$' -or $ConfirmPnpId.Length -gt 256 -or
    $ConfirmPnpId -cnotmatch '^(USB|FTDIBUS)\\[A-Za-z0-9_&+\\.-]+$' -or
    $Seconds -lt 1 -or $Seconds -gt 30 -or -not $ConfirmMonitorClosed -or -not $AcknowledgeResetRisk){throw 'preflight_refused'}
  Assert-ExactIdentity
  # Cannot identify every possible port owner. Operator confirmation and exclusive
  # SerialPort.Open remain required; never terminate another process to acquire it.
  $monitors=@(Get-Process -ErrorAction SilentlyContinue | Where-Object {$_.ProcessName -match '^(serial[-_]?monitor|serial[-_]?plotter)$'})
  if($monitors.Count){throw 'monitor_may_be_open'}
  Add-Type -TypeDefinition @'
using System;
using System.Threading.Tasks;
public static class SchoveraReadOnlyControl {
  public static Task<string> Next() { return Task.Run(() => Console.ReadLine()); }
}
'@
  $control=[SchoveraReadOnlyControl]::Next()
  # If the parent stopped during preflight, never open late.
  if($control.IsCompleted){$reason='stop_requested';return}
  if($lifetime.ElapsedMilliseconds -ge ($Seconds*1000-500)){$reason='deadline';return}
  $serial=New-Object System.IO.Ports.SerialPort($Port,115200,[System.IO.Ports.Parity]::None,8,[System.IO.Ports.StopBits]::One)
  $serial.Handshake=[System.IO.Ports.Handshake]::None
  # Explicit choice, not a guarantee of no reset. Both open and close can affect
  # line state through the USB driver/bridge. RTS is fixed off; no UNO assumptions.
  $serial.DtrEnable=($Dtr -ceq 'on')
  $serial.RtsEnable=$false
  $serial.ReadBufferSize=4096
  $serial.ReadTimeout=100
  try{$serial.Open()}catch{throw 'port_busy_denied_or_unavailable'}
  Assert-ExactIdentity
  Emit @{type='opened';port=$Port;baud=115200;dtr=$Dtr;rts='off';handshake='none'}
  $buffer=New-Object byte[] 256
  $identityCheckAt=$lifetime.ElapsedMilliseconds
  while($serial.IsOpen) {
    if($lifetime.ElapsedMilliseconds -ge ($Seconds*1000-500)){$reason='deadline';break}
    if($control.IsCompleted) {
      $line=$control.GetAwaiter().GetResult()
      if($null -eq $line){$reason='stdin_closed';break}
      if($line -cne 'CLOSE'){throw 'preflight_refused'}
      $reason='stop_requested';break
    }
    if([System.IO.Ports.SerialPort]::GetPortNames() -cnotcontains $Port){$reason='disconnect';throw 'serial_disconnected'}
    if($lifetime.ElapsedMilliseconds - $identityCheckAt -ge 500){Assert-ExactIdentity;$identityCheckAt=$lifetime.ElapsedMilliseconds}
    try {
      $available=$serial.BytesToRead
      if($available -gt 16384){throw 'serial_backpressure'}
      if($available -gt 0) {
        $count=$serial.Read($buffer,0,[Math]::Min(256,$available))
        if($count -gt 0){Emit @{type='bytes';data=[Convert]::ToBase64String($buffer,0,$count)}}
      }
    } catch [System.TimeoutException] { } catch {
      if($_.Exception.Message -eq 'serial_backpressure'){throw 'serial_backpressure'}
      throw 'serial_read_failed'
    }
    Start-Sleep -Milliseconds 10
  }
} catch {
  $allowed=@('identity_mismatch','monitor_may_be_open','port_busy_denied_or_unavailable','serial_disconnected','serial_read_failed','serial_backpressure','preflight_refused')
  $code=if($_.Exception.Message -in $allowed){$_.Exception.Message}else{'worker_failed'}
  try{Emit @{type='error';code=$code}}catch{}
} finally {
  $closed=$true
  if($null -ne $serial) {
    try{if($serial.IsOpen){$serial.Close()}}catch{$closed=$false}
    try{$serial.Dispose()}catch{$closed=$false}
  }
  if($closed){try{Emit @{type='closed';reason=$reason}}catch{}}
  # No serial payload output method exists. CLOSE is consumed only on Console.In.
}
