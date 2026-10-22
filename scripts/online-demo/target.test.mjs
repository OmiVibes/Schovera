import { describe,it,expect } from 'vitest';
import { validateTarget,fingerprint,targetFetch } from './target.mjs';
import { stableId } from './adapter.mjs';
import { DemoAdapter } from './adapter.mjs';
import { readFileSync,mkdtempSync,existsSync,writeFileSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { datasetDigest } from './dataset.mjs';
const credentials={url:'https://abcdefghijklmnopqrst.supabase.co',key:'sb_secret_synthetic_key',publishableKey:'sb_publishable_synthetic_key'};
const approval={version:1,purpose:'schovera-fictional-demo',datasetSha256:'ac5db776b7d53974693a10cd888d69ae619ac90b5b35fb7597e9e365676ccb2a',verifiedBy:'synthetic operator',verificationEvidence:'synthetic dashboard evidence',expiresAt:'2099-01-01',mode:'hosted',projectRef:'abcdefghijklmnopqrst',url:credentials.url,allowedDemoProjectRefs:['abcdefghijklmnopqrst'],productionProjectRefs:['uvwxyzabcdefghijklmn'],secretKeySha256:fingerprint(credentials.key),publishableKeySha256:fingerprint(credentials.publishableKey)};
describe('concrete provisioner fail-closed identity',()=>{
 it('accepts an exact attested endpoint and key fingerprint',()=>expect(validateTarget(approval,credentials).mode).toBe('hosted'));
 it.each(['production','unknown','host','secret','public','expired','evidence','allowlist'])('refuses %s before clients or requests',kind=>{
   const a=structuredClone(approval),c={...credentials};
   if(kind==='production')a.productionProjectRefs.push(a.projectRef);
   if(kind==='unknown')a.mode='unknown';
   if(kind==='host')c.url='https://unapproved.example';
   if(kind==='secret')c.key='sb_secret_another_project';
   if(kind==='public')c.publishableKey='sb_publishable_another_project';
   if(kind==='expired')a.expiresAt='2000-01-01';
   if(kind==='evidence')delete a.verificationEvidence;
   if(kind==='allowlist')a.allowedDemoProjectRefs=[];
   expect(()=>validateTarget(a,c)).toThrow();
 });
 it('rejects service JWT reuse in hosted mode even if fingerprint is copied',()=>{const c={...credentials,key:'eyJ.synthetic.production'};expect(()=>validateTarget({...approval,secretKeySha256:fingerprint(c.key)},c)).toThrow('New demo');});
 it('never follows redirects or allows another origin',async()=>{let called=0;const f=targetFetch(credentials.url,async(_i,init)=>{called++;expect(init.redirect).toBe('error');return new Response('{}');});await expect(f('https://schovera.vercel.app/auth/v1/admin/users')).rejects.toThrow('egress');expect(called).toBe(0);await f(`${credentials.url}/auth/v1/admin/users`);expect(called).toBe(1);});
 it('gives stable run-scoped UUIDs',()=>{const run='f10f4d70-1e5a-4b98-9c18-2d30cedc0081';expect(stableId(run,'students:1')).toBe(stableId(run,'students:1'));expect(stableId(run,'students:1')).not.toBe(stableId(run,'students:2'));});
});

describe('operator dry-run and dotenv safety',()=>{
 const data=JSON.parse(readFileSync(new URL('./fixtures/fictional-campus.json',import.meta.url),'utf8'));
 const runId='f10f4d70-1e5a-4b98-9c18-2d30cedc0081';
 it('keeps the exact approved UTF-8 dataset and logical identities',()=>{expect(datasetDigest(data)).toBe('ac5db776b7d53974693a10cd888d69ae619ac90b5b35fb7597e9e365676ccb2a');expect(data.tables.students).toHaveLength(20);});
 it('refuses changed dataset content even under a fresh run',async()=>{const changed=structuredClone(data);changed.tables.student_updates[0].message='Unreviewed new content';const a=new DemoAdapter({approval,credentials,directory:tmpdir()});await expect(a.run(changed,{runId,expiresAt:new Date(Date.now()+86400000).toISOString()})).rejects.toThrow('approved manifest');});
 it.each(['prepare','rotate','disable','reset','remove-expired'])('%s dry-run cannot send requests or create a journal',async operation=>{
   const directory=path.join(tmpdir(),`schovera-never-created-${operation}-${runId}`);let requests=0;
   const adapter=new DemoAdapter({approval,credentials,directory,fetcher:async()=>{requests++;throw new Error('must not execute');}});
   const result=await adapter.run(data,{runId,expiresAt:new Date(Date.now()+86400000).toISOString(),operation});
   expect(result.dryRun).toBe(true);expect(requests).toBe(0);expect(existsSync(directory)).toBe(false);
 });
 it('refuses invalid run, operation and expiry without contacting target',async()=>{
   let requests=0;const a=new DemoAdapter({approval,credentials,directory:tmpdir(),fetcher:async()=>{requests++;throw new Error('must not execute');}});
   for(const options of [{runId:'all'},{runId,operation:'global-reset'},{runId,expiresAt:'invalid'}])await expect(a.run(data,options)).rejects.toThrow();expect(requests).toBe(0);
 });
 it('refuses an operator checkout containing a synthetic private env without parsing it',()=>{
   const root=mkdtempSync(path.join(tmpdir(),'schovera-operator-env-proof-'));
   try {
     const sentinel='harmless_private_probe_DO_NOT_LOAD';writeFileSync(path.join(root,'.env.local'),`NEXT_PUBLIC_PRIVATE_PROBE=${sentinel}`);
     const env=Object.fromEntries(['PATH','Path','SystemRoot','WINDIR','TEMP','TMP'].flatMap(k=>process.env[k]?[[k,process.env[k]]]:[]));
     const result=spawnSync(process.execPath,[fileURLToPath(new URL('./cli.mjs',import.meta.url))],{cwd:root,env,encoding:'utf8',windowsHide:true});
     expect(result.status).toBe(1);expect(result.stdout+result.stderr).not.toContain(sentinel);expect(readFileSync(path.join(root,'.env.local'),'utf8')).toContain(sentinel);
   } finally {rmSync(root,{recursive:true,force:true});}
 });
});
