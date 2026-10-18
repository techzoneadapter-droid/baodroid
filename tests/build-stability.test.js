'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {gradleCommand}=require('../src/main/process');
const {watchTargets,shouldSyncChange}=require('../src/main/watch-rules');

const makeTmp=fn=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'baodroid-build-'));
 try{return fn(root);}finally{fs.rmSync(root,{recursive:true,force:true});}
};
test('Windows Gradle bypasses cmd.exe even with spaces and Vietnamese in the project path',()=>makeTmp(root=>{
 const project=path.join(root,'Dự án ReelTara (Android)');
 const wrapper=path.join(project,'gradle','wrapper');
 fs.mkdirSync(wrapper,{recursive:true});
 fs.writeFileSync(path.join(project,'gradlew.bat'),'@echo off\r\n');
 fs.writeFileSync(path.join(wrapper,'gradle-wrapper.jar'),'fixture');
 const env={JAVA_HOME:path.join(root,'JDK có dấu và khoảng trắng')};
 const java=path.join(env.JAVA_HOME,'bin','java.exe');
 fs.mkdirSync(path.dirname(java),{recursive:true});
 fs.writeFileSync(java,'fixture');
 const cmd=gradleCommand(project,env,'win32');
 assert.equal(cmd.cmd,java);
 assert.equal(cmd.shell,false);
 assert.equal(cmd.cwd,project);
 assert.deepEqual(cmd.preArgs,[
  '-Dorg.gradle.appname=gradlew',
  '-jar',
  path.join(project,'gradle','wrapper','gradle-wrapper.jar')
 ]);
}));
test('Windows Gradle gives actionable error when wrapper jar is missing',()=>makeTmp(root=>{
 fs.writeFileSync(path.join(root,'gradlew.bat'),'@echo off\r\n');
 assert.throws(()=>gradleCommand(root,{},'win32'),/gradle-wrapper\.jar/);
}));
test('Capacitor watches source files but ignores Gradle output and cap sync generated native files',()=>makeTmp(root=>{
 for(const dir of ['src','public','android/app/src/main','android/app/build','node_modules','dist'])fs.mkdirSync(path.join(root,dir),{recursive:true});
 fs.writeFileSync(path.join(root,'index.html'),'<html></html>');
 fs.writeFileSync(path.join(root,'package.json'),'{"scripts":{"build":"vite build"}}');
 fs.writeFileSync(path.join(root,'src','App.tsx'),'export default function App(){}');
 const project={path:root,kind:'capacitor'};
 const targets=watchTargets(project);
 assert.ok(targets.includes(path.join(root,'src')));
 assert.ok(targets.includes(path.join(root,'package.json')));
 assert.ok(!targets.some(p=>p.includes(path.join(root,'android'))));
 assert.equal(shouldSyncChange(project,path.join(root,'src','App.tsx')),true);
 assert.equal(shouldSyncChange(project,path.join(root,'index.html')),true);
 assert.equal(shouldSyncChange(project,path.join(root,'android','app','src','main','AndroidManifest.xml')),false);
 assert.equal(shouldSyncChange(project,path.join(root,'android','app','build','outputs','app.apk')),false);
 assert.equal(shouldSyncChange(project,path.join(root,'tsconfig.app.tsbuildinfo')),false);
 assert.equal(shouldSyncChange(project,path.join(root,'dist','index.html')),false);
 assert.equal(shouldSyncChange(project,path.join(root,'node_modules','vendor.js')),false);
}));
test('React Native watches hand-edited Android sources, not generated Gradle outputs',()=>makeTmp(root=>{
 const project={path:root,kind:'react-native'};
 assert.equal(shouldSyncChange(project,path.join(root,'android','app','src','main','java','MainActivity.kt')),true);
 assert.equal(shouldSyncChange(project,path.join(root,'android','app','build','generated','source','R.java')),false);
 assert.equal(shouldSyncChange(project,path.join(root,'android','gradle','caches','data')),false);
}));
test('Failed builds stop pending dirty retries until a deliberate new attempt',async()=>{
 const {Engine}=require('../src/main/engine');
 const data={projects:[{id:'p',name:'ReelTara',kind:'web',path:'C:/ReelTara'}],
   slots:[{projectId:'p',nativeMode:true,avd:'TestAVD'},{projectId:null},{projectId:null}],
   settings:{autoDeploy:true}};
 const engine=new Engine({data,save(){}},()=>{});
 engine.devices[0].status='running';
 const worker=engine.workers[0];worker.generation=1;worker.dirty=true;worker.manuallyDeploy=true;
 let calls=0;
 engine.buildNative=async()=>{
   calls++;
   worker.dirty=true; // Simulate generated-file event arriving while Gradle is running.
   throw new Error('simulated Gradle failure');
 };
 await engine.buildLoop(0,1);
 assert.equal(calls,1);
 assert.equal(worker.dirty,false);
 assert.equal(worker.busy,false);
 assert.equal(engine.devices[0].build,'error');
});
