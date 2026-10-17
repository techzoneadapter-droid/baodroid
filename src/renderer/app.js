'use strict';
const api=window.baodroid;
let state={config:{projects:[],slots:[{},{},{}],settings:{}},devices:[],logs:[]};
let avds=[],logEntries=[],previews={},updateInfo={};
let viewMode='all';
const zoomBySlot=['100','100','100'];
const preference=(key,initial)=>{try {return JSON.parse(localStorage.getItem(key))??initial;} catch{return initial;}};
const setPreference=(key,value)=>{try {localStorage.setItem(key,JSON.stringify(value));}catch{/* persistence not available */}};
const layout={left:preference('baodroid:leftCollapsed',false),right:preference('baodroid:rightCollapsed',false),projects:preference('baodroid:projectsCollapsed',true)};
function syncLayout(){
  $('app').classList.toggle('left-collapsed',layout.left);
  $('app').classList.toggle('right-collapsed',layout.right);
  $('projects').classList.toggle('folded',layout.projects);
  $('btn-toggle-left').setAttribute('aria-expanded',String(!layout.left));
  $('btn-toggle-right').setAttribute('aria-expanded',String(!layout.right));
  $('btn-toggle-projects').setAttribute('aria-expanded',String(!layout.projects));
  $('btn-toggle-projects').textContent=layout.projects?'▾ Hiện danh sách':'▴ Ẩn danh sách';
}
function setLayout(which,value){layout[which]=value;setPreference('baodroid:'+({left:'leftCollapsed',right:'rightCollapsed',projects:'projectsCollapsed'}[which]),value);syncLayout();}
function changeView(next){
  viewMode=next;const grid=$('device-grid');
  grid.classList.toggle('focused',next!=='all');
  document.querySelectorAll('[data-view]').forEach(b=>{const chosen=b.dataset.view===next;b.classList.toggle('active',chosen);b.setAttribute('aria-pressed',String(chosen));});
  document.querySelectorAll('[data-device]').forEach(card=>card.classList.toggle('is-focused',String(card.dataset.device)===next));
}

const $=(id)=>document.getElementById(id);
const html=(text)=>String(text ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function toast(text,error=false){const node=$('toast');node.textContent=text;node.className='toast show'+(error?' error':'');clearTimeout(window.toastTimer);window.toastTimer=setTimeout(()=>node.className='toast',4600);}
async function call(method,...args){try{const result=await api[method](...args);if(!result?.ok)throw new Error(result?.error || 'Yêu cầu không thành công');return result.data;}catch(e){toast(e.message,true);throw e;}}
async function safeCall(method,...args){try{return await call(method,...args);}catch{return null;}}
const projectFor=(id)=>state.config.projects.find(p=>p.id===id);
function prettyStatus(s){return ({off:'Đã dừng',booting:'Đang mở',running:'Đang chạy',error:'Mất kết nối'})[s] || s;}
function renderProjects(){
  const projects=state.config.projects,slots=state.config.slots;
  $('project-title-count').textContent=`${projects.length} / 3`;
  $('nav-count').textContent=`${projects.length}/3`;
  $('side-projects').textContent=`${projects.length} / 3`;
  $('projects-meter').style.width=`${projects.length/3*100}%`;
  $('btn-add-project').disabled=projects.length>=3;
  $('project-list').innerHTML=projects.length?projects.map(p=>{
    const i=slots.findIndex(s=>s.projectId===p.id),device=state.devices[i];
    const ready=i>=0 && device?.status==='running';
    return `<div class="project-row">
      <div class="project-info"><div class="project-icon">⌘</div><div style="min-width:0"><strong>${html(p.name)}</strong><small title="${html(p.path)}">${html(p.path)}</small></div></div>
      <div class="kind">${html(p.kind)}</div>
      <div class="project-state"><span class="dot ${ready?'green':i>=0?'orange':'gray'}"></span>${i>=0?'Máy '+(i+1):'Chưa gán'}</div>
      <div class="project-row-actions"><button class="icon-btn" title="Mở trong VS Code" data-action="vscode" data-id="${html(p.id)}">VS</button><button class="icon-btn" title="Xóa khỏi Baodroid (không xóa file dự án)" data-action="remove" data-id="${html(p.id)}">✕</button></div>
    </div>`;
  }).join(''):`<div class="empty-project"><span style="font-size:26px">▤</span><div><strong>Chưa thêm dự án nào</strong><br/>Bấm “Thêm dự án” để liên kết thư mục dự án đang mở trong VS Code.</div></div>`;
  $('project-list').querySelectorAll('[data-action]').forEach(button=>button.addEventListener('click',async()=>{
    const id=button.dataset.id;
    if(button.dataset.action==='vscode')await safeCall('openVscode',id);
    else if(window.confirm('Gỡ dự án khỏi danh sách? Các file source sẽ không bị xóa.'))await safeCall('removeProject',id);
  }));
}
function renderDevices(){
  const slots=state.config.slots,projects=state.config.projects;
  $('running-count').textContent=`${state.devices.filter(d=>d.status==='running').length} / 3`;
  $('running-meter').style.width=`${state.devices.filter(d=>d.status==='running').length/3*100}%`;
  $('device-grid').innerHTML=[0,1,2].map(i=>{
    const d=state.devices[i] || {status:'off',build:'idle',message:'Chưa khởi chạy'};
    const assigned=slots[i] || {};
    const selected=projectFor(assigned.projectId),active=d.status==='running',busy=d.status==='booting';
    const hasAvd=avds.length>0;
    const projectOptions=`<option value="">— Chọn dự án —</option>`+projects.map(p=>`<option value="${html(p.id)}" ${selected?.id===p.id?'selected':''} ${slots.some((s,j)=>j!==i&&s.projectId===p.id)?'disabled':''}>${html(p.name)}</option>`).join('');
    const avdOptions=`<option value="">${hasAvd?'— Chọn AVD —':'Chưa tìm thấy AVD'}</option>`+avds.map(x=>`<option value="${html(x)}" ${x===assigned.avd?'selected':''} ${slots.some((s,j)=>j!==i&&s.avd===x)?'disabled':''}>${html(x)}</option>`).join('');
    const statusColor=d.status==='running'?'green':d.status==='booting'?'orange':d.status==='error'?'red':'gray';
    const savedPreview=active?previews[i]:null;
    return `<article class="device-card ${active?'is-running':''} ${viewMode===String(i)?'is-focused':''}" data-device="${i}">
      <div class="device-heading"><strong><span class="dot ${statusColor}"></span>Máy Android ${i+1}</strong><div class="device-heading-actions"><span class="status-badge">${prettyStatus(d.status)}</span><button class="vscode-connect" data-connect-vscode="${i}" title="Mở hoặc chọn thư mục dự án trong VS Code; Baodroid đồng bộ trực tiếp qua file trên máy">↗ Kết nối VS Code</button></div></div>
      <select class="avd-select project-select" data-slot="${i}" aria-label="Dự án máy ${i+1}">${projectOptions}</select>
      <select class="avd-select avd-assignment" data-slot="${i}" aria-label="Android AVD máy ${i+1}">${avdOptions}</select>
      <div class="phone-wrap"><div class="phone-shell ${zoomBySlot[i]==='100'?'':'zoom-'+zoomBySlot[i]} ${savedPreview?.width>savedPreview?.height?'landscape':''}"><div class="phone-screen" data-touch-slot="${i}">
        ${savedPreview?`<img src="${savedPreview.image}" draggable="false" alt="Ảnh màn hình Android ${i+1}"/>`:`<div class="phone-placeholder"><div class="phone-symbol">▯</div><b>${busy?'Đang mở Android…':active?'Đang chờ ảnh…':selected?'Đang tự kết nối':'Chưa kết nối'}</b><small>${busy?'Đợi AVD hoàn tất khởi động':active?'ADB đang lấy ảnh màn hình':selected?'Đang tìm AVD khả dụng hoặc chờ Android SDK':'Bấm Kết nối VS Code để chọn dự án'}</small></div>`}
        <div class="camera"></div></div></div></div>
      <div class="device-message" title="${html(d.message)}">${html(d.message || '')}</div>
      <div class="device-tools">
        ${active||busy? `<button data-command="stop" data-slot="${i}" title="Dừng máy ảo và ứng dụng để giải phóng CPU/RAM">■ Dừng máy</button>`:''}
        <button data-device-action="home" data-slot="${i}" ${!active?'disabled':''} title="Màn hình Home Android">⌂ Home</button>
        <button data-device-action="back" data-slot="${i}" ${!active?'disabled':''} title="Quay lại trên Android">← Back</button>
        <button data-device-action="rotate" data-slot="${i}" ${!active?'disabled':''} title="Xoay màn hình Android">⟳ Xoay</button>
        <button data-device-action="screenshot" data-slot="${i}" ${!active?'disabled':''} title="Lưu ảnh chụp màn hình ra PC">▣ Chụp</button>
        <select class="zoom-select" data-zoom-slot="${i}" aria-label="Kích thước hiển thị máy ${i+1}">
          ${['75','100','125','150'].map(n=>`<option value="${n}" ${zoomBySlot[i]===n?'selected':''}>${n}%</option>`).join('')}
        </select>
      </div>
      <div class="device-bottom"><span>${html(d.serial||'emulator-'+(5554+i*2))}</span><span>${d.build==='building'?'Đang build…':d.build==='deploying'?'Đang deploy…':d.build==='error'?'Lỗi build':d.lastSync?'✓ Đã đồng bộ':'Chờ chạy'}</span></div>
    </article>`;
  }).join('');
  changeView(viewMode);
  document.querySelectorAll('[data-zoom-slot]').forEach(el=>el.addEventListener('change',e=>{const slot=Number(e.currentTarget.dataset.zoomSlot);zoomBySlot[slot]=e.currentTarget.value;const shell=e.currentTarget.closest('.device-card').querySelector('.phone-shell');shell.classList.remove('zoom-75','zoom-125','zoom-150');if(zoomBySlot[slot]!=='100')shell.classList.add('zoom-'+zoomBySlot[slot]);}));
  document.querySelectorAll('[data-connect-vscode]').forEach(el=>el.addEventListener('click',async e=>{
    const slot=Number(e.currentTarget.dataset.connectVscode);
    const result=await safeCall('connectVscode',slot);
    if(result)toast('Đã liên kết với VS Code qua thư mục trên máy. Baodroid tự theo dõi thay đổi file.');
  }));
  document.querySelectorAll('[data-device-action]').forEach(el=>el.addEventListener('click',async e=>{const slot=Number(e.currentTarget.dataset.slot),cmd=e.currentTarget.dataset.deviceAction;const result=await safeCall('deviceAction',slot,cmd);if(result&&cmd==='screenshot')toast('Đã lưu ảnh chụp: '+result);}));
  document.querySelectorAll('.project-select').forEach(el=>el.addEventListener('change',async e=>{await safeCall('assignProject',Number(e.target.dataset.slot),e.target.value||null);}));
  document.querySelectorAll('.avd-assignment').forEach(el=>el.addEventListener('change',async e=>{await safeCall('assignAvd',Number(e.target.dataset.slot),e.target.value);}));
  document.querySelectorAll('[data-command="stop"]').forEach(el=>el.addEventListener('click',async e=>{
    await safeCall('stopSlot',Number(e.currentTarget.dataset.slot));
  }));
  document.querySelectorAll('[data-touch-slot]').forEach(el=>{
    let down=null;
    const pos=(event)=>{const r=el.getBoundingClientRect();const prev=previews[el.dataset.touchSlot];if(!prev)return null;return {x:(event.clientX-r.left)/r.width*prev.width,y:(event.clientY-r.top)/r.height*prev.height};};
    el.addEventListener('pointerdown',event=>{if(!previews[el.dataset.touchSlot])return;down={p:pos(event),at:Date.now()};el.setPointerCapture(event.pointerId);});
    el.addEventListener('pointerup',event=>{if(!down)return;const p=pos(event),start=down;down=null;if(!p)return;const slot=Number(el.dataset.touchSlot);
      if(Math.hypot(p.x-start.p.x,p.y-start.p.y)>25)void safeCall('swipe',slot,start.p.x,start.p.y,p.x,p.y,Date.now()-start.at);
      else void safeCall('tap',slot,p.x,p.y);
    });
  });
}
function renderSettings(){const s=state.config.settings;$('sdk-path').value=s.sdkPath||'';$('auto-build').checked=Boolean(s.autoBuild);$('auto-deploy').checked=Boolean(s.autoDeploy);$('screenshots').checked=Boolean(s.screenshots);$('screenshot-interval').value=String(s.screenshotInterval||1500);}
function render(){renderProjects();renderDevices();renderSettings();}
function renderLogs(){
  const select=$('log-filter').value;
  const rows=logEntries.filter(row=>select==='all'||row.level===select).slice(-150);
  $('log-output').innerHTML=rows.map(x=>`<div class="log-line ${x.level==='error'?'error':x.level==='success'?'success':x.level==='warn'?'warn':''}"><span class="timestamp">[${html(x.time)}]</span> ${x.slot!==null&&x.slot!==undefined?'[Máy '+(x.slot+1)+'] ':''}${html(x.message)}</div>`).join('')||'<div class="log-line">Chưa có dữ liệu log.</div>';
  $('log-output').scrollTop=$('log-output').scrollHeight;
}
function showUpdate(status){
  updateInfo=status;
  $('update-popup').hidden=false;
  $('update-title').textContent=({'available':'Đã tìm thấy bản cập nhật','ready':'Sẵn sàng cài đặt','current':'Đã cập nhật','error':'Có lỗi cập nhật'})[status.state]||'Cập nhật Baodroid';
  $('update-message').textContent=status.message;
  $('update-action').hidden=!['available','ready'].includes(status.state);
  $('update-action').textContent=status.state==='ready'?'Cài đặt & khởi động lại':'Tải bản vá';
  $('update-bar').style.display=status.state==='downloading'?'block':'none';
  $('update-bar').firstElementChild.style.width=(status.percent||0)+'%';
}
async function refresh(){
  const next=await safeCall('getState');if(next){state=next;logEntries=next.logs||logEntries;render();renderLogs();}
  const list=await safeCall('listAvds');if(list){avds=list;renderDevices();}
}
function bind(){
  syncLayout();
  $('btn-toggle-left').addEventListener('click',()=>setLayout('left',!layout.left));
  $('btn-toggle-right').addEventListener('click',()=>setLayout('right',!layout.right));
  $('btn-rail-close').addEventListener('click',()=>setLayout('right',true));
  $('btn-toggle-projects').addEventListener('click',()=>setLayout('projects',!layout.projects));
  document.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>changeView(button.dataset.view)));
  window.addEventListener('keydown',e=>{if(e.key==='Escape'&&viewMode!=='all')changeView('all');});
  $('btn-add-project').addEventListener('click',async()=>{const added=await safeCall('addProject');if(added)toast('Đã thêm dự án. Baodroid đang tự tìm AVD và khởi chạy.');});
  $('btn-refresh').addEventListener('click',()=>void refresh());
  $('btn-settings').addEventListener('click',()=>{setLayout('right',false);$('settings').scrollIntoView({behavior:'smooth',block:'center'});});
  $('btn-sdk').addEventListener('click',async()=>{const result=await safeCall('chooseSdk');if(result){toast('Đã cấu hình Android SDK');void refresh();}});
  $('btn-diagnostics').addEventListener('click',async()=>{
    const node=$('diagnostics-output');node.hidden=false;node.textContent='Đang kiểm tra...';
    const report=await safeCall('diagnostics');
    if(!report){node.textContent='Không thể kiểm tra môi trường.';return;}
    node.textContent=[`ADB: ${report.adb?'Đã kiểm tra':'Chưa kết nối'}`,`AVD: ${report.avds.length} thiết bị`, `VS Code: ${report.vscodePath||'Chưa tìm thấy'}`,`Flutter: ${report.flutter||'Không có'}`, ...report.issues.map(item=>'⚠ '+item)].join('\n');
  });
  $('btn-check-adb').addEventListener('click',async()=>{const v=await safeCall('checkAdb');if(v!==null)toast('ADB: '+(v.trim().split('\n').slice(-2).join(' | ')||'Sẵn sàng'));});
  $('btn-update').addEventListener('click',()=>void safeCall('checkUpdate'));
  $('update-dismiss').addEventListener('click',()=>$('update-popup').hidden=true);
  $('update-action').addEventListener('click',()=>void safeCall(updateInfo.state==='ready'?'installUpdate':'downloadUpdate'));
  $('log-filter').addEventListener('change',renderLogs);
  $('clear-logs').addEventListener('click',()=>{logEntries=[];renderLogs();});
  const saveFlags=()=>void safeCall('setSettings',{autoBuild:$('auto-build').checked,autoDeploy:$('auto-deploy').checked,screenshots:$('screenshots').checked,screenshotInterval:Number($('screenshot-interval').value)});
  for(const id of ['auto-build','auto-deploy','screenshots','screenshot-interval'])$(id).addEventListener('change',saveFlags);
  document.querySelectorAll('.nav').forEach(nav=>nav.addEventListener('click',()=>{
    document.querySelectorAll('.nav').forEach(n=>n.classList.remove('selected'));nav.classList.add('selected');
    const target=nav.dataset.target==='dashboard'?'dashboard':nav.dataset.target;
    if(target==='dashboard')$('dashboard').scrollTo({top:0,behavior:'smooth'});
    else if(target==='projects'){setLayout('projects',false);$(target).scrollIntoView({behavior:'smooth',block:'start'});}
    else {if(target==='settings')setLayout('right',false);$(target).scrollIntoView({behavior:'smooth',block:'start'});}
  }));
  $('repo-link').addEventListener('click',event=>{event.preventDefault();toast('Repository: github.com/techzoneadapter-droid/baodroid');});
  api.onState(next=>{state=next;render();});
  api.onLog(line=>{logEntries.push(line);if(logEntries.length>350)logEntries.shift();renderLogs();});
  api.onPreview(info=>{previews[info.slot]=info;const screen=document.querySelector(`.phone-screen[data-touch-slot="${info.slot}"]`);if(!screen)return;
    screen.closest('.phone-shell')?.classList.toggle('landscape',info.width>info.height);
    let img=screen.querySelector('img');if(!img){screen.querySelector('.phone-placeholder')?.remove();img=document.createElement('img');img.alt=`Ảnh màn hình Android ${info.slot+1}`;img.draggable=false;screen.prepend(img);}img.src=info.image;
  });
  api.onUpdate(showUpdate);
}
window.addEventListener('DOMContentLoaded',()=>{bind();void refresh();});
