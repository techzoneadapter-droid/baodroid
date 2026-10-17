'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {vscodeCandidates,findVSCode}=require('../src/main/vscode');
test('looks for VS Code in per-user and machine installations',()=>{
  const items=vscodeCandidates({LOCALAPPDATA:'C:\\Users\\alex\\AppData\\Local',ProgramFiles:'C:\\Program Files'},'win32');
  assert.equal(items.length,4);
  assert.ok(items.some(x=>x.endsWith(path.join('Microsoft VS Code','Code.exe'))));
  assert.ok(items.some(x=>x.endsWith('Code - Insiders.exe')));
});
test('provides non-Windows command fallback',()=>{assert.equal(findVSCode({},'linux'),'code');});
