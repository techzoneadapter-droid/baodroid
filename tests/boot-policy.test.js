'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {Engine}=require('../src/main/engine');
const {GPU_MODES,BOOT_TIMEOUT_MS,gpuForAttempt,emulatorLaunchArgs,accelerationMessage,bootReport}=require('../src/main/boot-policy');

function mockEngine(){
 const data={projects:[{id:'p',path:'C:/ReelTara',kind:'web',name:'ReelTara'}],
  slots:[{projectId:'p',avd:'Baodroid_Preview_1',nativeMode:true},{projectId:null},{projectId:null}],
  settings:{autoBuild:true}};
 return new Engine({data,save(){}},()=>{});
}
test('launches headless with SwiftShader and Vulkan off, then tries visible host GPU',()=>{
 assert.deepEqual(GPU_MODES,['swiftshader','host']);
 assert.equal(BOOT_TIMEOUT_MS,90000);
 const args=emulatorLaunchArgs({avd:'Baodroid_Preview_1',port:5554});
 assert.deepEqual(args.slice(0,4),['-avd','Baodroid_Preview_1','-port','5554']);
 assert.ok(args.includes('-no-window'));
 assert.ok(args.includes('-no-snapshot-load'));
 assert.deepEqual(args.slice(args.indexOf('-gpu'),args.indexOf('-gpu')+2),['-gpu','swiftshader']);
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
 assert.match(bootReport({waitedMs:90000,adbState:'offline'}),/90 giây/);
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
