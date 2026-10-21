import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { assertLocalTestEnvironment } from './lib/local-test-env.mjs';

assertLocalTestEnvironment();
if(existsSync('.env.local'))throw new Error('Use the isolated checkout, never the production-env developer checkout');
if(!process.env.npm_execpath)throw new Error('Run through npm run verify:task32r');
const scripts=['test:rfid','test:gateway','test:credential-attribution','test:entry-polling','test:parent-voice','test:translations','test:fallback','test:attendance-insights','verify:attendance','verify:announcements','verify:assignments','verify:corrections','verify:idempotency','verify:student-profile','verify:timetable','verify:reliability','verify:phase1','test','test:translations:db','test:rfid:integration','test:gateway:local-integration','test:translations:integration','test:fallback:integration','test:attendance-insights:integration','verify:reconnect','verify:role-navigation','verify:accessibility-i18n','verify:parent-voice','verify:role-visuals','verify:teacher-ai','verify:local-i18n-reconnect','verify:final-journeys','typecheck','lint'];
scripts.unshift('test:release-preflight','test:homework-editor','test:hosted-demo');
const results=[];mkdirSync('.local/schovera-rfid-gateway',{recursive:true});
for(const name of scripts){
  console.log(`Task 32R gate: ${name}`);const start=Date.now();const r=spawnSync(process.execPath,[process.env.npm_execpath,'run',name],{env:process.env,stdio:'inherit',windowsHide:true,timeout:600000});
  results.push({script:name,exit:r.status,error:r.error?.code,elapsedMs:Date.now()-start});
  writeFileSync('.local/schovera-rfid-gateway/task32r-gate.json',JSON.stringify(results,null,2));
}
console.log(JSON.stringify(results));process.exitCode=results.some(r=>r.exit!==0)?1:0;
