'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const fsp=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const net=require('node:net');
const {emulatorEnvironment,consoleListening,findAvdDir,avdLockStatus,hasQuickBootSnapshot,emulatorHealth,diagnostics}=require('../src/main/androidbox-runtime');
const {bootReport}=require('../src/main/boot-policy');
async function fixture(fn){
 const root=await fsp.mkdtemp(path.join(os.tmpdir(),'baodroid-androidbox-'));
 try{return await fn(root);}finally{await fsp.rm(root,{recursive:true,force:true});}
}
test('androidbox adapter always uses the existing Google Android SDK (no separate USB runtime)',()=>{
 const env=emulatorEnvironment('D:\\Android\\Sdk',{Path:'C:\\Tools'});
 assert.equal(env.ANDROID_HOME,'D:\\Android\\Sdk');
 assert.equal(env.ANDROID_SDK_ROOT,'D:\\Android\\Sdk');
 assert.equal(env.Path,'C:\\Tools');
});
test('detects AVD folder and existing quick boot snapshots without changing any files',()=>fixture(async root=>{
 const home=path.join(root,'.android');
 const avdHome=path.join(home,'avd');
 const dir=path.join(avdHome,'ReelTara.avd');
 await fsp.mkdir(path.join(dir,'snapshots','default_boot'),{recursive:true});
 await fsp.writeFile(path.join(avdHome,'ReelTara.ini'),'avd.ini.encoding=UTF-8\npath='+dir+'\n');
 assert.equal(findAvdDir('ReelTara',{USERPROFILE:root}),dir);
 assert.equal(hasQuickBootSnapshot(dir),true);
 assert.equal(findAvdDir('../../something',{USERPROFILE:root}),null);
}));
test('reads QEMU lock owner without deleting the AVD or killing any process',()=>fixture(async root=>{
 const dir=path.join(root,'ReelTara.avd');
 const lock=path.join(dir,'hardware-qemu.ini.lock');
 await fsp.mkdir(lock,{recursive:true});
 await fsp.writeFile(path.join(lock,'pid'),'1234');
 const dead=avdLockStatus(dir,pid=>pid===999);
 assert.deepEqual(dead,{present:true,alive:false,pid:1234});
 assert.match(diagnostics({consoleReady:false,port:5554,lock:dead}),/Không tự xoá lock/);
 const alive=avdLockStatus(dir,pid=>pid===1234);
 assert.equal(alive.alive,true);
 assert.equal(fs.existsSync(lock),true);
}));
test('console probe distinguishes a live QEMU console from ADB device not listed',async()=>{
 const server=net.createServer(socket=>socket.end());
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const port=server.address().port;
 try{
   assert.equal(await consoleListening(port),true);
   const status=await emulatorHealth({avd:'NonExistent',port,probe:consoleListening});
   assert.equal(status.consoleReady,true);
   assert.match(diagnostics(status),/QEMU đang chạy/);
   assert.match(bootReport({waitedMs:125000,adbState:'not listed',consoleReady:true}),/QEMU đã mở cổng console/);
 }finally{await new Promise(resolve=>server.close(resolve));}
});
test('backend uses Androidbox-inspired console health probing to extend a live QEMU boot rather than quitting at 55s',()=>{
 const engine=fs.readFileSync(path.join(__dirname,'../src/main/engine.js'),'utf8');
 assert.ok(engine.includes('consoleSeen=consoleSeen||health.consoleReady'));
 assert.match(engine,/!seen && !consoleSeen && elapsed>=ADB_DISCOVERY_TIMEOUT_MS/);
 assert.ok(engine.includes('emulatorEnvironment(this.store.data.settings.sdkPath)'));
 assert.ok(engine.includes('emulatorHealth({avd:assigned.avd,port})'));
 assert.match(engine,/'-no-metrics'/);
});
