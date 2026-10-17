'use strict';
const {contextBridge, ipcRenderer} = require('electron');
const routes = [
  'get-state','add-project','remove-project','assign-project','assign-avd','list-avds',
  'choose-sdk','set-settings','start-slot','stop-slot','reload-slot','open-vscode',
  'tap','swipe','device-action','connect-vscode','ai-status','ai-connect','ai-send','ai-stop','ai-undo','ai-preview','diagnostics','check-update','download-update','install-update','check-adb'
];
const invoke = Object.fromEntries(routes.map(route => [route.replace(/-([a-z])/g, (_, l) => l.toUpperCase()), (...args) => ipcRenderer.invoke(route, ...args)]));
const observe = (event) => (fn) => {
  if (typeof fn !== 'function') return () => {};
  const cb = (_event, value) => fn(value);
  ipcRenderer.on(event, cb);
  return () => ipcRenderer.removeListener(event, cb);
};
contextBridge.exposeInMainWorld('baodroid', Object.freeze({
  ...invoke,
  onState: observe('state'), onLog: observe('log'), onPreview: observe('preview'), onUpdate: observe('update-status'), onAIEvent: observe('ai-event')
}));
