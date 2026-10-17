'use strict';
const path = require('node:path');
const fs = require('node:fs');
const {spawn} = require('node:child_process');

// Locate the installed Windows executable without passing user-controlled paths
// through a command shell. The CLI 'code' command need not be in PATH.
function vscodeCandidates(env = process.env, platform = process.platform) {
  if (platform !== 'win32') return ['code'];
  const roots = [env.LOCALAPPDATA && path.join(env.LOCALAPPDATA,'Programs'), env.ProgramFiles,env['ProgramFiles(x86)']].filter(Boolean);
  const results=[];
  for (const root of roots) for (const name of ['Microsoft VS Code','Microsoft VS Code Insiders']) {
    results.push(path.join(root,name,name.endsWith('Insiders')?'Code - Insiders.exe':'Code.exe'));
  }
  return results;
}
function findVSCode(env=process.env,platform=process.platform) {
  return vscodeCandidates(env,platform).find(file=>platform==='win32' ? fs.existsSync(file):true) || null;
}
function openVSCodeFolder(folder) {
  const target = findVSCode();
  if (!target) throw new Error('Chưa tìm thấy VS Code. Hãy cài bản User/System của VS Code từ code.visualstudio.com, sau đó thử lại.');
  return new Promise((resolve,reject)=>{
    const child=spawn(target,['--new-window',folder],{detached:true,stdio:'ignore',windowsHide:true,shell:false});
    child.once('error',error=>reject(new Error('Không mở được VS Code: '+error.message)));
    child.once('spawn',()=>{child.unref();resolve(true);});
  });
}
module.exports={vscodeCandidates,findVSCode,openVSCodeFolder};
