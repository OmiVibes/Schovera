import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {assertLocalTestEnvironment} from './lib/local-test-env.mjs';
assertLocalTestEnvironment(process.env,{requireServiceRole:false});
const base=process.env.SCHOVERA_TEST_URL||'http://127.0.0.1:3104';
assert.ok(['127.0.0.1','localhost','[::1]'].includes(new URL(base).hostname));
const destinations={parent:['home','profile','updates','attendance','homework','timetable','notices'],teacher:['home','students','profile','attendance','homework','timetable','ai','notices'],principal:['home','students','users','communication','attendance','homework','timetable','notices']};
const output='.local/ui58-responsive';await mkdir(output,{recursive:true});
const result={layouts:[],expanded:[],localizedHeaders:[],contrast:[],manualContrast:[],errors:[],external:[],notes:['Text contrast uses rendered solid backgrounds, visible HTML text and WCAG AA size thresholds. Gradients, SVG charts, disabled/transparent controls and other states need separate review.']};
const browser=await chromium.launch();
try{
 for(const [role,routes] of Object.entries(destinations)){
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  await context.route('**/*',route=>{const url=new URL(route.request().url());if(['data:','blob:'].includes(url.protocol)||['localhost','127.0.0.1','[::1]'].includes(url.hostname))return route.continue();result.external.push(url.hostname);return route.abort();});
  const page=await context.newPage();page.setDefaultTimeout(30000);page.on('pageerror',error=>result.errors.push({role,message:error.message}));
  await page.goto(base);await page.locator('input[autocomplete=username]').fill(`${role}@schovera.demo`);await page.locator('input[type=password]').fill(process.env.SCHOVERA_DEMO_PASSWORD||'SchoveraDemo2026!');await page.getByRole('button',{name:'Sign in securely'}).click();await page.locator(`.role-${role}`).waitFor();
  for(const section of routes){
   await page.goto(`${base}/${role}/${section}`,{waitUntil:'networkidle'});await page.locator('nav.app-section-nav').waitFor();await page.waitForFunction(()=>!document.querySelector('.skeleton,.notice-skeleton,.principal-communication-skeleton'));
   for(const width of [320,360,390,414,768,1024,1440,1920]){
    await page.setViewportSize({width,height:1000});await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
    const geometry=await page.evaluate(()=>({viewport:innerWidth,document:document.documentElement.scrollWidth,active:(()=>{const r=document.querySelector('.app-section-nav a[aria-current=page]')?.getBoundingClientRect();return r?{left:r.left,right:r.right,height:r.height}:null;})()}));
    result.layouts.push({role,section,width,...geometry});
    const counterColors = await page.evaluate(() => {
      const failures=[];
      for(const value of document.querySelectorAll('.attendance-counts b')) {
        const status=value.parentElement.textContent.replace(value.textContent,'').trim().toLowerCase();
        if(!['present','absent','late'].includes(status))continue;
        const expected=document.createElement('span');expected.style.color=`var(--status-${status})`;document.body.append(expected);
        const color=getComputedStyle(expected).color;expected.remove();
        if(getComputedStyle(value).color!==color)failures.push({status,actual:getComputedStyle(value).color,expected:color});
      }
      return failures;
    });
    result.errors.push(...counterColors.map(colors=>({role,section,width,counterColors:colors})));
    if(section==='notices'&&width===1440){
      const important=page.locator('.school-notice-card.important-notice').first();
      if(!await important.count())throw new Error(`${role}: expected the protected school's Important notice for hover verification.`);
      await page.mouse.move(0,0);
      const style=el=>({border:getComputedStyle(el).borderLeftColor,transform:getComputedStyle(el).transform});
      const before=await important.evaluate(style);await important.hover();await page.waitForTimeout(220);
      const after=await important.evaluate(style);
      if(before.border!==after.border||before.transform!==after.transform)result.errors.push({role,section,width,priorityHover:{before,after}});
    }
    if(section==='attendance'&&width===1440){
      if(role==='teacher'){await page.locator('#teacher-attendance-history > summary').click();await page.locator('.attendance-trends[data-loaded=true]').waitFor();}
      const colors=await page.evaluate(()=>['present','absent'].map(status=>{
        const ring=document.querySelector('.attendance-ring-segment.'+status),legend=document.querySelector('.attendance-mix-legend .'+status);
        return {status,stroke:ring?getComputedStyle(ring).stroke:null,swatch:legend?getComputedStyle(legend).backgroundColor:null};
      }));
      for(const color of colors)if(color.stroke&&color.swatch&&color.stroke!==color.swatch)result.errors.push({role,section,legendMismatch:color});
      if(role==='teacher')await page.locator('#teacher-attendance-history > summary').click();
    }
    if(geometry.document>width+1)result.errors.push({role,section,width,overflow:geometry.document});
    if(width<=820&&(!geometry.active||geometry.active.left<0||geometry.active.right>width+1||geometry.active.height<44))result.errors.push({role,section,width,activeNavigation:geometry.active});
    if(role==='teacher'&&section==='home'&&[1440,390,320].includes(width)){
      const disclosure=page.locator('#teacher-home-notices');
      await disclosure.locator(':scope > summary').click();await disclosure.locator('.school-notice-card').first().waitFor();
      const expanded=await disclosure.evaluate(el=>({width:el.getBoundingClientRect().width,parent:el.closest('.teacher-home-stack').getBoundingClientRect().width,minimumCard:Math.min(...[...el.querySelectorAll('.school-notice-card')].map(card=>card.getBoundingClientRect().width))}));
      result.expanded.push({role,section,width,...expanded});
      if(expanded.width<expanded.parent*.9||expanded.minimumCard<(width>820?280:180))result.errors.push({role,section,width,narrowExpandedNotices:expanded});
      await disclosure.locator(':scope > summary').click();
    }
    if(section==='homework'&&[390,320].includes(width)){
      const titles=await page.locator('.assignment-card header h3').evaluateAll(nodes=>nodes.map(n=>({text:n.textContent,width:n.getBoundingClientRect().width})));
      result.expanded.push({role,section,width,homeworkTitles:titles});
      if(titles.some(t=>t.width<100))result.errors.push({role,section,width,narrowHomeworkTitles:titles});
    }
    if([1440,390].includes(width)){
     const contrast=await page.evaluate(()=>{
      const parse=s=>{const m=s.match(/[\d.]+/g);return m?[Number(m[0]),Number(m[1]),Number(m[2]),m[3]===undefined?1:Number(m[3])]:null;};
      const lum=c=>c.slice(0,3).map(v=>{const s=v/255;return s<=.04045?s/12.92:((s+.055)/1.055)**2.4;}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
      const found=[],seen=new Set(),manual=[];const walker=document.createTreeWalker(document.querySelector('main'),NodeFilter.SHOW_TEXT);let n;
      while((n=walker.nextNode())){
       const el=n.parentElement,text=n.textContent.trim();if(!text||!el||el.closest('svg,script,style,option,[aria-hidden=true],button:disabled,input:disabled'))continue;
       if(!el.checkVisibility({checkOpacity:true,checkVisibilityCSS:true})||el.getBoundingClientRect().width===0)continue;
       const style=getComputedStyle(el),color=parse(style.color);if(!color||color[3]!==1)continue;
       const chain=[];let transparent=false,gradient=false;for(let p=el;p;p=p.parentElement){const st=getComputedStyle(p);if(Number(st.opacity)<1)transparent=true;if(st.backgroundImage!=='none')gradient=true;chain.push(st.backgroundColor);}
       if(transparent)continue;if(gradient){manual.push(el.className);continue;}
       let bg=[255,255,255];for(const s of chain.reverse()){const c=parse(s);if(c)bg=bg.map((v,i)=>c[i]*c[3]+v*(1-c[3]));}
       const a=lum(color),b=lum(bg),ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05),size=parseFloat(style.fontSize),weight=parseInt(style.fontWeight)||400,threshold=size>=24||(size>=18.66&&weight>=700)?3:4.5;
       const key=el.className+'|'+style.color+'|'+bg.join(',');if(ratio+.01<threshold&&!seen.has(key)){seen.add(key);found.push({tag:el.tagName,cls:el.className,text:text.slice(0,90),color:style.color,bg:bg.map(Math.round),ratio:Math.round(ratio*100)/100,threshold});}
      }return {found,manual:[...new Set(manual)].slice(0,10)};
     });
     result.contrast.push(...contrast.found.map(item=>({role,section,width,...item})));result.manualContrast.push(...contrast.manual.map(cls=>({role,section,width,cls})));
    }
   }
   console.log(`Measured ${role}/${section} at eight widths.`);
  }
  for(const language of ['hi','mr']){
    await page.locator('.language-selector select').selectOption(language);
    for(const width of [320,390]){
      await page.setViewportSize({width,height:1000});
      const header=await page.locator('.account-actions').evaluate(el=>{const box=el.getBoundingClientRect(),chip=el.querySelector('.role-chip');return {left:box.left,right:box.right,document:document.documentElement.scrollWidth,chipHeight:chip&&getComputedStyle(chip).display!=='none'?chip.getBoundingClientRect().height:0};});
      result.localizedHeaders.push({role,language,width,...header});
      if(header.left<0||header.right>width+1||header.document>width+1||header.chipHeight>40)result.errors.push({role,language,width,localizedHeader:header});
    }
  }
  await context.close();
 }
}catch(error){result.errors.push({failure:error.message});}
finally{await browser.close();await writeFile(`${output}/results.json`,JSON.stringify(result,null,2));}
console.log(JSON.stringify({layouts:result.layouts.length,layoutOrRuntimeErrors:result.errors.length,contrastFindings:result.contrast.length,external:result.external.length}));
if(result.errors.length||result.contrast.length||result.external.length)process.exitCode=1;
