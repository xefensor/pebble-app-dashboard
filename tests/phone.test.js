'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const sourcesModule=require('../src/pkjs/sources');
const createRuntime=require('../src/pkjs/runtime');
const createCommands=require('../src/pkjs/commands');
const createQueue=require('../src/pkjs/queue');
const settings=require('../src/pkjs/settings');
const protocol=require('../src/pkjs/protocol');
const metadata=require('../src/pkjs/catalogue');
const {flag:F,MUSIC,FIND,NOTIFICATIONS,MUSIC_APP,NOTIFICATIONS_APP}=sourcesModule.constants;
const UUID='11111111-2222-4333-8444-555555555555';
const OTHER='22222222-2222-4333-8444-555555555555';
const T=1700000000000;
const prop=value=>({longText:{text:value}});
const bool=value=>({boolean:{value}});
function clock(){
  let time=T,id=0;const timers=new Map();
  return {now:()=>time,later:(fn,delay)=>{timers.set(++id,{fn,at:time+delay});return id;},cancelLater:key=>timers.delete(key),
    advance(ms){const until=time+ms;let loops=0;for(;;){const pending=[...timers.entries()].filter(([,v])=>v.at<=until).sort((a,b)=>a[1].at-b[1].at)[0];if(!pending)break;if(++loops>2000)throw Error('timer loop');time=pending[1].at;timers.delete(pending[0]);pending[1].fn();}time=until;},count:()=>timers.size};
}
async function flush(){for(let i=0;i<7;i++)await Promise.resolve();}
function host(cards=[]){return {createActivities(options){return {refresh(){options.onChanged();},catalogue:()=>cards,status:()=>({complete:true,error:''}),providers:()=>[],connectionChanged(){},stop(){}};}};}
function sdk(plugins=[]){
  const subscriptions=[],sent=[],invocations=[];
  return {subscriptions,sent,invocations,plugins,
    enumeratePlugins:()=>Promise.resolve(plugins),
    subscribeToSource(request){const entry={request,closed:false};subscriptions.push(entry);return {unsubscribe(){entry.closed=true;}};},
    sendAppMessage(message,ok){sent.push(message);if(ok)ok();},
    invokeAction(request){invocations.push(request);return Promise.resolve({ok:true});},
    emit(category,item,envelope,plugin){const entry=subscriptions.filter(s=>!s.closed&&s.request.category===category&&s.request.item===item&&(!plugin||s.request.plugin===plugin)).at(-1);assert.ok(entry,'missing subscription '+category+'/'+item);entry.request.onData(envelope);},
    fail(category,item,code){const entry=subscriptions.filter(s=>!s.closed&&s.request.category===category&&s.request.item===item).at(-1);entry.request.onError({code});}
  };
}
function plugin(uuid,category,item,actions=[]){return {uuid,name:category,sources:[{category,items:[item],properties:{name:['longText'],brightness:['numericValue'],on:['boolean']}}],actions};}
function musicPlugin(actions=['previous_track','set_playing','next_track']){return plugin(MUSIC,'music','track',actions.map(name=>({name,parameters:name==='set_playing'?{type:'object',properties:{on:{type:'boolean'}},required:['on']}:{type:'object',properties:{},required:[]}})));}
function envelope(pluginUuid,instances,validUntilMs=null){return {pluginUuid,instances,validUntilMs};}
function sourceFixture(prefs,plugins=[]){const time=clock(),pebble=sdk(plugins);let updates=0;const source=sourcesModule({...time,pebble,activitiesHost:host(),onChanged(){updates++;}});source.start(settings.normalize(prefs));return {time,pebble,source,updates:()=>updates};}
function minimal(pins=[]){return {version:1,dark:false,notificationPreview:false,showNotifications:true,activityOrder:[],disabledActivities:[],pins};}
function assertNotificationLauncher(item,subtitle='Open notifications'){
  assert.equal(item._identity,'builtin:notifications');assert.equal(item.title,'Notifications');assert.equal(item.name,'Notifications');
  assert.equal(item.subtitle,subtitle);assert.equal(item.appLabel,'Notifications');assert.equal(item.kind,protocol.kind.notification);assert.equal(item.role,1);
  assert.equal(item.flags,F.NOTIFICATION|F.APP);assert.equal(item.validUntil,0);assert.equal(item.value,'');assert.equal(item.actionLabel,'');
  assert.equal(item.clockMode,0);assert.equal(item.anchor,0);assert.equal(item.baseSeconds,0);assert.equal(item.image,undefined);assert.deepEqual(item._commands,[]);
  assert.equal(item._provider,undefined);assert.equal(item._sourceValidUntil,undefined);assert.equal(item._sourceSignature,undefined);assert.equal(item._instanceId,undefined);
  assert.deepEqual(item._openApp,{watchAppUuid:NOTIFICATIONS_APP,label:'Notifications'});
}
function decode(bytes){
  const b=Buffer.from(bytes),out={session:b.readUInt32LE(4),request:b.readUInt32LE(8),sequence:b.readUInt32LE(12),now:b.readUInt32LE(16),mode:b[20],status:b[21],total:b.readUInt16LE(24),offset:b.readUInt16LE(26),items:[]};let at=32;
  for(let i=0;i<b[22];i++){
    const item={token:b.readUInt32LE(at),version:b.readUInt32LE(at+4),validUntil:b.readUInt32LE(at+8),flags:b.readUInt16LE(at+12),kind:b[at+14],role:b[at+39]},lengths=[];
    for(let n=0;n<6;n++)lengths.push(b.readUInt16LE(at+24+n*2));const pixels=b.readUInt16LE(at+40),palette=b[at+38],controls=b.readUInt16LE(at+42);at+=44;
    ['title','subtitle','value','appLabel','actionLabel','name'].forEach((key,n)=>{item[key]=b.subarray(at,at+lengths[n]).toString();at+=lengths[n];});
    at+=controls+palette+pixels;out.items.push(item);
  }return out;
}
function native(pebble,op,session,request,fields={}){const message={DB_OPERATION:op,DB_SESSION:session,DB_REQUEST:request,...fields};return message;}
function runtimeFixture(prefs=minimal(),plugins=[]){
  const time=clock(),pebble=sdk(plugins),values=new Map([['dashboard.settings.v1',JSON.stringify(settings.normalize(prefs))]]);
  const storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
  const runtime=createRuntime({...time,pebble,storage,activitiesHost:host(),tokenSeed:100});
  runtime.ready();runtime.message(native(pebble,protocol.op.HELLO,55,1));time.advance(0);
  return {time,pebble,storage,runtime,frame:()=>decode(pebble.sent.filter(m=>m[protocol.keys.DB_DATA]).at(-1)[protocol.keys.DB_DATA])};
}
function pkjsConfigFixture(storage){
  const fs=require('node:fs'),vm=require('node:vm'),requireIndex=require('node:module').createRequire(require.resolve('../src/pkjs/index'));
  const time=clock(),pebble=sdk(),events={};let runtime;
  pebble.addEventListener=(name,handler)=>events[name]=handler;
  vm.runInNewContext(fs.readFileSync(require.resolve('../src/pkjs/index'),'utf8'),{
    Pebble:pebble,localStorage:storage,
    require(name){
      if(name==='./runtime')return options=>(runtime=createRuntime({...options,...time,activitiesHost:host()}));
      return requireIndex(name);
    }
  });
  return {time,pebble,events,get runtime(){return runtime;},receive(message){
    let response;events.configmessage({data:message,respond:value=>response=value});
    assert.notEqual(response,undefined,'synchronous settings handler must answer');return response;
  }};
}
function androidSettingsStores(prefs){
  // Stock Android PKJS restores a DOM snapshot once and mirrors writes to the
  // native store. The settings plugin reads that native store directly. SDK
  // teardown persists the DOM map wholesale, so a plugin-only write can be lost.
  const nativeValues=new Map([[settings.key,JSON.stringify(settings.normalize(prefs))]]),domValues=new Map(nativeValues);
  const pluginStorage={getItem:key=>nativeValues.get(key)??null,setItem:(key,value)=>nativeValues.set(key,value)};
  const pkjsStorage={getItem:key=>domValues.get(key)??null,setItem(key,value){domValues.set(key,value);nativeValues.set(key,value);}};
  return {nativeValues,domValues,pluginStorage,pkjsStorage,teardown(){
    const snapshot=[...domValues];nativeValues.clear();for(const [key,value] of snapshot)nativeValues.set(key,value);
  }};
}

test('installed activity discovery matches the real SDK declaration shape and pinned consumer without needing active cards',()=>{
  const api=require('pebble-activities/host'),summary=require('pebble-activities/summary');
  const providers=['summary','live','card','session'].map((item,index)=>({uuid:'11111111-2222-4333-8444-55555555555'+index,name:'Installed '+item,
    description:'Public provider',sources:[{category:'activity',items:[item],properties:summary.SOURCE_PROPERTIES,supportsMultiple:true,callerPermissions:[],suggestedRefreshIntervalSec:300}],actions:[]}));
  const wrong=[plugin(OTHER,'activity','summary'),plugin(UUID,'home','light')];
  const catalogue=metadata.fromPlugins([...providers,...wrong]);
  assert.deepEqual(catalogue.activities.filter(item=>item.key!=='builtin:music'),providers.map(plugin=>({key:plugin.uuid,name:plugin.name})));
  for(const plugin of [...providers,...wrong])assert.equal(catalogue.activities.some(item=>item.key===plugin.uuid),api.createActivities.compatible(plugin,3));
  assert.deepEqual(catalogue.instances,[]);assert.deepEqual(catalogue.activities.at(-1),{key:'builtin:music',name:'Music'});
});

test('configuration-only PKJS startup enumerates installed metadata without starting private or side-effecting sources',async()=>{
  const time=clock(),pebble=sdk([{uuid:UUID,name:'Idle Timer',sources:[{category:'activity',items:['summary'],properties:require('pebble-activities/summary').SOURCE_PROPERTIES}],actions:[]}]);
  let reads=0;pebble.readSource=()=>{reads++;throw Error('metadata must not read a source');};
  const values=new Map([['dashboard.settings.v1',JSON.stringify(minimal())]]),storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
  const runtime=createRuntime({...time,pebble,storage,activitiesHost:host()});runtime.ready();
  const catalogue=await runtime.catalogue(),configuration=await runtime.configuration();
  assert.deepEqual(catalogue.activities[0],{key:UUID,name:'Idle Timer'});assert.deepEqual(configuration.catalogue.activities,catalogue.activities);
  assert.equal(pebble.subscriptions.length,0);assert.equal(reads,0);assert.equal(pebble.invocations.length,0);assert.equal(time.count(),1,'only the bounded UI receipt wait is armed');
  assert.equal(pebble.sent.some(message=>message[protocol.keys.DB_DATA]),false);assert.deepEqual(settings.load(storage),settings.normalize(minimal()));
  assert.deepEqual(metadata.load(storage).activities,catalogue.activities);runtime.stop();
});

test('ordinary watch HELLO warms only public metadata for closed-watch plugin settings',async()=>{
  const declaration={uuid:UUID,name:'Idle Timer',sources:[{category:'activity',items:['summary'],properties:require('pebble-activities/summary').SOURCE_PROPERTIES}],actions:[{name:'stop',parameters:{type:'object',properties:{run:{type:'string'}},required:['run']}}]};
  const f=runtimeFixture(minimal(),[declaration]);await flush();f.time.advance(0);
  assert.equal(f.frame().items.filter(item=>item.role===0).length,0,'an installed provider need not have a current activity');
  f.pebble.emit('notifications','notification',envelope(NOTIFICATIONS,[{instanceId:'private-id',properties:{name:prop('Private sender'),body:prop('Secret body')}}]));
  const cached=f.storage.getItem(metadata.key);assert.ok(cached);assert.ok(!cached.includes('private-id'));assert.ok(!cached.includes('Private sender'));assert.ok(!cached.includes('Secret body'));
  f.runtime.stop();let receive;require('../src/plugin').register({registerConfigHandler:fn=>receive=fn},f.storage);
  let response;receive({type:'catalogue'},value=>response=value);assert.equal(response.ok,true);assert.equal(response.cached,true);assert.deepEqual(response.catalogue.activities[0],{key:UUID,name:'Idle Timer'});
  assert.deepEqual(response.catalogue.plugins[0].actions[0].parameters.required,['run']);assert.deepEqual(response.catalogue.instances,[]);assert.match(response.message,/Open Dashboard/);
});

test('actual PKJS configmessage serves metadata and preserves the prior public cache on discovery failure',async()=>{
  const fs=require('node:fs'),vm=require('node:vm'),requireIndex=require('node:module').createRequire(require.resolve('../src/pkjs/index'));
  const pebble=sdk([{uuid:UUID,name:'Idle Timer',sources:[{category:'activity',items:['summary'],properties:require('pebble-activities/summary').SOURCE_PROPERTIES}],actions:[]}]),events={};
  pebble.addEventListener=(name,handler)=>events[name]=handler;
  const values=new Map(),storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
  vm.runInNewContext(fs.readFileSync(require.resolve('../src/pkjs/index'),'utf8'),{Pebble:pebble,localStorage:storage,require:requireIndex});
  const receive=message=>new Promise(resolve=>events.configmessage({data:message,respond:resolve}));
  let result=await receive({type:'catalogue'});assert.equal(result.ok,true);assert.equal(result.cached,false);assert.deepEqual(result.catalogue.activities[0],{key:UUID,name:'Idle Timer'});
  const before=storage.getItem(metadata.key);pebble.enumeratePlugins=()=>Promise.reject(Error('service unavailable'));
  result=await receive({type:'catalogue'});assert.equal(result.ok,false);assert.match(result.message,/Retry discovery/);assert.equal(storage.getItem(metadata.key),before);
  assert.equal(pebble.subscriptions.length,0);assert.equal(pebble.invocations.length,0);assert.equal(storage.getItem('dashboard.settings.v1'),null,'discovery cannot write replacement preferences');
});

test('actual PKJS save keeps Weather in separate Android DOM and plugin stores after teardown',()=>{
  const stores=androidSettingsStores(settings.defaults()),f=pkjsConfigFixture(stores.pkjsStorage);
  let receivePlugin;require('../src/plugin').register({registerConfigHandler:fn=>receivePlugin=fn},stores.pluginStorage);
  const chosen=settings.defaults();chosen.pins[0].openApp={watchAppUuid:'61b22bc8-1e29-460d-a236-3fe409a439ff',label:'Weather'};
  chosen.dark=true;
  // Reproduce the old plugin-save/reload sequence against the two actual API
  // surfaces. Reload cannot refresh an already restored Android DOM snapshot.
  let pluginReply;receivePlugin({type:'save_settings',settings:chosen},value=>pluginReply=value);
  assert.equal(pluginReply.ok,true);assert.deepEqual(settings.load(stores.pluginStorage),chosen);
  assert.equal(f.receive({type:'reload_settings'}).ok,true);
  assert.equal(settings.load(stores.pkjsStorage).pins[0].openApp,undefined);
  stores.teardown();assert.equal(settings.load(stores.pluginStorage).pins[0].openApp,undefined);

  const response=f.receive({type:'save_settings',settings:chosen});
  assert.equal(response.ok,true);assert.deepEqual(response.settings,chosen);
  assert.deepEqual(settings.load(stores.pkjsStorage),chosen);
  receivePlugin({type:'load_settings'},value=>pluginReply=value);
  assert.equal(pluginReply.ok,true);assert.deepEqual(pluginReply.settings,chosen);
  f.runtime.stop();stores.teardown();
  receivePlugin({type:'load_settings'},value=>pluginReply=value);
  assert.deepEqual(pluginReply.settings,chosen,'closing PKJS must not restore the old app destination');
  assert.equal(f.pebble.subscriptions.length,0);assert.equal(f.pebble.invocations.length,0);
  assert.equal(f.pebble.sent.length,0);assert.equal(f.time.count(),0);
});

test('PKJS settings save rejects malformed payloads atomically and stopped runtimes stay terminal',()=>{
  const stores=androidSettingsStores(settings.defaults()),f=pkjsConfigFixture(stores.pkjsStorage);
  const nativeBefore=[...stores.nativeValues],domBefore=[...stores.domValues];
  for(const value of [undefined,null,{},[],{...settings.defaults(),pins:[{id:'invalid',label:'Invalid',openApp:{watchAppUuid:'not-a-uuid',label:'Weather'}}]}]){
    const response=f.receive({type:'save_settings',settings:value});assert.equal(response.ok,false);
    assert.deepEqual([...stores.nativeValues],nativeBefore);assert.deepEqual([...stores.domValues],domBefore);
  }
  f.runtime.stop();
  const chosen=settings.defaults();chosen.pins[0].openApp={watchAppUuid:'61b22bc8-1e29-460d-a236-3fe409a439ff',label:'Weather'};
  const response=f.receive({type:'save_settings',settings:chosen});
  assert.equal(response.ok,true);assert.deepEqual(response.settings,chosen);
  assert.deepEqual(settings.load(stores.pkjsStorage),chosen);assert.deepEqual(settings.load(stores.pluginStorage),chosen);
  f.events.ready();f.events.appmessage({payload:native(f.pebble,protocol.op.HELLO,55,1)});f.time.advance(120000);
  assert.equal(f.pebble.subscriptions.length,0);assert.equal(f.pebble.invocations.length,0);
  assert.equal(f.pebble.sent.length,0);assert.equal(f.time.count(),0);
});

test('closed settings plugin can save Weather without a PKJS context or watch work',()=>{
  const stores=androidSettingsStores(settings.defaults());let receive;
  require('../src/plugin').register({registerConfigHandler:fn=>receive=fn},stores.pluginStorage);
  const chosen=settings.defaults();chosen.pins[0].openApp={watchAppUuid:'61b22bc8-1e29-460d-a236-3fe409a439ff',label:'Weather'};
  let response;receive({type:'save_settings',settings:chosen},value=>response=value);
  assert.equal(response.ok,true);assert.deepEqual(response.settings,chosen);
  receive({type:'load_settings'},value=>response=value);assert.deepEqual(response.settings,chosen);
  assert.notEqual(stores.pkjsStorage.getItem(settings.key),stores.pluginStorage.getItem(settings.key),
    'fixture must retain distinct DOM and native stores rather than masking the SDK boundary');
});

test('public catalogue cache strips live fields and invocation arguments, bounds schemas and rejects unreadable oversized caches',()=>{
  const values=new Map(),storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
  const plugin={uuid:UUID,name:'Public provider',instances:[{instanceId:'private-instance'}],privateData:'Secret private content',
    sources:[{category:'activity',items:['summary'],properties:{schema_version:['numericValue']},envelope:{body:'Secret private content'}}],
    actions:[{name:'stop',args:{run:'private-run'},parameters:{type:'object',properties:{run:{type:'string',default:'private-default'}},required:['run']}}]};
  metadata.save(storage,{plugins:[plugin],instances:[{name:'Secret private content'}]});const stored=storage.getItem(metadata.key);
  for(const value of ['private-instance','Secret private content','private-run','private-default','instances','envelope'])assert.ok(!stored.includes(value));
  assert.deepEqual(metadata.load(storage).plugins[0].actions[0].parameters.required,['run']);
  const huge=Array.from({length:128},(_,index)=>({...plugin,uuid:'11111111-2222-4333-8444-'+String(index).padStart(12,'0'),name:'界'.repeat(96),actions:Array.from({length:64},(_,n)=>({name:'action'+n,description:'界'.repeat(384)}))}));
  assert.equal(metadata.save(storage,{plugins:huge}),true);assert.ok(Buffer.byteLength(storage.getItem(metadata.key),'utf8')<=metadata.limit);assert.equal(metadata.load(storage).activities.length,129,'bounded fallback still preserves every provider identity');
  storage.setItem(metadata.key,'x'.repeat(metadata.limit+1));assert.equal(metadata.load(storage),null);storage.setItem(metadata.key,'broken');assert.equal(metadata.load(storage),null);
});

test('oversized or deeply branching action schemas are omitted whole within a bounded traversal',()=>{
  let visited=0;const leaf={type:'string',description:'Public text'};
  // Reuse a public schema subtree, so traversing it without an aggregate budget
  // would expand a modest metadata graph into a much larger intermediate copy.
  const shared={type:'object',properties:Object.fromEntries(Array.from({length:128},(_,index)=>['field'+index,leaf]))};
  const broad={type:'object',properties:Object.fromEntries(Array.from({length:128},(_,index)=>['branch'+index,{get type(){visited++;return 'object';},properties:{nested:shared}}]))};
  const tooMany={type:'object',required:Array.from({length:129},(_,index)=>'required'+index),properties:{}};
  const catalogue=metadata.fromPlugins([{uuid:UUID,name:'Provider',sources:[],actions:[{name:'broad',parameters:broad},{name:'requirements',parameters:tooMany},{name:'safe',parameters:{type:'object',required:['id'],properties:{id:{type:'string'}}}}]}]);
  assert.deepEqual(catalogue.plugins[0].actions.map(action=>action.name),['safe']);assert.ok(visited<128,'budget stops before scanning every branch');
});

test('latest notification is current shade data on first launch, clears withdrawal and permission loss',async()=>{
  const {pebble,source}=sourceFixture(minimal());await flush();
  const request=pebble.subscriptions.find(s=>s.request.category==='notifications').request;
  assert.ok(!request.properties.includes('body'),'private body not requested when preview disabled');
  pebble.emit('notifications','notification',envelope(NOTIFICATIONS,[{instanceId:'newest',properties:{name:prop('Sam'),body:prop('Secret'),app:prop('Signal')}},{instanceId:'older',properties:{name:prop('Old')}}]));
  assert.equal(source.snapshot().notification.title,'Sam');assert.equal(source.snapshot().notification.subtitle,'');assert.equal(source.snapshot().notification._openApp.watchAppUuid,NOTIFICATIONS_APP);
  pebble.emit('notifications','notification',envelope(NOTIFICATIONS,[]));assertNotificationLauncher(source.snapshot().notification,'No notifications');
  pebble.emit('notifications','notification',envelope(NOTIFICATIONS,[{instanceId:'n',properties:{name:prop('Private')}}]));
  pebble.fail('notifications','notification','PERMISSION_DENIED');assertNotificationLauncher(source.snapshot().notification);
  source.stop();
});

test('notification launcher distinguishes known empty shade from unavailable or disabled previews without inventing observations',async()=>{
  const f=sourceFixture(minimal());await flush();assertNotificationLauncher(f.source.snapshot().notification);
  f.pebble.emit('notifications','notification',envelope(NOTIFICATIONS,[]));assertNotificationLauncher(f.source.snapshot().notification,'No notifications');
  f.source.connectionChanged(false);assertNotificationLauncher(f.source.snapshot().notification);assert.equal(f.source.snapshot().notification._connected,false);
  f.source.stop();
  const disabled=sourceFixture({...minimal(),showNotifications:false,notificationPreview:true});await flush();
  assert.equal(disabled.pebble.subscriptions.some(s=>s.request.category==='notifications'),false,'preview opt-out must not read message data');
  assertNotificationLauncher(disabled.source.snapshot().notification);disabled.source.stop();
});

test('withdrawn or expired private notice keeps a stable public launcher token with a fresh exact command binding',async()=>{
  const f=runtimeFixture({...minimal(),notificationPreview:true});await flush();f.time.advance(0);
  const waiting=f.frame().items.find(item=>item.role===1);assert.equal(waiting.validUntil,0);assert.equal(waiting.subtitle,'Open notifications');
  f.pebble.emit('notifications','notification',envelope(NOTIFICATIONS,[{instanceId:'private',properties:{name:prop('Private sender'),app:prop('Private app'),body:prop('Secret body')}}],T+10000));f.time.advance(0);
  const privateNotice=f.frame().items.find(item=>item.role===1);assert.equal(privateNotice.token,waiting.token);assert.ok(privateNotice.flags&F.PRIVATE);assert.equal(privateNotice.subtitle,'Secret body');
  f.pebble.emit('notifications','notification',envelope(NOTIFICATIONS,[]));f.time.advance(0);
  const empty=f.frame().items.find(item=>item.role===1);assert.equal(empty.token,privateNotice.token);assert.ok(empty.version>privateNotice.version);assert.equal(empty.flags,F.NOTIFICATION|F.APP);
  assert.equal(empty.title,'Notifications');assert.equal(empty.subtitle,'No notifications');assert.equal(empty.name,'Notifications');assert.equal(empty.validUntil,0);
  assert.ok(!JSON.stringify(f.frame()).includes('Private'));assert.ok(!JSON.stringify(f.frame()).includes('Secret'));
  f.runtime.message(native(f.pebble,protocol.op.OPEN,55,2,{DB_TOKEN:privateNotice.token,DB_VERSION:privateNotice.version}));await flush();assert.equal(f.pebble.invocations.length,0,'withdrawn private version cannot authorize a new binding');
  f.runtime.message(native(f.pebble,protocol.op.ACTION,55,3,{DB_TOKEN:empty.token,DB_VERSION:empty.version,DB_ACTION:0}));await flush();assert.equal(f.pebble.invocations.length,0,'public launcher has no plugin action');
  f.runtime.message(native(f.pebble,protocol.op.OPEN,55,4,{DB_TOKEN:empty.token,DB_VERSION:empty.version}));f.time.advance(0);await flush();f.time.advance(0);
  assert.equal(f.pebble.invocations.length,1);assert.equal(f.pebble.invocations[0].plugin,'00000000-0000-0000-0001-000000000007');assert.equal(f.pebble.invocations[0].action,'launch_app');assert.deepEqual(f.pebble.invocations[0].args,{uuid:NOTIFICATIONS_APP});
  assert.equal(f.frame().items.find(item=>item.role===1).validUntil,0,'pending/result feedback does not turn the public shell into a leased observation');
  f.pebble.emit('notifications','notification',envelope(NOTIFICATIONS,[{instanceId:'expires',properties:{name:prop('Expiring sender'),body:prop('Expiring body')}}],f.time.now()+2000));f.time.advance(2000);
  const expired=f.frame().items.find(item=>item.role===1);assert.equal(expired.token,empty.token);assert.equal(expired.subtitle,'Open notifications');assert.equal(expired.flags&F.PRIVATE,0);assert.equal(expired.validUntil,0);
  assert.ok(!JSON.stringify(f.frame()).includes('Expiring'));assert.ok(!f.storage.getItem('dashboard.settings.v1').includes('Secret'));f.runtime.stop();
});

test('notification permission and preview opt-out preserve app launch; launch permission failure is explicit without retry',async()=>{
  const f=runtimeFixture(minimal());await flush();f.pebble.emit('notifications','notification',envelope(NOTIFICATIONS,[{instanceId:'n',properties:{name:prop('Private sender')}}]));
  f.pebble.fail('notifications','notification','PERMISSION_DENIED');f.time.advance(0);const notice=f.frame().items.find(item=>item.role===1);
  assert.equal(notice.subtitle,'Open notifications');assert.equal(notice.flags&F.PRIVATE,0);
  f.pebble.invokeAction=request=>{f.pebble.invocations.push(request);return Promise.resolve({ok:false,code:'PERMISSION_DENIED'});};
  f.runtime.message(native(f.pebble,protocol.op.OPEN,55,2,{DB_TOKEN:notice.token,DB_VERSION:notice.version}));await flush();f.time.advance(0);
  assert.equal(f.pebble.invocations.length,1,'notification read denial does not preempt the independent app-launch permission');
  const results=f.pebble.sent.filter(message=>message[protocol.keys.DB_REQUEST]===2&&message[protocol.keys.DB_RESULT]);assert.equal(results.at(-1)[protocol.keys.DB_RESULT],protocol.result.PERMISSION);
  f.time.advance(30000);await flush();assert.equal(f.pebble.invocations.length,1,'permission failures never retry themselves');f.runtime.stop();
  const disabled=runtimeFixture({...minimal(),showNotifications:false});await flush();disabled.time.advance(0);
  const launcher=disabled.frame().items.find(item=>item.role===1);disabled.runtime.message(native(disabled.pebble,protocol.op.OPEN,55,2,{DB_TOKEN:launcher.token,DB_VERSION:launcher.version}));await flush();
  assert.equal(disabled.pebble.invocations.length,1);assert.equal(disabled.pebble.invocations[0].args.uuid,NOTIFICATIONS_APP);assert.equal(disabled.pebble.subscriptions.some(s=>s.request.category==='notifications'),false);disabled.runtime.stop();
});

test('offline notification shell cannot launch while an unrelated explicit command remains independently bound',async()=>{
  const f=runtimeFixture(minimal([{id:'find',label:'Find phone',builtin:'find-phone'}]),[plugin(FIND,'phone','find_my_phone',[{name:'ring'}])]);await flush();f.time.advance(0);
  f.runtime.connectionChanged(false);f.time.advance(0);const notice=f.frame().items.find(item=>item.role===1),pin=f.frame().items.find(item=>item.role===2);
  assert.equal(notice.subtitle,'Open notifications');assert.equal(notice.flags&F.PRIVATE,0);assert.equal(f.frame().status,protocol.status.OFFLINE);
  f.runtime.message(native(f.pebble,protocol.op.OPEN,55,2,{DB_TOKEN:notice.token,DB_VERSION:notice.version}));await flush();assert.equal(f.pebble.invocations.length,0);
  f.runtime.message(native(f.pebble,protocol.op.ACTION,55,3,{DB_TOKEN:pin.token,DB_VERSION:pin.version,DB_ACTION:0}));await flush();assert.equal(f.pebble.invocations.length,1);assert.equal(f.pebble.invocations[0].action,'ring');
  f.runtime.connectionChanged(true);await flush();f.time.advance(0);const connected=f.frame().items.find(item=>item.role===1);
  f.runtime.message(native(f.pebble,protocol.op.OPEN,55,4,{DB_TOKEN:connected.token,DB_VERSION:connected.version}));await flush();assert.equal(f.pebble.invocations.at(-1).args.uuid,NOTIFICATIONS_APP);f.runtime.stop();
});

test('Find phone discovery never subscribes to its side-effecting source; explicit marker resolves declared ring',async()=>{
  const {pebble,source}=sourceFixture(minimal([{id:'find',label:'Find phone',builtin:'find-phone'}]),[plugin(FIND,'phone','find_my_phone',[{name:'ring'}])]);await flush();
  assert.equal(pebble.subscriptions.some(s=>s.request.item==='find_my_phone'),false);
  assert.equal(pebble.invocations.length,0);const pin=source.snapshot().pins[0];assert.ok(pin.flags&F.ACTION);assert.equal(pin._commands[0].plugin,FIND);assert.equal(pin._commands[0].action,'ring');
  source.stop();
});

test('a brightness reading and toggle share one item but toggle uses its authoritative Boolean state',async()=>{
  const pin={id:'kitchen',label:'Kitchen',reading:{plugin:UUID,category:'home',item:'light',property:'brightness',instanceId:'3'},action:{plugin:UUID,action:'set_on',args:{},label:'Toggle',toggleProperty:'on'}};
  const declaration=plugin(UUID,'home','light',[{name:'set_on',parameters:{required:['on','instanceId','item'],properties:{on:{type:'boolean'},instanceId:{type:'string'},item:{type:'string'}}}}]);
  const {pebble,source}=sourceFixture(minimal([pin]),[declaration]);await flush();
  pebble.emit('home','light',envelope(UUID,[{instanceId:'3',properties:{brightness:{numericValue:{value:65,unit:'%'}},on:bool(false)}}]),UUID);
  let item=source.snapshot().pins[0];assert.equal(item.value,'65%');assert.equal(item._commands[0].args.on,true);assert.equal(item._commands[0].args.instanceId,'3');
  pebble.emit('home','light',envelope(UUID,[{instanceId:'3',properties:{brightness:{numericValue:{value:65,unit:'%'}}}}]),UUID);
  item=source.snapshot().pins[0];assert.equal(item.value,'65%');assert.equal(item.flags&F.ACTION,0,'brightness alone never invents an on/off state');
  source.stop();
});

test('exact instance and provider bindings never fall back to another entity',async()=>{
  const {pebble,source}=sourceFixture(minimal([{id:'pin',label:'Saved light',reading:{plugin:UUID,category:'home',item:'light',property:'brightness',instanceId:'saved'}}]),[plugin(UUID,'home','light')]);await flush();
  pebble.emit('home','light',envelope(UUID,[{instanceId:'other',properties:{brightness:{numericValue:{value:42,unit:'%'}}}}]),UUID);
  assert.ok(source.snapshot().pins[0].flags&F.UNAVAILABLE);assert.equal(source.snapshot().pins[0].value,'—');
  pebble.emit('home','light',envelope(OTHER,[{instanceId:'saved',properties:{brightness:{numericValue:{value:99}}}}]),UUID);
  assert.equal(source.snapshot().pins[0]._provider,null);source.stop();
});

test('Music controls require actual declared platform actions and use current playback state',async()=>{
  const {pebble,source}=sourceFixture(minimal(),[musicPlugin(['previous_track','set_playing'])]);await flush();
  pebble.emit('music','track',envelope(MUSIC,[{instanceId:'track',properties:{title:prop('Night Drive'),artist:prop('The Midnight'),playing:bool(true)}}]));
  const item=source.snapshot().activities[0];assert.ok(item.flags&F.MEDIA);assert.ok(item.flags&F.MEDIA_PREVIOUS);assert.ok(item.flags&F.MEDIA_TOGGLE);assert.equal(item.flags&F.MEDIA_NEXT,0);
  assert.deepEqual(item._commands[1].args,{on:false});assert.equal(item._openApp.watchAppUuid,MUSIC_APP);source.stop();
});

test('category names alone never bind a custom source to stock app destinations',async()=>{
  const {pebble,source}=sourceFixture(minimal(),[plugin(OTHER,'music','track',[{name:'next_track'}])]);await flush();
  pebble.emit('music','track',envelope(OTHER,[{instanceId:'track',properties:{title:prop('Custom service'),playing:bool(true)}}]));
  const item=source.snapshot().activities[0];assert.equal(item.flags&F.APP,0);assert.equal(item.flags&F.ACTION,0);
  const request=pebble.subscriptions.find(s=>s.request.category==='notifications').request;assert.equal(request.plugin,NOTIFICATIONS);
  pebble.emit('notifications','notification',envelope(OTHER,[{instanceId:'other-notice',properties:{name:prop('Not native history')}}]));
  assertNotificationLauncher(source.snapshot().notification);source.stop();
});

test('generic activity actions retain meaningful controls without pretending to be media',()=>{
  const card={provider:UUID,id:'run',revision:1,observedAt:T/1000,validUntil:T/1000+60,private:false,kind:'workout',state:'active',caption:'Workout',main:{type:'value',text:'6.2 km',validUntil:T/1000+60},actions:[{id:'stop',action:'stop',label:'Stop',args:{id:'run'}}]};
  const entry=sourcesModule.fromActivity(card,[plugin(UUID,'activity','summary',[{name:'stop',requiresConfirmation:true}])],T/1000);
  assert.equal(entry.flags&F.MEDIA,0);assert.ok(entry.flags&F.ACTION);assert.deepEqual(entry.controls,['Stop','','']);assert.ok(entry._commands[0].confirm);
});

test('public summary detail selection preserves countdown, elapsed and text compact semantics',()=>{
  const summary=require('pebble-activities/summary'),seconds=T/1000;
  function compact(record){return summary.toView({provider:UUID,record,revision:9,observedAt:seconds,validUntil:seconds+120,private:false});}
  const navigation=compact(summary.standard('nav',{name:'Directions',icon:'navigation',headline:summary.text('Oak Street'),detail:summary.countdown({deadline:seconds+45}),summary:'detail'}));
  const eta=sourcesModule.fromActivity(navigation,[],seconds);assert.equal(eta.title,'Oak Street');assert.equal(eta.name,'Directions');assert.equal(eta.clockMode,1);assert.equal(eta.anchor,seconds+45);assert.ok(eta.flags&F.COUNTDOWN);
  const workout=compact(summary.standard('workout',{name:'Workout',icon:'workout',headline:summary.text('Evening run'),detail:summary.elapsed({since:seconds-30,seconds:10}),summary:'detail'}));
  const elapsed=sourcesModule.fromActivity(workout,[],seconds);assert.equal(elapsed.title,'Evening run');assert.equal(elapsed.clockMode,2);assert.equal(elapsed.anchor,seconds-30);assert.equal(elapsed.baseSeconds,10);
  const message=compact(summary.standard('parcel',{name:'Parcel',headline:summary.text('Delivery today'),detail:summary.text('At the door'),summary:'detail'}));
  const detail=sourcesModule.fromActivity(message,[],seconds);assert.equal(detail.title,'At the door');assert.equal(detail.subtitle,'Delivery today');assert.equal(detail.name,'Parcel');
  const withShortLease={...navigation,validUntil:seconds+120,main:{...navigation.main,validUntil:seconds+100},support:{...navigation.support,validUntil:seconds+20}};
  assert.equal(sourcesModule.fromActivity(withShortLease,[],seconds)._sourceValidUntil,seconds+20,'chosen source lease cannot be renewed or exceeded');
  const expired=sourcesModule.fromActivity(withShortLease,[],seconds+21);assert.equal(expired.clockMode,0);assert.equal(expired.title,'Oak Street','expired optional detail is not kept running');
});

test('finite source expiry and disconnect clear private data without manufacturing a new observation',async()=>{
  const {pebble,source,time}=sourceFixture(minimal(),[musicPlugin()]);await flush();
  pebble.emit('music','track',envelope(MUSIC,[{instanceId:'track',properties:{title:prop('Track'),playing:bool(true)}}],T+2000));
  assert.equal(source.snapshot().activities[0]._sourceValidUntil,T/1000+2);time.advance(2001);assert.equal(source.snapshot().activities.length,0);
  pebble.emit('music','track',envelope(MUSIC,[{instanceId:'track',properties:{title:prop('Private'),playing:bool(true)}}]));
  source.connectionChanged(false);assert.equal(source.snapshot().activities.length,0);source.stop();
});

function executor(){
  const time=clock(),results=[],pending=[],pebble=sdk(),map={9:{version:3,valid:true,expiresAt:T/1000+90,actions:[{plugin:UUID,action:'toggle',args:{id:'light'},label:'Toggle'}],openApp:{watchAppUuid:MUSIC_APP}}};
  const commands=createCommands({...time,pebble,lookup:token=>map[token],sendResult:(...args)=>results.push(args),onPending:(...args)=>pending.push(args)});commands.start(55);
  return {time,results,pending,pebble,map,commands,request:{session:55,request:10,token:9,version:3,action:0,confirm:0}};
}
test('commands dispatch once, report progress and never optimistically mutate readings',async()=>{
  const {commands,pebble,results,pending,request,map}=executor();commands.execute(request,false);commands.execute(request,false);assert.equal(pebble.invocations.length,0);await flush();
  assert.equal(pebble.invocations.length,1);assert.deepEqual(pebble.invocations[0].args,{id:'light'});assert.ok(results.some(r=>r[1]===1));assert.ok(results.some(r=>r[1]===2));assert.deepEqual(pending[0],[9,true,false]);assert.equal(map[9].version,3);
  commands.execute(request,false);await flush();assert.equal(pebble.invocations.length,1);commands.stop();
});

test('recent command receipts remain bounded without limiting a long session or replaying evicted commands',async()=>{
  const f=executor();
  for(let index=0;index<200;index++){f.commands.execute({...f.request,request:10+index},false);await flush();}
  assert.equal(f.pebble.invocations.length,200);
  f.commands.execute(f.request,false);await flush();assert.equal(f.pebble.invocations.length,200,'evicted first receipt is still blocked by request high-water mark');assert.equal(f.results.at(-1)[1],4);
  f.commands.execute({...f.request,request:208},false);await flush();assert.equal(f.pebble.invocations.length,200,'recent cached receipt is also idempotent');
  f.commands.execute({...f.request,request:210},false);await flush();assert.equal(f.pebble.invocations.length,201,'old replay does not stop subsequent new actions');
  f.commands.start(56);f.commands.execute({...f.request,session:56,request:1},false);await flush();assert.equal(f.pebble.invocations.length,202,'new native session resets its request counter');f.commands.stop();
});

test('malformed action indices and confirmation flags are rejected before invocation or receipt allocation',async()=>{
  const f=executor();
  for(const action of ['0','',-1,NaN,Infinity,0.5,3,undefined,null])f.commands.execute({...f.request,action},false);
  for(const confirm of ['0','1','',-1,NaN,Infinity,0.5,2,null,undefined])f.commands.execute({...f.request,confirm},false);
  await flush();assert.equal(f.pebble.invocations.length,0);assert.equal(f.results.length,0);
  f.commands.execute(f.request,false);await flush();assert.equal(f.pebble.invocations.length,1,'malformed requests did not poison the valid request ID');f.commands.stop();
  const g=executor();g.commands.execute({...g.request,action:undefined},true);await flush();assert.equal(g.pebble.invocations.length,1,'OPEN alone permits the unused action field to be omitted');g.commands.stop();
});
test('withdrawal, cancellation and expiry before dispatch prevent the operation',async()=>{
  for(const mode of ['withdraw','cancel','expire','revise']){
    const f=executor();f.commands.execute(f.request,false);
    if(mode==='withdraw')delete f.map[9];else if(mode==='cancel')f.commands.stop();else if(mode==='revise')f.map[9].version++;else f.time.advance(90001);
    await flush();assert.equal(f.pebble.invocations.length,0,mode);f.commands.stop();
  }
});
test('destructive actions require explicit confirmation of the same command receipt',async()=>{
  const f=executor();f.map[9].actions[0].confirm=true;f.commands.execute(f.request,false);await flush();assert.equal(f.pebble.invocations.length,0);assert.equal(f.results.at(-1)[1],7);
  f.commands.execute({...f.request,confirm:1},false);await flush();assert.equal(f.pebble.invocations.length,1);f.commands.execute({...f.request,confirm:1},false);await flush();assert.equal(f.pebble.invocations.length,1);f.commands.stop();
});
test('permission failures and late timeout completions never retry commands',async()=>{
  const f=executor();let resolve;f.pebble.invokeAction=()=>{f.pebble.invocations.push(true);return new Promise(done=>resolve=done);};
  f.commands.execute(f.request,false);await flush();f.time.advance(8001);assert.equal(f.results.at(-1)[1],3);resolve({ok:true});await flush();assert.equal(f.results.at(-1)[1],3);assert.equal(f.pebble.invocations.length,1);f.commands.stop();
  const g=executor();g.pebble.invokeAction=()=>Promise.resolve({ok:false,code:'PERMISSION_DENIED'});g.commands.execute(g.request,false);await flush();assert.equal(g.results.at(-1)[1],5);g.commands.stop();
});
test('app opening uses exact declared destination and never changes exit reason',async()=>{
  const f=executor();f.commands.execute(f.request,true);await flush();assert.equal(f.pebble.invocations[0].action,'launch_app');assert.deepEqual(f.pebble.invocations[0].args,{uuid:MUSIC_APP});f.commands.stop();
});
test('one queue coalesces only unsent snapshots while command results retain FIFO',()=>{
  const sends=[],callbacks=[];const queue=createQueue((message,ok)=>{sends.push(message);callbacks.push(ok);});
  queue.send('frame1',null,null,'snapshot');queue.send('frame2',null,null,'snapshot');queue.send('result');queue.send('frame3',null,null,'snapshot');
  callbacks.shift()();assert.deepEqual(sends,['frame1','result']);callbacks.shift()();assert.deepEqual(sends,['frame1','result','frame3']);callbacks.shift()();assert.equal(queue.length(),0);
});
test('queue clear suppresses old callbacks but waits for its real in-flight send',()=>{
  const sends=[],callbacks=[];let obsolete=false;const queue=createQueue((message,ok)=>{sends.push(message);callbacks.push(ok);});
  queue.send('old',()=>obsolete=true);queue.clear();queue.send('new');assert.deepEqual(sends,['old']);callbacks.shift()();assert.deepEqual(sends,['old','new']);assert.equal(obsolete,false);callbacks.shift()();
});

test('runtime projects overview and bounded list pages, preserving tokens across reordering',async()=>{
  const pins=Array.from({length:12},(_,i)=>({id:'p'+i,label:'Pin '+i}));const f=runtimeFixture(minimal(pins));await flush();f.time.advance(0);
  assert.equal(f.frame().items.length,3);const token=f.frame().items.find(item=>item.title==='Pin 0').token;
  f.runtime.message(native(f.pebble,protocol.op.VIEW,55,2,{DB_MODE:2,DB_OFFSET:7,DB_INDEX:11}));assert.equal(f.frame().offset,7);assert.equal(f.frame().items.length,5);assert.equal(f.frame().total,12);
  const saved=settings.normalize({...minimal(pins),pins:[...pins].reverse()});settings.save(f.storage,saved);
  f.runtime.message(native(f.pebble,protocol.op.VIEW,55,3,{DB_MODE:0}));assert.equal(f.frame().items.find(p=>p.title==='Pin 0')?.token,undefined);
  f.runtime.message(native(f.pebble,protocol.op.VIEW,55,4,{DB_MODE:2,DB_OFFSET:7}));assert.equal(f.frame().items.find(p=>p.title==='Pin 0').token,token);f.runtime.stop();
});
test('same-session HELLO preserves requested list mode and media reconnect does not fall back to overview',async()=>{
  const f=runtimeFixture(minimal([{id:'pin',label:'Pin'}]));await flush();f.time.advance(0);
  f.runtime.message(native(f.pebble,protocol.op.VIEW,55,2,{DB_MODE:2,DB_OFFSET:0,DB_INDEX:0}));
  f.runtime.message(native(f.pebble,protocol.op.HELLO,55,3,{DB_MODE:2,DB_OFFSET:0,DB_INDEX:0}));assert.equal(f.frame().mode,2);
  f.runtime.message(native(f.pebble,protocol.op.HELLO,55,4,{DB_MODE:3,DB_TOKEN:999}));assert.equal(f.frame().mode,3);assert.equal(f.frame().items.length,0);assert.equal(f.frame().status,protocol.status.ERROR);f.runtime.stop();
});
test('native transport lease advances without changing null-TTL source version or storing private content',async()=>{
  const f=runtimeFixture(minimal(),[musicPlugin()]);await flush();f.pebble.emit('music','track',envelope(MUSIC,[{instanceId:'track',properties:{title:prop('Private song'),artist:prop('Artist'),playing:bool(true)}}]));f.time.advance(0);
  const first=f.frame().items[0];assert.equal(first.validUntil,T/1000+60);f.time.advance(30000);const next=f.frame().items[0];assert.equal(next.version,first.version);assert.equal(next.validUntil,T/1000+90);
  assert.equal(f.storage.getItem('Private song'),null);assert.ok(!f.storage.getItem('dashboard.settings.v1').includes('Private song'));
  f.runtime.message(native(f.pebble,protocol.op.CANCEL,55,3));f.time.advance(60000);assert.equal(f.pebble.invocations.length,0);f.runtime.stop();
});
test('pending projection does not invalidate its own command token/version',async()=>{
  const f=runtimeFixture(minimal([{id:'find',label:'Find phone',builtin:'find-phone'}]),[plugin(FIND,'phone','find_my_phone',[{name:'ring'}])]);await flush();f.time.advance(0);
  const pin=f.frame().items.find(item=>item.role===2);f.runtime.message(native(f.pebble,protocol.op.ACTION,55,2,{DB_TOKEN:pin.token,DB_VERSION:pin.version,DB_ACTION:0}));f.time.advance(0);await flush();
  assert.equal(f.pebble.invocations.length,1);assert.equal(f.pebble.invocations[0].action,'ring');f.time.advance(0);assert.equal(f.frame().items.find(item=>item.role===2).version,pin.version);f.runtime.stop();
});

test('runtime never normalizes malformed ACTION or CONFIRM values into a default action',async()=>{
  const f=runtimeFixture(minimal([{id:'find',label:'Find phone',builtin:'find-phone'}]),[plugin(FIND,'phone','find_my_phone',[{name:'ring'}])]);await flush();f.time.advance(0);
  const pin=f.frame().items.find(item=>item.role===2);let request=2;
  for(const [action,confirm] of [['0',0],['',0],[-1,0],[NaN,0],[undefined,0],[0,'0'],[0,NaN],[0,-1],[0,2]]){
    f.runtime.message(native(f.pebble,protocol.op.ACTION,55,request++,{DB_TOKEN:pin.token,DB_VERSION:pin.version,DB_ACTION:action,DB_CONFIRM:confirm}));
  }
  await flush();assert.equal(f.pebble.invocations.length,0);
  f.runtime.message(native(f.pebble,protocol.op.ACTION,55,request,{DB_TOKEN:pin.token,DB_VERSION:pin.version,DB_ACTION:0}));await flush();assert.equal(f.pebble.invocations.length,1);f.runtime.stop();
});

test('Snapshot has one activity, one notification and two pins while collections retain every item',()=>{
  const time=clock(),pebble=sdk(),values=new Map([['dashboard.settings.v1',JSON.stringify(minimal())]]),storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
  const entry=(id,role)=>({_identity:id,title:id,name:id,value:'',subtitle:'',appLabel:'',actionLabel:'',controls:[],kind:0,role,flags:0,
    validUntil:T/1000+120,_sourceValidUntil:T/1000+120,_provider:UUID,_commands:[]});
  const data={activities:Array.from({length:3},(_,i)=>entry('activity-'+i,0)),notification:entry('notice',1),pins:Array.from({length:6},(_,i)=>entry('pin-'+i,2)),loading:false,error:'',connected:true,available:true};
  const runtime=createRuntime({...time,pebble,storage,tokenSeed:100,createSources(){return {start(){},stop(){},snapshot:()=>data,refreshPaths(){},connectionChanged(){},configuration:()=>Promise.resolve({plugins:[],instances:[],activities:[]})};}});
  runtime.ready();runtime.message(native(pebble,protocol.op.HELLO,55,1));const frame=()=>decode(pebble.sent.filter(m=>m[protocol.keys.DB_DATA]).at(-1)[protocol.keys.DB_DATA]);
  assert.deepEqual(frame().items.map(item=>item.title),['activity-0','notice','pin-0','pin-1']);assert.deepEqual(frame().items.map(item=>item.role),[0,1,2,2]);assert.equal(frame().total,4);
  runtime.message(native(pebble,protocol.op.VIEW,55,2,{DB_MODE:1,DB_OFFSET:0}));assert.equal(frame().total,3);assert.equal(frame().items.length,3);
  runtime.message(native(pebble,protocol.op.VIEW,55,3,{DB_MODE:2,DB_OFFSET:1}));assert.equal(frame().total,6);assert.equal(frame().items.length,5);assert.equal(frame().offset,1);runtime.stop();
});

test('Music tap dispatches slot one directly from Snapshot and hold retains the verified Music destination',async()=>{
  const f=runtimeFixture(minimal(),[musicPlugin()]);await flush();f.pebble.emit('music','track',envelope(MUSIC,[{instanceId:'track',properties:{title:prop('Current song'),artist:prop('Artist'),playing:bool(true)}}]));f.time.advance(0);
  const music=f.frame().items[0];assert.equal(f.frame().mode,protocol.mode.OVERVIEW);assert.ok(music.flags&F.MEDIA_TOGGLE);
  const action={DB_TOKEN:music.token,DB_VERSION:music.version,DB_ACTION:1};f.runtime.message(native(f.pebble,protocol.op.ACTION,55,2,action));await flush();f.time.advance(0);
  assert.equal(f.pebble.invocations.length,1);assert.equal(f.pebble.invocations[0].action,'set_playing');assert.deepEqual(f.pebble.invocations[0].args,{on:false});assert.equal(f.frame().mode,protocol.mode.OVERVIEW,'no intermediate Dashboard media view');
  f.runtime.message(native(f.pebble,protocol.op.ACTION,55,2,action));await flush();assert.equal(f.pebble.invocations.length,1,'tap retry cannot toggle twice');
  f.runtime.message(native(f.pebble,protocol.op.OPEN,55,3,{DB_TOKEN:music.token,DB_VERSION:music.version}));await flush();assert.equal(f.pebble.invocations.at(-1).action,'launch_app');assert.equal(f.pebble.invocations.at(-1).args.uuid,MUSIC_APP);assert.equal(f.frame().mode,protocol.mode.OVERVIEW);f.runtime.stop();
});

test('an essential measurement exceeding native capacity is explicit, never a partial unit',()=>{
  const measurement=sourcesModule.text({numericValue:{value:12.34,unit:'a very long unit that cannot fit the native value field'}});
  assert.equal(sourcesModule.essentialValue(measurement),'Too long');
  assert.equal(sourcesModule.essentialValue('65%'),'65%');
  assert.equal(sourcesModule.essentialValue('ě'.repeat(25)),'Too long','capacity is UTF-8 bytes');
  const entry=sourcesModule.fromActivity({provider:UUID,id:'value',revision:1,validUntil:T/1000+60,main:{type:'value',text:'X'.repeat(45)+' some units'},kind:'activity',state:'active'},[]);
  assert.equal(entry.value,'Too long');
});

test('confirmed action cannot bypass another outstanding command',async()=>{
  const f=executor();let complete;f.map[9].actions.push({plugin:UUID,action:'other',args:{},label:'Other'});f.map[9].actions[0].confirm=true;
  f.pebble.invokeAction=request=>{f.pebble.invocations.push(request);return new Promise(done=>complete=done);};
  f.commands.execute(f.request,false);assert.equal(f.results.at(-1)[1],7);
  f.commands.execute({...f.request,request:11,action:1},false);await flush();assert.equal(f.pebble.invocations.length,1);
  f.commands.execute({...f.request,confirm:1},false);await flush();assert.equal(f.pebble.invocations.length,1);assert.equal(f.results.at(-1)[2],'Still working');
  complete({ok:true});await flush();f.commands.stop();
});

test('derived toggle rejects another target item even with the same instance ID',async()=>{
  const pin={id:'kitchen',label:'Kitchen',reading:{plugin:UUID,category:'home',item:'light',property:'brightness',instanceId:'3'},
    action:{plugin:UUID,action:'set_on',args:{item:'room_lights',instanceId:'3'},label:'Toggle',toggleProperty:'on'}};
  const {pebble,source}=sourceFixture(minimal([pin]),[plugin(UUID,'home','light',[{name:'set_on',parameters:{properties:{on:{type:'boolean'}}}}])]);await flush();
  pebble.emit('home','light',envelope(UUID,[{instanceId:'3',properties:{brightness:{numericValue:{value:65,unit:'%'}},on:bool(true)}}]),UUID);
  assert.equal(source.snapshot().pins[0].flags&F.ACTION,0);source.stop();
});

test('bad saved settings never subscribe using replacement defaults and explicit repair restarts sources',async()=>{
  const time=clock(),pebble=sdk(),values=new Map([['dashboard.settings.v1','{bad']]);
  const storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
  const runtime=createRuntime({...time,pebble,storage,activitiesHost:host()});runtime.ready();runtime.message(native(pebble,protocol.op.HELLO,55,1));time.advance(0);
  assert.equal(pebble.subscriptions.length,0);assert.equal((await runtime.configuration()).needsRepair,true);assert.equal(values.get('dashboard.settings.v1'),'{bad');
  runtime.configure(minimal());await flush();time.advance(0);assert.ok(pebble.subscriptions.length>0);assert.equal((await runtime.configuration()).needsRepair,false);runtime.stop();
});

test('real Activities summary provider reaches full Dashboard catalogue, clocks and commands without modifying ACT3',async()=>{
  const api=require('pebble-activities/host'),summary=require('pebble-activities/summary');
  const time=clock(),providerStore=new Map();let records=Array.from({length:3},(_,i)=>summary.standard('tea-'+i,{name:'Tea '+i,icon:'timer',
    headline:summary.countdown({deadline:T/1000+120+i*30}),openApp:{watchAppUuid:UUID},actions:[{id:'stop',label:'Stop',action:'stop',args:{run:'tea-'+i},semantic:'stop'}]}));
  const publisher=summary.defineProvider({pluginUuid:UUID,displayName:'Test timers',storage:{getItem:key=>providerStore.get(key)||null,setItem:(key,value)=>providerStore.set(key,value)},now:time.now,readCurrent:()=>records});
  const descriptor={uuid:UUID,name:'Test timers',sources:[{category:'activity',items:['summary'],properties:summary.SOURCE_PROPERTIES}],actions:[{name:'stop',parameters:{properties:{run:{type:'string'}},required:['run']}}]};
  const pebble=sdk([descriptor]),values=new Map([['dashboard.settings.v1',JSON.stringify(minimal())]]),storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
  const runtime=createRuntime({...time,pebble,storage,activitiesHost:api,tokenSeed:100});runtime.ready();runtime.message(native(pebble,protocol.op.HELLO,55,1));await flush();
  const first={pluginUuid:UUID,...await publisher.source({})};pebble.emit('activity','summary',first,UUID);time.advance(0);
  let frame=decode(pebble.sent.filter(m=>m[protocol.keys.DB_DATA]).at(-1)[protocol.keys.DB_DATA]);assert.equal(frame.items.length,2,'overview keeps one activity and the public notification shortcut');
  assert.equal(frame.items[0].kind,protocol.kind.timer);assert.ok(frame.items[0].flags&F.COUNTDOWN);assert.ok(frame.items[0].flags&F.ACTION);
  assert.equal(frame.items[0].validUntil,T/1000+60,'native transport lease is shorter than source validity');
  runtime.message(native(pebble,protocol.op.VIEW,55,2,{DB_MODE:1,DB_OFFSET:0}));frame=decode(pebble.sent.filter(m=>m[protocol.keys.DB_DATA]).at(-1)[protocol.keys.DB_DATA]);
  assert.equal(frame.total,3,'phone catalogue is not the two-card ACT3 projection');assert.equal(frame.items.length,3);
  runtime.message(native(pebble,protocol.op.ACTION,55,3,{DB_TOKEN:frame.items[0].token,DB_VERSION:frame.items[0].version,DB_ACTION:0}));await flush();assert.equal(pebble.invocations.at(-1).action,'stop');assert.deepEqual(pebble.invocations.at(-1).args,{run:'tea-0'});
  records=[];pebble.emit('activity','summary',{pluginUuid:UUID,...await publisher.source({})},UUID);time.advance(0);frame=decode(pebble.sent.filter(m=>m[protocol.keys.DB_DATA]).at(-1)[protocol.keys.DB_DATA]);assert.equal(frame.total,0);
  pebble.emit('activity','summary',first,UUID);time.advance(0);frame=decode(pebble.sent.filter(m=>m[protocol.keys.DB_DATA]).at(-1)[protocol.keys.DB_DATA]);assert.equal(frame.total,0,'older nonempty publication cannot resurrect after newer clear');runtime.stop();
});

test('native focus survives a source revision race, heartbeat and insertion without recentering a visible row',()=>{
  const time=clock(),pebble=sdk(),values=new Map([['dashboard.settings.v1',JSON.stringify(minimal())]]),storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
  const activity=i=>({_identity:'activity:'+i,title:'Activity '+i,name:'Provider',value:'',subtitle:'',appLabel:'',actionLabel:'',controls:[],kind:0,role:0,flags:0,
    validUntil:T/1000+120,_sourceValidUntil:T/1000+120,_provider:UUID,_commands:[]});
  let data={activities:Array.from({length:6},(_,i)=>activity(i)),notification:null,pins:[],loading:false,error:'',connected:true,available:true},changed;
  const runtime=createRuntime({...time,pebble,storage,tokenSeed:100,createSources(options){changed=options.onChanged;return {start(){},stop(){},snapshot:()=>data,refreshPaths(){},connectionChanged(){},configuration:()=>Promise.resolve({plugins:[],instances:[],activities:[]})};}});
  runtime.ready();runtime.message(native(pebble,protocol.op.HELLO,55,1));
  runtime.message(native(pebble,protocol.op.VIEW,55,2,{DB_MODE:1,DB_OFFSET:0,DB_INDEX:0,DB_TOKEN:100}));
  const frame=()=>decode(pebble.sent.filter(m=>m[protocol.keys.DB_DATA]).at(-1)[protocol.keys.DB_DATA]);const focused=frame().items[4],sentBefore=pebble.sent.length;
  data={...data,activities:data.activities.map((item,index)=>index===4?{...item,title:'Updated activity 4'}:item)};changed();
  runtime.message(native(pebble,protocol.op.FOCUS,55,2,{DB_MODE:1,DB_OFFSET:0,DB_INDEX:4,DB_TOKEN:focused.token,DB_VERSION:focused.version}));
  assert.equal(pebble.sent.length,sentBefore,'focus synchronization alone sends no repaint or new page');
  time.advance(0);assert.equal(frame().offset,0);assert.equal(frame().items[4].token,focused.token);assert.equal(frame().items[4].version,focused.version+1,'older focus version still identifies the same current item');
  time.advance(30000);assert.equal(frame().offset,0,'heartbeat does not recenter a focused last visible row');
  data={...data,activities:[activity('new'),...data.activities]};changed();time.advance(0);
  assert.ok(frame().items.some(item=>item.token===focused.token),'new page retains actual native focus, not the old phone anchor');assert.equal(frame().offset,1);
  time.advance(30000);assert.equal(frame().offset,1,'heartbeat retains the already visible window');runtime.stop();
});

test('source callbacks that never arrive leave a bounded loading state and recover on later data',async()=>{
  const {source,time,pebble}=sourceFixture(minimal(),[musicPlugin()]);await flush();assert.equal(source.snapshot().loading,true);
  time.advance(8001);assert.equal(source.snapshot().loading,false);assert.equal(source.snapshot().error,'SOURCE_TIMEOUT');
  pebble.emit('music','track',envelope(MUSIC,[{instanceId:'track',properties:{title:prop('Available now'),playing:bool(true)}}]));
  pebble.emit('notifications','notification',envelope(NOTIFICATIONS,[]));assert.equal(source.snapshot().error,'');source.stop();
});

test('disconnect cancels discovery and late callbacks; stopped sources cannot resurrect on connection events',async()=>{
  const time=clock(),pebble=sdk();let enumerations=0,resolve;
  pebble.enumeratePlugins=()=>{enumerations++;return new Promise(done=>resolve=done);};
  const source=sourcesModule({...time,pebble,activitiesHost:host()});source.start(settings.normalize(minimal()));
  const initial=pebble.subscriptions.length;
  source.connectionChanged(true);source.connectionChanged(true);
  assert.equal(pebble.subscriptions.length,initial);assert.equal(enumerations,1);
  source.connectionChanged(false);assert.ok(pebble.subscriptions.every(entry=>entry.closed));assert.equal(time.count(),0);
  resolve([musicPlugin()]);await flush();time.advance(180000);await flush();
  assert.equal(enumerations,1,'offline catalogue polling stays stopped');assert.equal(time.count(),0);
  source.start(settings.normalize(minimal()));assert.equal(pebble.subscriptions.length,initial,'settings reload cannot subscribe while disconnected');
  source.connectionChanged(true);assert.equal(pebble.subscriptions.length,initial*2);assert.equal(enumerations,2);
  source.stop();source.connectionChanged(false);source.connectionChanged(true);await flush();
  assert.equal(pebble.subscriptions.length,initial*2,'stopped watch runtime stays stopped');assert.equal(time.count(),0);
});

test('explicitly hidden Music does not subscribe unless a configured pin reads it',async()=>{
  const prefs={...minimal(),disabledActivities:['builtin:music']};
  const hidden=sourceFixture(prefs);await flush();assert.equal(hidden.pebble.subscriptions.some(entry=>entry.request.category==='music'),false);hidden.source.stop();
  const pinned=sourceFixture({...prefs,pins:[{id:'album',label:'Album',reading:{category:'music',item:'track',property:'album'}}]});await flush();
  assert.equal(pinned.pebble.subscriptions.filter(entry=>entry.request.category==='music').length,1);pinned.source.stop();
});

test('refresh bursts coalesce and an older read cannot overwrite a subscription update or permission loss',async()=>{
  const pin={id:'light',label:'Light',reading:{plugin:UUID,category:'home',item:'light',property:'brightness'}};
  const f=sourceFixture(minimal([pin]),[plugin(UUID,'home','light')]);await flush();
  const reads=[];f.pebble.readSource=()=>new Promise(resolve=>reads.push(resolve));
  const value=n=>envelope(UUID,[{instanceId:'1',properties:{brightness:{numericValue:{value:n,unit:'%'}}}}]);
  f.pebble.emit('home','light',value(10),UUID);
  for(let n=0;n<8;n++)f.source.refreshPaths(['home/light']);
  assert.equal(reads.length,1,'one read remains in flight');
  f.pebble.emit('home','light',value(20),UUID);reads[0](value(10));await flush();
  assert.equal(f.source.snapshot().pins[0].value,'20%');assert.equal(reads.length,2,'one follow-up covers the whole later burst');
  reads[1](value(20));await flush();assert.equal(reads.length,2);
  f.source.refreshPaths(['home/light']);f.pebble.fail('home','light','PERMISSION_DENIED');reads[2](value(90));await flush();
  assert.equal(f.source.snapshot().pins[0].value,'—');assert.equal(f.source.snapshot().pins[0].subtitle,'Allow access');
  f.source.stop();assert.equal(f.time.count(),0);
});

test('a timed-out refresh releases the coalescing slot and late responses cannot replace a newer read',async()=>{
  const pin={id:'light',label:'Light',reading:{plugin:UUID,category:'home',item:'light',property:'brightness'}};
  const f=sourceFixture(minimal([pin]),[plugin(UUID,'home','light')]);await flush();const reads=[];
  f.pebble.readSource=()=>new Promise(resolve=>reads.push(resolve));
  const value=n=>envelope(UUID,[{instanceId:'1',properties:{brightness:{numericValue:{value:n}}}}]);
  f.pebble.emit('home','light',value(10),UUID);
  f.source.refreshPaths(['home/light']);f.source.refreshPaths(['home/light']);f.time.advance(8000);
  assert.equal(reads.length,2);reads[1](value(30));await flush();reads[0](value(5));await flush();
  assert.equal(f.source.snapshot().pins[0].value,'30');f.source.stop();assert.equal(f.time.count(),0);
});

test('static local/action Snapshot sends no heartbeat frames while live transport leases still use the heartbeat',async()=>{
  const prefs={...minimal([{id:'watch',label:'Watch',reading:{category:'watch-local',item:'battery',property:'level'}},{id:'find',label:'Find phone',builtin:'find-phone'}]),showNotifications:false,disabledActivities:['builtin:music']};
  const f=runtimeFixture(prefs,[plugin(FIND,'phone','find_my_phone',[{name:'ring'}])]);await flush();f.time.advance(0);
  const before=f.pebble.sent.filter(message=>message[protocol.keys.DB_DATA]).length;
  f.time.advance(300000);await flush();f.time.advance(0);
  assert.equal(f.pebble.sent.filter(message=>message[protocol.keys.DB_DATA]).length,before,'ten unchanged heartbeat snapshots suppressed');
  assert.equal(f.pebble.subscriptions.length,0);f.runtime.stop();
  f.runtime.connectionChanged(false);f.runtime.connectionChanged(true);assert.equal(f.pebble.subscriptions.length,0);assert.equal(f.time.count(),0);
});

test('same-session reconnect replaces source handles once and stale confirmation cannot authorize a new binding',async()=>{
  const prefs={...minimal([{id:'device',label:'Device',action:{plugin:UUID,action:'erase',args:{id:'saved'},label:'Erase',confirm:true}}]),showNotifications:false};
  const f=runtimeFixture(prefs,[plugin(UUID,'home','light',[{name:'erase',parameters:{type:'object',properties:{id:{type:'string'}},required:['id']}}])]);await flush();f.time.advance(0);
  const initialSubscriptions=f.pebble.subscriptions.length;
  const before=f.frame().items.find(item=>item.role===2);f.runtime.message(native(f.pebble,protocol.op.ACTION,55,2,{DB_TOKEN:before.token,DB_VERSION:before.version,DB_ACTION:0}));
  assert.equal(f.pebble.sent.at(-1)[protocol.keys.DB_RESULT],protocol.result.CONFIRM);
  f.runtime.message(native(f.pebble,protocol.op.HELLO,55,3));await flush();f.time.advance(0);
  const after=f.frame().items.find(item=>item.role===2);assert.equal(after.token,before.token);assert.ok(after.version>before.version);
  assert.equal(f.pebble.subscriptions.length,initialSubscriptions*2);assert.ok(f.pebble.subscriptions.slice(0,initialSubscriptions).every(entry=>entry.closed));
  const version=after.version;f.runtime.message(native(f.pebble,protocol.op.HELLO,55,3));await flush();f.time.advance(0);
  assert.equal(f.frame().items.find(item=>item.role===2).version,version,'duplicate handshake does not rebaseline');
  assert.equal(f.pebble.subscriptions.length,initialSubscriptions*2);
  f.runtime.message(native(f.pebble,protocol.op.ACTION,55,2,{DB_TOKEN:before.token,DB_VERSION:before.version,DB_ACTION:0,DB_CONFIRM:1}));await flush();
  assert.equal(f.pebble.invocations.length,0);assert.equal(f.pebble.sent.at(-1)[protocol.keys.DB_RESULT],protocol.result.STALE);
  f.runtime.message(native(f.pebble,protocol.op.ACTION,55,4,{DB_TOKEN:after.token,DB_VERSION:after.version,DB_ACTION:0}));
  f.runtime.message(native(f.pebble,protocol.op.ACTION,55,4,{DB_TOKEN:after.token,DB_VERSION:after.version,DB_ACTION:0,DB_CONFIRM:1}));await flush();
  assert.equal(f.pebble.invocations.length,1);assert.deepEqual(f.pebble.invocations[0].args,{id:'saved'});f.runtime.stop();
});

test('twenty unchanged source deliveries keep one exact expiry timer; expiry and permission withdrawal still clear it',async()=>{
  const time=clock(),pebble=sdk([musicPlugin()]);let registrations=0,cancellations=0;
  const source=sourcesModule({...time,pebble,activitiesHost:host(),
    later(fn,delay){registrations++;return time.later(fn,delay);},
    cancelLater(timer){cancellations++;time.cancelLater(timer);}});
  source.start(settings.normalize(minimal()));await flush();
  const value=envelope(MUSIC,[{instanceId:'track',properties:{title:prop('Finite track'),playing:bool(true)}}],T+5000);
  pebble.emit('music','track',value);const before=[registrations,cancellations];
  for(let n=0;n<20;n++)pebble.emit('music','track',value);
  assert.deepEqual([registrations,cancellations],before,'unchanged absolute expiry needs no timer replacement');
  time.advance(5000);assert.equal(source.snapshot().activities.length,0);assert.equal(source.snapshot().error,'SOURCE_EXPIRED');
  pebble.emit('music','track',envelope(MUSIC,value.instances,time.now()+5000));const beforeWithdrawal=cancellations;
  pebble.fail('music','track','PERMISSION_DENIED');assert.equal(cancellations,beforeWithdrawal+1);
  assert.equal(source.snapshot().activities.length,0);time.advance(5000);assert.equal(source.snapshot().activities.length,0);
  source.stop();assert.equal(time.count(),0);
});

test('post-stop settings save, reload and catalogue reads remain useful without restarting watch/source work',async()=>{
  const f=runtimeFixture();await flush();f.time.advance(0);f.runtime.stop();
  const subscriptions=f.pebble.subscriptions.length,messages=f.pebble.sent.length;
  const defaults=settings.defaults();assert.deepEqual(f.runtime.configure(defaults),defaults);
  assert.deepEqual(settings.load(f.storage),defaults,'explicit settings save still works after watch shutdown');
  const changed={...defaults,dark:true};settings.save(f.storage,changed);
  assert.deepEqual(f.runtime.reloadSettings(),changed);
  const config=await f.runtime.configuration();assert.deepEqual(config.settings,changed);assert.ok(config.catalogue.activities.length);
  f.runtime.message(native(f.pebble,protocol.op.HELLO,88,1));f.runtime.connectionChanged(false);f.runtime.connectionChanged(true);
  f.time.advance(120000);await flush();
  assert.equal(f.pebble.subscriptions.length,subscriptions);assert.ok(f.pebble.subscriptions.every(entry=>entry.closed));
  assert.equal(f.pebble.sent.length,messages);assert.equal(f.time.count(),0);
});

test('hidden provider avoids activity subscriptions while its explicit reading pin and instance-only exclusions stay independent',async()=>{
  const summary=require('pebble-activities/summary'),realHost=require('pebble-activities/host');
  const declaration={uuid:UUID,name:'Device provider',sources:[{category:'activity',items:['summary'],properties:summary.SOURCE_PROPERTIES},{category:'home',items:['light'],properties:{brightness:['numericValue']}}],actions:[]};
  const pin={id:'light',label:'Light',reading:{plugin:UUID,category:'home',item:'light',property:'brightness'}};
  const time=clock(),pebble=sdk([declaration]);const source=sourcesModule({...time,pebble,activitiesHost:realHost});
  source.start(settings.normalize({...minimal([pin]),showNotifications:false,disabledActivities:[UUID,'builtin:music']}));await flush();time.advance(0);await flush();
  assert.equal(pebble.subscriptions.filter(entry=>entry.request.category==='activity').length,0,'provider visibility policy prevents the activity read entirely');
  assert.equal(pebble.subscriptions.filter(entry=>entry.request.category==='home'&&!entry.closed).length,1);
  pebble.emit('home','light',envelope(UUID,[{instanceId:'lamp',properties:{brightness:{numericValue:{value:70,unit:'%'}}}}]),UUID);
  assert.equal(source.snapshot().pins[0].value,'70%');source.stop();assert.equal(time.count(),0);
  source.start(settings.normalize({...minimal([pin]),showNotifications:false,disabledActivities:['activity:'+UUID+':one','builtin:music']}));await flush();time.advance(0);await flush();
  assert.equal(pebble.subscriptions.filter(entry=>entry.request.category==='activity'&&!entry.closed).length,1,'one hidden instance must not disable its whole provider');
  assert.equal(pebble.subscriptions.filter(entry=>entry.request.category==='home'&&!entry.closed).length,1);source.stop();assert.equal(time.count(),0);
});

test('standard activity with a media icon keeps its typed countdown and generic controls',()=>{
  const summary=require('pebble-activities/summary'),seconds=T/1000;
  const record=summary.standard('recording',{name:'Recorder',icon:'media',headline:summary.countdown({deadline:seconds+45}),
    actions:[{id:'stop',label:'Stop',action:'stop',args:{id:'recording'},semantic:'stop'}],openApp:{watchAppUuid:OTHER}});
  const card=summary.toView({provider:UUID,record,revision:1,observedAt:seconds,validUntil:seconds+120,private:false});
  assert.notEqual(card.presentation,2);assert.equal(card.kind,'media');
  const entry=sourcesModule.fromActivity(card,[plugin(UUID,'activity','summary',[{name:'stop'}])],seconds);
  assert.equal(entry.flags&F.MEDIA,0);assert.equal(entry.clockMode,1);assert.equal(entry.anchor,seconds+45);
  assert.equal(entry.title,'Recorder');assert.deepEqual(entry.controls,['Stop','','']);assert.equal(entry._openApp.watchAppUuid,OTHER);
  const bytes=Buffer.from(protocol.encode({session:1,request:1,sequence:1,now:seconds,mode:0,status:1,total:1,items:[{...entry,token:1,version:1}]}));
  assert.equal(bytes.readUInt16LE(44)&F.MEDIA,0);assert.equal(bytes[46],protocol.kind.media);assert.equal(bytes[47],1);assert.equal(bytes.readUInt32LE(48),seconds+45);
});

test('provider default order promotes running soonest countdowns while explicit instance priority wins',async()=>{
  const seconds=T/1000;
  const card=(id,state,deadline)=>({provider:UUID,id,kind:'timer',state,revision:1,observedAt:seconds,validUntil:seconds+3600,
    showTerminal:state==='completed',caption:id,main:{type:'clock',mode:'deadline',running:state==='active',anchorAt:seconds,baseSeconds:deadline-seconds,validUntil:seconds+3600},openApp:{watchAppUuid:OTHER}});
  const cards=[card('Tea','active',seconds+600),card('Paused','paused',seconds+10),card('Done','completed',seconds),card('Pasta','active',seconds+500)];
  const time=clock(),pebble=sdk([plugin(UUID,'activity','summary')]);const source=sourcesModule({...time,pebble,activitiesHost:host(cards)});
  const prefs={...minimal(),disabledActivities:['builtin:music'],showNotifications:false};
  source.start(settings.normalize(prefs));await flush();
  assert.deepEqual(source.snapshot().activities.map(entry=>entry._activityId),['Pasta','Tea','Paused','Done']);
  source.start(settings.normalize({...prefs,activityOrder:['activity:'+UUID+':Tea',UUID]}));await flush();
  assert.deepEqual(source.snapshot().activities.map(entry=>entry._activityId),['Tea','Pasta','Paused','Done']);source.stop();
});

test('default countdown ranking preserves other providers and text positions and carries exact destinations',async()=>{
  const seconds=T/1000;
  const card=(id,provider,main)=>({provider,id,kind:'activity',state:'active',revision:1,validUntil:seconds+3600,name:id,main,openApp:{watchAppUuid:id==='Pasta'?OTHER:UUID}});
  const countdown=n=>({type:'clock',mode:'deadline',running:true,anchorAt:seconds,baseSeconds:n,validUntil:seconds+3600});
  const text={type:'text',text:'Text activity',validUntil:seconds+3600};
  const cards=[card('Tea',UUID,countdown(600)),card('Other provider',OTHER,text),card('Note',UUID,text),card('Pasta',UUID,countdown(500))];
  const time=clock(),pebble=sdk([plugin(UUID,'activity','summary'),plugin(OTHER,'activity','summary')]);const source=sourcesModule({...time,pebble,activitiesHost:host(cards)});
  const prefs={...minimal(),disabledActivities:['builtin:music'],showNotifications:false};source.start(settings.normalize(prefs));await flush();
  assert.deepEqual(source.snapshot().activities.map(entry=>entry._activityId),['Pasta','Other provider','Note','Tea']);
  assert.equal(source.snapshot().activities[0]._openApp.watchAppUuid,OTHER);
  source.start(settings.normalize({...prefs,activityOrder:[OTHER,UUID]}));await flush();
  assert.deepEqual(source.snapshot().activities.map(entry=>entry._activityId),['Other provider','Pasta','Note','Tea']);source.stop();
});

test('unrelated malformed declarations cannot suppress a valid activity action or Music source',async()=>{
  const seconds=T/1000,card={provider:UUID,id:'go',revision:1,state:'active',kind:'activity',validUntil:seconds+60,main:{type:'text',text:'Route',validUntil:seconds+60},actions:[{id:'go',label:'Go',action:'go',args:{}}]};
  const entry=sourcesModule.fromActivity(card,[{uuid:UUID,actions:[null,12,{name:'go'}]}],seconds);
  assert.equal(entry.controls[0],'Go');assert.equal(entry._commands[0].action,'go');
  const declaration=musicPlugin();declaration.sources.unshift(null,17);
  const f=sourceFixture(minimal(),[declaration]);await flush();
  f.pebble.emit('music','track',envelope(MUSIC,[{instanceId:'track',properties:{title:prop('Present song'),playing:bool(true)}}]));
  assert.equal(f.source.snapshot().activities[0].title,'Present song');f.source.stop();
});
