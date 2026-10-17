'use strict';
const {spawn} = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

function sdkRoot(override = '') {
  const candidates = [override, process.env.ANDROID_SDK_ROOT, process.env.ANDROID_HOME, process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Android', 'Sdk')].filter(Boolean);
  return candidates.find(x => fs.existsSync(path.join(x, 'platform-tools'))) || candidates[0] || '';
}
function toolsForSdk(root) {
  const suffix = process.platform === 'win32' ? '.exe' : '';
  return {adb: path.join(root, 'platform-tools', 'adb' + suffix), emulator: path.join(root, 'emulator', 'emulator' + suffix)};
}
function splitLines(stream, callback) {
  let previous = '';
  stream.on('data', (chunk) => {
    previous += chunk.toString('utf8');
    const lines = previous.split(/\r?\n/);
    previous = lines.pop() || '';
    for (const line of lines) if (line.trim()) callback(line.trim());
  });
  stream.on('end', () => { if (previous.trim()) callback(previous.trim()); });
}
function launch(command, args = [], options = {}) {
  const child = spawn(command, args, {
    cwd: options.cwd, env: options.env || process.env, windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'], shell: options.shell || false
  });
  if (options.onLine) {
    splitLines(child.stdout, options.onLine);
    splitLines(child.stderr, options.onLine);
  }
  return child;
}
function exec(command, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    let stdout = '', stderr = '', settled = false;
    const child = launch(command, args, options);
    const maxBytes = options.maxBytes || 4 * 1024 * 1024;
    const timer = setTimeout(() => { child.kill(); finish(new Error('Lệnh hết thời gian chờ.')); }, options.timeout || 30000);
    function finish(err, output) {
      if (settled) return;
      settled = true; clearTimeout(timer);
      if (err) reject(err); else resolve(output);
    }
    for (const [stream, name] of [[child.stdout, 'stdout'], [child.stderr, 'stderr']]) {
      stream.on('data', buffer => {
        if (name === 'stdout') stdout += buffer.toString('utf8'); else stderr += buffer.toString('utf8');
        if (stdout.length + stderr.length > maxBytes) { child.kill(); finish(new Error('Đầu ra lệnh quá lớn.')); }
      });
    }
    child.on('error', finish);
    child.on('close', (code) => {
      if (code !== 0 && !options.ignoreFailure) finish(new Error((stderr || stdout || `Mã lỗi ${code}`).slice(-1500)));
      else finish(null, {stdout, stderr, code});
    });
  });
}
function stopProcess(child) {
  if (!child || child.exitCode !== null || !child.pid) return;
  if (process.platform === 'win32') {
    const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], {windowsHide: true});
    killer.on('error', () => {});
  } else child.kill('SIGTERM');
}
function gradleCommand(root, environment=process.env, platform=process.platform) {
  const wrapper=path.join(root,platform==='win32'?'gradlew.bat':'gradlew');
  if(!fs.existsSync(wrapper))throw new Error('Không tìm thấy Gradle Wrapper (gradlew/gradlew.bat).');
  if(platform!=='win32')return {cmd:wrapper,shell:false,preArgs:[],cwd:root};
  // Windows CMD with shell:true incorrectly parses absolute paths containing
  // spaces, Unicode and special characters. Invoke the SAME Gradle wrapper JAR
  // directly through Java, avoiding cmd.exe and gradlew.bat quoting entirely.
  const jar=path.join(root,'gradle','wrapper','gradle-wrapper.jar');
  if(!fs.existsSync(jar))throw new Error('Thiếu gradle/wrapper/gradle-wrapper.jar trong dự án Android.');
  const roots=[
    environment.JAVA_HOME,
    environment.ProgramFiles&&path.join(environment.ProgramFiles,'Android','Android Studio','jbr'),
    environment.LOCALAPPDATA&&path.join(environment.LOCALAPPDATA,'Programs','Android Studio','jbr'),
    environment.PROGRAMFILES&&path.join(environment.PROGRAMFILES,'Android','Android Studio','jbr')
  ].filter(Boolean);
  const java=roots.map(dir=>path.join(dir,'bin','java.exe')).find(p=>fs.existsSync(p))||'java';
  return {cmd:java,shell:false,preArgs:['-Dorg.gradle.appname=gradlew','-classpath',jar,'org.gradle.wrapper.GradleWrapperMain'],cwd:root};
}
module.exports = {sdkRoot, toolsForSdk, exec, launch, stopProcess, gradleCommand, splitLines};
