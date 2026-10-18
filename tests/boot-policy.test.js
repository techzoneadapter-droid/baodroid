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
test('reuses proven host GPU for both headless and visible fallback, leaving Vulkan disabled',()=>{
 assert.deepEqual(GPU_MODES,['host','host']);
 assert.equal(BOOT_TIMEOUT_MS,150000);
 assert.equal(ADB_DISCOVERY_TIMEOUT_MS,55000);
 const args=emulatorLaunchArgs({avd:'Baodroid_Preview_1',port:5554});
 assert.deepEqual(args.slice(0,4),['-avd','Baodroid_Preview_1','-port','5554']);
 assert.ok(args.includes('-no-window'));
 assert.ok(args.includes('-no-snapshot-load'));
 assert.deepEqual(args.slice(args.indexOf('-gpu'),args.indexOf('-gpu')+2),['-gpu','host']);
 assert.deepEqual(args.slice(args.indexOf('-feature'),args.indexOf('-feature')+2),['-feature','-Vulkan']);
 const fallback=emulatorLaunchArgs({avd:'Baodroid_Preview_1',port:5556,attempt:1});
 assert.equal(fallback.includes('-no-window'),false);
 assert.deepEqual(fallback.slice(fallback.indexOf('-gpu'),fallback.indexOf('-gpu')+2),['-gpu','host']);
 assert.equal(gpuForAttempt(8),'host');
 assert.throws(()=>emulatorLaunchArgs({avd:'bad',port:5555}),/không hợp lệ/);
});
test('preflight describes missing hypervisor instead of waiting several minutes',()=>{
 assert.equal(accelerationMessage(0,'',''),null);
 assert.match(accelerationMessage(1,'WHPX is not installed'),/WHPX/);
 assert.match(bootReport({waitedMs:55000,adbState:'not listed',serial:'emulator-5554'}),/55 giây/);
 assert.match(bootReport({waitedMs:55000,adbState:'not listed',serial:'emulator-5554'}),/ADB không phát hiện thiết bị Android emulator-5554/);
 assert.match(bootReport({waitedMs:150000,adbState:'offline',seen:true}),/đã được ADB nhận diện/);
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

test('ADB device missing is treated as one retryable startup failure, not a 90s silent loop',()=>{
 const engine=mockEngine();
 engine.devices[0].status='booting';
 engine.fail(0,new Error(bootReport({waitedMs:55000,adbState:'not listed',serial:'emulator-5554'})));
 assert.equal(engine.workers[0].recoveryAttempts,1);
 assert.equal(engine.workers[0].gpuAttempt,1);
 engine.dispose();
});
test('startSlot explicitly starts the ADB server before port discovery',()=>{
 const fs=require('node:fs');
 const path=require('node:path');
 const engine=fs.readFileSync(path.join(__dirname,'../src/main/engine.js'),'utf8');
 assert.match(engine,/\['start-server'\]/);
 assert.match(engine,/ADB tìm lại đúng/);
 assert.match(engine,/ADB_DISCOVERY_TIMEOUT_MS/);
 assert.match(engine,/parseRunningAvdName\(lookup\.stdout\)===assigned\.avd/);
});
