'use strict';
/* Android Emulator startup policy. Keep this pure for Windows CI tests. */
// Previous user's host GPU visible AVD booted successfully, while headless
// SwiftShader failed to register in ADB. Use that proven GPU for both tries;
// retry once with a visible window only if headless host launch fails.
const GPU_MODES=Object.freeze(['host','host']);
const BOOT_TIMEOUT_MS=150000;
const ADB_DISCOVERY_TIMEOUT_MS=55000;
function gpuForAttempt(attempt){
 const n=Number.isInteger(attempt)?Math.max(0,attempt):0;
 return GPU_MODES[Math.min(n,GPU_MODES.length-1)];
}
function emulatorLaunchArgs({avd,port,attempt=0}){
 if(typeof avd!=='string'||!avd||/[\r\n]/.test(avd))throw new Error('AVD không hợp lệ');
 if(!Number.isInteger(port)||port<5554||port>5584||port%2!==0)throw new Error('Cổng emulator không hợp lệ');
 const args=['-avd',avd,'-port',String(port),'-no-audio','-no-boot-anim',
   '-no-snapshot-load','-feature','-Vulkan','-gpu',gpuForAttempt(attempt),
   '-netdelay','none','-netspeed','full'];
 if(attempt<1)args.push('-no-window');
 return args;
}
function accelerationMessage(code,stdout='',stderr=''){
 const result=String(stdout||'')+' '+String(stderr||'');
 if(code===0)return null;
 return 'Tăng tốc Android Emulator chưa khả dụng trên Windows. '+result.trim().replace(/\s+/g,' ').slice(-420)+
   '. Hãy kiểm tra Windows Hypervisor Platform (WHPX), sau đó khởi động lại Windows nếu vừa bật tính năng.';
}
function bootReport({booted=false,waitedMs=0,adbState='unknown',lastError='',serial='',seen=false,consoleReady=false}={}){
 if(booted)return 'Android đã khởi động và sẵn sàng cài APK.';
 const state=seen?'Android đã được ADB nhận diện nhưng chưa boot xong.':
   consoleReady?'QEMU đã mở cổng console, nhưng Android chưa xuất hiện trong ADB.':
   'ADB không phát hiện thiết bị Android '+(serial||'')+' sau khi khởi động AVD.';
 return state+' Đã chờ '+Math.round(waitedMs/1000)+' giây (ADB: '+adbState+'). '+
   (lastError?'Chi tiết: '+lastError.slice(-260)+'. ':'')+
   'Baodroid sẽ không chờ vô hạn hay xoá máy ảo.';
}
module.exports={GPU_MODES,BOOT_TIMEOUT_MS,ADB_DISCOVERY_TIMEOUT_MS,gpuForAttempt,emulatorLaunchArgs,accelerationMessage,bootReport};
