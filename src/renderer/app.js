'use strict';
const api=window.baodroid;
const $=id=>document.getElementById(id);
const escapeHTML=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let state={config:{projects:[],slots:[{},{},{}],settings:{}},devices:[],logs:[]};
let previewBySlot={};
let avds=[];
let view='all';
let logs=[];
let updateState=null;
let toastTimeout=null;
const slotId=i=>Number(i);
const getProject=id=>state.config.projects.find(p=>p.id===id);
function notify(message,error=false){
 const el=$('toast');
 el.textContent=message;el.className='toast visible'+(error?' error':'');
 clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>{el.className='toast';},4500);
}
async function invoke(name,...args){
 try{
   const result=await api[name](...args);
   if(!result || !result.ok)throw new Error(result?.error||'Không thực hiện được.');
   return result.data;
 }catch(error){notify(error.message||String(error),true);return null;}
}
const statusText=status=>({off:'Đã dừng',booting:'Đang mở Android',running:'Đang chạy',error:'Cần kiểm tra'})[status]||status||'Đã dừng';
const buildText=build=>({building:'Đang build APK…',deploying:'Đang cài APK…',success:'Đã đồng bộ',error:'Lỗi build',idle:'Chưa chạy'})[build]||'Chờ đồng bộ';
function cardHTML(i){
 const config=state.config.slots[i]||{};
 const device=state.devices[i]||{status:'off',build:'idle',message:'Chưa chạy'};
 const project=getProject(config.projectId);
 const active=device.status==='running';
 const booting=device.status==='booting';
 const picture=active?previewBySlot[i]:null;
 const options=['<option value="">— Chọn dự án Android —</option>']
  .concat(state.config.projects.map(p=>
    '<option value="'+escapeHTML(p.id)+'"'+
    (p.id===config.projectId?' selected':'')+
    (state.config.slots.some((s,index)=>index!==i&&s.projectId===p.id)?' disabled':'')+'>'+
    escapeHTML(p.name)+' ('+escapeHTML(p.kind)+')</option>')).join('');
 const title=project?'Mở dự án trong VS Code':'Kết nối VS Code';
 const placeholder=booting?'Android ảo đang khởi động…':active?'Đang nhận ảnh màn hình…':
   project?'Đang chờ Android ảo':'Chưa chọn dự án';
 const hint=project?(device.message||'Baodroid sẽ tự khởi chạy ứng dụng.'):'Bấm Kết nối VS Code và chọn thư mục dự án.';
 return '<article class="device-card '+(active?'running':'')+(view===String(i)?' chosen':'')+'" data-device="'+i+'">'+
  '<div class="device-head"><span class="device-title"><span class="state-dot '+escapeHTML(device.status||'off')+'"></span>Máy Android '+(i+1)+'</span><span class="status-label">'+escapeHTML(statusText(device.status))+'</span></div>'+
  '<select class="project-select" data-project-slot="'+i+'" aria-label="Dự án của máy Android '+(i+1)+'">'+options+'</select>'+
  '<div class="project-actions"><button class="button connect" data-code-slot="'+i+'" title="Chọn thư mục dự án cục bộ hoặc mở trong VS Code">↗ '+title+'</button>'+
  '<button class="button remove" data-remove-slot="'+i+'"'+(!project?' disabled':'')+' aria-label="Gỡ dự án khỏi Baodroid" title="Gỡ dự án này khỏi Baodroid, không xóa mã nguồn">✕</button></div>'+
  '<div class="screen-wrap"><div class="phone"><div class="screen" data-touch-slot="'+i+'">'+
  (picture?'<img src="'+picture.image+'" draggable="false" alt="Preview Android '+(i+1)+'">':
   '<div class="placeholder"><div class="placeholder-symbol">▯</div><strong>'+escapeHTML(placeholder)+'</strong><span>'+escapeHTML(hint)+'</span></div>')+
   '<div class="camera"></div></div></div></div>'+
  '<div class="device-details"><div class="message">'+escapeHTML(device.message||(!project?'Chưa có dự án':'Đang chuẩn bị'))+'</div>'+
   '<span class="build">'+escapeHTML(buildText(device.build))+'</span></div></article>';
}
function render(){
 $('project-count').textContent=state.config.projects.length+' / 3 dự án';
 $('btn-add-project').disabled=state.config.projects.length>=3;
 $('device-grid').innerHTML=[0,1,2].map(cardHTML).join('');
 setView(view);
 wireCards();
}
function setView(next){
 view=next;
 $('device-grid').classList.toggle('focus',next!=='all');
 document.querySelectorAll('[data-device]').forEach(card=>card.classList.toggle('chosen',card.dataset.device===next));
 document.querySelectorAll('[data-view]').forEach(button=>{
   const chosen=button.dataset.view===next;
   button.classList.toggle('active',chosen);
   button.setAttribute('aria-pressed',String(chosen));
 });
}
function wireCards(){
 document.querySelectorAll('[data-project-slot]').forEach(el=>el.addEventListener('change',async event=>{
   const i=slotId(event.currentTarget.dataset.projectSlot);
   await invoke('assignProject',i,event.currentTarget.value||null);
 }));
 document.querySelectorAll('[data-code-slot]').forEach(el=>el.addEventListener('click',async event=>{
   const i=slotId(event.currentTarget.dataset.codeSlot);
   const selected=getProject(state.config.slots[i]?.projectId);
   const linked=await invoke('connectVscode',i);
   if(linked)notify(linked.vscodeOpened?'Đã mở thư mục trong VS Code. Baodroid đang đồng bộ cục bộ.':'Đã liên kết thư mục. Baodroid tự chạy preview; bạn có thể tiếp tục sửa code trong VS Code.');
 }));
 document.querySelectorAll('[data-remove-slot]').forEach(el=>el.addEventListener('click',async event=>{
   const i=slotId(event.currentTarget.dataset.removeSlot);
   const project=getProject(state.config.slots[i]?.projectId);
   if(!project || !confirm('Gỡ '+project.name+' khỏi Baodroid? Mã nguồn trên máy của bạn không bị xóa.'))return;
   // Stop the local emulator before removing its source project.
   if(['running','booting'].includes(state.devices[i]?.status))await invoke('stopSlot',i);
   await invoke('removeProject',project.id);
 }));
 document.querySelectorAll('[data-touch-slot]').forEach(node=>{
   let down=null;
   const point=ev=>{
     const picture=previewBySlot[node.dataset.touchSlot];
     if(!picture)return null;
     const r=node.getBoundingClientRect();
     return {x:Math.max(0,Math.min(picture.width-1,(ev.clientX-r.left)/r.width*picture.width)),
             y:Math.max(0,Math.min(picture.height-1,(ev.clientY-r.top)/r.height*picture.height))};
   };
   node.addEventListener('pointerdown',ev=>{
     const p=point(ev);if(!p)return;
     down={p,at:Date.now()};node.setPointerCapture(ev.pointerId);
   });
   node.addEventListener('pointerup',ev=>{
     if(!down)return;
     const end=point(ev),start=down;down=null;
     if(!end)return;
     const i=slotId(node.dataset.touchSlot);
     if(Math.hypot(end.x-start.p.x,end.y-start.p.y)>25)
       void invoke('swipe',i,start.p.x,start.p.y,end.x,end.y,Date.now()-start.at);
     else void invoke('tap',i,end.x,end.y);
   });
 });
}
function updateEnvironment(){
 const missingSDK=avds===null;
 const empty=Array.isArray(avds)&&avds.length===0;
 $('sdk-status').textContent=missingSDK?'Android SDK chưa sẵn sàng':
   empty?'Chưa có máy ảo Android':'Android SDK · '+avds.length+' AVD';
 const notice=$('environment-alert');
 notice.hidden=!missingSDK&&!empty;
 if(missingSDK)$('environment-message').textContent=
   'Chưa tìm thấy Android SDK/Emulator. Chọn đúng thư mục Android SDK trên Windows để Baodroid chạy ứng dụng.';
 else if(empty)$('environment-message').textContent=
   'Bạn chưa tạo Android Virtual Device (AVD). Chỉ cần tạo một máy ảo trong Android Studio → Device Manager; Baodroid sẽ tự sử dụng.';
 $('btn-sdk-help').hidden=!missingSDK;
}
function renderLogs(){
 $('log-content').textContent=logs.slice(-100).map(r=>
   '['+r.time+'] '+(r.slot===null||r.slot===undefined?'':'[Máy '+(r.slot+1)+'] ')+r.message).join('\n') || 'Chưa có thông báo.';
}
async function refresh(){
 const incoming=await invoke('getState');
 if(incoming){state=incoming;logs=incoming.logs||logs;render();renderLogs();}
 try{
   const result=await api.listAvds();
   avds=result?.ok?result.data:null;
 }catch{avds=null;}
 updateEnvironment();
}
async function pickSDK(){
 const path=await invoke('chooseSdk');
 if(path){notify('Đã cập nhật Android SDK.');await refresh();}
}
function showUpdate(info){
 updateState=info;
 $('update-popup').hidden=false;
 $('update-title').textContent=info.state==='available'?'Có bản cập nhật mới':
   info.state==='ready'?'Đã tải xong bản vá':'Cập nhật Baodroid';
 $('update-message').textContent=info.message||'';
 $('update-action').hidden=!['available','ready'].includes(info.state);
 $('update-action').textContent=info.state==='ready'?'Cài đặt và khởi động lại':'Tải bản vá';
 $('update-progress').hidden=info.state!=='downloading';
 $('update-progress').firstElementChild.style.width=(info.percent||0)+'%';
}
function bind(){
 $('btn-add-project').addEventListener('click',async()=>{
   const result=await invoke('addProject');
   if(result)notify('Đã kết nối dự án. Baodroid đang tự tìm máy ảo và khởi chạy.');
 });
 $('btn-sdk').addEventListener('click',()=>void pickSDK());
 $('btn-sdk-help').addEventListener('click',()=>void pickSDK());
 $('btn-update').addEventListener('click',()=>void invoke('checkUpdate'));
 $('update-dismiss').addEventListener('click',()=>$('update-popup').hidden=true);
 $('update-action').addEventListener('click',()=>void invoke(updateState?.state==='ready'?'installUpdate':'downloadUpdate'));
 document.querySelectorAll('[data-view]').forEach(btn=>btn.addEventListener('click',()=>setView(btn.dataset.view)));
 window.addEventListener('keydown',ev=>{if(ev.key==='Escape')setView('all');});
 api.onState(next=>{state=next;render();});
 api.onPreview(p=>{
   previewBySlot[p.slot]=p;
   const el=document.querySelector('[data-touch-slot="'+p.slot+'"]');
   if(!el)return;
   let img=el.querySelector('img');
   if(!img){
     el.querySelector('.placeholder')?.remove();
     img=document.createElement('img');img.draggable=false;
     img.alt='Màn hình Android '+(p.slot+1);
     el.prepend(img);
   }
   img.src=p.image;
 });
 api.onLog(item=>{
   logs.push(item);if(logs.length>160)logs.shift();
   if($('log-panel').open)renderLogs();
 });
 api.onUpdate(showUpdate);
}
window.addEventListener('DOMContentLoaded',()=>{bind();void refresh();});
