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

test('native mode resolves Vite to Capacitor and Expo Web to React Native for build and reload',()=>{
  const engine=makeEngine();
  engine.store.data.projects[0]={id:'a',name:'ReelTara',path:'C:/ReelTara',kind:'web'};
  engine.store.data.projects[1]={id:'b',name:'chuong',path:'C:/chuong',kind:'expo-web'};
  engine.store.data.slots[0].nativeMode=true;
  engine.store.data.slots[1].nativeMode=true;
  assert.equal(engine.projectForSlot(0).kind,'capacitor');
  assert.equal(engine.projectForSlot(1).kind,'react-native');
  engine.store.data.slots[0].nativeMode=false;
  assert.equal(engine.projectForSlot(0).kind,'web');
});
test('build loop passes effective Capacitor kind, not the original web type',async()=>{
  const engine=makeEngine();
  engine.store.data.projects[0]={id:'a',name:'ReelTara',path:'C:/ReelTara',kind:'web'};
  engine.store.data.slots[0].nativeMode=true;
  engine.devices[0].status='running';
  const worker=engine.workers[0];
  worker.generation=3;worker.dirty=true;worker.manuallyDeploy=true;
  const calls=[];
  engine.buildNative=async(slot,project,generation,deploy)=>calls.push({slot,kind:project.kind,generation,deploy});
  await engine.buildLoop(0,3);
  assert.deepEqual(calls,[{slot:0,kind:'capacitor',generation:3,deploy:true}]);
});
