'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const chokidar = require('chokidar');
const {spawn} = require('node:child_process');
const {detectProject, readApplicationId, gradleRoot, findDebugApk} = require('../shared/project');
const {sdkRoot, toolsForSdk, exec, launch, stopProcess, gradleCommand} = require('./process');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const isSlot = i => Number.isInteger(i) && i >= 0 && i <= 2;

class Engine {
  constructor(store, emit) {
    this.store = store; this.emit = emit;
    this.devices = Array.from({length:3}, (_,i) => ({slot:i,status:'off',serial:`emulator-${5554 + i*2}`,preview:null,build:'idle',message:'Chưa khởi chạy',lastSync:null}));
    this.workers = Array.from({length:3}, () => ({emulator:null,runner:null,watcher:null,timer:null,debounce:null,generation:0,busy:false,dirty:false,manuallyDeploy:false,flutterReady:false}));
    this.logs=[]; this.closed=false;
  }
  log(message, level='info', slot=null) {
    const record = {time:new Date().toLocaleTimeString('vi-VN', {hour12:false}), message:String(message).slice(0,900), level, slot};
    this.logs.push(record); if (this.logs.length>350) this.logs.shift();
    this.emit('log', record);
  }
  snapshot() {
    return {config: this.store.data, devices: this.devices.map(d => ({...d,preview:undefined})), logs:this.logs.slice(-100)};
  }
  changed() { this.store.save(); this.emit('state', this.snapshot()); }
  update(i, patch) { Object.assign(this.devices[i],patch); this.emit('state', this.snapshot()); }
  requireSlot(i) { if (!isSlot(i)) throw new Error('Máy ảo không hợp lệ.'); return i; }
  requireStopped(i) { if (this.devices[i].status !== 'off' && this.devices[i].status !== 'error') throw new Error('Dừng máy ảo trước khi thay đổi dự án hoặc thiết bị.'); }
  project(id) { const result = this.store.data.projects.find(p => p.id === id); if (!result) throw new Error('Không tìm thấy dự án.'); return result; }
  addProject(folder) {
    if (this.store.data.projects.length >= 3) throw new Error('Giới hạn tối đa 3 dự án.');
    const normalized = path.resolve(folder);
    if (this.store.data.projects.some(p => p.path.toLowerCase() === normalized.toLowerCase())) throw new Error('Dự án đã được thêm.');
    const kind = detectProject(normalized);
    const project = {id:crypto.randomUUID(),name:path.basename(normalized),path:normalized,kind};
    this.store.data.projects.push(project);
    const i = this.store.data.slots.findIndex(x => !x.projectId);
    if (i !== -1) this.store.data.slots[i].projectId=project.id;
    this.changed(); this.log(`Đã kết nối ${project.name} (${kind}).`); return project;
  }
  removeProject(id) {
    this.project(id);
    if (this.store.data.slots.some((s,i) => s.projectId===id && this.devices[i].status !== 'off' && this.devices[i].status !== 'error')) throw new Error('Dừng máy ảo của dự án trước khi xóa.');
    this.store.data.projects=this.store.data.projects.filter(x => x.id!==id);
    for (const s of this.store.data.slots) if (s.projectId===id) s.projectId=null;
    this.changed(); return true;
  }
  assignProject(slot, projectId) {
    this.requireSlot(slot); this.requireStopped(slot);
    if (projectId) this.project(projectId);
    if (projectId && this.store.data.slots.some((s,i) => i!==slot && s.projectId===projectId)) throw new Error('Mỗi dự án chỉ được gán cho một máy ảo.');
    this.store.data.slots[slot].projectId=projectId || null;
    this.changed(); return true;
  }
  assignAvd(slot, avd) {
    this.requireSlot(slot); this.requireStopped(slot);
    if (typeof avd !== 'string' || avd.length > 120 || /[\r\n]/.test(avd)) throw new Error('Tên AVD không hợp lệ.');
    if (avd && this.store.data.slots.some((s,i) => i!==slot && s.avd===avd)) throw new Error('Một AVD không thể chạy đồng thời ở hai máy.');
    this.store.data.slots[slot].avd=avd; this.changed(); return true;
  }
  configure(payload) {
    if (!payload || typeof payload !== 'object') throw new Error('Cấu hình không hợp lệ.');
    const settings = this.store.data.settings;
    for (const flag of ['autoBuild','autoDeploy','screenshots']) if (typeof payload[flag] === 'boolean') settings[flag]=payload[flag];
    if (typeof payload.sdkPath === 'string') {
      const full=path.resolve(payload.sdkPath);
      if (!fs.existsSync(toolsForSdk(full).adb) || !fs.existsSync(toolsForSdk(full).emulator)) throw new Error('SDK không chứa platform-tools/adb và emulator. Kiểm tra đường dẫn.');
      settings.sdkPath=full;
    }
    if (Number.isInteger(payload.screenshotInterval)) settings.screenshotInterval=Math.min(5000,Math.max(1000,payload.screenshotInterval));
    this.changed(); return settings;
  }
  tools() {
    const root=sdkRoot(this.store.data.settings.sdkPath);
    const tools=toolsForSdk(root);
    if (!fs.existsSync(tools.adb) || !fs.existsSync(tools.emulator)) throw new Error('Không tìm thấy Android SDK/ADB/Emulator. Cài Android SDK và chọn đường dẫn trong Cài đặt.');
    return tools;
  }
  async checkAdb() {
    const result=await exec(this.tools().adb, ['devices','-l'], {timeout:12000});
    return result.stdout;
  }
  async listAvds() {
    const result=await exec(this.tools().emulator, ['-list-avds'], {timeout:12000});
    return result.stdout.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  }
  async openVSCode(id) {
    const project=this.project(id);
    if (!fs.existsSync(project.path)) throw new Error('Thư mục dự án đã bị di chuyển.');
    // Open the user's existing VS Code installation, do not modify source files.
    const candidate=process.platform==='win32'?'code.cmd':'code';
    const command=process.platform==='win32'?'cmd.exe':candidate;
    const args=process.platform==='win32'? ['/d','/s','/c','code',project.path] : [project.path];
    const child=spawn(command,args,{detached:true,windowsHide:true,stdio:'ignore'});
    child.on('error', err => this.log('Không thể mở VS Code: '+err.message,'error'));
    child.unref(); return true;
  }
  async adb(slot,args,timeout=30000) {
    return exec(this.tools().adb,['-s',this.devices[slot].serial,...args],{timeout});
  }
  async startSlot(slot) {
    this.requireSlot(slot); this.requireStopped(slot);
    const assigned=this.store.data.slots[slot];
    if (!assigned.projectId || !assigned.avd) throw new Error('Chọn dự án và AVD trước khi khởi chạy.');
    const project=this.project(assigned.projectId);
    detectProject(project.path);
    const avds=await this.listAvds();
    if (!avds.includes(assigned.avd)) throw new Error('AVD không tồn tại trong Android SDK: '+assigned.avd);
    const worker=this.workers[slot], serial=this.devices[slot].serial;
    if (this.devices.some((d,i)=>i!==slot && d.status!=='off' && this.store.data.slots[i].avd===assigned.avd)) throw new Error('AVD đang được sử dụng.');
    const list=await exec(this.tools().adb,['devices'],{timeout:10000});
    if (list.stdout.includes(serial+'\t')) throw new Error(`Cổng ${serial} đang bận. Hãy đóng emulator bên ngoài Baodroid.`);
    const generation=++worker.generation;
    this.update(slot,{status:'booting',build:'idle',message:'Đang khởi động AVD...',lastSync:null});
    this.log(`Khởi động ${assigned.avd} cho ${project.name} (${serial}).`,'info',slot);
    try {
      worker.emulator=launch(this.tools().emulator,['-avd',assigned.avd,'-port',String(5554+slot*2),'-no-window','-no-audio','-no-boot-anim','-netdelay','none','-netspeed','full'],{
        onLine:line => {if (/ERROR|PANIC|failed/i.test(line)) this.log(line,'error',slot);}
      });
      worker.emulator.on('error', err=>{if (worker.generation===generation) this.fail(slot,err);});
      worker.emulator.on('close', code=>{if (worker.generation===generation && ['booting','running'].includes(this.devices[slot].status)) this.fail(slot,new Error(`Emulator đã dừng (${code}).`));});
      void this.boot(slot,generation,project).catch(error=>{if (worker.generation===generation) this.fail(slot,error);});
    } catch(error) {this.fail(slot,error); throw error;}
    return {status:'booting',serial};
  }
  async boot(slot,generation,project) {
    let ready=false;
    for (let i=0;i<90;i++) {
      if (this.workers[slot].generation!==generation) return;
      try {const v=await this.adb(slot,['shell','getprop','sys.boot_completed'],4000); if (v.stdout.trim()==='1') {ready=true;break;}} catch {/* still booting */}
      await sleep(2000);
    }
    if (!ready) throw new Error('Hết thời gian chờ Android khởi động (180 giây). Kiểm tra tăng tốc phần cứng/AVD.');
    if (this.workers[slot].generation!==generation) return;
    this.update(slot,{status:'running',message:'Android đã sẵn sàng'});
    this.log('AVD đã khởi động. Bắt đầu đồng bộ ứng dụng.','success',slot);
    this.watch(slot,project);
    this.captureLoop(slot,generation);
    if (project.kind==='flutter') this.startFlutter(slot,project,generation);
    else this.queueBuild(slot,true);
  }
  watch(slot, project) {
    const worker=this.workers[slot];
    const ignored=(p)=> /(^|[\\/])(\.git|\.gradle|\.dart_tool|\.idea|node_modules|build|\.next|\.vscode)([\\/]|$)/i.test(p);
    worker.watcher=chokidar.watch(project.path,{ignoreInitial:true,ignored,awaitWriteFinish:{stabilityThreshold:140,pollInterval:50},depth:12});
    worker.watcher.on('all',(event,file)=>{
      if (!['add','change','unlink'].includes(event) || this.devices[slot].status!=='running') return;
      clearTimeout(worker.debounce);
      worker.debounce=setTimeout(()=>{
        if (!this.store.data.settings.autoBuild) return;
        this.log(`Thay đổi: ${path.relative(project.path,file)} → đồng bộ`, 'info',slot);
        if (project.kind==='flutter' && worker.runner && !worker.runner.killed && /\.(dart|yaml|json|png|jpg|jpeg|webp|svg)$/i.test(file)) {
          if (worker.runner.stdin?.writable) worker.runner.stdin.write('r');
        } else if (project.kind==='gradle') this.queueBuild(slot,false);
        else this.restartFlutter(slot,project);
      },220);
    });
    worker.watcher.on('error', e=>this.log('File watcher: '+e.message,'error',slot));
  }
  startFlutter(slot,project,generation) {
    const worker=this.workers[slot];
    this.update(slot,{build:'building',message:'Flutter đang khởi chạy ứng dụng...'});
    const child=launch(process.platform==='win32'?'flutter.bat':'flutter',['run','-d',this.devices[slot].serial,'--device-timeout','60'],{
      cwd:project.path,shell:process.platform==='win32',onLine:line=>{
        if (worker.generation!==generation) return;
        if (/Flutter run key commands|Syncing files|Reloaded|Restarted|To hot reload/i.test(line)) {
          worker.flutterReady=true;
          this.update(slot,{build:'success',lastSync:new Date().toISOString(),message:'Flutter đang chạy / hot reload'});
        }
        if (/Error|Exception|FAILURE/i.test(line)) this.log(line,'error',slot);
        else if (/Reloaded|Restarted|Launching|Installing|Syncing/i.test(line)) this.log(line,'success',slot);
      }
    });
    worker.runner=child;
    child.on('error',e=>{if (worker.generation===generation) this.failBuild(slot,e);});
    child.on('close',code=>{
      if (worker.runner===child) worker.runner=null;
      if (worker.generation===generation && this.devices[slot].status==='running') this.failBuild(slot,new Error(`Flutter đã kết thúc (code ${code}). Bấm Làm mới để chạy lại.`));
    });
  }
  restartFlutter(slot,project) {
    const worker=this.workers[slot];
    if (worker.runner?.stdin?.writable) worker.runner.stdin.write('R');
    else this.startFlutter(slot,project,worker.generation);
  }
  queueBuild(slot,manualDeploy=false) {
    const worker=this.workers[slot];
    worker.dirty=true;
    if (manualDeploy) worker.manuallyDeploy=true;
    if (!worker.busy) void this.buildLoop(slot,worker.generation);
  }
  async buildLoop(slot,generation) {
    const worker=this.workers[slot];
    worker.busy=true;
    try {
      while(worker.dirty && worker.generation===generation && this.devices[slot].status==='running') {
        worker.dirty=false;
        const mustDeploy=worker.manuallyDeploy || this.store.data.settings.autoDeploy;
        worker.manuallyDeploy=false;
        const project=this.project(this.store.data.slots[slot].projectId);
        try {await this.buildNative(slot,project,generation,mustDeploy);}
        catch(e) {this.failBuild(slot,e);}
      }
    } finally {worker.busy=false;}
  }
  async buildNative(slot,project,generation,mustDeploy) {
    const base=gradleRoot(project.path,project.kind);
    const gradle=gradleCommand(base);
    this.update(slot,{build:'building',message:'Gradle incremental build...'});
    const started=Date.now();
    const build=await new Promise((resolve,reject)=>{
      const child=launch(gradle.cmd,[':app:assembleDebug','--build-cache','--max-workers=2','--console=plain'],{
        cwd:base,shell:gradle.shell,onLine:line=>{
          if (/FAILED|ERROR|error:/i.test(line)) this.log(line,'error',slot);
          else if (/BUILD SUCCESSFUL|BUILD FAILED/i.test(line)) this.log(line,'info',slot);
        }
      });
      this.workers[slot].runner=child;
      child.on('error',reject);
      child.on('close',code=>code===0?resolve():reject(new Error(`Gradle build lỗi (exit ${code}). Xem Log hoặc chạy Gradle trong VS Code.`)));
    });
    if (generation!==this.workers[slot].generation) return;
    const apk=findDebugApk(base);
    if (!apk) throw new Error('Không tìm thấy APK debug trong app/build/outputs/apk/debug.');
    if (mustDeploy) {
      this.update(slot,{build:'deploying',message:'Đang cài đặt APK qua ADB...'});
      await this.adb(slot,['install','-r','-t',apk],120000);
      let appId=readApplicationId(project.path,project.kind);
      if (!appId) {
        const dir=path.join(this.store.data.settings.sdkPath,'build-tools');
        if (fs.existsSync(dir)) {
          const versions=fs.readdirSync(dir).sort((a,b)=>b.localeCompare(a,undefined,{numeric:true}));
          for (const version of versions) {
            const aapt=path.join(dir,version,process.platform==='win32'?'aapt.exe':'aapt');
            if (!fs.existsSync(aapt)) continue;
            try {const output=await exec(aapt,['dump','badging',apk],{timeout:15000}); appId=output.stdout.match(/package: name='([^']+)'/)?.[1]; if(appId)break;} catch{/* fallback */}
          }
        }
      }
      if (appId) await this.adb(slot,['shell','monkey','-p',appId,'-c','android.intent.category.LAUNCHER','1'],12000);
      else this.log('APK đã được cài đặt, nhưng chưa xác định được applicationId để tự mở.', 'warn',slot);
    }
    const time=((Date.now()-started)/1000).toFixed(1);
    this.update(slot,{build:'success',lastSync:new Date().toISOString(),message:`Đồng bộ hoàn tất (${time}s)`});
    this.log(`Build ${time}s${mustDeploy?' + deploy ADB':''} thành công.`, 'success',slot);
    void build;
  }
  failBuild(slot,error) { this.update(slot,{build:'error',message:error.message}); this.log(error.message,'error',slot); }
  fail(slot,error) {
    this.log(error.message,'error',slot);
    this.update(slot,{status:'error',build:'error',message:error.message});
    this.clearWorker(slot);
  }
  async reloadSlot(slot) {
    this.requireSlot(slot);
    if (this.devices[slot].status!=='running') throw new Error('Máy ảo chưa chạy.');
    const project=this.project(this.store.data.slots[slot].projectId);
    if (project.kind==='flutter') this.restartFlutter(slot,project);
    else this.queueBuild(slot,true);
    return true;
  }
  async tap(slot,x,y) {
    this.requireSlot(slot);
    if (this.devices[slot].status!=='running') return false;
    const d=this.devices[slot];
    if (![x,y].every(Number.isFinite) || x<0 || y<0 || x>=d.screenWidth || y>=d.screenHeight) return false;
    await this.adb(slot,['shell','input','tap',String(Math.round(x)),String(Math.round(y))],8000);return true;
  }
  async swipe(slot,x1,y1,x2,y2,ms=250) {
    this.requireSlot(slot); const d=this.devices[slot];
    if(d.status!=='running'||![x1,y1,x2,y2].every(Number.isFinite))return false;
    const point=(x,max)=>String(Math.min(max-1,Math.max(0,Math.round(x))));
    await this.adb(slot,['shell','input','swipe',point(x1,d.screenWidth),point(y1,d.screenHeight),point(x2,d.screenWidth),point(y2,d.screenHeight),String(Math.max(80,Math.min(1400,ms)))],8000);
    return true;
  }
  captureLoop(slot,generation) {
    const worker=this.workers[slot];
    const run=async()=>{
      if (worker.generation!==generation || this.devices[slot].status!=='running') return;
      if (this.store.data.settings.screenshots) await this.capture(slot).catch(()=>{});
      if (worker.generation===generation && this.devices[slot].status==='running') worker.timer=setTimeout(run,this.store.data.settings.screenshotInterval);
    };
    void run();
  }
  capture(slot) {
    return new Promise((resolve,reject)=>{
      const child=spawn(this.tools().adb,['-s',this.devices[slot].serial,'exec-out','screencap','-p'],{windowsHide:true,stdio:['ignore','pipe','ignore']});
      let chunks=[],bytes=0,done=false;
      const timer=setTimeout(()=>{child.kill();finish(new Error('Ảnh xem trước timeout'));},10000);
      const finish=(err)=>{if(done)return;done=true;clearTimeout(timer);if(err)reject(err);else resolve();};
      child.stdout.on('data',b=>{bytes+=b.length;if(bytes>6*1024*1024){child.kill();finish(new Error('Ảnh quá lớn'));}else chunks.push(b);});
      child.on('error',finish);
      child.on('close',code=>{
        if(code!==0)return finish(new Error('Không chụp được màn hình'));
        const png=Buffer.concat(chunks);
        if(png.length<24 || png.subarray(1,4).toString()!=='PNG')return finish(new Error('Ảnh Android không hợp lệ'));
        const w=png.readUInt32BE(16),h=png.readUInt32BE(20);
        if(!w||!h)return finish(new Error('Sai kích thước ảnh'));
        this.devices[slot].screenWidth=w;this.devices[slot].screenHeight=h;
        this.emit('preview',{slot,image:'data:image/png;base64,'+png.toString('base64'),width:w,height:h});
        finish(null);
      });
    });
  }
  clearWorker(slot) {
    const worker=this.workers[slot]; worker.generation++;
    clearTimeout(worker.timer); clearTimeout(worker.debounce);
    if(worker.watcher){void worker.watcher.close();worker.watcher=null;}
    if(worker.runner){stopProcess(worker.runner);worker.runner=null;}
    if(worker.emulator){stopProcess(worker.emulator);worker.emulator=null;}
    worker.dirty=false;worker.busy=false;worker.flutterReady=false;
  }
  async stopSlot(slot) {
    this.requireSlot(slot);
    const previous=this.devices[slot].status;
    this.clearWorker(slot);
    this.update(slot,{status:'off',build:'idle',message:'Đã dừng',lastSync:null,screenHeight:undefined,screenWidth:undefined});
    if(previous!=='off') {
      try {await this.adb(slot,['emu','kill'],3500);}catch{/* Emulator already stopped */}
      this.log('Đã dừng emulator.','info',slot);
    }
    return true;
  }
  dispose() {
    if(this.closed)return;
    this.closed=true;
    for(let i=0;i<3;i++) {
      if(this.devices[i].status==='running'||this.devices[i].status==='booting') {
        // Exit asynchronously without blocking Electron shutdown.
        const adb=toolsForSdk(sdkRoot(this.store.data.settings.sdkPath)).adb;
        try {const proc=spawn(adb,['-s',this.devices[i].serial,'emu','kill'],{windowsHide:true,detached:true,stdio:'ignore'});proc.on('error',()=>{});proc.unref();}catch{/* skip */}
      }
      this.clearWorker(i);
    }
  }
}
module.exports={Engine};
