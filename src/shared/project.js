'use strict';
const fs = require('node:fs');
const path = require('node:path');

function detectProject(folder) {
  if (!folder || !path.isAbsolute(folder) || !fs.existsSync(folder) || !fs.statSync(folder).isDirectory()) {
    throw new Error('Thư mục dự án không tồn tại.');
  }
  const exists = (file) => fs.existsSync(path.join(folder, file));
  if (exists('pubspec.yaml') && exists('android')) return 'flutter';
  let pkg = null;
  if (exists('package.json')) {
    try { pkg = JSON.parse(fs.readFileSync(path.join(folder,'package.json'),'utf8')); }
    catch { throw new Error('package.json không đọc được. Kiểm tra JSON của dự án.'); }
  }
  // Expo managed projects (e.g. CHUONG) may not have android/ at all.
  // Prefer zero-SDK mobile web preview; native device testing remains optional.
  if (pkg && (pkg.dependencies?.expo || pkg.devDependencies?.expo)) return 'expo-web';
  // Mobile-friendly Vite/React/Capacitor projects (e.g. ReelTara, MiniZap).
  if (pkg && (pkg.devDependencies?.vite || pkg.dependencies?.vite ||
      exists('vite.config.ts') || exists('vite.config.js')) &&
      (pkg.scripts?.dev || pkg.scripts?.start)) return 'web';

  // React Native projects have a Gradle app nested inside android/.
  // Some projects use Expo's bare workflow, which also has android/.
  if (exists('android') && exists('package.json')) {
    const android = path.join(folder,'android');
    if (fs.existsSync(path.join(android,'settings.gradle')) || fs.existsSync(path.join(android,'settings.gradle.kts'))) {
      let pkg={};
      try {pkg=JSON.parse(fs.readFileSync(path.join(folder,'package.json'),'utf8'));}catch{/* malformed package, treat as generic React Native project */}
      if (pkg.dependencies?.['react-native'] || pkg.devDependencies?.['react-native'] ||
          pkg.dependencies?.expo || pkg.devDependencies?.expo || fs.existsSync(path.join(folder,'index.js')))
        return 'react-native';
      return 'react-native';
    }
  }
  if ((exists('settings.gradle') || exists('settings.gradle.kts')) && exists('app')) return 'gradle';
  throw new Error('Không tìm thấy dự án Android Gradle, Flutter hoặc React Native hợp lệ.');
}
function readApplicationId(projectRoot, kind) {
  const base = kind === 'flutter' || kind === 'react-native' ? path.join(projectRoot, 'android') : projectRoot;
  for (const p of ['app/build.gradle.kts', 'app/build.gradle']) {
    const file = path.join(base, p);
    if (!fs.existsSync(file)) continue;
    const source = fs.readFileSync(file, 'utf8');
    const m = source.match(/\bapplicationId\s*(?:=\s*)?["']([^"']+)["']/);
    if (m) return m[1];
  }
  return null;
}
function gradleRoot(folder, kind) { return kind === 'flutter' || kind === 'react-native' ? path.join(folder, 'android') : folder; }
function findDebugApk(projectRoot) {
  const target = path.join(projectRoot, 'app', 'build', 'outputs', 'apk', 'debug');
  if (!fs.existsSync(target)) return null;
  const list = fs.readdirSync(target).filter(x => x.endsWith('.apk'));
  return list.length ? path.join(target, list.find(x => x === 'app-debug.apk') || list[0]) : null;
}
module.exports = {detectProject, readApplicationId, gradleRoot, findDebugApk};
