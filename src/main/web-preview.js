'use strict';
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {launch,stopProcess}=require('./process');

const PORT_BASE=43120;
const isWebKind=kind=>kind==='web'||kind==='expo-web';
const portForSlot=slot=>PORT_BASE+slot;
function waitForServer(port, timeout=1300){
  return new Promise(resolve=>{
    const req=http.request({hostname:'127.0.0.1',port,path:'/',method:'GET',timeout},res=>{
      res.resume();
      resolve(res.statusCode>=200&&res.statusCode<500);
    });
    req.once('timeout',()=>req.destroy(new Error('timeout')));
    req.once('error',()=>resolve(false));
    req.end();
  });
}
class WebPreviewManager {
  constructor(engine){
    this.engine=engine;
    this.workers=Array.from({length:3},()=>({process:null,install:null,launchId:0,active:false,timer:null,retries:0,firstReady:0}));
    this.closed=false;
  }
  isWebSlot(slot){
    return this.engine.devices[slot]?.previewMode==='web';
  }
  project(slot){
    const assigned=this.engine.store.data.slots[slot];
    if(!assigned?.projectId)throw new Error('Chọn thư mục dự án trước.');
    const project=this.engine.project(assigned.projectId);
    if(!isWebKind(project.kind))throw new Error('Dự án này cần Android Emulator, không phải Web Preview.');
    return project;
  }
  start(slot){
    const project=this.project(slot);
    const worker=this.workers[slot];
    if(this.closed)return false;
    worker.active=true;
    clearTimeout(worker.timer);
    if(worker.process && worker.process.exitCode===null)return true;
    const root=fs.realpathSync(project.path);
    if(!fs.existsSync(path.join(root,'node_modules'))){
      this.engine.update(slot,{
        status:'error',previewMode:'web',webUrl:null,build:'error',
        message:'Chưa cài thư viện. Nhấn "Cài thư viện" một lần để npm install rồi tự chạy.'
      });
      return false;
    }
    const port=portForSlot(slot);
    const args=project.kind==='expo-web'?
      ['--no-install','expo','start','--web','--port',String(port),'--localhost']:
      ['run','dev','--','--host','127.0.0.1','--port',String(port),'--strictPort'];
    const cmd=process.platform==='win32'?(project.kind==='expo-web'?'npx.cmd':'npm.cmd'):(project.kind==='expo-web'?'npx':'npm');
    const launchId=++worker.launchId;
    const env={...process.env,EXPO_NO_TELEMETRY:'1',BROWSER:'none'};
    this.engine.update(slot,{
      status:'booting',previewMode:'web',webUrl:null,build:'building',
      serial:'web-local-'+(slot+1),
      message:project.kind==='expo-web'?'Đang khởi động Expo Web trên Windows…':'Đang khởi động Vite trên Windows…'
    });
    this.engine.log('Preview '+project.name+' ('+project.kind+') qua http://127.0.0.1:'+port,'info',slot);
    const workerLine=line=>{
      if(worker.launchId!==launchId)return;
      if(/error|failed|cannot find module|missing dependencies/i.test(line)){
        this.engine.log('Dev server: '+line,'warn',slot);
      }
    };
    let child;
    try{
      child=launch(cmd,args,{cwd:root,env,shell:process.platform==='win32',onLine:workerLine});
    }catch(e){
      this.engine.update(slot,{status:'error',build:'error',message:'Không chạy được Node/npm: '+e.message});
      return false;
    }
    worker.process=child;
    child.on('error',err=>{
      if(worker.launchId!==launchId||!worker.active)return;
      this.fail(slot,launchId,'Không mở được npm/Expo trên máy: '+err.message);
    });
    child.on('close',code=>{
      if(worker.launchId!==launchId||!worker.active)return;
      worker.process=null;
      this.fail(slot,launchId,'Dev server đã thoát (mã '+code+'). Kiểm tra dependencies hoặc log.');
    });
    const check=async()=>{
      if(!worker.active||this.closed||worker.launchId!==launchId)return;
      for(let tries=0;tries<150;tries++){
        if(!worker.active||this.closed||worker.launchId!==launchId)return;
        if(await waitForServer(port)){
          worker.firstReady=Date.now();
          this.engine.update(slot,{
            status:'running',build:'success',
            previewMode:'web',webUrl:'http://127.0.0.1:'+port+'/',
            lastSync:new Date().toISOString(),
            message:project.kind==='expo-web'?'Expo Web đang chạy • preview mobile (không giả lập native)':'Vite đang chạy • HMR tự cập nhật khi lưu code'
          });
          this.engine.log('Preview '+project.name+' đã sẵn sàng trên máy '+(slot+1),'success',slot);
          return;
        }
        await new Promise(r=>setTimeout(r,650));
      }
      this.fail(slot,launchId,'Dev server khởi động quá lâu. Mở nhật ký để kiểm tra.');
    };
    void check();
    return true;
  }
  fail(slot,launchId,message){
    const worker=this.workers[slot];
    if(!worker.active||this.closed||worker.launchId!==launchId)return;
    worker.launchId++; // invalidate old process callbacks and readiness polling
    const proc=worker.process;
    worker.process=null;
    if(proc)stopProcess(proc);
    this.engine.update(slot,{status:'error',build:'error',webUrl:null,previewMode:'web',message});
    this.engine.log(message,'error',slot);
    if(worker.retries>=2)return;
    const delay=[4000,10000][worker.retries++];
    this.engine.log('Web preview tự thử kết nối lại sau '+delay/1000+' giây.','warn',slot);
    worker.timer=setTimeout(()=>this.start(slot),delay);
  }
  installDependencies(slot){
    const project=this.project(slot);
    const worker=this.workers[slot];
    if(worker.install)throw new Error('npm install đang chạy cho máy này.');
    const root=fs.realpathSync(project.path);
    const cmd=process.platform==='win32'?'npm.cmd':'npm';
    this.engine.update(slot,{status:'booting',build:'building',previewMode:'web',message:'Đang cài dependencies cục bộ bằng npm install…'});
    const child=launch(cmd,['install','--no-audit','--no-fund'],{
      cwd:root,shell:process.platform==='win32',
      onLine:line=>{
        if(/ERR!|error/i.test(line))this.engine.log('npm: '+line,'error',slot);
      }
    });
    worker.install=child;
    child.on('error',error=>{
      if(worker.install!==child)return;
      worker.install=null;
      this.engine.update(slot,{status:'error',build:'error',message:'Không chạy được npm install: '+error.message});
    });
    child.on('close',code=>{
      if(worker.install!==child)return;
      worker.install=null;
      if(code===0){
        worker.retries=0;
        this.engine.log('Đã cài dependencies; bắt đầu preview.','success',slot);
        this.start(slot);
      }else{
        this.engine.update(slot,{status:'error',build:'error',message:'npm install lỗi (mã '+code+'). Kiểm tra Log hoặc npm trong VS Code.'});
      }
    });
    return true;
  }
  stop(slot){
    const w=this.workers[slot];
    w.active=false;w.launchId++;
    clearTimeout(w.timer);w.timer=null;
    if(w.process){stopProcess(w.process);w.process=null;}
    if(w.install){stopProcess(w.install);w.install=null;}
    w.retries=0;
  }
  dispose(){this.closed=true;for(let i=0;i<3;i++)this.stop(i);}
}
module.exports={WebPreviewManager,isWebKind,portForSlot,waitForServer};
