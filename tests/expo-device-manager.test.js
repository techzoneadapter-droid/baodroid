'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {parseAdbDeviceList,avdFromConsole,waitForAvdBoot}=require('../src/main/expo-device-manager');

test('Expo-style parser captures Android emulator, offline and transport id reliably',()=>{
 const data=parseAdbDeviceList('List of devices attached\nemulator-5554 offline transport_id:2\nemulator-5556 device product:sdk model:Pixel_8 transport_id:7\nserial-physical unauthorized usb:1\n');
 assert.deepEqual(data.map(d=>[d.serial,d.state]),[['emulator-5554','offline'],['emulator-5556','device'],['serial-physical','unauthorized']]);
 assert.equal(data[1].transportId,'7');
 assert.equal(avdFromConsole('Baodroid_Preview_1\r\nOK\r\n'),'Baodroid_Preview_1');
});
test('Expo-style manager picks an AVD by identity on a different port without attaching a different project',async()=>{
 const commands=[];
 let ticks=0;
 const run=async(cmd,args)=>{
   commands.push(args.join(' '));
   if(args[0]==='devices')return {stdout:'List of devices attached\nemulator-5556 device\nemulator-5560 device\n'};
   if(args.join(' ').includes('emulator-5556 emu'))return {stdout:'Different_Project_AVD\nOK\n'};
   if(args.join(' ').includes('emulator-5560 emu'))return {stdout:'Baodroid_Preview_1\nOK\n'};
   if(args.join(' ').includes('sys.boot_completed'))return {stdout:'1'};
   if(args.join(' ').includes('init.svc.bootanim'))return {stdout:'stopped'};
   return {stdout:''};
 };
 let changed=null;
 const result=await waitForAvdBoot({
   adb:'adb',desiredAvd:'Baodroid_Preview_1',preferredSerial:'emulator-5554',
   exec:run,excludedSerials:['emulator-5558'],onSerial:s=>{changed=s},
   now:()=>ticks,delay:async()=>{ticks+=2000}
 });
 assert.equal(result.serial,'emulator-5560');
 assert.equal(changed,'emulator-5560');
 assert.ok(commands.includes('-s emulator-5560 shell getprop sys.boot_completed'));
 assert.equal(commands.some(c=>c.includes('emulator-5556 shell')) ,false);
});
test('Expo-style manager waits through offline state and then Android boot animation',async()=>{
 let polls=0,now=0;
 const run=async(cmd,args)=>{
   if(args[0]==='devices'){polls++;return {stdout:'List of devices attached\nemulator-5554 '+(polls===1?'offline':'device')+'\n'};}
   if(args.includes('sys.boot_completed'))return {stdout:polls<3?'0':'1'};
   if(args.includes('init.svc.bootanim'))return {stdout:polls<4?'running':'stopped'};
   return {stdout:''};
 };
 const result=await waitForAvdBoot({adb:'adb',desiredAvd:'AVD',preferredSerial:'emulator-5554',
   exec:run,now:()=>now,delay:async()=>{now+=2000}});
 assert.equal(result.serial,'emulator-5554');
 assert.ok(polls>=4);
});
test('Expo-style manager cancels when Baodroid stops this slot',async()=>{
 let active=false;
 const result=await waitForAvdBoot({adb:'adb',desiredAvd:'AVD',preferredSerial:'emulator-5554',
  isActive:()=>active,exec:async()=>{throw Error('Should not execute');}});
 assert.equal(result,null);
});
test('Expo-style manager fails with ADB-specific diagnostic instead of silently waiting indefinitely',async()=>{
 let now=0,diagnostic=null;
 await assert.rejects(waitForAvdBoot({
   adb:'adb',desiredAvd:'AVD',preferredSerial:'emulator-5554',
   exec:async()=>({stdout:'List of devices attached\n'}),
   now:()=>now,delay:async()=>{now+=1000},discoveryMs:5000,timeoutMs:15000,
   onDiagnostic:d=>{diagnostic=d}
 }),/không xuất hiện trong ADB sau 5 giây/);
 assert.equal(diagnostic.seen,false);
 assert.equal(diagnostic.serial,'emulator-5554');
});
