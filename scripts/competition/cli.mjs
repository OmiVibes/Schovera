// No dotenv loading here: the normal developer checkout may contain private data.
import {spawn,execFileSync} from 'node:child_process';import {fileURLToPath} from 'node:url';import {existsSync,mkdirSync,writeFileSync,openSync,closeSync,unlinkSync} from 'node:fs';import path from 'node:path';import {randomUUID} from 'node:crypto';import {setTimeout as delay} from 'node:timers/promises';
import {qaDirectory,origin,stateFile,safeQa,readState,assertOwner,minimalEnvironment,sourceFingerprint} from './guard.mjs';import {assertGatewayRuntime} from '../rfid-gateway/runtime-guard.mjs';
assertGatewayRuntime();const command=process.argv[2],discard=process.argv[3]==='--discard-pending';
if(!['start','status','rehearse','credentials','stop','clean'].includes(command)||process.argv.slice(3).some(a=>a!=='--discard-pending')||(discard&&command!=='clean'))throw Error('Use competition -- start|status|rehearse|credentials|stop|clean [--discard-pending for clean only]');
const source=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),env=minimalEnvironment();safeQa();
function save(s){assertOwner(s);mkdirSync(path.dirname(stateFile),{recursive:true});const existing=readState();if(existing&&existing.owner!==s.owner)throw Error('Competition ownership changed; preserving state');writeFileSync(stateFile,JSON.stringify(s,null,2),{mode:0o600,...(!existing?{flag:'wx'}:{})});}
function child(action,s,inherit=false){const args=['--env-file=.env.test.local',path.join(qaDirectory,'scripts/competition/qa.mjs'),action,s.owner,...(discard?['--discard-pending']:[])];return execFileSync(process.execPath,args,{cwd:qaDirectory,env,encoding:'utf8',windowsHide:true,timeout:240000,stdio:inherit?'inherit':['ignore','pipe','pipe']});}
function processInfo(pid){if(!Number.isSafeInteger(pid)||pid<1)return null;try{const text=execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',`Get-CimInstance Win32_Process -Filter 'ProcessId=${pid}' | Select-Object ProcessId,CommandLine,CreationDate | ConvertTo-Json -Compress`],{env,encoding:'utf8',windowsHide:true,timeout:10000});return text.trim()?JSON.parse(text):null;}catch{return null;}}
function ownsServer(s){const p=processInfo(s.pid);return !!p&&String(p.CommandLine).includes(path.join(qaDirectory,'scripts/competition/server.mjs'))&&String(p.CommandLine).includes(s.owner)&&JSON.stringify(p.CreationDate)===JSON.stringify(s.creation);}
function stop(s){if(s.pid&&processInfo(s.pid)){if(!ownsServer(s))throw Error('Process ownership changed; refusing to stop it.');execFileSync('taskkill',['/PID',String(s.pid),'/T','/F'],{env,windowsHide:true,stdio:'pipe'});}s.pid=null;s.creation=null;save(s);}
async function reachable(){try{return (await fetch(origin,{redirect:'error',signal:AbortSignal.timeout(1200)})).ok;}catch{return false;}}
function prerequisites(){
 let database;try{database=JSON.parse(execFileSync('docker',['inspect','supabase_db_Schovera','--format','{{json .}}'],{env,encoding:'utf8',windowsHide:true,timeout:10000}));}catch{throw Error('Start Docker Desktop and the existing local Supabase stack first. No reset or migration was attempted.');}
 if(!database.State.Running||!database.NetworkSettings.Ports['5432/tcp']?.every(p=>p.HostIp==='127.0.0.1'&&p.HostPort==='54322'))throw Error('Approved loopback database is not ready');
 const count=Number(execFileSync('docker',['exec','supabase_db_Schovera','psql','-U','postgres','-d','postgres','-Atc','SELECT count(*) FROM supabase_migrations.schema_migrations'],{env,encoding:'utf8',windowsHide:true,timeout:10000}).trim());if(count!==48)throw Error('Expected reviewed 48-migration QA schema; no migration was applied automatically.');
 for(const [name,version]of Object.entries({next:'16.4.1',zod:'4.6.6'})){const actual=JSON.parse(execFileSync(process.execPath,['-e',`console.log(JSON.stringify(require(${JSON.stringify(path.join(qaDirectory,'node_modules',name,'package.json'))}).version))`],{env,encoding:'utf8',windowsHide:true}));if(actual!==version)throw Error('QA dependency installation differs from the reviewed lockfile');}
}
let s=readState(),started=false;
try{
 if(command==='stop'){if(s)stop(s);console.log('Owned competition server stopped; fictional fixture retained.');}
 else if(command==='start'){
  if(sourceFingerprint(source)!==sourceFingerprint(qaDirectory))throw Error('QA source differs from this checkout. Use approved source synchronization; no private environment or existing work was overwritten.');
  prerequisites();if((await fetch('http://127.0.0.1:54321/auth/v1/health',{signal:AbortSignal.timeout(5000)})).status!==200)throw Error('Local Auth is unavailable');
  if(!s){if(existsSync(path.join(qaDirectory,'.local/schovera-manual-demo/current.json')))throw Error('An unowned rehearsal already exists; preserving it.');s={version:1,qa:qaDirectory,owner:randomUUID(),pid:null,creation:null,fixtureRun:null};save(s);}
  if(!ownsServer(s)){
   if(await reachable())throw Error('Port 3104 is already in use by an unowned server; preserving it.');
   const log=openSync(path.join(path.dirname(stateFile),'server.log'),'a');const p=spawn(process.execPath,[path.join(qaDirectory,'scripts/competition/server.mjs'),s.owner],{cwd:qaDirectory,env,detached:true,stdio:['ignore',log,log],windowsHide:true});closeSync(log);s.pid=p.pid;p.unref();save(s);const info=processInfo(s.pid);if(!info)throw Error('Owned server process failed before readiness');s.creation=info.CreationDate;save(s);started=true;
   const deadline=Date.now()+45000;while(!await reachable()){if(Date.now()>deadline||!ownsServer(s))throw Error('Owned server did not become ready; inspect the private QA competition/server.log');await delay(250);}
  }
  child('prepare',s);s=readState();const readiness=JSON.parse(child('status',s));if(!readiness.ready||readiness.students!==3)throw Error('Owned fixture readiness failed');console.log(JSON.stringify({ready:true,url:origin,syntheticOnly:true,fixtureReady:!!s.fixtureRun,roleLoginsVerified:readiness.logins,credentials:'npm run competition -- credentials',rehearsal:'npm run competition -- rehearse'}));
 }else if(command==='status'){
  console.log(JSON.stringify({url:origin,ownedServer:!!s&&ownsServer(s),webReachable:await reachable(),fixture:s?JSON.parse(child('status',s)):null,physicalHardware:false}));
 }else{
  if(!s)throw Error('No owned competition state; use competition -- start');
  if(command==='clean'){if(s.fixtureRun)child('clean',s);stop(s);unlinkSync(stateFile);console.log('Only owned fictional competition records were cleaned; backups retained.');}
  else{if(!ownsServer(s)||!await reachable())throw Error('Start the owned competition server before rehearsing or reading its credentials.');child(command,s,true);}
 }
}catch(error){if(started&&s&&ownsServer(s))stop(s);console.error(error.message);process.exitCode=1;}
