import {prepareUiFixture,readUiFixture,cleanUiFixture} from './lib/ui-polish-fixture.mjs';
const command=process.argv[2];
if(command==='prepare'){const f=await prepareUiFixture();console.log(`Synthetic rehearsal prepared for ${f.date}. Exact presentation date remains unconfirmed. Use credentials explicitly; existing school records are unchanged.`);}
else if(command==='info'){const f=readUiFixture();console.log(JSON.stringify({synthetic:true,date:f.date,code:f.code,classes:f.classes.map(c=>`Grade ${c.grade}-${c.division}`),students:f.students.length,updates:f.updates.length},null,2));}
else if(command==='credentials'){const f=readUiFixture();console.log('Private synthetic sign-ins; do not paste into screenshots or Git.');for(const [role,a] of Object.entries(f.accounts))console.log(`${role}: ${a.email} / ${a.password}`);}
else if(command==='clean'){const expected=process.argv[3];if(!expected)throw new Error('Provide the exact run ID from the owned journal; cleanup is never implicit.');await cleanUiFixture(expected);}
else throw new Error('Use prepare, info, credentials or clean <exact-run-id> in isolated QA.');
