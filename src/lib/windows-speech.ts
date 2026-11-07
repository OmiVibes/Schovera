import 'server-only';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { NoticeLanguage } from './parent-speech';

// The command is constant. Text is UTF-8 JSON on stdin, never shell source or XML.
const command = `
$ErrorActionPreference='Stop'
[Console]::InputEncoding=New-Object Text.UTF8Encoding($false)
[Console]::OutputEncoding=New-Object Text.UTF8Encoding($false)
$payload=[Console]::In.ReadToEnd()|ConvertFrom-Json
$selected=$null
foreach($categoryId in @('HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Speech_OneCore\\Voices','HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Speech\\Voices')) {
  $category=New-Object -ComObject SAPI.SpObjectTokenCategory
  $category.SetId($categoryId,$false)
  foreach($token in $category.EnumerateTokens()) {
    foreach($hex in ($token.GetAttribute('Language') -split ';')) {
      try { $culture=[Globalization.CultureInfo]::GetCultureInfo([Convert]::ToInt32($hex,16)) } catch { continue }
      if($culture.TwoLetterISOLanguageName -eq $payload.language) { $selected=$token; break }
    }
    if($selected) { break }
  }
  if($selected) { break }
}
if(-not $selected) { throw 'Requested local voice is not installed.' }
$voice=New-Object -ComObject SAPI.SpVoice
$stream=New-Object -ComObject SAPI.SpFileStream
try {
  $voice.Voice=$selected
  $voice.Volume=100
  $voice.Rate=0
  $stream.Open($payload.file,3,$false)
  $voice.AudioOutputStream=$stream
  $voice.Speak($payload.text,16)|Out-Null
} finally { $stream.Close() }
@{voice=$selected.GetDescription()}|ConvertTo-Json -Compress
`;
let busy = false;
export async function synthesizeWindowsSpeech(text: string, language: NoticeLanguage) {
  if (process.platform !== 'win32') throw new Error('WINDOWS_REQUIRED');
  if (busy) throw new Error('BUSY');
  busy = true;
  let directory: string | undefined;
  let file: string | undefined;
  try {
    directory = await mkdtemp(path.join(tmpdir(), 'schovera-speech-'));
    file = path.join(directory, 'speech.wav');
    const metadata = await new Promise<string>((resolve, reject) => {
      const executable = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
      const osNames = ['SystemRoot','WINDIR','TEMP','TMP','APPDATA','LOCALAPPDATA','USERPROFILE','PATH','Path','ComSpec','PATHEXT','ProgramFiles','ProgramFiles(x86)','ProgramData','PUBLIC','HOMEDRIVE','HOMEPATH'];
      const env: NodeJS.ProcessEnv = { NODE_ENV: process.env.NODE_ENV ?? 'development', ...Object.fromEntries(osNames.filter(name=>process.env[name]).map(name=>[name,process.env[name]!])) };
      const child = spawn(executable, ['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(command,'utf16le').toString('base64')], { env, windowsHide: true, stdio: ['pipe','pipe','pipe'] });
      let output = '';
      let timedOut = false;
      const timer = setTimeout(() => { timedOut = true; child.kill(); }, 30000);
      child.stdout.on('data', chunk => { if (output.length < 4000) output += chunk.toString(); });
      child.stderr.resume(); // Engine failures never log notice text or private paths.
      child.on('error', () => { clearTimeout(timer); reject(new Error('SPEECH_UNAVAILABLE')); });
      child.on('close', code => { clearTimeout(timer); if (timedOut) reject(new Error('SPEECH_TIMEOUT')); else if (code === 0) resolve(output); else reject(new Error('SPEECH_UNAVAILABLE')); });
      child.stdin.on('error', () => {});
      child.stdin.end(JSON.stringify({ text, language, file }));
    });
    // Request-time files live in our owned OS temp directory, not build inputs.
    const wave = await readFile(/* turbopackIgnore: true */ file);
    if (wave.length < 100 || wave.toString('ascii',0,4) !== 'RIFF' || wave.toString('ascii',8,12) !== 'WAVE') throw new Error('INVALID_AUDIO');
    return { wave, voice: (JSON.parse(metadata) as { voice: string }).voice };
  } finally {
    // Exact files and directory created above only; no recursive cleanup.
    if (file) await unlink(file).catch(() => {});
    if (directory) await rmdir(directory).catch(() => {});
    busy = false;
  }
}
