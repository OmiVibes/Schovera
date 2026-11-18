param(
  [Parameter(Mandatory=$true)][ValidateSet('List','Open')][string]$Action,
  [string]$Port,
  [string]$ConfirmPnpId
)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
function Emit($value) { [Console]::Out.WriteLine(($value | ConvertTo-Json -Compress -Depth 4)); [Console]::Out.Flush() }

function List-Ports {
  # CIM can hang on this laptop. Registry descriptors are claims, not attestation.
  $names = @([System.IO.Ports.SerialPort]::GetPortNames() | Where-Object { $_ -cmatch '^COM[1-9][0-9]{0,4}$' } | Sort-Object -Unique)
  $metadata = @{}
  foreach ($bus in @('USB','FTDIBUS')) {
    $base = "Registry::HKEY_LOCAL_MACHINE\SYSTEM\CurrentControlSet\Enum\$bus"
    if (Test-Path -LiteralPath $base) {
      foreach ($model in Get-ChildItem -LiteralPath $base) {
        foreach ($device in Get-ChildItem -LiteralPath $model.PSPath) {
          $parameters = Get-ItemProperty -LiteralPath ($device.PSPath+'\Device Parameters') -ErrorAction SilentlyContinue
          if ($parameters.PortName -in $names) {
            $properties = Get-ItemProperty -LiteralPath $device.PSPath
            $id = $device.Name -replace '^HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Enum\\',''
            if ($id.Length -le 256) {
              $metadata[$parameters.PortName] = @{
                port=$parameters.PortName; pnpId=$id;
                name=([string]$properties.FriendlyName).Substring(0,[Math]::Min(256,([string]$properties.FriendlyName).Length));
                manufacturer=([string]$properties.Mfg).Substring(0,[Math]::Min(256,([string]$properties.Mfg).Length))
              }
            }
          }
        }
      }
    }
  }
  foreach ($name in $names) {
    if ($metadata.ContainsKey($name)) { $metadata[$name] }
    else { @{port=$name;pnpId=$null;name='Metadata unavailable; opening refused';manufacturer=$null} }
  }
}

$serial = $null
try {
  $ports = @(List-Ports)
  if ($Action -eq 'List') { Emit @{type='ports';ports=$ports}; exit 0 }
  if ($Port -cnotmatch '^COM[1-9][0-9]{0,4}$' -or !$ConfirmPnpId -or $ConfirmPnpId.Length -gt 256) { throw 'selection_refused' }
  $selected = @($ports | Where-Object { $_.port -ceq $Port -and $_.pnpId -ceq $ConfirmPnpId })
  if ($selected.Count -ne 1) { throw 'selection_refused' }
  $serial = New-Object System.IO.Ports.SerialPort($Port,115200,[System.IO.Ports.Parity]::None,8,[System.IO.Ports.StopBits]::One)
  $serial.Handshake = [System.IO.Ports.Handshake]::None
  # UNO R4 native USB CDC gates reads/writes on its connected/DTR state.
  # Fixed 115200; never perform the bootloader's 1200-baud touch sequence.
  $serial.DtrEnable = $true; $serial.RtsEnable = $false
  $serial.ReadTimeout = 200; $serial.WriteTimeout = 1000
  try { $serial.Open() } catch { Emit @{type='error';code='serial_busy_denied_or_unavailable'}; exit 2 }
  Add-Type -Path (Join-Path $PSScriptRoot 'SerialInput.cs')
  Emit @{type='opened';port=$Port;baud=115200}
  $inputTask = [SchoveraSerialInput]::Next()
  $buffer = New-Object byte[] 256
  while ($serial.IsOpen) {
    if ($inputTask.IsCompleted) {
      $inputLine = $inputTask.GetAwaiter().GetResult()
      if ($null -eq $inputLine) { break }
      if ($inputLine.Length -gt 1024) { throw 'operator_command_refused' }
      $message = $inputLine | ConvertFrom-Json
      if ($message.type -ceq 'close') { break }
      $line = [string]$message.line
      # Closed grammar only. Serial input is NEVER evaluated as PowerShell.
      $uuid = '[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}'
      $safe = $line -ceq 'STATUS' -or $line -ceq 'RETRY' -or $line -cmatch ('^CLEAR '+$uuid+'$') -or $line -cmatch ('^ARM '+$uuid+' '+$uuid+' [1-9][0-9]{0,9} 20[0-9]{2}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$')
      if ($message.type -cne 'command' -or !$safe -or $line.Length -gt 256) { throw 'operator_command_refused' }
      $serial.Write($line+"`n")
      $inputTask = [SchoveraSerialInput]::Next()
    }
    $available = $serial.BytesToRead
    if ($available -gt 0) {
      $count = $serial.Read($buffer,0,[Math]::Min(256,$available))
      if ($count -gt 0) { Emit @{type='bytes';data=[Convert]::ToBase64String($buffer,0,$count)} }
    }
    # No reopen or automatic port renumbering. Re-selection is mandatory.
    if ([System.IO.Ports.SerialPort]::GetPortNames() -cnotcontains $Port) { throw 'serial_disconnected' }
    Start-Sleep -Milliseconds 40
  }
} catch {
  $code = if ($_.Exception.Message -in @('selection_refused','operator_command_refused','serial_disconnected')) { $_.Exception.Message } else { 'serial_worker_failed' }
  Emit @{type='error';code=$code}; exit 2
} finally {
  if ($null -ne $serial) { if ($serial.IsOpen) { $serial.Close() }; $serial.Dispose() }
}
