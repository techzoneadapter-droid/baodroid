'use strict';
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {spawn}=require('node:child_process');

const ALLOWED_MODELS=['gpt-5.1-codex','gpt-5.1','gpt-5-mini','gpt-4.1'];
const IGNORE_DIRS=new Set(['.git','node_modules','.gradle','.dart_tool','.idea','.expo','.next','Pods','build','dist','out','coverage','.baodroid','vendor']);
const ALLOWED_EXT=new Set(['.js','.jsx','.ts','.tsx','.dart','.kt','.java','.xml','.gradle','.json','.yaml','.yml','.css','.scss','.sass','.html','.md','.properties','.txt','.swift','.m','.mm','.h','.c','.cpp','.kts']);
const FILE_CAP=750000;
const TOTAL_CAP=24*1024*1024;
const FILES_CAP=700;
function hash(value){return crypto.createHash('sha256').update(value).digest('hex');}
function canReadFile(name){
  if(/(^|[\\/])(\.env(?:\..*)?|\.npmrc|\.pypirc|id_rsa|auth\.json|credentials\.json)$/i.test(name))return false;
  if(/\.(pem|key|p12|pfx|keystore|jks|apk|png|jpg|zip|sqlite|db|lock)$/i.test(name))return false;
  if(['gradlew','gradlew.bat','Podfile','Gemfile','Dockerfile'].includes(path.basename(name)))return true;
  return ALLOWED_EXT.has(path.extname(name).toLowerCase());
}
function scanSources(root){
  if(!fs.existsSync(root)||!fs.statSync(root).isDirectory())throw new Error('Không tìm thấy thư mục dự án trên máy.');
  const output=new Map();
  let total=0,count=0;
  const walk=(dir,depth)=>{
    if(depth>14)return;
    for(const item of fs.readdirSync(dir,{withFileTypes:true})){
      if(item.isSymbolicLink())continue;
      if(item.isDirectory()){
        if(!IGNORE_DIRS.has(item.name))walk(path.join(dir,item.name),depth+1);
        continue;
      }
      if(!item.isFile())continue;
      const full=path.join(dir,item.name);
      const rel=path.relative(root,full).replace(/\\/g,'/');
      if(!canReadFile(rel))continue;
      const stat=fs.statSync(full);
      if(stat.size>FILE_CAP)continue;
      if(++count>FILES_CAP || total+stat.size>TOTAL_CAP)throw new Error('Dự án có quá nhiều file nguồn để tạo điểm hoàn tác an toàn. Hãy thu gọn dự án hoặc dọn thư mục build.');
      const data=fs.readFileSync(full);
      total+=data.length;
      output.set(rel,{data,hash:hash(data)});
    }
  };
  walk(root,0);return output;
}
function changesBetween(before,after){
  const changes=[];
  for(const rel of new Set([...before.keys(),...after.keys()])){
    if(before.get(rel)?.hash!==after.get(rel)?.hash)changes.push({path:rel,status:!before.has(rel)?'added':!after.has(rel)?'deleted':'modified',afterHash:after.get(rel)?.hash||null});
  }
  return changes.sort((a,b)=>a.path.localeCompare(b.path));
}
function restoreSources(root,before,changes) {
  const current=scanSources(root);
  for(const change of changes){
    if((current.get(change.path)?.hash||null)!==change.afterHash)throw new Error('File '+change.path+' đã thay đổi sau khi AI sửa. Hoàn tác bị hủy để tránh ghi đè code mới.');
  }
  for(const change of changes){
    const full=path.resolve(root,change.path);
    if(!full.startsWith(path.resolve(root)+path.sep))throw new Error('Đường dẫn file không hợp lệ.');
    const previous=before.get(change.path);
    if(previous){
      fs.mkdirSync(path.dirname(full),{recursive:true});
      fs.writeFileSync(full,previous.data);
    }else if(fs.existsSync(full)&&fs.lstatSync(full).isFile())fs.unlinkSync(full);
  }
  return changes.length;
}
function execute(args,{cwd=null,onLine=null,onErrorLine=null,timeoutMs=30000,input=null}={}) {
  return new Promise((resolve,reject)=>{
    const child=spawn('codex',args,{cwd:cwd||process.cwd(),windowsHide:true,
      shell:process.platform==='win32',stdio:['pipe','pipe','pipe']});
    let stdout='',stderr='',settled=false;
    const timer=setTimeout(()=>{child.kill();finish(new Error('Codex không phản hồi đúng thời gian.'));},timeoutMs);
    function finish(err,value){
      if(settled)return;settled=true;clearTimeout(timer);
      if(err)reject(err);else resolve(value);
    }
    const handle=(stream,which)=>{
      let pending='';
      stream.on('data',buf=>{
        pending+=buf.toString('utf8');
        if(pending.length>1024*1024){child.kill();finish(new Error('Đầu ra Codex quá dài.'));return;}
        let at;
        while((at=pending.indexOf('\n'))>=0){
          const line=pending.slice(0,at).trim();pending=pending.slice(at+1);
          if(which==='stdout'){
            stdout=(stdout+'\n'+line).slice(-70000);
            if(onLine)onLine(line);
          }else{
            stderr=(stderr+'\n'+line).slice(-15000);
            if(onErrorLine)onErrorLine(line);
          }
        }
      });
    };
    handle(child.stdout,'stdout');handle(child.stderr,'stderr');
    child.on('error',error=>finish(new Error('Codex CLI không khả dụng: '+error.message)));
    child.on('close',code=>code===0?finish(null,{stdout,stderr}):finish(new Error((stderr||stdout||'Codex thoát với mã '+code).slice(-1200))));
    if(input!==null){child.stdin.end(String(input));}else child.stdin.end();
  });
}
function shortText(value,max=500){return String(value??'').slice(0,max);}
class AIManager {
  constructor(engine,emit){
    this.engine=engine;this.emit=emit;
    this.sessions=Array.from({length:3},()=>({projectId:null,model:'gpt-5.1-codex',messages:[],busy:false,connected:false,changes:[],before:null,process:null,stopping:false}));
    this.authProcess=null;
    this.authenticated=false;
    this.installed=null;
  }
  slot(index){
    if(!Number.isInteger(index)||index<0||index>2)throw new Error('Vị trí Android không hợp lệ.');
    const projectId=this.engine.store.data.slots[index].projectId;
    const s=this.sessions[index];
    if(s.projectId!==projectId){
      if(s.busy)throw new Error('AI đang sửa dự án. Hãy dừng tác vụ trước khi đổi dự án.');
      s.projectId=projectId;
      s.messages=[];s.before=null;s.changes=[];s.connected=false;
    }
    return s;
  }
  event(slot,payload){this.emit('ai-event',{slot,...payload});}
  isBusy(slot){return this.sessions[slot]?.busy||false;}
  async checkInstall(){
    try{await execute(['--version'],{timeoutMs:12000});this.installed=true;}
    catch{this.installed=false;}
    return this.installed;
  }
  async checkAuth(){
    if(!(await this.checkInstall())){this.authenticated=false;return false;}
    try{await execute(['login','status'],{timeoutMs:12000});this.authenticated=true;}
    catch{this.authenticated=false;}
    return this.authenticated;
  }
  state(slot){
    const s=this.slot(slot);
    return {installed:this.installed,authenticated:this.authenticated,connected:s.connected,
      model:s.model,messages:s.messages.slice(-20),busy:s.busy,changes:s.changes.map(c=>({path:c.path,status:c.status})),canUndo:s.changes.length>0&&!s.busy};
  }
  async connect(slot){
    const s=this.slot(slot);
    if(!s.projectId)throw new Error('Vui lòng chọn dự án Android cho máy này trước.');
    if(!(await this.checkInstall()))throw new Error('Chưa có Codex CLI. Cài một lần bằng lệnh: npm install -g @openai/codex, sau đó bấm Kết nối lại.');
    if(await this.checkAuth()){
      s.connected=true;
      this.event(slot,{type:'connected',message:'Đã kết nối ChatGPT qua Codex. Cuộc trò chuyện của máy này độc lập.'});
      return this.state(slot);
    }
    if(this.authProcess) {
      this.event(slot,{type:'info',message:'Đang chờ đăng nhập ChatGPT trên trình duyệt…'});
      return this.state(slot);
    }
    this.event(slot,{type:'info',message:'Đang mở trình duyệt để đăng nhập ChatGPT…'});
    const child=spawn('codex',['login'],{windowsHide:true,shell:process.platform==='win32',stdio:['ignore','pipe','pipe']});
    this.authProcess=child;
    let diagnostic='';
    child.stdout.on('data',b=>{diagnostic=(diagnostic+b.toString()).slice(-900);});
    child.stderr.on('data',b=>{diagnostic=(diagnostic+b.toString()).slice(-900);});
    child.on('error',e=>{
      this.authProcess=null;
      this.event(slot,{type:'error',message:'Không mở được trình đăng nhập: '+e.message});
    });
    child.on('close',async code=>{
      this.authProcess=null;
      if(code===0 && await this.checkAuth()){
        for(let i=0;i<3;i++){
          const other=this.sessions[i];
          if(other.projectId){other.connected=true;this.event(i,{type:'connected',message:'Đã đăng nhập ChatGPT. Bạn có thể gửi prompt.'});}
        }
      } else this.event(slot,{type:'error',message:'Đăng nhập không thành công. '+shortText(diagnostic,250)});
    });
    return this.state(slot);
  }
  send(slot,prompt,model){
    const s=this.slot(slot);
    if(!s.projectId)throw new Error('Chưa có dự án cho màn hình Android này.');
    if(s.busy)throw new Error('AI đang xử lý yêu cầu trước đó.');
    if(!this.authenticated)throw new Error('Bấm Kết nối ChatGPT và đăng nhập trước khi gửi prompt.');
    if(!ALLOWED_MODELS.includes(model))throw new Error('Model không được hỗ trợ trong danh sách.');
    if(typeof prompt!=='string'||!prompt.trim()||prompt.length>6000)throw new Error('Prompt phải có 1–6000 ký tự.');
    const project=this.engine.project(s.projectId);
    const root=fs.realpathSync(project.path);
    const before=scanSources(root); // refuse unsafe undo footprint before editing
    s.model=model;s.busy=true;s.changes=[];s.before=null;s.stopping=false;
    const previous=s.messages.slice(-8).map(x=>x.role+': '+x.content).join('\n');
    s.messages.push({role:'user',content:prompt.trim()});
    if(s.messages.length>30)s.messages=s.messages.slice(-30);
    this.event(slot,{type:'state',state:this.state(slot)});
    const guard=[ 'Bạn là trợ lý viết code trong BAODROID, đang sửa dự án Android trong một thư mục cục bộ.',
      'Chỉ làm đúng yêu cầu người dùng. TUYỆT ĐỐI không sửa hay đọc dữ liệu ở thư mục khác, không dùng network, không đụng secret, không xóa hàng loạt.',
      'Sử dụng workspace hiện tại làm root. Chỉ chỉnh file nguồn cần thiết, không sửa .env/.git/credentials hay chạy lệnh phá hoại.',
      'Giải thích kết quả bằng tiếng Việt ngắn gọn. Ứng dụng bên ngoài sẽ tự preview file vừa thay đổi.',
      'NGỮ CẢNH CHAT CỦA RIÊNG DỰ ÁN NÀY:\n'+previous,
      'YÊU CẦU MỚI:\n'+prompt.trim()].join('\n\n');
    const args=['exec','--json','--sandbox','workspace-write','--ask-for-approval','never','--skip-git-repo-check','--model',model,'-'];
    const child=spawn('codex',args,{cwd:root,windowsHide:true,shell:process.platform==='win32',stdio:['pipe','pipe','pipe']});
    s.process=child;
    child.stdin.end(guard);
    let buffer='',stderr='',answer='',done=false;
    const finish=(error)=>{
      if(done)return;done=true;s.process=null;s.busy=false;
      try{
        const current=scanSources(root);
        s.changes=changesBetween(before,current);
        s.before=s.changes.length?before:null;
      }catch(e){s.changes=[];s.before=null;error=error||e;}
      if(error){
        this.event(slot,{type:'error',message:shortText(error.message,650)});
        s.messages.push({role:'assistant',content:'Tác vụ gặp lỗi: '+shortText(error.message,400)});
      }else{
        const message=answer||'Đã xử lý yêu cầu.';
        s.messages.push({role:'assistant',content:shortText(message,6000)});
        this.event(slot,{type:'message',message:shortText(message,6000)});
      }
      this.event(slot,{type:'done',changes:s.changes.map(c=>({path:c.path,status:c.status})),canUndo:s.changes.length>0});
      if(s.messages.length>30)s.messages=s.messages.slice(-30);
    };
    child.stdout.on('data',chunk=>{
      buffer+=chunk.toString('utf8');
      if(buffer.length>1000000){child.kill();finish(new Error('Phản hồi AI quá dài.'));return;}
      let cut;
      while((cut=buffer.indexOf('\n'))>=0){
        const line=buffer.slice(0,cut);buffer=buffer.slice(cut+1);
        let evt;try{evt=JSON.parse(line);}catch{continue;}
        if(evt.type==='item.completed'&&evt.item?.type==='agent_message')answer=String(evt.item.text||'').slice(-6000);
        else if(evt.type==='turn.failed')stderr=(stderr+' '+JSON.stringify(evt.error||{})).slice(-1500);
        else if(evt.type==='item.started'&&evt.item?.type==='command_execution')this.event(slot,{type:'info',message:'AI đang kiểm tra và chỉnh sửa file…'});
      }
    });
    child.stderr.on('data',chunk=>{stderr=(stderr+chunk.toString('utf8')).slice(-2400);});
    child.on('error',error=>finish(new Error('Không khởi chạy được Codex: '+error.message)));
    child.on('close',code=>finish(code===0?null:new Error(s.stopping?'Đã dừng tác vụ.':stderr||'Codex dừng với mã '+code)));
    return this.state(slot);
  }
  stop(slot){
    const s=this.slot(slot);
    if(!s.process)return false;
    s.stopping=true;
    if(process.platform==='win32'){
      const kill=spawn('taskkill',['/PID',String(s.process.pid),'/T','/F'],{windowsHide:true});
      kill.on('error',()=>{});
    }else s.process.kill();
    return true;
  }
  previewChanges(slot){
    const session=this.slot(slot);
    if(!session.before || !session.changes.length)return [];
    const project=this.engine.project(session.projectId);
    const root=fs.realpathSync(project.path);
    const now=scanSources(root);
    return session.changes.slice(0,12).map(change=>({
      path:change.path,
      status:change.status,
      before:(session.before.get(change.path)?.data.toString('utf8')||'').slice(0,2500),
      after:(now.get(change.path)?.data.toString('utf8')||'').slice(0,2500)
    }));
  }
  undo(slot){
    const s=this.slot(slot);
    if(s.busy)throw new Error('Vui lòng dừng AI trước khi hoàn tác.');
    if(!s.before||!s.changes.length)throw new Error('Không có thay đổi AI để hoàn tác.');
    const root=fs.realpathSync(this.engine.project(s.projectId).path);
    const count=restoreSources(root,s.before,s.changes);
    s.changes=[];s.before=null;
    this.event(slot,{type:'info',message:'Đã hoàn tác '+count+' file. Preview sẽ cập nhật khi watcher nhận thay đổi.'});
    return this.state(slot);
  }
  dispose(){
    for(let i=0;i<3;i++)if(this.sessions[i].process)this.stop(i);
    if(this.authProcess)this.authProcess.kill();
  }
}
module.exports={AIManager,scanSources,changesBetween,restoreSources,canReadFile,ALLOWED_MODELS};
