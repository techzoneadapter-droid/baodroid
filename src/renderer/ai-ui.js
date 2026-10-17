'use strict';
/* Per-project Codex sessions. Login is shared by ChatGPT account,
 * but chat state and permitted workspace are independent per slot. */
(() => {
 const api=window.baodroid;
 const escapeHTML=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
 const models=['gpt-5.1-codex','gpt-5.1','gpt-5-mini','gpt-4.1'];
 const data=Array.from({length:3},()=>({model:'gpt-5.1-codex',messages:[],changes:[],busy:false,connected:false,authenticated:false,installed:null,canUndo:false}));
 const drafts=['','',''];
 const notes=['','',''];
 const diffs=['','',''];
 let checked=false;
 async function call(name,...args){
   try{
     const answer=await api[name](...args);
     if(!answer?.ok)throw new Error(answer?.error||'Thao tác AI không thành công.');
     return answer.data;
   }catch(error){
     alertAI(error?.message||String(error));
     return null;
   }
 }
 function alertAI(text){
   const t=document.getElementById('toast');
   if(t){t.textContent=text;t.className='toast visible error';setTimeout(()=>{if(t.textContent===text)t.className='toast';},7000);}
 }
 function currentProject(i){
   const select=document.querySelector('[data-project-slot="'+i+'"]');
   return select?.value||'';
 }
 function makePanel(i){
   const panel=document.createElement('section');
   panel.className='ai-panel';
   panel.dataset.aiPanel=String(i);
   panel.innerHTML=
     '<div class="ai-head"><div><strong>✦ AI viết code</strong><small>Chỉ sửa dự án của máy '+(i+1)+'</small></div>'+
     '<button type="button" class="button ai-connect" data-ai-connect="'+i+'">Kết nối ChatGPT</button></div>'+
     '<div class="ai-model-row"><label for="ai-model-'+i+'">Model</label>'+
     '<select class="ai-model" id="ai-model-'+i+'">'+models.map(m=>'<option value="'+m+'">'+m+'</option>').join('')+'</select>'+
     '<span class="ai-indicator" data-ai-indicator="'+i+'">Chưa kết nối</span></div>'+
     '<div class="ai-history" data-ai-history="'+i+'" aria-live="polite"></div>'+
     '<div class="ai-revisions" data-ai-revisions="'+i+'" hidden></div>'+
     '<form class="ai-compose" data-ai-form="'+i+'">'+
     '<textarea rows="3" data-ai-input="'+i+'" maxlength="6000" placeholder="Ví dụ: làm lại giao diện đăng nhập theo Material 3, giữ nguyên logic..."></textarea>'+
     '<div class="ai-actions"><button type="submit" class="button primary ai-send">Gửi & sửa code</button>'+
     '<button type="button" class="button quiet" data-ai-stop="'+i+'">Dừng</button>'+
     '<button type="button" class="button quiet" data-ai-undo="'+i+'">Hoàn tác</button>'+'<button type="button" class="button quiet" data-ai-preview="'+i+'">Xem thay đổi</button></div></form>'+
     '<small class="ai-footnote">AI chỉnh file ngay trong thư mục dự án cục bộ; preview tự cập nhật theo build/hot reload. Hoàn tác được thay đổi gần nhất.</small>';
   panel.querySelector('.ai-model').value=data[i].model;
   panel.querySelector('.ai-model').addEventListener('change',event=>{
     data[i].model=event.target.value;
   });
   const text=panel.querySelector('textarea');
   text.value=drafts[i];
   text.addEventListener('input',()=>{drafts[i]=text.value;});
   panel.querySelector('[data-ai-connect]').addEventListener('click',()=>void connect(i));
   panel.querySelector('[data-ai-stop]').addEventListener('click',()=>void stop(i));
   panel.querySelector('[data-ai-undo]').addEventListener('click',()=>void undo(i));
   panel.querySelector('[data-ai-preview]').addEventListener('click',()=>void showChanges(i));
   panel.querySelector('form').addEventListener('submit',event=>{
     event.preventDefault();void send(i);
   });
   return panel;
 }
 function install(){
   const grid=document.getElementById('device-grid');
   if(!grid)return;
   grid.querySelectorAll(':scope > .device-card').forEach(card=>{
     const i=Number(card.dataset.device);
     if(!Number.isInteger(i)||i<0||i>2 || card.querySelector('[data-ai-panel]'))return;
     const head=card.querySelector('.device-head');
     if(head && !head.querySelector('[data-ai-top]')){
       const top=document.createElement('button');
       top.type='button';top.className='button ai-top-button';top.dataset.aiTop=String(i);
       top.textContent='✦ Kết nối ChatGPT';
       top.addEventListener('click',()=>void connect(i));
       head.append(top);
     }
     card.append(makePanel(i));
     update(i);
   });
 }
 function update(i){
   const panel=document.querySelector('[data-ai-panel="'+i+'"]');
   if(!panel)return;
   const session=data[i];
   const ready=Boolean(currentProject(i));
   const auth=session.connected&&session.authenticated;
   const status=session.busy?'Đang sửa code…':auth?'Đã kết nối':session.installed===false?'Cần cài Codex CLI':'Chưa kết nối';
   panel.querySelector('.ai-indicator').textContent=status;
   panel.querySelector('.ai-indicator').classList.toggle('online',auth);
   panel.querySelector('.ai-send').disabled=!ready||!auth||session.busy;
   panel.querySelector('[data-ai-stop]').disabled=!session.busy;
   panel.querySelector('[data-ai-undo]').disabled=!ready||!session.canUndo||session.busy;
   panel.querySelector('[data-ai-preview]').disabled=!ready||!session.canUndo||session.busy;
   panel.querySelector('.ai-connect').disabled=!ready||session.busy;
   const top=document.querySelector('[data-ai-top="'+i+'"]');
   if(top){top.disabled=!ready;top.textContent=auth?'✦ ChatGPT ✓':'✦ Kết nối ChatGPT';}
   panel.querySelector('.ai-model').disabled=session.busy;
   const history=panel.querySelector('.ai-history');
   let messages=session.messages.map(msg=>
     '<div class="ai-message '+(msg.role==='user'?'user':'agent')+'"><strong>'+ (msg.role==='user'?'Bạn':'AI')+'</strong><p>'+escapeHTML(msg.content)+'</p></div>').join('');
   if(notes[i])messages+='<p class="ai-note">'+escapeHTML(notes[i])+'</p>';
   if(!messages)messages='<p class="ai-empty">Kết nối ChatGPT, chọn model và gửi yêu cầu. Lịch sử của mỗi máy riêng biệt.</p>';
   if(history.innerHTML!==messages){
     history.innerHTML=messages;
     history.scrollTop=history.scrollHeight;
   }
   const revisions=panel.querySelector('.ai-revisions');
   revisions.hidden=!session.changes?.length;
   revisions.innerHTML=(session.changes||[]).length?
     '<strong>File AI vừa sửa:</strong><ul>'+session.changes.map(c=>
       '<li>'+escapeHTML(c.status)+' · '+escapeHTML(c.path)+'</li>').join('')+'</ul>'+diffs[i]:'';
 }
 async function status(i){
   const latest=await call('aiStatus',i);
   if(latest){
     const model=data[i].model;
     data[i]={...data[i],...latest,model};
     update(i);
   }
 }
 async function connect(i){
   if(!currentProject(i)){alertAI('Hãy chọn một dự án cho máy Android '+(i+1)+' trước khi kết nối AI.');return;}
   notes[i]='Đang kiểm tra Codex CLI / đăng nhập ChatGPT…';
   update(i);
   const result=await call('aiConnect',i);
   if(result){
     data[i]={...data[i],...result,model:data[i].model};
     if(result.installed===false)notes[i]='Cài Codex CLI một lần: npm install -g @openai/codex';
     else notes[i]=result.authenticated?'Đã kết nối ChatGPT.':'Trình duyệt sẽ mở để đăng nhập ChatGPT. Sau khi đăng nhập, quay lại Baodroid.';
   }else{
     notes[i]='Nếu thiếu Codex CLI: mở Windows Terminal và chạy npm install -g @openai/codex, sau đó thử lại.';
   }
   update(i);
 }
 async function send(i){
   const input=document.querySelector('[data-ai-input="'+i+'"]');
   const prompt=(input?.value||drafts[i]).trim();
   if(!prompt)return;
   if(!data[i].connected){await connect(i);if(!data[i].authenticated)return;}
   notes[i]='AI đang đọc và chỉnh sửa file dự án…';
   const result=await call('aiSend',i,prompt,data[i].model);
   if(result){
     drafts[i]='';if(input)input.value='';
     data[i]={...data[i],...result,model:data[i].model};
     update(i);
   }
 }
 async function stop(i){
   const result=await call('aiStop',i);
   if(result)notes[i]='Đã yêu cầu dừng tác vụ; đang chờ quá trình kết thúc.';
   update(i);
 }
 async function showChanges(i){
   const result=await call('aiPreview',i);
   if(!result)return;
   diffs[i]=result.map(change=>
     '<details class="ai-diff"><summary>'+escapeHTML(change.path)+'</summary>'+
     '<div class="ai-diff-columns"><div><strong>Trước</strong><pre>'+escapeHTML(change.before)+'</pre></div>'+
     '<div><strong>Sau</strong><pre>'+escapeHTML(change.after)+'</pre></div></div></details>').join('');
   update(i);
 }
 async function undo(i){
   if(!confirm('Hoàn tác các file mà AI vừa sửa cho máy '+(i+1)+'?'))return;
   const result=await call('aiUndo',i);
   if(result){data[i]={...data[i],...result,model:data[i].model};diffs[i]='';notes[i]='Đã khôi phục các file nguồn. Preview sẽ đồng bộ lại.';}
   update(i);
 }
 function receive(event){
   const i=event.slot;
   if(!Number.isInteger(i)||i<0||i>2)return;
   if(event.type==='state'&&event.state){
     data[i]={...data[i],...event.state,model:data[i].model};
     notes[i]='Codex đang thực hiện yêu cầu…';
   }else if(event.type==='connected'){
     data[i].connected=true;data[i].authenticated=true;notes[i]=event.message;
   }else if(event.type==='error'){
     notes[i]=event.message;
   }else if(event.type==='info')notes[i]=event.message;
   else if(event.type==='done'){
     diffs[i]='';
     notes[i]=event.changes?.length?'Hoàn tất. Đã thay đổi '+event.changes.length+' file.':(event.canUndo?'Đã chỉnh sửa.':'Hoàn tất, không phát hiện file thay đổi.');
     void status(i);
   }
   update(i);
 }
 window.addEventListener('DOMContentLoaded',()=>{
   const grid=document.getElementById('device-grid');
   if(!grid)return;
   const observer=new MutationObserver(install);
   observer.observe(grid,{childList:true,subtree:false});
   install();
   api.onAIEvent(receive);
   if(!checked){
     checked=true;
     for(let i=0;i<3;i++)void status(i);
   }
 });
})();
