// Hosted-mode browser rehearsal, entirely loopback. Never a cloud acceptance tool.
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createServer as httpServer, request as httpRequest } from 'node:http';
import { createServer as httpsServer } from 'node:https';
import { chromium } from 'playwright';
import { assertLocalTestEnvironment } from './lib/local-test-env.mjs';
import { hostedBuildFixture, validateHostedDemoEnvironment } from '../src/lib/demo-deployment-policy.mjs';
import { readPresentationSource } from './online-demo/source.mjs';

assertLocalTestEnvironment();
if(existsSync('.env.local')) throw new Error('Clean isolated checkout required; private environment file not opened');
const args=process.argv.slice(2);
if(args.length!==2 || args[0]!=='--source-worktree') throw new Error('Supply the owned fictional presentation checkout with --source-worktree');
const source=path.resolve(args[1]);
const fixture=readPresentationSource(source);
const openssl=process.env.SCHOVERA_TEST_OPENSSL || 'C:/Program Files/Git/usr/bin/openssl.exe';
if(!existsSync(openssl)) throw new Error('Local HTTPS test requires an installed OpenSSL binary; no installation attempted');
const directory=mkdtempSync(path.join(tmpdir(),'schovera-https-preflight-'));
const key=path.join(directory,'localhost.key'),cert=path.join(directory,'localhost.pem');
let server,child,browser;let phase='initialization';
const errors=[],external=[],leaks=[],routes={teacher:['home','students','profile','attendance','homework','timetable','ai','notices'],parent:['home','profile','updates','attendance','homework','timetable','notices'],principal:['home','students','communication','attendance','homework','timetable','notices']};
const screenshots=path.resolve('.local/schovera-rfid-gateway/task32s-browser');mkdirSync(screenshots,{recursive:true});
try {
  const signed=spawnSync(openssl,['req','-x509','-newkey','rsa:2048','-nodes','-keyout',key,'-out',cert,'-days','1','-subj','/CN=localhost','-addext','subjectAltName=IP:127.0.0.1,DNS:localhost'],{windowsHide:true,stdio:'ignore'});
  assert.equal(signed.status,0,'Local certificate generation failed');
  const probe=httpServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
  const env=Object.fromEntries(['PATH','Path','PATHEXT','SystemRoot','WINDIR','ComSpec','TEMP','TMP'].flatMap(k=>process.env[k]?[[k,process.env[k]]]:[]));
  Object.assign(env,hostedBuildFixture,{NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,NEXT_TELEMETRY_DISABLED:'1',SCHOVERA_HOSTED_SECRET_SENTINEL:'synthetic_hosted_private_sentinel'});
  validateHostedDemoEnvironment(env);
  child=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--hostname','127.0.0.1','--port',String(port)],{env,windowsHide:true,stdio:['ignore','pipe','pipe']});
  let ready=false;const logs=[];
  child.stdout.on('data',b=>{const s=b.toString();if(s.includes('Ready in'))ready=true;logs.push(s);});child.stderr.on('data',b=>logs.push(b.toString()));
  for(let i=0;!ready&&i<120;i++){if(child.exitCode!==null)throw new Error('Hosted-mode local server exited before ready');await new Promise(r=>setTimeout(r,500));}
  assert.ok(ready,'Hosted-mode local startup timeout');
  server=httpsServer({key:readFileSync(key),cert:readFileSync(cert)},(req,res)=>{
    const upstream=httpRequest({hostname:'127.0.0.1',port,path:req.url,method:req.method,headers:{...req.headers,host:`127.0.0.1:${port}`}},response=>{res.writeHead(response.statusCode,response.headers);response.pipe(res);});
    upstream.on('error',()=>{res.writeHead(502);res.end();});req.pipe(upstream);
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`https://127.0.0.1:${server.address().port}`;
  browser=await chromium.launch({headless:true});
  for(const role of ['teacher','parent','principal']) {
    phase=`${role} login`;
    const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1440,height:1000}});
    // The declared cloud URL is a fixed synthetic fixture. Every HTTP request to
    // it is intercepted BEFORE delivery and fulfilled only by local Supabase.
    await context.route('**/*',async route=>{
      const url=new URL(route.request().url());
      if(url.origin===hostedBuildFixture.NEXT_PUBLIC_SUPABASE_URL){const local=new URL(url.pathname+url.search,process.env.NEXT_PUBLIC_SUPABASE_URL);const response=await route.fetch({url:local.href,maxRedirects:0});return route.fulfill({response,headers:{...response.headers(),'access-control-allow-origin':base,'access-control-allow-credentials':'true'}});}
      if(url.origin===base || ['data:','blob:','about:'].includes(url.protocol))return route.continue();
      external.push(url.hostname);return route.abort();
    });
    // Do not let a synthetic hostname open a real remote WebSocket. This test
    // uses persisted reads/manual refresh; Realtime is covered by local suites.
    await context.routeWebSocket('**/*',ws=>ws.close());
    const scans=[];const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
    page.on('response',response=>{if(response.request().resourceType()==='script')scans.push(response.body().then(b=>{if([process.env.SUPABASE_SERVICE_ROLE_KEY,'synthetic_hosted_private_sentinel'].some(v=>v&&b.includes(Buffer.from(v))))leaks.push('private material in script');}).catch(()=>{}));});
    const initial=await page.goto(base,{waitUntil:'networkidle'});assert.equal(initial.headers()['x-robots-tag'],'noindex, nofollow, noarchive');assert.equal(initial.headers()['referrer-policy'],'no-referrer');assert.equal(initial.headers()['x-frame-options'],'DENY');
    await page.getByLabel('Email').fill(fixture.accounts[role].email);await page.getByLabel('Password',{exact:true}).fill(fixture.accounts[role].password);await page.getByRole('button',{name:'Sign in securely'}).click();await page.locator(`.role-${role}`).waitFor({timeout:45000});
    await page.getByText('Schovera Model School — Demo Campus',{exact:true}).first().waitFor();
    const cookies=(await context.cookies()).filter(c=>c.name.includes('auth-token'));assert.ok(cookies.length);assert.ok(cookies.every(c=>c.secure&&c.sameSite==='Lax'),'Hosted auth cookies must be Secure/SameSite');
    await page.reload({waitUntil:'networkidle'});await page.locator(`.role-${role}`).waitFor();
    for(const section of routes[role]) {
      phase=`${role}/${section}`;
      await page.goto(`${base}/${role}/${section}`,{waitUntil:'networkidle'});await page.locator(`.role-${role}`).waitFor();
      if(role==='teacher'&&section==='ai'){await page.getByRole('button',{name:'Generate a draft',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Generate a draft',exact:true}).isDisabled(),true);}
      if(role==='parent'&&section==='notices'){await page.getByTestId('hosted-fallback-example').waitFor();assert.equal(await page.getByTestId('fallback-preferences').count(),0);}
      if(role==='parent'&&section==='home'){await page.locator('.child-switcher select').selectOption(fixture.students[10].id);await page.locator('#parent-child-heading').getByText('Vihaan Shinde',{exact:true}).waitFor();await page.locator('.child-switcher select').selectOption(fixture.students[0].id);}
      for(const width of [390,768,1024,1440]){await page.setViewportSize({width,height:1000});await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${role}/${section}/${width} overflow`);}
    }
    await page.screenshot({path:path.join(screenshots,`${role}-hosted-1440.png`),fullPage:true});
    if(role==='teacher')for(const endpoint of ['teacher-ai','device/v1/events','device/v2/events','device/v2/capabilities','device/v2/capability-keys','fallback-simulator']){const status=await page.evaluate(async endpoint=>(await fetch(`/api/${endpoint}`,{method:'POST',headers:{'content-type':'application/json'},body:'{}'})).status,endpoint);assert.equal(status,endpoint==='teacher-ai'?503:404);}
    await page.getByRole('button',{name:'Sign out',exact:true}).click();await page.getByLabel('Email').waitFor();await page.reload({waitUntil:'networkidle'});await page.getByLabel('Email').waitFor();assert.equal(await page.locator(`.role-${role}`).count(),0);
    await Promise.all(scans);await context.close();console.log(`${role}: local HTTPS login/session persistence/logout, guarded features and responsive destinations passed`);
  }
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);assert.deepEqual(leaks,[]);
  writeFileSync(path.join(screenshots,'result.json'),JSON.stringify({passed:true,localSelfSignedHttps:true,cloudVerified:false,routes:22,widths:4,audio:'NOT VERIFIED',secretScan:'passed',realtime:'blocked here; independently tested locally'},null,2));
  console.log('Hosted-mode rehearsal passed: loopback HTTPS proxy + intercepted synthetic database origin only; no remote acceptance claimed.');
} catch(error) {
  throw new Error(`Local hosted rehearsal failed at ${phase} (${error.name}); credential-bearing Playwright call logs suppressed.`);
} finally {
  await browser?.close();if(server)await new Promise(r=>server.close(r));
  if(child&&child.exitCode===null){const stopped=new Promise(r=>child.once('exit',r));if(process.platform==='win32')spawnSync('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});else child.kill();await stopped;}
  const resolved=path.resolve(directory),parent=path.resolve(tmpdir());
  if(path.dirname(resolved)!==parent||!path.basename(resolved).startsWith('schovera-https-preflight-'))throw new Error('Unsafe generated certificate cleanup path');
  rmSync(resolved,{recursive:true,force:true});
}
