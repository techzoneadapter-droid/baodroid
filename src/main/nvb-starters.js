'use strict';
const fs=require('node:fs');
const path=require('node:path');
const TEMPLATES=Object.freeze([{dir:'NeonArrow',label:'Neon Arrow'},{dir:'WavePlay',label:'WavePlay'}]);
function createNvbStarterProjects(engine,documents,templatesRoot=path.join(__dirname,'../templates')){
  if(!engine?.store?.data?.projects||!path.isAbsolute(documents))throw new Error('Không xác định được nơi lưu dự án.');
  const folder=path.resolve(documents,'NVB_IAA_Apps');
  const existing=engine.store.data.projects;
  const needed=TEMPLATES.filter(({dir})=>!existing.some(p=>path.resolve(p.path).toLowerCase()===path.join(folder,dir).toLowerCase()));
  if(!needed.length)return {folder,created:[],message:'Hai dự án đã được kết nối.'};
  if(needed.length>3-existing.length)throw new Error('Bạn cần '+needed.length+' vị trí dự án còn trống. Dừng và gỡ dự án không dùng khỏi Baodroid (không xóa thư mục code) rồi thử lại.');
  // Validate all targets before changing disk to keep pre-existing user files safe.
  for(const {dir} of needed){
    const destination=path.join(folder,dir);
    const src=path.join(templatesRoot,dir);
    if(!fs.existsSync(src)||!fs.existsSync(path.join(src,'package.json')))throw new Error('Bộ cài thiếu mẫu dự án '+dir+'.');
    if(fs.existsSync(destination)){
      if(!fs.existsSync(path.join(destination,'.baodroid-nvb-template')))
        throw new Error('Thư mục '+destination+' đã tồn tại. Baodroid không ghi đè thư mục của bạn.');
      if(!fs.existsSync(path.join(destination,'package.json')))
        throw new Error('Dự án '+destination+' thiếu package.json; hãy sửa thư mục trước khi kết nối.');
    }
  }
  fs.mkdirSync(folder,{recursive:true});
  const created=[];
  for(const {dir,label} of needed){
    const src=path.join(templatesRoot,dir),destination=path.join(folder,dir);
    if(!fs.existsSync(destination))fs.cpSync(src,destination,{recursive:true,force:false,errorOnExist:true});
    engine.addProject(destination);
    created.push({name:label,path:destination});
  }
  return {folder,created};
}
module.exports={createNvbStarterProjects,TEMPLATES};
