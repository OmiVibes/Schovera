import { describe, expect, it } from 'vitest';
import { hostedBuildFixture } from '../../src/lib/demo-deployment-policy.mjs';
import { fictionalNames, columns, makeDataset, validateDataset } from './dataset.mjs';
import { planProvisioning, proveProvisioning } from './provisioning.mjs';
import { readPresentationSource } from './source.mjs';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

function fixture() {
  const raw=Object.fromEntries(Object.keys(columns).map(t=>[t,[]]));
  raw.schools=[{id:'school',name:'Schovera Model School — Demo Campus',timezone:'Asia/Kolkata'}];
  raw.classes=[{id:'a',grade:'7',division:'A'},{id:'b',grade:'7',division:'B'}];
  raw.profiles=Array.from({length:13},(_,i)=>({id:`person${i}`,role:i===0?'principal':i<3?'teacher':'parent',full_name:`Fictional role ${i}`,password:'NEVER_EXPORT',email:'never-export@example.invalid'}));
  raw.students=fictionalNames.map((name,i)=>({id:`child${i}`,full_name:name,class_id:i<10?'a':'b',active:true}));
  raw.parent_student_links=fictionalNames.map((_,i)=>({id:`link${i}`,student_id:`child${i}`,parent_id:`person${3+i%10}`,status:'active'}));
  raw.teacher_class_assignments=[{id:'teacha',teacher_id:'person1',class_id:'a'},{id:'teachb',teacher_id:'person2',class_id:'b'}];
  raw.attendance_records=Array.from({length:200},(_,i)=>({id:`attendance${i}`,student_id:`child${i%20}`,class_id:i%20<10?'a':'b',marked_by:'person1',attendance_date:'2026-10-20',status:'present'}));
  for(const [table,count] of [['class_assignments',6],['timetable_entries',36],['school_entry_events',20]]) raw[table]=Array.from({length:count},(_,i)=>({id:`${table}${i}`,student_id:`child${i%20}`,class_id:'a',teacher_id:'person1'}));
  raw.student_updates=[{id:'notice',student_id:'child0',class_id:'a',teacher_id:'person1',title:'Library notebook reminder',message:'Fictional notice',importance:'important'}];
  raw.announcements=[{id:'announcement',created_by:'person0',title:'Reading week',body:'Fictional school announcement'}];
  raw.acknowledgements=[{id:'ack',update_id:'notice',parent_id:'person3'}];
  raw.communication_translations=['hi','mr'].map(language=>({id:`translation${language}`,student_update_id:'notice',language,status:'approved',authored_by:'person1',approved_by:'person0'}));
  return makeDataset(raw);
}
const options={runId:'f10f4d70-1e5a-4b98-9c18-2d30cedc0081',now:1000,expiresAt:new Date(86401000).toISOString()};
function adapter(plan) {
  const rows=new Map();return {mode:'offline-proof',rows,writes:0,rotations:0,
    identify:async()=>({projectRef:plan.projectRef,appOrigin:plan.appOrigin}),journal:async id=>rows.get(id),
    async reserve(p){rows.set(p.runId,{...p,complete:false});},async upsertOwned(){this.writes++;},
    async complete(id){rows.get(id).complete=true;},async removeOwned(id){rows.delete(id);},async rotateOwned(){this.rotations++;}};
}
describe('controlled provisioning offline proof — no network adapter',()=>{
  it('resolves the existing pointer/manifest layout and rejects traversal without opening private env',()=>{
    const root=mkdtempSync(path.join(tmpdir(),'schovera-source-test-'));const dir=path.join(root,'.local/schovera-manual-demo');const run=options.runId;
    try{mkdirSync(path.join(dir,run),{recursive:true});writeFileSync(path.join(dir,'current.json'),JSON.stringify({runId:run}));writeFileSync(path.join(dir,run,'manifest.json'),JSON.stringify({runId:run,presentation:{ready:true,fictional:true},students:Array(20).fill({})}));expect(readPresentationSource(root).runId).toBe(run);writeFileSync(path.join(dir,'current.json'),JSON.stringify({runId:'../not-owned'}));expect(()=>readPresentationSource(root)).toThrow('pointer');writeFileSync(path.join(root,'.env.local'),'synthetic sentinel; must not be read');expect(()=>readPresentationSource(root)).toThrow('not opened');}finally{rmSync(root,{recursive:true,force:true});}
  });
  it('exports allowlisted connected records without previous credentials or Auth identities',()=>{const b=fixture();expect(b.tables.students).toHaveLength(20);expect(JSON.stringify(b)).not.toContain('NEVER_EXPORT');expect(JSON.stringify(b)).not.toContain('person1');expect(JSON.stringify(b)).not.toContain('never-export@');});
  it('is idempotent and cleans/rotates only the journal-owned run',async()=>{const b=fixture(),p=planProvisioning(hostedBuildFixture,b,options),a=adapter(p);await proveProvisioning(p,b,a,'prepare',1001);expect((await proveProvisioning(p,b,a,'prepare',1001)).duplicate).toBe(true);expect(a.writes).toBe(1);await proveProvisioning(p,b,a,'rotate',1001);expect(a.rotations).toBe(1);a.rows.set('unrelated',{preserved:true});await proveProvisioning(p,b,a,'cleanup',1001);expect([...a.rows.keys()]).toEqual(['unrelated']);});
  it('resumes a reserved incomplete journal after failure',async()=>{const b=fixture(),p=planProvisioning(hostedBuildFixture,b,options),a=adapter(p);await a.reserve(p);await proveProvisioning(p,b,a,'prepare',1001);expect(a.rows.get(p.runId).complete).toBe(true);});
  it.each(['projectRef','appOrigin'])('rejects wrong adapter %s before writes',async field=>{const b=fixture(),p=planProvisioning(hostedBuildFixture,b,options),a=adapter(p);a.identify=async()=>({...p,[field]:'wrong'});await expect(proveProvisioning(p,b,a,'prepare',1001)).rejects.toThrow('identity');expect(a.writes).toBe(0);});
  it('rejects production identity, missing/overlong expiry and malformed run IDs',()=>{const b=fixture();for(const value of [undefined,'invalid',new Date(20*86400000).toISOString()])expect(()=>planProvisioning(hostedBuildFixture,b,{...options,expiresAt:value})).toThrow();expect(()=>planProvisioning({...hostedBuildFixture,SCHOVERA_PRODUCTION_PROJECT_REFS:hostedBuildFixture.SCHOVERA_DEMO_PROJECT_REF},b,options)).toThrow();expect(()=>planProvisioning(hostedBuildFixture,b,{...options,runId:'all'})).toThrow();});
  it('rejects cloud adapters and changed content',async()=>{const b=fixture(),p=planProvisioning(hostedBuildFixture,b,options),a=adapter(p);await expect(proveProvisioning(p,b,{...a,mode:'hosted'},'prepare',1001)).rejects.toThrow('not authorized');b.tables.student_updates[0].title='Changed';await expect(proveProvisioning(p,b,a,'prepare',1001)).rejects.toThrow('changed');});
  it('rejects expiry/ownership conflicts and permits owned cleanup after expiry',async()=>{const b=fixture(),p=planProvisioning(hostedBuildFixture,b,options),a=adapter(p);await expect(proveProvisioning(p,b,a,'rotate',1001)).rejects.toThrow('journal');await proveProvisioning(p,b,a,'prepare',1001);await expect(proveProvisioning(p,b,a,'prepare',86401001)).rejects.toThrow('expired');a.rows.get(p.runId).digest='wrong';await expect(proveProvisioning(p,b,a,'cleanup',86401001)).rejects.toThrow('ownership');a.rows.get(p.runId).digest=p.digest;await proveProvisioning(p,b,a,'cleanup',86401001);expect(a.rows.size).toBe(0);});
  it('rejects unknown sensitive columns, nested metadata, missing records and cross-scope relationships',()=>{for(const mutate of [b=>{b.tables.profiles[0].password='forbidden';},b=>{b.tables.student_updates[0].message={secret:'forbidden'};},b=>{b.tables.students.pop();},b=>{b.tables.students[0].class_id='classes:unknown';}]){const b=fixture();mutate(b);expect(()=>validateDataset(b)).toThrow();}});
});
