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
test('Windows Gradle uses official gradlew.bat via cwd, never a constructed absolute JAR path',()=>makeTmp(root=>{
 const project=path.join(root,'Dự án ReelTara (Android)');
 const dir=path.join(project,'gradle','wrapper');
 fs.mkdirSync(dir,{recursive:true});
 fs.writeFileSync(path.join(project,'gradlew.bat'),'@echo off\r\n');
 fs.writeFileSync(path.join(dir,'gradle-wrapper.jar'),Buffer.alloc(800,1));
 fs.writeFileSync(path.join(dir,'gradle-wrapper.properties'),'distributionUrl=https://services.gradle.org/distributions/gradle-8.14-bin.zip');
 const cmd=gradleCommand(project,{ComSpec:'C:\\Windows\\System32\\cmd.exe'},'win32');
 assert.equal(cmd.cmd,'C:\\Windows\\System32\\cmd.exe');
 assert.equal(cmd.shell,false);
 assert.equal(cmd.cwd,project);
 assert.deepEqual(cmd.preArgs,['/d','/c','gradlew.bat']);
 assert.equal(cmd.preArgs.join(' ').includes(project),false);
}));
test('official Gradle batch executes correctly from a real Unicode and spaced Windows folder',async t=>{
 if(process.platform!=='win32'){t.skip('Real cmd.exe smoke test only runs on Windows GitHub Actions');return;}
 const {exec}=require('../src/main/process');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'baodroid-windows-gradle-'));
 try{
   const project=path.join(root,'Dự án ReelTara (Android)');
   const dir=path.join(project,'gradle','wrapper');
   fs.mkdirSync(dir,{recursive:true});
   fs.writeFileSync(path.join(project,'gradlew.bat'),
     '@echo off\r\nif not exist "gradle\\wrapper\\gradle-wrapper.jar" exit /b 17\r\necho GRADLE_WRAPPER_CWD_OK\r\n');
   fs.writeFileSync(path.join(dir,'gradle-wrapper.jar'),Buffer.alloc(800,1));
   fs.writeFileSync(path.join(dir,'gradle-wrapper.properties'),'distributionUrl=fixture');
   const cmd=gradleCommand(project,process.env,'win32');
   const result=await exec(cmd.cmd,[...cmd.preArgs,':app:assembleDebug'],{
     cwd:cmd.cwd,shell:cmd.shell,timeout:15000
   });
   assert.match(result.stdout,/GRADLE_WRAPPER_CWD_OK/);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
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
