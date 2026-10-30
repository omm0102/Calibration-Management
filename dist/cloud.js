'use strict';
// Public project information only. No database password or privileged key is shipped.
window.Cloud=(()=>{
 const config={url:'https://rftimvbmgydomkbnfalt.supabase.co',key:'sb_publishable_6yd4txzSeRLgsJUHy0qYQw_0QIpCYBC',workspace:'calibration-management'};
 const DAILY='calibration-cloud-daily-v1:';
 const SESSION='calibration-cloud-session-v1',CACHE='calibration-cloud-cache-v1:',PREFS='calibration-cloud-preferences-v1:';
 const localSettingKeys=['monthFilterMemory','registryFilters','registrySearches','internalProgressFilters','internalSortKey','internalSortDir','registryColumnsV3','registryTab'];
 let session=null,role='',revision=0,mode='login',baseline='',timer=null,inflight=null,refreshing=null,applying=false,cloudData=null,localSource=structuredClone(db),backupCandidate=null,workingKey=KEY,dataActive=false,cacheRecord=null;
 const object=v=>v&&typeof v==='object'&&!Array.isArray(v);
 const identity=()=>session?.user?.id||'';
 const tabId=sessionStorage.getItem('calibration-cloud-tab')||crypto.randomUUID();sessionStorage.setItem('calibration-cloud-tab',tabId);
 const cacheKey=()=>CACHE+config.workspace+':'+identity()+':'+tabId;
 const prefsKey=()=>PREFS+config.workspace+':'+identity();
 function parse(key,storage=localStorage){try{return JSON.parse(storage.getItem(key))}catch{return null}}
 let cacheDatabase=null,dailyReading=false,dailyRetryAt=0,cloudReads=0;
 function cacheDB(){
  if(cacheDatabase)return cacheDatabase;
  cacheDatabase=new Promise((resolve,reject)=>{const open=indexedDB.open('calibration-cloud-offline-v1',1);open.onupgradeneeded=()=>open.result.createObjectStore('documents');open.onsuccess=()=>resolve(open.result);open.onerror=()=>reject(open.error)});
  return cacheDatabase;
 }
 async function readCache(){
  const database=await cacheDB(),key=cacheKey();
  const value=await new Promise((resolve,reject)=>{const tx=database.transaction('documents','readonly'),request=tx.objectStore('documents').get(key);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)});
  cacheRecord=value||parse(key);return cacheRecord;
 }
 function writeCache(record){
  cacheRecord=structuredClone(record);const key=cacheKey(),value=cacheRecord;
  return cacheDB().then(database=>new Promise((resolve,reject)=>{const tx=database.transaction('documents','readwrite');tx.objectStore('documents').put(value,key);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('LOCAL_CACHE_FAILED'))}));
 }
 function cacheFailure(){status('本機快取無法儲存，請立即匯出備份並確認雲端儲存狀態',true)}
 const dailyKey=()=>DAILY+config.workspace+':'+identity();
 function taipeiDay(){const parts=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const values=Object.fromEntries(parts.map(p=>[p.type,p.value]));return values.year+'-'+values.month+'-'+values.day}
 function markDailyRead(){sessionStorage.setItem(dailyKey(),taipeiDay());dailyRetryAt=0}
 function safeDailyRead(){return dataActive&&!applying&&mode==='ready'&&!inflight&&!!session&&$('cloudGate').hidden&&document.visibilityState!=='hidden'&&!$('dialog').open&&page!=='report'&&!document.activeElement?.matches('input,textarea,select,iframe,[contenteditable="true"]')&&snapshot()===baseline}
 async function checkDaily(){
  if(dailyReading||Date.now()<dailyRetryAt||sessionStorage.getItem(dailyKey())===taipeiDay()||!safeDailyRead())return;
  dailyReading=true;status('');
  // The response may arrive after another page, account, or local edit has changed.
  const user=identity(),expectedRevision=revision;
  try{
   const record=await load();
   if(identity()!==user||!safeDailyRead()||revision!==expectedRevision)return;
   if(!validData(record.data))throw Error('INVALID_CALIBRATION_DATA');
   role=record.member_role;revision=Number(record.revision);applyData(record.data);baseline=snapshot();
   markDailyRead();status(role==='viewer'?'僅供檢視 · 今日雲端資料已更新':'今日雲端資料已更新');
  }catch(error){
   if(identity()===user&&dataActive){dailyRetryAt=Date.now()+5*60*1000;status('每日更新暫時失敗，稍後會重試；目前資料仍保留。'+friendly(error),true)}
  }finally{dailyReading=false;if(mode==='ready'&&$('cloudStatus').textContent==='')status('每日更新已延後，待操作結束後重試')}
 }
 function validData(d){return object(d)&&Array.isArray(d.rows)&&Array.isArray(d.manual)&&object(d.events)&&object(d.settings)&&object(d.quotes)&&object(d.reports)&&Array.isArray(d.imports)&&(d.externalVendors===undefined||(Array.isArray(d.externalVendors)&&d.externalVendors.every(v=>object(v)&&typeof v.id==='string'&&typeof v.name==='string'&&(v.cycleDays==null||(typeof v.cycleDays==='number'&&Number.isFinite(v.cycleDays)&&v.cycleDays>=0))&&['contact','contactMethod','email'].every(key=>typeof v[key]==='string'))))&&d.rows.every(r=>object(r)&&typeof r.key==='string'&&typeof r.month==='string'&&Array.isArray(r.p))}
 function shared(d){const copy=structuredClone(d);for(const key of localSettingKeys)delete copy.settings[key];return copy}
 const snapshot=()=>JSON.stringify(shared(db));
 function storePreferences(d){const prefs={};for(const key of localSettingKeys)if(d.settings[key]!==undefined)prefs[key]=d.settings[key];localStorage.setItem(prefsKey(),JSON.stringify(prefs))}
 function status(text,error=false){const n=$('cloudStatus');n.textContent=text;n.classList.toggle('is-error',error);$('cloudRetry').hidden=mode!=='error';$('cloudReload').hidden=mode!=='conflict';$('cloudAccount').textContent=session?.user?.email||'';$('cloudAccountToggle').dataset.tooltip=session?.user?.email||'登入帳號';$('cloudAccountAlert').hidden=!error;}
 function gate(title,body){toggleAccount(false);if($('dialog').open)$('dialog').close();const n=$('cloudGate');n.hidden=false;n.innerHTML=`<section class="cloud-card"><h1>${esc(title)}</h1>${body}</section>`;document.querySelector('main').inert=true;document.querySelector('aside').inert=true;$('cloudBar').inert=true;requestAnimationFrame(()=>n.querySelector('input,button')?.focus())}
 function openApp(){ $('cloudGate').hidden=true;document.querySelector('main').inert=false;document.querySelector('aside').inert=false;$('cloudBar').inert=false;}
 function loginGate(message=''){
  mode='login';status('尚未登入');
  gate('登入儀校管理',`<form id="cloudLoginForm"><label>Email<input id="cloudEmail" type="email" autocomplete="username" required></label><label>密碼<input id="cloudPassword" type="password" autocomplete="current-password" required></label><p id="cloudLoginError" class="cloud-message" role="alert">${esc(message)}</p><button class="primary" type="submit">登入</button></form>`);
  $('cloudLoginForm').onsubmit=async e=>{e.preventDefault();const button=e.currentTarget.querySelector('button');button.disabled=true;$('cloudLoginError').textContent='登入中…';try{session=await request('/auth/v1/token?grant_type=password',{email:$('cloudEmail').value.trim(),password:$('cloudPassword').value},false);saveSession();await connect()}catch(error){$('cloudLoginError').textContent=friendly(error);button.disabled=false}};
 }
 function saveSession(){session.expires_at=session.expires_at||Math.floor(Date.now()/1000)+(session.expires_in||3600);sessionStorage.setItem(SESSION,JSON.stringify(session))}
 async function request(path,body,authenticated=true,retry=true){
  if(authenticated&&(!session?.access_token))throw Error('LOGIN_REQUIRED');
  if(authenticated&&session.expires_at<Date.now()/1000+60)await refresh();
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),15000);
  let response;try{response=await fetch(config.url+path,{method:body===undefined?'GET':'POST',headers:{apikey:config.key,'Content-Type':'application/json',...(authenticated?{Authorization:'Bearer '+session.access_token}:{})},body:body===undefined?undefined:JSON.stringify(body),signal:controller.signal})}finally{clearTimeout(timeout)}
  let result;try{result=await response.json()}catch{result={}}
  if(!response.ok){if(authenticated&&response.status===401&&retry){await refresh();return request(path,body,true,false)}const error=Error(result.message||result.msg||result.error_description||result.error||'HTTP_'+response.status);error.code=result.code;throw error}
  return result;
 }
 async function refresh(){
  if(refreshing)return refreshing;
  refreshing=(async()=>{if(!session?.refresh_token)throw Error('LOGIN_REQUIRED');const next=await request('/auth/v1/token?grant_type=refresh_token',{refresh_token:session.refresh_token},false);session=next;saveSession()})();
  try{await refreshing}finally{refreshing=null}
 }
 const load=async()=>{
  cloudReads++;document.body.classList.add('cloud-reading');$('cloudStatus')?.setAttribute('aria-busy','true');
  try{const data=await request('/rest/v1/rpc/calibration_load',{p_slug:config.workspace});if(!Array.isArray(data)||!data[0])throw Error('WORKSPACE_ACCESS_DENIED');return data[0]}
  finally{cloudReads--;if(!cloudReads){document.body.classList.remove('cloud-reading');$('cloudStatus')?.removeAttribute('aria-busy')}}
 };
 function friendly(error){const text=error?.message||'';if(/REVISION_CONFLICT|40001/.test(text)||error.code==='40001')return '其他人已更新雲端資料。你的修改已保留，請先下載備份，再載入最新資料。';if(/WORKSPACE_ACCESS_DENIED|WRITE_ACCESS_DENIED/.test(text))return '這個帳號尚未取得工作區權限，請聯絡管理員。';if(/Email not confirmed/.test(text))return '這個帳號尚未驗證，請在 Supabase Authentication 確認帳號已啟用。';if(/Invalid login credentials|invalid_credentials/.test(text))return 'Email 或密碼不正確。';if(/LOGIN_REQUIRED|refresh_token|JWT|token.*expired/i.test(text))return '登入已過期，請重新登入；未同步修改仍保留在本機。';if(/PGRST202|Could not find the function/.test(text))return '找不到雲端資料表 API，請確認已執行資料庫建立腳本。';if(/INVALID_CALIBRATION_DATA/.test(text))return '資料格式不完整，尚未上傳。';if(/Abort|fetch|Network|HTTP_5/i.test(text)||error.name==='AbortError')return '無法連線雲端，修改已保留在本機。請檢查網路後重試。';return '連線失敗，請稍後重試。'+(text?'（'+text.slice(0,150)+'）':'')}
 async function connect(){
  mode='loading';status('');gate('正在連線', '<div class="cloud-loading" role="status" aria-label="雲端資料載入中"><span class="cloud-loading-spinner" aria-hidden="true"></span></div>');
  try{
   const record=await load();role=record.member_role;revision=Number(record.revision);cloudData=record.data;
   const cached=await readCache();
   if(cached?.pending&&validData(cached.data)){
    if(revision===cached.revision){applyData(cached.data);baseline=JSON.stringify(shared(record.data||cached.data));mode='ready';openApp();markDailyRead();baseline='';changed(db);return}
    gate('有尚未同步的修改',`<p>本機保留的修改與雲端版本不同，請先下載本機備份，再載入最新雲端資料。</p><button onclick="Cloud.exportPending()">下載本機未同步備份</button><button class="primary" onclick="Cloud.discardPending()">保留備份後，載入雲端</button><button onclick="Cloud.signOut()">登出</button>`);mode='conflict';return;
   }
   if(!record.data){migrationGate();return}
   if(!validData(record.data))throw Error('INVALID_CALIBRATION_DATA');
   applyData(record.data);mode='ready';baseline=snapshot();openApp();markDailyRead();status(role==='viewer'?'僅供檢視':'');
  }catch(error){mode='error';status(friendly(error),true);gate('無法讀取雲端資料',`<p class="cloud-message">${esc(friendly(error))}</p><button class="primary" onclick="Cloud.connect()">重新連線</button><button onclick="Cloud.signOut()">重新登入</button>`)}
 }
 function applyData(data){
  const wasDashboard=document.body.dataset.page==='dashboard';
  applying=true;try{
   dataActive=true;workingKey=cacheKey()+':working';db=structuredClone(data);Object.assign(db.settings,parse(prefsKey())||{});db.settings.sampleDatasetVersion=SAMPLE_VERSION;
   normalizeExternalStages();initializeMonthlyFilters();loadMonthlyFilters();storePreferences(db);page='dashboard';render();if(wasDashboard)animateDashboardEntrance();
   writeCache({data:db,revision,pending:false}).catch(cacheFailure);
  }finally{applying=false}
 }
 function migrationSource(data,stores){
  const copy=structuredClone(data);
  for(const key of ['calibrationV41.history','calibrationV41.drafts']){try{Object.assign(copy.reports,JSON.parse((stores===undefined?localStorage.getItem(key):stores[key])||'{}'))}catch{}}
  return copy;
 }
 function migrationGate(){
  mode='migration';status('尚未建立雲端資料');backupCandidate=null;
  const count=localSource.rows.length,monthCount=new Set(localSource.rows.map(r=>r.month)).size;
  gate('選擇首次移轉資料',`<p>雲端目前沒有設備資料。請在原本有資料的電腦操作，或選擇之前下載的完整備份。</p><div class="cloud-source"><strong>這個瀏覽器：${monthCount} 個月份、${count} 筆設備</strong><p>請確認是你的正式資料；此處也可能是原始 DEMO 範例。</p><button onclick="Cloud.exportOriginal()">先下載本機完整備份</button></div><label class="cloud-confirm"><input id="cloudMigrationConfirm" type="checkbox">我確認這是要移轉的資料</label><button class="primary" onclick="Cloud.migrateLocal()" ${role==='viewer'?'disabled':''}>移轉這個瀏覽器的資料</button><hr><label>或選擇完整備份檔<input type="file" id="cloudMigrationFile" accept=".json"></label><div id="cloudBackupPreview"></div><p id="cloudMigrationError" class="cloud-message" role="alert"></p><button onclick="Cloud.signOut()">登出</button>`);
  $('cloudMigrationFile').onchange=async e=>{backupCandidate=null;try{backupCandidate=await parseBackup(e.target.files[0]);$('cloudBackupPreview').innerHTML=`<p>${esc(e.target.files[0].name)}：${backupCandidate.rows.length} 筆設備</p><button class="primary" onclick="Cloud.migrateBackup()">確認移轉這份備份</button>`}catch(error){$('cloudMigrationError').textContent=error.message}};
 }
 async function parseBackup(file){if(!file)throw Error('請選擇備份檔');const b=JSON.parse(await file.text());if(b.format!=='aming-calibration'||b.version!==1||!b.payload||await hash(JSON.stringify(b.payload))!==b.checksum||!validData(b.payload.db))throw Error('備份格式或完整性檢查失敗');return migrationSource(b.payload.db,b.payload.reportStorage||{})}
 async function uploadInitial(data){
  if(role==='viewer')return;
  const button=$('cloudGate').querySelectorAll('button');button.forEach(n=>n.disabled=true);
  try{const next=await request('/rest/v1/rpc/calibration_save',{p_slug:config.workspace,p_expected_revision:0,p_data:shared(data)});revision=Number(next);applyData(data);mode='ready';baseline=snapshot();openApp();markDailyRead();status('移轉完成')}
  catch(error){$('cloudMigrationError').textContent=friendly(error);button.forEach(n=>n.disabled=false)}
 }
 async function migrateLocal(){if(!$('cloudMigrationConfirm').checked){$('cloudMigrationError').textContent='請先確認資料來源';return}await uploadInitial(migrationSource(localSource))}
 async function migrateBackup(){if(backupCandidate)await uploadInitial(backupCandidate)}
 function changed(data){
  if(!dataActive||applying||!['ready','saving','error','conflict'].includes(mode)||!session||!role)return;
  storePreferences(data);
  const text=snapshot();if(text===baseline)return;
  if(role==='viewer'){status('僅供檢視：修改不會上傳',true);return}
  writeCache({data,revision,pending:true}).catch(cacheFailure);
  if(mode==='conflict')return;
  status('有修改待儲存');clearTimeout(timer);timer=setTimeout(flush,650);
 }
 async function flush(){
  clearTimeout(timer);if(!dataActive||inflight||!['ready','error'].includes(mode)||!session||role==='viewer')return inflight;
  const text=snapshot();if(text===baseline){mode='ready';status('');return}
  mode='saving';status('儲存中…');
  inflight=(async()=>{try{
   const next=await request('/rest/v1/rpc/calibration_save',{p_slug:config.workspace,p_expected_revision:revision,p_data:JSON.parse(text)});
   revision=Number(next);baseline=text;mode='ready';await writeCache({data:db,revision,pending:snapshot()!==baseline});status('');
  }catch(error){mode=error.code==='40001'||/REVISION_CONFLICT/.test(error.message)?'conflict':'error';status(friendly(error),true)}})();
  try{await inflight}finally{inflight=null}
  if(mode==='ready'&&snapshot()!==baseline){clearTimeout(timer);timer=setTimeout(flush,150)}
 }
 function exportData(data){const payload={db:data,reportStorage:{}},raw=JSON.stringify(payload);hash(raw).then(checksum=>download(JSON.stringify({format:'aming-calibration',version:1,createdAt:new Date().toISOString(),checksum,payload}),'儀校資料備份_'+today()+'.json'))}
 function exportPending(){exportData(cacheRecord?.data||db)}
 function exportOriginal(){exportData(migrationSource(localSource))}
 async function discardPending(){
  // Explicit, custom confirmation protects unsynced data from accidental loss.
  gate('載入最新雲端資料？',`<p>本機尚未同步的修改會從工作畫面移除，請先下載備份。雲端資料不會被覆蓋。</p><button onclick="Cloud.exportPending()">下載本機未同步備份</button><button class="primary" onclick="Cloud.confirmReload()">確認載入最新資料</button><button onclick="Cloud.cancelReload()">取消</button>`);
 }
 async function confirmReload(){try{const record=await load();if(!validData(record.data))throw Error('INVALID_CALIBRATION_DATA');role=record.member_role;revision=Number(record.revision);applyData(record.data);baseline=snapshot();mode='ready';openApp();markDailyRead();status(role==='viewer'?'僅供檢視':'已載入最新雲端資料')}catch(error){status(friendly(error),true);gate('載入失敗',`<p>${esc(friendly(error))}</p><button onclick="Cloud.confirmReload()">重試</button><button onclick="Cloud.cancelReload()">返回</button>`)}}
 function cancelReload(){if(mode==='conflict'&&$('cloudGate').innerText.includes('工作畫面')){openApp();status('雲端版本衝突，修改仍保留於本機',true)}else connect()}
 async function reload(){if(inflight)await inflight;if(snapshot()!==baseline){await discardPending();return}try{const record=await load();if(snapshot()!==baseline||inflight){status('有新的本機修改，請完成儲存後再載入雲端');return}if(!validData(record.data))throw Error('INVALID_CALIBRATION_DATA');role=record.member_role;revision=Number(record.revision);applyData(record.data);baseline=snapshot();markDailyRead();status(role==='viewer'?'僅供檢視':'已載入最新雲端資料')}catch(error){mode='error';status(friendly(error),true)}}
 async function restoreBackup(file){if(role==='viewer')return;try{const data=await parseBackup(file);modal('確認還原到雲端',`<p>這份備份有 ${data.rows.length} 筆設備。還原會取代共用工作區的資料，其他使用者也會看到變更。建議先匯出現有完整備份。</p>`,async()=>{closeModal();applyData(data);mode='ready';baseline='';changed(db);await flush()},'確認還原')}catch(error){toast(error.message)}}
 async function signOut(force=false){
  if(inflight)await inflight;
  if(!force&&session&&role!=='viewer'&&cacheRecord?.pending){gate('仍有尚未同步的修改',`<p>修改會保留於此瀏覽器，重新登入同一帳號後可繼續處理。請先下載備份。</p><button onclick="Cloud.exportPending()">下載未同步備份</button><button onclick="Cloud.signOut(true)">仍要登出</button><button onclick="Cloud.cancelReload()">返回</button>`);return}
  clearTimeout(timer);if(session?.access_token){try{await request('/auth/v1/logout',{},true,false)}catch{}}
  session=null;sessionStorage.removeItem(SESSION);role='';dataActive=false;loginGate();
 }
 function reportKey(key){return key+':cloud:'+config.workspace+':'+identity()}
 function persistData(data){if(workingKey===KEY)localStorage.setItem(KEY,JSON.stringify(data));changed(data)}
 function allowWrite(event){if(role!=='viewer'||$('cloudGate').hidden===false)return;const element=event.target.closest('button,input,select,textarea');if(!element)return;const handler=(element.getAttribute('onclick')||'')+' '+(element.getAttribute('onchange')||'');const edit=/editEquipment|deleteEquipment|editVendorInfo|deleteVendorInfo|importExcel|appendEquipment|editManual|deleteManual|toggleEvent|bulkProgress|window.step|schedule\(|changeMode|mode\(|saveMonthly|restore\(/.test(handler)||element.matches('textarea,#monthly-external-total');if(edit){event.preventDefault();event.stopImmediatePropagation();toast('此帳號僅供檢視')}}
 function toggleAccount(open){const panel=$('cloudAccountPanel');if(!panel)return;const show=typeof open==='boolean'?open:panel.hidden;panel.hidden=!show;$('cloudAccountToggle').setAttribute('aria-expanded',String(show));hideNavigationTooltip()}
 document.addEventListener('click',event=>{if(!event.target.closest('#cloudBar'))toggleAccount(false)});
 document.addEventListener('keydown',event=>{if(event.key==='Escape')toggleAccount(false)});
 async function start(){
  document.body.classList.add('cloud-enabled');
  document.querySelector('aside').insertAdjacentHTML('beforeend',`<div id="cloudBar" class="cloud-bar cloud-rail-account"><button id="cloudAccountToggle" class="cloud-account-trigger" aria-label="帳號與雲端操作" aria-expanded="false" aria-controls="cloudAccountPanel" data-tooltip="登入帳號" onclick="Cloud.toggleAccount()"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 22v-3a8 8 0 0 1 16 0v3"/></svg><i id="cloudAccountAlert" class="cloud-account-alert" hidden></i></button><section id="cloudAccountPanel" class="cloud-account-panel" hidden aria-label="登入帳號與雲端操作"><strong id="cloudAccount"></strong><span id="cloudStatus" role="status"></span><button id="cloudRetry" hidden onclick="Cloud.flush()">重試儲存</button><button id="cloudReload" hidden onclick="Cloud.discardPending()">處理版本衝突</button><button onclick="Cloud.reload()">重新整理雲端</button><button onclick="Cloud.signOut()">登出</button></section></div>`);
  document.body.insertAdjacentHTML('beforeend','<div id="cloudGate" class="cloud-gate"></div>');
  document.addEventListener('click',allowWrite,true);document.addEventListener('change',allowWrite,true);document.addEventListener('beforeinput',allowWrite,true);
  session=parse(SESSION,sessionStorage);if(session?.access_token)await connect();else loginGate();
 }
 window.addEventListener('online',()=>{dailyRetryAt=0;if(mode==='error'&&role)flush();checkDaily()});
 window.addEventListener('focus',()=>checkDaily());
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')checkDaily()});
 setInterval(()=>checkDaily(),60000);
 window.addEventListener('beforeunload',e=>{if(session&&role!=='viewer'&&cacheRecord?.pending){e.preventDefault();e.returnValue=''}});
 return{start,toggleAccount,changed,persistData,reportKey,checkDaily,connect,flush,reload,signOut,migrateLocal,migrateBackup,exportPending,exportOriginal,discardPending,confirmReload,cancelReload,restoreBackup,isConnected:()=>!!session&&!!role,canWrite:()=>role==='admin'||role==='editor'};
})();
Cloud.start();
