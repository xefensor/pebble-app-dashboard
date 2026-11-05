'use strict';

var protocol = require('./protocol');
var settingsModel = require('./settings');
var createSources = require('./sources');
var createCommands = require('./commands');
var createQueue = require('./queue');
var metadata = require('./catalogue');
var F = protocol.flag, M = protocol.mode, S = protocol.status, O = protocol.op;
function positive(value) { return typeof value === 'number' && isFinite(value) && Math.floor(value) === value && value > 0 && value <= 2147483647; }
function bounded(value, limit) { return typeof value === 'number' && isFinite(value) && Math.floor(value) === value && value >= 0 && value <= limit; }
function copy(value) { return JSON.parse(JSON.stringify(value)); }

module.exports = function createRuntime(options) {
  options = options || {};
  var pebble=options.pebble, now=options.now || Date.now, later=options.later || setTimeout, cancel=options.cancelLater || clearTimeout;
  var prefs=settingsModel.load(options.storage), settingsError=!prefs;
  if (!prefs) prefs=settingsModel.defaults(); // Rendering fallback only; never a repair write.
  var session=0,sequence=0,nextToken=1,view=null,stopped=false,started=false,heartbeat=null,publishTimer=null,connected=true,bindingEpoch=0;
  var identities=Object.create(null),bindings=Object.create(null),feedback=Object.create(null),lastFrameSignature='';
  var queue=createQueue(function(message,success,failure){pebble.sendAppMessage(message,success,failure);});
  var sources=(options.createSources || createSources)({pebble:pebble,storage:options.storage,now:now,later:later,cancelLater:cancel,
    activitiesHost:options.activitiesHost,onChanged:function(){schedulePublish();}});
  function result(request,value,text) {
    if(!session)return;
    var message={};message[protocol.keys.DB_SESSION]=session;message[protocol.keys.DB_REQUEST]=request;
    message[protocol.keys.DB_RESULT]=value;message[protocol.keys.DB_TEXT]=protocol.text(text || '',64);
    queue.send(message);
  }
  var commands=createCommands({pebble:pebble,now:now,later:later,cancelLater:cancel,lookup:function(token){
    // Rebuild against the current authoritative catalogue immediately before
    // dispatch. A retracted or revised source cannot retain an executable token.
    materialize();return bindings[token] || null;
  },sendResult:result,onPending:function(token,pending,failed){feedback[token]={pending:pending,failed:failed};schedulePublish();},
    onRefresh:function(paths,binding){sources.refreshPaths(paths,binding);}});
  function message(kind, values) {
    var out={};out[protocol.keys.DB_OPERATION]=kind;
    Object.keys(values || {}).forEach(function(name){out[protocol.keys[name]]=values[name];});return out;
  }
  function sourceSignature(entry) {
    // Transport leases and command progress are not source revisions. Excluding
    // them preserves the identity of a still-current item while time advances.
    var stable=copy(entry);delete stable.validUntil;delete stable.token;delete stable.version;
    stable.flags &= ~(F.PENDING|F.FAILED);return JSON.stringify([bindingEpoch,stable]);
  }
  function display(raw) {
    var entry=copy(raw), signature=sourceSignature(raw), identity=identities[raw._identity];
    if (!identity) {
      if (nextToken > 2147483647) throw new Error('TOKEN_EXHAUSTED');
      identity=identities[raw._identity]={token:nextToken++,version:1,signature:signature};
    } else if(identity.signature!==signature) {
      identity.version=identity.version===2147483647?1:identity.version+1;identity.signature=signature;
    }
    entry.token=identity.token;entry.version=identity.version;
    var finite=raw._sourceValidUntil, sourceBased=!!raw._provider || !!raw._path;
    // null-TTL SDK sources are authoritative for the live subscription. The
    // watch gets a separate short transport lease; it never changes source age.
    entry.validUntil=sourceBased?Math.min(finite || Infinity,Math.floor(now()/1000)+60):raw.validUntil || 0;
    if (!isFinite(entry.validUntil)) entry.validUntil=Math.floor(now()/1000)+60;
    if (raw._sourceValidUntil && raw._sourceValidUntil*1000<=now()) return null;
    var status=feedback[entry.token];if(status){if(status.pending)entry.flags|=F.PENDING;if(status.failed)entry.flags|=F.FAILED;}
    var keys=['title','subtitle','value','appLabel','actionLabel','name'];
    keys.forEach(function(key,index){entry[key]=key==='value'&&protocol.utf8(entry[key]||'').length>48?'Too long':protocol.text(entry[key] || '',protocol.limits[index]);});
    entry.controls=(entry.controls || []).slice(0,3).map(function(label){return protocol.text(label || '',32);});
    while(entry.controls.length<3)entry.controls.push('');
    bindings[entry.token]={version:entry.version,valid:raw._connected!==false,expiresAt:finite || 0,actions:raw._commands || [],openApp:raw._openApp || null,path:raw._path || null};
    return entry;
  }
  function materialize() {
    var data=settingsError?{activities:[],notification:null,pins:[],loading:false,error:'SETTINGS_UNREADABLE',connected:true,available:true}:sources.snapshot();bindings=Object.create(null);
    var live=Object.create(null);
    function adapt(entry){live[entry._identity]=true;return display(entry);}
    var output={activities:data.activities.map(adapt).filter(Boolean),notification:data.notification?adapt(data.notification):null,
      pins:data.pins.map(adapt).filter(Boolean),loading:data.loading,error:data.error,connected:data.connected,available:data.available};
    // Keep recent absent identities only until the bounded receipt table fills.
    // Tokens are not reused within a native session.
    if(Object.keys(identities).length>512)Object.keys(identities).forEach(function(key){if(!live[key])delete identities[key];});
    return output;
  }
  function overview(data){
    return data.activities.slice(0,1).concat(data.notification?[data.notification]:[],data.pins.slice(0,2));
  }
  function snapshot() {
    var data=materialize(),items=[],total=0,offset=0,mode=view.mode;
    if(mode===M.OVERVIEW){items=overview(data);total=items.length;}
    else if(mode===M.MEDIA){
      var selected=data.activities.filter(function(entry){return entry.token===view.token;})[0];
      if(selected && selected.flags & F.ACTION){items=[selected];total=1;}
    }else{
      var list=mode===M.ACTIVITIES?data.activities:data.pins;total=list.length;
      offset=Math.min(view.offset,Math.max(0,total-5));
      // A data reorder retains selection by exact token. Native's requested
      // absolute index is used only when it is intentionally browsing a page.
      if(view.token && view.preserve){
        var index=list.map(function(entry){return entry.token;}).indexOf(view.token);
        if(index>=0){
          if(index<offset)offset=index;
          else if(index>=offset+5)offset=index-4;
          offset=Math.min(offset,Math.max(0,total-5));
        }
      }
      view.offset=offset;
      items=list.slice(offset,offset+5);
    }
    var status=!data.connected?S.OFFLINE:!data.available?S.ERROR:data.loading?S.LOADING:data.error?items.length?S.PARTIAL:data.error==='PERMISSION_DENIED'?S.PERMISSION:S.ERROR:S.READY;
    if(settingsError)status=items.length?S.PARTIAL:S.ERROR;
    if(mode===M.MEDIA&&!items.length)status=S.ERROR;
    sequence=sequence===2147483647?1:sequence+1;
    return {session:session,request:view.request,sequence:sequence,now:Math.max(1,Math.floor(now()/1000)),mode:mode,status:status,dark:prefs.dark,
      total:total,offset:offset,activitiesTotal:data.activities.length,pinsTotal:data.pins.length,items:items};
  }
  function publish(force) {
    if(stopped||!session||!view)return;
    var frame;
    try { frame=snapshot(); }
    catch(error){result(view.request,protocol.result.FAILED,'Data unavailable');return;}
    var signature=JSON.stringify([frame.request,frame.mode,frame.status,frame.dark,frame.total,frame.offset,frame.activitiesTotal,frame.pinsTotal,frame.items]);
    if(!force&&signature===lastFrameSignature)return;
    lastFrameSignature=signature;
    var payload={};
    try { payload[protocol.keys.DB_DATA]=protocol.encode(frame); }
    catch(error){result(view.request,protocol.result.FAILED,'Data unavailable');return;}
    queue.send(payload,null,function(reason){if(reason!=='SUPERSEDED')lastFrameSignature='';},'snapshot');
  }
  function schedulePublish(){
    if(stopped||!session||publishTimer!==null)return;
    publishTimer=later(function(){publishTimer=null;publish(false);},0);
  }
  function armHeartbeat(){
    if(heartbeat!==null)cancel(heartbeat);
    if(!session||stopped)return;
    heartbeat=later(function(){heartbeat=null;syncSettings();publish(false);armHeartbeat();},30000);
  }
  function startSources(){if(stopped||settingsError)return;started=true;sources.start(prefs);}
  function syncSettings(){
    var saved=settingsModel.load(options.storage);
    if(!saved){settingsError=true;if(started){sources.stop();started=false;}return;}
    var wasError=settingsError;
    settingsError=false;
    if(wasError||JSON.stringify(saved)!==JSON.stringify(prefs)){
      prefs=saved;lastFrameSignature='';if(started||session)startSources();
    }
  }
  function receive(payload){
    if(stopped)return;
    var kind=protocol.get(payload,'DB_OPERATION'),incoming=protocol.get(payload,'DB_SESSION'),request=protocol.get(payload,'DB_REQUEST');
    if(kind===O.HELLO){
      if(!positive(incoming)||!positive(request))return;
      if(incoming!==session){
        queue.clear();commands.start(incoming);session=incoming;view=null;sequence=0;identities=Object.create(null);bindings=Object.create(null);feedback=Object.create(null);
        nextToken=options.tokenSeed || Math.floor(Math.random()*1073741823)+1;lastFrameSignature='';bindingEpoch=0;connected=true;
        if(started)sources.stop();sources.connectionChanged(true);startSources();
      }
      if(view&&view.request>request&&incoming===session)return;
      if(view&&request>view.request){
        // A new HELLO in this native session is its reconnect handshake.
        // Replace potentially dead SDK handles once, and invalidate previous
        // confirmations even when the freshly read value is identical.
        bindingEpoch++;connected=true;sources.connectionChanged(false);sources.connectionChanged(true);
      }
      var helloMode=protocol.get(payload,'DB_MODE'),helloOffset=protocol.get(payload,'DB_OFFSET'),helloIndex=protocol.get(payload,'DB_INDEX'),helloToken=protocol.get(payload,'DB_TOKEN');
      view={mode:bounded(helloMode,3)?helloMode:view?view.mode:M.OVERVIEW,
        offset:bounded(helloOffset,65535)?helloOffset:view?view.offset:0,index:bounded(helloIndex,65535)?helloIndex:view?view.index:0,
        request:request,token:bounded(helloToken,2147483647)?helloToken:view?view.token:0,preserve:true};armHeartbeat();publish(true);return;
    }
    if(!positive(session)||incoming!==session)return;
    if(kind===O.CANCEL){
      commands.stop();session=0;view=null;queue.clear();sources.stop();started=false;
      if(heartbeat!==null)cancel(heartbeat);heartbeat=null;return;
    }
    if(!positive(request))return;
    if(kind===O.FOCUS){
      if(!view||request!==view.request||protocol.get(payload,'DB_MODE')!==view.mode)return;
      var focusedToken=protocol.get(payload,'DB_TOKEN'),focusedVersion=protocol.get(payload,'DB_VERSION'),focusedIndex=protocol.get(payload,'DB_INDEX');
      if(!positive(focusedToken)||!positive(focusedVersion)||!bounded(focusedIndex,65535))return;
      var current=materialize(),list=view.mode===M.ACTIVITIES?current.activities:view.mode===M.PINNED?current.pins:
        view.mode===M.MEDIA?current.activities.filter(function(entry){return entry.token===view.token;}):overview(current);
      var actual=list.map(function(entry){return entry.token;}).indexOf(focusedToken);
      if(actual<0||focusedIndex>=list.length||focusedVersion>list[actual].version)return;
      view.token=focusedToken;view.index=actual;view.preserve=true;return;
    }
    if(kind===O.VIEW){
      syncSettings();
      var mode=protocol.get(payload,'DB_MODE'),offset=protocol.get(payload,'DB_OFFSET'),index=protocol.get(payload,'DB_INDEX'),token=protocol.get(payload,'DB_TOKEN');
      if(!bounded(mode,3)||!bounded(offset===undefined?0:offset,65535)||!bounded(index===undefined?0:index,65535)||token!==undefined&&!bounded(token,2147483647))return;
      if(view&&request<view.request)return;
      view={mode:mode,offset:offset || 0,index:index || 0,request:request,token:token || 0,preserve:false};publish(true);view.preserve=true;return;
    }
    if(kind===O.ACTION||kind===O.OPEN){
      var action=protocol.get(payload,'DB_ACTION'),confirmation=protocol.get(payload,'DB_CONFIRM');
      if(kind===O.OPEN&&action===undefined)action=0;
      if(confirmation===undefined)confirmation=0;
      commands.execute({session:session,request:request,token:protocol.get(payload,'DB_TOKEN'),version:protocol.get(payload,'DB_VERSION'),
        action:action,confirm:confirmation},kind===O.OPEN);
    }
  }
  return {
    ready:function(){
      if(stopped)return;
      queue.send(message(O.READY));
    },message:receive,
    configure:function(value){
      var normalized=settingsModel.normalize(value);prefs=settingsModel.save(options.storage,normalized);settingsError=false;
      if(started||session)startSources();lastFrameSignature='';schedulePublish();return copy(prefs);
    },
    configuration:function(){
      syncSettings();schedulePublish();
      return metadata.discover(pebble,options.storage).then(function(catalogue){return {settings:copy(prefs),catalogue:catalogue,needsRepair:settingsError};});
    },
    catalogue:function(){return metadata.discover(pebble,options.storage);},
    reloadSettings:function(){syncSettings();schedulePublish();return copy(prefs);},
    connectionChanged:function(value){if(stopped||!!value===connected)return;connected=!!value;if(connected)bindingEpoch++;sources.connectionChanged(connected);schedulePublish();},
    stop:function(){
      stopped=true;commands.stop();sources.stop();started=false;queue.clear();session=0;view=null;bindings=Object.create(null);identities=Object.create(null);
      [heartbeat,publishTimer].forEach(function(timer){if(timer!==null)cancel(timer);});heartbeat=publishTimer=null;
    }
  };
};
