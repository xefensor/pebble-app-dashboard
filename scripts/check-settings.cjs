#!/usr/bin/env node
'use strict';
// Isolated browser checks with a fake settings bridge; no real plugin is read
// and no action or app launch can be invoked by this test.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process'),{pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'..'),output=path.join(root,'docs/qa/0.1.0/settings');
const model=require('../src/pkjs/settings');
const PLUGIN='00aabbcc-2233-4455-6677-889900aabbcc';
let browser,socket,scratch,logFd,id=0;const requests=new Map(),exceptions=[];
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function send(method,params={}) {const current=++id;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{requests.delete(current);reject(Error('CDP timeout '+method));},15000);requests.set(current,{resolve:r=>{clearTimeout(timer);resolve(r);},reject:e=>{clearTimeout(timer);reject(e);}});socket.send(JSON.stringify({id:current,method,params}));});}
async function evaluate(expression) {const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});assert.equal(result.exceptionDetails,undefined,JSON.stringify(result.exceptionDetails));return result.result.value;}
async function until(expression,label) {for(let step=0;step<200;step++){if(await evaluate(expression))return;await sleep(25);}throw Error('Timed out: '+label);}
async function click(selector) {return evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el)throw Error('Missing '+${JSON.stringify(selector)});el.click();return true;})()`);}
async function field(id,value,event='change') {return evaluate(`(()=>{const el=document.getElementById(${JSON.stringify(id)});el[el.type==='checkbox'?'checked':'value']=${JSON.stringify(value)};el.dispatchEvent(new Event(${JSON.stringify(event)},{bubbles:true}));return true;})()`);}
async function image(name) {const result=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(output,name+'.png'),Buffer.from(result.data,'base64'));}
function fakeBridge(initial) {
  const home='00aabbcc-2233-4455-6677-889900aabbcc';
  const state=window.__settingsTest={store:initial,calls:[],loadFailure:false,saveFailure:false,catalogueDelay:0};
  const catalogue={plugins:[{uuid:home,name:'Home lights',sources:[{category:'home',items:['light'],properties:{name:['shortText'],brightness:['numericValue'],on:['boolean']}}],actions:[{name:'set_on',label:'Set light',parameters:{type:'object',properties:{item:{type:'string'},instanceId:{type:'string'},on:{type:'boolean'}},required:['item','instanceId','on']}},{name:'set_label',label:'Set label',parameters:{type:'object',properties:{label:{type:'string'}},required:['label']}}]}],instances:[],activities:[{key:home,name:'Timer provider'},{key:'22222222-3333-4444-5555-666666666666',name:'Music provider'}]};
  window.Pebble={addEventListener(type,fn){if(type==='ready')window.addEventListener('load',()=>{fn({target:'pkjs'});fn({target:'plugin'});},{once:true});},sendMessage(target,message){
    if(target==='pkjs'&&message.type==='reload_settings'){state.calls.push({target:'pkjs',type:message.type});return Promise.resolve({ok:true});}
    if(target!=='plugin')return Promise.reject(Error('Unsupported target'));
    state.calls.push(JSON.parse(JSON.stringify(message)));
    if(message.type==='load_settings')return state.loadFailure?Promise.reject(Error('denied')):Promise.resolve({ok:true,settings:state.store});
    if(message.type==='save_settings'){state.store=JSON.parse(JSON.stringify(message.settings));return state.saveFailure?Promise.reject(Error('uncertain')):Promise.resolve({ok:true,settings:state.store});}
    if(message.type==='catalogue')return new Promise(resolve=>setTimeout(()=>resolve({ok:true,catalogue}),state.catalogueDelay));
    if(message.type==='inspect_source'){
      if(message.source.category==='phone'&&message.source.item==='find_my_phone')throw Error('Find phone must not be read');
      return Promise.resolve({ok:true,instances:[{plugin:home,category:'home',item:'light',instanceId:'3',name:'Kitchen',properties:['name','brightness','on']}]});
    }
    return Promise.reject(Error('Unsupported settings request'));
  }};
}
async function run() {
  fs.mkdirSync(output,{recursive:true});scratch=fs.mkdtempSync(path.join(os.tmpdir(),'dashboard-settings-'));logFd=fs.openSync(path.join(scratch,'chromium.log'),'w');
  browser=spawn(process.env.CHROMIUM_BINARY||'/usr/bin/chromium',['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--disable-background-networking','--no-first-run','--remote-debugging-port=0','--user-data-dir='+scratch,'about:blank'],{stdio:['ignore',logFd,logFd],detached:true});
  const portFile=path.join(scratch,'DevToolsActivePort');for(let step=0;step<200&&!fs.existsSync(portFile);step++){if(browser.exitCode!==null)throw Error(fs.readFileSync(path.join(scratch,'chromium.log'),'utf8').slice(-1800));await sleep(25);}assert.ok(fs.existsSync(portFile),'Chromium socket unavailable');
  const port=fs.readFileSync(portFile,'utf8').split('\n')[0],tabs=await(await fetch('http://127.0.0.1:'+port+'/json')).json();socket=new WebSocket(tabs.find(tab=>tab.type==='page').webSocketDebuggerUrl);await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
  socket.onmessage=event=>{const message=JSON.parse(event.data);if(message.id){const request=requests.get(message.id);if(request){requests.delete(message.id);message.error?request.reject(Error(JSON.stringify(message.error))):request.resolve(message.result);}}else if(message.method==='Runtime.exceptionThrown')exceptions.push(message.params.exceptionDetails);};
  await send('Page.enable');await send('Runtime.enable');await send('Page.addScriptToEvaluateOnNewDocument',{source:'('+fakeBridge.toString()+')('+JSON.stringify(model.defaults())+');'});
  await send('Emulation.setDeviceMetricsOverride',{width:360,height:800,deviceScaleFactor:1,mobile:true});
  await send('Page.navigate',{url:pathToFileURL(path.join(root,'config.html')).href});
  await until(`document.getElementById('pins')&&document.querySelectorAll('#pins>li').length===4`,'saved settings loaded');
  await until(`document.querySelectorAll('#activities>li').length===2`,'metadata loaded');
  assert.equal(await evaluate(`document.getElementById('save').disabled`),true);
  assert.equal(await evaluate(`document.querySelector('#pins>li button[aria-label^="Move"]').disabled`),true,'first pin Up must remain disabled');
  await image('overview-light');
  await field('dark',true);assert.equal(await evaluate(`document.getElementById('save').disabled`),false);
  await click('#add-pin');await field('pin-label','Kitchen light','input');await field('has-reading',true);await field('source',PLUGIN+'|home|light');await field('property','brightness');
  await click('#inspect-source');await until(`Array.from(document.getElementById('instance').options).some(x=>x.value==='id:3')`,'instances');await field('instance','id:3');
  await field('action',PLUGIN+'|set_on');await field('action-label','Toggle','input');
  await field('toggle','on');
  assert.equal(await evaluate(`document.getElementById('automatic-args').hidden`),false);
  assert.equal(await evaluate(`['item','instanceId','on'].every(name=>document.querySelector('[aria-label="'+name+'"]').parentNode.hidden)`),true,'derived toggle arguments must not need duplicate entry');
  await click('#editor-save');assert.equal(await evaluate(`document.querySelectorAll('#pins>li').length`),5);
  await click('#save');await until(`document.getElementById('status').textContent==='Settings saved.'`,'confirmed save');
  let saved=await evaluate('window.__settingsTest.store');assert.equal(saved.dark,true);assert.equal(saved.pins[4].reading.instanceId,'3');assert.equal(saved.pins[4].action.toggleProperty,'on');assert.deepEqual(saved.pins[4].action.args,{});
  assert.ok(await evaluate(`window.__settingsTest.calls.some(call=>call.target==='pkjs'&&call.type==='reload_settings')`),'confirmed saves should notify a running PKJS host');
  // Reordering is explicit and the pin remains a value+action pair.
  await click('#pins>li:last-child button[aria-label^="Move"][aria-label$="up"]');await click('#save');await until(`document.getElementById('status').textContent==='Settings saved.'`,'reorder save');saved=await evaluate('window.__settingsTest.store');assert.equal(saved.pins[3].id,saved.pins.filter(pin=>pin.label==='Kitchen light')[0].id);
  // Late discovery cannot overwrite the editor's in-progress source or label.
  await click('#pins>li:nth-child(4) button');await field('pin-label','Kitchen draft','input');
  await evaluate('window.__settingsTest.catalogueDelay=80');await click('#refresh-catalogue');await sleep(150);
  assert.equal(await evaluate(`document.getElementById('pin-label').value`),'Kitchen draft');assert.equal(await evaluate(`document.getElementById('property').value`),'brightness');
  await image('pin-editor');
  await field('action',PLUGIN+'|set_label');await click('#editor-save');
  assert.ok(await evaluate(`document.getElementById('editor-error').textContent.includes('label')`),'ordinary action fields remain required');
  assert.equal(await evaluate(`document.getElementById('editor').hidden`),false);await click('#editor-cancel');
  // An uncertain response never claims success or pretends Discard undoes it.
  await field('notifications',false);await evaluate('window.__settingsTest.saveFailure=true');await click('#save');await until(`document.getElementById('status').textContent.indexOf('not confirmed')>=0`,'uncertain save');
  assert.equal(await evaluate(`document.getElementById('discard').textContent`),'Reload saved');await evaluate('window.__settingsTest.saveFailure=false');await click('#discard');await until(`document.getElementById('status').textContent==='No changes to save.'`,'readback');assert.equal(await evaluate(`document.getElementById('notifications').checked`),false);
  // A load failure blocks replacement edits; retry restores actual saved state.
  await field('dark',false);await evaluate('window.__settingsTest.saveFailure=true');await click('#save');await until(`document.getElementById('status').textContent.indexOf('not confirmed')>=0`,'second uncertain save');
  await evaluate('window.__settingsTest.loadFailure=true');await click('#discard');await until(`!document.getElementById('retry').hidden`,'load failure');assert.equal(await evaluate(`document.getElementById('dark').disabled`),true);
  await evaluate('window.__settingsTest.loadFailure=false;window.__settingsTest.saveFailure=false');await click('#retry');await until(`!document.getElementById('dark').disabled`,'retry loaded');
  await send('Emulation.setDeviceMetricsOverride',{width:320,height:520,deviceScaleFactor:1,mobile:true});await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:'dark'}]});await evaluate('window.scrollTo(0,0)');await image('overview-dark-small');
  assert.equal(await evaluate('document.documentElement.scrollWidth<=window.innerWidth'),true,'settings must not horizontally overflow');
  assert.equal(await evaluate(`document.getElementById('actions').getAttribute('data-flow')`),'true','short viewport should put actions in flow');
  const calls=await evaluate('window.__settingsTest.calls');assert.equal(calls.some(call=>call.type==='inspect_source'&&call.source.category==='phone'&&call.source.item==='find_my_phone'),false);assert.deepEqual(exceptions,[]);
  const result={result:'PASS',scope:'Generated phone settings with a fake SDK config bridge; no real source/action invocation.',checks:['mixed pin typed action+reading','exact instance binding','automatic toggle target/state arguments without duplicate entry','ordinary action fields remain required','on/off toggle property','pin reorder','confirmed save notifies running PKJS','late catalogue preserves draft','uncertain save readback','load failure disables editing','retry','short dark viewport no overflow','Find phone never probed'],screens:['overview-light.png','pin-editor.png','overview-dark-small.png']};fs.writeFileSync(path.join(output,'validation.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
}
run().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{try{if(socket)socket.close();}catch(_){}if(browser){try{process.kill(-browser.pid,'SIGTERM');}catch(_){}}if(logFd!==undefined)fs.closeSync(logFd);if(scratch)fs.rmSync(scratch,{recursive:true,force:true});});
