'use strict';
/* Project-specific native build preparation. Explicit user consent is required
 * because Expo prebuild and Capacitor modify the selected project's folder. */
const fs=require('node:fs');
const fsp=require('node:fs/promises');
const path=require('node:path');
const {run}=require('./android-setup');
function needsPreparation(project){
 return project.kind==='web'||project.kind==='expo-web';
}
function safeSlug(name){
 return String(name).toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'').slice(0,32)||'app';
}
class NativeProjectPreparation{
 constructor(engine,emit){this.engine=engine;this.emit=emit;}
 progress(slot,message){
  this.engine.log(message,'info',slot);
  this.emit('sdk-setup',{slot,step:'preparing',message});
 }
 async command(slot,root,command,args,timeout=25*60*1000){
  const env={...process.env,
    ANDROID_HOME:this.engine.store.data.settings.sdkPath,
    ANDROID_SDK_ROOT:this.engine.store.data.settings.sdkPath,
    CI:'1',EXPO_NO_TELEMETRY:'1'};
  return run(command,args,{
   cwd:root,env,timeout,
   onLine:line=>{if(/error|failed|building|installing|complete|generated|warning/i.test(line))this.progress(slot,line.slice(-220));}
  });
 }
 async prepare(slot){
  const project=this.engine.project(this.engine.store.data.slots[slot].projectId);
  const root=fs.realpathSync(path.resolve(project.path));
  if(!needsPreparation(project))return {kind:project.kind};
  if(!fs.existsSync(path.join(root,'package.json')))
   throw new Error('Dự án thiếu package.json.');
  const npm=process.platform==='win32'?'npm.cmd':'npm';
  const npx=process.platform==='win32'?'npx.cmd':'npx';
  if(!fs.existsSync(path.join(root,'node_modules'))){
    this.progress(slot,'Đang cài thư viện hiện có của dự án (npm install)…');
    await this.command(slot,root,npm,['install','--no-audit','--no-fund']);
  }
  const nativeRoot=path.join(root,'android');
  if(project.kind==='expo-web'){
    if(!fs.existsSync(path.join(nativeRoot,'settings.gradle'))&&!fs.existsSync(path.join(nativeRoot,'settings.gradle.kts'))){
      this.progress(slot,'Đang tạo project Android native bằng Expo prebuild…');
      await this.command(slot,root,npx,['--no-install','expo','prebuild','--platform','android','--no-install'],30*60*1000);
    }
    const expected=fs.existsSync(path.join(nativeRoot,'settings.gradle'))||fs.existsSync(path.join(nativeRoot,'settings.gradle.kts'));
    if(!expected)throw new Error('Expo chưa tạo được dự án Android. Kiểm tra plugin Expo và log.');
    this.progress(slot,'Đã tạo bản Android native của Expo. Các tính năng chỉ có trên Android sẽ chạy trong emulator.');
    return {kind:'react-native',nativeRoot};
  }
  // Vite uses a real APK containing Capacitor WebView, NOT a React Native app.
  let pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
  const installed=Object.assign({},pkg.dependencies||{},pkg.devDependencies||{});
  const core=installed['@capacitor/core'];
  if(!core||!installed['@capacitor/android']||!installed['@capacitor/cli']){
    this.progress(slot,'Đang bổ sung Capacitor Android để tạo APK cho dự án Vite…');
    const match=core&&String(core).match(/(\d+)/);
    const version=match?'@'+match[1]:'';
    await this.command(slot,root,npm,['install','--no-audit','--no-fund','@capacitor/core'+version,'@capacitor/android'+version]);
    await this.command(slot,root,npm,['install','--save-dev','--no-audit','--no-fund','@capacitor/cli'+version]);
    pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
  }
  const configs=['capacitor.config.ts','capacitor.config.js','capacitor.config.json'];
  if(!configs.some(file=>fs.existsSync(path.join(root,file)))){
    const name=safeSlug(pkg.name||project.name);
    const config={appId:'dev.baodroid.preview.'+name,appName:project.name,webDir:'dist'};
    await fsp.writeFile(path.join(root,'capacitor.config.json'),JSON.stringify(config,null,2)+'\n',{flag:'wx'});
  }
  this.progress(slot,'Đang build giao diện Vite để đưa vào APK…');
  await this.command(slot,root,npm,['run','build']);
  if(!fs.existsSync(path.join(nativeRoot,'settings.gradle'))&&!fs.existsSync(path.join(nativeRoot,'settings.gradle.kts'))){
    this.progress(slot,'Đang tạo project Android bằng Capacitor…');
    await this.command(slot,root,npx,['--no-install','cap','add','android']);
  }
  this.progress(slot,'Đang đồng bộ asset và plugin Capacitor cho Android…');
  await this.command(slot,root,npx,['--no-install','cap','sync','android']);
  if(!fs.existsSync(path.join(nativeRoot,'settings.gradle'))&&!fs.existsSync(path.join(nativeRoot,'settings.gradle.kts')))
    throw new Error('Capacitor chưa tạo được thư mục Android.');
  this.progress(slot,'Đã tạo dự án Android/Capacitor; sẽ cài APK vào Android Emulator thật.');
  return {kind:'capacitor',nativeRoot};
 }
}
module.exports={NativeProjectPreparation,needsPreparation,safeSlug};
