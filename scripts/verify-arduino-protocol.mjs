// Root-safe native test: reads no dotenv, hardware, serial port or board config.
import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';import {mkdtempSync,rmSync} from 'node:fs';import path from 'node:path';import os from 'node:os';import {fileURLToPath} from 'node:url';import {validateMessage} from './arduino-local/protocol.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),dir=mkdtempSync(path.join(os.tmpdir(),'schovera-m7a-native-'));
try{
 const binary=path.join(dir,process.platform==='win32'?'protocol-test.exe':'protocol-test');
 execFileSync('g++',['-std=c++11','-Wall','-Wextra','-Werror',path.join(root,'hardware/arduino-uno-r4-wifi/tests/protocol_test.cpp'),'-o',binary],{stdio:'pipe',windowsHide:true});
 const text=execFileSync(binary,[],{encoding:'utf8',windowsHide:true}),line=text.split(/\r?\n/)[0];
 assert.deepEqual(validateMessage(line,{sessionId:'00000000-0000-4000-8000-000000000001'}),{acquisitionId:'00000000-0000-4000-8000-000000000002',sequence:1,observedAt:'2026-11-18T09:00:00.000Z',eventType:'check_in'});
 assert.ok(text.includes('PASS:'));console.log('PASS: executed exact C++ firmware serializer/state assertions and independently validated its actual JSON in the host schema. No board was used.');
}finally{if(path.dirname(dir)!==os.tmpdir()||!path.basename(dir).startsWith('schovera-m7a-native-'))throw Error('Unsafe native-test cleanup');rmSync(dir,{recursive:true});}
