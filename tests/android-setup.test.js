'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {extractWindowsArchiveUrl,avdName,pickSdkRoot,findJava}=require('../src/main/android-setup');
const {needsPreparation,safeSlug}=require('../src/main/native-project');
const {gradleRoot,readApplicationId}=require('../src/shared/project');

test('official Google repository provides only a validated Windows SDK tools URL',()=>{
 const xml='<remotePackage><url>commandlinetools-win-123_latest.zip</url></remotePackage>'+
  '<url>commandlinetools-linux-999_latest.zip</url><url>commandlinetools-win-456_latest.zip</url>';
 assert.equal(extractWindowsArchiveUrl(xml),'https://dl.google.com/android/repository/commandlinetools-win-456_latest.zip');
 assert.throws(()=>extractWindowsArchiveUrl('https://evil.example/tools.zip'),/Không tìm thấy/);
});
test('one AVD is allocated for each of the three preview slots',()=>{
 assert.deepEqual([0,1,2].map(avdName),['Baodroid_Preview_1','Baodroid_Preview_2','Baodroid_Preview_3']);
 assert.throws(()=>avdName(3),/không hợp lệ/);
});
test('SDK path is reused if it exists, otherwise a shared user-level SDK is chosen',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'baodroid-avd-'));
 try{
  const custom=path.join(root,'Sdk');fs.mkdirSync(custom);
  assert.equal(pickSdkRoot({sdkPath:custom},{LOCALAPPDATA:root}),custom);
  const result=pickSdkRoot({sdkPath:path.join(root,'absent')},{LOCALAPPDATA:root});
  assert.ok(result.endsWith(path.join('Baodroid','Android','Sdk')));
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('detect JDK already bundled in Android Studio',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'baodroid-jdk-'));
 try{
  const java=path.join(root,'Android','Android Studio','jbr','bin','java.exe');
  fs.mkdirSync(path.dirname(java),{recursive:true});fs.writeFileSync(java,'test');
  assert.equal(findJava({ProgramFiles:root}),path.dirname(path.dirname(java)));
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('Expo/Vite need explicit native project preparation, Gradle does not',()=>{
 assert.equal(needsPreparation({kind:'expo-web'}),true);
 assert.equal(needsPreparation({kind:'web'}),true);
 assert.equal(needsPreparation({kind:'gradle'}),false);
 assert.equal(safeSlug('ReelTara App!'),'reeltara_app');
});
test('Capacitor projects build APK from nested android/ gradle and read application ID',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'baodroid-cap-'));
 try{
  const app=path.join(root,'android','app');fs.mkdirSync(app,{recursive:true});
  fs.writeFileSync(path.join(app,'build.gradle'),'android { defaultConfig { applicationId "dev.baodroid.preview.reeltara" } }');
  assert.equal(gradleRoot(root,'capacitor'),path.join(root,'android'));
  assert.equal(readApplicationId(root,'capacitor'),'dev.baodroid.preview.reeltara');
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('native mode maps web project to Capacitor without changing project record',()=>{
 const {Engine}=require('../src/main/engine');
 const data={projects:[{id:'p',name:'demo',path:'C:/demo',kind:'web'}],
  slots:[{projectId:'p',avd:'Baodroid_Preview_1',nativeMode:true},{projectId:null},{projectId:null}],
  settings:{sdkPath:''}};
 const engine=new Engine({data,save(){}},()=>{});
 const mapped=engine.projectForSlot(0);
 assert.equal(mapped.kind,'capacitor');
 assert.equal(data.projects[0].kind,'web');
});
test('already-running Android AVD name is parsed without the console OK suffix',()=>{
 const {parseRunningAvdName}=require('../src/main/engine');
 assert.equal(parseRunningAvdName('Baodroid_Preview_1\r\nOK\r\n'),'Baodroid_Preview_1');
 assert.equal(parseRunningAvdName(''),'');
});
