'use strict';
// Simulator for the exact packaged phone entry points, controlled by the native
// Emery harness over pipes. No phone service or account is accessed.
const fs=require('node:fs'),vm=require('node:vm'),readline=require('node:readline');
const root=process.argv[2],store=new Map(),pending=new Map(),events={};let config,id=0;
const output=value=>process.stdout.write(JSON.stringify(value)+'\n');
const storage={getItem:key=>store.get(key)??null,setItem:(key,value)=>store.set(key,String(value))};
const context={localStorage:storage,setTimeout,clearTimeout,console:{log(){},error(){}}};
vm.runInNewContext(fs.readFileSync(root+'/plugin.js','utf8'),{...context,Pebble:{registerSourceHandler(){},registerConfigHandler(handler){config=handler;}}});
readline.createInterface({input:process.stdin}).on('line',line=>{
 const command=JSON.parse(line);
 if(command.type==='transport'){
  const callbacks=pending.get(command.id);pending.delete(command.id);if(callbacks)(command.ok?callbacks.ok:callbacks.fail)();return;
 }
 if(command.type==='native'){if(events.appmessage)events.appmessage({payload:command.payload});return;}
 if(command.type==='start'){
  vm.runInNewContext(fs.readFileSync(root+'/pebble-js-app.js','utf8'),{...context,Pebble:{addEventListener(name,handler){events[name]=handler;},sendAppMessage(payload,ok,fail){pending.set(++id,{ok,fail});output({type:'send',id,payload});}}});
  events.ready();output({type:'response',id:command.id,result:{ok:true}});return;
 }
 const respond=result=>output({type:'response',id:command.id,result});
 if(events.configmessage)events.configmessage({data:command.message,respond});else config(command.message,respond);
});
