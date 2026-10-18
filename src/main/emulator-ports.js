'use strict';
const net=require('node:net');

function portIsAvailable(port,host='127.0.0.1'){
 return new Promise(resolve=>{
  const server=net.createServer();
  server.once('error',()=>resolve(false));
  server.listen({port,host,exclusive:true},()=>server.close(()=>resolve(true)));
 });
}
async function freeEmulatorPortPair(consolePort){
 if(!Number.isInteger(consolePort)||consolePort%2!==0||consolePort<5554||consolePort>5584)return false;
 return (await portIsAvailable(consolePort))&&(await portIsAvailable(consolePort+1));
}
async function findFreeEmulatorPort({preferred=5554,blocked=[],probe=freeEmulatorPortPair}={}){
 const taken=new Set(blocked.filter(Number.isFinite).map(Number));
 const candidates=[preferred,...Array.from({length:16},(_,i)=>5554+i*2)].filter((p,i,a)=>a.indexOf(p)===i);
 for(const port of candidates){
  if(!Number.isInteger(port)||port%2!==0||port<5554||port>5584||taken.has(port))continue;
  if(await probe(port))return port;
 }
 throw new Error('Không có cặp cổng emulator 5554–5585 khả dụng. Có thể emulator cũ đang giữ cổng. Baodroid sẽ không chạy chồng tiến trình.');
}
module.exports={portIsAvailable,freeEmulatorPortPair,findFreeEmulatorPort};
