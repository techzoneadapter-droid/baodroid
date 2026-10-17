'use strict';
const {app} = require('electron');
const {autoUpdater} = require('electron-updater');
const log = require('electron-log');
class UpdateManager {
  constructor(emit) {
    this.emit = emit;
    autoUpdater.logger = log;
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false;
    autoUpdater.on('checking-for-update', () => emit({state: 'checking', message: 'Đang kiểm tra bản vá...'}));
    autoUpdater.on('update-available', info => emit({state: 'available', message: `Có bản ${info.version}`, version: info.version}));
    autoUpdater.on('update-not-available', () => emit({state: 'current', message: 'Đang dùng phiên bản mới nhất.'}));
    autoUpdater.on('download-progress', progress => emit({state: 'downloading', message: `Đang tải: ${Math.floor(progress.percent)}%`, percent: progress.percent}));
    autoUpdater.on('update-downloaded', info => emit({state: 'ready', message: `Đã tải ${info.version}. Bấm Cài đặt để khởi động lại.`}));
    autoUpdater.on('error', err => emit({state: 'error', message: `Không thể cập nhật: ${err.message}`}));
  }
  async check() {
    if (!app.isPackaged) return this.emit({state:'dev', message:'Tính năng update hoạt động trong bản .exe đã cài đặt.'});
    try { await autoUpdater.checkForUpdates(); } catch (e) { this.emit({state: 'error', message:e.message}); }
  }
  async download() { if (app.isPackaged) await autoUpdater.downloadUpdate(); }
  install() { if (app.isPackaged) autoUpdater.quitAndInstall(false, true); }
}
module.exports = {UpdateManager};
