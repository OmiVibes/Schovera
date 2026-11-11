import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {existsSync} from 'node:fs';
import {openOperations} from './store.mjs';
import {assertLocalTestEnvironment} from '../lib/local-test-env.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
if(existsSync(path.join(root,'.env.local')))throw new Error('Use isolated QA without .env.local. File was not opened.');
assertLocalTestEnvironment(process.env,{requireServiceRole:false});
const mode=process.argv[2];
if(!['online','offline','authority-offline','lose-response','status'].includes(mode))throw new Error('Use online, offline, authority-offline, lose-response or status. Local simulation only.');
const store=openOperations(path.join(root,'.local/schovera-rfid-gateway/gateway.sqlite'));
try{if(mode!=='status')store.setMode(mode);console.log(`Local school-operation simulation: ${store.mode()}. No public target is configured.`);}finally{store.close();}
