'use strict';
const {app, BrowserWindow, ipcMain, dialog, shell} = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const {Store} = require('./store');
const {Engine} = require('./engine');
const {UpdateManager} = require('./update');
const {AIManager} = require('./ai');
const {WebPreviewManager} = require('./web-preview');
const {AndroidSetup} = require('./android-setup');
const {NativeProjectPreparation} = require('./native-project');
let win, engine, updater, ai, webPreview, androidSetup, nativeProject;
if (!app.requestSingleInstanceLock()) app.quit();
else app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
function send(topic, data) { if (win && !win.isDestroyed()) win.webContents.send(topic, data); }
async function chooseFolder(options = {}) {
  const response = await dialog.showOpenDialog(win, {properties:['openDirectory'], title:options.title || 'Chọn thư mục', defaultPath: options.defaultPath});
  return response.canceled ? null : response.filePaths[0];
}
function registerHandlers() {
  const register = (name, fn) => ipcMain.handle(name, async (_event, ...args) => {
    try { return {ok: true, data: await fn(...args)}; }
    catch (error) { engine.log(`Lỗi: ${error.message}`, 'error'); return {ok:false, error: error.message}; }
  });
  register('get-state', () => engine.snapshot());
  register('add-project', async () => { const folder = await chooseFolder({title:'Chọn thư mục dự án Android / Flutter / React Native'}); return folder ? engine.addProject(folder) : null; });
  register('remove-project', (id) => {
    for(let i=0;i<3;i++)if(engine.store.data.slots[i].projectId===id && ai.isBusy(i))throw new Error('AI đang sửa dự án này. Hãy dừng tác vụ trước khi xóa.');
    return engine.removeProject(id);
  });
  register('assign-project', (slot, projectId) => {
    if(ai.isBusy(slot))throw new Error('AI đang sửa code cho máy này. Hãy dừng tác vụ trước khi đổi dự án.');
    return engine.assignProject(slot,projectId);
  });
  register('assign-avd', (slot, avd) => engine.assignAvd(slot, avd));
  register('list-avds', () => engine.listAvds());
  register('install-web-deps', (slot) => webPreview.installDependencies(slot));
  register('initialize-native', async slot => {
    engine.requireSlot(slot);
    const assigned=engine.store.data.slots[slot];
    if(!assigned.projectId)throw new Error('Hãy chọn thư mục dự án trước.');
    if(ai.isBusy(slot))throw new Error('AI đang chỉnh code cho dự án này. Hãy đợi tác vụ kết thúc.');
    const project=engine.project(assigned.projectId);
    if(assigned.nativeMode)return {alreadyReady:true};
    const info='Baodroid sẽ dùng Android SDK chung, tải Android Emulator và system image từ Google (có thể tốn vài GB), '+
      'tạo AVD riêng cho máy này. Bạn cần đồng ý điều khoản Android SDK được công bố tại developer.android.com/studio/terms.\n\n'+
      (['web','expo-web'].includes(project.kind)?
       'Dự án '+project.name+' sẽ được chuẩn bị bản Android native (Expo prebuild hoặc Capacitor). '+
       'Lệnh npm có thể cài package và chạy script do dự án khai báo; file package.json và thư mục android/ có thể thay đổi. '+
       'Nên commit Git hoặc sao lưu dự án trước khi tiếp tục.':'Dự án sẽ được build thành APK và chạy trên emulator cục bộ.')+
      '\n\nTiếp tục?';
    const consent=await dialog.showMessageBox(win,{type:'warning',title:'Khởi tạo Android thật',message:'Tạo Android SDK + AVD cho '+project.name,detail:info,
      buttons:['Hủy','Đồng ý tải, cài đặt & chuẩn bị dự án'],defaultId:0,cancelId:0,noLink:true});
    if(consent.response!==1)return {cancelled:true};
    try{
      if(engine.devices[slot].status!=='off')await engine.stopSlot(slot);
      engine.update(slot,{status:'booting',previewMode:'setup',build:'building',message:'Đang chuẩn bị SDK và máy Android thật…'});
      await androidSetup.initialize(slot);
      await nativeProject.prepare(slot);
      assigned.nativeMode=true;
      engine.changed();
      engine.update(slot,{status:'off',previewMode:null,webUrl:null,build:'idle',message:'Đã chuẩn bị xong. Đang mở Android thật…'});
      await engine.autoStartSlot(slot);
      return {ok:true,slot,avd:assigned.avd};
    }catch(error){
      engine.update(slot,{status:'error',previewMode:null,build:'error',message:'Khởi tạo Android thất bại: '+error.message});
      send('sdk-setup',{slot,step:'error',message:error.message});
      throw error;
    }
  });
  register('switch-web-mode', async slot => {
    engine.requireSlot(slot);
    const assigned=engine.store.data.slots[slot];
    const project=engine.project(assigned.projectId);
    if(!['web','expo-web'].includes(project.kind))throw new Error('Dự án này không có chế độ Web Preview.');
    if(ai.isBusy(slot))throw new Error('AI đang sửa mã nguồn. Hãy dừng trước khi đổi chế độ.');
    if(engine.devices[slot].status!=='off')await engine.stopSlot(slot);
    assigned.nativeMode=false;
    engine.changed();
    engine.update(slot,{status:'off',previewMode:null,webUrl:null,build:'idle',message:'Đang chuyển về Web Preview…'});
    await engine.autoStartSlot(slot);
    return true;
  });
  register('choose-sdk', async () => { const folder = await chooseFolder({title:'Chọn thư mục Android SDK'}); return folder ? engine.configure({sdkPath: folder}) : null; });
  register('set-settings', (settings) => engine.configure(settings));
  register('start-slot', (slot) => engine.startSlot(slot));
  register('stop-slot', (slot) => engine.stopSlot(slot));
  register('reload-slot', (slot) => engine.reloadSlot(slot));
  register('recover-slot', (slot) => engine.recoverAndOpen(slot));
  register('open-vscode', (projectId) => engine.openVSCode(projectId));
  register('ai-status', async slot => { await ai.checkAuth(); return ai.state(slot); });
  register('ai-connect', (slot,mode) => ai.connect(slot,mode));
  register('ai-install-cli', slot => ai.installCLI(slot));
  register('ai-open-auth', () => shell.openExternal('https://auth.openai.com/codex/device'));
  register('ai-send', (slot,prompt,model) => ai.send(slot,prompt,model));
  register('ai-stop', slot => ai.stop(slot));
  register('ai-undo', slot => ai.undo(slot));
  register('ai-preview', slot => ai.previewChanges(slot));
  register('connect-vscode', async slot => {
    if (!Number.isInteger(slot) || slot<0 || slot>2) throw new Error('Máy ảo không hợp lệ.');
    let projectId = engine.store.data.slots[slot].projectId;
    if (!projectId) {
      if (engine.store.data.projects.length >= 3) throw new Error('Đã đủ 3 dự án. Hãy chọn một dự án có sẵn ở menu máy ảo.');
      const folder = await chooseFolder({title:'Chọn thư mục dự án trong VS Code cho Máy '+(slot+1)});
      if (!folder) return null;
      const project = await engine.addProject(folder,slot);
      projectId = project.id;
    }
    let vscodeOpened=false;
    try {
      await engine.openVSCode(projectId);
      vscodeOpened=true;
    } catch(error) {
      // Local folder watching does not require the VS Code executable to launch.
      engine.log('VS Code chưa mở tự động: '+error.message,'warn',slot);
    }
    return {projectId,slot,transport:'local-filesystem',vscodeOpened};
  });
  register('tap', (slot,x,y) => engine.tap(slot,x,y));
  register('swipe', (slot,x1,y1,x2,y2,ms) => engine.swipe(slot,x1,y1,x2,y2,ms));
  register('check-adb', () => engine.checkAdb());
  register('diagnostics', () => engine.diagnostics());
  register('device-action', async (slot, action) => {
    const result=await engine.deviceAction(slot,action);
    if(action!=='screenshot') return result;
    const chosen=await dialog.showSaveDialog(win,{
      title:'Lưu ảnh màn hình Android',defaultPath:`Baodroid-Emulator-${slot+1}-${Date.now()}.png`,
      filters:[{name:'PNG',extensions:['png']}]
    });
    if(chosen.canceled || !chosen.filePath) return null;
    await fs.writeFile(chosen.filePath,result);return chosen.filePath;
  });
  register('check-update', () => updater.check());
  register('download-update', () => updater.download());
  register('install-update', () => updater.install());
}
app.whenReady().then(async () => {
  const store = new Store(app.getPath('userData'));
  engine = new Engine(store, send);
  webPreview = new WebPreviewManager(engine);
  engine.webPreview = webPreview;
  androidSetup = new AndroidSetup(engine,send);
  nativeProject = new NativeProjectPreparation(engine,send);
  ai = new AIManager(engine,send);
  updater = new UpdateManager(value => send('update-status', value));
  registerHandlers();
  win = new BrowserWindow({
    width: 1650, height: 1060, minWidth: 960, minHeight: 720, backgroundColor:'#0b1422',
    title: 'Baodroid — Android Preview Hub', show: false,
    webPreferences: {preload:path.join(__dirname,'preload.js'), contextIsolation:true, nodeIntegration:false, sandbox:false, webSecurity:true}
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname,'../renderer/index.html'));
  win.once('ready-to-show', () => { win.show(); void engine.resumeAssignedSlots(); });
  win.webContents.setWindowOpenHandler(({url}) => { if (url.startsWith('https://github.com/techzoneadapter-droid/baodroid')) shell.openExternal(url); return {action:'deny'}; });
  engine.log('Baodroid sẵn sàng. Chọn thư mục dự án để tự chạy trong Android Emulator cục bộ.');
});
app.on('before-quit', () => { if (ai) ai.dispose(); if (engine) engine.dispose(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
