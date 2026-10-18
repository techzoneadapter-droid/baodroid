'use strict';
/*
 * Device discovery and boot lifecycle adapted from Expo CLI:
 * https://github.com/expo/expo/blob/main/packages/@expo/cli/src/start/platforms/android/emulator.ts
 * https://github.com/expo/expo/blob/main/packages/@expo/cli/src/start/platforms/android/adbDeviceList.ts
 * Copyright (c) 2015-present 650 Industries, Inc. (Expo), MIT License.
 * See THIRD_PARTY_NOTICES.md. Adapted to Baodroid's three independent
 * local Windows AVD slots and explicit per-slot ADB serials.
 */
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const HEADER='List of devices attached';

function parseAdbDeviceList(output){
 return String(output||'').split(/\r?\n/).map(line=>line.trim())
   .filter(line=>line&&line!==HEADER&&!/\.cpp:\d+/.test(line))
   .map(line=>{
     const m=line.match(/^(\S+)\s+(.+)$/);
     if(!m)return null;
     const fields=m[2].split(/\s+/);
     const state=fields[0]==='no'&&fields[1]==='permissions'?'no permissions':fields[0];
     return {serial:m[1],state,transportId:fields.find(x=>x.startsWith('transport_id:'))?.slice(13)};
   }).filter(Boolean);
}
function avdFromConsole(output){
 return String(output||'').split(/\r?\n/).map(x=>x.trim())
   .find(x=>x&&x!=='OK'&&!/^avd name:/i.test(x)&&!/^console/i.test(x))||'';
}
function pickRegisteredEmulator(devices,serial){
 return devices.find(d=>d.serial===serial&&d.state==='device')||null;
}

/**
 * Poll sequentially, like Expo CLI, so ADB commands never pile up. Reject
 * disconnected/unauthorized devices. Never attach another slot's AVD.
 */
async function waitForAvdBoot({
 adb,desiredAvd,preferredSerial,exec,excludedSerials=[],isActive=()=>true,
 onProgress=()=>{},onSerial=()=>{},onDiagnostic=()=>{},
 timeoutMs=180000,pollMs=1600,discoveryMs=110000,now=Date.now,delay=sleep
}){
 const start=now();
 let lastProgress=-Infinity,lastError='',seen=false,serial=preferredSerial,phase='ADB not listed';
 const excluded=new Set(excludedSerials);
 if(!desiredAvd)throw new Error('Chưa chọn AVD để chạy Android.');
 while(now()-start<timeoutMs){
   if(!isActive())return null;
   try{
     const list=await exec(adb,['devices','-l'],{timeout:6500});
     const attached=parseAdbDeviceList(list.stdout);
     let own=attached.find(d=>d.serial===serial);
     // If our expected serial disappeared, inspect other emulator instances.
     if(!own||own.state!=='device'){
       for(const d of attached.filter(d=>/^emulator-\d+$/.test(d.serial)&&d.state==='device'&&!excluded.has(d.serial))){
         if(d.serial===serial){own=d;continue;}
         try{
           const name=await exec(adb,['-s',d.serial,'emu','avd','name'],{timeout:4000});
           if(avdFromConsole(name.stdout)===desiredAvd){
             serial=d.serial;own=d;
             onSerial(serial);break;
           }
         }catch(e){lastError=String(e.message||e);}
       }
     }
     if(own){
       seen=true;phase='ADB '+own.state;
       if(own.state==='device'){
         const result=await exec(adb,['-s',serial,'shell','getprop','sys.boot_completed'],{timeout:5000});
         if(result.stdout.trim()==='1'){
           const boot=await exec(adb,['-s',serial,'shell','getprop','init.svc.bootanim'],{timeout:4000,ignoreFailure:true});
           if(['stopped','', 'unknown'].includes(boot.stdout.trim()))return {serial,elapsedMs:now()-start,seen:true};
           phase='Android boot animation';
         }else phase='Android booting';
       }else if(own.state==='unauthorized')throw new Error('Android '+serial+' chưa được ADB cho phép.');
     }else phase=attached.length?'ADB: other devices only':'ADB not listed';
   }catch(error){
     lastError=String(error?.message||error);
     if(/chưa được ADB cho phép/.test(lastError))throw error;
     phase='ADB probing';
   }
   const elapsedMs=now()-start;
   if(elapsedMs-lastProgress>=12000){
     lastProgress=elapsedMs;
     onProgress({elapsedMs,phase,serial,seen,lastError});
   }
   if(!seen&&elapsedMs>=discoveryMs){
     onDiagnostic({serial,phase,lastError,elapsedMs,seen});
     throw new Error('Android '+desiredAvd+' không xuất hiện trong ADB sau '+Math.round(elapsedMs/1000)+
       ' giây ('+phase+'). '+(lastError?'ADB: '+lastError.slice(-250):'Emulator chưa đăng ký máy ảo với ADB.'));
   }
   await delay(pollMs);
 }
 onDiagnostic({serial,phase,lastError,elapsedMs:now()-start,seen});
 throw new Error('Android '+desiredAvd+' chưa boot xong sau '+Math.round((now()-start)/1000)+
   ' giây ('+phase+'). '+lastError.slice(-250));
}
module.exports={parseAdbDeviceList,avdFromConsole,pickRegisteredEmulator,waitForAvdBoot};
