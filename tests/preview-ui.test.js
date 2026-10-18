'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const code=rel=>fs.readFileSync(path.join(__dirname,'..',rel),'utf8');

test('preview-first UI retains 3 slots, focus modes and direct project selection',()=>{
 const html=code('src/renderer/index.html');
 const renderer=code('src/renderer/app.js');
 assert.match(html,/Màn hình xem trước/);
 assert.match(html,/data-view="0"/);
 assert.match(html,/data-view="1"/);
 assert.match(html,/data-view="2"/);
 assert.match(renderer,/cardHTML\(i\)/);
 assert.match(renderer,/data-project-slot/);
 assert.match(renderer,/data-recover-slot/);
});
test('ChatGPT is collapsed by default, expands on demand and preserves each project session',()=>{
 const ai=code('src/renderer/ai-ui.js');
 const css=code('src/renderer/styles.css');
 assert.match(ai,/document\.createElement\('details'\)/);
 assert.match(ai,/const expanded=\[false,false,false\]/);
 assert.match(ai,/panel\.open=expanded\[i\]/);
 assert.match(ai,/card\.querySelector\('\[data-ai-panel\]'\)/);
 assert.match(css,/\.ai-panel:not\(\[open\]\)>:not\(summary\)/);
 assert.match(css,/\.device-card\.empty \.screen-wrap/);
});
test('Android crash diagnostics identify Windows access violation and avoid endless retry',()=>{
 const engine=code('src/main/engine.js');
 const policy=code('src/main/boot-policy.js');
 assert.match(engine,/3221225477/);
 assert.match(engine,/recoveryAttempts<1/);
 assert.match(policy,/'-feature','-Vulkan'/);
 assert.match(policy,/const args=\['@'\+avd,'-port'/);
 assert.doesNotMatch(policy,/args\.push\('-no-window'\)/);
});
