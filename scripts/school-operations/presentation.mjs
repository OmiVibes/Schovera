// Explicit, owned synthetic rehearsal lifecycle. Never cleans an unrelated fixture.
import {existsSync,readFileSync,writeFileSync,unlinkSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import {prepareManualFixture,readManualFixture,cleanManualFixture} from '../manual-demo.mjs';
import {assertLocalTestEnvironment} from '../lib/local-test-env.mjs';
import {openGatewayDatabase} from '../rfid-gateway/storage.mjs';
assertLocalTestEnvironment();
if(existsSync('.env.local'))throw new Error('Use isolated QA without .env.local. File was not opened.');
const marker=path.resolve('.local/school-operation-presentation.json');
const command=process.argv[2];
if(command==='prepare'){
  if(existsSync(marker))throw new Error('A school-operation rehearsal is already journaled; do not overwrite it.');
  const fixture=await prepareManualFixture();
  mkdirSync(path.dirname(marker),{recursive:true});
  writeFileSync(marker,JSON.stringify({runId:fixture.runId,schoolId:fixture.schoolId,teacherId:fixture.accounts.teacher.id}),{flag:'wx',mode:0o600});
  console.log('Synthetic rehearsal prepared. Read its sign-ins privately with npm run demo:credentials.');
}else if(command==='clean'&&process.argv[3]==='--discard-pending'){
  if(!existsSync(marker))throw new Error('No owned school-operation rehearsal journal. Nothing was deleted.');
  const owned=JSON.parse(readFileSync(marker,'utf8')),fixture=readManualFixture();
  if(owned.runId!==fixture.runId||owned.schoolId!==fixture.schoolId||owned.teacherId!==fixture.accounts.teacher.id||fixture.code!==`MANUAL-${owned.runId}`)throw new Error('Rehearsal identity mismatch. Nothing was deleted.');
  const store=openGatewayDatabase(path.resolve('.local/schovera-rfid-gateway/gateway.sqlite'));
  try{if(store.db.prepare("SELECT 1 FROM sqlite_master WHERE name='school_operations'").get())store.db.prepare('DELETE FROM school_operations WHERE actor_id=? AND school_id=?').run(owned.teacherId,owned.schoolId);}finally{store.close();}
  await cleanManualFixture();unlinkSync(marker);
  console.log('Only this journaled synthetic rehearsal and its queued operations were discarded.');
}else throw new Error('Use prepare, or clean --discard-pending for the journaled synthetic rehearsal only.');
