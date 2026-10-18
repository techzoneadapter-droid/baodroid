'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const chokidar = require('chokidar');
const {spawn} = require('node:child_process');
const {detectProject, readApplicationId, gradleRoot, findDebugApk} = require('../shared/project');
const {sdkRoot, toolsForSdk, exec, launch, stopProcess, gradleCommand, findNodeScriptCommand} = require('./process');
const {apkDetails,packageInstalled,launchSucceeded,launcherComponent}=require('./apk-launch');
const {ensureGradleWrapper}=require('./gradle-repair');
const {findVSCode, openVSCodeFolder} = require('./vscode');
const {watchTargets,shouldSyncChange} = require('./watch-rules');
const {BOOT_TIMEOUT_MS,gpuForAttempt,emulatorLaunchArgs,accelerationMessage,bootReport}=require('./boot-policy');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const isSlot = i => Number.isInteger(i) && i >= 0 && i <= 2;
function chooseFreeAvd(names,slots,index) {
  const used = new Set(slots.filter((_,i)=>i!==index).map(s=>s.avd).filter(Boolean));
  return names.find(name=>!used.has(name)) || '';
}
function parseRunningAvdName(output) {
  return String(output||'').split(/\r?\n/).map(s=>s.trim()).find(s=>s && s!=='OK') || '';
}
function parseAdbEmulators(output) {
  return String(output||'').split(/\r?\n/)
    .map(line => line.trim().match(/^(emulator-(\d+))\s+(device|offline|unauthorized)\b/))
    .filter(Boolean).map(m=>({serial:m[1],port:Number(m[2]),state:m[3]}));
}
function chooseEmulatorPort(occupied,preferred,used=[]) {
  const taken=new Set([...occupied,...used].map(x=>Number(x)));
  if(preferred%2===0&&preferred>=5554&&preferred<=5584&&!taken.has(preferred))return preferred;
  for(let port=5554;port<=5584;port+=2)if(!taken.has(port))return port;
  throw new Error('Không còn cổng emulator trống từ 5554 đến 5584.');
}

class Engine {
  constructor(store, emit) {
    this.store = store; this.emit = emit;
    this.devices = Array.from({length:3}, (_,i) => ({slot:i,status:'off',serial:`emulator-${5554 + i*2}`,preview:null,build:'idle',message:'Chưa khởi chạy',lastSync:null}));
    this.workers = Array.from({length:3}, () => ({emulator:null,attached:false,runner:null,metro:null,metroLastStart:0,watcher:null,timer:null,debounce:null,monitorTimer:null,recoveryTimer:null,recoveryAttempts:0,gpuAttempt:0,lastEmulatorLines:[],autoLaunching:false,adbFailures:0,previewFailures:0,bootedAt:0,generation:0,busy:false,dirty:false,manuallyDeploy:false,flutterReady:false}));
    this.logPath=store.file?path.join(path.dirname(store.file),'baodroid-runtime.log'):null;
    this.logs=[]; this.closed=false; this.webPreview=null;
    if(this.logPath)try{
      const old=fs.readFileSync(this.logPath,'utf8').split(/\r?\n/).slice(-120);
      this.logs=old.map(line=>{try{return JSON.parse(line)}catch{return null}}).filter(Boolean);
    }catch{/* no logs from previous run */}
  }
  log(message, level='info', slot=null) {
    const record = {time:new Date().toLocaleTimeString('vi-VN', {hour12:false}), message:String(message).slice(0,900), level, slot};
    this.logs.push(record); if (this.logs.length>350) this.logs.shift();
    if(this.logPath)try{
      fs.mkdirSync(path.dirname(this.logPath),{recursive:true});
      if(fs.existsSync(this.logPath)&&fs.statSync(this.logPath).size>2*1024*1024)
        fs.writeFileSync(this.logPath,this.logs.slice(-180).map(r=>JSON.stringify(r)).join('\n')+'\n','utf8');
      fs.appendFileSync(this.logPath,JSON.stringify(record)+'\n','utf8');
    }catch{/* never block Android because of logging */}
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
  projectForSlot(slot) {
    this.requireSlot(slot);
    const assigned=this.store.data.slots[slot];
    if (!assigned?.projectId) throw new Error('Chưa chọn dự án cho máy Android.');
    const source=this.project(assigned.projectId);
    const kind=assigned.nativeMode && source.kind==='web' ? 'capacitor' :
      assigned.nativeMode && source.kind==='expo-web' ? 'react-native' : source.kind;
    return {...source,kind};
  }
  addProject(folder, preferredSlot=null) {
    if (this.store.data.projects.length >= 3) throw new Error('Giới hạn tối đa 3 dự án.');
    const normalized = path.resolve(folder);
    if (this.store.data.projects.some(p => p.path.toLowerCase() === normalized.toLowerCase())) throw new Error('Dự án đã được thêm.');
    const kind = detectProject(normalized);
    const project = {id:crypto.randomUUID(),name:path.basename(normalized),path:normalized,kind};
    this.store.data.projects.push(project);
    const i = isSlot(preferredSlot) ? preferredSlot : this.store.data.slots.findIndex(x => !x.projectId);
    if (i !== -1 && !this.store.data.slots[i].projectId) this.store.data.slots[i].projectId=project.id;
    this.changed();
    this.log(`Đã gán ${project.name} vào máy ${i+1}. Tự kết nối qua thư mục local.`);
    if (i!==-1) void this.autoStartSlot(i);
    return project;
  }
  removeProject(id) {
    this.project(id);
    if (this.store.data.slots.some((s,i) => s.projectId===id && this.devices[i].status !== 'off' && this.devices[i].status !== 'error')) throw new Error('Dừng máy ảo của dự án trước khi xóa.');
    for(let i=0;i<3;i++)if(this.store.data.slots[i].projectId===id && this.webPreview?.isWebSlot(i))this.webPreview.stop(i);
    this.store.data.projects=this.store.data.projects.filter(x => x.id!==id);
    for (const s of this.store.data.slots) if (s.projectId===id) {s.projectId=null;s.avd='';s.nativeMode=false;}
    this.changed(); return true;
  }
  async assignProject(slot, projectId) {
    this.requireSlot(slot);
    if (projectId) this.project(projectId);
    if (projectId && this.store.data.slots.some((s,i) => i!==slot && s.projectId===projectId)) throw new Error('Mỗi dự án chỉ được gán cho một máy ảo.');
    if (this.devices[slot].status!=='off') await this.stopSlot(slot);
    const assigned=this.store.data.slots[slot];
    if(assigned.projectId!==projectId){
      assigned.nativeMode=false;assigned.avd='';
    }
    assigned.projectId=projectId || null;
    this.changed();
    if (projectId) void this.autoStartSlot(slot);
    return true;
  }
  async assignAvd(slot, avd) {
    this.requireSlot(slot);
    if (typeof avd !== 'string' || avd.length > 120 || /[\r\n]/.test(avd)) throw new Error('Tên AVD không hợp lệ.');
    if (avd && this.store.data.slots.some((s,i) => i!==slot && s.avd===avd)) throw new Error('Một AVD không thể chạy đồng thời ở hai máy.');
    if (this.devices[slot].status!=='off') await this.stopSlot(slot);
    this.store.data.slots[slot].avd=avd;
    this.changed();
    if (this.store.data.slots[slot].projectId) void this.autoStartSlot(slot);
    return true;
  }
  async autoStartSlot(slot) {
    this.requireSlot(slot);
    const worker=this.workers[slot];
    if (worker.autoLaunching || !['off','error'].includes(this.devices[slot].status)) return false;
    if (!this.store.data.slots[slot].projectId || this.closed) return false;
    worker.autoLaunching=true;
    try {
      const assigned=this.store.data.slots[slot];
      const project=this.project(assigned.projectId);
      if((project.kind==='web'||project.kind==='expo-web') && !assigned.nativeMode && this.webPreview) {
        return this.webPreview.start(slot);
      }
      if (!assigned.avd) {
        const avds=await this.listAvds();
        const available=chooseFreeAvd(avds,this.store.data.slots,slot);
        if (!available) {
          this.update(slot,{status:'off',message:'Chưa có AVD còn trống. Tạo AVD trong Android Studio → Device Manager.'});
          this.log('Không có AVD khả dụng. Tạo AVD trong Android Studio để tự chạy.','warn',slot);
          return false;
        }
        assigned.avd=available;
        this.changed();
        this.log(`Tự chọn AVD ${available} cho máy ${slot+1}.`,'success',slot);
      }
      await this.startSlot(slot);
      return true;
    } catch(error) {
      this.update(slot,{status:'off',message:'Chưa thể tự chạy: '+error.message});
      this.log('Tự kết nối: '+error.message,'warn',slot);
      return false;
    } finally { worker.autoLaunching=false; }
  }
  async resumeAssignedSlots() {
    if(this.closed)return;
    // Serialize launches so two slots never race for the same spare emulator port.
    for(let i=0;i<3;i++){
      if(this.closed)return;
      try{await this.autoStartSlot(i);}catch(error){this.log('Tự mở máy '+(i+1)+': '+error.message,'error',i);}
    }
  }
  async recoverAndOpen(slot) {
    this.requireSlot(slot);
    const assigned=this.store.data.slots[slot];
    if(!assigned.projectId)throw new Error('Hãy chọn dự án trước khi sửa kết nối.');
    const project=this.project(assigned.projectId);
    if((project.kind==='web'||project.kind==='expo-web')&&!assigned.nativeMode){
      if(this.devices[slot].status==='running')return {state:'already-running',mode:'web'};
      this.webPreview?.stop(slot);
      this.update(slot,{status:'off',build:'idle',message:'Đang khởi động lại Web Preview…'});
      this.webPreview?.start(slot);
      return {state:'starting',mode:'web'};
    }
    const worker=this.workers[slot];
    if(this.devices[slot].status==='running'){
      if(worker.busy){
        this.log('APK đang được build. Vui lòng chờ bước hiện tại hoàn thành.','info',slot);
        return {state:'building'};
      }
      this.log('Đang build/cài lại APK lên Android đang chạy.','info',slot);
      await this.reloadSlot(slot);
      return {state:'building'};
    }
    if(this.devices[slot].status==='booting'){
      this.log('Máy Android đang khởi động. Sẽ tự build và cài APK khi boot xong.','info',slot);
      return {state:'booting'};
    }
    worker.recoveryAttempts=0;
    worker.gpuAttempt=0;
    this.clearWorker(slot);
    this.update(slot,{status:'off',build:'idle',message:'Đang tự tìm máy ảo và mở ứng dụng…'});
    const success=await this.autoStartSlot(slot);
    if(!success)throw new Error(this.devices[slot].message||'Chưa khởi động được Android.');
    return {state:'booting'};
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
    this.changed();
    if(typeof payload.sdkPath==='string') void this.resumeAssignedSlots();
    return settings;
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
    await openVSCodeFolder(project.path);
    this.log(`Đã mở ${project.name} trong VS Code.`, 'success');
    return true;
  }
  async diagnostics() {
    const report={sdkPath:this.store.data.settings.sdkPath,adb:'',avds:[],vscodePath:findVSCode(),flutter:'Chưa kiểm tra',issues:[]};
    try {report.adb=(await this.checkAdb()).trim();}catch(e){report.issues.push('ADB: '+e.message);}
    try {report.avds=await this.listAvds();if(!report.avds.length)report.issues.push('Chưa có AVD. Tạo máy ảo trong Android Studio Device Manager.');}catch(e){report.issues.push('AVD: '+e.message);}
    if(!report.vscodePath) report.issues.push('Không tìm thấy VS Code ở vị trí cài đặt tiêu chuẩn.');
    try { const cmd=process.platform==='win32'?'where.exe':'which'; report.flutter=(await exec(cmd,['flutter'],{timeout:6000})).stdout.trim(); }
    catch {report.flutter='Không tìm thấy Flutter trong PATH (chỉ cần nếu dùng Flutter).';}
    return report;
  }
  async deviceAction(slot,action) {
    this.requireSlot(slot);
    if(this.devices[slot].status!=='running') throw new Error('Chỉ thao tác được trên máy ảo đang chạy.');
    switch(action){
      case 'home':await this.adb(slot,['shell','input','keyevent','KEYCODE_HOME'],8000);return true;
      case 'back':await this.adb(slot,['shell','input','keyevent','KEYCODE_BACK'],8000);return true;
      case 'rotate':{
        const rotation=this.devices[slot].rotation===1?0:1;
        await this.adb(slot,['shell','settings','put','system','accelerometer_rotation','0'],8000);
        await this.adb(slot,['shell','settings','put','system','user_rotation',String(rotation)],8000);
        this.update(slot,{rotation});return true;
      }
      case 'screenshot':return await this.capture(slot);
      default:throw new Error('Tác vụ thiết bị không hợp lệ.');
    }
  }
  async adb(slot,args,timeout=30000) {
    return exec(this.tools().adb,['-s',this.devices[slot].serial,...args],{timeout});
  }
  async startSlot(slot) {
    this.requireSlot(slot); this.requireStopped(slot);
    const assigned=this.store.data.slots[slot];
    if (!assigned.projectId || !assigned.avd) throw new Error('Chọn dự án và AVD trước khi khởi chạy.');
    const project=this.projectForSlot(slot);
    detectProject(project.path);
    const avds=await this.listAvds();
    if (!avds.includes(assigned.avd)) throw new Error('AVD không tồn tại trong Android SDK: '+assigned.avd);
    const worker=this.workers[slot], serial=this.devices[slot].serial;
    if (this.devices.some((d,i)=>i!==slot && d.status!=='off' && this.store.data.slots[i].avd===assigned.avd)) throw new Error('AVD đang được sử dụng.');
    const list=await exec(this.tools().adb,['devices','-l'],{timeout:10000});
    const observed=parseAdbEmulators(list.stdout);
    const usedByOtherSlots=this.devices.filter((_,i)=>i!==slot)
      .map(d=>d.serial).filter(Boolean);
    // Look for the matching AVD on ANY port: a Windows repair tool can boot
    // it before Baodroid and Android Studio does not promise a fixed ADB port.
    let attachedSerial=null;
    for(const entry of observed.filter(e=>e.state==='device')) {
      let name='';
      try {
        const response=await exec(this.tools().adb,['-s',entry.serial,'emu','avd','name'],{timeout:6500});
        name=parseRunningAvdName(response.stdout);
      }catch(error){
        this.log('Chưa đọc được AVD tại '+entry.serial+': '+error.message,'warn',slot);
        continue;
      }
      if(name===assigned.avd){
        if(usedByOtherSlots.includes(entry.serial) &&
           this.devices.some((d,i)=>i!==slot&&d.serial===entry.serial&&d.status!=='off'&&d.status!=='error'))
          throw new Error('AVD đang được máy preview khác sử dụng: '+entry.serial);
        attachedSerial=entry.serial;break;
      }
    }
    let port=null;
    if(!attachedSerial) {
      const activeSlots=this.devices.filter((_,i)=>i!==slot)
        .filter(d=>d.status==='running'||d.status==='booting')
        .map(d=>Number(d.serial?.replace('emulator-','')));
      port=chooseEmulatorPort(observed.map(x=>x.port),5554+slot*2,activeSlots);
    }
    if(!attachedSerial && process.platform==='win32'){
      const check=await exec(this.tools().emulator,['-accel-check'],{timeout:12000,ignoreFailure:true});
      const issue=accelerationMessage(check.code,check.stdout,check.stderr);
      if(issue){this.log(issue,'error',slot);throw new Error(issue);}
    }
    const runningSerial=attachedSerial||'emulator-'+port;
    this.devices[slot].serial=runningSerial;
    const generation=++worker.generation;
    worker.attached=Boolean(attachedSerial);
    worker.lastEmulatorLines=[];
    this.update(slot,{status:'booting',previewMode:'android',webUrl:null,build:'idle',
      message:attachedSerial?'Đã tìm thấy Android đang chạy. Đang chuẩn bị cài ứng dụng…':'Đang khởi động Android Emulator thật…',
      lastSync:null});
    this.log(attachedSerial
      ?'Tự kết nối AVD '+assigned.avd+' tại '+runningSerial+'; sẽ cài/mở ứng dụng.'
      :'Khởi động '+assigned.avd+' cho '+project.name+' tại '+runningSerial+'.','info',slot);
    try {
      if(attachedSerial) {
        worker.emulator=null;
        void this.boot(slot,generation,project).catch(error=>{if(worker.generation===generation)this.fail(slot,error);});
        return {status:'booting',serial:runningSerial,attached:true};
      }
      const gpu=gpuForAttempt(worker.gpuAttempt);
      this.log('Khởi động AVD: GPU '+gpu+', Vulkan tắt, '+(worker.gpuAttempt===0?'chạy nền':'cửa sổ dự phòng')+'.','info',slot);
      worker.emulator=launch(this.tools().emulator,emulatorLaunchArgs({avd:assigned.avd,port,attempt:worker.gpuAttempt}),{
        onLine:line=>{
          worker.lastEmulatorLines.push(String(line).slice(-350));
          if(worker.lastEmulatorLines.length>16)worker.lastEmulatorLines.shift();
          if (/\bERROR\b|\bPANIC\b|failed|crash|Cannot|fatal/i.test(line))
            this.log('Emulator: '+line,'error',slot);
        }
      });
      worker.emulator.on('error', err=>{if (worker.generation===generation) this.fail(slot,err);});
      worker.emulator.on('close', code=>{
        if(worker.generation!==generation||!['booting','running'].includes(this.devices[slot].status))return;
        const recent=worker.lastEmulatorLines.filter(x=>/\bERROR\b|\bPANIC\b|failed|crash|Cannot|fatal/i.test(x)).slice(-2);
        const diagnosis=(code===3221225477||code===-1073741819)?' Windows 0xC0000005: emulator crash (có thể do driver GPU/Vulkan).':'';
        this.fail(slot,new Error('Android Emulator đã thoát (mã '+code+').'+diagnosis+' '+(recent.join(' | ')||worker.lastEmulatorLines.slice(-2).join(' | '))));
      });
      void this.boot(slot,generation,project).catch(error=>{if (worker.generation===generation) this.fail(slot,error);});
    } catch(error) {this.fail(slot,error); throw error;}
    return {status:'booting',serial};
  }
  async boot(slot,generation,project) {
    const started=Date.now();
    let ready=false,adbState='offline',lastError='',lastProgress=0;
    while(Date.now()-started<BOOT_TIMEOUT_MS) {
      if(this.closed||this.workers[slot].generation!==generation)return;
      try{
        const v=await this.adb(slot,['shell','getprop','sys.boot_completed'],3500);
        adbState=v.stdout.trim()==='1'?'booted':'connected';
        if(adbState==='booted'){ready=true;break;}
      }catch(error){lastError=error.message;adbState='not ready';}
      const elapsed=Date.now()-started;
      if(elapsed-lastProgress>16000){
        lastProgress=elapsed;
        this.update(slot,{message:'Android đang khởi động: '+Math.round(elapsed/1000)+'s / '+Math.round(BOOT_TIMEOUT_MS/1000)+'s. ADB: '+adbState});
        this.log('Khởi động AVD: '+Math.round(elapsed/1000)+'s, ADB='+adbState,'info',slot);
      }
      await sleep(1750);
    }
    if(!ready)throw new Error(bootReport({waitedMs:Date.now()-started,adbState,lastError}));
    if (this.workers[slot].generation!==generation) return;
    this.workers[slot].bootedAt=Date.now();
    this.workers[slot].recoveryAttempts=0;
    this.workers[slot].gpuAttempt=0;
    this.workers[slot].adbFailures=0;
    this.workers[slot].previewFailures=0;
    this.update(slot,{status:'running',message:'Android đã sẵn sàng, ứng dụng đang tự đồng bộ'});
    this.log('AVD đã khởi động. Bắt đầu đồng bộ ứng dụng.','success',slot);
    this.watch(slot,project);
    this.monitorDevice(slot,generation);
    this.captureLoop(slot,generation);
    if (project.kind==='flutter') this.startFlutter(slot,project,generation);
    else {
      if (project.kind==='react-native') this.startMetro(slot,project,generation);
      this.queueBuild(slot,true);
    }
  }
  monitorDevice(slot,generation) {
    const worker=this.workers[slot];
    const check=async()=>{
      if(this.closed || worker.generation!==generation || this.devices[slot].status!=='running')return;
      try {
        const state=await this.adb(slot,['get-state'],6500);
        if(state.stdout.trim()!=='device') throw new Error('Thiết bị chưa online.');
        if(worker.adbFailures>0) {
          this.log('ADB đã tự kết nối lại.','success',slot);
          const projectId=this.store.data.slots[slot].projectId;
          if(projectId && this.project(projectId).kind==='react-native')await this.configureMetroDevice(slot);
        }
        worker.adbFailures=0;
        if(Date.now()-worker.bootedAt>60000)worker.recoveryAttempts=0;
      } catch(error) {
        worker.adbFailures++;
        this.log(`ADB tạm gián đoạn (${worker.adbFailures}/3): ${error.message}`,'warn',slot);
        try {await exec(this.tools().adb,['start-server'],{timeout:6500});}catch{/* retry next health check */}
        if(worker.adbFailures>=3) {
          this.fail(slot,new Error('ADB mất kết nối nhiều lần. Đang thử tự khởi động lại emulator.'));
          return;
        }
      }
      if(worker.generation===generation && this.devices[slot].status==='running')
        worker.monitorTimer=setTimeout(check,worker.adbFailures?3500:9000);
    };
    void check();
  }
  watch(slot, project) {
    const worker=this.workers[slot];
    const ignored=(p)=> /(^|[\\/])(\.git|\.gradle|\.dart_tool|\.idea|node_modules|build|dist|\.next|\.expo|\.vscode)([\\/]|$)/i.test(p);
    const targets=watchTargets(project);
    if(!targets.length){
      this.log('Chưa tìm thấy thư mục source để theo dõi. Baodroid vẫn có thể build thủ công.','warn',slot);
      return;
    }
    worker.watcher=chokidar.watch(targets,{ignoreInitial:true,ignored,awaitWriteFinish:{stabilityThreshold:250,pollInterval:80},depth:12});
    worker.watcher.on('all',(event,file)=>{
      if (!['add','change','unlink'].includes(event) || this.devices[slot].status!=='running') return;
      if(!shouldSyncChange(project,file))return;
      clearTimeout(worker.debounce);
      worker.debounce=setTimeout(()=>{
        if (!this.store.data.settings.autoBuild) return;
        this.log(`Thay đổi: ${path.relative(project.path,file)} → đồng bộ`, 'info',slot);
        if (project.kind==='flutter' && worker.runner && !worker.runner.killed && /\.(dart|yaml|json|png|jpg|jpeg|webp|svg)$/i.test(file)) {
          if (worker.runner.stdin?.writable) worker.runner.stdin.write('r');
        } else if (project.kind==='react-native') {
          // Metro watches JS/TS/CSS/assets itself: no full Gradle build on every save.
          const relative=path.relative(project.path,file).replace(/\\/g,'/');
          if(relative.startsWith('android/') || /^(package\.json|package-lock\.json|yarn\.lock|pnpm-lock\.yaml|app\.json)$/.test(relative)){
            this.log('Thay đổi native/cấu hình React Native → build lại APK.','info',slot);
            this.queueBuild(slot,false);
          } else this.log('Metro đang nhận thay đổi → Fast Refresh.','info',slot);
        } else if (project.kind==='gradle'||project.kind==='capacitor') this.queueBuild(slot,false);
        else this.restartFlutter(slot,project);
      },220);
    });
    let lastErrorAt=0;
    worker.watcher.on('error', e=>{
      if(Date.now()-lastErrorAt<30000)return;
      lastErrorAt=Date.now();
      this.log('Theo dõi source bị giới hạn: '+e.message+'. Vẫn có thể build thủ công.','warn',slot);
    });
  }
  startMetro(slot,project,generation) {
    const worker=this.workers[slot];
    const port=8081+slot;
    if(worker.metro && worker.metro.exitCode===null)return;
    if(!fs.existsSync(path.join(project.path,'node_modules'))) {
      const message='Thiếu node_modules. Cài dependencies trong VS Code (npm install/yarn install) để chạy Metro.';
      this.log(message,'error',slot);
      this.update(slot,{build:'error',message});
      return;
    }
    // Each AVD gets an independent reverse tunnel: device:8081 -> PC:8081/8082/8083.
    // No physical USB device or external preview server is needed.
    const command=process.platform==='win32'?'npx.cmd':'npx';
    let isExpo=false;
    try {
      const pkg=JSON.parse(fs.readFileSync(path.join(project.path,'package.json'),'utf8'));
      isExpo=Boolean(pkg.dependencies?.expo || pkg.devDependencies?.expo);
    }catch{/* use React Native CLI as default */}
    const args=isExpo
      ? ['--no-install','expo','start','--dev-client','--localhost','--port',String(port)]
      : ['--no-install','react-native','start','--port',String(port)];
    this.log(`Metro máy ${slot+1} dùng localhost:${port}.`,'info',slot);
    worker.metroLastStart=Date.now();
    const child=launch(command,args,{cwd:project.path,shell:process.platform==='win32',
      onLine:line=>{
        if(worker.generation!==generation)return;
        if(/error|failed|cannot|exception/i.test(line))this.log('Metro: '+line,'error',slot);
        else if(/ready|welcome to metro|fast refresh|bundle|transform/i.test(line))this.log('Metro: '+line,'success',slot);
      }});
    worker.metro=child;
    child.on('error',error=>{
      if(worker.generation!==generation)return;
      this.log('Không mở được Metro: '+error.message+'. Kiểm tra Node.js và npm trên Windows.','error',slot);
      if(worker.metro===child)worker.metro=null;
    });
    child.on('close',code=>{
      if(worker.metro===child)worker.metro=null;
      if(worker.generation!==generation || this.devices[slot].status!=='running')return;
      this.log(`Metro đã thoát (mã ${code}). Fast Refresh bị tạm dừng.`,'warn',slot);
    });
  }
  async configureMetroDevice(slot) {
    const port=8081+slot;
    await this.adb(slot,['reverse','tcp:8081',`tcp:${port}`],12000);
    this.log(`Fast Refresh: Android ảo ${slot+1} → Metro localhost:${port}.`,'success',slot);
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
        const project=this.projectForSlot(slot);
        this.log('Build ứng dụng '+project.name+' (loại '+project.kind+') cho máy '+(slot+1)+'.','info',slot);
        try {await this.buildNative(slot,project,generation,mustDeploy);}
        catch(e) {
          // Generated build files must not start a new cycle after a failure.
          // Wait for an explicit source edit or the user's Retry button.
          worker.dirty=false;
          worker.manuallyDeploy=false;
          this.failBuild(slot,e);
          break;
        }
      }
    } finally {worker.busy=false;}
  }
  async buildNative(slot,project,generation,mustDeploy) {
    const base=gradleRoot(project.path,project.kind);
    if(project.kind==='capacitor') {
      this.update(slot,{build:'building',message:'Đang build Vite + Capacitor vào APK…'});
      const npm=findNodeScriptCommand('npm');
      const npx=findNodeScriptCommand('npx');
      const env={...process.env,ANDROID_SDK_ROOT:this.store.data.settings.sdkPath,
        ANDROID_HOME:this.store.data.settings.sdkPath};
      let lastOutputAt=0;
      const progress=(step)=>(line,channel)=>{
        if(/\b(error|fail|warning)\b|^npm ERR!/i.test(line))this.log(step+': '+line.slice(-350),channel==='stderr'?'error':'warn',slot);
        else if(Date.now()-lastOutputAt>4000){
          lastOutputAt=Date.now();
          this.update(slot,{build:'building',message:step+': '+line.slice(0,130)});
        }
      };
      this.log('Đang build giao diện Vite của '+project.name,'info',slot);
      try {
        await exec(npm.cmd,[...npm.preArgs,'run','build'],{
          cwd:project.path,shell:npm.shell,env,timeout:600000,onLine:progress('Vite')});
      }catch(error){throw new Error('Bước 1/4 (Vite): '+error.message);}
      this.log('Đang đồng bộ Capacitor Android','info',slot);
      try {
        await exec(npx.cmd,[...npx.preArgs,'--no-install','cap','sync','android'],{
          cwd:project.path,shell:npx.shell,env,timeout:300000,onLine:progress('Capacitor')});
      }catch(error){throw new Error('Bước 2/4 (Capacitor): '+error.message);}

    }
    if(project.kind==='capacitor'){
      try{
        await ensureGradleWrapper(base,project.path,project.kind,{
          report:message=>this.log(message,'info',slot)});
      }catch(error){throw new Error('Bước 3/4 (Gradle Wrapper): '+error.message);}
    }
    let gradle;
    try{gradle=gradleCommand(base);}catch(error){throw new Error('Bước 3/4 (Gradle): '+error.message);}
    this.update(slot,{build:'building',message:project.kind==='react-native'?'Đang build React Native Android…':'Gradle incremental build...'});
    const started=Date.now();
    const runGradle=()=>new Promise((resolve,reject)=>{
      const recent=[];
      let lastReported=0,settled=false;
      const args=[':app:assembleDebug','--build-cache','--max-workers=2','--console=plain'];
      if(project.kind==='react-native')args.push('-PreactNativeDevServerPort='+String(8081+slot));
      const child=launch(gradle.cmd,[...gradle.preArgs,...args],{
        cwd:base,shell:gradle.shell,onLine:line=>{
          recent.push(String(line).slice(0,400));
          if(recent.length>45)recent.shift();
          if (/FAILED|ERROR|error:|What went wrong|Execution failed|ClassNotFoundException|GradleWrapperMain/i.test(line))
            this.log(line,'error',slot);
          else if (/BUILD SUCCESSFUL|BUILD FAILED/i.test(line))this.log(line,'info',slot);
          else if (/^> Task |Downloading|BUILDING/i.test(line)&&Date.now()-lastReported>4000){
            lastReported=Date.now();
            this.update(slot,{build:'building',message:'Đang build APK: '+String(line).slice(0,130)});
          }
        }
      });
      this.workers[slot].runner=child;
      const done=(err)=>{
        if(settled)return;settled=true;
        if(this.workers[slot].runner===child)this.workers[slot].runner=null;
        err?reject(err):resolve();
      };
      child.once('error',done);
      child.once('close',code=>{
        if(code===0){done();return;}
        const whole=recent.join('\n');
        const lines=recent.filter(x=>/error|failed|problem|cannot|could not|what went wrong|exception/i.test(x)).slice(-7);
        const summary=(lines.length?lines:recent.slice(-5)).join(' | ').slice(-1000);
        const error=new Error('Bước 3/4 (Gradle mã '+code+'): '+(summary||'Xem Nhật ký kỹ thuật để biết nguyên nhân.'));
        error.wrapperClassMissing=/GradleWrapperMain|ClassNotFoundException:\s*org\.gradle\.wrapper/i.test(whole);
        done(error);
      });
    });
    try{
      await runGradle();
    }catch(error){
      // A valid-looking JAR can still have a corrupt class table. Repair once
      // from the exact Capacitor template, then retry only the Gradle phase.
      if(project.kind!=='capacitor'||!error.wrapperClassMissing)throw error;
      this.log('Gradle WrapperMain không tải được. Đang phục hồi JAR từ template Capacitor và thử lại một lần.','warn',slot);
      try{
        await ensureGradleWrapper(base,project.path,project.kind,{
          force:true,report:message=>this.log(message,'success',slot)});
        gradle=gradleCommand(base);
      }catch(repairError){
        throw new Error('Không thể tự sửa Gradle Wrapper: '+repairError.message);
      }
      await runGradle();
    }
    if (generation!==this.workers[slot].generation) return;
    const apk=findDebugApk(base);
    if (!apk) throw new Error('Không tìm thấy APK debug trong app/build/outputs/apk/debug.');
    if (mustDeploy) {
      this.update(slot,{build:'deploying',message:'Đang cài APK vào Android ảo...'});
      if(project.kind==='react-native')await this.configureMetroDevice(slot);
      let installed;
      try{installed=await this.adb(slot,['install','-r','-t',apk],120000);}
      catch(error){throw new Error('Bước 4/4 (ADB install): '+error.message);}
      if(!/Success/i.test(installed.stdout+installed.stderr))
        throw new Error('Bước 4/4: ADB không xác nhận cài APK: '+(installed.stdout+installed.stderr).slice(-400));
      // Read the actual APK manifest; Gradle source may specify an applicationIdSuffix.
      const sdk=path.dirname(path.dirname(this.tools().adb));
      const versions=fs.existsSync(path.join(sdk,'build-tools'))?
        fs.readdirSync(path.join(sdk,'build-tools')).sort((a,b)=>b.localeCompare(a,undefined,{numeric:true})):[];
      let info={id:'',activity:''};
      for(const version of versions){
        const aapt=path.join(sdk,'build-tools',version,process.platform==='win32'?'aapt.exe':'aapt');
        if(!fs.existsSync(aapt))continue;
        try{
          const result=await exec(aapt,['dump','badging',apk],{timeout:15000});
          info=apkDetails(result.stdout);
          if(info.id)break;
        }catch(error){this.log('Không đọc được APK bằng aapt '+version+': '+error.message,'warn',slot);}
      }
      const appId=info.id||readApplicationId(project.path,project.kind);
      if(!appId)throw new Error('Bước 4/4: Không xác định được applicationId từ APK.');
      if(!info.id)this.log('Chưa đọc được APK manifest bằng aapt. Đang dùng applicationId trong Gradle.','warn',slot);
      const pkg=await this.adb(slot,['shell','pm','list','packages',appId],12000);
      if(!packageInstalled(pkg.stdout,appId))
        throw new Error('Bước 4/4: APK đã cài nhưng Android không tìm thấy gói '+appId+'.');
      this.log('APK đã được cài: '+appId+'. Đang mở Activity chính.','success',slot);
      const component=info.activity?launcherComponent(appId,info.activity):'';
      let result;
      if(component) {
        result=await this.adb(slot,['shell','am','start','-W','-n',component],25000);
        if(!launchSucceeded(result.stdout+result.stderr))
          throw new Error('Bước 4/4: Không thể mở '+component+': '+(result.stdout+result.stderr).slice(-450));
      } else {
        result=await this.adb(slot,['shell','monkey','-p',appId,'-c','android.intent.category.LAUNCHER','1'],20000);
        if(!launchSucceeded(result.stdout+result.stderr))
          throw new Error('Bước 4/4: Android không tìm thấy màn hình khởi động: '+(result.stdout+result.stderr).slice(-450));
      }
      this.log('Đã mở Activity của '+appId+' trên Android.','success',slot);
    }
    const time=((Date.now()-started)/1000).toFixed(1);
    this.update(slot,{build:'success',lastSync:new Date().toISOString(),message:`Đồng bộ hoàn tất (${time}s)`});
    this.log(`Build ${time}s${mustDeploy?' + deploy ADB':''} thành công.`, 'success',slot);
    void build;
  }
  failBuild(slot,error) {
    const message='Build/cài ứng dụng thất bại: '+String(error.message||error);
    this.update(slot,{build:'error',message});
    this.log(message,'error',slot);
  }
  fail(slot,error) {
    const worker=this.workers[slot];
    const message=String(error?.message||error||'Android Emulator lỗi');
    const retryable=/chưa hoàn tất khởi động|đã thoát|mất kết nối/i.test(message);
    const shouldRetry=!this.closed && retryable && !worker.attached && worker.recoveryAttempts<1;
    this.log('Máy '+(slot+1)+': '+message,'error',slot);
    // Cancel any outstanding boot monitor and release the failed emulator process.
    this.clearWorker(slot);
    this.update(slot,{status:'error',build:'error',
      message:shouldRetry?'AVD không khởi động. Tự thử thêm một lần với GPU dự phòng…':message});
    if(!shouldRetry){
      this.log('Đã dừng tự thử. Nếu vẫn lỗi 0xC0000005, mở Nhật ký để xem nguyên nhân rồi bấm Sửa kết nối & mở app khi cần.','warn',slot);
      return;
    }
    worker.recoveryAttempts++;
    worker.gpuAttempt=1;
    this.log('Tự thử lần cuối: cửa sổ Android dự phòng, GPU '+gpuForAttempt(worker.gpuAttempt)+' và tắt Vulkan.','warn',slot);
    worker.recoveryTimer=setTimeout(()=>{
      worker.recoveryTimer=null;
      void this.autoStartSlot(slot);
    },4000);
  }
  async reloadSlot(slot) {
    this.requireSlot(slot);
    if (this.devices[slot].status!=='running') throw new Error('Máy ảo chưa chạy.');
    const project=this.projectForSlot(slot);
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
      if (this.store.data.settings.screenshots) {
        try {await this.capture(slot);worker.previewFailures=0;}
        catch(error) {
          worker.previewFailures++;
          if(worker.previewFailures===3)this.log('Ảnh xem trước bị gián đoạn, đang kiểm tra lại ADB: '+error.message,'warn',slot);
        }
      }
      if (worker.generation===generation && this.devices[slot].status==='running') worker.timer=setTimeout(run,this.store.data.settings.screenshotInterval);
    };
    void run();
  }
  capture(slot) {
    return new Promise((resolve,reject)=>{
      const child=spawn(this.tools().adb,['-s',this.devices[slot].serial,'exec-out','screencap','-p'],{windowsHide:true,stdio:['ignore','pipe','ignore']});
      let chunks=[],bytes=0,done=false;
      const timer=setTimeout(()=>{child.kill();finish(new Error('Ảnh xem trước timeout'));},10000);
      const finish=(err,result)=>{if(done)return;done=true;clearTimeout(timer);if(err)reject(err);else resolve(result);};
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
        finish(null,png);
      });
    });
  }
  clearWorker(slot) {
    const worker=this.workers[slot]; worker.generation++;
    clearTimeout(worker.timer); clearTimeout(worker.debounce);
    clearTimeout(worker.monitorTimer); clearTimeout(worker.recoveryTimer);
    worker.monitorTimer=null;worker.recoveryTimer=null;
    if(worker.watcher){void worker.watcher.close();worker.watcher=null;}
    if(worker.runner){stopProcess(worker.runner);worker.runner=null;}
    if(worker.metro){stopProcess(worker.metro);worker.metro=null;}
    if(worker.emulator){stopProcess(worker.emulator);worker.emulator=null;}
    worker.dirty=false;worker.busy=false;worker.flutterReady=false;worker.adbFailures=0;worker.previewFailures=0;
    worker.attached=false;
  }
  async stopSlot(slot) {
    this.requireSlot(slot);
    if(this.webPreview?.isWebSlot(slot)){
      this.webPreview.stop(slot);
      this.clearWorker(slot);
      this.update(slot,{status:'off',previewMode:null,webUrl:null,build:'idle',message:'Đã dừng Web Preview',lastSync:null});
      return true;
    }
    const previous=this.devices[slot].status;
    const isExternal=this.workers[slot].attached;
    this.clearWorker(slot);
    this.workers[slot].recoveryAttempts=0;
    this.workers[slot].gpuAttempt=0;
    this.update(slot,{status:'off',previewMode:null,webUrl:null,build:'idle',message:'Đã dừng thủ công',lastSync:null,rotation:0,screenHeight:undefined,screenWidth:undefined});
    if(previous!=='off'&&!isExternal) {
      try {await this.adb(slot,['emu','kill'],3500);}catch{/* Emulator already stopped */}
      this.log('Đã dừng emulator do Baodroid khởi chạy.','info',slot);
    } else if(isExternal)this.log('Đã ngắt Baodroid khỏi AVD bên ngoài; emulator vẫn chạy.','info',slot);
    return true;
  }
  dispose() {
    if(this.closed)return;
    this.closed=true;
    if(this.webPreview)this.webPreview.dispose();
    for(let i=0;i<3;i++) {
      if(!this.webPreview?.isWebSlot(i) && !this.workers[i].attached &&
         (this.devices[i].status==='running'||this.devices[i].status==='booting')) {
        // Exit asynchronously without blocking Electron shutdown.
        const adb=toolsForSdk(sdkRoot(this.store.data.settings.sdkPath)).adb;
        try {const proc=spawn(adb,['-s',this.devices[i].serial,'emu','kill'],{windowsHide:true,detached:true,stdio:'ignore'});proc.on('error',()=>{});proc.unref();}catch{/* skip */}
      }
      this.clearWorker(i);
    }
  }
}
module.exports={Engine,chooseFreeAvd,parseRunningAvdName,parseAdbEmulators,chooseEmulatorPort};
