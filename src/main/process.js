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
    cwd: options.cwd, env: options.env || process.env, windowsHide: options.windowsHide!==false,
    stdio: ['pipe', 'pipe', 'pipe'], shell: options.shell || false
  });
  if (options.onLine) {
    splitLines(child.stdout,line=>options.onLine(line,'stdout'));
    splitLines(child.stderr,line=>options.onLine(line,'stderr'));
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
      if (code !== 0 && !options.ignoreFailure){
        const combined=(stderr+'\n'+stdout).trim();
        const all=combined.split(/\r?\n/);
        const interesting=all.filter(line=>/\berror\b|fail|exception|what went wrong|could not|not found|unsupported|incompatible|invalid|^npm ERR!/i.test(line));
        const summary=(interesting.length?interesting.slice(-8):all.slice(-9)).join(' | ').slice(-1800);
        finish(new Error(path.basename(command)+' (mã '+code+'): '+(summary||'Lệnh thất bại; xem Nhật ký kỹ thuật.')));
      }
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
function findNodeScriptCommand(tool,env=process.env,platform=process.platform){
  if(!['npm','npx'].includes(tool))throw new Error('Công cụ Node không hợp lệ.');
  if(platform!=='win32')return {cmd:tool,preArgs:[],shell:false};
  const bins=String(env.Path||env.PATH||'').split(path.delimiter).filter(Boolean);
  const roots=[
    env.ProgramFiles&&path.join(env.ProgramFiles,'nodejs'),
    env.PROGRAMFILES&&path.join(env.PROGRAMFILES,'nodejs'),
    ...bins
  ].filter(Boolean);
  for(const root of roots){
    const node=path.join(root,'node.exe');
    const script=path.join(root,'node_modules','npm','bin',tool+'-cli.js');
    if(fs.existsSync(node)&&fs.existsSync(script))
      return {cmd:node,preArgs:[script],shell:false};
  }
  // Fallback supports Node installations managed by third-party tools.
  // Only local project commands are passed; no user-entered shell text.
  return {cmd:tool+'.cmd',preArgs:[],shell:true};
}
function gradleCommand(root, environment=process.env, platform=process.platform) {
  const wrapper=path.join(root,platform==='win32'?'gradlew.bat':'gradlew');
  if(!fs.existsSync(wrapper))throw new Error('Không tìm thấy Gradle Wrapper (gradlew/gradlew.bat) trong '+root);
  if(platform!=='win32')return {cmd:wrapper,shell:false,preArgs:[],cwd:root};
  const jar=path.join(root,'gradle','wrapper','gradle-wrapper.jar');
  const props=path.join(root,'gradle','wrapper','gradle-wrapper.properties');
  try{
    // Validate exactly the artifact that will be used by Gradle's script.
    const stat=fs.statSync(jar);
    if(!stat.isFile()||stat.size<500)throw new Error('JAR rỗng hoặc không hợp lệ.');
    const fd=fs.openSync(jar,'r');
    fs.closeSync(fd);
    if(!fs.statSync(props).isFile())throw new Error('Thiếu gradle-wrapper.properties');
  }catch(error){
    throw new Error('Không đọc được Gradle Wrapper tại '+jar+': '+error.message);
  }
  // Use the official Gradle/Capacitor gradlew.bat. It derives APP_HOME from
  // %~dp0, so Java never receives a homegrown absolute JAR argument. Crucially
  // cmd.exe is launched with cwd=root and only a RELATIVE script filename.
  // No shell:true, no concatenation of project paths with shell metacharacters.
  return {cmd:environment.ComSpec||environment.COMSPEC||'cmd.exe',
    shell:false,preArgs:['/d','/c','gradlew.bat'],cwd:root};
}
module.exports = {sdkRoot, toolsForSdk, exec, launch, stopProcess, gradleCommand, findNodeScriptCommand, splitLines};
