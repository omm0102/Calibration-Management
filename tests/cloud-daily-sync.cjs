const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');const assert=require('assert');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:1440,height:900},timezoneId:'America/Los_Angeles'});
 const sample={version:1,rows:Array.from({length:50},(_,i)=>({key:'row-'+i,id:'TEST-'+i,name:'設備 '+i,asset:String(i),type:'內校',month:'2026-10',due:'2026-10-31',date:'2026-10-30',p:[true,false,false],unit:'A',owner:'Owner'})),manual:[],events:{},quotes:{},reports:{},imports:[],settings:{sampleDatasetVersion:'real-20261022',fixedScheduleStart:'2026-10'}};
 let server=structuredClone(sample),revision=1,reads=0,fail=false,delay=false,release=null;
 await context.route('https://rftimvbmgydomkbnfalt.supabase.co/**',async route=>{
  const path=new URL(route.request().url()).pathname;
  const reply=(body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
  if(path==='/auth/v1/token')return reply({access_token:'test-access-token',refresh_token:'test-refresh-token',expires_in:3600,user:{id:'daily-test-user',email:'daily@example.test'}});
  if(path.endsWith('calibration_load')){reads++;if(fail)return route.abort('failed');const result=[{data:structuredClone(server),revision,member_role:'admin'}];if(delay)await new Promise(resolve=>release=resolve);return reply(result)}
  if(path.endsWith('calibration_save')){const body=route.request().postDataJSON();if(body.p_expected_revision!==revision)return reply({message:'REVISION_CONFLICT',code:'40001'},400);server=body.p_data;return reply(++revision)}
  if(path==='/auth/v1/logout')return reply({});throw Error('Unexpected path '+path);
 });
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(process.env.APP_TEST_URL||'http://127.0.0.1:8008');await page.locator('#cloudEmail').fill('daily@example.test');await page.locator('#cloudPassword').fill('test');await page.locator('#cloudLoginForm button').click();await page.waitForFunction(()=>document.getElementById('cloudGate').hidden);
 const marker='calibration-cloud-daily-v1:calibration-management:daily-test-user';
 const due=()=>page.evaluate(key=>sessionStorage.removeItem(key),marker);
 const check=()=>page.evaluate(()=>Cloud.checkDaily());
 assert.equal(reads,1);await check();assert.equal(reads,1);
 const savedDay=await page.evaluate(key=>sessionStorage.getItem(key),marker);const taipeiDay=await page.evaluate(()=>{const parts=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()),p=Object.fromEntries(parts.map(x=>[x.type,x.value]));return p.year+'-'+p.month+'-'+p.day});assert.equal(savedDay,taipeiDay);
 await page.evaluate(()=>{month='2026-10';go('registry');document.querySelector('.tablewrap').scrollTop=130});
 server.rows[0].name='更新後設備';revision++;await due();await check();assert.equal(reads,2);assert.equal(await page.evaluate(()=>page),'dashboard');assert.equal(await page.evaluate(()=>month),'2026-10');assert.equal(await page.evaluate(()=>db.rows[0].name),'更新後設備');assert.equal(await page.locator('.dashboard-card').count(),5);assert.deepEqual(await page.locator('.dashboard-grid>.dashboard-card').evaluateAll(nodes=>nodes.map(n=>n.getAnimations()[0]?.effect.getTiming().delay)),[0,100,200,300,400]);assert(await page.locator('.dashboard-grid>.dashboard-card').evaluateAll(nodes=>nodes.every(n=>n.getAnimations()[0].effect.getKeyframes().every(k=>k.opacity===undefined))));await check();assert.equal(reads,2);
 // Editing controls, dialogs, unsaved edits and report editing postpone the daily read.
 await due();await page.evaluate(()=>go('registry'));await page.locator('.search').first().focus();await check();assert.equal(reads,2);await page.evaluate(()=>document.activeElement.blur());
 await page.evaluate(()=>modal('測試','<p>編輯中</p>',null));await check();assert.equal(reads,2);await page.evaluate(()=>closeModal());
 await page.evaluate(()=>{db.rows[0].name='尚未儲存';persist()});await check();assert.equal(reads,2);await page.evaluate(()=>Cloud.flush());
 await page.evaluate(()=>go('report'));await page.waitForSelector('#reportframe:not(.report-initializing)');await check();assert.equal(reads,2);await page.evaluate(()=>go('registry'));await page.evaluate(()=>Cloud.flush());
 await check();assert.equal(reads,3);
 // A response that arrives after a local edit must not overwrite that edit.
 await due();delay=true;const pending=check();await page.waitForFunction(()=>document.getElementById('cloudStatus'));while(!release)await new Promise(r=>setTimeout(r,10));await page.evaluate(()=>{db.rows[0].name='讀取期間的修改';persist()});release();release=null;await pending;delay=false;assert.equal(await page.evaluate(()=>db.rows[0].name),'讀取期間的修改');await page.evaluate(()=>Cloud.flush());
 // Failures retain the page, do not mark the day complete, and throttle repeat fetches.
 await due();fail=true;const before=reads;await check();assert.equal(reads,before+1);assert.equal(await page.evaluate(key=>sessionStorage.getItem(key),marker),null);assert.equal(await page.evaluate(()=>db.rows[0].name),'讀取期間的修改');await check();assert.equal(reads,before+1);fail=false;await page.evaluate(()=>window.dispatchEvent(new Event('online')));await page.waitForFunction(key=>!!sessionStorage.getItem(key),marker);assert.equal(reads,before+2);
 await page.emulateMedia({reducedMotion:'reduce'});await due();await check();assert.equal(await page.locator('.dashboard-grid>.dashboard-card').evaluateAll(nodes=>nodes.reduce((sum,n)=>sum+n.getAnimations().length,0)),0);
 assert.deepEqual(errors,[]);console.log('PASS once per Taipei day, dashboard landing/month preservation, edit deferral, stale response protection, failed-read backoff and online recovery');await browser.close();
})().catch(error=>{console.error(error);process.exitCode=1});
