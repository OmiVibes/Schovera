// Guarded, journaled synthetic rehearsal data. Never imported by the application.
import {createClient} from '@supabase/supabase-js';
import {randomBytes,randomUUID} from 'node:crypto';
import {existsSync,mkdirSync,readFileSync,writeFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {assertLocalTestEnvironment} from './local-test-env.mjs';
import {schoolToday,shiftSchoolDate} from '../../src/lib/school-date.mjs';

const directory=path.resolve('.local/schovera-ui-rehearsal');
const pointer=path.join(directory,'current.json');
const must=async q=>{const {data,error}=await q;if(error)throw new Error(`Synthetic fixture query failed: ${error.code || 'unknown'}`);return data;};
function adminClient(){
  if(existsSync('.env.local'))throw new Error('Use the isolated QA checkout; private environment file was not read.');
  assertLocalTestEnvironment();
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
}
export function readUiFixture(){adminClient();const f=JSON.parse(readFileSync(pointer,'utf8'));if(f.version!==1||!/^UI-POLISH-[0-9a-f-]{36}$/.test(f.code)||f.code!==`UI-POLISH-${f.runId}`)throw new Error('Unknown rehearsal ownership.');return f;}
export async function uiActor(f,role){
  assertLocalTestEnvironment();
  const client=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  await must(client.auth.signInWithPassword(f.accounts[role]));return client;
}
export async function prepareUiFixture({stress=false,onCreated}={}){
  const admin=adminClient();if(existsSync(pointer))throw new Error('An owned rehearsal already exists; inspect it before explicit cleanup.');
  mkdirSync(directory,{recursive:true,mode:0o700});
  const runId=randomUUID(),f={version:1,runId,code:`UI-POLISH-${runId}`,createdAt:new Date().toISOString(),date:schoolToday(),stress,schoolId:null,accounts:{},users:[],classes:[],students:[],updates:[]};
  const save=()=>writeFileSync(pointer,JSON.stringify(f,null,2),{mode:0o600});
  writeFileSync(pointer,JSON.stringify(f),{flag:'wx',mode:0o600});onCreated?.(f);
  f.schoolId=(await must(admin.from('schools').insert({code:f.code,name:`Synthetic rehearsal · ${f.date}`,timezone:'Asia/Kolkata'}).select('id').single())).id;save();
  for(const role of ['teacher','parent','principal']){
    const account={email:`${role}-${runId}@rehearsal.local.test`,password:`Rehearsal-${randomBytes(18).toString('base64url')}!aA1`};
    const created=await admin.auth.admin.createUser({...account,email_confirm:true});if(created.error)throw new Error('Synthetic account creation failed.');
    f.users.push(created.data.user.id);f.accounts[role]=account;save();
    await must(admin.from('profiles').insert({id:created.data.user.id,school_id:f.schoolId,role,full_name:`Rehearsal ${role}`,email:account.email,active:true}));
  }
  const sizes=stress?[5,20,40,60]:[5,5];
  for(const [index,count] of sizes.entries()){
    const division=String.fromCharCode(65+index);
    const klass=await must(admin.from('classes').insert({school_id:f.schoolId,grade:'7',division,academic_year:`Rehearsal ${f.date}`}).select('*').single());f.classes.push({...klass,count});save();
    await must(admin.from('teacher_class_assignments').insert({teacher_id:f.users[0],class_id:klass.id}));
    const rows=Array.from({length:count},(_,n)=>({school_id:f.schoolId,class_id:klass.id,full_name:`Synthetic learner ${division}${String(n+1).padStart(2,'0')}`,roll_number:String(n+1).padStart(2,'0'),active:true}));
    const students=await must(admin.from('students').insert(rows).select('*'));f.students.push(...students);save();
    if(index<2)await must(admin.from('parent_student_links').insert({parent_id:f.users[1],student_id:students[0].id}));
  }
  const teacher=await uiActor(f,'teacher'),principal=await uiActor(f,'principal');
  const eventDate=shiftSchoolDate(f.date,2),first=f.students.find(s=>s.class_id===f.classes[0].id);
  for(let n=0;n<(stress?32:3);n++){
    const id=await must(teacher.rpc('send_student_update',{p_class_id:first.class_id,p_student_id:first.id,p_category:'general',p_title:`Rehearsal ${f.date} · note ${n+1}`,p_message:`Synthetic practice only: library workshop on ${eventDate} at 09:00. No real pupil or actual school event.`,p_importance:n%4===0?'important':'normal',p_client_request_id:randomUUID()}));f.updates.push(id);save();
  }
  await must(principal.rpc('publish_announcement',{p_title:`Synthetic rehearsal · ${f.date}`,p_body:`Practice dataset created on ${f.date}. The sample workshop date is ${eventDate} at 09:00. This is not an actual school announcement.`,p_priority:'normal',p_client_request_id:randomUUID()}));
  save();return f;
}
export async function cleanUiFixture(expectedRunId){
  const admin=adminClient(),f=readUiFixture();if(f.runId!==expectedRunId)throw new Error('Rehearsal identity mismatch; preserving data.');
  const school=await must(admin.from('schools').select('id,code').eq('id',f.schoolId).maybeSingle());
  if(school){
    if(school.code!==f.code)throw new Error('Unowned school; cleanup refused.');
    const updates=await must(admin.from('student_updates').select('id,corrects_update_id').eq('school_id',f.schoolId));
    if(updates.length)await must(admin.from('acknowledgements').delete().in('update_id',updates.map(u=>u.id)));
    let remaining=updates;while(remaining.length){const leaves=remaining.filter(u=>!remaining.some(v=>v.corrects_update_id===u.id));if(!leaves.length)throw new Error('Unexpected correction cycle.');await must(admin.from('student_updates').delete().in('id',leaves.map(u=>u.id)));remaining=remaining.filter(u=>!leaves.includes(u));}
    for(const table of ['communication_translations','attendance_records','class_assignments','timetable_entries','announcements','audit_events'])await must(admin.from(table).delete().eq('school_id',f.schoolId));
    await must(admin.from('parent_student_links').delete().eq('parent_id',f.users[1]));await must(admin.from('teacher_class_assignments').delete().eq('teacher_id',f.users[0]));
    for(const table of ['students','classes','profiles'])await must(admin.from(table).delete().eq('school_id',f.schoolId));
  }
  for(const id of f.users){const {error}=await admin.auth.admin.deleteUser(id);if(error&&error.status!==404)throw new Error('Owned account cleanup failed.');}
  if(school)await must(admin.from('schools').delete().eq('id',f.schoolId));
  if((await must(admin.from('schools').select('id').eq('id',f.schoolId))).length)throw new Error('Owned fixture remains.');
  unlinkSync(pointer);console.log('Exact journaled rehearsal school/accounts cleaned; no other school targeted.');
}
