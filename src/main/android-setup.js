'use strict';
/* Official Android SDK installer + per-slot AVD provisioning. Only invoked after
 * explicit user confirmation. SDK is shared; AVDs are independent. */
const fs=require('node:fs');
const fsp=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const https=require('node:https');
const {spawn}=require('node:child_process');
const {exec,sdkRoot,toolsForSdk}=require('./process');
const IMAGE='system-images;android-35;google_apis;x86_64';
const PACKAGES=['platform-tools','emulator','platforms;android-35','platforms;android-36','build-tools;35.0.0','build-tools;36.0.0',IMAGE];
const SOURCE='https://dl.google.com/android/repository/repository2-1.xml';
function findJava(env=process.env){
 const options=[env.JAVA_HOME,
  env.ProgramFiles&&path.join(env.ProgramFiles,'Android','Android Studio','jbr'),
  env.LOCALAPPDATA&&path.join(env.LOCALAPPDATA,'Programs','Android Studio','jbr')
 ].filter(Boolean);
 for(const dir of options)if(fs.existsSync(path.join(dir,'bin','java.exe')))return dir;
 return null;
}
function pickSdkRoot(settings,env=process.env){
 const preferred=settings.sdkPath||sdkRoot('');
 if(preferred && fs.existsSync(preferred))return path.resolve(preferred);
 const existing=env.LOCALAPPDATA&&path.join(env.LOCALAPPDATA,'Android','Sdk');
 if(existing && fs.existsSync(existing))return existing;
 return path.join(env.LOCALAPPDATA||os.homedir(),'Baodroid','Android','Sdk');
}
function extractWindowsArchiveUrl(xml){
 const match=Array.from(xml.matchAll(/commandlinetools-win-(\d+)_latest\.zip/g))
   .sort((a,b)=>Number(b[1])-Number(a[1]))[0];
 if(!match)throw new Error('Không tìm thấy Command-line Tools Windows trong danh mục chính thức của Google.');
 return 'https://dl.google.com/android/repository/'+match[0];
}
async function fetchText(url,maxBytes=18*1024*1024){
 return new Promise((resolve,reject)=>{
  let bytes=0,data='';
  https.get(url,{timeout:30000},res=>{
   if(res.statusCode!==200){res.resume();reject(new Error('Google SDK HTTP '+res.statusCode));return;}
   res.setEncoding('utf8');
   res.on('data',chunk=>{bytes+=Buffer.byteLength(chunk);if(bytes>maxBytes){res.destroy();reject(new Error('Metadata SDK quá lớn'));}else data+=chunk;});
   res.on('end',()=>resolve(data));res.on('error',reject);
  }).on('error',reject);
 });
}
async function downloadOfficial(url,destination,onProgress){
 if(!/^https:\/\/dl\.google\.com\/android\/repository\/commandlinetools-win-\d+_latest\.zip$/.test(url))
  throw new Error('Địa chỉ tải Android SDK không hợp lệ.');
 await fsp.mkdir(path.dirname(destination),{recursive:true});
 return new Promise((resolve,reject)=>{
  const request=https.get(url,{timeout:90000},res=>{
   if(res.statusCode!==200){res.resume();reject(new Error('Không tải được Android SDK: HTTP '+res.statusCode));return;}
   const length=Number(res.headers['content-length']||0);let done=0;
   const writer=fs.createWriteStream(destination,{flags:'wx'});
   res.on('data',chunk=>{done+=chunk.length;if(done>400*1024*1024){res.destroy(new Error('File SDK vượt quá giới hạn cho phép'));return;}if(onProgress&&length)onProgress(Math.round(done/length*100));});
   res.on('error',reject);writer.on('error',reject);
   writer.on('finish',resolve);res.pipe(writer);
  });
  request.on('error',reject);
 });
}
const psString=s=>"'"+String(s).replace(/'/g,"''")+"'";
function run(command,args,{cwd,env=process.env,input='',timeout=20*60*1000,onLine=()=>{}}={}){
 return new Promise((resolve,reject)=>{
  const child=spawn(command,args,{cwd,env,windowsHide:true,shell:process.platform==='win32'&&/\.bat$|\.cmd$/i.test(command),stdio:['pipe','pipe','pipe']});
  let output='',settled=false;
  const timer=setTimeout(()=>{child.kill();end(new Error('Hết thời gian chờ khi chuẩn bị Android.'));},timeout);
  function end(error){if(settled)return;settled=true;clearTimeout(timer);error?reject(error):resolve(output);}
  const watch=stream=>{
   let buf='';
   stream.on('data',chunk=>{
    buf+=chunk.toString('utf8');
    if(buf.length>150000)buf=buf.slice(-50000);
    const lines=buf.split(/\r?\n/);buf=lines.pop()||'';
    for(const line of lines){output=(output+'\n'+line).slice(-2500);if(line.trim())onLine(line.trim());}
   });
  };
  watch(child.stdout);watch(child.stderr);
  child.once('error',err=>end(new Error('Không chạy được '+path.basename(command)+': '+err.message)));
  child.once('close',code=>code===0?end():end(new Error(path.basename(command)+' thất bại (exit '+code+'): '+output.slice(-700))));
  child.stdin.on('error',()=>{});
  child.stdin.end(input);
 });
}
async function ensureTools(root,progress) {
 const cli=path.join(root,'cmdline-tools','latest','bin','sdkmanager.bat');
 if(fs.existsSync(cli))return cli;
 progress('Đang tìm bản Android Command-line Tools mới nhất từ Google…');
 let url;
  try{url=extractWindowsArchiveUrl(await fetchText(SOURCE,32*1024*1024));}
  catch(error){
   progress('Danh mục SDK chưa trả về công cụ, đang lấy đường dẫn từ trang Android Developers…');
   const studio=await fetchText('https://developer.android.com/studio',10*1024*1024);
   url=extractWindowsArchiveUrl(studio);
  }
 const temp=await fsp.mkdtemp(path.join(os.tmpdir(),'baodroid-sdk-'));
 try{
  const zip=path.join(temp,'tools.zip'),extract=path.join(temp,'unpacked');
  progress('Đang tải bộ công cụ SDK chính thức…');
  await downloadOfficial(url,zip,p=>progress('Tải Android Command-line Tools: '+p+'%'));
  progress('Đang giải nén Android Command-line Tools…');
  const destination=path.join(root,'cmdline-tools','latest');
  await fsp.mkdir(path.dirname(destination),{recursive:true});
  const script='$ErrorActionPreference="Stop"; Expand-Archive -LiteralPath '+psString(zip)+' -DestinationPath '+psString(extract)+' -Force;'+
   'if(!(Test-Path '+psString(path.join(extract,'cmdline-tools','bin','sdkmanager.bat'))+')){throw "SDK archive invalid"};'+
   'Move-Item -LiteralPath '+psString(path.join(extract,'cmdline-tools'))+' -Destination '+psString(destination);
  await run('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{timeout:90000});
  if(!fs.existsSync(cli))throw new Error('Không tìm thấy sdkmanager sau khi giải nén.');
  return cli;
 }finally{await fsp.rm(temp,{recursive:true,force:true});}
}
function avdName(slot){if(!Number.isInteger(slot)||slot<0||slot>2)throw new Error('Vị trí preview không hợp lệ.');return 'Baodroid_Preview_'+(slot+1);}
class AndroidSetup {
 constructor(engine,emit){
  this.engine=engine;this.emit=emit;this.busy=false;
 }
 message(slot,text,step='installing'){
  this.engine.log(text,'info',slot);
  this.emit('sdk-setup',{slot,step,message:text});
 }
 async initialize(slot){
  if(this.busy)throw new Error('SDK/AVD đang được cài. Vui lòng đợi thao tác hiện tại.');
  if(!Number.isInteger(slot)||slot<0||slot>2)throw new Error('Vị trí không hợp lệ.');
  const entry=this.engine.store.data.slots[slot];
  if(!entry.projectId)throw new Error('Chọn thư mục dự án trước khi tạo Android.');
  this.busy=true;
  try{
   const root=pickSdkRoot(this.engine.store.data.settings);
   this.message(slot,'Đang sử dụng SDK chung: '+root);
   await fsp.mkdir(root,{recursive:true});
   const java=findJava();
   if(java){process.env.JAVA_HOME=java;this.message(slot,'Đã nhận diện Java/JDK từ '+java);}
   const cli=await ensureTools(root,text=>this.message(slot,text));
   const env={...process.env,ANDROID_HOME:root,ANDROID_SDK_ROOT:root};
   const cliArgs=['--sdk_root='+root];
   this.message(slot,'Đang kiểm tra giấy phép Android SDK…');
   await run(cli,[...cliArgs,'--licenses'],{env,input:'y\n'.repeat(200),timeout:180000,onLine:line=>{
    if(/licens|accepted/i.test(line))this.message(slot,line.slice(0,180));
   }});
   this.message(slot,'Đang cài Android Emulator, API 35, platform tools và system image. Có thể mất vài phút…');
   await run(cli,[...cliArgs,'--install',...PACKAGES],{
    env,input:'y\n'.repeat(80),timeout:45*60*1000,
    onLine:line=>{
     if(/\b\d+%|Warning:|Error:|Downloading|Installing/i.test(line))this.message(slot,line.slice(-170));
    }
   });
   const binaries=toolsForSdk(root);
   if(!fs.existsSync(binaries.adb)||!fs.existsSync(binaries.emulator))throw new Error('Không tìm thấy adb.exe hoặc emulator.exe sau cài đặt.');
   this.engine.configure({sdkPath:root});
   const avd=avdName(slot);
   const current=await this.engine.listAvds();
   if(!current.includes(avd)){
     const manager=path.join(root,'cmdline-tools','latest','bin','avdmanager.bat');
     this.message(slot,'Đang tạo máy Android ảo '+avd+' (Pixel, API 35)…');
     await run(manager,['create','avd','-n',avd,'-k',IMAGE,'-d','pixel_6','-c','512M'],{
       env,input:'no\n',timeout:180000,onLine:line=>this.message(slot,line.slice(-170))
     });
   }else this.message(slot,'AVD '+avd+' đã tồn tại, sẽ dùng lại.');
   const assigned=this.engine.store.data.slots[slot];
   assigned.avd=avd;
   this.engine.changed();
   this.message(slot,'SDK & AVD đã sẵn sàng. Chuẩn bị ứng dụng Android…','ready');
   return {sdkPath:root,avd};
  } catch(e){
   this.message(slot,'Lỗi khởi tạo SDK/AVD: '+e.message,'error');
   throw e;
  } finally{this.busy=false;}
 }
}
module.exports={AndroidSetup,avdName,pickSdkRoot,extractWindowsArchiveUrl,findJava,run};
