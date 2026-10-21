import { describe,it,expect } from 'vitest';
import { validateTarget,fingerprint,targetFetch } from './target.mjs';
import { stableId } from './adapter.mjs';
const credentials={url:'https://abcdefghijklmnopqrst.supabase.co',key:'sb_secret_synthetic_key',publishableKey:'sb_publishable_synthetic_key'};
const approval={version:1,purpose:'schovera-fictional-demo',verifiedBy:'synthetic operator',verificationEvidence:'synthetic dashboard evidence',expiresAt:'2099-01-01',mode:'hosted',projectRef:'abcdefghijklmnopqrst',url:credentials.url,allowedDemoProjectRefs:['abcdefghijklmnopqrst'],productionProjectRefs:['uvwxyzabcdefghijklmn'],secretKeySha256:fingerprint(credentials.key),publishableKeySha256:fingerprint(credentials.publishableKey)};
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
