'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {candidates,resolveCommand,launchOptions}=require('../src/main/codex-tools');

test('Codex CLI resolves the standard per-user Windows npm installation',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'bd-codex-'));
  try{
    const dir=path.join(root,'npm');fs.mkdirSync(dir);
    const exe=path.join(dir,'codex.cmd');fs.writeFileSync(exe,'@echo off\r\n');
    const env={APPDATA:root};
    assert.ok(candidates('codex',env,'win32').includes(exe));
    assert.equal(resolveCommand('codex',env,'win32'),exe);
  }finally{fs.rmSync(root,{force:true,recursive:true});}
});
test('Codex CLI has fallback for Windows PATH and non-Windows systems',()=>{
  assert.equal(resolveCommand('codex',{},'win32'),'codex.cmd');
  assert.equal(resolveCommand('codex',{},'linux'),'codex');
  assert.equal(launchOptions('C:/my project',{},'win32').shell,true);
  assert.equal(launchOptions('/tmp/my project',{},'linux').shell,false);
});
test('renderer keeps unchanged web preview frames instead of replacing cards on status events',()=>{
  const app=fs.readFileSync(path.join(__dirname,'../src/renderer/app.js'),'utf8');
  assert.match(app,/renderedKeys\[i\]!==key/);
  assert.match(app,/if\(current\)current\.replaceWith\(newCard\)/);
  assert.match(app,/data-focus-slot/);
  assert.doesNotMatch(app,/grid\.innerHTML=\[0,1,2\]\.map/);
});
test('ChatGPT integration includes both login modes and explicit CLI installation',()=>{
  const code=fs.readFileSync(path.join(__dirname,'../src/main/ai.js'),'utf8');
  assert.match(code,/--device-auth/);
  assert.match(code,/@openai\/codex/);
  assert.match(code,/model!=='auto'/);
  assert.match(code,/resolveCommand\('codex'\)/);
});
