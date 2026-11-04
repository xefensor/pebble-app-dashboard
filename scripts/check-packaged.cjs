'use strict';
// Execute the actual PBW phone/plugin scripts against an isolated SDK model.
// All content below is fictional. No phone, network or device command is sent.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),cp=require('node:child_process');
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),pkg=require('../package.json');
const pbw=path.join(root,'dist','Dashboard-'+pkg.version+'.pbw'),packed=path.join(root,'build/packaged-check');
fs.mkdirSync(packed,{recursive:true});
cp.execFileSync('python3',['-c','import zipfile,sys,pathlib\nz=zipfile.ZipFile(sys.argv[1]);out=pathlib.Path(sys.argv[2])\nfor n in ("pebble-js-app.js","plugin.js","appinfo.json"): (out/n).write_bytes(z.read(n))',pbw,packed]);
const protocol=require('../src/pkjs/protocol'),settings=require('../src/pkjs/settings'),summary=require('pebble-activities/summary');
const P=protocol.keys,F=protocol.flag;
const TIMER='50e9ef12-a5ab-4369-a3b5-3447bfba5151',MUSIC='00000000-0000-0000-0001-000000000003';
const NOTICES='00000000-0000-0000-0001-000000000005',FIND='00000000-0000-0000-0001-000000000008';
const WEATHER='00000000-0000-0000-0001-000000000002',PHONE='00000000-0000-0000-0001-000000000001';
function memory(initial={}){const values=new Map(Object.entries(initial));return {values,getItem:k=>values.has(k)?values.get(k):null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k)};}
const storage=memory(),timerStorage=memory();let ms=Date.now(),id=0;
const timers=new Map(),events={},subscriptions=[],sent=[],calls=[];
function later(fn,delay){timers.set(++id,{fn,at:ms+Math.max(0,delay||0)});return id;}
function advance(amount){const end=ms+amount;for(let i=0;i<5000;i++){const due=[...timers].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!due){ms=end;return;}ms=due[1].at;timers.delete(due[0]);due[1].fn();}throw Error('Unbounded timer work');}
async function settle(){for(let i=0;i<35;i++){await Promise.resolve();advance(0);}}
class TestDate extends Date{constructor(...args){super(...(args.length?args:[ms]));}static now(){return ms;}}
const text=v=>({longText:{text:v}}),bool=v=>({boolean:{value:v}});
const artwork=require('../tests/fixtures/overview.json').items[1].image;
let playing=true,noticePresent=true;
const timer=summary.defineProvider({pluginUuid:TIMER,storage:timerStorage,now:()=>ms,displayName:'Timer',icon:'timer',readCurrent:()=>[summary.standard('tea',{name:'Tea',headline:summary.countdown({deadline:Math.floor(ms/1000)+151}),openApp:{watchAppUuid:TIMER}})]});
function plugin(uuid,name,category,item,actions=[]){return {uuid,name,sources:[{category,items:[item],properties:{}}],actions};}
const plugins=[{uuid:TIMER,name:'Timer',sources:[timer.sourceDeclaration],actions:[]},
  plugin(MUSIC,'Music','music','track',[{name:'previous_track'},{name:'set_playing',parameters:{properties:{on:{type:'boolean'}},required:['on']}},{name:'next_track'}]),
  plugin(NOTICES,'Notifications','notifications','notification'),plugin(WEATHER,'Weather','weather','location'),plugin(PHONE,'Phone','phone','phone_state'),plugin(FIND,'Find phone','phone','find_my_phone',[{name:'ring'},{name:'stop'}])];
function envelope(category,item){
  let pluginUuid,instances=[];
  if(category==='music'){pluginUuid=MUSIC;instances=[{instanceId:'track',properties:{title:text('Fictional track'),artist:text('Fictional artist'),playing:bool(playing),artwork:{image:artwork}}}];}
  if(category==='notifications'){pluginUuid=NOTICES;if(noticePresent)instances=[{instanceId:'n1',properties:{name:text('Fictional sender'),body:text('Private test text'),app:text('Test messenger')}}];}
  if(category==='weather'){pluginUuid=WEATHER;instances=[{instanceId:'home',properties:{name:text('Home'),temperature:{numericValue:{value:13,unit:'°C'}}}}];}
  if(category==='phone'&&item==='phone_state'){pluginUuid=PHONE;instances=[{instanceId:'phone',properties:{battery_level:{numericValue:{value:76,unit:'%'}}}}];}
  return {pluginUuid,validUntilMs:null,instances};
}
function emit(category){subscriptions.filter(s=>!s.closed&&s.request.category===category).forEach(s=>s.request.onData(envelope(s.request.category,s.request.item)));}
const Pebble={addEventListener:(name,fn)=>{events[name]=fn;},removeEventListener(){},getAccountToken:()=>'',getWatchToken:()=>'',getActiveWatchInfo:()=>({language:'en',platform:'emery'}),
  enumeratePlugins:()=>Promise.resolve(plugins),
  subscribeToSource(request){
    assert.notEqual(request.item,'find_my_phone','A settings/default read must not ring the phone');
    const record={request,closed:false};subscriptions.push(record);
    Promise.resolve().then(async()=>{if(record.closed)return;if(request.category==='activity'){const value=await timer.source(request);value.pluginUuid=TIMER;request.onData(value);}else request.onData(envelope(request.category,request.item));});
    return {unsubscribe(){record.closed=true;}};
  },
  sendAppMessage(message,ok){sent.push(JSON.parse(JSON.stringify(message)));if(ok)ok();},
  invokeAction(request){calls.push(JSON.parse(JSON.stringify(request)));if(request.plugin===MUSIC&&request.action==='set_playing'){playing=request.args.on;emit('music');}return Promise.resolve({ok:true,refreshed:request.plugin===MUSIC?['music/track']:[]});},
  readSource:request=>Promise.resolve(envelope(request.category,request.item)),openURL(url){urls.push(url);}};
const urls=[];
vm.runInNewContext(fs.readFileSync(path.join(packed,'pebble-js-app.js'),'utf8'),{Pebble,localStorage:storage,Date:TestDate,console,navigator:{language:'en'},setTimeout:later,clearTimeout:key=>timers.delete(key)},{filename:'packaged-dashboard.js',timeout:5000});
function send(op,request,extra={}){events.appmessage({payload:{[P.DB_OPERATION]:op,[P.DB_SESSION]:12345,[P.DB_REQUEST]:request,...extra}});}
function frame(){
  const latest=sent.filter(value=>value[P.DB_DATA]).at(-1);assert.ok(latest,'No display frame from packaged PKJS');
  const b=Buffer.from(latest[P.DB_DATA]);assert.equal(b.subarray(0,4).toString(),'DSH1');let at=32;
  const out={mode:b[20],status:b[21],offset:b.readUInt16LE(26),total:b.readUInt16LE(24),items:[]};
  for(let i=0;i<b[22];i++){
    const item={token:b.readUInt32LE(at),version:b.readUInt32LE(at+4),flags:b.readUInt16LE(at+12),clockMode:b[at+15],anchor:b.readUInt32LE(at+16),role:b[at+39],imageWidth:b[at+36]},lengths=[];
    for(let n=0;n<6;n++)lengths.push(b.readUInt16LE(at+24+2*n));const tail=b[at+38]+b.readUInt16LE(at+40)+b.readUInt16LE(at+42);at+=44;
    ['title','subtitle','value','appLabel','actionLabel','name'].forEach((name,n)=>{item[name]=b.subarray(at,at+lengths[n]).toString();at+=lengths[n];});at+=tail;out.items.push(item);
  }
  assert.equal(at,b.length);return out;
}
async function main(){
  events.ready();send(protocol.op.HELLO,1,{[P.DB_MODE]:0});await settle();
  let view=frame();assert.equal(view.mode,0);assert.equal(view.items.length,7);assert.equal(calls.length,0);
  const tea=view.items.find(item=>item.title==='Tea');assert.ok(tea);assert.equal(tea.clockMode,1);assert.equal(tea.anchor,Math.floor(ms/1000)+151);assert.equal(tea.flags&F.ACTION,0);
  let music=view.items.find(item=>item.flags&F.MEDIA);assert.ok(music.flags&F.MEDIA_TOGGLE);assert.equal(music.imageWidth,40);
  const notice=view.items.find(item=>item.role===1);assert.ok(notice);assert.equal(notice.subtitle,'','Default private body opt-out must hold in packaged script');
  send(protocol.op.VIEW,2,{[P.DB_MODE]:3,[P.DB_TOKEN]:music.token});await settle();assert.equal(frame().mode,3);
  const action={ [P.DB_TOKEN]:music.token,[P.DB_VERSION]:music.version,[P.DB_ACTION]:1};
  send(protocol.op.ACTION,3,action);await settle();send(protocol.op.ACTION,3,action);await settle();
  assert.equal(calls.length,1);assert.equal(calls[0].action,'set_playing');assert.equal(calls[0].args.on,false);assert.equal(frame().items[0].value,'Paused');
  send(protocol.op.VIEW,4,{[P.DB_MODE]:0});await settle();
  const find=frame().items.find(item=>item.title==='Find phone');assert.ok(find.flags&F.ACTION);
  send(protocol.op.ACTION,5,{[P.DB_TOKEN]:find.token,[P.DB_VERSION]:find.version,[P.DB_ACTION]:0});await settle();assert.equal(calls.at(-1).action,'ring');
  const currentTea=frame().items.find(item=>item.title==='Tea');
  send(protocol.op.OPEN,6,{[P.DB_TOKEN]:currentTea.token,[P.DB_VERSION]:currentTea.version});await settle();assert.equal(calls.at(-1).action,'launch_app');assert.equal(calls.at(-1).args.uuid,TIMER);
  noticePresent=false;emit('notifications');await settle();assert.equal(frame().items.some(item=>item.role===1),false);
  const defaults=settings.load(storage);const altered={...defaults,dark:true};settings.save(storage,altered);
  let replied;events.configmessage({data:{type:'reload_settings'},respond:value=>replied=value});await settle();assert.equal(replied.ok,true);
  send(protocol.op.VIEW,7,{[P.DB_MODE]:2,[P.DB_OFFSET]:0,[P.DB_INDEX]:0});await settle();assert.equal(frame().mode,2);assert.equal(frame().items.length,4);
  for(const value of storage.values.values()){assert.ok(!value.includes('Fictional track'));assert.ok(!value.includes('Fictional sender'));assert.ok(!value.includes('Private test text'));}
  let config;const configEvents={};vm.runInNewContext(fs.readFileSync(path.join(packed,'plugin.js'),'utf8'),{Pebble:{registerConfigHandler:fn=>config=fn},localStorage:storage,Promise,console},{filename:'packaged-dashboard-plugin.js',timeout:5000});
  config({type:'load_settings'},value=>configEvents.loaded=value);assert.equal(configEvents.loaded.ok,true);assert.equal(configEvents.loaded.settings.dark,true);
  storage.setItem('dashboard.settings.v1','unreadable');events.showConfiguration();await settle();
  assert.ok(decodeURIComponent(urls.at(-1)).includes('"needsRepair":true'),'Legacy configuration must visibly permit an explicit repair');
  assert.equal(storage.getItem('dashboard.settings.v1'),'unreadable','Opening a repair page must not save defaults');
  send(protocol.op.CANCEL,8);const count=calls.length;advance(120000);await settle();assert.equal(calls.length,count);
  const framesDir=path.join(root,'build/packaged-frames');fs.mkdirSync(framesDir,{recursive:true});
  for(const name of fs.readdirSync(framesDir))if(name.endsWith('.bin'))fs.unlinkSync(path.join(framesDir,name));
  const frames=sent.filter(message=>message[P.DB_DATA]);
  frames.forEach((message,index)=>fs.writeFileSync(path.join(framesDir,String(index).padStart(4,'0')+'.bin'),Buffer.from(message[P.DB_DATA])));
  const report={result:'PASS',scope:'Actual PBW phone and settings-plugin JavaScript executed with isolated fictional SDK sources/actions; not a live phone or physical watch test.',version:pkg.version,
    pbwSha256:crypto.createHash('sha256').update(fs.readFileSync(pbw)).digest('hex'),phoneSha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(packed,'pebble-js-app.js'))).digest('hex'),
    proofs:{realActivitiesProviderAndConsumer:true,overviewSevenItems:true,sourceCountdownAnchors:true,artworkBridge:true,privateBodyOptOut:true,musicCommandOnceAndConfirmedReading:true,findPhoneExplicitOnly:true,associatedAppDestination:true,notificationWithdrawal:true,liveSettingsReload:true,pagedPins:true,privateContentNeverPersisted:true,bundledSettingsPlugin:true,legacyRepairExplicitOnly:true,noCommandsAfterCancel:true},
    actualEncodedFrameCount:frames.length,mockInvocations:calls.map(call=>({plugin:call.plugin,action:call.action}))};
  const output=path.join(root,'docs/qa',pkg.version);fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'packaged-runtime.json'),JSON.stringify(report,null,2)+'\n');
  console.log('Packaged Dashboard runtime: PASS');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
