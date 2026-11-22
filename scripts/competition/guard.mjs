import {existsSync,lstatSync,readFileSync,readdirSync} from 'node:fs';import path from 'node:path';import os from 'node:os';import {createHash} from 'node:crypto';
export const qaDirectory=path.join(os.tmpdir(),'schovera-qa-41c404875fbe43209c457a7763419c3e');
export const origin='http://127.0.0.1:3104';
export const stateFile=path.join(qaDirectory,'.local','competition','state.json');
export function reviewedDependencyVersions(manifest){const versions={next:manifest.dependencies?.next,'eslint-config-next':manifest.devDependencies?.['eslint-config-next'],zod:manifest.dependencies?.zod};if(Object.values(versions).some(v=>typeof v!=='string'||!/^\d+\.\d+\.\d+$/.test(v))||versions.next!==versions['eslint-config-next'])throw Error('Competition dependencies must use exact reviewed versions with aligned Next configuration');return versions;}
export function assertMigrationHistory(migrationFiles,appliedVersions){
 const expected=migrationFiles.map(file=>{const match=/^(\d{14})_[A-Za-z0-9_-]+\.sql$/.exec(file);if(!match)throw Error('A migration filename is outside the reviewed timestamp_name.sql format');return match[1];});
 const actual=appliedVersions.map(String);
 if(new Set(expected).size!==expected.length||new Set(actual).size!==actual.length)throw Error('Migration history contains duplicate versions; refusing startup.');
 const expectedSet=new Set(expected),actualSet=new Set(actual);
 const unapplied=[...expectedSet].filter(v=>!actualSet.has(v)).sort();
 const unknown=[...actualSet].filter(v=>!expectedSet.has(v)).sort();
 if(unapplied.length||unknown.length)throw Error(`Local database migration history differs from this source (unapplied: ${unapplied.length}, unknown: ${unknown.length}); no migration was applied automatically.`);
 return true;
}
export function safeQa(){if(!existsSync(qaDirectory)||lstatSync(qaDirectory).isSymbolicLink())throw Error('Approved isolated QA checkout unavailable; no configuration was copied.');if(existsSync(path.join(qaDirectory,'.env.local')))throw Error('QA contains .env.local; startup refused without opening it.');for(const file of ['.env.test.local','.env.development.local'])if(!existsSync(path.join(qaDirectory,file))||lstatSync(path.join(qaDirectory,file)).isSymbolicLink())throw Error('Approved QA configuration is missing or linked.');}
export function minimalEnvironment(){return {...Object.fromEntries(['PATH','Path','PATHEXT','SystemRoot','WINDIR','ComSpec','TEMP','TMP','LOCALAPPDATA','APPDATA','USERPROFILE'].filter(n=>process.env[n]).map(n=>[n,process.env[n]])),SCHOVERA_TEST_URL:origin,NEXT_TELEMETRY_DISABLED:'1'};}
export function assertOwner(state){if(state?.version!==1||state.qa!==qaDirectory||!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(state.owner??''))throw Error('Unrecognized competition ownership; preserving state.');}
export function readState(){if(!existsSync(stateFile))return null;const s=JSON.parse(readFileSync(stateFile,'utf8'));assertOwner(s);return s;}
export function sourceFingerprint(source){
 const entries=['package.json','package-lock.json'];for(const dir of ['src','scripts','supabase/migrations'])for(const file of readdirSync(path.join(source,dir),{recursive:true}))if(/\.(ts|tsx|mjs|css|json|sql)$/.test(file))entries.push(dir+'/'+file.replaceAll('\\','/'));
 const hash=createHash('sha256');for(const file of entries.sort()){const p=path.join(source,file);if(lstatSync(p).isSymbolicLink())throw Error('Linked source refused');if(!lstatSync(p).isFile())continue;hash.update(file);hash.update(readFileSync(p));}return hash.digest('hex');
}
