'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {apkDetails,packageInstalled,launchSucceeded,launcherComponent}=require('../src/main/apk-launch');
const {findNodeScriptCommand}=require('../src/main/process');

test('reads actual package & launch activity from final APK badging, not source Gradle',()=>{
 const info=apkDetails("package: name='dev.baodroid.preview.reeltara.debug' versionCode='1' versionName='1.0'\nlaunchable-activity: name='dev.baodroid.preview.reeltara.MainActivity'  label='ReelTara'");
 assert.equal(info.id,'dev.baodroid.preview.reeltara.debug');
 assert.equal(info.activity,'dev.baodroid.preview.reeltara.MainActivity');
 assert.equal(launcherComponent(info.id,info.activity),'dev.baodroid.preview.reeltara.debug/dev.baodroid.preview.reeltara.MainActivity');
 assert.equal(launcherComponent('com.example.app','.MainActivity'),'com.example.app/com.example.app.MainActivity');
});
test('Android install and launch require affirmative evidence, not just successful shell exit',()=>{
 assert.equal(packageInstalled('package:dev.baodroid.preview.reeltara\n','dev.baodroid.preview.reeltara'),true);
 assert.equal(packageInstalled('package:dev.baodroid.preview.reeltara.debug\n','dev.baodroid.preview.reeltara'),false);
 assert.equal(packageInstalled('package:/data/app/~~abc/base.apk','dev.baodroid.preview.reeltara'),false);
 assert.equal(launchSucceeded('Starting: Intent { cmp=dev.baodroid/.MainActivity }\nStatus: ok'),true);
 assert.equal(launchSucceeded('Events injected: 1'),true);
 assert.equal(launchSucceeded('Error type 3\nActivity class does not exist.'),false);
 assert.equal(launchSucceeded('No activities found to run, monkey aborted'),false);
 assert.equal(launchSucceeded(''),false);
});
test('Node/npm commands on Windows prefer direct node.exe scripts with spaces, bypassing cmd quoting',()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'baodroid-node-cli-'));
 try{
  const root=path.join(tmp,'Chương App','nodejs');
  const bin=path.join(root,'node_modules','npm','bin');
  fs.mkdirSync(bin,{recursive:true});
  fs.writeFileSync(path.join(root,'node.exe'),'fixture');
  fs.writeFileSync(path.join(bin,'npm-cli.js'),'fixture');
  fs.writeFileSync(path.join(bin,'npx-cli.js'),'fixture');
  const env={ProgramFiles:path.join(tmp,'not-installed'),PATH:root};
  const npm=findNodeScriptCommand('npm',env,'win32');
  const npx=findNodeScriptCommand('npx',env,'win32');
  assert.equal(npm.shell,false);assert.equal(npx.shell,false);
  assert.equal(npm.cmd,path.join(root,'node.exe'));
  assert.deepEqual(npx.preArgs,[path.join(bin,'npx-cli.js')]);
 }finally{fs.rmSync(tmp,{recursive:true,force:true});}
});
test('No linked app should be considered installed or launched without a package identifier',()=>{
 assert.deepEqual(apkDetails('unrecognised'),{id:'',activity:''});
 assert.equal(packageInstalled('package:foo.bar',null),false);
 assert.throws(()=>launcherComponent('bad-package','com.foo.Activity'),/applicationId/);
});
test('restored old-style UI keeps current controls and collapsible sidebars',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../src/renderer/index.html'),'utf8');
 const app=fs.readFileSync(path.join(__dirname,'../src/renderer/app.js'),'utf8');
 const css=fs.readFileSync(path.join(__dirname,'../src/renderer/styles.css'),'utf8');
 for(const needle of ['id="left-panel"','id="right-panel"','id="toggle-left"','id="toggle-right"','id="device-grid"','id="btn-update"','id="log-panel"','id="nav-running"'])assert.ok(html.includes(needle),needle);
 assert.match(app,/function setupSidebars\(\)/);
 assert.match(app,/left-collapsed/);
 assert.match(app,/data-native-slot/);
 assert.match(app,/data-web-slot/);
 assert.match(app,/data-recover-slot/);
 assert.match(app,/data-install-slot/);
 assert.match(app,/data-code-slot/);
 assert.match(app,/data-project-slot/);
 assert.match(app,/let view='all';/);
 assert.match(css,/\.workspace-shell\.left-collapsed\.right-collapsed/);
 assert.match(css,/grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
});
