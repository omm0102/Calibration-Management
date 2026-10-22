'use strict';
const $=id=>document.getElementById(id), esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const iso=d=>new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10), today=()=>iso(new Date()), add=(s,n)=>{let d=new Date(s+'T12:00:00');d.setDate(d.getDate()+n);return iso(d)}, uid=()=>Array.from(crypto.getRandomValues(new Uint8Array(16)),x=>x.toString(16).padStart(2,'0')).join('');
const KEY='aming-calibration-demo-v1';let page='calendar',month='2026-10',tab='內校',query='',status='all',offset=0,calendarMonth='',selectedWeek=false;
const nav=[['量測設備校驗管理',[['calendar','行事曆','▦'],['registry','設備管理清冊','▤'],['report','設備管理月報','▧']]],['外校管理',[['external','外校進度','◷'],['cost','外校金額','＄']]],['內校管理',[['internal','內校進度','◴']]],['其他功能',[['import','資料匯入管理','↥'],['backup','備份與還原','⧉']]]];
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
function persist(){localStorage.setItem(KEY,JSON.stringify(db))}function save(){persist();render()}function toast(t){$('toast').textContent=t;$('toast').classList.add('visible');setTimeout(()=>$('toast').classList.remove('visible'),2500)}
const rows=()=>db.rows.filter(r=>r.month===month);const months=()=>[...new Set(db.rows.map(r=>r.month))].sort();const complete=r=>!!r.p[r.type==='內校'?2:r.type==='外校'?4:3];const stages=r=>r.type==='內校'?['預計校驗日','收件確認','已完成']:r.type==='外校'?['已提供報價單','請購單','外送單','寄出／收件時間','已完成']:['已提供報價單','請購單','遊校日期','已完成'];
function go(p){page=p;query='';status='all';render()}window.go=go;
function hasMissingExternalVendor(){return db.rows.some(r=>['外校','遊校'].includes(r.type)&&!String(r.vendor??'').trim())}
function render(){document.body.dataset.page=page;closeRegistryFilter();let ms=months();if(page!=='report'&&!ms.includes(month))month=ms.includes(today().slice(0,7))?today().slice(0,7):ms.at(-1)||'';$('nav').innerHTML=nav.map(([g,items])=>`<div class="navgroup"><label>${g}</label>${items.map(([id,t,ic])=>`<button class="${page===id?'active':''} ${id==='registry'?'registry-nav-button':''}" onclick="go('${id}')"><span class="ico">${ic}</span>${t}${id==='registry'&&hasMissingExternalVendor()?'<span class="registry-warning-badge" role="img" aria-label="外校設備未填寫廠商" title="外校設備未填寫廠商">!!!</span>':''}</button>`).join('')}</div>`).join('');$('title').textContent=nav.flatMap(n=>n[1]).find(n=>n[0]===page)[1];$('monthbox').innerHTML=!['calendar','import','backup','registry','report','external'].includes(page)?`<select onchange="month=this.value;render()" ${ms.length?'':'disabled'}>${ms.map(m=>`<option ${m===month?'selected':''}>${m}</option>`).join('')}</select>`:'';({calendar:renderCalendar,registry:renderRegistry,external:renderProgress,internal:renderProgress,cost:renderCost,report:renderReport,import:renderImport,backup:renderBackup}[page])()}
// Fixed monthly tasks start in the month this feature is first enabled.
function fixedMonthlyEvents(){
 if(!db.settings.fixedScheduleStart){db.settings.fixedScheduleStart=today().slice(0,7);persist()}
 const start=db.settings.fixedScheduleStart;
 const base=new Date(today()+'T12:00:00');
 const visibleEnd=calendarMonth?calendarMonth:add(today(),-base.getDay()-7+Math.floor((offset+1)/5)*35+34).slice(0,7);
 const end=[today().slice(0,7),visibleEnd].sort().at(-1);
 const events=[];
 for(let m=start;m<=end;){
  const [year,month]=m.split('-').map(Number);
  const first=new Date(year,month-1,1,12),last=new Date(year,month,0,12);
  const rules=[['monthly-report','校驗管理月報',iso(new Date(year,month-1,1+(1-first.getDay()+7)%7,12))],['monthly-progress','確認本月校驗進度',iso(new Date(year,month-1,last.getDate()-(last.getDay()-5+7)%7,12))]];
  for(const [rule,name,date]of rules){
   const id='fixed|'+m+'|'+rule,signature='fixed-v1',state=db.events[id];
   events.push({id,name,start:date,end:date,type:'manual',auto:true,signature,done:state?.signature===signature?state.done||'':'',actionDate:state?.signature===signature?state.actionDate||'':'',note:'每月固定行程'});
  }
  m=iso(new Date(year,month,1,12)).slice(0,7);
 }
 return events;
}
function allEvents(){let map={};for(let r of db.rows){if(!r.date)continue;let type=r.type==='內校'?'internal':'external',name=type==='internal'?r.id.replace(/-[^-]+$/,''):r.type==='遊校'?'遊校_'+(r.vendor||'未指定廠商'):'外校'+r.mode+'_'+(r.vendor||'未指定廠商');let key=[r.month,r.date,name].join('|');if(!map[key])map[key]={id:key,name,start:r.date,end:r.date,type,rows:[],auto:true};map[key].rows.push(r)}return [...Object.values(map).map(e=>{let signature=e.rows.map(r=>r.key).sort().join(',');let s=db.events[e.id];if(s?.signature!==signature)s={};let sent=e.name.startsWith('外校寄出_')&&e.start<=today();return{...e,signature,done:s.done||(sent?e.start:''),actionDate:s.actionDate||'',note:''}}),...db.manual.map(e=>({...e,type:'manual',auto:false})),...fixedMonthlyEvents()]}
function eventClass(e){return(e.done&&e.done>e.end&&e.end||!e.done&&e.end&&e.end<today()?'late':e.type)+(e.done?' done':'')}
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
 return result.sort((a,b)=>Number(!!a.done)-Number(!!b.done));
}
function moveCalendarWeek(direction){calendarMonth='';offset+=direction;selectedWeek=true;render()}
function resetCalendarToday(){offset=0;calendarMonth='';selectedWeek=false;render()}
function toggleEvent(id){
 const e=allEvents().find(e=>e.id===id);if(!e)return;
 if(e.done){
  if(e.auto)delete db.events[id];
  else Object.assign(db.manual.find(x=>x.id===id),{done:'',actionDate:''});
 }else{
  const completion={done:today(),actionDate:today()};
  if(e.auto)db.events[id]={...completion,signature:e.signature};
  else Object.assign(db.manual.find(x=>x.id===id),completion);
 }
 save();
}
function todo(e,late=false){return `<div class="todo ${eventClass(e)}"><button type="button" data-event-id="${esc(e.id)}" class="todo-name ${e.done?'done':''}" aria-pressed="${!!e.done}" title="${e.done?'點擊取消完成':'點擊標示完成'}" onclick="toggleEvent('${esc(e.id)}')">${esc(e.name)}</button>${late?`<small>${e.start.slice(5).replace('-','/')}${e.end!==e.start?'–'+e.end.slice(5).replace('-','/'):''}</small>`:''}</div>`}

function renderCalendarContent(){let d=new Date(today()+'T12:00:00'),start=add(today(),-d.getDay()-7+Math.floor((offset+1)/5)*35),count=35;if(calendarMonth){let first=calendarMonth+'-01',f=new Date(first+'T12:00:00'),last=new Date(f.getFullYear(),f.getMonth()+1,0).getDate();start=add(first,-f.getDay());count=Math.ceil((f.getDay()+last)/7)*7}let focusStart=add(today(),-d.getDay()+offset*7),focusEnd=add(focusStart,6),displayMonth=calendarMonth||today().slice(0,7);let events=allEvents(),onToday=events.filter(e=>e.start&&today()>=e.start&&today()<=e.end&&(!e.done||e.actionDate===today())),late=events.filter(e=>e.end&&e.end<today()&&(!e.done||e.done===today())).sort((a,b)=>Number(!!a.done)-Number(!!b.done)||a.end.localeCompare(b.end));$('content').innerHTML=`<div class="calendar-workspace"><div class="toolbar calendar-toolbar"><button aria-label="上一週" onclick="moveCalendarWeek(-1)">‹</button><input aria-label="月曆年月" type="month" value="${displayMonth}" onchange="calendarMonth=this.value;selectedWeek=false;offset=0;render()"><button aria-label="下一週" onclick="moveCalendarWeek(1)">›</button><button onclick="resetCalendarToday()">回到今天</button><span class="spacer"></span><button class="primary" onclick="editManual(null,today())">＋ 新增行程</button></div><div class="cal-layout"><div class="calendar" style="--calendar-weeks:${count/7}">${['日','一','二','三','四','五','六'].map(s=>`<div class="weekday">${s}</div>`).join('')}${Array.from({length:count},(_,i)=>{let date=add(start,i),n=new Date(date+'T12:00:00').getDate(),inSelectedWeek=selectedWeek&&date>=focusStart&&date<=focusEnd;return `<div data-date="${date}" class="day ${i%7===0||i%7===6?'weekend':''} ${!selectedWeek&&date===today()?'today':''} ${date.slice(0,7)!==displayMonth?'other-month':''} ${inSelectedWeek?'selected-week':''} ${inSelectedWeek&&date===focusStart?'week-start':''} ${inSelectedWeek&&date===focusEnd?'week-end':''}" onclick="showDay('${date}')"><div class="daynum">${n}</div>${eventsForDay(events,date).map(e=>`<div class="event ${eventClass(e)}">${esc(e.name)}</div>`).join('')}</div>`}).join('')}</div><div class="right-rail"><section class="panel"><div class="section-head"><h2>待辦事項</h2><button class="todo-add" onclick="editManual(null,'')" aria-label="新增待辦事項"><span aria-hidden="true">＋</span></button></div>${[['internal','內校'],['external','外校'],['manual','其他']].map(([k,t])=>`<h3 class="muted">${t}</h3>${onToday.filter(e=>e.type===k&&!e.done).map(e=>todo(e)).join('')||'<div class="empty">目前沒有事項</div>'}`).join('')}<div class="divider"></div><h3>其他事項</h3>${events.filter(e=>!e.start&&!e.done).map(e=>todo(e)).join('')||'<div class="empty">目前沒有事項</div>'}${[...onToday,...events.filter(e=>!e.start&&e.actionDate===today())].some(e=>e.done)?`<div class="divider"></div><h3 class="muted">已完成</h3>${[...onToday,...events.filter(e=>!e.start&&e.actionDate===today())].filter(e=>e.done).map(e=>todo(e)).join('')}`:''}</section><section class="panel"><div class="section-head"><h2>逾期提醒</h2></div>${late.map(e=>todo(e,true)).join('')||'<div class="empty">目前沒有逾期事項</div>'}</section></div></div></div>`}
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
function modal(title,body,onsave,label='儲存',showFooter=true){ $('dialog').classList.remove('registry-columns-dialog');$('modal').innerHTML=`<div class="modal-head"><h2>${esc(title)}</h2><button class="link" onclick="closeModal()">✕</button></div>${body}${showFooter?`<div class="modal-actions"><button onclick="closeModal()">關閉</button>${onsave?`<button id="modalSave" class="primary">${label}</button>`:''}</div>`:''}`;if(onsave)$('modalSave').onclick=onsave;if(!$('dialog').open){$('dialog').showModal();if(!window.matchMedia('(prefers-reduced-motion: reduce)').matches)$('dialog').animate([{opacity:0,transform:'translateY(12px) scale(.97)'},{opacity:1,transform:'translateY(0) scale(1)'}],{duration:200,easing:'ease'})}}
function closeModal(){$('dialog').close()}
function showDay(date){
 const ev=date?eventsForDay(allEvents(),date):allEvents().filter(e=>!e.start&&(!e.done||e.actionDate===today()));
 modal(date?date.replaceAll('-','/'):'其他事項',`<div class="day-detail-list">${[['internal','內校'],['external','外校'],['manual','其他']].filter(([type])=>ev.some(e=>e.type===type)).map(([type,label])=>`<section class="day-detail-group"><h3>${label}</h3>${ev.filter(e=>e.type===type).map(e=>`<details class="event-detail"><summary tabindex="0" onclick="toggleDetail(event)" onkeydown="if(event.target===this&amp;&amp;['Enter',' '].includes(event.key))toggleDetail(event)"><span class="${e.done?'done':''}">${esc(e.name)}</span>${e.auto?'':`<div class="detail-actions"><button class="detail-icon" aria-label="編輯行程" title="編輯" onclick="event.preventDefault();event.stopPropagation();editManual('${e.id}','${date}')"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m16 3 5 5M3 21l5-1 13-13a2.1 2.1 0 0 0-5-5L3 15z"/><path d="m3 15 5 5"/></svg></button><button class="detail-icon danger" aria-label="刪除行程" title="刪除" onclick="event.preventDefault();event.stopPropagation();deleteManual('${e.id}')"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/></svg></button></div>`}</summary><div class="equipment-list">${(e.rows||[]).map(r=>`<div class="${r.calendarDone?'done':''}">${esc(r.id)}</div>`).join('')}${e.note?`<div>${esc(e.note)}</div>`:''}</div></details>`).join('')}</section>`).join('')||'<p>當天沒有行程</p>'}</div>`,null,'',false);
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
function editManual(id,date){
 const existing=db.manual.find(x=>x.id===id);
 const isTodo=existing?!existing.start:!date;
 const e=existing||{name:'',start:date||'',end:date||'',note:''};
 const title=(id?'編輯':'新增')+(isTodo?'待辦事項':'行程');
 modal(title,`<div class="formgrid"><label class="field full">${isTodo?'項目':'行程名稱'}<input id="en" required value="${esc(e.name)}"></label>${isTodo?'':`<label class="field">開始日期（必填）<input id="es" type="date" required value="${e.start}"></label><label class="field">結束日期（必填）<input id="ee" type="date" required value="${e.end}"></label>`}<label class="field full">備註<textarea id="note">${esc(e.note)}</textarea></label></div>`,()=>{
  const name=$('en').value.trim(),start=isTodo?'':$('es').value,end=isTodo?'':$('ee').value;
  if(!name){$('en').focus();return toast(isTodo?'請填寫項目':'請填寫行程名稱')}
  if(!isTodo&&(!start||!end)){(!start?$('es'):$('ee')).focus();return toast('行程必須填寫開始與結束日期')}
  if(!isTodo&&end<start)return toast('結束日期不可早於開始日期');
  const reset=start!==e.start||end!==e.end;
  Object.assign(e,{name,start,end,note:$('note').value,done:reset?'':e.done||'',actionDate:reset?'':e.actionDate||''});
  if(!id){e.id=uid();db.manual.push(e)}closeModal();save();
 });
}

let cols=[['id','設備編號'],['name','設備名稱'],['asset','資產編號'],['unit','保管單位'],['owner','保管人'],['type','校驗方式'],['vendor','實驗室及廠商'],['instrumentStatus','儀器狀態'],['due','有效日期']];let sortKey='id',sortDir=1;
function instrumentStatus(r){return String(r.instrumentStatus??r.extra?.['儀器狀態']??'').trim()}
function extraColumnKey(header){return 'extra:'+Array.from(header,c=>c.codePointAt(0).toString(16)).join('-')}
function extraColumnLabel(key){return String.fromCodePoint(...key.slice(6).split('-').map(c=>parseInt(c,16)))}
const REGISTRY_PREFERRED_COLUMNS=[
 ['id','設備編號'],['name','設備名稱'],['asset','資產編號'],
 ...['廠牌','型號','序號'].map(h=>[extraColumnKey(h),h]),
 ['type','校驗方式'],[extraColumnKey('允收標準'),'允收標準'],['vendor','實驗室及廠商'],['unit','保管單位'],['owner','保管人'],['due','有效日期'],
 [extraColumnKey('校驗週期'),'校驗週期'],['instrumentStatus','儀器狀態'],
 ...['使用量測範圍','使用最小公差','儀器精度'].map(h=>[extraColumnKey(h),h])
];
function registryColumns(){
 const aliases=new Set(['量測/監控設備編號','量測／監控設備編號','名稱','實驗室/廠商','實驗室','實驗室／廠商',...cols.map(c=>c[1])]);
 const headers=new Set(db.settings.importColumns||[]);
 if(db.imports.some(i=>i.file==='量測監控設備清冊 (1).xlsx'))CALIBRATION_SAMPLE_COLUMNS.forEach(h=>headers.add(h));
 db.rows.forEach(r=>Object.keys(r.extra||{}).forEach(h=>headers.add(h)));
 const ordered=new Map(REGISTRY_PREFERRED_COLUMNS);
 for(const [key,label]of [...cols,...[...headers].filter(h=>!aliases.has(h)).map(h=>[extraColumnKey(h),h])])if(!ordered.has(key))ordered.set(key,label);
 return [...ordered];
}
function registryDefaultKeys(type=tab){return type==='內校'?['id','name','asset','unit','owner','due',extraColumnKey('校驗週期'),'instrumentStatus']:REGISTRY_PREFERRED_COLUMNS.slice(0,14).map(c=>c[0])}
function columnVisible(key,type=tab){return (db.settings.registryColumnsV3?.[type]||registryDefaultKeys(type)).includes(key)}
function equipmentValue(r,key){return key.startsWith('extra:')?r.extra?.[extraColumnLabel(key)]??'':key==='instrumentStatus'?instrumentStatus(r):r[key]}
function inactiveEquipment(r){return ['停用','報廢'].includes(instrumentStatus(r))}
function registrySearch(scope='清冊'){return `<div class="registry-lookup"><select class="registry-month" aria-label="${esc(scope)}年月" onchange="month=this.value;render()">${months().map(m=>`<option ${m===month?'selected':''}>${m}</option>`).join('')}</select><form class="registry-search" onsubmit="event.preventDefault();query=this.elements.search.value.trim();render()"><input class="search" name="search" aria-label="搜尋${esc(scope)}" placeholder="搜尋" value="${esc(query)}"><button type="submit" class="registry-search-submit" aria-label="搜尋" title="搜尋"><svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" aria-hidden="true"><circle cx="10.5" cy="10.5" r="7"/><path d="m16 16 5 5"/></svg></button></form></div>`}
const REGISTRY_FILTER_FIELDS=new Set(['name','vendor','unit','owner']);
let registryFilters={},registryFilterMenu;
function registryMatches(r,exceptKey,type=tab){return Object.entries(registryFilters[type]||{}).every(([key,values])=>key===exceptKey||values.includes(String(equipmentValue(r,key)??'')))}
function closeRegistryFilter(){
 if(!registryFilterMenu)return;
 const {element}=registryFilterMenu;registryFilterMenu=null;
 if(element.matches(':popover-open'))element.hidePopover();element.remove();
}
function openRegistryFilter(event,key){
 event.stopPropagation();closeRegistryFilter();
 const label=registryColumns().find(c=>c[0]===key)?.[1];
 const values=[...new Set(rows().filter(r=>tab==='內校'?r.type==='內校':r.type!=='內校').map(r=>String(equipmentValue(r,key)??'')))].sort((a,b)=>a.localeCompare(b,'zh-Hant'));
 const selected=new Set(registryFilters[tab]?.[key]??values),element=document.createElement('div');
 element.id='registry-filter-menu';element.setAttribute('popover','auto');element.setAttribute('role','dialog');element.setAttribute('aria-label',label+'篩選');
 element.innerHTML=`<div class="filter-menu-title">${esc(label)}</div><div class="filter-sort"><button type="button" onclick="sortRegistryFilter(1)">A → Z 升冪</button><button type="button" onclick="sortRegistryFilter(-1)">Z → A 降冪</button></div><button type="button" class="filter-clear" onclick="clearRegistryFilter()">清除這個欄位的篩選</button><input aria-label="搜尋篩選選項" placeholder="搜尋" oninput="searchRegistryFilter(this.value)"><label class="filter-option filter-all"><input type="checkbox" id="registry-filter-all" onchange="selectRegistryFilterAll(this.checked)">全選</label><div class="filter-options">${values.map((value,i)=>`<label class="filter-option" data-option="${i}"><input type="checkbox" data-value-index="${i}" ${selected.has(value)?'checked':''} onchange="selectRegistryFilterValue(${i},this.checked)"><span>${esc(value||'(空白)')}</span></label>`).join('')}</div><div class="filter-no-results" hidden>沒有符合的選項</div><div class="filter-actions"><button type="button" onclick="closeRegistryFilter()">取消</button><button type="button" class="primary" onclick="applyRegistryFilter()">確定</button></div>`;
 registryFilterMenu={key,values,selected,element};
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
 registryFilters[tab]??={};
 if(state.selected.size===state.values.length)delete registryFilters[tab][state.key];else registryFilters[tab][state.key]=[...state.selected];
 closeRegistryFilter();render();
}
function clearRegistryFilter(){const key=registryFilterMenu?.key;if(!key)return;delete (registryFilters[tab]||{})[key];closeRegistryFilter();render()}
function sortRegistryFilter(direction){const key=registryFilterMenu?.key;if(!key)return;sortKey=key;sortDir=direction;closeRegistryFilter();render()}
function equipmentMatchesQuery(r){return !query||[...Object.values(r),...Object.values(r.extra||{}),instrumentStatus(r)].some(v=>typeof v==='string'&&v.toLowerCase().includes(query.toLowerCase()))}
function filtered(type){return rows().filter(r=>(type==='內校'?r.type==='內校':r.type!=='內校')&&equipmentMatchesQuery(r)&&(page==='registry'?registryMatches(r):(page==='external'||status==='all'||(status==='done'?complete(r):!complete(r))))).sort((a,b)=>(page==='registry'?Number(inactiveEquipment(a))-Number(inactiveEquipment(b)):0)||String(equipmentValue(a,sortKey)||'\uffff').localeCompare(String(equipmentValue(b,sortKey)||'\uffff'),'zh-Hant')*sortDir)}
function searchBar(){return `<input class="search" placeholder="搜尋設備編號、名稱、保管人…" value="${esc(query)}" onchange="query=this.value;render()"><select onchange="status=this.value;render()"><option value="all">全部狀態</option><option value="open" ${status==='open'?'selected':''}>未完成</option><option value="done" ${status==='done'?'selected':''}>已完成</option></select>`}
function visibleCols(){return registryColumns().filter(([k])=>columnVisible(k))}
function renderRegistry(){let list=filtered(tab),vc=visibleCols();$('content').innerHTML=`<div class="registry-workspace"><div class="tabs">${['內校','外校／遊校'].map(t=>`<button class="${tab===t?'active':''}" onclick="tab='${t}';render()">${t}_${rows().filter(r=>t==='內校'?r.type==='內校':r.type!=='內校').length}</button>`).join('')}<button type="button" class="registry-export" aria-label="匯出 Excel" title="匯出 Excel" onclick="exportExcel()"><svg viewBox="0 0 32 32" width="27" height="27" aria-hidden="true"><path d="M13 5h15a2 2 0 0 1 2 2v18a2 2 0 0 1-2 2H13z" fill="none" stroke="currentColor" stroke-width="2"/><path d="M19 10h7m-7 6h7m-7 6h7" stroke="currentColor" stroke-width="2"/><path d="M2 5 18 2v28L2 27z" fill="currentColor"/><path d="m6 10 7 12m0-12L6 22" stroke="white" stroke-width="2.5"/></svg></button></div><div class="toolbar">${registrySearch()}${hasMissingExternalVendor()?'<span class="registry-vendor-warning" role="status">!!! 外校設備未填寫廠商 !!!</span>':''}<span class="spacer"></span><button onclick="columnsDialog()">欄位設定</button><button class="primary" onclick="editEquipment()">＋ 新增設備</button></div><div class="tablewrap"><table><thead><tr>${vc.map(([k,t])=>`<th><div class="registry-column-head"><button type="button" class="registry-column-sort" onclick="sortDir=sortKey==='${k}'?-sortDir:1;sortKey='${k}';render()">${esc(t)} <span aria-hidden="true">${sortKey===k?(sortDir===1?'↑':'↓'):'↕'}</span></button>${REGISTRY_FILTER_FIELDS.has(k)?`<button type="button" class="registry-filter-trigger ${registryFilters[tab]?.[k]?'is-filtered':''}" aria-label="篩選${esc(t)}" aria-haspopup="dialog" onclick="openRegistryFilter(event,'${k}')"><svg viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" aria-hidden="true"><path d="M3 4h14l-5.5 6v5l-3-1.5V10z"/></svg></button>`:''}</div></th>`).join('')}<th></th></tr></thead><tbody>${list.map(r=>`<tr class="${inactiveEquipment(r)?'inactive-equipment':''}">${vc.map(([k])=>`<td>${esc(equipmentValue(r,k))||'—'}</td>`).join('')}<td><div class="registry-actions"><button class="registry-edit" aria-label="編輯設備 ${esc(r.id)}" title="編輯" onclick="editEquipment('${r.key}')"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m16 3 5 5M3 21l5-1 13-13a2.1 2.1 0 0 0-5-5L3 15z"/><path d="m3 15 5 5"/></svg></button><button class="registry-delete" aria-label="刪除設備 ${esc(r.id)}" title="刪除" onclick="deleteEquipment('${r.key}')"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/></svg></button></div></td></tr>`).join('')||`<tr><td colspan="${vc.length+1}" class="registry-empty">沒有符合條件的設備</td></tr>`}</tbody></table></div></div>`}
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
function hasEquipmentActivity(r){return (r.p||[]).some(Boolean)||!!r.date||!!r.completed||Object.values(db.events).some(state=>state.done&&state.signature?.split(',').includes(r.key))}
function editEquipment(key){let r=db.rows.find(r=>r.key===key)||{id:'',name:'',asset:'',unit:'',owner:'',type:tab==='內校'?'內校':'外校',vendor:'',due:''};modal(key?'編輯設備':'新增設備',`<div class="formgrid">${cols.map(([k,t])=>`<label class="field">${t}${k==='type'?`<select id="f_type">${['內校','外校','遊校'].map(x=>`<option ${r.type===x?'selected':''}>${x}</option>`).join('')}</select>`:`<input id="f_${k}" value="${esc(equipmentValue(r,k))}" ${key&&['id','name','due'].includes(k)?'disabled':''} type="${k==='due'?'date':'text'}">`}</label>`).join('')}</div>`,()=>{let next=Object.fromEntries(cols.map(([k])=>[k,$('f_'+k).value.trim()]));if(!next.id||!next.name)return toast('設備編號與名稱必填');if(rows().some(x=>x.id===next.id&&x.key!==key))return toast('同月份設備編號重複');let reset=key&&(r.type!==next.type||(r.vendor||'')!==next.vendor);if(reset&&hasEquipmentActivity(r)&&!confirm('校驗方式或廠商改變，將清除該設備進度與排程。繼續？'))return;for(let k of ['asset','unit','owner'])db.rows.filter(x=>x.id===next.id).forEach(x=>x[k]=next[k]);if(!key){r.key=uid();r.month=month;r.p=[];r.date='';r.mode='收件';r.extra={};db.rows.push(r)}if(reset){r.p=[];r.date='';r.completed=''}Object.assign(r,next);closeModal();save()})}
function deleteEquipment(key){
 const equipment=db.rows.find(r=>r.key===key);if(!equipment)return;
 if(!confirm('確定刪除設備「'+equipment.id+' · '+equipment.name+'」及其進度與排程？'))return;
 db.rows=db.rows.filter(r=>r.key!==key);save();
}
function percent(list){return list.length?Math.round(list.reduce((a,r)=>a+r.p.filter(Boolean).length/stages(r).length,0)/list.length*100):0}
function renderProgress(){if(page==='external')return renderExternalProgress();let internal=page==='internal',type=internal?'內校':'外校／遊校',list=filtered(type),total=internal?list:rows().filter(r=>r.type!=='內校'),pct=percent(total),groups={};list.forEach(r=>{let g=internal?'內校設備':r.type+' · '+(r.vendor||'未指定廠商');(groups[g]??=[]).push(r)});$('content').innerHTML=`<div class="toolbar">${searchBar()}<span class="spacer"></span><button onclick="tab='${type}';go('registry')">查看清冊 →</button></div><section class="panel" style="margin-bottom:22px"><div class="rowtitle"><h2>校驗總進度</h2><span>${pct}% <span class="muted">　已完成 ${total.filter(complete).length} / ${total.length} 台</span></span></div><div class="progress"><i class="${pct===100?'complete':''}" style="width:${pct}%"></i></div></section>${Object.entries(groups).map(([g,rs])=>`<details class="group" open><summary>${esc(g)}<span>${rs.filter(complete).length} / ${rs.length} 台　${percent(rs)}%</span></summary><div class="tablewrap" style="border:0"><table><thead><tr><th>設備編號 / 名稱</th><th>資產編號</th>${internal?'<th>有效日期</th>':''}${stages(rs[0]).map(s=>`<th>${s}</th>`).join('')}</tr></thead><tbody>${rs.map(r=>`<tr class="${complete(r)?'finished':''}"><td>${esc(r.id)}<div class="subtle">${esc(r.name)}</div></td><td class="muted">${esc(r.asset)}</td>${internal?`<td>${r.due||'—'}</td>`:''}${stages(r).map((s,i)=>{let dateStage=internal?i===0:i===stages(r).length-2;return `<td>${dateStage?`${r.type==='外校'?`<select class="smallselect" onchange="changeMode('${r.key}',this.value)"><option ${r.mode==='收件'?'selected':''}>收件</option><option ${r.mode==='寄出'?'selected':''}>寄出</option></select> `:''}<button ${i&&!r.p[i-1]?'disabled':''} onclick="schedule('${r.key}',${i})">${r.date||'設定日期'}</button>`:`<label class="step"><input type="checkbox" ${r.p[i]?'checked':''} ${i&&!r.p[i-1]?'disabled':''} onchange="window.step('${r.key}',${i},this.checked)">${r.p[i]?(i===stages(r).length-1?r.completed||'已完成':'已完成'):'待處理'}</label>`}</td>`}).join('')}</tr>`).join('')}</tbody></table></div></details>`).join('')||'<div class="empty">沒有符合條件的設備</div>'}<div class="tablefoot">逐階段操作；行事曆勾選與設備作業進度分開保存。批次更新待後續版本加入。</div>`}
const externalProgressOpen=new Set();
function externalProgressTable(list){
 return `<div class="tablewrap progress-table"><table class="external-equipment-table"><colgroup><col class="progress-col-equipment"><col class="progress-col-asset">${stages(list[0]).map((s,i)=>`${list[0].type==='遊校'&&i===2?'<col class="progress-col-step">':''}<col class="${i===stages(list[0]).length-2?'progress-col-date':'progress-col-step'}">`).join('')}</colgroup><thead><tr><th>設備編號 / 名稱</th><th>資產編號</th>${stages(list[0]).map((s,i)=>`${list[0].type==='遊校'&&i===2?'<th aria-label="不適用外送單"></th>':''}<th class="${i===stages(list[0]).length-2?'':'progress-checkbox-cell'}">${s}</th>`).join('')}</tr></thead><tbody>${list.map(r=>`<tr class="${complete(r)?'finished':''}"><td>${esc(r.id)}<div class="subtle">${esc(r.name)}</div></td><td class="muted">${esc(r.asset)}</td>${stages(r).map((s,i)=>{
  const dateStage=i===stages(r).length-2;
  return `${r.type==='遊校'&&i===2?'<td></td>':''}<td class="${dateStage?'':'progress-checkbox-cell'}">${dateStage?`${r.type==='外校'?`<select class="smallselect" aria-label="${esc(r.id)}收件寄出方式" onchange="changeMode('${r.key}',this.value)"><option ${r.mode==='收件'?'selected':''}>收件</option><option ${r.mode==='寄出'?'selected':''}>寄出</option></select> `:''}<button ${i&&!r.p[i-1]?'disabled':''} onclick="schedule('${r.key}',${i})">${r.date||'設定日期'}</button>`:`<label class="step"><input aria-label="${esc(r.id)} ${esc(s)}" type="checkbox" ${r.p[i]?'checked':''} ${i&&!r.p[i-1]?'disabled':''} onchange="window.step('${r.key}',${i},this.checked)"></label>`}</td>`;
 }).join('')}</tr>`).join('')}</tbody></table></div>`;
}
function renderExternalProgress(){
 const list=filtered('外校／遊校'),total=rows().filter(r=>r.type==='外校'||r.type==='遊校'),pct=percent(total),vendors=new Map();
 for(const row of list){const vendor=String(row.vendor??'').trim();if(!vendor)continue;if(!vendors.has(vendor))vendors.set(vendor,[]);vendors.get(vendor).push(row)}
 const groups=[...vendors].sort(([a],[b])=>a.localeCompare(b,'zh-Hant'));
 $('content').innerHTML=`<div class="external-progress-workspace"><div class="toolbar">${registrySearch('外校進度')}<span class="spacer"></span><button onclick="tab='外校／遊校';go('registry')">查看清冊 →</button></div><section class="panel external-total"><div class="rowtitle"><h2>校驗總進度</h2><span>${pct}%</span></div><div class="progress"><i class="${pct===100?'complete':''}" style="width:${pct}%"></i></div></section>${groups.map(([vendor,equipment])=>`<details class="panel vendor-progress" data-progress-group="${esc(vendor)}" ontoggle="this.open?externalProgressOpen.add(this.dataset.progressGroup):externalProgressOpen.delete(this.dataset.progressGroup)" ${externalProgressOpen.has(vendor)?'open':''}><summary class="vendor-progress-title">${esc(vendor)}<span>${percent(equipment)}%</span></summary><div class="vendor-progress-body">${['外校','遊校'].map(type=>{
  const items=equipment.filter(r=>r.type===type);if(!items.length)return '';
  return `<section class="group progress-type-${type==='外校'?'external':'tour'}">${externalProgressTable(items)}</section>`;
 }).join('')}</div></details>`).join('')||'<div class="empty">沒有符合條件的設備</div>'}</div>`;
}
function changeMode(key,mode){let r=db.rows.find(x=>x.key===key);if(r.date&&!confirm('切換寄出／收件將清除原日期與完成紀錄，確定？'))return render();r.mode=mode;r.date='';r.p[3]=r.p[4]=false;r.completed='';save()}
function step(key,i,checked){let r=db.rows.find(x=>x.key===key);if(checked&&i&&!r.p[i-1])return;if(!checked){for(let j=i;j<stages(r).length;j++)r.p[j]=false;let di=r.type==='內校'?0:stages(r).length-2;if(i<=di)r.date='';r.completed='';save();return}if(i===stages(r).length-1){modal('校驗完成',`<p>${esc(r.id)} · ${esc(r.name)}</p><label class="field">完成日期<input type="date" id="finish" value="${today()}" max="${today()}"></label>`,()=>{let d=$('finish').value;if(!d||d>today())return toast('完成日期不可為未來');r.p[i]=true;r.completed=d;closeModal();save()});render()}else{r.p[i]=true;save()}}
function schedule(key,i){let r=db.rows.find(x=>x.key===key);modal('安排校驗日期',`<p>${esc(r.id)} · ${esc(r.name)}</p><label class="field">${r.type==='內校'?'預計校驗日':r.type==='遊校'?'遊校日期':r.mode+'日期'}<input type="date" id="schedule" value="${r.date||r.due||today()}"></label><p class="muted">清空日期將移除對應行程與後續完成狀態。</p>`,()=>{let d=$('schedule').value;if(d&&r.type==='內校'){if(r.due&&r.due>=today()&&d>r.due)return toast('不得晚於有效日期');if(r.due&&r.due<today()&&d<today())return toast('已過期設備請安排今天或之後');if(!r.due&&d.slice(0,7)!==r.month)return toast('有效日期空白時請選所屬月份')}if(!d&&!confirm('清除日期及後續進度？'))return;if(r.date!==d){r.date=d;r.p[i]=!!d;r.p[stages(r).length-1]=false;r.completed='';if(!d)for(let j=i;j<stages(r).length;j++)r.p[j]=false}closeModal();save()})}
function vendors(){return[...new Set(rows().filter(r=>r.type!=='內校').map(r=>r.vendor||'未指定廠商'))]};function sumCost(m){return Object.values(db.quotes[m]||{}).reduce((s,v)=>s+(v===''?0:Number(v)||0),0)}
function annualExternalCost(key){
 const year=key.slice(0,4),opening=year==='2026'&&key>='2026-10'?446100:0;
 const first=opening?'2026-10':year+'-01';
 return opening+Object.keys(db.quotes).filter(m=>m>=first&&m<=key&&m.slice(0,4)===year).reduce((total,m)=>total+sumCost(m),0);
}
function renderCost(){let v=vendors(),q=db.quotes[month]||{},all=[...new Set([...v,...Object.keys(q)])];$('content').innerHTML=`<div class="wide"><div class="stats"><div class="stat"><label>本月外校費用 · 未稅</label><strong>NT$ ${sumCost(month).toLocaleString()}</strong></div><div class="stat"><label>尚未填寫</label><strong>${v.filter(x=>q[x]===undefined||q[x]==='').length}<small class="muted"> 家廠商</small></strong></div></div><div class="tablewrap"><table><thead><tr><th>實驗室／廠商</th><th>當月設備</th><th>報價金額（未稅 NT$）</th></tr></thead><tbody>${all.map((x,i)=>`<tr><td>${esc(x)}${!v.includes(x)?'<div class="subtle">清冊已無此廠商，報價仍保留</div>':''}</td><td>${rows().filter(r=>r.vendor===x).length}</td><td><input class="money" type="number" min="0" step="1" data-vendor="${esc(x)}" value="${q[x]??''}" placeholder="尚未填寫"></td></tr>`).join('')}</tbody></table></div><div class="toolbar" style="margin-top:20px"><span class="muted">空白表示未填；0 表示已確認零元。</span><span class="spacer"></span><button class="primary" onclick="saveQuotes()">儲存報價</button></div></div>`}
function saveQuotes(){let q={};for(let input of document.querySelectorAll('[data-vendor]')){if(input.value!==''&&(!Number.isInteger(+input.value)||+input.value<0))return toast('金額需為非負整數');q[input.dataset.vendor]=input.value===''?'':+input.value}db.quotes[month]=q;save();toast('報價已儲存，月報費用同步更新')}
function renderReport(){
 const previous=$('reportframe')?.contentWindow;
 if(previous&&typeof previous.appSaveDraftNow==='function')previous.appSaveDraftNow();
 $('content').innerHTML=`<iframe id="reportframe" class="report-workspace" title="量測設備校驗管理月報" src="report.html?v=20261022-32"></iframe>`;
 $('reportframe').onload=()=>{
  const w=$('reportframe').contentWindow;
  try{
   const frame=$('reportframe');
   w.document.body.classList.add('report-embedded');
   const fit=()=>{if(frame.isConnected&&typeof w.fitPreview==='function')w.fitPreview()};
   const observer=new ResizeObserver(fit);observer.observe(frame);
   w.addEventListener('pagehide',()=>observer.disconnect(),{once:true});fit();
   w.reportDataSource=key=>{const equipment=db.rows.filter(r=>r.month===key);return{internal:equipment.filter(r=>r.type==='內校').length,external:equipment.filter(r=>r.type==='外校'||r.type==='遊校').length,cost:sumCost(key)}};
   w.reportRecordSource=key=>db.reports[key]?structuredClone(db.reports[key]):null;
   w.reportPersistRecord=(key,record)=>{db.reports[key]=structuredClone(record);persist()};
   w.reportMonthChanged=key=>{month=key;$('monthbox').innerHTML=''};
   w.appAnnualTotal=()=>annualExternalCost(w.document.getElementById('monthInput').value);
   w.document.getElementById('monthInput').disabled=false;
   w.appLoadMonth(month,{animate:false});
  }catch(error){toast('月報載入失敗：'+error.message)}
 };
}
function renderImport(){$('content').innerHTML=`<div class="wide"><div class="note">依有效日期歸入對應月份。匯入前先檢查資料；同月份覆蓋會保留仍存在設備的進度。</div><div class="upload"><div style="font-size:32px;color:var(--color-muted)">↥</div><b>匯入每月設備清冊</b><p>支援 .xlsx；保留原始設備資訊欄位</p><button class="primary" onclick="document.getElementById('excelFile').click()">選擇 Excel 檔案</button><input id="excelFile" type="file" accept=".xlsx" hidden onchange="importExcel(this.files[0]);this.value=''"/><p class="subtle">本 DEMO 遇到空白／錯誤有效日期、重複編號會停止匯入並提示。</p></div><h2>匯入紀錄</h2><div class="tablewrap"><table><thead><tr><th>來源檔案</th><th>月份</th><th>設備數</th><th>匯入時間</th></tr></thead><tbody>${db.imports.map(i=>`<tr><td>${esc(i.file)}</td><td>${i.months.join('、')}</td><td>${i.count}</td><td>${esc(i.at)}</td></tr>`).join('')||'<tr><td colspan="4" class="muted">尚未匯入檔案，目前為示範資料</td></tr>'}</tbody></table></div></div>`}
function parseDate(v){v=String(v||'').trim();if(/^\d+(\.\d+)?$/.test(v)&&+v>10000)return new Date(Date.UTC(1899,11,30)+Math.floor(+v)*86400000).toISOString().slice(0,10);let m=v.match(/^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})/);if(!m)return '';let d=m[1]+'-'+m[2].padStart(2,'0')+'-'+m[3].padStart(2,'0');return new Date(d+'T12:00:00').getDate()===+m[3]?d:''}
async function importExcel(file){if(!file)return;try{toast('正在檢查清冊…');let model=await Organizer.parse(await file.arrayBuffer()),incoming=[],seen=new Set();for(let raw of model.all){let x=Object.fromEntries(Object.entries(raw).map(([k,v])=>[k,v.value]));let due=parseDate(x['有效日期']),id=String(x['量測/監控設備編號']||'').trim(),type=x['校驗方式'];if(!due||!id||!['內校','外校','遊校'].includes(type))throw Error('設備 '+id+' 的有效日期、編號或校驗方式不完整');let m=due.slice(0,7),k=m+'|'+id;if(seen.has(k))throw Error(m+' 設備編號重複：'+id);seen.add(k);incoming.push({key:uid(),month:m,id,name:x['名稱']||'',asset:x['資產編號']||'',unit:x['保管單位']||'',owner:x['保管人']||'',vendor:x['實驗室/廠商']||x['實驗室／廠商']||x['實驗室']||'',type,due,instrumentStatus:String(x['儀器狀態']??'').trim(),p:[],date:'',completed:'',mode:'收件',extra:x})}let ms=[...new Set(incoming.map(r=>r.month))];if(!confirm(`檢查完成：${incoming.length} 筆，月份 ${ms.join('、')}。${ms.some(m=>months().includes(m))?'此月份已有資料，是否覆蓋？':'確定匯入？'}`))return;let next=structuredClone(db);for(let r of incoming){let old=db.rows.find(x=>x.month===r.month&&x.id===r.id);if(old&&old.type===r.type&&(!old.vendor||old.vendor===r.vendor))Object.assign(r,{key:old.key,p:old.p,date:old.date,completed:old.completed,mode:old.mode});else if(old&&hasEquipmentActivity(old)&&(old.type!==r.type||old.vendor!==r.vendor)&&!confirm(r.id+' 校驗方式或廠商異動，清除原進度？取消會停止整份匯入。'))return;for(let k of ['asset','unit','owner']){let prior=next.rows.find(x=>x.id===r.id);if(prior&&prior[k]!==r[k]){if(!confirm(`${r.id} ${cols.find(c=>c[0]===k)[1]}有差異\n現有：${prior[k]||'空白'}\n匯入：${r[k]||'空白'}\n確定採用匯入值？取消保留現有值。`))r[k]=prior[k];next.rows.filter(x=>x.id===r.id).forEach(x=>x[k]=r[k]);incoming.filter(x=>x.id===r.id).forEach(x=>x[k]=r[k])}}}next.rows=next.rows.filter(r=>!ms.includes(r.month)).concat(incoming);next.settings.importColumns=[...new Set([...(next.settings.importColumns||[]),...(model.sourceHeaders||model.headers)])];next.imports.unshift({file:file.name,months:ms,count:incoming.length,at:new Date().toLocaleString('zh-TW')});db=next;month=ms.at(-1);save();toast('匯入完成；既有報價與月報內容已保留，請確認受影響明細')}catch(e){toast(e.message)}}
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
function renderBackup(){$('content').innerHTML=`<div class="wide"><div class="note">備份涵蓋此 DEMO 已保存的所有月份、設備、進度、行程、報價、月報與設定。資料存在此瀏覽器，請定期下載備份。</div><div class="cards"><section class="panel"><div style="font-size:30px;color:var(--color-muted)">↧</div><h2>完整資料備份</h2><p>${months().length} 個月份 · ${db.rows.length} 筆設備<br>不受目前月份或篩選條件影響。</p><button class="primary" onclick="backup()">匯出完整備份</button></section><section class="panel"><div style="font-size:30px;color:var(--color-muted)">↥</div><h2>從備份還原</h2><p>先驗證檔案完整性，確認後<br>完整取代此瀏覽器的 DEMO 資料。</p><button onclick="document.getElementById('restoreFile').click()">選擇備份檔</button><input id="restoreFile" type="file" accept=".json" hidden onchange="restore(this.files[0]);this.value='' "></section></div><div class="divider"></div><h2>重新體驗</h2><p>清除目前 DEMO 資料，恢復 Excel 範例設備清冊與預設固定行程。</p><button class="danger" onclick="resetDemo()">重設示範資料</button></div>`}
async function hash(s){let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return (h>>>0).toString(16)}
function reportStorage(){let x={};for(let k of Object.keys(localStorage))if(k!==KEY)x[k]=localStorage.getItem(k);return x}
async function backup(){let payload={db,reportStorage:reportStorage()},raw=JSON.stringify(payload);download(JSON.stringify({format:'aming-calibration',version:1,createdAt:new Date().toISOString(),checksum:await hash(raw),payload}),'儀校完整備份_'+today()+'.json');toast('完整備份已匯出')}
async function restore(file){if(!file)return;try{let b=JSON.parse(await file.text());if(b.format!=='aming-calibration'||b.version!==1||!b.payload||b.checksum!==await hash(JSON.stringify(b.payload)))throw Error('格式或完整性檢查失敗');let d=b.payload.db;if(!Array.isArray(d.rows)||!Array.isArray(d.manual)||!d.events||!d.quotes||!d.settings||!Array.isArray(d.imports)||!d.reports||d.rows.some(r=>!r.key||!r.id||!r.month||!Array.isArray(r.p)))throw Error('備份缺少必要資料');if(!confirm('將完整取代目前所有月份資料，確定還原？'))return;const old=Object.fromEntries(Object.keys(localStorage).map(k=>[k,localStorage.getItem(k)]));try{localStorage.clear();for(let[k,v]of Object.entries(b.payload.reportStorage||{}))localStorage.setItem(k,v);localStorage.setItem(KEY,JSON.stringify(d))}catch(e){localStorage.clear();for(let[k,v]of Object.entries(old))localStorage.setItem(k,v);throw e}db=d;save();toast('已完成還原')}catch(e){toast('還原失敗，原資料保留：'+e.message)}}
function resetDemo(){if(confirm('清除目前 DEMO 資料並恢復示範資料？')){db=seed();save();toast('已恢復示範資料')}}
persist();render();setInterval(()=>{if(page==='calendar'&&!$('dialog').open)renderCalendar()},60000);
