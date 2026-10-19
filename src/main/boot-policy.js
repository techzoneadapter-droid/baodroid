'use strict';
/* Android Emulator startup policy. Keep this pure for Windows CI tests. */
// Android Emulator / AOSP graphics modes: host GPU for local Windows and
// software renderer for a remote desktop session. The opposite mode is used
// exactly once if the first attempt actually fails. No SDK or AVD reinstall.
const GPU_MODES=Object.freeze(['host','software']);
const BOOT_TIMEOUT_MS=180000;
const ADB_DISCOVERY_TIMEOUT_MS=85000;
function remoteWindowsSession(sessionName=''){
 return /^RDP-/i.test(String(sessionName));
}
function gpuForAttempt(attempt=0,sessionName=''){
 const remote=remoteWindowsSession(sessionName);
 return attempt>0?(remote?'host':'software'):(remote?'software':'host');
}
function emulatorLaunchArgs({avd,port,attempt=0,sessionName=''}){
 if(typeof avd!=='string'||!avd||/[\r\n]/.test(avd))throw new Error('AVD không hợp lệ');
 if(!Number.isInteger(port)||port<5554||port>5584||port%2!==0)throw new Error('Cổng emulator không hợp lệ');
 const gpu=gpuForAttempt(attempt,sessionName);
 // -gpu software is supported by modern Android Emulator (36+/37+).
 // -no-window is used only for software rendering, which can bypass Windows
 // crash dialogs/remote desktop GL issues, while host rendering stays visible.
 const args=['@'+avd,'-port',String(port),'-no-audio','-no-boot-anim',
   '-no-snapshot-load','-feature','-Vulkan','-gpu',gpu];
 if(gpu==='software')args.push('-no-window');
 return args;
}
function diagnoseEmulatorLog(lines){
 const list=(Array.isArray(lines)?lines:[String(lines||'')]).map(String);
 const crashDialog=list.find(x=>/Showing crashdialog to get consent|Crashpad.*(consent|fatal)|Fatal error.*emulator/i.test(x));
 const ogl=list.find(x=>/Failed to load opengl32sw|Software OpenGL failed/i.test(x));
 if(crashDialog)return {kind:'crash',message:
   'Tiến trình Android Emulator đã gặp lỗi và mở Crashpad; ADB sẽ không nhận AVD. '+
   'Cần đổi chế độ GPU/kiểm tra driver hoặc phiên đăng nhập Windows. '+
   (ogl?'Lưu ý opengl32sw thường chỉ là cảnh báo, không tự cài DLL lạ. ':'')+
   crashDialog.slice(-180)};
 if(ogl)return {kind:'warning',message:
   'Cảnh báo OpenGL của emulator: '+ogl.slice(-160)+
   '. Chỉ xem là lỗi nghiêm trọng nếu emulator thực sự crash hoặc không xuất hiện trong ADB.'};
 return null;
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
module.exports={GPU_MODES,BOOT_TIMEOUT_MS,ADB_DISCOVERY_TIMEOUT_MS,gpuForAttempt,emulatorLaunchArgs,remoteWindowsSession,diagnoseEmulatorLog,accelerationMessage,bootReport};
