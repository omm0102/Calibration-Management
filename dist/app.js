'use strict';
const $=id=>document.getElementById(id), esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const iso=d=>new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10), today=()=>iso(new Date()), add=(s,n)=>{let d=new Date(s+'T12:00:00');d.setDate(d.getDate()+n);return iso(d)}, uid=()=>Array.from(crypto.getRandomValues(new Uint8Array(16)),x=>x.toString(16).padStart(2,'0')).join('');
const KEY='aming-calibration-demo-v1';let page='dashboard',month=today().slice(0,7),tab='內校',query='',status='all',offset=0,calendarMonth='',selectedWeek=false;
const nav=[['量測設備校驗管理',[['dashboard','總覽儀表板','▦'],['calendar','行事曆','▦'],['registry','設備管理清冊','▤'],['report','設備管理月報','▧']]],['外校管理',[['external','外校進度','◷'],['vendors','外校廠商資訊','▤'],['cost','外校金額','＄']]],['內校管理',[['internal','內校進度','◴']]],['其他功能',[['import','資料匯入管理','↥'],['backup','備份與還原','⧉']]]];
const SAMPLE_VERSION='real-20261022';
function seed(){
 const rows=structuredClone(CALIBRATION_SAMPLE).map(r=>({...r,key:uid()}));
 return{version:1,rows,manual:[],events:{},quotes:{},reports:{},settings:{sampleDatasetVersion:SAMPLE_VERSION,importColumns:[...CALIBRATION_SAMPLE_COLUMNS]},imports:[{file:'量測監控設備清冊 (1).xlsx',months:[...new Set(rows.map(r=>r.month))],count:rows.length,at:new Date().toLocaleString('zh-TW')}]};
}
function legacyDemoEquipment(r){
 const i=Number(String(r.asset).replace('FA-',''))-2001;
 if(!Number.isInteger(i)||i<0||i>=28||!['2026-09','2026-10','2026-11'].includes(r.month))return false;
 const id=(i<18?'A-'+String(1+Math.floor(i/3)).padStart(2,'0'):'E-'+String(1+Math.floor((i-18)/2)).padStart(2,'0'))+'-'+String(i%3+1).padStart(3,'0');
 return r.id===id&&r.name===['數位游標卡尺','外徑分厘卡','千分表','高度規','花崗岩平台','溫濕度計','壓力錶'][i%7]&&!Object.keys(r.extra||{}).length;
}
function migrateSampleData(){
 if(db.settings.sampleDatasetVersion===SAMPLE_VERSION)return;
 const archiveKey=KEY+'-before-real-sample-v1';
 if(!localStorage.getItem(archiveKey))localStorage.setItem(archiveKey,JSON.stringify(db));
 if(!db.imports.length){
  const removed=new Set(db.rows.filter(legacyDemoEquipment).map(r=>r.key));
  db.rows=db.rows.filter(r=>!removed.has(r.key));
  const existing=new Set(db.rows.map(r=>r.month+'|'+r.id));
  const sample=seed();db.rows.push(...sample.rows.filter(r=>!existing.has(r.month+'|'+r.id)));
  for(const [id,state]of Object.entries(db.events))if(state.signature?.split(',').some(key=>removed.has(key)))delete db.events[id];
  for(const [m,values]of Object.entries({'2026-10':{'亞諾士':12500,'昭俐科技':8600},'2026-09':{'亞諾士':14300,'昭俐科技':7200}})){
   for(const [vendor,value]of Object.entries(values))if(db.quotes[m]?.[vendor]===value)delete db.quotes[m][vendor];
  }
  db.imports=sample.imports;
 }
 db.manual=db.manual.filter(e=>!((e.name==='確認報價'&&e.note==='與廠商確認本月外校報價')||(e.name==='核對設備資料'&&!e.start&&!e.note)));
 db.settings.sampleDatasetVersion=SAMPLE_VERSION;
}
let db;try{db=JSON.parse(localStorage.getItem(KEY))||seed()}catch{db=seed()};if(!db.rows)db=seed();
migrateSampleData();
normalizeExternalStages();
function normalizeExternalStages(){
 for(const r of db.rows)if(r.type==='外校'&&r.mode==='寄出'&&r.date)r.shippedDate=r.date;
 for(const r of db.rows)if(r.type==='外校'&&(r.mode||'收件')==='收件'){r.receiptDate=r.date||''}
 for(const r of db.rows)if(r.type==='外校'&&r.externalStageVersion!==2){
  if(r.p.length<6){const old=r.p;r.p=[!!old[0],!!old[1],!!old[2],false,!!old[3],!!old[4]]}
  r.externalStageVersion=2;
 }
 for(const r of db.rows)if(['外校','遊校'].includes(r.type)){
  const last=r.type==='外校'?5:3;
  if(r.calibrationCompletionVersion!==1){if(!r.calibrationDate&&r.p[last]&&r.completed)r.calibrationDate=r.completed;r.calibrationCompletionVersion=1}
  r.p[last]=!!r.calibrationDate;r.completed=r.calibrationDate||'';
 }
}
function monthlyFilterMemory(key=month){
 db.settings.monthFilterMemory??={};
 return db.settings.monthFilterMemory[key]??={registryFilters:{},registrySearches:{},internalProgressFilters:{},internalSortKey:'date',internalSortDir:1,registrySortKey:'id',registrySortDir:1};
}
function initializeMonthlyFilters(){
 if(!db.settings.monthFilterMemory){
  const state=monthlyFilterMemory();
  Object.assign(state,{registryFilters:db.settings.registryFilters||{},registrySearches:db.settings.registrySearches||{},internalProgressFilters:db.settings.internalProgressFilters||{},internalSortKey:db.settings.internalSortKey||'date',internalSortDir:db.settings.internalSortDir||1});
 }
}
initializeMonthlyFilters();
let filterMemoryMonth=month;
function saveMonthlyFilters(){
 const state=monthlyFilterMemory(filterMemoryMonth);
 Object.assign(state,{registryFilters,internalProgressFilters,internalSortKey,internalSortDir,registrySortKey:sortKey,registrySortDir:sortDir});
}
function loadMonthlyFilters(){
 const state=monthlyFilterMemory();filterMemoryMonth=month;
 registryFilters=state.registryFilters;internalProgressFilters=state.internalProgressFilters;
 internalSortKey=state.internalSortKey;internalSortDir=state.internalSortDir;sortKey=state.registrySortKey;sortDir=state.registrySortDir;
 internalRegistryQuery=state.registrySearches['內校']||'';
 query=page==='registry'?(state.registrySearches[tab]||''):page==='internal'?(state.internalSearch||''):'';
}
function persist(){if(window.Cloud)Cloud.persistData(db);else localStorage.setItem(KEY,JSON.stringify(db))}function save(){persist();render()}function toast(t){$('toast').textContent=t;$('toast').classList.add('visible');setTimeout(()=>$('toast').classList.remove('visible'),2500)}
const rows=()=>db.rows.filter(r=>r.month===month);const months=()=>[...new Set(db.rows.map(r=>r.month))].sort();const complete=r=>r.type==='內校'?!!r.p[2]:!!r.calibrationDate;const stages=r=>r.type==='內校'?['預計校驗日','收件確認','已完成']:r.type==='外校'?['已提供報價單','請購單','外送單','設備確認','寄出／收件時間','校驗日期']:['已提供報價單','請購單','遊校日期','校驗日期'];
tab=db.settings.registryTab||tab;
let internalRegistryQuery=monthlyFilterMemory().registrySearches['內校']||'';
function go(p){if(page==='registry'&&tab==='內校')internalRegistryQuery=query;page=p;hideNavigationTooltip();query=p==='registry'?(monthlyFilterMemory().registrySearches[tab]||''):p==='internal'?(monthlyFilterMemory().internalSearch||''):'';status='all';render()}window.go=go;
function missingExternalVendorMonths(){return [...new Set(db.rows.filter(r=>['外校','遊校'].includes(r.type)&&!String(r.vendor??'').trim()).map(r=>String(r.month||'')))].sort()}
function hasMissingExternalVendor(){return missingExternalVendorMonths().length>0}
function missingExternalVendorNotice(){return missingExternalVendorMonths().map(m=>/^\d{4}-(0[1-9]|1[0-2])$/.test(m)?m.slice(0,4)+'年'+Number(m.slice(5))+'月':m||'未指定月份').join('、')+'外校設備未填寫廠商'}
function sidebarIcon(id){
 const shapes={
  dashboard:'<rect x="3" y="3" width="11" height="11" rx="2"/><rect x="18" y="3" width="11" height="17" rx="2"/><rect x="3" y="18" width="11" height="11" rx="2"/><path d="M18 25h11v4H18z"/>',
  calendar:'<rect x="3" y="5" width="26" height="25" rx="4"/><path d="M3 12h26M10 2v7M22 2v7"/><text x="16" y="25" text-anchor="middle" fill="currentColor" stroke="none" font-size="14" font-weight="800">31</text>',
  registry:'<rect x="6" y="6" width="20" height="24" rx="2"/><path d="M11 6V4h3a2 2 0 0 1 4 0h3v4H11zM11 14h10M11 20h10M11 26h10"/>',
  report:'<path d="M3 28h27M6 28v-7h4v7m4 0V16h4v12m4 0V10h4v18M4 17l8-8 7 4L28 3M22 3h6v6"/>',
  internal:'<path d="M6 2h15l6 6v22H6zM21 2v7h6M10 13l2 2 3-4m3 3h5M10 20l2 2 3-4m3 3h5M10 27l2 2 3-4m3 3h5"/>',
  vendors:'<path d="M3 30h26M7 30V9h18v21M11 9V3h10v6M11 14h2m6 0h2m-10 5h2m6 0h2M13 30v-6h6v6"/>',
  cost:'<ellipse cx="10" cy="11" rx="7" ry="3"/><path d="M3 11v13c0 2 3 3 7 3M3 17c1 1 3 2 5 2M19 5v5m10-5v13c0 2-3 3-6 3"/><ellipse cx="23" cy="5" rx="6" ry="3"/><path d="M23 11c3 0 5-1 6-2M25 16l4-1"/><circle cx="17" cy="22" r="8"/><path d="M20 18h-4a2 2 0 0 0 0 4h2a2 2 0 0 1 0 4h-4m3-10v12"/>',
  import:'<path d="M16 20V4M9 11l7-7 7 7M4 21v8h24v-8"/>',
  backup:'<path d="M27 13A12 12 0 0 0 14 4V1L7 6l7 5V7M5 19a12 12 0 0 0 13 9v3l7-5-7-5v4M5 11l-1 2m0 3v1m24 3-1 2m-1 3-1 1"/>'
 };
 return `<svg class="sidebar-icon" viewBox="0 0 32 32" width="21" height="21" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${shapes[id==='external'?'internal':id]||''}</svg>`;
}
function updateSidebarIndicator(previous){
 const nav=$('nav'),active=nav.querySelector('button.active');if(!active)return;
 nav.querySelector('.sidebar-active-indicator')?.remove();
 const indicator=document.createElement('span');indicator.className='sidebar-active-indicator';indicator.setAttribute('aria-hidden','true');nav.prepend(indicator);
 const bounds=active.getBoundingClientRect(),base=nav.getBoundingClientRect();
 Object.assign(indicator.style,{left:(bounds.left-base.left+nav.scrollLeft)+'px',top:(bounds.top-base.top+nav.scrollTop)+'px',width:bounds.width+'px',height:bounds.height+'px'});
 if(previous&&!matchMedia('(prefers-reduced-motion: reduce)').matches){indicator.animate([{transform:`translate(${previous.left-bounds.left}px,${previous.top-bounds.top}px)`,width:previous.width+'px',height:previous.height+'px'},{transform:'translate(0,0)',width:bounds.width+'px',height:bounds.height+'px'}],{duration:200,easing:'ease-in-out'})}
}
function capturePageScroll(){
 const positions=[];
 for(const element of document.body.querySelectorAll('*'))if(element.scrollTop||element.scrollLeft){
  const path=[];let node=element;
  while(node&&node!==document.body){path.unshift([...node.parentElement.children].indexOf(node));node=node.parentElement}
  positions.push({path,top:element.scrollTop,left:element.scrollLeft});
 }
 return {x:window.scrollX,y:window.scrollY,positions};
}
function restorePageScroll(state){
 for(const position of state.positions){let node=document.body;for(const index of position.path){node=node?.children[index];if(!node)break}if(node){node.scrollTop=position.top;node.scrollLeft=position.left}}
 window.scrollTo({left:state.x,top:state.y,behavior:'instant'});
}
function render(){
 normalizeExternalStages();
 if(filterMemoryMonth!==month){saveMonthlyFilters();loadMonthlyFilters()}
 const memory=monthlyFilterMemory();
 if(page==='registry'){memory.registrySearches[tab]=query;db.settings.registryTab=tab;internalRegistryQuery=memory.registrySearches['內校']||''}
 if(page==='internal')memory.internalSearch=query;
 saveMonthlyFilters();persist();
 const previousPage=document.body.dataset.page;
 const scroll=previousPage===page?capturePageScroll():null;
 if(previousPage&&previousPage!==page)holdPageTransition()
 renderPage();if(scroll)restorePageScroll(scroll);
 if(page==='dashboard'&&previousPage!==page)animateDashboardEntrance();
 if(previousPage&&previousPage!==page&&page!=='report')revealPageTransition();
}
let pageTransitionCover=null,pageSlideAnimation=null;
function clearPageTransition(){pageTransitionCover?.remove();pageTransitionCover=null}
function holdPageTransition(){
 clearPageTransition();pageSlideAnimation?.cancel();pageSlideAnimation=null;
 const main=document.querySelector('main'),rect=main.getBoundingClientRect(),cover=main.cloneNode(true);
 const layout=getComputedStyle(main);cover.style.display=layout.display;cover.style.flexDirection=layout.flexDirection;
 const header=main.querySelector('header'),headerCopy=cover.querySelector('header');if(header&&headerCopy){const style=getComputedStyle(header);for(const key of ['display','gridTemplateColumns','gap','paddingLeft','minHeight'])headerCopy.style[key]=style[key]}
 cover.removeAttribute('id');cover.querySelectorAll('[id]').forEach(el=>el.removeAttribute('id'));cover.setAttribute('aria-hidden','true');cover.inert=true;
 cover.className='page-transition-cover';
 Object.assign(cover.style,{position:'fixed',inset:'auto',left:rect.left+'px',top:rect.top+'px',width:rect.width+'px',height:rect.height+'px',margin:'0',overflow:'hidden',zIndex:'40',pointerEvents:'none',background:'var(--color-canvas)'});
 document.body.append(cover);pageTransitionCover=cover;
}
function revealPageTransition(){
 if(!pageTransitionCover)return;
 clearPageTransition();
 if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
 pageSlideAnimation=document.querySelector('main').animate([{transform:'translateY(8px)'},{transform:'translateY(0)'}],{duration:800,easing:'cubic-bezier(.2,.7,.2,1)'});
}
function hideNavigationTooltip(){const tooltip=$('navigationTooltip');if(tooltip)tooltip.hidden=true}
function showNavigationTooltip(button){const tooltip=$('navigationTooltip'),rect=button.getBoundingClientRect();tooltip.textContent=button.dataset.tooltip;tooltip.hidden=false;tooltip.style.left=(rect.right+12)+'px';tooltip.style.top=Math.max(8,Math.min(innerHeight-tooltip.offsetHeight-8,rect.top+(rect.height-tooltip.offsetHeight)/2))+'px'}
document.addEventListener('mouseover',e=>{const button=e.target.closest('#nav button[data-tooltip],#cloudAccountToggle[data-tooltip]');if(button)showNavigationTooltip(button);else hideNavigationTooltip()});
document.addEventListener('focusin',e=>{const button=e.target.closest('#nav button[data-tooltip],#cloudAccountToggle[data-tooltip]');if(button)showNavigationTooltip(button);else hideNavigationTooltip()});
document.addEventListener('keydown',e=>{if(e.key==='Escape')hideNavigationTooltip()});
window.addEventListener('scroll',hideNavigationTooltip,true);
function dashboardCardClick(event,target){if(!event.target.closest('button,input,select,a'))go(target)}
function dashboardCardKey(event,target){if(event.target===event.currentTarget&&['Enter',' '].includes(event.key)){event.preventDefault();go(target)}}
function dashboardDate(date){calendarMonth=date.slice(0,7);go('calendar');showDay(date)}
function moveDashboardMonth(delta){const date=new Date(month+'-01T12:00:00');date.setMonth(date.getMonth()+delta);month=iso(date).slice(0,7);render()}
function dashboardCost(){costYear=month.slice(0,4);costEntryMonth=month.slice(5);go('cost')}
function hasMissingRegistryData(){return rows().some(r=>r.type==='外校'&&!String(r.vendor??'').trim())}
function titleWarning(message){return `<span class="title-warning" role="img" aria-label="${esc(message)}" title="${esc(message)}">!!!</span>`}
function dashboardMonthlyCosts(year){
 const missing=year==='2026'?Array.from({length:9},(_,i)=>year+'-'+String(i+1).padStart(2,'0')).filter(key=>!hasMonthlyCost(key)):[];
 const remaining=missing.length?unallocatedHistoricalCost():0,base=Math.floor(remaining/(missing.length||1)),remainder=remaining-base*missing.length;
 return Array.from({length:12},(_,i)=>{const key=year+'-'+String(i+1).padStart(2,'0'),index=missing.indexOf(key);return{key,value:index>=0?base+(index<remainder?1:0):sumCost(key),estimated:index>=0}});
}
function dashboardCostChart(){
 const data=dashboardMonthlyCosts(month.slice(0,4)),max=Math.max(1,...data.map(d=>d.value));
 return `<div class="dashboard-cost-chart" role="img" aria-label="${month.slice(0,4)}年每月外校費用長條圖"><div class="dashboard-cost-bars">${data.map((d,i)=>`<div class="dashboard-cost-column" title="${i+1}月：NT$ ${d.value.toLocaleString()}${d.estimated?'（平均分攤）':''}"><span class="dashboard-bar-value">${d.value.toLocaleString()}</span><div class="dashboard-bar-area"><i style="height:${d.value/max*100}%" class="${d.key===month?'selected-month':''}"></i></div><span class="dashboard-bar-month">${i+1}月</span></div>`).join('')}</div></div>${data.some(d=>d.estimated)?'<div class="dashboard-chart-note">1–9 月未分月費用採平均分攤</div>':''}`;
}

function animateDashboardEntrance(){
 if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
 document.querySelectorAll('.dashboard-grid>.dashboard-card').forEach((card,index)=>{
  card.dataset.entranceDelay=String(index*100);
  card.animate([{transform:'translateY(48px)',visibility:'hidden'},{transform:'translateY(48px)',visibility:'visible',offset:0.001},{transform:'translateY(0)',visibility:'visible'}],{duration:800,delay:index*100,easing:'cubic-bezier(.2,.7,.2,1)',fill:'backwards'});
 });
 animateDashboardCharts();
}
function animateDashboardCharts(){
 if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
 document.querySelectorAll('.dashboard-ring-value').forEach(circle=>{
  circle.animate([{strokeDasharray:'0 100'},{strokeDasharray:circle.getAttribute('stroke-dasharray')}],{duration:800,delay:Number(circle.closest('.dashboard-card')?.dataset.entranceDelay||0)+180,easing:'cubic-bezier(.2,.7,.2,1)',fill:'backwards'});
 });
 document.querySelectorAll('.dashboard-bar-area i').forEach((bar,index)=>{
  bar.animate([{transform:'scaleY(0)'},{transform:'scaleY(1)'}],{duration:650,delay:Number(bar.closest('.dashboard-card')?.dataset.entranceDelay||0)+180+index*12,easing:'cubic-bezier(.2,.7,.2,1)',fill:'backwards'});
 });
}
function renderDashboard(){
 const active=rows().filter(r=>!inactiveEquipment(r)),inside=active.filter(r=>r.type==='內校'),insideProgress=inside.filter(r=>matchesInternalProgressScope(r)&&equipmentMatchesQuery(r,monthlyFilterMemory().internalSearch||'')&&internalProgressMatches(r)),outside=active.filter(r=>['外校','遊校'].includes(r.type));
 const events=allEvents(),tomorrow=add(today(),1);
 const ordered=items=>items.sort((a,b)=>({external:0,internal:1,manual:2}[a.type]??2)-({external:0,internal:1,manual:2}[b.type]??2));
 const at=date=>ordered(events.filter(e=>!e.done&&e.start&&e.start<=date&&e.end>=date));
 const late=ordered(events.filter(e=>!e.done&&e.end&&e.end<today())).sort((a,b)=>a.end.localeCompare(b.end));
 const list=(items,empty,overdue=false)=>items.length?items.slice(0,1).map(e=>`<button class="dashboard-event ${eventVisualType(e)}" onclick="dashboardDate('${esc(e.start||today())}')"><span>${esc(e.name)}</span>${overdue?`<small>${esc(e.end.slice(5).replace('-','/')+' 到期')}</small>`:''}</button>`).join('')+(items.length>1?`<button class="dashboard-more" onclick="go('calendar')">查看全部 ${items.length} 項 →</button>`:''):`<p class="dashboard-empty">${empty}</p>`;
 const progress=(label,items,target)=>{const n=items.filter(complete).length,p=items.length?(n===items.length?100:Math.min(99,Math.round(n/items.length*100))):0;return `<button class="dashboard-progress dashboard-ring-progress ${target} ${items.length&&n===items.length?'is-complete':''}" onclick="go('${target}')" aria-label="${label}已完成 ${n} / ${items.length} 台，${p}%"><span class="dashboard-ring"><svg viewBox="0 0 120 120" aria-hidden="true"><circle class="dashboard-ring-track" cx="60" cy="60" r="50"/><circle class="dashboard-ring-value" cx="60" cy="60" r="50" pathLength="100" stroke-dasharray="${p} 100"/></svg><strong>${p}<small>%</small></strong></span><span class="dashboard-ring-label">${label}</span></button>`};
 const first=month+'-01',weekday=new Date(first+'T12:00:00').getDay(),count=new Date(Number(month.slice(0,4)),Number(month.slice(5)),0).getDate();
 $('content').innerHTML=`<div class="dashboard-grid">
 <section class="dashboard-card dashboard-overview" tabindex="0" role="link" onclick="dashboardCardClick(event,'registry')" onkeydown="dashboardCardKey(event,'registry')"><div class="dashboard-card-heading"><h2>本月設備概況${hasMissingRegistryData()?titleWarning('本月外校設備未填寫廠商'):''}</h2></div><button class="dashboard-total" onclick="go('registry')"><span>預計校驗總數</span><strong>${active.length}<small>台</small></strong></button><div class="dashboard-split"><button onclick="go('internal')"><span>內校</span><b>${inside.length}</b></button><button onclick="go('external')"><span>外校／遊校</span><b>${outside.length}</b></button></div></section>
 <section class="dashboard-card dashboard-calibration" tabindex="0" role="link" onclick="dashboardCardClick(event,'internal')" onkeydown="dashboardCardKey(event,'internal')"><div class="dashboard-card-heading"><h2>校驗進度</h2></div><div class="dashboard-progress-rings">${progress('內校',insideProgress,'internal')}${progress('外校／遊校',outside,'external')}</div></section>
 <section class="dashboard-card dashboard-calendar" tabindex="0" role="link" onclick="dashboardCardClick(event,'calendar')" onkeydown="dashboardCardKey(event,'calendar')"><div class="dashboard-card-heading"><h2>${Number(month.slice(5))}月 <small>${month.slice(0,4)}</small></h2></div><div class="dashboard-mini-calendar">${['日','一','二','三','四','五','六'].map(x=>`<span class="mini-weekday">${x}</span>`).join('')}${'<span></span>'.repeat(weekday)}${Array.from({length:count},(_,i)=>{const date=month+'-'+String(i+1).padStart(2,'0'),ev=eventsForDay(events,date),types=[...new Set(ev.map(e=>e.done?'completed':eventVisualType(e)))],holiday=taiwanCalendarDay(date);return `<button class="mini-day ${types.length?'has-events':''} ${date===today()?'is-today':''} ${holiday.holiday?'is-holiday':''}" style="--event-ring:var(--color-${({external:'warning',tour:'tour',internal:'accent',manual:'manual',completed:'complete-border'})[types[0]]||'border'})" data-date="${date}" title="${esc(date+(holiday.label?' '+shortHolidayLabel(holiday.label):'')+' · '+(ev.length?ev.map(e=>e.name).join('、'):'沒有行程'))}" onclick="dashboardDate('${date}')"><span>${i+1}</span><i>${types.map(t=>`<b class="${t}"></b>`).join('')}</i></button>`}).join('')}</div><div class="dashboard-legend"><span><i class="external"></i>外校</span><span><i class="tour"></i>遊校</span><span><i class="internal"></i>內校</span><span><i class="manual"></i>其他</span><span><i class="completed"></i>已完成</span></div></section>
 <section class="dashboard-card dashboard-agenda" tabindex="0" role="link" onclick="dashboardCardClick(event,'calendar')" onkeydown="dashboardCardKey(event,'calendar')"><div class="dashboard-agenda-part"><div class="dashboard-card-heading"><h2>今日待辦</h2></div>${list(at(today()),'今日沒有待辦事項')}</div><div class="dashboard-agenda-part"><div class="dashboard-card-heading"><h2>明日預計行程</h2></div>${list(at(tomorrow),'明日尚無預計行程')}</div><div class="dashboard-agenda-part"><div class="dashboard-card-heading"><h2>逾期提醒${late.length?titleWarning('有逾期未完成事項'):''}</h2></div>${list(late,'目前沒有逾期事項',true)}</div></section>
 <button class="dashboard-card dashboard-fees" onclick="dashboardCost()"><div class="dashboard-card-heading"><h2>外校費用${!hasMonthlyCost(month)?titleWarning('本月外校費用尚未輸入'):''}</h2></div><span class="dashboard-label">本月外校費用</span>${hasMonthlyCost(month)?`<strong>NT$ ${sumCost(month).toLocaleString()}</strong>`:'<strong class="dashboard-unentered">尚未輸入</strong>'}<div class="dashboard-annual"><span>外校年度費用</span><b>NT$ ${annualExternalCost(month.slice(0,4)+'-12').toLocaleString()}</b></div>${dashboardCostChart()}</button>

 </div>`;
}

function renderPage(){const previousNavRect=$('nav').querySelector('button.active')?.getBoundingClientRect();document.body.dataset.page=page;closeRegistryFilter();let ms=months();if(!['report','dashboard','vendors'].includes(page)&&!ms.includes(month))month=ms.includes(today().slice(0,7))?today().slice(0,7):ms.at(-1)||'';if(filterMemoryMonth!==month){saveMonthlyFilters();loadMonthlyFilters()}$('nav').innerHTML=nav.map(([g,items])=>`<div class="navgroup"><label>${g}</label>${items.map(([id,t,ic])=>`<button class="${page===id?'active':''} ${id==='registry'?'registry-nav-button':''}" aria-label="${esc(t)}" data-tooltip="${esc(t)}" ${page===id?'aria-current="page"':''} onclick="go('${id}')">${sidebarIcon(id)}<span class="sidebar-label">${t}</span>${id==='registry'&&hasMissingExternalVendor()?`<span class="registry-warning-badge" role="img" aria-label="${esc(missingExternalVendorNotice())}" title="${esc(missingExternalVendorNotice())}">!!!</span>`:''}</button>`).join('')}</div>`).join('');updateSidebarIndicator(previousNavRect);$('title').textContent=nav.flatMap(n=>n[1]).find(n=>n[0]===page)[1];if(page==='registry'&&hasMissingRegistryData())$('title').insertAdjacentHTML('beforeend',titleWarning('本月外校設備未填寫廠商'));$('monthbox').innerHTML=page==='dashboard'?`<div class="dashboard-month-navigation"><button class="arrow-icon-button" aria-label="上一個月" onclick="moveDashboardMonth(-1)"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 6-6 6 6 6"/></svg></button><span aria-live="polite">${month.slice(0,4)}年${Number(month.slice(5))}月</span><button class="arrow-icon-button" aria-label="下一個月" onclick="moveDashboardMonth(1)"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg></button></div>`:!['calendar','import','backup','registry','report','external','cost','internal','vendors'].includes(page)?`<select onchange="month=this.value;render()" ${ms.length?'':'disabled'}>${[...new Set([...ms,month])].filter(Boolean).sort().map(m=>`<option ${m===month?'selected':''}>${m}</option>`).join('')}</select>`:'';({dashboard:renderDashboard,calendar:renderCalendar,registry:renderRegistry,external:renderProgress,internal:renderProgress,cost:renderCost,vendors:renderVendorInfo,report:renderReport,import:renderImport,backup:renderBackup}[page])()}
// Fixed monthly tasks start in the month this feature is first enabled.
function taiwanCalendarDay(date){
 const calendar=window.TAIWAN_OFFICE_CALENDAR,covered=!!calendar?.years.includes(Number(date.slice(0,4))),record=calendar?.days[date],weekday=new Date(date+'T12:00:00').getDay();
 if(covered)return {holiday:record?record[0]:false,label:record?.[1]||'',covered:true};
 return {holiday:weekday===0||weekday===6,label:'',covered:false};
}
function shortHolidayLabel(label){
 const names={'開國紀念日':'元旦','和平紀念日':'228','兒童節及民族掃墓節':'兒童／清明','兒童節':'兒童節','清明節':'清明','勞動節':'勞動節','孔子誕辰紀念日':'教師節','孔子誕辰紀念日/教師節':'教師節','臺灣光復暨金門古寧頭大捷紀念日':'光復節','行憲紀念日':'行憲日','農曆除夕':'除夕','補行上班':'補班','調整上班':'補班','國慶日':'國慶','中秋節':'中秋','端午節':'端午'};
 return names[label]||label;
}
function secondWeekLastWorkingDay(key){
 // Use the Monday–Sunday week containing the month's second Friday.
 const [year,month]=key.split('-').map(Number),first=new Date(year,month-1,1,12),friday=iso(new Date(year,month-1,1+(5-first.getDay()+7)%7+7,12));
 for(let offset=2;offset>=-4;offset--){const date=add(friday,offset);if(!taiwanCalendarDay(date).holiday)return date}
 return '';
}
function monthWorkingDay(key,last=false){
 const [year,month]=key.split('-').map(Number),count=new Date(year,month,0,12).getDate();
 for(let i=0;i<count;i++){const date=key+'-'+String(last?count-i:i+1).padStart(2,'0');if(!taiwanCalendarDay(date).holiday)return date}
 return '';
}
function fixedMonthlyEvents(){
 if(!db.settings.fixedScheduleStart){db.settings.fixedScheduleStart=today().slice(0,7);persist()}
 const start=db.settings.fixedScheduleStart;
 const base=new Date(today()+'T12:00:00');
 const visibleEnd=calendarMonth?calendarMonth:add(today(),-base.getDay()-7+Math.floor((offset+1)/5)*35+34).slice(0,7);
 const end=[today().slice(0,7),visibleEnd].sort().at(-1);
 const events=[];
 for(let m=start;m<=end;){
  const [year,month]=m.split('-').map(Number);
  const rules=[['monthly-report','校驗管理月報',monthWorkingDay(m)],['monthly-internal-upload','上傳本月內校清單',monthWorkingDay(m)],['monthly-external-upload','上傳下月外校清單',monthWorkingDay(m)],['monthly-progress','確認本月校驗進度',monthWorkingDay(m,true)]];
  for(const [rule,name,date]of rules){
   if(!date)continue;
   const id='fixed|'+m+'|'+rule,signature='fixed-v1',state=db.events[id];
   events.push({id,name,start:date,end:date,type:'manual',auto:true,signature,done:state?.signature===signature?state.done||'':'',actionDate:state?.signature===signature?state.actionDate||'':'',note:'每月固定行程'});
  }
  m=iso(new Date(year,month,1,12)).slice(0,7);
 }
 return events;
}
function allEvents(){let map={};for(let r of db.rows){if(!r.date||(r.type==='內校'&&!matchesInternalProgressScope(r)))continue;let type=r.type==='內校'?'internal':'external',name=type==='internal'?r.id.replace(/-[^-]+$/,''):r.type==='遊校'?'遊校_'+(r.vendor||'未指定廠商'):'外校'+r.mode+'_'+(r.vendor||'未指定廠商');let key=[r.month,r.date,name].join('|');if(!map[key])map[key]={id:key,name,start:r.date,end:r.date,type,rows:[],auto:true};map[key].rows.push(r)}return [...Object.values(map).map(e=>{let signature=e.rows.map(r=>r.key).sort().join(',');let s=db.events[e.id];if(s?.signature!==signature)s={};let sent=e.name.startsWith('外校寄出_')&&e.start<=today();return{...e,signature,done:s.done||(sent?e.start:''),actionDate:s.actionDate||'',note:''}}),...db.manual.map(e=>({...e,type:'manual',auto:false})),...fixedMonthlyEvents()]}
function eventVisualType(e){return e.type==='external'&&(e.rows?.some(r=>r.type==='遊校')||e.name?.startsWith('遊校_'))?'tour':e.type}
function eventClass(e){return(e.done&&e.done>e.end&&e.end||!e.done&&e.end&&e.end<today()?'late':eventVisualType(e))+(e.done?' done':'')}
function eventAt(e,d){
 // Completed overdue items leave every original date, including multi-day schedules.
 if(e.done&&e.end&&e.done>e.end)return d===e.done;
 return !!e.start&&d>=e.start&&d<=e.end;
}
function eventsForDay(events,date){
 const groups=new Map(),result=[];
 for(const event of events.filter(e=>eventAt(e,date))){
  // Group equipment schedules for display; keep their original completion records independent.
  if(!event.auto||!event.rows){result.push(event);continue}
  const key=JSON.stringify([event.type,event.name]);
  if(!groups.has(key))groups.set(key,[]);
  groups.get(key).push(event);
 }
 for(const members of groups.values()){
  const representative=members.find(e=>!e.done)||members[0];
  const rows=members.flatMap(e=>e.rows.map(r=>({...r,calendarDone:!!e.done})));
  rows.sort((a,b)=>Number(a.calendarDone)-Number(b.calendarDone));
  result.push({...representative,rows,done:members.every(e=>e.done)?representative.done:''});
 }
 const order={external:0,internal:1,manual:2};
 return result.sort((a,b)=>Number(!!a.done)-Number(!!b.done)||(order[a.type]??2)-(order[b.type]??2));
}
function moveCalendarWeek(direction){calendarMonth='';offset+=direction;selectedWeek=true;render()}
function resetCalendarToday(){offset=0;calendarMonth='';selectedWeek=false;render()}
function toggleEvent(id,source=''){
 const e=allEvents().find(e=>e.id===id);if(!e)return;
 if(e.done){
  const previous=db.events[id];
  for(const snapshot of previous?.internalProgressBefore||[]){
   const row=db.rows.find(r=>r.key===snapshot.key);
   if(row&&row.completed===previous.done&&row.p.slice(0,stages(row).length).every(Boolean)){row.p=snapshot.p;row.completed=snapshot.completed}
  }
  if(e.auto)delete db.events[id];
  else Object.assign(db.manual.find(x=>x.id===id),{done:'',actionDate:''});
 }else{
  const completion={done:today(),actionDate:today()};
  if(source==='today'&&e.auto&&e.type==='internal'&&e.start<=today()&&e.end>=today()){
   completion.internalProgressBefore=[];
   for(const equipment of e.rows||[]){
    const row=db.rows.find(r=>r.key===equipment.key);if(!row||inactiveEquipment(row))continue;
    completion.internalProgressBefore.push({key:row.key,p:[...row.p],completed:row.completed||''});
    row.p=stages(row).map(()=>true);row.completed=today();
   }
  }
  if(e.auto)db.events[id]={...completion,signature:e.signature};
  else Object.assign(db.manual.find(x=>x.id===id),completion);
 }
 save();
}
function todo(e,late=false){return `<div class="todo ${eventClass(e)}"><button type="button" data-event-id="${esc(e.id)}" class="todo-name ${e.done?'done':''}" aria-pressed="${!!e.done}" title="${e.done?'點擊取消完成':'點擊標示完成'}" onclick="toggleEvent('${esc(e.id)}','${late?'overdue':'today'}')">${esc(e.name)}</button>${late?`<small>${e.start.slice(5).replace('-','/')}${e.end!==e.start?'–'+e.end.slice(5).replace('-','/'):''}</small>`:''}</div>`}

function renderCalendarContent(){let d=new Date(today()+'T12:00:00'),start=add(today(),-d.getDay()-7+Math.floor((offset+1)/5)*35),count=35;if(calendarMonth){let first=calendarMonth+'-01',f=new Date(first+'T12:00:00'),last=new Date(f.getFullYear(),f.getMonth()+1,0).getDate();start=add(first,-f.getDay());count=Math.ceil((f.getDay()+last)/7)*7}let focusStart=add(today(),-d.getDay()+offset*7),focusEnd=add(focusStart,6),displayMonth=calendarMonth||today().slice(0,7);let events=allEvents(),onToday=events.filter(e=>e.start&&today()>=e.start&&today()<=e.end&&(!e.done||e.actionDate===today())),late=events.filter(e=>e.end&&e.end<today()&&(!e.done||e.done===today())).sort((a,b)=>Number(!!a.done)-Number(!!b.done)||a.end.localeCompare(b.end));$('content').innerHTML=`<div class="calendar-workspace"><div class="toolbar calendar-toolbar"><button class="arrow-icon-button" aria-label="上一週" onclick="moveCalendarWeek(-1)"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 6-6 6 6 6"/></svg></button><input aria-label="月曆年月" type="month" value="${displayMonth}" onchange="calendarMonth=this.value;selectedWeek=false;offset=0;render()"><button class="arrow-icon-button" aria-label="下一週" onclick="moveCalendarWeek(1)"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg></button><button onclick="resetCalendarToday()">今日</button><span class="spacer"></span><button class="primary" onclick="editManual(null,today())">＋ 新增行程</button></div><div class="cal-layout"><div class="calendar" style="--calendar-weeks:${count/7}">${['日','一','二','三','四','五','六'].map(s=>`<div class="weekday">${s}</div>`).join('')}${Array.from({length:count},(_,i)=>{let date=add(start,i),holiday=taiwanCalendarDay(date),n=new Date(date+'T12:00:00').getDate(),inSelectedWeek=selectedWeek&&date>=focusStart&&date<=focusEnd;return `<div data-date="${date}" class="day ${holiday.holiday?'weekend is-holiday':''} ${!selectedWeek&&date===today()?'today':''} ${date.slice(0,7)!==displayMonth?'other-month':''} ${inSelectedWeek?'selected-week':''} ${inSelectedWeek&&date===focusStart?'week-start':''} ${inSelectedWeek&&date===focusEnd?'week-end':''}" title="${esc(date+(holiday.label?' · '+holiday.label:'')+(!holiday.covered?'（該年國定假日資料尚未載入）':''))}" onclick="showDay('${date}')"><div class="daynum"><span>${n}</span>${holiday.label?`<span class="holiday-label">${esc(shortHolidayLabel(holiday.label))}</span>`:''}</div>${eventsForDay(events,date).map(e=>`<div class="event ${eventClass(e)}">${esc(e.name)}</div>`).join('')}</div>`}).join('')}</div><div class="right-rail"><section class="panel"><div class="section-head"><h2>待辦事項</h2><button class="todo-add" onclick="editManual(null,'')" aria-label="新增待辦事項"><span aria-hidden="true">＋</span></button></div>${[['external','外校'],['internal','內校'],['manual','其他']].map(([k,t])=>{const items=onToday.filter(e=>e.type===k&&!e.done);return `<div class="todo-category ${items.length?'':'is-empty'}"><h3 class="muted">${t}</h3>${items.map(e=>todo(e)).join('')||'<div class="empty">目前沒有事項</div>'}</div>`}).join('')}<div class="divider"></div><h3>其他事項</h3>${events.filter(e=>!e.start&&!e.done).map(e=>todo(e)).join('')||'<div class="empty">目前沒有事項</div>'}${[...onToday,...events.filter(e=>!e.start&&e.actionDate===today())].some(e=>e.done)?`<div class="divider"></div><h3 class="muted">已完成</h3>${[...onToday,...events.filter(e=>!e.start&&e.actionDate===today())].filter(e=>e.done).map(e=>todo(e)).join('')}`:''}</section><section class="panel"><div class="section-head"><h2>逾期提醒</h2></div>${late.map(e=>todo(e,true)).join('')||'<div class="empty">目前沒有逾期事項</div>'}</section></div></div></div>`}
let calendarFrameObserver;
function renderCalendar(){
 const oldFrame=document.querySelector('.calendar-focus-frame')?.getBoundingClientRect();
 const oldItems=new Map([...document.querySelectorAll('.todo-name[data-event-id]')].map(el=>[el.dataset.eventId,{done:el.getAttribute('aria-pressed'),color:getComputedStyle(el.parentElement).color,background:getComputedStyle(el.parentElement).backgroundColor}]));
 const position={x:window.scrollX,y:window.scrollY};
 const panels=[...document.querySelectorAll('.right-rail .panel')].map(el=>({top:el.scrollTop,left:el.scrollLeft}));
 const days=new Map([...document.querySelectorAll('.day[data-date]')].map(el=>[el.dataset.date,{top:el.scrollTop,left:el.scrollLeft}]));
 const focusedId=document.activeElement?.dataset.eventId;
 renderCalendarContent();
 document.querySelectorAll('.right-rail .panel').forEach((el,i)=>{if(panels[i]){el.scrollTop=panels[i].top;el.scrollLeft=panels[i].left}});
 document.querySelectorAll('.day[data-date]').forEach(el=>{const pos=days.get(el.dataset.date);if(pos){el.scrollTop=pos.top;el.scrollLeft=pos.left}});
 if(focusedId){[...document.querySelectorAll('[data-event-id]')].find(el=>el.dataset.eventId===focusedId)?.focus({preventScroll:true})}
 window.scrollTo({left:position.x,top:position.y,behavior:'instant'});
 const reduceMotion=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
 document.querySelectorAll('.todo-name[data-event-id]').forEach(el=>{
  const old=oldItems.get(el.dataset.eventId);
  if(!reduceMotion&&old&&old.done!==el.getAttribute('aria-pressed')){
   const row=el.parentElement;
   row.animate([{backgroundColor:old.background,color:old.color},{backgroundColor:getComputedStyle(row).backgroundColor,color:getComputedStyle(row).color}],{duration:200,easing:'ease'});
   el.animate([{opacity:.35},{opacity:1}],{duration:200,easing:'ease'});
  }
 });
 const calendar=document.querySelector('.calendar');
 const cells=[...calendar.querySelectorAll('.day.today,.day.selected-week')];
 calendarFrameObserver?.disconnect();
 if(cells.length){
  const frame=document.createElement('div');frame.className='calendar-focus-frame';frame.setAttribute('aria-hidden','true');calendar.append(frame);
  const place=()=>{
   const first=cells[0].getBoundingClientRect(),last=cells.at(-1).getBoundingClientRect(),base=calendar.getBoundingClientRect();
   Object.assign(frame.style,{left:(first.left-base.left-calendar.clientLeft)+'px',top:(first.top-base.top-calendar.clientTop)+'px',width:(last.right-first.left)+'px',height:first.height+'px'});
  };
  place();
  if(oldFrame&&!reduceMotion){
   const base=calendar.getBoundingClientRect();
   frame.animate([{left:(oldFrame.left-base.left-calendar.clientLeft)+'px',top:(oldFrame.top-base.top-calendar.clientTop)+'px',width:oldFrame.width+'px',height:oldFrame.height+'px'},{left:frame.style.left,top:frame.style.top,width:frame.style.width,height:frame.style.height}],{duration:200,easing:'ease'});
  }
  calendarFrameObserver=new ResizeObserver(place);calendarFrameObserver.observe(calendar);
 }
}
function modal(title,body,onsave,label='儲存',showFooter=true){ $('dialog').classList.remove('registry-columns-dialog','vendor-history-dialog','vendor-edit-dialog');$('modal').innerHTML=`<div class="modal-head"><h2>${esc(title)}</h2><button class="link" onclick="closeModal()">✕</button></div>${body}${showFooter?`<div class="modal-actions"><button onclick="closeModal()">關閉</button>${onsave?`<button id="modalSave" class="primary">${label}</button>`:''}</div>`:''}`;if(onsave)$('modalSave').onclick=onsave;if(!$('dialog').open){$('dialog').showModal();if(!window.matchMedia('(prefers-reduced-motion: reduce)').matches)$('dialog').animate([{opacity:0,transform:'translateY(12px) scale(.97)'},{opacity:1,transform:'translateY(0) scale(1)'}],{duration:200,easing:'ease'})}}
function closeModal(){$('dialog').close()}
function showDay(date){
 const ev=date?eventsForDay(allEvents(),date):allEvents().filter(e=>!e.start&&(!e.done||e.actionDate===today()));
 modal(date?date.replaceAll('-','/'):'其他事項',`<div class="day-detail-list">${[['external','外校'],['internal','內校'],['manual','其他']].filter(([type])=>ev.some(e=>e.type===type)).map(([type,label])=>`<section class="day-detail-group"><h3>${label}</h3>${ev.filter(e=>e.type===type).map(e=>`<details class="event-detail"><summary tabindex="0" onclick="toggleDetail(event)" onkeydown="if(event.target===this&amp;&amp;['Enter',' '].includes(event.key))toggleDetail(event)"><span class="${e.done?'done':''}">${esc(e.name)}</span>${e.auto?'':`<div class="detail-actions"><button class="detail-icon" aria-label="編輯行程" title="編輯" onclick="event.preventDefault();event.stopPropagation();editManual('${e.id}','${date}')"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m16 3 5 5M3 21l5-1 13-13a2.1 2.1 0 0 0-5-5L3 15z"/><path d="m3 15 5 5"/></svg></button><button class="detail-icon danger" aria-label="刪除行程" title="刪除" onclick="event.preventDefault();event.stopPropagation();deleteManual('${e.id}')"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/></svg></button></div>`}</summary><div class="equipment-list">${(e.rows||[]).map(r=>`<div class="${r.calendarDone?'done':''}">${esc(r.id)}${r.name?` · ${esc(r.name)}`:''}</div>`).join('')}${e.note?`<div>${esc(e.note)}</div>`:''}</div></details>`).join('')}</section>`).join('')||'<p>當天沒有行程</p>'}</div>`,null,'',false);
}
const detailAnimations=new WeakMap();
function toggleDetail(event){
 event.preventDefault();
 const details=event.currentTarget.parentElement,previous=detailAnimations.get(details);
 const opening=previous?!previous.opening:!details.open;
 const start=details.getBoundingClientRect().height;
 if(previous){previous.animation.onfinish=null;previous.animation.cancel()}
 details.classList.toggle('is-closing',!opening);
 if(window.matchMedia('(prefers-reduced-motion: reduce)').matches){details.open=opening;details.classList.remove('is-closing');detailAnimations.delete(details);return}
 details.open=true;
 const end=opening?details.getBoundingClientRect().height:event.currentTarget.getBoundingClientRect().height+parseFloat(getComputedStyle(details).borderBottomWidth||0);
 details.style.overflow='hidden';
 const animation=details.animate([{height:start+'px'},{height:end+'px'}],{duration:200,easing:'ease'});
 detailAnimations.set(details,{animation,opening});
 animation.onfinish=()=>{details.open=opening;details.style.overflow='';details.classList.remove('is-closing');detailAnimations.delete(details)};
}
function deleteManual(id){if(confirm('確定刪除整筆行程？')){db.manual=db.manual.filter(e=>e.id!==id);closeModal();save()}}
function syncEventDates(){const start=$('es').value,end=$('ee');if(start&&end.value<start)end.value=start}
function editManual(id,date){
 const existing=db.manual.find(x=>x.id===id);
 const isTodo=existing?!existing.start:!date;
 const e=existing||{name:'',start:date||'',end:date||'',note:''};
 const title=(id?'編輯':'新增')+(isTodo?'待辦事項':'行程');
 modal(title,`<div class="formgrid"><label class="field full">${isTodo?'項目':'行程名稱'}<input id="en" required value="${esc(e.name)}"></label>${isTodo?'':`<label class="field">開始日期（必填）<input id="es" type="date" required value="${e.start}" oninput="syncEventDates()" onchange="syncEventDates()"></label><label class="field">結束日期（必填）<input id="ee" type="date" required value="${e.end}"></label>`}<label class="field full">備註<textarea id="note">${esc(e.note)}</textarea></label></div>`,()=>{
  const name=$('en').value.trim(),start=isTodo?'':$('es').value,end=isTodo?'':$('ee').value;
  if(!name){$('en').focus();return toast(isTodo?'請填寫項目':'請填寫行程名稱')}
  if(!isTodo&&(!start||!end)){(!start?$('es'):$('ee')).focus();return toast('行程必須填寫開始與結束日期')}
  if(!isTodo&&end<start)return toast('結束日期不可早於開始日期');
  const reset=start!==e.start||end!==e.end;
  Object.assign(e,{name,start,end,note:$('note').value,done:reset?'':e.done||'',actionDate:reset?'':e.actionDate||''});
  if(!id){e.id=uid();db.manual.push(e)}closeModal();save();
 });
}

let cols=[['id','設備編號'],['name','設備名稱'],['asset','資產編號'],['unit','保管單位'],['owner','保管人'],['type','校驗方式'],['vendor','實驗室及廠商'],['instrumentStatus','儀器狀態'],['due','有效日期']];let sortKey=monthlyFilterMemory().registrySortKey,sortDir=monthlyFilterMemory().registrySortDir;
function instrumentStatus(r){return String(r.instrumentStatus??r.extra?.['儀器狀態']??'').trim()}
function extraColumnKey(header){return 'extra:'+Array.from(header,c=>c.codePointAt(0).toString(16)).join('-')}
function extraColumnLabel(key){return String.fromCodePoint(...key.slice(6).split('-').map(c=>parseInt(c,16)))}
const REGISTRY_PREFERRED_COLUMNS=[
 ['id','設備編號'],['name','設備名稱'],['asset','資產編號'],
 ...['廠牌','型號','序號'].map(h=>[extraColumnKey(h),h]),
 ['type','校驗方式'],[extraColumnKey('允收標準'),'允收標準'],['vendor','實驗室及廠商'],['vendorCycleDays','廠商校驗時間'],['unit','保管單位'],['owner','保管人'],['due','有效日期'],
 [extraColumnKey('校驗週期'),'校驗週期'],['instrumentStatus','儀器狀態'],
 ...['使用量測範圍','使用最小公差','儀器精度'].map(h=>[extraColumnKey(h),h])
];
function registryColumns(){
 if(!db.settings.registryVendorCycleAdded){const selected=db.settings.registryColumnsV3?.['外校／遊校'];if(selected&&!selected.includes('vendorCycleDays'))selected.splice(Math.max(0,selected.indexOf('vendor')+1),0,'vendorCycleDays');db.settings.registryVendorCycleAdded=true}
 const aliases=new Set(['量測/監控設備編號','量測／監控設備編號','名稱','實驗室/廠商','實驗室','實驗室／廠商',...cols.map(c=>c[1])]);
 const headers=new Set(db.settings.importColumns||[]);
 if(db.imports.some(i=>i.file==='量測監控設備清冊 (1).xlsx'))CALIBRATION_SAMPLE_COLUMNS.forEach(h=>headers.add(h));
 db.rows.forEach(r=>Object.keys(r.extra||{}).forEach(h=>headers.add(h)));
 const ordered=new Map(REGISTRY_PREFERRED_COLUMNS);
 for(const [key,label]of [...cols,...[...headers].filter(h=>!aliases.has(h)).map(h=>[extraColumnKey(h),h])])if(!ordered.has(key))ordered.set(key,label);
 return [...ordered];
}
function registryDefaultKeys(type=tab){return type==='內校'?['id','name','asset','unit','owner','due',extraColumnKey('校驗週期'),'instrumentStatus']:REGISTRY_PREFERRED_COLUMNS.slice(0,15).map(c=>c[0])}
function columnVisible(key,type=tab){return (db.settings.registryColumnsV3?.[type]||registryDefaultKeys(type)).includes(key)}
function equipmentValue(r,key){if(key==='vendorCycleDays'){const vendor=(db.externalVendors||[]).find(v=>v.id===r.vendorInfoId)||(db.externalVendors||[]).find(v=>v.name.trim().toLocaleLowerCase()===String(r.vendor||'').trim().toLocaleLowerCase());const days=vendor?vendorCycleStats(vendor).days:null;return days==null?'':days+' 天'}return key.startsWith('extra:')?r.extra?.[extraColumnLabel(key)]??'':key==='instrumentStatus'?instrumentStatus(r):r[key]}
function inactiveEquipment(r){return ['停用','報廢'].includes(instrumentStatus(r))}
function registrySearch(scope='清冊'){return `<div class="registry-lookup"><select class="registry-month" aria-label="${esc(scope)}年月" onchange="month=this.value;render()">${months().map(m=>`<option ${m===month?'selected':''}>${m}</option>`).join('')}</select><form class="registry-search" onsubmit="event.preventDefault();query=this.elements.search.value.trim();render()"><input class="search" name="search" aria-label="搜尋${esc(scope)}" placeholder="搜尋" value="${esc(query)}"><button type="submit" class="registry-search-submit" aria-label="搜尋" title="搜尋"><svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" aria-hidden="true"><circle cx="10.5" cy="10.5" r="7"/><path d="m16 16 5 5"/></svg></button></form></div>`}
const REGISTRY_FILTER_FIELDS=new Set(['name','vendor','unit','owner']);
let registryFilters=monthlyFilterMemory().registryFilters,registryFilterMenu;
function registryMatches(r,exceptKey,type=tab){return Object.entries((r.month===filterMemoryMonth?registryFilters:monthlyFilterMemory(r.month).registryFilters)[type]||{}).every(([key,values])=>key===exceptKey||values.includes(String(equipmentValue(r,key)??'')))}
function closeRegistryFilter(){
 if(!registryFilterMenu)return;
 const {element}=registryFilterMenu;registryFilterMenu=null;
 if(element.matches(':popover-open'))element.hidePopover();element.remove();
}
let internalProgressFilters=monthlyFilterMemory().internalProgressFilters,internalSortKey=monthlyFilterMemory().internalSortKey,internalSortDir=monthlyFilterMemory().internalSortDir;
function internalProgressMatches(r,exceptKey){return Object.entries(internalProgressFilters).every(([key,values])=>key===exceptKey||values.includes(String(equipmentValue(r,key)??'')))}
function openRegistryFilter(event,key,scope='registry'){
 event.stopPropagation();closeRegistryFilter();
 const label=registryColumns().find(c=>c[0]===key)?.[1];
 const values=[...new Set(rows().filter(r=>scope==='internal'?matchesInternalProgressScope(r)&&equipmentMatchesQuery(r)&&internalProgressMatches(r,key):(tab==='內校'?r.type==='內校':r.type!=='內校')).map(r=>String(equipmentValue(r,key)??'')))].sort((a,b)=>a.localeCompare(b,'zh-Hant'));
 const selected=new Set((scope==='internal'?internalProgressFilters[key]:registryFilters[tab]?.[key])??values),element=document.createElement('div');
 element.id='registry-filter-menu';element.setAttribute('popover','auto');element.setAttribute('role','dialog');element.setAttribute('aria-label',label+'篩選');
 element.innerHTML=`<div class="filter-menu-title">${esc(label)}</div><div class="filter-sort"><button type="button" onclick="sortRegistryFilter(1)">A → Z 升冪</button><button type="button" onclick="sortRegistryFilter(-1)">Z → A 降冪</button></div><button type="button" class="filter-clear" onclick="clearRegistryFilter()">清除這個欄位的篩選</button><input aria-label="搜尋篩選選項" placeholder="搜尋" oninput="searchRegistryFilter(this.value)"><label class="filter-option filter-all"><input type="checkbox" id="registry-filter-all" onchange="selectRegistryFilterAll(this.checked)">全選</label><div class="filter-options">${values.map((value,i)=>`<label class="filter-option" data-option="${i}"><input type="checkbox" data-value-index="${i}" ${selected.has(value)?'checked':''} onchange="selectRegistryFilterValue(${i},this.checked)"><span>${esc(value||'(空白)')}</span></label>`).join('')}</div><div class="filter-no-results" hidden>沒有符合的選項</div><div class="filter-actions"><button type="button" onclick="closeRegistryFilter()">取消</button><button type="button" class="primary" onclick="applyRegistryFilter()">確定</button></div>`;
 registryFilterMenu={key,values,selected,element,scope};
 element.addEventListener('toggle',e=>{if(e.newState==='closed'&&registryFilterMenu?.element===element){registryFilterMenu=null;element.remove()}});
 document.body.append(element);element.showPopover();
 const rect=event.currentTarget.getBoundingClientRect(),bounds=element.getBoundingClientRect();
 element.style.left=Math.max(8,Math.min(rect.right-bounds.width,innerWidth-bounds.width-8))+'px';
 element.style.top=Math.max(8,Math.min(rect.bottom+6,innerHeight-bounds.height-8))+'px';
 updateRegistryFilterAll();element.querySelector('input[placeholder]').focus({preventScroll:true});
}
function updateRegistryFilterAll(){
 if(!registryFilterMenu)return;
 const visible=[...registryFilterMenu.element.querySelectorAll('[data-option]')].filter(el=>!el.hidden);
 const checked=visible.filter(el=>el.querySelector('input').checked).length,all=$('registry-filter-all');
 all.checked=visible.length>0&&checked===visible.length;all.indeterminate=checked>0&&checked<visible.length;all.disabled=!visible.length;
 registryFilterMenu.element.querySelector('.filter-no-results').hidden=visible.length>0;
}
function searchRegistryFilter(text){
 if(!registryFilterMenu)return;
 registryFilterMenu.element.querySelectorAll('[data-option]').forEach(el=>{el.hidden=!el.textContent.toLocaleLowerCase().includes(text.toLocaleLowerCase())});updateRegistryFilterAll();
}
function selectRegistryFilterValue(index,checked){const state=registryFilterMenu;if(!state)return;if(checked)state.selected.add(state.values[index]);else state.selected.delete(state.values[index]);updateRegistryFilterAll()}
function selectRegistryFilterAll(checked){
 const state=registryFilterMenu;if(!state)return;
 state.element.querySelectorAll('[data-option]').forEach(el=>{if(!el.hidden){const input=el.querySelector('input');input.checked=checked;const value=state.values[Number(input.dataset.valueIndex)];if(checked)state.selected.add(value);else state.selected.delete(value)}});updateRegistryFilterAll();
}
function applyRegistryFilter(){
 const state=registryFilterMenu;if(!state)return;
 registryFilters[tab]??={};const target=state.scope==='internal'?internalProgressFilters:registryFilters[tab];
 if(state.selected.size===state.values.length)delete target[state.key];else target[state.key]=[...state.selected];
 closeRegistryFilter();render();
}
function clearRegistryFilter(){const key=registryFilterMenu?.key;if(!key)return;delete (registryFilterMenu.scope==='internal'?internalProgressFilters:(registryFilters[tab]||{}))[key];closeRegistryFilter();render()}
function sortRegistryFilter(direction){const key=registryFilterMenu?.key;if(!key)return;if(registryFilterMenu.scope==='internal'){internalSortKey=key;internalSortDir=direction}else{sortKey=key;sortDir=direction}closeRegistryFilter();render()}
function equipmentMatchesQuery(r,search=query){return !search||[...Object.values(r),...Object.values(r.extra||{}),instrumentStatus(r)].some(v=>typeof v==='string'&&v.toLowerCase().includes(search.toLowerCase()))}
function filtered(type){return rows().filter(r=>(type==='內校'?r.type==='內校':r.type!=='內校')&&equipmentMatchesQuery(r)&&(page==='registry'?registryMatches(r):(page==='external'||status==='all'||(status==='done'?complete(r):!complete(r))))).sort((a,b)=>(page==='registry'?Number(inactiveEquipment(a))-Number(inactiveEquipment(b)):0)||String(equipmentValue(a,sortKey)||'\uffff').localeCompare(String(equipmentValue(b,sortKey)||'\uffff'),'zh-Hant')*sortDir)}
function searchBar(){return `<input class="search" placeholder="搜尋設備編號、名稱、保管人…" value="${esc(query)}" onchange="query=this.value;render()"><select onchange="status=this.value;render()"><option value="all">全部狀態</option><option value="open" ${status==='open'?'selected':''}>未完成</option><option value="done" ${status==='done'?'selected':''}>已完成</option></select>`}
function visibleCols(){return registryColumns().filter(([k])=>columnVisible(k))}
function showAcceptanceStandard(key){
 const r=db.rows.find(r=>r.key===key);if(!r)return;
 modal('允收標準',`<div class="acceptance-equipment">${[['設備編號',r.id],['設備名稱',r.name],['資產編號',r.asset]].map(([label,value])=>`<div><span class="muted">${label}</span><div>${esc(value)||'—'}</div></div>`).join('')}</div><div class="acceptance-standard"><h3>允收標準</h3><div>${esc(equipmentValue(r,extraColumnKey('允收標準')))||'—'}</div></div>`);
}
function renderRegistry(){let list=filtered(tab),vc=visibleCols();$('content').innerHTML=`<div class="registry-workspace"><div class="tabs">${['內校','外校／遊校'].map(t=>`<button class="${tab===t?'active':''}" onclick="tab='${t}';render()">${t}_${rows().filter(r=>!inactiveEquipment(r)&&(t==='內校'?r.type==='內校':r.type!=='內校')).length}</button>`).join('')}<button type="button" class="registry-export" aria-label="匯出 Excel" title="匯出 Excel" onclick="exportExcel()"><svg viewBox="0 0 32 32" width="27" height="27" aria-hidden="true"><path d="M13 5h15a2 2 0 0 1 2 2v18a2 2 0 0 1-2 2H13z" fill="none" stroke="currentColor" stroke-width="2"/><path d="M19 10h7m-7 6h7m-7 6h7" stroke="currentColor" stroke-width="2"/><path d="M2 5 18 2v28L2 27z" fill="currentColor"/><path d="m6 10 7 12m0-12L6 22" stroke="white" stroke-width="2.5"/></svg></button></div><div class="toolbar">${registrySearch()}${hasMissingExternalVendor()?`<span class="registry-vendor-warning" role="status">!!! ${esc(missingExternalVendorNotice())} !!!</span>`:''}<span class="spacer"></span><button onclick="columnsDialog()">欄位設定</button><button class="primary" onclick="editEquipment()">＋ 新增設備</button></div><div class="tablewrap"><table><thead><tr>${vc.map(([k,t])=>`<th><div class="registry-column-head"><button type="button" class="registry-column-sort" onclick="sortDir=sortKey==='${k}'?-sortDir:1;sortKey='${k}';render()">${esc(t)} <span aria-hidden="true">${sortKey===k?(sortDir===1?'↑':'↓'):'↕'}</span></button>${REGISTRY_FILTER_FIELDS.has(k)?`<button type="button" class="registry-filter-trigger ${registryFilters[tab]?.[k]?'is-filtered':''}" aria-label="篩選${esc(t)}" aria-haspopup="dialog" onclick="openRegistryFilter(event,'${k}')"><svg viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" aria-hidden="true"><path d="M3 4h14l-5.5 6v5l-3-1.5V10z"/></svg></button>`:''}</div></th>`).join('')}<th></th></tr></thead><tbody>${list.map(r=>`<tr class="${inactiveEquipment(r)?'inactive-equipment':''}">${vc.map(([k])=>`<td>${k===extraColumnKey('允收標準')?`<button type="button" aria-label="展開 ${esc(r.id)} 允收標準" onclick="showAcceptanceStandard('${r.key}')">展開</button>`:esc(equipmentValue(r,k))||'—'}</td>`).join('')}<td><div class="registry-actions"><button class="registry-edit" aria-label="編輯設備 ${esc(r.id)}" title="編輯" onclick="editEquipment('${r.key}')"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m16 3 5 5M3 21l5-1 13-13a2.1 2.1 0 0 0-5-5L3 15z"/><path d="m3 15 5 5"/></svg></button><button class="registry-delete" aria-label="刪除設備 ${esc(r.id)}" title="刪除" onclick="deleteEquipment('${r.key}')"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/></svg></button></div></td></tr>`).join('')||`<tr><td colspan="${vc.length+1}" class="registry-empty">沒有符合條件的設備</td></tr>`}</tbody></table></div></div>`}
function columnsDialog(){
 modal('欄位顯示 · '+tab,`<div class="registry-column-options">${registryColumns().map(([k,t])=>`<label class="checkrow">${esc(t)}<input type="checkbox" data-col="${k}" ${columnVisible(k)?'checked':''}></label>`).join('')}</div>`,()=>{
  const inputs=[...document.querySelectorAll('[data-col]')];
  if(!inputs.some(x=>x.checked))return toast('請至少保留一個顯示欄位');
  db.settings.registryColumnsV3??={};db.settings.registryColumnsV3[tab]=inputs.filter(x=>x.checked).map(x=>x.dataset.col);
  closeModal();save();
 });
 $('dialog').classList.add('registry-columns-dialog');
 const reset=document.createElement('button');reset.type='button';reset.className='registry-restore';reset.textContent='恢復預設';
 reset.onclick=()=>{const defaults=registryDefaultKeys();document.querySelectorAll('[data-col]').forEach(el=>el.checked=defaults.includes(el.dataset.col));toast('已恢復欄位預設，按儲存套用')};
 document.querySelector('.modal-actions').prepend(reset);
}
function hasEquipmentActivity(r){return (r.p||[]).some(Boolean)||!!r.date||!!r.completed||!!r.calibrationDate||!!r.receiptDate||Object.values(db.events).some(state=>state.done&&state.signature?.split(',').includes(r.key))}
function equipmentVendorControl(r){
 const list=vendorInfoList(''),selected=list.find(v=>v.id===r.vendorInfoId)||list.find(v=>v.name.trim().toLocaleLowerCase()===String(r.vendor||'').trim().toLocaleLowerCase()),other=!selected&&!!r.vendor;
 return `<select id="f_vendor" onchange="toggleEquipmentVendorOther()"><option value="">請選擇廠商</option>${list.map(v=>`<option value="${esc(v.id)}" ${selected?.id===v.id?'selected':''}>${esc(v.name)}</option>`).join('')}<option value="__other__" ${other?'selected':''}>其他</option></select><input id="f_vendorOther" aria-label="其他廠商名稱" placeholder="輸入其他廠商" value="${esc(other?r.vendor:'')}" ${other?'':'hidden'}>`;
}
function toggleEquipmentVendorOther(){const input=$('f_vendorOther');input.hidden=$('f_vendor').value!=='__other__';if(!input.hidden)input.focus()}
function externalReceiptDate(r){if(r.type==='遊校')return r.date||'';return (r.mode||'收件')==='收件'?r.date||'':r.receiptDate||''}
function externalCalibrationReferenceDate(r){return r.date||(r.mode==='寄出'?r.shippedDate:r.receiptDate)||''}
function vendorEquipmentRows(v){return db.rows.filter(r=>['外校','遊校'].includes(r.type)&&(r.vendorInfoId&&(db.externalVendors||[]).some(x=>x.id===r.vendorInfoId)?r.vendorInfoId===v.id:String(r.vendor||'').trim().toLocaleLowerCase()===v.name.trim().toLocaleLowerCase()))}
function vendorCalibrationItemCount(v){return vendorEquipmentRows(v).filter(r=>!inactiveEquipment(r)).length}
function vendorCalibrationHistory(v){
 return vendorEquipmentRows(v).filter(r=>r.type==='外校').map(r=>{
  const dateType=r.mode==='寄出'?'寄出':'收件',start=externalCalibrationReferenceDate(r),end=r.calibrationDate;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(end)||!Number.isFinite(Date.parse(end+'T00:00:00Z')))return null;
  const duration=(Date.parse(end+'T00:00:00Z')-Date.parse(start+'T00:00:00Z'))/86400000;const days=Number.isFinite(duration)&&duration>=0?duration:null;
  return{key:r.key,id:r.id,name:r.name,days,month:end.slice(0,7),start,dateType,receipt:externalReceiptDate(r),date:end};
 }).filter(Boolean).sort((a,b)=>b.date.localeCompare(a.date)||String(a.id).localeCompare(String(b.id),'zh-Hant',{numeric:true}));
}
function vendorCycleStats(v){const entries=vendorCalibrationHistory(v).filter(e=>e.days!==null);return{count:entries.length,days:entries.length?Math.round(entries.reduce((sum,e)=>sum+e.days,0)/entries.length*10)/10:v.cycleDays??null}}

function setExternalCalibrationDate(key){const r=db.rows.find(r=>r.key===key&&['外校','遊校'].includes(r.type));if(r)externalCalibrationDateDialog([r])}
function externalCalibrationDateDialog(list){
 if(window.Cloud&&!Cloud.canWrite())return toast('此帳號僅供檢視');
 if(!list.length)return;
 if(list.some(r=>!externalCalibrationReferenceDate(r)&&!r.calibrationDate))return toast('請先設定寄出／收件／遊校日期');
 const earliest=list.map(externalCalibrationReferenceDate).filter(Boolean).sort().at(-1)||'',same=list.every(r=>r.calibrationDate===list[0].calibrationDate);
 modal('校驗日期',`<p>${list.length===1?esc(list[0].id)+' · '+esc(list[0].name):esc(list[0].vendor)+' · '+list.length+' 台設備'}</p><p>${list[0].type==='遊校'?'遊校日期':list[0].mode==='寄出'?'寄出日期':'收件日期'}：${list.length===1?esc(earliest)||'未設定':'依各設備的收件日期計算'}</p><label class="field">校驗日期<input id="externalCalibrationDate" type="date" min="${esc(earliest)}" max="${today()}" value="${esc(same&&list[0].calibrationDate||today())}"></label>`,()=>{
  const date=$('externalCalibrationDate').value;if(date&&list.some(r=>!externalCalibrationReferenceDate(r)))return toast('請先設定寄出／收件／遊校日期');if(date&&date<earliest)return toast('校驗日期不可早於寄出／收件／遊校日期');if(date&&date>today())return toast('校驗日期不可為未來日期');
  for(const r of list){r.receiptDate=externalReceiptDate(r);r.calibrationDate=date;r.p[stages(r).length-1]=!!date;r.completed=date}closeModal();save();
 });
}

function editEquipment(key){let r=db.rows.find(r=>r.key===key)||{id:'',name:'',asset:'',unit:'',owner:'',type:tab==='內校'?'內校':'外校',vendor:'',due:''};modal(key?'編輯設備':'新增設備',`${key?'':`<div class="equipment-batch-add"><button type="button" onclick="$('equipmentExcelFile').click()">上傳 Excel 批次新增</button><input id="equipmentExcelFile" type="file" accept=".xlsx" hidden onchange="addEquipmentExcel(this.files[0])"></div>`}<div class="formgrid">${cols.map(([k,t])=>`<label class="field">${t}${k==='vendor'?equipmentVendorControl(r):k==='type'?`<select id="f_type">${['內校','外校','遊校'].map(x=>`<option ${r.type===x?'selected':''}>${x}</option>`).join('')}</select>`:`<input id="f_${k}" value="${esc(equipmentValue(r,k))}" ${key&&['id','name','due'].includes(k)?'disabled':''} type="${k==='due'?'date':'text'}">`}</label>`).join('')}</div>`,()=>{let next=Object.fromEntries(cols.map(([k])=>[k,$('f_'+k).value.trim()]));const chosen=$('f_vendor').value;let pendingVendor=null;const match=(db.externalVendors||[]).find(v=>v.id===chosen);next.vendor=chosen==='__other__'?$('f_vendorOther').value.trim():match?.name||'';if(chosen==='__other__'&&!next.vendor)return toast('請填寫其他廠商名稱');let linked=match||(db.externalVendors||[]).find(v=>v.name.trim().toLocaleLowerCase()===next.vendor.toLocaleLowerCase());if(next.vendor&&!linked){pendingVendor={id:uid(),name:next.vendor,cycleDays:null,contact:'',contactMethod:'',email:''};linked=pendingVendor}next.vendor=linked?.name||next.vendor;next.vendorInfoId=linked?.id||'';if(!next.id||!next.name)return toast('設備編號與名稱必填');if(rows().some(x=>x.id===next.id&&x.key!==key))return toast('同月份設備編號重複');let reset=key&&(r.type!==next.type||(r.vendorInfoId&&r.vendorInfoId===next.vendorInfoId?false:(r.vendor||'')!==next.vendor));if(reset&&hasEquipmentActivity(r)&&!confirm('校驗方式或廠商改變，將清除該設備進度與排程。繼續？'))return;for(let k of ['asset','unit','owner'])db.rows.filter(x=>x.id===next.id).forEach(x=>x[k]=next[k]);if(!key){r.key=uid();r.month=month;r.p=[];r.date='';r.mode='收件';r.extra={};db.rows.push(r)}if(reset){r.p=[];r.date='';r.completed='';r.receiptDate='';r.calibrationDate=''}if(pendingVendor){db.externalVendors??=[];db.externalVendors.push(pendingVendor)}Object.assign(r,next);closeModal();save()})}
function deleteEquipment(key){
 const equipment=db.rows.find(r=>r.key===key);if(!equipment)return;
 if(!confirm('確定刪除設備「'+equipment.id+' · '+equipment.name+'」及其進度與排程？'))return;
 db.rows=db.rows.filter(r=>r.key!==key);save();
}
function percent(list){return list.length?Math.round(list.filter(complete).length/list.length*100):0}
function renderProgress(){return page==='external'?renderExternalProgress():renderInternalProgress()}
function matchesInternalProgressScope(r){return !inactiveEquipment(r)&&r.type==='內校'&&registryMatches(r,null,'內校')&&equipmentMatchesQuery(r,r.month===filterMemoryMonth?internalRegistryQuery:monthlyFilterMemory(r.month).registrySearches['內校']||'')}
function internalProgressHeader(key,label){return `<th><div class="registry-column-head"><button type="button" class="registry-column-sort" onclick="internalSortDir=internalSortKey==='${key}'?-internalSortDir:1;internalSortKey='${key}';render()">${label} ${internalSortKey===key?(internalSortDir===1?'↑':'↓'):'↕'}</button><button type="button" class="registry-filter-trigger ${internalProgressFilters[key]?'is-filtered':''}" aria-label="篩選${label}" aria-haspopup="dialog" onclick="openRegistryFilter(event,'${key}','internal')"><svg viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" aria-hidden="true"><path d="M3 4h14l-5.5 6v5l-3-1.5V10z"/></svg></button></div></th>`}
function renderInternalProgress(){
 let initialized=false;
 for(const r of rows())if(matchesInternalProgressScope(r)&&!r.internalDateInitialized){
  if(!r.date&&r.due){r.date=r.due;r.p[0]=true}
  r.internalDateInitialized=true;initialized=true;
 }
 if(initialized)persist();
 const list=rows().filter(r=>matchesInternalProgressScope(r)&&equipmentMatchesQuery(r)&&internalProgressMatches(r)).sort((a,b)=>Number(complete(a))-Number(complete(b))||(internalSortKey==='date'?String(a.date||a.due||'9999-12-31').localeCompare(String(b.date||b.due||'9999-12-31')):String(equipmentValue(a,internalSortKey)||'').localeCompare(String(equipmentValue(b,internalSortKey)||''),'zh-Hant'))*internalSortDir||a.id.localeCompare(b.id,'zh-Hant')),pct=percent(list);
 $('content').innerHTML=`<div class="internal-progress-workspace"><div class="toolbar">${registrySearch('內校進度')}<span class="spacer"></span><button onclick="tab='內校';go('registry')">查看清冊 →</button></div><section class="panel internal-total"><div class="rowtitle"><h2>校驗總進度</h2><span>${pct}%</span></div><div class="progress"><i class="${pct===100?'complete':''}" style="width:${pct}%"></i></div></section><div class="tablewrap"><table class="internal-equipment-table"><colgroup><col style="width:22%"><col style="width:13%"><col style="width:14%"><col style="width:11%"><col style="width:12%"><col style="width:14%"><col style="width:7%"><col style="width:7%"></colgroup><thead><tr><th>設備編號 / 名稱</th><th>資產編號</th>${internalProgressHeader('unit','保管單位')}${internalProgressHeader('owner','保管人')}<th>有效日期</th><th>預計校驗日</th><th>收件確認</th><th>已完成</th></tr></thead><tbody>${list.map(r=>`<tr class="${complete(r)?'finished':''}"><td>${esc(r.id)}<div class="subtle">${esc(r.name)}</div></td><td>${esc(r.asset)||'—'}</td><td>${esc(r.unit)||'—'}</td><td>${esc(r.owner)||'—'}</td><td>${esc(r.due)||'—'}</td><td><button onclick="schedule('${r.key}',0)">${esc(r.date)||'設定日期'}</button></td>${[1,2].map(i=>`<td><label class="step"><input type="checkbox" aria-label="${esc(r.id)} ${stages(r)[i]}" ${r.p[i]?'checked':''} ${!r.p[i-1]?'disabled':''} onchange="window.step('${r.key}',${i},this.checked)"></label></td>`).join('')}</tr>`).join('')||'<tr><td colspan="8" class="empty">沒有符合條件的設備</td></tr>'}</tbody></table></div></div>`;
}
const externalProgressOpen=new Set();
const externalDateViews=new Map();
function externalDateView(list){return externalDateViews.get(String(list[0].vendor||'').trim())||(list.every(r=>(r.mode||'收件')===(list[0].mode||'收件'))?list[0].mode||'收件':'收件')}
function externalDateForMode(r,mode){return (r.mode||'收件')===mode?r.date||'':mode==='收件'?r.receiptDate||'':r.shippedDate||''}
function changeExternalDateView(control){if(!['收件','寄出'].includes(control.value))return;const keys=new Set(JSON.parse(control.closest('table').dataset.equipmentKeys)),row=db.rows.find(r=>keys.has(r.key));if(!row)return;externalDateViews.set(String(row.vendor||'').trim(),control.value);render()}
function scheduleExternalDate(key,mode){
 if(window.Cloud&&!Cloud.canWrite())return toast('此帳號僅供檢視');
 const r=db.rows.find(r=>r.key===key&&r.type==='外校');if(!r||!['收件','寄出'].includes(mode))return;
 const current=externalDateForMode(r,mode);
 modal('設定'+mode+'日期',`<p>${esc(r.id)} · ${esc(r.name)}</p><label class="field">${mode}日期<input type="date" id="externalModeDate" value="${esc(current||today())}"></label>`,()=>{
  const date=$('externalModeDate').value;if(date&&r.calibrationDate&&date>r.calibrationDate)return toast(mode+'日期不可晚於校驗日期');
  if(current!==date){
   if((r.mode||'收件')==='收件')r.receiptDate=r.date||'';else r.shippedDate=r.date||'';
   r[mode==='收件'?'receiptDate':'shippedDate']=date;
   const other=mode==='收件'?'寄出':'收件',otherDate=externalDateForMode(r,other);
   r.mode=date||!otherDate?mode:other;r.date=date||otherDate||'';
   r.p[stages(r).length-2]=!!r.date;r.calibrationDate='';r.completed='';r.p[stages(r).length-1]=false;
  }
  closeModal();save();
 });
}

function externalProgressTable(list){
 const displayMode=externalDateView(list);
 return `<div class="tablewrap progress-table" onscroll="syncVendorHorizontal(this)"><table class="external-equipment-table" data-equipment-keys="${esc(JSON.stringify(list.map(r=>r.key)))}"><colgroup><col class="progress-col-equipment"><col class="progress-col-asset"><col class="progress-col-due">${stages(list[0]).map((s,i)=>`${list[0].type==='遊校'&&i===2?'<col class="progress-col-step"><col class="progress-col-step">':''}<col class="${i===stages(list[0]).length-2?'progress-col-date':'progress-col-step'}">`).join('')}</colgroup><thead><tr><th>設備編號 / 名稱</th><th>資產編號</th><th class="progress-due-cell">有效日期</th>${stages(list[0]).map((s,i)=>`${list[0].type==='遊校'&&i===2?'<th aria-label="不適用外送單"></th><th aria-label="不適用設備確認"></th>':''}<th class="${i===stages(list[0]).length-2?'':'progress-checkbox-cell'}">${i===stages(list[0]).length-2?(list[0].type==='外校'?`<select class="external-date-heading" aria-label="${esc(list[0].vendor)}寄出收件時間" onchange="changeExternalDateView(this)">${['寄出','收件'].map(mode=>`<option value="${mode}" ${displayMode===mode?'selected':''}>${mode}時間</option>`).join('')}</select>`:`<span class="tour-date-heading">${s}</span>`):s}</th>`).join('')}</tr></thead><tbody>${list.map(r=>`<tr class="${complete(r)?'finished':''}"><td>${esc(r.id)}<div class="subtle">${esc(r.name)}</div></td><td class="muted">${esc(r.asset)}</td><td class="progress-due-cell">${esc(r.due)||'—'}</td>${stages(r).map((s,i)=>{
  const dateStage=i===stages(r).length-2;if(i===stages(r).length-1)return `<td class="progress-calibration-cell"><button aria-label="${esc(r.id)}校驗日期" ${!r.calibrationDate&&(!externalCalibrationReferenceDate(r)||!r.p[i-1])?'disabled':''} onclick="setExternalCalibrationDate('${r.key}')">${esc(r.calibrationDate)||'設定日期'}</button></td>`;
  return `${r.type==='遊校'&&i===2?'<td></td><td></td>':''}<td class="${dateStage?'':'progress-checkbox-cell'}">${dateStage?`<div class="progress-date-controls ${r.type==='遊校'?'tour-date-controls':''}"><button ${i&&!r.p[i-1]?'disabled':''} aria-label="${esc(r.id)}${r.type==='外校'?displayMode:'遊校'}日期" onclick="${r.type==='外校'?`scheduleExternalDate('${r.key}','${displayMode}')`:`schedule('${r.key}',${i})`}">${(r.type==='外校'?externalDateForMode(r,displayMode):r.date)||'設定日期'}</button></div>`:`<label class="step"><input aria-label="${esc(r.id)} ${esc(s)}" type="checkbox" ${r.p[i]?'checked':''} ${i&&!r.p[i-1]?'disabled':''} onchange="window.step('${r.key}',${i},this.checked)"></label>`}</td>`;
 }).join('')}</tr>`).join('')}</tbody></table></div>`;
}
function syncVendorHorizontal(source){
 const vendor=source.closest('.vendor-progress');if(!vendor)return;
 vendor.querySelectorAll('.vendor-progress-title,.progress-table').forEach(element=>{if(element!==source&&Math.abs(element.scrollLeft-source.scrollLeft)>1)element.scrollLeft=source.scrollLeft});
}
function toggleVendorProgress(event,summary){
 event.preventDefault();
 const details=summary.parentElement,body=details.querySelector('.vendor-progress-body');
 if(details._progressAnimation)details._progressAnimation.cancel();
 const expand=details._progressTarget===undefined?!details.open:!details._progressTarget;
 details._progressTarget=expand;
 const start=details.open?body.getBoundingClientRect().height:0;
 details.open=true;
 const finish=()=>{details.open=expand;expand?externalProgressOpen.add(details.dataset.progressGroup):externalProgressOpen.delete(details.dataset.progressGroup);delete details._progressTarget;delete details._progressAnimation};
 if(matchMedia('(prefers-reduced-motion: reduce)').matches){finish();return}
 const animation=body.animate([{height:start+'px',paddingTop:(expand?0:16)+'px',opacity:expand?0:1},{height:(expand?body.scrollHeight:0)+'px',paddingTop:(expand?16:0)+'px',opacity:expand?1:0}],{duration:200,easing:'ease-in-out'});
 details._progressAnimation=animation;animation.onfinish=finish;
}
function renderExternalProgress(){
 const list=filtered('外校／遊校').filter(r=>!inactiveEquipment(r)),total=rows().filter(r=>!inactiveEquipment(r)&&(r.type==='外校'||r.type==='遊校')),pct=percent(total),vendors=new Map();
 for(const row of list){const vendor=String(row.vendor??'').trim();if(!vendor)continue;if(!vendors.has(vendor))vendors.set(vendor,[]);vendors.get(vendor).push(row)}
 const groups=[...vendors].sort(([a],[b])=>a.localeCompare(b,'zh-Hant'));
 $('content').innerHTML=`<div class="external-progress-workspace"><div class="toolbar">${registrySearch('外校進度')}<span class="spacer"></span><button onclick="tab='外校／遊校';go('registry')">查看清冊 →</button></div><section class="panel external-total"><div class="rowtitle"><h2>校驗總進度</h2><span>${pct}%</span></div><div class="progress"><i class="${pct===100?'complete':''}" style="width:${pct}%"></i></div></section>${groups.map(([vendor,equipment])=>`<details class="panel vendor-progress" data-progress-group="${esc(vendor)}" ontoggle="this.open?externalProgressOpen.add(this.dataset.progressGroup):externalProgressOpen.delete(this.dataset.progressGroup)" ${externalProgressOpen.has(vendor)?'open':''}><summary class="vendor-progress-title" onscroll="syncVendorHorizontal(this)" onclick="toggleVendorProgress(event,this)"><span class="vendor-name">${esc(vendor)}</span></summary><div class="vendor-progress-body">${['外校','遊校'].map(type=>{
  const items=equipment.filter(r=>r.type===type);if(!items.length)return '';
  return `<section class="group progress-type-${type==='外校'?'external':'tour'}">${externalProgressTable(items)}</section>`;
 }).join('')}</div></details>`).join('')||'<div class="empty">沒有符合條件的設備</div>'}</div>`;
}
function changeMode(key,mode){let r=db.rows.find(x=>x.key===key);if(r.date&&!confirm('切換寄出／收件將清除原日期與完成紀錄，確定？'))return render();r.mode=mode;r.date='';r.calibrationDate='';r.p[stages(r).length-2]=r.p[stages(r).length-1]=false;r.completed='';save()}
function step(key,i,checked){let r=db.rows.find(x=>x.key===key);if(checked&&i&&!r.p[i-1])return;if(!checked){for(let j=i;j<stages(r).length;j++)r.p[j]=false;let di=r.type==='內校'?0:stages(r).length-2;if(i<=di)r.date='';if(r.type!=='內校')r.calibrationDate='';r.completed='';save();return}if(i===stages(r).length-1){modal('校驗完成',`<p>${esc(r.id)} · ${esc(r.name)}</p><label class="field">完成日期<input type="date" id="finish" value="${today()}" max="${today()}"></label>`,()=>{let d=$('finish').value;if(!d||d>today())return toast('完成日期不可為未來');r.p[i]=true;r.completed=d;closeModal();save()});render()}else{r.p[i]=true;save()}}
function schedule(key,i){let r=db.rows.find(x=>x.key===key);modal('設定日期',`<p>${esc(r.id)} · ${esc(r.name)}</p><label class="field">${r.type==='內校'?'預計校驗日':r.type==='遊校'?'遊校日期':r.mode+'日期'}<input type="date" id="schedule" value="${r.date||r.due||today()}"></label>`,()=>{let d=$('schedule').value;if(d&&r.type==='外校'&&(r.mode||'收件')==='收件'&&r.calibrationDate&&d>r.calibrationDate)return toast('收件日期不可晚於校驗日期');if(d&&r.type==='內校'){if(r.due&&r.due>=today()&&d>r.due)return toast('不得晚於有效日期');if(r.due&&r.due<today()&&d<today())return toast('已過期設備請安排今天或之後');if(!r.due&&d.slice(0,7)!==r.month)return toast('有效日期空白時請選所屬月份')}if(!d&&!confirm('清除日期及後續進度？'))return;if(r.date!==d){if(r.type!=='內校')r.calibrationDate='';r.date=d;r.p[i]=!!d;r.p[stages(r).length-1]=false;r.completed='';if(!d)for(let j=i;j<stages(r).length;j++)r.p[j]=false}closeModal();save()})}
function vendors(){return [...new Set(rows().filter(r=>r.type!=='內校').map(r=>r.vendor||'未指定廠商'))]}
function sumCost(key){
 const recorded=db.monthlyExternalCosts?.[key];
 if(recorded!==undefined)return Math.max(0,Number(recorded)||0);
 return Object.values(db.quotes[key]||{}).reduce((sum,value)=>sum+(Number(value)||0),0);
}
function hasMonthlyCost(key){return db.monthlyExternalCosts?.[key]!==undefined||Object.values(db.quotes[key]||{}).some(value=>value!==''&&value!==null&&value!==undefined)}
function unallocatedHistoricalCost(){
 const keys=Array.from({length:9},(_,i)=>'2026-'+String(i+1).padStart(2,'0'));
 if(keys.every(hasMonthlyCost))return 0;
 return Math.max(0,446100-keys.reduce((sum,key)=>sum+sumCost(key),0));
}
function annualExternalCost(key){
 const year=key.slice(0,4),opening=year==='2026'&&key>='2026-10'?unallocatedHistoricalCost():0;
 const keys=new Set([...Object.keys(db.quotes),...Object.keys(db.monthlyExternalCosts||{})]);
 return opening+[...keys].filter(m=>m<=key&&m.slice(0,4)===year).reduce((sum,m)=>sum+sumCost(m),0);
}
let costYear='',costEntryMonth='';
let vendorSearch='',vendorSortKey='frequency',vendorSortDir=-1;
const vendorInfoFields=[['name','廠商名稱'],['cycleDays','校驗週期（天）'],['contact','聯絡人'],['contactMethod','聯絡方式'],['email','E-mail'],['notes','備註']];
function vendorContacts(v){
 if(Array.isArray(v.contacts)&&v.contacts.length)return v.contacts.map((c,i)=>({name:String(c.name||''),method:String(c.method||''),email:String(c.email===undefined&&i===0?v.email||'':c.email||'')})).filter(c=>c.name||c.method||c.email);
 return v.contact||v.contactMethod||v.email?[{name:v.contact||'',method:v.contactMethod||'',email:v.email||''}]:[];
}
function vendorInfoValue(v,key){if(['contact','contactMethod','email'].includes(key))return vendorContacts(v).map(c=>key==='contact'?c.name:key==='email'?c.email:c.method).join('\n');return key==='cycleDays'?vendorCycleStats(v).days??'':v[key]??''}
function vendorInfoCell(v,key){
 if(key==='name')return `<strong class="vendor-name-main">${esc(v.name)}</strong>${v.vendorNote?`<span class="vendor-name-note">${esc(v.vendorNote)}</span>`:''}`;
 if(key==='cycleDays'){const stats=vendorCycleStats(v);return `<button class="vendor-cycle-history" aria-label="查看 ${esc(v.name)} 校驗週期紀錄" title="${stats.count?'依 '+stats.count+' 台設備平均計算':'查看校驗週期紀錄'}" onclick="showVendorCycleHistory('${esc(v.id)}')">${stats.days==null?'—':esc(stats.days)+' 天'}</button>`}
 if(['contact','contactMethod','email'].includes(key)){const contacts=vendorContacts(v);return contacts.length?contacts.map((c,i)=>`<div class="vendor-contact-line">${contacts.length>1?`<small>${i+1}.</small> `:''}${esc(key==='contact'?c.name:key==='email'?c.email:c.method)||'—'}</div>`).join(''):'—'}
 return esc(v[key])||'—';
}
let vendorContactSequence=0;
function vendorContactRow(contact){
 const index=vendorContactSequence++,suffix=index?'_'+index:'';
 return `<div class="vendor-contact-pair"><label>聯絡人<input id="vendor_contact${suffix}" data-vendor-contact-name value="${esc(contact.name||'')}" autocomplete="off"></label><label>聯絡方式<input id="vendor_contactMethod${suffix}" data-vendor-contact-method value="${esc(contact.method||'')}" autocomplete="tel"></label><label>E-mail<input id="vendor_email${suffix}" type="email" data-vendor-contact-email value="${esc(contact.email||'')}" autocomplete="email"></label>${index?'<button type="button" class="vendor-contact-remove danger" aria-label="移除這位聯絡人" onclick="removeVendorContact(this)">移除</button>':'<span></span>'}</div>`;
}
function addVendorContact(){const container=$('vendorContactRows');if(!container)return;container.insertAdjacentHTML('beforeend',vendorContactRow({}));container.lastElementChild.querySelector('input').focus()}
function removeVendorContact(button){button.closest('.vendor-contact-pair').remove()}
function showVendorCycleHistory(id){
 const vendor=(db.externalVendors||[]).find(v=>v.id===id);if(!vendor)return;
 const entries=vendorCalibrationHistory(vendor),stats=vendorCycleStats(vendor),years=[...new Set(entries.map(e=>e.month.slice(0,4)))].sort().reverse();
 modal(vendor.name+'｜校驗週期紀錄',`<div class="vendor-history-overview">${stats.days==null?'尚無校驗週期':(stats.count?'平均校驗週期：':'手動校驗週期：')+esc(stats.days)+' 天'}${entries.length?' · '+entries.length+' 筆紀錄'+(stats.count<entries.length?'，'+stats.count+' 台可計算':''):''}</div><div class="vendor-history-groups">${years.map(year=>`<details class="vendor-history-year" open><summary>${esc(year)}年</summary>${[...new Set(entries.filter(e=>e.month.startsWith(year+'-')).map(e=>e.month))].sort().reverse().map(month=>`<section class="vendor-history-month"><h3>${Number(month.slice(5))}月</h3><table><thead><tr><th>設備編號</th><th>設備名稱</th><th>校驗週期</th></tr></thead><tbody>${entries.filter(e=>e.month===month).map(e=>`<tr title="${e.dateType}：${esc(e.start)||'未設定'}；校驗：${esc(e.date)}${e.days==null?'；缺少有效寄出／收件日期或日期先後不正確':''}"><td>${esc(e.id)}</td><td>${esc(e.name)}</td><td>${e.days==null?'—':esc(e.days)+' 天'}</td></tr>`).join('')}</tbody></table></section>`).join('')}</details>`).join('')||''}</div>`,null,'',false);
 $('dialog').classList.add('vendor-history-dialog');
}

function vendorInfoList(search=vendorSearch){
 const needle=search.trim().toLocaleLowerCase();
 return (db.externalVendors||[]).filter(v=>!needle||[...vendorInfoFields,['vendorNote','廠商備註']].some(([key])=>String(vendorInfoValue(v,key)).toLocaleLowerCase().includes(needle))).sort((a,b)=>{
  if(vendorSortKey==='frequency')return (vendorCalibrationItemCount(a)-vendorCalibrationItemCount(b))*vendorSortDir||String(a.name).localeCompare(String(b.name),'zh-Hant',{numeric:true});
  if(vendorSortKey==='cycleDays'){const left=vendorCycleStats(a).days==null?Infinity:Number(vendorCycleStats(a).days),right=vendorCycleStats(b).days==null?Infinity:Number(vendorCycleStats(b).days);return (left-right||String(a.name).localeCompare(String(b.name),'zh-Hant'))*vendorSortDir}
  return String(vendorInfoValue(a,vendorSortKey)).localeCompare(String(vendorInfoValue(b,vendorSortKey)),'zh-Hant',{numeric:true})*vendorSortDir;
 });
}
function vendorInfoRows(){return vendorInfoList().map(v=>`<tr>${vendorInfoFields.map(([key])=>`<td>${vendorInfoCell(v,key)}</td>`).join('')}<td><div class="registry-actions"><button class="registry-edit" aria-label="編輯廠商 ${esc(v.name)}" title="編輯" onclick="editVendorInfo('${esc(v.id)}')"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m16 3 5 5M3 21l5-1 13-13a2.1 2.1 0 0 0-5-5L3 15z"/><path d="m3 15 5 5"/></svg></button><button class="registry-delete" aria-label="刪除廠商 ${esc(v.name)}" title="刪除" onclick="deleteVendorInfo('${esc(v.id)}')"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/></svg></button></div></td></tr>`).join('')||'<tr><td colspan="7" class="empty vendor-info-empty">'+((db.externalVendors||[]).length?'沒有符合條件的廠商':'尚未新增廠商')+'</td></tr>'}
function searchVendorInfo(value){vendorSearch=value;$('vendorInfoRows').innerHTML=vendorInfoRows()}
function sortVendorInfo(key){vendorSortDir=vendorSortKey===key?-vendorSortDir:1;vendorSortKey=key;renderVendorInfo()}
function renderVendorInfo(){
 $('content').innerHTML=`<div class="vendor-info-workspace"><div class="toolbar"><input class="search vendor-info-search" aria-label="搜尋外校廠商資訊" placeholder="搜尋廠商、聯絡人或聯絡方式" value="${esc(vendorSearch)}" oninput="searchVendorInfo(this.value)"><span class="spacer"></span><button class="primary" onclick="editVendorInfo()">＋ 新增廠商</button></div><div class="tablewrap"><table class="vendor-info-table"><thead><tr>${vendorInfoFields.map(([key,label])=>`<th><button class="registry-column-sort" onclick="sortVendorInfo('${key}')">${label} <span aria-hidden="true">${vendorSortKey===key?(vendorSortDir===1?'↑':'↓'):'↕'}</span></button></th>`).join('')}<th aria-label="操作"></th></tr></thead><tbody id="vendorInfoRows">${vendorInfoRows()}</tbody></table></div></div>`;
}
function renameVendorReferences(vendor,name){
 const affected=new Set(),previousNames=new Set();
 for(const r of db.rows)if(['外校','遊校'].includes(r.type)&&(r.vendorInfoId===vendor.id||!(db.externalVendors||[]).some(v=>v.id===r.vendorInfoId)&&String(r.vendor||'').trim().toLocaleLowerCase()===vendor.name.trim().toLocaleLowerCase())){affected.add(r.key);previousNames.add(r.vendor);r.vendor=name;r.vendorInfoId=vendor.id}
 for(const [id,state]of Object.entries(db.events))if(state.signature?.split(',').some(key=>affected.has(key)))for(const previous of previousNames)if(previous&&id.endsWith('_'+previous)){const next=id.slice(0,-previous.length)+name;if(next!==id&&!db.events[next]){db.events[next]=state;delete db.events[id]}break}
}
function editVendorInfo(id){
 if(window.Cloud&&!Cloud.canWrite())return toast('此帳號僅供檢視');
 const vendor=(db.externalVendors||[]).find(v=>v.id===id);if(id&&!vendor)return;
 const current=vendor||{};const cycleStats=vendor?vendorCycleStats(vendor):{count:0,days:null};
 vendorContactSequence=0;const contacts=vendorContacts(current);if(!contacts.length)contacts.push({});
 modal(id?'編輯外校廠商':'新增外校廠商',`<form id="vendorInfoForm"><div class="formgrid"><label class="field">廠商名稱<input id="vendor_name" required maxlength="200" value="${esc(current.name||'')}"></label><label class="field">廠商備註<input id="vendor_vendorNote" value="${esc(current.vendorNote||'')}" placeholder="顯示於廠商名稱下方"></label><label class="field">校驗週期（天）<input id="vendor_cycleDays" type="number" min="0" step="any" ${cycleStats.count?'disabled title="依設備日期自動計算"':''} value="${esc(cycleStats.count?cycleStats.days:current.cycleDays??'')}"></label><section class="vendor-contact-editor full"><div class="vendor-contact-heading"><h3>聯絡資料</h3><button type="button" onclick="addVendorContact()">＋ 新增聯絡人</button></div><div id="vendorContactRows">${contacts.map(vendorContactRow).join('')}</div></section><label class="field full">備註<textarea id="vendor_notes" rows="3">${esc(current.notes||'')}</textarea></label></div></form>`,()=>{
  const form=$('vendorInfoForm');if(!form.reportValidity())return;
  const next=Object.fromEntries(['name','vendorNote','cycleDays','notes'].map(key=>[key,$('vendor_'+key).value.trim()]));next.contacts=[...$('vendorContactRows').querySelectorAll('.vendor-contact-pair')].map(row=>({name:row.querySelector('[data-vendor-contact-name]').value.trim(),method:row.querySelector('[data-vendor-contact-method]').value.trim(),email:row.querySelector('[data-vendor-contact-email]').value.trim()})).filter(c=>c.name||c.method||c.email);next.contact=next.contacts[0]?.name||'';next.contactMethod=next.contacts[0]?.method||'';next.email=next.contacts[0]?.email||'';
  if(!next.name)return toast('請填寫廠商名稱');
  if((db.externalVendors||[]).some(v=>v.id!==id&&v.name.trim().toLocaleLowerCase()===next.name.toLocaleLowerCase()))return toast('廠商名稱已存在');
  next.cycleDays=cycleStats.count?current.cycleDays??null:next.cycleDays===''?null:Number(next.cycleDays);
  if(next.cycleDays!==null&&(!Number.isFinite(next.cycleDays)||next.cycleDays<0))return toast('請填寫有效的校驗天數');
  db.externalVendors??=[];
  if(vendor){if(vendor.name!==next.name)renameVendorReferences(vendor,next.name);Object.assign(vendor,next)}else db.externalVendors.push({id:uid(),...next});
  closeModal();save();toast(id?'廠商資訊已更新':'廠商已新增');
 });
 $('dialog').classList.add('vendor-edit-dialog');
 $('vendorInfoForm').onsubmit=event=>{event.preventDefault();$('modalSave').click()};
}
function deleteVendorInfo(id){
 if(window.Cloud&&!Cloud.canWrite())return toast('此帳號僅供檢視');
 const vendor=(db.externalVendors||[]).find(v=>v.id===id);if(!vendor)return;
 modal('刪除外校廠商',`<p>確定刪除「${esc(vendor.name)}」的廠商資訊？</p><p class="muted">設備清冊、校驗進度與費用紀錄會保留。</p>`,()=>{db.externalVendors=db.externalVendors.filter(v=>v.id!==id);closeModal();save();toast('廠商資訊已刪除')},'確認刪除');
}

function renderCost(){
 const current=today().slice(0,7),currentYear=current.slice(0,4);
 costYear=costYear||currentYear;costEntryMonth=costEntryMonth||current.slice(5);
 const entryKey=costYear+'-'+costEntryMonth;
 const years=[...new Set([currentYear,String(Number(currentYear)-1),String(Number(currentYear)+1),costYear,...db.rows.map(r=>r.month.slice(0,4)),...Object.keys(db.quotes).map(m=>m.slice(0,4)),...Object.keys(db.monthlyExternalCosts||{}).map(m=>m.slice(0,4))])].filter(y=>/^\d{4}$/.test(y)).sort();
 $('content').innerHTML=`<div class="cost-workspace yearly-cost-workspace"><div class="annual-cost-summary"><label>年度外校總金額</label><strong id="cost-year-total">NT$ ${annualExternalCost(costYear+'-12').toLocaleString()}</strong></div><div class="annual-cost-controls"><label class="cost-year-control">年份<select aria-label="外校金額年份" onchange="costYear=this.value;render()">${years.map(year=>`<option ${year===costYear?'selected':''}>${year}</option>`).join('')}</select></label><label class="monthly-total-control">${Number(costEntryMonth)} 月外校總金額<input id="monthly-external-total" class="money" type="number" min="0" step="1" aria-label="所選月份外校總金額" data-month="${entryKey}" value="${sumCost(entryKey)}" oninput="saveMonthlyExternalCost(this)" onchange="finishMonthlyExternalCost(this)"></label></div><div class="tablewrap annual-cost-table"><table><thead><tr><th>月份</th><th>外校金額</th></tr></thead><tbody>${costYear==='2026'?`<tr class="opening-cost-row" ${unallocatedHistoricalCost()===0?'hidden':''}><td>1–9 月歷史累計（尚未分月）</td><td>NT$ ${unallocatedHistoricalCost().toLocaleString()}</td></tr>`:''}${Array.from({length:12},(_,i)=>{const key=costYear+'-'+String(i+1).padStart(2,'0'),legacy=costYear==='2026'&&i<9;return `<tr data-cost-month="${key}" tabindex="0" role="button" aria-label="編輯 ${i+1} 月外校金額" onclick="selectCostEntryMonth(this.dataset.costMonth)" onkeydown="if(['Enter',' '].includes(event.key)){event.preventDefault();selectCostEntryMonth(this.dataset.costMonth)}" class="${key===current?'current-cost-month':''} ${key===entryKey?'selected-cost-month':''}"><td>${i+1} 月${key===current?' <span class="current-month-tag">本月</span>':''}</td><td>${legacy&&!hasMonthlyCost(key)?'—':'NT$ '+sumCost(key).toLocaleString()}</td></tr>`}).join('')}</tbody></table></div></div>`;
}
function selectCostEntryMonth(key){
 if(!/^\d{4}-\d{2}$/.test(key))return;
 costYear=key.slice(0,4);costEntryMonth=key.slice(5);render();
 const input=$('monthly-external-total');input.focus({preventScroll:true});input.select();
}
function saveMonthlyExternalCost(input){
 const value=input.value===''?0:Number(input.value);
 if(!input.validity.valid||!Number.isInteger(value)||value<0){input.setAttribute('aria-invalid','true');return}
 input.removeAttribute('aria-invalid');db.monthlyExternalCosts??={};db.monthlyExternalCosts[input.dataset.month]=value;persist();
 $('cost-year-total').textContent='NT$ '+annualExternalCost(costYear+'-12').toLocaleString();
 const cell=document.querySelector(`[data-cost-month="${input.dataset.month}"] td:last-child`);if(cell)cell.textContent='NT$ '+value.toLocaleString();
 const opening=document.querySelector('.opening-cost-row');if(opening){const remaining=unallocatedHistoricalCost();opening.hidden=remaining===0;opening.lastElementChild.textContent='NT$ '+remaining.toLocaleString()}
}
function finishMonthlyExternalCost(input){
 if(input.getAttribute('aria-invalid')){toast('金額需為非負整數');input.value=sumCost(input.dataset.month);input.removeAttribute('aria-invalid')}
 if(input.value==='')input.value=0;
 saveMonthlyExternalCost(input);
}
function renderReport(){
 const reportDatabase=db;
 const previous=$('reportframe')?.contentWindow;
 if(previous&&typeof previous.appSaveDraftNow==='function')previous.appSaveDraftNow();
 $('content').innerHTML=`<iframe id="reportframe" class="report-workspace report-initializing" title="量測設備校驗管理月報" src="report.html?v=20261030-145"></iframe>`;
 $('reportframe').onload=()=>{
  const w=$('reportframe').contentWindow;
  try{
   const frame=$('reportframe');
   w.document.body.classList.add('report-embedded');
   const fit=()=>{if(frame.isConnected&&typeof w.fitPreview==='function')w.fitPreview()};
   const observer=new ResizeObserver(fit);observer.observe(frame);
   w.addEventListener('pagehide',()=>observer.disconnect(),{once:true});fit();
   w.reportDataSource=key=>{const equipment=db.rows.filter(r=>r.month===key&&!inactiveEquipment(r));return{total:equipment.length,internal:equipment.filter(r=>r.type==='內校').length,external:equipment.filter(r=>r.type==='外校'||r.type==='遊校').length,cost:sumCost(key)}};
   w.reportEquipmentSource=(key,code)=>{const row=db.rows.find(r=>r.month===key&&r.id.trim().toLowerCase()===String(code).trim().toLowerCase());return row?structuredClone(row):null};
   w.reportRecordSource=key=>db.reports[key]?structuredClone(db.reports[key]):null;
   w.reportPersistRecord=(key,record)=>{if(db!==reportDatabase||window.Cloud&&!Cloud.canWrite())return;db.reports[key]=structuredClone(record);persist()};
   w.reportMonthChanged=key=>{month=key;$('monthbox').innerHTML=''};
   w.appAnnualTotal=()=>annualExternalCost(w.document.getElementById('monthInput').value);
   w.document.getElementById('monthInput').disabled=false;
   w.appLoadMonth(month,{animate:false});
   if(window.Cloud&&!Cloud.canWrite()){w.document.querySelectorAll('input,textarea,select,button').forEach(el=>{if(!['monthInput','exportPdfBtn'].includes(el.id))el.disabled=true})}
   Promise.resolve(w.document.fonts.ready).then(()=>requestAnimationFrame(()=>requestAnimationFrame(()=>{
    if(!frame.isConnected)return;
    w.fitSingleReport();fit();frame.classList.remove('report-initializing');revealPageTransition();
   })));
  }catch(error){clearPageTransition();$('reportframe')?.classList.remove('report-initializing');toast('月報載入失敗：'+error.message)}
 };
}
function ensureImportLinks(){
 const legacy=new Set(db.imports.filter(i=>!i.id));
 for(const entry of db.imports){entry.id??=uid();entry.rowKeys??=[];entry.vendors??={}}
 for(const row of db.rows){
  if(!row.sourceImport){const entry=db.imports.find(i=>legacy.has(i)&&i.months.includes(row.month));if(entry)row.sourceImport=entry.id}
  const entry=db.imports.find(i=>i.id===row.sourceImport);if(!entry)continue;
  if(!entry.rowKeys.includes(row.key))entry.rowKeys.push(row.key);
  if(row.type!=='內校'){entry.vendors[row.month]??=[];const vendor=row.vendor||'未指定廠商';if(!entry.vendors[row.month].includes(vendor))entry.vendors[row.month].push(vendor)}
 }
}
function deleteImport(id){
 const entry=db.imports.find(i=>i.id===id);if(!entry)return;
 showImportDeleteConfirmation(entry,1);
}
function showImportDeleteConfirmation(entry,stage){
 const message=stage===1?`你確定要刪除"${entry.file}"，所有相關資料將會消失`:'你真的確定要刪除???';
 modal('確認刪除',`<p class="import-delete-message">${esc(message)}</p><div class="modal-actions"><button type="button" onclick="closeModal()">取消</button><button type="button" class="import-delete-confirm" id="confirmImportDelete">${stage===1?'確定':'確定刪除'}</button></div>`,null,'',false);
 $('confirmImportDelete').onclick=()=>{if(stage===1)showImportDeleteConfirmation(entry,2);else{closeModal();removeImportData(entry.id)}};
 $('modal').querySelector('.modal-actions button').focus();
}
function removeImportData(id){
 const entry=db.imports.find(i=>i.id===id);if(!entry)return;
 const removed=new Set(entry.rowKeys||[]),affected=new Set(entry.months);
 // A later import may retain a device key; its current data belongs to that later file.
 for(const row of db.rows)if(row.sourceImport!==id)removed.delete(row.key);
 db.rows=db.rows.filter(r=>r.sourceImport!==id);
 for(const [key,state]of Object.entries(db.events))if(state.signature?.split(',').some(k=>removed.has(k)))delete db.events[key];
 db.manual=db.manual.filter(e=>e.sourceImport!==id);
 for(const m of affected){
  for(const vendor of entry.vendors?.[m]||[])if(!db.rows.some(r=>r.month===m&&r.type!=='內校'&&(r.vendor||'未指定廠商')===vendor))delete (db.quotes[m]||{})[vendor];
  if(!db.rows.some(r=>r.month===m))delete db.quotes[m];
  delete db.reports[m];localStorage.removeItem('calibration:'+m);
 }
 for(const name of ['calibrationV41.history','calibrationV41.drafts']){
  const key=window.Cloud?.isConnected()?Cloud.reportKey(name):name;
  const raw=localStorage.getItem(key);if(!raw)continue;
  try{const store=JSON.parse(raw);for(const m of affected)delete store[m];localStorage.setItem(key,JSON.stringify(store))}catch{localStorage.removeItem(key)}
 }
 // Remove the old migration snapshot, which could otherwise retain deleted equipment.
 localStorage.removeItem(KEY+'-before-real-sample-v1');
 db.imports=db.imports.filter(i=>i.id!==id);
 for(const m of affected)delete (db.settings.monthFilterMemory||{})[m];loadMonthlyFilters();save();toast('檔案及相關資料已刪除');
}
function renderImport(){
 ensureImportLinks();persist();
 $('content').innerHTML=`<div class="import-workspace"><div class="upload"><div class="import-upload-icon" aria-hidden="true"><svg viewBox="0 0 64 64" width="62" height="62" fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"><path d="M32 39V8M19 21 32 8l13 13M9 40v16h46V40"/></svg></div><button class="primary" onclick="document.getElementById('excelFile').click()">選擇 Excel 檔案</button><input id="excelFile" type="file" accept=".xlsx" hidden onchange="importExcel(this.files[0]);this.value=''"/></div><h2>匯入紀錄</h2><div class="tablewrap"><table><thead><tr><th>來源檔案</th><th>月份</th><th>設備數</th><th>匯入時間</th><th></th></tr></thead><tbody>${db.imports.map(i=>`<tr><td>${esc(i.file)}</td><td>${i.months.map(esc).join('、')}</td><td>${i.count}</td><td>${esc(i.at)}</td><td><button class="registry-delete" aria-label="刪除 ${esc(i.file)}" title="刪除" onclick="deleteImport('${i.id}')"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/></svg></button></td></tr>`).join('')||'<tr><td colspan="5" class="muted">尚無匯入紀錄</td></tr>'}</tbody></table></div></div>`;
}
function parseDate(v){v=String(v||'').trim();if(/^\d+(\.\d+)?$/.test(v)&&+v>10000)return new Date(Date.UTC(1899,11,30)+Math.floor(+v)*86400000).toISOString().slice(0,10);let m=v.match(/^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})/);if(!m)return '';let d=m[1]+'-'+m[2].padStart(2,'0')+'-'+m[3].padStart(2,'0');return new Date(d+'T12:00:00').getDate()===+m[3]?d:''}
function confirmIncompleteImport(issues,needsMonth){
 return new Promise(resolve=>{
  let settled=false;const dialog=$('dialog');
  const finish=value=>{if(settled)return;settled=true;dialog.removeEventListener('close',cancel);resolve(value)};
  const cancel=()=>finish(null);
  modal('匯入資料不完整',`<p>以下資料不完整，是否仍要匯入？</p><ul class="import-issues">${issues.map(issue=>`<li>${esc(issue)}</li>`).join('')}</ul>${needsMonth?`<label class="field">缺少有效日期的設備歸入月份<input id="incompleteImportMonth" type="month" value="${/^\d{4}-\d{2}$/.test(month)?month:today().slice(0,7)}"></label>`:''}`,()=>{
   const target=needsMonth?$('incompleteImportMonth').value:month;if(needsMonth&&!/^\d{4}-\d{2}$/.test(target))return toast('請選擇歸入月份');
   finish(target);closeModal();
  },'仍要匯入');
  dialog.addEventListener('close',cancel,{once:true});
 });
}
function addEquipmentExcel(file){if(!file)return;closeModal();return importExcel(file,{append:true})}
function confirmAdditionalMonths(otherMonths){
 return new Promise(resolve=>{
  let settled=false;const dialog=$('dialog');
  const finish=value=>{if(settled)return;settled=true;dialog.removeEventListener('close',cancel);resolve(value)};
  const cancel=()=>finish(false);
  modal('確認新增設備',`<p>目前清冊月份：${esc(month||'尚未指定')}</p><p>Excel 包含不同年月的設備：${otherMonths.map(esc).join('、')}。是否一併新增至對應月份？</p>`,()=>{finish(true);closeModal()},'確認新增');
  dialog.addEventListener('close',cancel,{once:true});
 });
}
async function appendEquipmentImport(file,model,incoming,monthConfirmed=false){
 const otherMonths=[...new Set(incoming.map(r=>r.month))].filter(m=>m!==month);
 if(!monthConfirmed&&otherMonths.length&&!await confirmAdditionalMonths(otherMonths))return;
 const existing=new Set(db.rows.filter(r=>r.id).map(r=>r.month+'|'+r.id));
 const additions=incoming.filter(r=>!r.id||!existing.has(r.month+'|'+r.id)),skipped=incoming.length-additions.length;
 if(!additions.length)return toast('沒有可新增的設備；同月份已有相同設備編號');
 ensureImportLinks();const importId=uid();
 for(const r of additions)r.sourceImport=importId;
 db.rows.push(...additions);
 db.settings.importColumns=[...new Set([...(db.settings.importColumns||[]),...(model.sourceHeaders||model.headers||[])])];
 db.imports.unshift({id:importId,file:file.name,months:[...new Set(additions.map(r=>r.month))],count:additions.length,at:new Date().toLocaleString('zh-TW'),mode:'append'});
 ensureImportLinks();if(monthConfirmed)month=additions[0].month;save();toast(`已新增 ${additions.length} 台設備${skipped?'，略過 '+skipped+' 台同月份重複設備':''}`);
}
function confirmImportTargetMonth(file,incoming,append=false){
 const counts=new Map();for(const row of incoming)if(row.due){const key=row.due.slice(0,7);counts.set(key,(counts.get(key)||0)+1)}
 const effective=[...counts].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]));
 const initial=effective[0]?.[0]||month||today().slice(0,7);
 return new Promise(resolve=>{
  let settled=false;const dialog=$('dialog');
  const finish=value=>{if(settled)return;settled=true;dialog.removeEventListener('close',cancel);resolve(value)};
  const cancel=()=>{if(!dialog.open)finish(null)};
  modal(append?'確認新增年月':'確認匯入年月',`<p>${esc(file.name)} · ${incoming.length} 筆設備</p><p class="muted">清冊有效年月：${effective.length?effective.map(([key,count])=>esc(key)+'（'+count+' 筆）').join('、'):'未提供有效年月'}</p><label class="field">${append?'新增至年月':'匯入至年月'}<input id="importTargetMonth" type="month" required value="${initial}" oninput="updateImportTargetHint(${append})"></label><p class="muted">所有設備依你確認的年月歸入清冊，原有效日期保持不變。</p><p id="importTargetHint" class="import-target-hint" role="status"></p>`,()=>{
   const target=$('importTargetMonth').value;
   if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(target))return toast('請選擇要匯入的年月');
   finish(target);closeModal();
  },append?'確認新增':'確認匯入');
  dialog.addEventListener('close',cancel);updateImportTargetHint(append);
 });
}
function updateImportTargetHint(append){
 const target=$('importTargetMonth')?.value,count=db.rows.filter(r=>r.month===target).length;
 $('importTargetHint').textContent=!target?'請選擇歸入年月':count?`${target} 已有 ${count} 筆設備。本次只新增設備，保留原有清冊與進度；同月份重複編號會略過。`:'本次將新增設備至 '+target+'，保留其他月份資料。';
}

async function importExcel(file,options={}){if(!file)return;try{toast('正在檢查清冊…');let model=await Organizer.parse(await file.arrayBuffer(),{allowIncomplete:true}),incoming=[],seen=new Set(),issues=(model.warnings||[]).filter(w=>w.startsWith('缺少欄位'));for(let raw of model.all){let x=Object.fromEntries(Object.entries(raw).map(([k,v])=>[k,v.value]));let due=parseDate(x['有效日期']),id=String(x['量測/監控設備編號']||'').trim(),type=String(x['校驗方式']||'').trim();const missing=[];if(!due)missing.push('有效日期空白或格式錯誤');if(!id)missing.push('設備編號空白');if(!['內校','外校','遊校'].includes(type))missing.push('校驗方式空白或無法分類');if(!String(x['名稱']||'').trim())missing.push('設備名稱空白');if(missing.length)issues.push((id||'第 '+(incoming.length+1)+' 筆')+'：'+missing.join('、'));let m=due.slice(0,7),k=m+'|'+id;if(id&&seen.has(k))throw Error((m||'未指定月份')+' 設備編號重複：'+id);if(id)seen.add(k);incoming.push({key:uid(),month:m,id,name:x['名稱']||'',asset:x['資產編號']||'',unit:x['保管單位']||'',owner:x['保管人']||'',vendor:x['實驗室/廠商']||x['實驗室／廠商']||x['實驗室']||'',type,due,instrumentStatus:String(x['儀器狀態']??'').trim(),p:[],date:'',completed:'',mode:'收件',extra:x})}if(issues.length&&await confirmIncompleteImport(issues,false)===null)return;const targetMonth=await confirmImportTargetMonth(file,incoming,!!options.append);if(targetMonth===null)return;for(const row of incoming)row.month=targetMonth;const finalIds=new Set();for(const r of incoming)if(r.id){const idKey=r.month+'|'+r.id;if(finalIds.has(idKey))throw Error(r.month+' 設備編號重複：'+r.id);finalIds.add(idKey)}return await appendEquipmentImport(file,model,incoming,true)}catch(e){toast(e.message)}}
function download(data,name,type='application/json'){let url=URL.createObjectURL(data instanceof Blob?data:new Blob([data],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
async function exportExcel(){
 try{
  const columns=registryColumns().map(([key,label])=>({key,label}));
  const sheets=['內校','外校／遊校'].map(type=>{
   const list=rows().filter(r=>type==='內校'?r.type==='內校':r.type!=='內校').sort((a,b)=>Number(inactiveEquipment(a))-Number(inactiveEquipment(b))||String(equipmentValue(a,sortKey)||'').localeCompare(String(equipmentValue(b,sortKey)||''),'zh-Hant')*sortDir);
   return{name:type==='內校'?'內校':'外校及遊校',visibleKeys:columns.filter(c=>columnVisible(c.key,type)).map(c=>c.key),filters:Object.entries(registryFilters[type]||{}).map(([key,values])=>({key,values})),rows:list.map(r=>({values:columns.map(c=>equipmentValue(r,c.key)),inactive:inactiveEquipment(r),hidden:!equipmentMatchesQuery(r)||!registryMatches(r,null,type)}))};
  });
  const workbook=await RegistryWorkbook.build({columns,sheets,month});
  download(workbook,'量測監控設備清冊_'+month.slice(2).replace('-','')+'.xlsx');
  toast('已匯出內外校清冊，保留目前篩選狀態');
 }catch(error){toast('匯出失敗：'+error.message)}
}
function renderBackup(){
 const icon=direction=>`<div class="backup-transfer-icon" aria-hidden="true"><svg viewBox="0 0 64 64" width="62" height="62" fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"><path d="${direction==='down'?'M32 8v31M19 26l13 13 13-13':'M32 39V8M19 21 32 8l13 13'}M9 40v16h46V40"/></svg></div>`;
 $('content').innerHTML=`<div class="backup-workspace"><div class="cards"><section class="panel">${icon('down')}<h2>完整資料備份</h2><p class="muted">${months().length} 個月份 · ${db.rows.length} 筆設備</p><button class="primary" onclick="backup()">匯出完整備份</button></section><section class="panel">${icon('up')}<h2>從備份還原</h2><button onclick="document.getElementById('restoreFile').click()">選擇備份檔</button><input id="restoreFile" type="file" accept=".json" hidden onchange="restore(this.files[0]);this.value='' "></section></div></div>`;
}
async function hash(s){let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return (h>>>0).toString(16)}
function reportStorage(){const result={};for(const name of ['calibrationV41.history','calibrationV41.drafts']){const key=window.Cloud?.isConnected()?Cloud.reportKey(name):name;if(localStorage.getItem(key))result[name]=localStorage.getItem(key)}return result}
async function backup(){let payload={db,reportStorage:reportStorage()},raw=JSON.stringify(payload);download(JSON.stringify({format:'aming-calibration',version:1,createdAt:new Date().toISOString(),checksum:await hash(raw),payload}),'儀校完整備份_'+today()+'.json');toast('完整備份已匯出')}
async function restore(file){if(!file)return;if(window.Cloud?.isConnected())return Cloud.restoreBackup(file);try{let b=JSON.parse(await file.text());if(b.format!=='aming-calibration'||b.version!==1||!b.payload||b.checksum!==await hash(JSON.stringify(b.payload)))throw Error('格式或完整性檢查失敗');let d=b.payload.db;if(!Array.isArray(d.rows)||!Array.isArray(d.manual)||!d.events||!d.quotes||!d.settings||!Array.isArray(d.imports)||!d.reports||d.rows.some(r=>!r.key||!r.id||!r.month||!Array.isArray(r.p)))throw Error('備份缺少必要資料');if(!confirm('將完整取代目前所有月份資料，確定還原？'))return;const old=Object.fromEntries(Object.keys(localStorage).map(k=>[k,localStorage.getItem(k)]));try{localStorage.clear();for(let[k,v]of Object.entries(b.payload.reportStorage||{}))localStorage.setItem(k,v);localStorage.setItem(KEY,JSON.stringify(d))}catch(e){localStorage.clear();for(let[k,v]of Object.entries(old))localStorage.setItem(k,v);throw e}db=d;initializeMonthlyFilters();loadMonthlyFilters();save();toast('已完成還原')}catch(e){toast('還原失敗，原資料保留：'+e.message)}}
function resetDemo(){if(confirm('清除目前 DEMO 資料並恢復示範資料？')){db=seed();save();toast('已恢復示範資料')}}
new ResizeObserver(()=>updateSidebarIndicator()).observe($('nav'));
persist();render();setInterval(()=>{if(!$('dialog').open){if(page==='calendar')renderCalendar();else if(page==='dashboard')renderDashboard()}},60000);
