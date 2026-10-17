'use strict';
const fs=require('node:fs');
const path=require('node:path');

const GENERATED=/(^|\/)(?:node_modules|\.git|\.gradle|\.dart_tool|\.idea|\.next|\.expo|\.vscode|build|dist|coverage|\.cxx|\.turbo|out)(?:\/|$)/i;
const GENERATED_FILE=/(^|\/)(?:tsconfig(?:\.[^/]*)?\.tsbuildinfo|\.DS_Store|\.gradle\b)(?:$|\/)/i;
const CONFIG=/^(?:index\.html|package\.json|vite\.config\.(?:js|ts|mjs|mts)|capacitor\.config\.(?:json|js|ts)|tsconfig(?:\.[^/]*)?\.json)$/i;
const SOURCE_ROOTS=['src','public','app','pages','components','assets','lib','hooks','styles'];
const WATCH_DIRS=new Set(SOURCE_ROOTS);
function normalRelative(root,filepath){
 const relative=path.relative(root,filepath).replace(/\\/g,'/');
 if(!relative||relative==='.'||relative.startsWith('../')||relative.startsWith('/')||/^[a-zA-Z]:/.test(relative))return '';
 return relative;
}
function shouldSyncChange(project,filepath){
 const rel=normalRelative(project.path,filepath);
 if(!rel||GENERATED.test(rel)||GENERATED_FILE.test(rel))return false;
 if(project.kind==='capacitor'){
   // cap sync rewrites android/, including AndroidManifest/Gradle source. These
   // files must NEVER trigger another cap sync and an endless APK rebuild.
   if(rel.startsWith('android/'))return false;
   if(CONFIG.test(rel))return true;
   const directory=rel.split('/')[0];
   return WATCH_DIRS.has(directory)&&rel.includes('/');
 }
 if(project.kind==='react-native'&&rel.startsWith('android/')){
   return /^android\/(?:app\/src\/|app\/build\.gradle(?:\.kts)?$|build\.gradle(?:\.kts)?$|settings\.gradle(?:\.kts)?$|gradle\.properties$)/i.test(rel);
 }
 return true;
}
function watchTargets(project) {
 if(project.kind!=='capacitor')return [project.path];
 const dirs=SOURCE_ROOTS.map(dir=>path.join(project.path,dir));
 const files=['index.html','package.json','vite.config.ts','vite.config.js','vite.config.mts','vite.config.mjs',
  'capacitor.config.ts','capacitor.config.js','capacitor.config.json','tsconfig.json','tsconfig.app.json']
  .map(file=>path.join(project.path,file));
 // Watching only source folders rather than project root prevents Windows
 // EPERM errors from generated native build outputs and Gradle cache folders.
 return [...dirs,...files].filter(p=>{
   try{return fs.existsSync(p);}catch{return false;}
 });
}
module.exports={shouldSyncChange,watchTargets,normalRelative};
