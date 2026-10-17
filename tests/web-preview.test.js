'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {detectProject}=require('../src/shared/project');
const {WebPreviewManager,isWebKind,portForSlot}=require('../src/main/web-preview');
function fixture(fn){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'baodroid-preview-'));
 try{return fn(root);}finally{fs.rmSync(root,{recursive:true,force:true});}
}
test('ReelTara-like Vite React project starts in Web Mobile Preview mode',()=>fixture(root=>{
 fs.writeFileSync(path.join(root,'package.json'),JSON.stringify({name:'reeltara',scripts:{dev:'vite --host 0.0.0.0'},devDependencies:{vite:'^6.0.0'},dependencies:{react:'^19.0.0'}}));
 fs.writeFileSync(path.join(root,'index.html'),'<html></html>');
 assert.equal(detectProject(root),'web');
 assert.equal(isWebKind('web'),true);
}));
test('CHUONG-like Expo managed without android folder is supported as Expo Web preview',()=>fixture(root=>{
 fs.writeFileSync(path.join(root,'package.json'),JSON.stringify({name:'chuong',main:'expo-router/entry',dependencies:{expo:'~54.0.20','react-native':'0.81.5'},scripts:{dev:'expo start --web'}}));
 fs.writeFileSync(path.join(root,'app.json'),JSON.stringify({expo:{slug:'chuong'}}));
 assert.equal(detectProject(root),'expo-web');
 assert.equal(isWebKind('expo-web'),true);
}));
test('native Gradle remains native and does not pretend to be web',()=>fixture(root=>{
 fs.mkdirSync(path.join(root,'app'));
 fs.writeFileSync(path.join(root,'settings.gradle.kts'),'');
 assert.equal(detectProject(root),'gradle');
 assert.equal(isWebKind('gradle'),false);
}));
test('each project gets a different fixed local preview port',()=>{
 assert.deepEqual([0,1,2].map(portForSlot),[43120,43121,43122]);
});
test('missing dependencies report an actionable error without accessing Android SDK',()=>fixture(root=>{
 fs.writeFileSync(path.join(root,'package.json'),JSON.stringify({scripts:{dev:'vite'},devDependencies:{vite:'^6'}}));
 const data={projects:[{id:'p',kind:'web',name:'ReelTara',path:root}],slots:[{projectId:'p'}]};
 const devices=[{status:'off'}];
 const engine={devices,store:{data},project(id){return data.projects.find(p=>p.id===id);},update(i,v){Object.assign(devices[i],v);},log(){}};
 const manager=new WebPreviewManager(engine);
 assert.equal(manager.start(0),false);
 assert.equal(devices[0].status,'error');
 assert.match(devices[0].message,/Cài thư viện/);
 manager.dispose();
}));
