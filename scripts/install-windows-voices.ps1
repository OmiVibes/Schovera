# Installs only Microsoft's supported Basic + TextToSpeech language capabilities.
# Run in Administrator PowerShell. Does not change display/input language,
# install cloud providers, read .env files or restart the computer.
$ErrorActionPreference = 'Stop'
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$isAdmin = (New-Object Security.Principal.WindowsPrincipal($identity)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) { throw 'Windows voice installation requires Administrator PowerShell (Windows servicing requirement).' }
$repository = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$reportDirectory = Join-Path $repository '.local\windows-voice-setup'
New-Item -ItemType Directory -Path $reportDirectory -Force | Out-Null
$reportPath = Join-Path $reportDirectory 'result.json'
$results = @()
$state = [ordered]@{ startedAt = (Get-Date).ToUniversalTime().ToString('o'); finished = $false; restartNeeded = $false; languages = @(); error = $null }
function Save-Report {
  $state.languages = @($results)
  $state | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $reportPath -Encoding UTF8
}
Save-Report
try {
  foreach ($locale in @('hi-IN', 'ko-KR', 'mr-IN')) {
    $voiceName = 'Language.TextToSpeech~~~' + $locale + '~0.0.1.0'
    $voice = Get-WindowsCapability -Online -Name $voiceName
    if (-not $voice -or -not $voice.Name) {
      $results += [pscustomobject]@{ locale=$locale; status='NotOfferedByWindows'; capability=$voiceName }
      Save-Report
      continue
    }
    $results += [pscustomobject]@{ locale=$locale; status='Checking'; capability=$voiceName }
    Save-Report
    if ($voice.State -ne 'Installed') {
      $basicName = 'Language.Basic~~~' + $locale + '~0.0.1.0'
      $basic = Get-WindowsCapability -Online -Name $basicName
      if (-not $basic -or -not $basic.Name) { throw "Windows does not offer the required Basic capability for $locale" }
      if ($basic.State -ne 'Installed') {
        $results[-1].status = 'InstallingBasic'; Save-Report
        $installation = Add-WindowsCapability -Online -Name $basicName
        if ($installation.RestartNeeded) { $state.restartNeeded = $true }
      }
      $results[-1].status = 'InstallingVoice'; Save-Report
      $installation = Add-WindowsCapability -Online -Name $voiceName
      if ($installation.RestartNeeded) { $state.restartNeeded = $true }
    }
    $verified = Get-WindowsCapability -Online -Name $voiceName
    $results[-1].status = [string]$verified.State
    Save-Report
  }
  $state.finished = $true
} catch {
  $state.error = $_.Exception.Message
  throw
} finally {
  Save-Report
}
