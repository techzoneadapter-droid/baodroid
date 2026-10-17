'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {Engine,chooseFreeAvd}=require('../src/main/engine');

function makeEngine() {
  const data={
    projects:[{id:'a',name:'ProjectA',path:'C:/A',kind:'gradle'},{id:'b',name:'ProjectB',path:'C:/B',kind:'gradle'}],
    slots:[{projectId:'a',avd:''},{projectId:'b',avd:''},{projectId:null,avd:''}],
    settings:{sdkPath:'',autoBuild:true,autoDeploy:true,screenshots:false}
  };
  const engine=new Engine({data,save(){}},()=>{});
  engine.listAvds=async()=>['Pixel7','Pixel8'];
  engine.startSlot=async slot=>{engine.update(slot,{status:'booting'});return true;};
  return engine;
}
test('free AVD selection excludes devices assigned to other slots',()=>{
  assert.equal(chooseFreeAvd(['Pixel7','Pixel8'],[{avd:'Pixel7'},{avd:''},{avd:''}],1),'Pixel8');
  assert.equal(chooseFreeAvd(['Pixel7'],[{avd:'Pixel7'},{avd:''},{avd:''}],2),'');
});
test('selecting a project automatically allocates an available AVD and starts',async()=>{
  const engine=makeEngine();
  assert.equal(await engine.autoStartSlot(0),true);
  assert.equal(engine.store.data.slots[0].avd,'Pixel7');
  assert.equal(engine.devices[0].status,'booting');
  assert.equal(await engine.autoStartSlot(1),true);
  assert.equal(engine.store.data.slots[1].avd,'Pixel8');
});
test('running out of AVDs provides a useful message instead of starting',async()=>{
  const engine=makeEngine();
  engine.store.data.slots[0].avd='Pixel7';
  engine.store.data.slots[1].avd='Pixel8';
  engine.store.data.slots[2].projectId='a';
  assert.equal(await engine.autoStartSlot(2),false);
  assert.match(engine.devices[2].message,/AVD/);
});
test('cannot assign the same project to two devices',async()=>{
  const engine=makeEngine();
  await assert.rejects(()=>engine.assignProject(2,'a'),/Mỗi dự án/);
});

test('React Native uses independent local Metro port and emulator ADB reverse',()=>{
  const fs=require('node:fs');
  const source=fs.readFileSync(require('node:path').join(__dirname,'../src/main/engine.js'),'utf8');
  assert.match(source,/8081\+slot/);
  assert.match(source,/\['reverse','tcp:8081'/);
  assert.match(source,/project\.kind==='react-native'/);
});
