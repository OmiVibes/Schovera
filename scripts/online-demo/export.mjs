// Read-only local export. No remote adapter, Auth export, migration or reset.
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { assertLocalTestEnvironment } from '../lib/local-test-env.mjs';
import { columns, makeDataset, datasetDigest } from './dataset.mjs';
import { readPresentationSource } from './source.mjs';

assertLocalTestEnvironment();
if (existsSync('.env.local')) throw new Error('Use a clean isolated checkout; private environment file was not opened');
const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== '--source-worktree')) throw new Error('Only --source-worktree <owned fictional fixture checkout> is supported');
const source = path.resolve(args[1] ?? '.');
const f = readPresentationSource(source);
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const must = async query => { const r = await query; if(r.error) throw new Error('Local allowlisted export query failed; no data or credentials printed'); return r.data; };
const school = await must(db.from('schools').select('id,code').eq('id',f.schoolId).single());
if (school.code !== `MANUAL-${f.runId}`) throw new Error('Source school not owned by this fixture');
const actorIds = Object.entries(f.accounts).filter(([key]) => !['unlinkedParent','unassignedTeacher'].includes(key)).map(([,a]) => a.id);
const raw = {};
for (const table of Object.keys(columns)) {
  let query = db.from(table).select(columns[table]);
  if(table === 'schools') query = query.eq('id',f.schoolId);
  else if(table === 'profiles') query = query.eq('school_id',f.schoolId).in('id',actorIds);
  else if(table === 'teacher_class_assignments') query = query.in('teacher_id',actorIds).is('ended_at',null);
  else if(table === 'parent_student_links') query = query.in('parent_id',actorIds).eq('status','active');
  else if(table === 'acknowledgements') query = query.in('update_id',raw.student_updates.map(r=>r.id));
  else query = query.eq('school_id',f.schoolId);
  raw[table] = await must(query.order('id').limit(2001));
}
const dataset = makeDataset(raw), digest = datasetDigest(dataset);
const directory = path.resolve('.local/schovera-rfid-gateway/online-demo');
mkdirSync(directory,{recursive:true,mode:0o700});
const file = path.join(directory,`${digest}.json`);
if (existsSync(file)) {
  if(datasetDigest(JSON.parse(readFileSync(file,'utf8'))) !== digest) throw new Error('Existing export artifact changed; preserved for review');
} else writeFileSync(file,JSON.stringify(dataset,null,2),{flag:'wx',mode:0o600});
console.log(`Fictional dataset export verified: 20 students, 13 role accounts, logical IDs only; SHA-256 ${digest}`);
console.log(`Ignored artifact: ${file}. No cloud action, credential export or database mutation.`);
