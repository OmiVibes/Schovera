$ErrorActionPreference = 'Stop'
Add-Type -Path (Join-Path $PSScriptRoot '..\SerialInput.cs')
$task = [SchoveraSerialInput]::Next()
[Console]::Out.WriteLine('WAITING_WITHOUT_BLOCKING'); [Console]::Out.Flush()
$until = [datetime]::UtcNow.AddSeconds(5)
while (!$task.IsCompleted -and [datetime]::UtcNow -lt $until) { Start-Sleep -Milliseconds 10 }
if (!$task.IsCompleted -or $task.GetAwaiter().GetResult() -cne 'STATUS') { throw 'Input task assertion failed' }
[Console]::Out.WriteLine('PASS_NATIVE_INPUT_TASK'); [Console]::Out.Flush()
