param([switch]$Uninstall)
# Pinned optional eSpeak-NG SAPI engine. Local speech only, no .env access,
# browser extension, cloud TTS, display-language change or default-voice change.
$ErrorActionPreference = 'Stop'
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
if (-not (New-Object Security.Principal.WindowsPrincipal($identity)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'Run this voice installer in Administrator PowerShell.' }
if (-not [Environment]::Is64BitProcess) { throw 'Use 64-bit PowerShell for this x64 Windows speech setup.' }
$repository = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$directory = Join-Path $repository '.local\windows-voice-setup'
New-Item -ItemType Directory -Path $directory -Force | Out-Null
$reportPath = Join-Path $directory 'marathi-result.json'
$previous = if (Test-Path -LiteralPath $reportPath) { Get-Content -LiteralPath $reportPath -Raw | ConvertFrom-Json } else { $null }
$expectedHash = '02422eb1feadd955e8594e864d03eea3babde4c3d331cb06ec7028db6386a00f'
$expectedClass = '{8F2D6C4B-1E9A-4F3D-A2B8-5C7E9D3A6F1B}'
$providerSubkey = 'SOFTWARE\Microsoft\Speech_OneCore\Voices\TokenEnums\Schovera-eSpeak-Marathi'
$providerPath = 'Registry::HKEY_LOCAL_MACHINE\' + $providerSubkey
$installDirectory = Join-Path $env:ProgramFiles 'espeak-ng-sapi'
$state = [ordered]@{ engineVersion='1.2.1'; status='Checking'; installerInstalled=$false; restartNeeded=$false; error=$null }
function Save-MarathiReport { $state | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $reportPath -Encoding UTF8 }
Save-MarathiReport
try {
  if ($Uninstall) {
    if (Test-Path -LiteralPath $providerPath) {
      if ((Get-ItemProperty -LiteralPath $providerPath).CLSID -ne $expectedClass) { throw 'Provider registration differs; no registry entry was removed.' }
      # Only our own leaf registration is removed; Microsoft voices are untouched.
      [Microsoft.Win32.Registry]::LocalMachine.DeleteSubKey($providerSubkey, $false)
    }
    $uninstaller = Join-Path $installDirectory 'unins000.exe'
    if (Test-Path -LiteralPath $uninstaller) {
      $process = Start-Process -FilePath $uninstaller -ArgumentList '/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART' -WindowStyle Hidden -Wait -PassThru
      if ($process.ExitCode -ne 0) { throw "Engine uninstaller returned $($process.ExitCode)" }
    }
    $state.status='Uninstalled'
    return
  }

  $installer = Join-Path $directory 'EspeakSAPI_Setup_1.2.1.exe'
  if (-not (Test-Path -LiteralPath $installer)) {
    Invoke-WebRequest -Uri 'https://github.com/gozaltech/espeak-ng-sapi/releases/download/v1.2.1/EspeakSAPI_Setup_1.2.1.exe' -OutFile $installer -UseBasicParsing -TimeoutSec 120
  }
  $hash=(Get-FileHash -LiteralPath $installer -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($hash -ne $expectedHash) { throw 'Pinned release checksum mismatch. Nothing was installed.' }
  $state.sha256=$hash
  $scanner=Join-Path $env:ProgramFiles 'Windows Defender\MpCmdRun.exe'
  if (-not (Test-Path -LiteralPath $scanner)) { throw 'Defender scanner unavailable; installer was not run.' }
  & $scanner -Scan -ScanType 3 -File $installer
  if ($LASTEXITCODE -ne 0) { throw 'Defender scan did not pass; installer was not run.' }

  $engineDll = Join-Path $installDirectory 'EspeakSAPI.dll'
  if (Test-Path -LiteralPath $engineDll) {
    if (-not $previous -or -not $previous.installerInstalled -or $previous.engineVersion -ne '1.2.1') { throw 'A pre-existing engine was found; refusing to replace it.' }
    $state.installerInstalled=$true
  } else {
    $state.status='InstallingEngine'; Save-MarathiReport
    $log = Join-Path $directory 'marathi-installer.log'
    $process = Start-Process -FilePath $installer -ArgumentList @('/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART','/SP-',('/LOG="'+$log+'"')) -WindowStyle Hidden -Wait -PassThru
    if ($process.ExitCode -notin @(0,3010)) { throw "Engine installer returned $($process.ExitCode)" }
    $state.installerInstalled=$true
    $state.restartNeeded=($process.ExitCode -eq 3010)
    Save-MarathiReport
  }

  $vendorPath='Registry::HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Speech\Voices\TokenEnums\eSpeak-NG'
  if (-not (Test-Path -LiteralPath $vendorPath) -or (Get-ItemProperty -LiteralPath $vendorPath).CLSID -ne $expectedClass) { throw 'Expected publisher speech provider was not registered.' }
  $configDirectory=Join-Path $env:APPDATA 'espeak-ng-sapi'
  New-Item -ItemType Directory -Path $configDirectory -Force | Out-Null
  $configPath=Join-Path $configDirectory 'config.json'
  if (Test-Path -LiteralPath $configPath) {
    $backup=Join-Path $directory ('marathi-config-before-'+[Guid]::NewGuid().ToString('N')+'.json')
    Copy-Item -LiteralPath $configPath -Destination $backup
    $config=Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
    if (-not $config.voices) { throw 'Existing engine configuration is unfamiliar; backup retained, configuration not overwritten.' }
    $enabled=@($config.voices.enabled)
    if ($config.voices.default_only) { $enabled+=@('en','en-us') }
    $config.voices.default_only=$false
    $config.voices.enabled=@(($enabled+@('mr'))|Select-Object -Unique)
    $state.configBackup=$backup
  } else {
    $config=[ordered]@{version='1.0';voices=@{default_only=$false;enabled=@('mr')};global_settings=@{variant='';intonation=50;wordgap=0;rateboost=$false};voice_profiles=@()}
  }
  [IO.File]::WriteAllText($configPath,($config|ConvertTo-Json -Depth 12),(New-Object Text.UTF8Encoding($false)))

  Add-Type -AssemblyName System.Speech
  $speaker=New-Object System.Speech.Synthesis.SpeechSynthesizer
  try {
    $marathi=@($speaker.GetInstalledVoices()|Where-Object {$_.Enabled -and $_.VoiceInfo.Culture.TwoLetterISOLanguageName -eq 'mr'})
    if (-not $marathi.Count) { throw 'The engine has no enabled Marathi SAPI voice; browser registration was not added.' }
    $state.voiceNames=@($marathi|ForEach-Object {$_.VoiceInfo.Name})
  } finally { $speaker.Dispose() }

  # Chromium enumerates the OneCore category first. Register the same publisher
  # token enumerator under an additional, clearly owned leaf; no Microsoft token
  # or default-voice value is copied, replaced or relabelled.
  if (Test-Path -LiteralPath $providerPath) {
    if ((Get-ItemProperty -LiteralPath $providerPath).CLSID -ne $expectedClass) { throw 'Existing browser provider differs; refusing to overwrite it.' }
  } else { New-Item -Path $providerPath -Force | Out-Null }
  Set-Item -LiteralPath $providerPath -Value 'Schovera Marathi offline speech'
  New-ItemProperty -LiteralPath $providerPath -Name CLSID -Value $expectedClass -PropertyType String -Force | Out-Null
  $state.status='Installed'
} catch {
  $state.error=$_.Exception.Message
  throw
} finally { Save-MarathiReport }
