// Backend metadata acceptance only. No Nano, serial port or card is accessed.
import {it,expect} from 'vitest';
import {createClient} from '@supabase/supabase-js';
import {randomUUID,generateKeyPairSync} from 'node:crypto';
import {assertLocalTestEnvironment} from './lib/local-test-env.mjs';
const must=async query=>{const r=await query;if(r.error)throw Error('Synthetic Nano metadata request failed');return r.data;};
it('provisions the correct Nano type while preserving existing types, role denial and tenant boundaries',async()=>{
  assertLocalTestEnvironment();
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const options={auth:{persistSession:false,autoRefreshToken:false}};
  const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY,options),anonymous=createClient(url,key,options);
  const schools=[],users=[];const run=randomUUID(),password=`Synthetic-${randomUUID()}!aA1`;
  const pair=generateKeyPairSync('ed25519');const pem=pair.publicKey.export({type:'spki',format:'pem'}).toString();
  const args=type=>({p_label:'Synthetic metadata test only',p_hardware_type:type,p_verification_public_key:pem});
  async function actor(role,school){
    const email=`${role}-${randomUUID()}@nano-metadata.local.test`;
    const result=await admin.auth.admin.createUser({email,password,email_confirm:true});if(result.error||!result.data.user)throw Error('Synthetic account setup failed');
    const id=result.data.user.id;users.push(id);
    await must(admin.from('profiles').insert({id,school_id:school,role,email,full_name:'Synthetic metadata actor',active:true}));
    const client=createClient(url,key,options);const signed=await client.auth.signInWithPassword({email,password});if(signed.error)throw Error('Synthetic sign-in failed');return client;
  }
  try{
    for(const suffix of ['A','B'])schools.push((await must(admin.from('schools').insert({name:`Synthetic Nano metadata ${suffix}`,code:`NANO-${run}-${suffix}`}).select('id').single())).id);
    const principal=await actor('principal',schools[0]),foreign=await actor('principal',schools[1]);
    for(const client of [anonymous,await actor('teacher',schools[0]),await actor('parent',schools[0])])expect((await client.rpc('provision_school_device',args('nano_rc522'))).error).toBeTruthy();
    const ids=[];for(const type of ['nano_rc522','local_simulator','esp32_rc522','uno_r4_wifi_rc522']){
      const id=await must(principal.rpc('provision_school_device',args(type)));ids.push(id);
      const row=await must(admin.from('school_devices').select('school_id,hardware_type,active').eq('id',id).single());
      expect(row).toMatchObject({school_id:schools[0],hardware_type:type,active:true});
    }
    expect((await principal.rpc('provision_school_device',args('unsupported_reader'))).error).toBeTruthy();
    expect((await principal.rpc('provision_school_device',args(null))).error).toBeTruthy();
    expect((await foreign.rpc('revoke_school_device',{p_device_id:ids[0]})).error).toBeTruthy();
    expect((await must(admin.from('school_devices').select('id').eq('school_id',schools[0]))).length).toBe(4);
    await must(principal.rpc('revoke_school_device',{p_device_id:ids[0]}));
    expect((await must(admin.from('school_devices').select('active').eq('id',ids[0]).single())).active).toBe(false);
  }finally{
    if(schools.length){await must(admin.from('school_devices').delete().in('school_id',schools));await must(admin.from('audit_events').delete().in('school_id',schools));}
    if(users.length)await must(admin.from('profiles').delete().in('id',users));
    for(const id of users){const r=await admin.auth.admin.deleteUser(id);if(r.error)throw Error('Synthetic Auth cleanup failed');}
    if(schools.length){await must(admin.from('schools').delete().in('id',schools));expect(await must(admin.from('schools').select('id').in('id',schools))).toHaveLength(0);}
  }
},60000);
