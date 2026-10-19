'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {findFreeEmulatorPort,portIsAvailable}=require('../src/main/emulator-ports');
const {emulatorLaunchArgs,gpuForAttempt}=require('../src/main/boot-policy');
test('port preflight skips busy ADB console pairs without trying to kill other processes',async()=>{
 const seen=[];
 const free=await findFreeEmulatorPort({preferred:5554,blocked:[5556,5558],
  probe:async port=>{seen.push(port);return port===5562;}});
 assert.equal(free,5562);
 assert.deepEqual(seen,[5554,5560,5562]);
});
test('port preflight throws an actionable message if all emulator pairs are occupied',async()=>{
 await assert.rejects(findFreeEmulatorPort({preferred:5554,probe:async()=>false}),/Không có cặp cổng emulator/);
});
test('new startup policy prefers host GPU, then software if the emulator crashes',()=>{
 assert.equal(gpuForAttempt(0,'Console'),'host');
 assert.equal(gpuForAttempt(1,'Console'),'software');
 const primary=emulatorLaunchArgs({avd:'Baodroid_Preview_1',port:5554,attempt:0,sessionName:'Console'});
 const backup=emulatorLaunchArgs({avd:'Baodroid_Preview_1',port:5554,attempt:1,sessionName:'Console'});
 assert.equal(primary.includes('-no-window'),false);
 assert.equal(backup.includes('-no-window'),true);
 assert.deepEqual(primary.slice(primary.indexOf('-gpu'),primary.indexOf('-gpu')+2),['-gpu','host']);
 assert.deepEqual(backup.slice(backup.indexOf('-gpu'),backup.indexOf('-gpu')+2),['-gpu','software']);
});
test('port binding probe rejects invalid ports without side effects',async()=>{
 assert.equal(await portIsAvailable(-1).catch(()=>false),false);
});
