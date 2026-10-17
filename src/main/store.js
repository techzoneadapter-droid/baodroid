'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {sdkRoot} = require('./process');
const defaults = () => ({
  projects: [],
  slots: Array.from({length: 3}, () => ({projectId: null, avd: ''})),
  settings: {sdkPath: sdkRoot(), autoBuild: true, autoDeploy: true, screenshots: true, screenshotInterval: 1500}
});
class Store {
  constructor(userData) {
    this.file = path.join(userData, 'settings.json');
    let loaded = {};
    try { loaded = JSON.parse(fs.readFileSync(this.file, 'utf8')); } catch { /* new install */ }
    const init = defaults();
    this.data = {
      projects: Array.isArray(loaded.projects) ? loaded.projects.slice(0, 3) : [],
      slots: init.slots.map((slot, i) => ({...slot, ...(loaded.slots?.[i] || {})})),
      settings: {...init.settings, ...(loaded.settings || {})}
    };
  }
  save() {
    fs.mkdirSync(path.dirname(this.file), {recursive: true});
    const temp = this.file + '.tmp';
    fs.writeFileSync(temp, JSON.stringify(this.data, null, 2), 'utf8');
    fs.renameSync(temp, this.file);
  }
}
module.exports = {Store};
