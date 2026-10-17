'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {detectProject,readApplicationId,findDebugApk}=require('../src/shared/project');
const {Store}=require('../src/main/store');
function fixture(fn){const root=fs.mkdtempSync(path.join(os.tmpdir(),'baodroid-'));try{return fn(root);}finally{fs.rmSync(root,{recursive:true,force:true});}}
test('detects native Android Gradle Kotlin DSL',()=>fixture(dir=>{fs.writeFileSync(path.join(dir,'settings.gradle.kts'),'');fs.mkdirSync(path.join(dir,'app'));assert.equal(detectProject(dir),'gradle');}));
test('detects Flutter app',()=>fixture(dir=>{fs.writeFileSync(path.join(dir,'pubspec.yaml'),'name: demo');fs.mkdirSync(path.join(dir,'android'));assert.equal(detectProject(dir),'flutter');}));
test('rejects unknown project',()=>fixture(dir=>{assert.throws(()=>detectProject(dir),/Không tìm thấy/);}));
test('reads native applicationId',()=>fixture(dir=>{fs.mkdirSync(path.join(dir,'app'));fs.writeFileSync(path.join(dir,'app','build.gradle.kts'),'defaultConfig { applicationId = "dev.example.app" }');assert.equal(readApplicationId(dir,'gradle'),'dev.example.app');}));
test('finds debug APK',()=>fixture(dir=>{const out=path.join(dir,'app','build','outputs','apk','debug');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'app-debug.apk'),'test');assert.equal(findDebugApk(dir),path.join(out,'app-debug.apk'));}));
test('settings store uses exactly 3 slots',()=>fixture(dir=>{const store=new Store(dir);assert.equal(store.data.slots.length,3);store.data.settings.autoBuild=false;store.save();assert.equal(new Store(dir).data.settings.autoBuild,false);}));

test('detects React Native root project and resolves android Gradle folder',()=>fixture(dir=>{
  const {gradleRoot}=require('../src/shared/project');
  const android=path.join(dir,'android');fs.mkdirSync(path.join(android,'app'),{recursive:true});
  fs.writeFileSync(path.join(android,'settings.gradle'),'rootProject.name="Demo"');
  fs.writeFileSync(path.join(dir,'package.json'),JSON.stringify({dependencies:{'react-native':'0.80.0'}}));
  assert.equal(detectProject(dir),'react-native');
  assert.equal(gradleRoot(dir,'react-native'),android);
}));
test('reads React Native applicationId from nested Android Gradle project',()=>fixture(dir=>{
  const app=path.join(dir,'android','app');fs.mkdirSync(app,{recursive:true});
  fs.writeFileSync(path.join(app,'build.gradle'),'android { defaultConfig { applicationId "dev.example.mobile" }}');
  assert.equal(readApplicationId(dir,'react-native'),'dev.example.mobile');
}));
