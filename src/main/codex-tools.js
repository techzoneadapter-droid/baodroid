'use strict';
const fs=require('node:fs');
const path=require('node:path');

function candidates(name,env=process.env,platform=process.platform){
  const win=platform==='win32';
  const suffix=win?'.cmd':'';
  const result=[];
  const push=p=>{if(p&&!result.includes(p))result.push(p);};
  if(win){
    if(env.APPDATA)push(path.join(env.APPDATA,'npm',name+suffix));
    if(env.ProgramFiles)push(path.join(env.ProgramFiles,'nodejs',name+suffix));
    if(env.LOCALAPPDATA)push(path.join(env.LOCALAPPDATA,'Programs','nodejs',name+suffix));
  }
  for(const dir of String(env.Path||env.PATH||'').split(path.delimiter).filter(Boolean)){
    push(path.join(dir,name+suffix));
    if(win)push(path.join(dir,name+'.exe'));
  }
  if(!win)push('/usr/local/bin/'+name);
  return result;
}
function resolveCommand(name,env=process.env,platform=process.platform){
  const found=candidates(name,env,platform).find(p=>{
    try{return fs.statSync(p).isFile();}catch{return false;}
  });
  return found||name+(platform==='win32'?'.cmd':'');
}
function launchOptions(cwd,env=process.env,platform=process.platform){
  return {cwd,windowsHide:true,shell:platform==='win32',env,stdio:['pipe','pipe','pipe']};
}
module.exports={candidates,resolveCommand,launchOptions};
