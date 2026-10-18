'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {Engine}=require('../src/main/engine');
const {GPU_MODES,BOOT_TIMEOUT_MS,ADB_DISCOVERY_TIMEOUT_MS,gpuForAttempt,emulatorLaunchArgs,accelerationMessage,bootReport}=require('../src/main/boot-policy');

function mockEngine(){
 const data={projects:[{id:'p',path:'C:/ReelTara',kind:'web',name:'ReelTara'}],
  slots:[{projectId:'p',avd:'Baodroid_Preview_1',nativeMode:true},{projectId:null},{projectId:null}],
  settings:{autoBuild:true}};
 return new Engine({data,save(){}},()=>{});
}
test('Expo-style minimal visible AVD launch uses standard command and host GPU only on retry',()=>{
 assert.deepEqual(GPU_MODES,['default','host']);
 assert.equal(BOOT_TIMEOUT_MS,180000);
 assert.equal(ADB_DISCOVERY_TIMEOUT_MS,110000);
 const args=emulatorLaunchArgs({avd:'Baodroid_Preview_1',port:5554});
 assert.deepEqual(args.slice(0,3),['@Baodroid_Preview_1','-port','5554']);
 assert.equal(args.includes('-no-window'),false);
 assert.equal(args.includes('-gpu'),false);
 assert.equal(args.includes('-no-snapshot-load'),false);
 assert.equal(args.includes('-feature'),false);
 const fallback=emulatorLaunchArgs({avd:'Baodroid_Preview_1',port:5556,attempt:1});
 assert.equal(fallback.includes('-no-window'),false);
 assert.equal(fallback.includes('-no-snapshot-load'),true);
 assert.deepEqual(fallback.slice(fallback.indexOf('-feature'),fallback.indexOf('-feature')+2),['-feature','-Vulkan']);
 assert.deepEqual(fallback.slice(fallback.indexOf('-gpu'),fallback.indexOf('-gpu')+2),['-gpu','host']);
 assert.equal(gpuForAttempt(8),'host');
 assert.equal(gpuForAttempt(0),'default');
 assert.throws(()=>emulatorLaunchArgs({avd:'bad',port:5555}),/không hợp lệ/);
});
test('preflight describes missing hypervisor instead of waiting several minutes',()=>{
 assert.equal(accelerationMessage(0,'',''),null);
 assert.match(accelerationMessage(1,'WHPX is not installed'),/WHPX/);
 assert.match(bootReport({waitedMs:110000,adbState:'not listed',serial:'emulator-5554'}),/110 giây/);
 assert.match(bootReport({waitedMs:110000,adbState:'not listed',serial:'emulator-5554'}),/ADB không phát hiện thiết bị Android emulator-5554/);
 assert.match(bootReport({waitedMs:180000,adbState:'offline',seen:true}),/đã được ADB nhận diện/);
});
test('first emulator crash allows one GPU fallback, then stops',()=>{
 const engine=mockEngine();
 engine.devices[0].status='booting';
 engine.fail(0,new Error('Emulator đã thoát (mã 1)'));
 assert.equal(engine.workers[0].gpuAttempt,1);
 assert.equal(engine.workers[0].recoveryAttempts,1);
 assert.ok(engine.workers[0].recoveryTimer);
 engine.devices[0].status='booting';
 engine.fail(0,new Error('Emulator đã thoát (mã 1)'));
 assert.equal(engine.devices[0].status,'error');
 assert.equal(engine.workers[0].recoveryTimer,null);
 assert.equal(engine.workers[0].recoveryAttempts,1);
 engine.dispose();
});
test('non-retryable hypervisor error does not launch another AVD',()=>{
 const engine=mockEngine();
 engine.devices[0].status='booting';
 engine.fail(0,new Error('WHPX unavailable'));
 assert.equal(engine.workers[0].recoveryAttempts,0);
 assert.equal(engine.workers[0].recoveryTimer,null);
 assert.match(engine.devices[0].message,/WHPX/);
 engine.dispose();
});

test('ADB missing device error triggers at most one explicit fallback, not an infinite loop',()=>{
 const engine=mockEngine();
 engine.devices[0].status='booting';
 engine.fail(0,new Error('Android AVD không xuất hiện trong ADB sau 110 giây'));
 assert.equal(engine.workers[0].recoveryAttempts,1);
 assert.equal(engine.workers[0].gpuAttempt,1);
 engine.dispose();
});
test('startSlot explicitly starts the ADB server before port discovery',()=>{
 const fs=require('node:fs');
 const path=require('node:path');
 const engine=fs.readFileSync(path.join(__dirname,'../src/main/engine.js'),'utf8');
 assert.match(engine,/\['start-server'\]/);
 assert.match(engine,/waitForAvdBoot/);
 assert.match(engine,/ADB_DISCOVERY_TIMEOUT_MS/);
 assert.match(engine,/onSerial:serial/);
});
