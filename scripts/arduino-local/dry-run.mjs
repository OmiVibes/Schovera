// No database, queue, private issuer, serial-port driver or Wi-Fi listener here.
import {randomUUID,randomBytes} from 'node:crypto';import {existsSync,mkdirSync,writeFileSync} from 'node:fs';import path from 'node:path';
import {assertLocalTestEnvironment} from '../lib/local-test-env.mjs';import {createDryRunServer} from './server.mjs';
if(existsSync(path.resolve('.env.local')))throw Error('Use isolated QA without .env.local; its contents were not read');
assertLocalTestEnvironment();if(process.env.SCHOVERA_ARDUINO_TEST_MODE!=='synthetic')throw Error('Explicit SCHOVERA_ARDUINO_TEST_MODE=synthetic required');
if(process.argv.length!==2)throw Error('No public bind, port override or physical mode is supported');
const sessionId=randomUUID(),token=randomBytes(32).toString('hex');
const dir=path.resolve('.local','arduino-dry-run',sessionId);mkdirSync(dir,{recursive:true});
const fixture={schema:'schovera.arduino.acquisition',version:1,kind:'synthetic',device:'uno-r4-wifi-phase1',session_id:sessionId,acquisition_id:randomUUID(),sequence:1,observed_at:new Date().toISOString(),event_type:'check_in'};
writeFileSync(path.join(dir,'host-access.json'),JSON.stringify({endpoint:'http://127.0.0.1:3187/v1/dry-run',token,sessionId}),{flag:'wx',mode:0o600});
writeFileSync(path.join(dir,'synthetic-message.json'),JSON.stringify(fixture),{flag:'wx',mode:0o600});
const {server,session}=createDryRunServer({sessionId,token});
server.on('error',()=>{console.error('Dry-run server unavailable; no other process was stopped');process.exitCode=1;});
server.listen(3187,'127.0.0.1',()=>console.log(JSON.stringify({mode:'synthetic_dry_run',endpoint:'http://127.0.0.1:3187/v1/dry-run',privateHostAccessFile:path.join(dir,'host-access.json'),sampleFile:path.join(dir,'synthetic-message.json'),sessionId,durable:false,delivery:false,expiresAfterMinutes:15})));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{session.revoke();server.close();});
