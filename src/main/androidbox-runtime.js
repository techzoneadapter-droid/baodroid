'use strict';
/*
 * Baodroid Android runtime adapter. Ported/adapted from the techniques used in
 * Wolklaw/Androidbox (MIT), particularly its emulator console liveness probe,
 * AVD lock ownership probe and preference for quick boot when safe.
 *
 * Upstream: https://github.com/Wolklaw/Androidbox/blob/main/androidbox/emulator.py
 * MIT attribution in THIRD_PARTY_NOTICES.md.
 *
 * The actual VM is always Google's official Android SDK emulator.exe, installed
 * separately with the existing Baodroid SDK/AVD flow. No USB phone involved.
 */
const fs=require('node:fs');
const path=require('node:path');
const net=require('node:net');
const os=require('node:os');

function emulatorEnvironment(sdkPath, env=process.env){
 return {...env,ANDROID_SDK_ROOT:sdkPath,ANDROID_HOME:sdkPath};
}
function consoleListening(port,{timeout=450,host='127.0.0.1'}={}){
 if(!Number.isInteger(port)||port<1||port>65535)return Promise.resolve(false);
 return new Promise(resolve=>{
  const socket=net.createConnection({host,port});
  let finished=false;
  const finish=value=>{if(finished)return;finished=true;socket.destroy();resolve(value);};
  socket.setTimeout(timeout,()=>finish(false));
  socket.once('connect',()=>finish(true));
  socket.once('error',()=>finish(false));
  socket.once('close',()=>finish(false));
 });
}
function parseIniPath(value){
 return String(value||'').trim().replace(/^"(.*)"$/,'$1');
}
function findAvdDir(name, env=process.env){
 if(!/^[a-zA-Z0-9_.-]+$/.test(name))return null;
 const home=env.USERPROFILE||os.homedir();
 const parent=env.ANDROID_AVD_HOME||
   path.join(env.ANDROID_USER_HOME||path.join(home,'.android'),'avd');
 const marker=path.join(parent,name+'.ini');
 if(fs.existsSync(marker)){
  try{
   const ini=fs.readFileSync(marker,'utf8');
   const stored=ini.match(/^path=(.+)$/m)?.[1];
   const relative=ini.match(/^path\.rel=(.+)$/m)?.[1];
   if(stored&&fs.existsSync(parseIniPath(stored)))return parseIniPath(stored);
   if(relative){
    const resolved=path.resolve(env.ANDROID_USER_HOME||path.join(home,'.android'),parseIniPath(relative));
    if(fs.existsSync(resolved))return resolved;
   }
  }catch{/* fall back to common AVD layout */}
 }
 const candidate=path.join(parent,name+'.avd');
 return fs.existsSync(candidate)?candidate:null;
}
function avdLockStatus(avdDir,existsPid=pid=>{
 try{process.kill(pid,0);return true;}catch{return false;}
}){
 if(!avdDir)return {present:false,alive:false,pid:null};
 const lock=path.join(avdDir,'hardware-qemu.ini.lock');
 if(!fs.existsSync(lock))return {present:false,alive:false,pid:null};
 let pid=null;
 try{
  const text=fs.readFileSync(path.join(lock,'pid'),'utf8').trim();
  if(/^\d+$/.test(text))pid=Number(text);
 }catch{/* legacy lock without pid */}
 return {present:true,alive:pid!==null?Boolean(existsPid(pid)):null,pid};
}
function hasQuickBootSnapshot(avdDir){
 return Boolean(avdDir&&fs.existsSync(path.join(avdDir,'snapshots','default_boot')));
}
async function emulatorHealth({avd,port,env=process.env,probe=consoleListening}={}){
 const dir=findAvdDir(avd,env);
 const [consoleReady,lock]=await Promise.all([probe(port),Promise.resolve(avdLockStatus(dir))]);
 return {avd,port,consoleReady,lock,quickBootAvailable:hasQuickBootSnapshot(dir),avdDir:dir};
}
function diagnostics(h){
 if(!h)return 'Không thể kiểm tra trạng thái emulator.';
 if(h.consoleReady)return 'Cổng console '+h.port+' đã mở: QEMU đang chạy nhưng ADB có thể chưa kết nối.';
 if(h.lock.present&&h.lock.alive===true)return 'QEMU có tiến trình (PID '+h.lock.pid+') nhưng cổng console '+h.port+' chưa mở.';
 if(h.lock.present&&h.lock.alive===false)return 'Phát hiện lock AVD từ tiến trình cũ (PID '+h.lock.pid+'). Không tự xoá lock hay dữ liệu.';
 return 'Chưa thấy tiến trình QEMU trên cổng console '+h.port+'. Kiểm tra log emulator/driver GPU.';
}
module.exports={emulatorEnvironment,consoleListening,findAvdDir,avdLockStatus,hasQuickBootSnapshot,emulatorHealth,diagnostics};
