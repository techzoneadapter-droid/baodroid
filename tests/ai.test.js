'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {AIManager,scanSources,changesBetween,restoreSources,canReadFile,ALLOWED_MODELS}=require('../src/main/ai');

function fixture(fn){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'baodroid-ai-'));
 try{return fn(root);}finally{fs.rmSync(root,{recursive:true,force:true});}
}
test('only source files are included in an editable snapshot',()=>fixture(root=>{
 fs.mkdirSync(path.join(root,'src'));
 fs.mkdirSync(path.join(root,'node_modules'));
 fs.writeFileSync(path.join(root,'src','App.tsx'),'initial');
 fs.writeFileSync(path.join(root,'node_modules','index.js'),'ignored');
 fs.writeFileSync(path.join(root,'.env'),'PRIVATE_KEY=example');
 const snapshot=scanSources(root);
 assert.deepEqual([...snapshot.keys()],['src/App.tsx']);
 assert.equal(canReadFile('.env.production'),false);
 assert.equal(canReadFile('google.keystore'),false);
}));
test('undo restores changed sources without deleting unrelated user work',()=>fixture(root=>{
 fs.writeFileSync(path.join(root,'App.tsx'),'before');
 const before=scanSources(root);
 fs.writeFileSync(path.join(root,'App.tsx'),'after');
 fs.writeFileSync(path.join(root,'NewScreen.tsx'),'new');
 const after=scanSources(root);
 const changes=changesBetween(before,after);
 assert.equal(changes.length,2);
 const undone=restoreSources(root,before,changes);
 assert.equal(undone,2);
 assert.equal(fs.readFileSync(path.join(root,'App.tsx'),'utf8'),'before');
 assert.equal(fs.existsSync(path.join(root,'NewScreen.tsx')),false);
}));
test('undo fails safely when the user edits the file after the AI operation',()=>fixture(root=>{
 fs.writeFileSync(path.join(root,'App.tsx'),'before');
 const before=scanSources(root);
 fs.writeFileSync(path.join(root,'App.tsx'),'AI edit');
 const after=scanSources(root);
 fs.writeFileSync(path.join(root,'App.tsx'),'user newer edit');
 assert.throws(()=>restoreSources(root,before,changesBetween(before,after)),/đã thay đổi/);
 assert.equal(fs.readFileSync(path.join(root,'App.tsx'),'utf8'),'user newer edit');
}));
test('AI sessions are isolated by project slot and cleared when project changes',()=>{
 const config={projects:[{id:'one',path:'C:/one'},{id:'two',path:'C:/two'}],
 slots:[{projectId:'one'},{projectId:'two'},{projectId:null}]};
 const engine={store:{data:config},project(id){return config.projects.find(x=>x.id===id);}};
 const manager=new AIManager(engine,()=>{});
 manager.slot(0).messages.push({role:'user',content:'project one'});
 manager.slot(1).messages.push({role:'user',content:'project two'});
 assert.equal(manager.slot(1).messages.length,1);
 config.slots[0].projectId='two';
 assert.equal(manager.slot(0).messages.length,0);
 assert.equal(manager.slot(1).messages.length,1);
 assert.equal(ALLOWED_MODELS.includes('invalid-model'),false);
});
