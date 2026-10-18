'use strict';
// Build output is authoritative: IDs from build.gradle can differ from variant manifest IDs.
function apkDetails(output){
 const text=String(output||'');
 const id=text.match(/^package:\s+name='([^']+)'/m)?.[1]||'';
 const activity=text.match(/^launchable-activity:\s+name='([^']+)'/m)?.[1]||'';
 return {id,activity};
}
function packageInstalled(output,id){
 return Boolean(id)&&String(output||'').split(/\r?\n/).some(s=>s.trim().startsWith('package:'+id));
}
function launchSucceeded(output){
 const s=String(output||'');
 return !/Error type|SecurityException|does not exist|Unable to resolve|No activities found|monkey aborted|Permission Denial|Exception occurred|Error:/i.test(s)
   && /Status:\s*ok|Starting:\s*Intent|Events injected:\s*[1-9]/i.test(s);
}
function launcherComponent(id,activity){
 if(!/^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)+$/.test(id))
   throw new Error('applicationId APK không hợp lệ.');
 if(typeof activity!=='string'||!activity.trim())return '';
 // Activity names may use either the fully qualified name or a dotted short name.
 const cls=activity.startsWith('.')?id+activity:activity;
 if(!/^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)+$/.test(cls))
   throw new Error('Activity khởi động không hợp lệ.');
 return id+'/'+cls;
}
module.exports={apkDetails,packageInstalled,launchSucceeded,launcherComponent};
