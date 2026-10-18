'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const fsp=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const zlib=require('node:zlib');
const {jarContainsWrapperMain,templateEntry,ensureGradleWrapper,jarIsUsable}=require('../src/main/gradle-repair');

function fakeZipWithWrapper(){
 // A valid single-entry ZIP for testing header and directory parsing. No Java
 // bytecode is executed in tests; production uses the real Capacitor template.
 const name=Buffer.from('org/gradle/wrapper/GradleWrapperMain.class');
 const bytes=Buffer.alloc(1024,1);
 const local=Buffer.alloc(30);
 local.writeUInt32LE(0x04034b50,0);
 local.writeUInt16LE(20,4);local.writeUInt16LE(name.length,26);
 local.writeUInt32LE(bytes.length,18);local.writeUInt32LE(bytes.length,22);
 const central=Buffer.alloc(46);
 central.writeUInt32LE(0x02014b50,0);
 central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);
 central.writeUInt32LE(bytes.length,20);central.writeUInt32LE(bytes.length,24);
 central.writeUInt16LE(name.length,28);
 const centralOffset=local.length+name.length+bytes.length;
 const end=Buffer.alloc(22);
 end.writeUInt32LE(0x06054b50,0);
 end.writeUInt16LE(1,8);end.writeUInt16LE(1,10);
 end.writeUInt32LE(central.length+name.length,12);
 end.writeUInt32LE(centralOffset,16);
 return Buffer.concat([local,name,bytes,central,name,end]);
}
function fakeTar(jar){
 const header=Buffer.alloc(512);
 header.write('android/gradle/wrapper/gradle-wrapper.jar');
 header.write(jar.length.toString(8).padStart(11,'0')+'\0',124);
 header[156]=48;
 const pad=Buffer.alloc((512-jar.length%512)%512);
 return Buffer.concat([header,jar,pad,Buffer.alloc(1024)]);
}
async function temporary(fn){
 const root=await fsp.mkdtemp(path.join(os.tmpdir(),'baodroid-repair-'));
 try{return await fn(root);}finally{await fsp.rm(root,{recursive:true,force:true});}
}
test('Gradle ZIP validation checks central directory instead of matching a text substring',()=>{
 const jar=fakeZipWithWrapper();
 assert.equal(jarContainsWrapperMain(jar),true);
 assert.equal(jarContainsWrapperMain(Buffer.from('PK'+('x'.repeat(500))+'org/gradle/wrapper/GradleWrapperMain.class')),false);
 assert.equal(jarContainsWrapperMain(jar.subarray(0,jar.length-22)),false);
});
test('Capacitor tarball contains a recoverable valid Gradle wrapper archive',()=>{
 const jar=fakeZipWithWrapper();
 assert.deepEqual(templateEntry(fakeTar(jar)),jar);
 assert.throws(()=>templateEntry(fakeTar(Buffer.alloc(1400,2))),/template Capacitor bị lỗi/);
});
test('ReelTara generated Android wrapper is repaired once from installed Capacitor CLI assets with original backed up',async()=>temporary(async root=>{
 const android=path.join(root,'android');
 const wrapper=path.join(android,'gradle','wrapper','gradle-wrapper.jar');
 const template=path.join(root,'node_modules','@capacitor','cli','assets','android-template.tar.gz');
 await fsp.mkdir(path.dirname(wrapper),{recursive:true});
 await fsp.mkdir(path.dirname(template),{recursive:true});
 await fsp.writeFile(wrapper,'invalid GradleWrapperMain stub');
 await fsp.writeFile(template,zlib.gzipSync(fakeTar(fakeZipWithWrapper())));
 const logs=[];
 const restored=await ensureGradleWrapper(android,root,'capacitor',{report:x=>logs.push(x)});
 assert.equal(restored.repaired,true);
 assert.equal(jarIsUsable(wrapper),true);
 assert.match(await fsp.readFile(wrapper+'.baodroid-backup','utf8'),/invalid/);
 assert.match(logs.join(' '),/phục hồi|phục hồi|phục hồi|Đã phục hồi/);
 const again=await ensureGradleWrapper(android,root,'capacitor');
 assert.equal(again.repaired,false);
}));
test('Absent Capacitor template reports an actionable error, not a broken Java class',async()=>temporary(async root=>{
 await assert.rejects(ensureGradleWrapper(path.join(root,'android'),root,'capacitor'),/Capacitor CLI/);
 await assert.rejects(ensureGradleWrapper(path.join(root,'android'),root,'gradle'),/dự án native/);
}));
