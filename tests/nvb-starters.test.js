'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {createNvbStarterProjects}=require('../src/main/nvb-starters');
const {detectProject}=require('../src/shared/project');
function mock(){
 const projects=[];
 const engine={store:{data:{projects}},addProject(folder){const kind=detectProject(folder);const p={id:String(projects.length),name:path.basename(folder),path:folder,kind};projects.push(p);return p;}};
 return engine;
}
test('creates two discoverable app directories and respects repeat calls',()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'nvb-starters-'));
 try{
 const engine=mock();
 const first=createNvbStarterProjects(engine,tmp);
 assert.equal(first.created.length,2);
 assert.equal(engine.store.data.projects.length,2);
 for(const p of first.created){assert.equal(p.name==='Neon Arrow'||p.name==='WavePlay',true);assert.equal(detectProject(p.path),'web');assert.ok(fs.existsSync(path.join(p.path,'index.html')));}
 const second=createNvbStarterProjects(engine,tmp);
 assert.equal(second.created.length,0);
 assert.equal(engine.store.data.projects.length,2);
 }finally{fs.rmSync(tmp,{recursive:true,force:true});}
});
test('does not overwrite an existing user folder',()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'nvb-safe-'));
 try{
 const dest=path.join(tmp,'NVB_IAA_Apps','NeonArrow');fs.mkdirSync(dest,{recursive:true});
 fs.writeFileSync(path.join(dest,'user-file.txt'),'keep');
 assert.throws(()=>createNvbStarterProjects(mock(),tmp),/không ghi đè/);
 assert.equal(fs.readFileSync(path.join(dest,'user-file.txt'),'utf8'),'keep');
 }finally{fs.rmSync(tmp,{recursive:true,force:true});}
});
test('requires two project slots before creating anything',()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'nvb-slots-'));
 try{
 const engine=mock();engine.store.data.projects.push({id:'existing',path:path.join(tmp,'Other'),name:'Other'});
 engine.store.data.projects.push({id:'existing2',path:path.join(tmp,'Other2'),name:'Other2'});
 assert.throws(()=>createNvbStarterProjects(engine,tmp),/vị trí dự án còn trống/);
 assert.equal(fs.existsSync(path.join(tmp,'NVB_IAA_Apps')),false);
 }finally{fs.rmSync(tmp,{recursive:true,force:true});}
});
