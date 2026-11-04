'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const sourcesModule=require('../src/pkjs/sources');
const createRuntime=require('../src/pkjs/runtime');
const createCommands=require('../src/pkjs/commands');
const createQueue=require('../src/pkjs/queue');
const settings=require('../src/pkjs/settings');
const protocol=require('../src/pkjs/protocol');
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
  const runtime=createRuntime({...time,pebble,storage,tokenSeed:100,createSources(){return {start(){},stop(){},snapshot:()=>data,refreshPaths(){},configuration:()=>Promise.resolve({plugins:[],instances:[],activities:[]})};}});
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
  const runtime=createRuntime({...time,pebble,storage,tokenSeed:100,createSources(options){changed=options.onChanged;return {start(){},stop(){},snapshot:()=>data,refreshPaths(){},configuration:()=>Promise.resolve({plugins:[],instances:[],activities:[]})};}});
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
