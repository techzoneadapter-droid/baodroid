'use strict';
/* Android Emulator startup policy. Keep this pure for Windows CI tests. */
// Prefer headless Vulkan-disabled SwiftShader. If Windows crashes with
// 0xC0000005, retry using a visible, host-GPU-backed emulator window;
// Baodroid still renders the Android screen inside its own preview.
const GPU_MODES=Object.freeze(['swiftshader','host']);
const BOOT_TIMEOUT_MS=90000;
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
function bootReport({booted=false,waitedMs=0,adbState='unknown',lastError=''}={}){
 if(booted)return 'Android đã khởi động và sẵn sàng cài APK.';
 return 'AVD chưa hoàn tất khởi động sau '+Math.round(waitedMs/1000)+
   ' giây (ADB: '+adbState+'). '+(lastError?'Chi tiết: '+lastError.slice(-260)+'. ':'')+
   'Baodroid sẽ không chờ vô hạn.';
}
module.exports={GPU_MODES,BOOT_TIMEOUT_MS,gpuForAttempt,emulatorLaunchArgs,accelerationMessage,bootReport};
