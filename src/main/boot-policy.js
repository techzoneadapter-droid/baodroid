'use strict';
/* Android Emulator startup policy. Keep this pure for Windows CI tests. */
// Expo CLI style: start the user's installed Android Emulator with standard
// arguments and its normal window. Headless modes repeatedly failed to register
// in ADB on this Windows host. Retry once with explicit host GPU/Vulkan fallback.
// Mode "default" lets the installed Emulator select compatible rendering.
const GPU_MODES=Object.freeze(['default','host']);
const BOOT_TIMEOUT_MS=180000;
const ADB_DISCOVERY_TIMEOUT_MS=110000;
function gpuForAttempt(attempt){
 const n=Number.isInteger(attempt)?Math.max(0,attempt):0;
 return GPU_MODES[Math.min(n,GPU_MODES.length-1)];
}
function emulatorLaunchArgs({avd,port,attempt=0}){
 if(typeof avd!=='string'||!avd||/[\r\n]/.test(avd))throw new Error('AVD không hợp lệ');
 if(!Number.isInteger(port)||port<5554||port>5584||port%2!==0)throw new Error('Cổng emulator không hợp lệ');
 // This is the same minimal launch strategy Expo CLI uses: emulator @AVD.
 // Custom port only isolates the three independent Baodroid preview slots.
 const args=['@'+avd,'-port',String(port),'-no-audio'];
 if(attempt>0)args.push('-no-snapshot-load','-feature','-Vulkan','-gpu','host');
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
