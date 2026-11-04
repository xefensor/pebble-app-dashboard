'use strict';

// Current source data stays in RAM. No activity, track, notification, source
// instance, action argument or artwork is written by this module.
var MUSIC = '00000000-0000-0000-0001-000000000003';
var FIND = '00000000-0000-0000-0001-000000000008';
var NOTIFICATIONS = '00000000-0000-0000-0001-000000000005';
var NOTIFICATIONS_APP = 'b2cae818-10f8-46df-ad2b-98ad2254a3c1';
var MUSIC_APP = '1f03293d-47af-4f28-b960-f2b02a6dd757';
var F = {ACTION:1,APP:2,MEDIA:4,PRIVATE:8,UNAVAILABLE:16,PAUSED:32,PENDING:64,FAILED:128,COUNTDOWN:256,ELAPSED:512,
  NOTIFICATION:1024,CONFIRM:2048,LOCAL_WATCH:4096,MEDIA_PREVIOUS:8192,MEDIA_TOGGLE:16384,MEDIA_NEXT:32768};
var K = {generic:0,timer:1,media:2,notification:3,weather:4,phone:5,light:6,find:7,workout:8,navigation:9,calendar:10,battery:11,scene:12};
var protocol = require('./protocol');
function object(value) { return value && typeof value === 'object' && !Array.isArray(value); }
function uuid(value) { return typeof value === 'string' && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value) && !/^0{8}-0{4}-0{4}-0{4}-0{12}$/.test(value); }
function clean(value, limit) { return typeof value === 'string' ? protocol.text(value.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').trim(), limit || 192) : ''; }
function text(property) {
  if (!object(property)) return '';
  if (property.longText && typeof property.longText.text === 'string') return clean(property.longText.text);
  if (property.shortText && typeof property.shortText.text === 'string') return clean(property.shortText.text);
  if (property.numericValue && typeof property.numericValue.value === 'number' && isFinite(property.numericValue.value)) {
    var value = property.numericValue, unit = clean(value.unit,192);
    return String(Math.round(value.value * 100) / 100) + (unit ? (/^(%|°|°C|°F)$/.test(unit) ? '' : ' ') + unit : '');
  }
  if (property.boolean && typeof property.boolean.value === 'boolean') return property.boolean.value ? 'On' : 'Off';
  if (property.timestamp && typeof property.timestamp.value === 'number' && isFinite(property.timestamp.value)) {
    var date = new Date(property.timestamp.value * 1000);
    return ('0' + date.getHours()).slice(-2) + ':' + ('0' + date.getMinutes()).slice(-2);
  }
  return '';
}
function boolean(property) { return property && property.boolean && typeof property.boolean.value === 'boolean' ? property.boolean.value : null; }
function essentialValue(value) { value=clean(value,192);return protocol.utf8(value).length<=48?value:'Too long'; }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function image(property) {
  var picture = property && (property.image || property.icon);
  if (!picture) return null;
  try { return require('pebble-activities/host').wire.image(picture); } catch (error) { return null; }
}
function emptyItem(identity, title, kind, role) {
  return {_identity:identity, title:clean(title), subtitle:'',value:'',name:clean(title,64),appLabel:'',actionLabel:'',controls:[],
    flags:0,kind:kind || 0,role:role || 0,clockMode:0,anchor:0,baseSeconds:0,validUntil:0,_commands:[],_openApp:null,_sourceValidUntil:null};
}
function declarations(plugin) { return plugin && Array.isArray(plugin.actions) ? plugin.actions : []; }
function declares(plugin, category, item) {
  return plugin && Array.isArray(plugin.sources) && plugin.sources.some(function (source) { return source.category === category && Array.isArray(source.items) && source.items.indexOf(item) >= 0; });
}
function command(plugin, name, args, label, confirmation) {
  if (!plugin || !uuid(plugin.uuid)) return null;
  var declaration = declarations(plugin).filter(function (entry) { return entry.name === name; })[0];
  if (!declaration || !object(args || {})) return null;
  var parameters = declaration.parameters || {}, required = Array.isArray(parameters.required) ? parameters.required : [];
  if (!required.every(function (key) { return Object.prototype.hasOwnProperty.call(args || {}, key); })) return null;
  var copy = clone(args || {}), fields = parameters.properties || {};
  if (!Object.keys(copy).every(function (key) {
    var type = fields[key] && fields[key].type;
    if (!type) return true;
    if (type === 'integer') return typeof copy[key] === 'number' && Math.floor(copy[key]) === copy[key];
    return type === 'array' ? Array.isArray(copy[key]) : type === 'object' ? object(copy[key]) : typeof copy[key] === type;
  })) return null;
  return {plugin:plugin.uuid,action:name,args:copy,label:clean(label || declaration.description || name,32),
    confirm:confirmation === true || declaration.destructive === true || declaration.requiresConfirmation === true};
}
function finalizeActions(entry) {
  var bits = [F.MEDIA_PREVIOUS,F.MEDIA_TOGGLE,F.MEDIA_NEXT];
  entry.controls = [0,1,2].map(function (index) {
    var action = entry._commands[index];
    if (action) { entry.flags |= bits[index] | F.ACTION; if (action.confirm) entry.flags |= F.CONFIRM; }
    return action ? action.label : '';
  });
  if (entry._commands[0]) entry.actionLabel = entry._commands[0].label;
  if (entry._openApp) { entry.flags |= F.APP; entry.appLabel = clean(entry._openApp.label || entry.name,32); }
  return entry;
}
function fromActivity(card, plugins, seconds) {
  var main = card.main || {}, media = card.presentation === 2 || card.kind === 'music' || card.kind === 'media';
  var support = card.support && (!seconds || card.support.validUntil > seconds) ? card.support : null;
  var chosen=!media&&card.compactItem===1&&support?support:main;
  var identity = 'activity:' + card.provider + ':' + card.id;
  var entry = emptyItem(identity, media ? main.text : card.name || card.providerName || card.caption || 'Activity', media ? K.media : K[card.kind] || K.generic, 0);
  entry._provider = card.provider;
  entry._sourceValidUntil = Math.min.apply(null,[card.validUntil,main.validUntil,chosen.validUntil].filter(function(value){return typeof value==='number'&&value>0;}));
  entry._sourceRevision = card.revision;
  entry.validUntil = entry._sourceValidUntil; entry.name = clean(card.name || card.providerName || card.caption || 'Activity',64);
  entry._activityId = card.id;
  if (media) {
    entry.flags |= F.MEDIA; entry.subtitle = clean(support && support.text || card.caption || '',128);
    entry.value = card.playback === 'paused' ? 'Paused' : card.playback === 'playing' ? 'Playing' : '';
  } else {
    if (chosen.type === 'text') entry.title = clean(chosen.text);
    else if (chosen.type === 'value') entry.value = essentialValue(chosen.text);
    else if (chosen.type === 'clock') {
      entry.clockMode = chosen.mode === 'elapsed' ? 2 : 1;
      entry.flags |= entry.clockMode === 1 ? F.COUNTDOWN : F.ELAPSED;
      entry.baseSeconds = chosen.baseSeconds || 0;
      entry.anchor = chosen.running ? entry.clockMode === 1 ? chosen.anchorAt + chosen.baseSeconds : chosen.anchorAt : 0;
    }
    if (chosen!==main&&chosen.type!=='text'&&main.type==='text')entry.title=clean(main.text);
    var other=chosen===main?support:main;
    entry.subtitle=clean(other&&other.type==='text'?other.text:!card.support&&card.qualifier||'',128);
    if(entry.subtitle===entry.title)entry.subtitle='';
  }
  if (card.private) entry.flags |= F.PRIVATE;
  if (card.state === 'paused' || card.playback === 'paused') entry.flags |= F.PAUSED;
  if (card.image) entry.image = clone(card.image);
  if (card.openApp && uuid(card.openApp.watchAppUuid)) entry._openApp = {watchAppUuid:card.openApp.watchAppUuid,label:entry.name};
  var provider = plugins.filter(function (plugin) { return plugin.uuid === card.provider; })[0];
  var actions = Array.isArray(card.actions) ? card.actions : [];
  if (card.unconfirmed) actions=[];
  actions.forEach(function (action, index) {
    var slot = media ? action.semantic === 'previous' ? 0 : action.semantic === 'next' ? 2 :
      (card.playback === 'paused' && ['play','resume'].indexOf(action.semantic) >= 0 || card.playback !== 'paused' && action.semantic === 'pause') ? 1 : -1 : index;
    if (slot >= 0 && slot <= 2) entry._commands[slot] = command(provider,action.action,action.args,action.label,false);
  });
  return finalizeActions(entry);
}

module.exports = function createSources(options) {
  var pebble = options.pebble, now = options.now || Date.now, later = options.later || setTimeout, cancel = options.cancelLater || clearTimeout;
  var changed = options.onChanged || function () {}, settings = null, groups = Object.create(null), plugins = [], activities = null;
  var stopped = true, connected = true, generation = 0, discoveryTimer = null, expiryTimer = null, settleTimer = null, startedAt = 0, error = '', discovery = null;
  function notify() { if (!stopped) { scheduleExpiry(); changed(); } }
  function stopGroup(group) { group.generation++; if (group.handle && typeof group.handle.unsubscribe === 'function') { try { group.handle.unsubscribe(); } catch (ignored) {} } group.handle=null;group.envelope=null; }
  function stop() {
    stopped=true;generation++;
    [discoveryTimer,expiryTimer,settleTimer].forEach(function (timer) { if (timer !== null) cancel(timer); });discoveryTimer=expiryTimer=settleTimer=null;
    Object.keys(groups).forEach(function (key) { stopGroup(groups[key]); }); groups=Object.create(null);plugins=[];
    if (activities) activities.stop();activities=null;discovery=null;
  }
  function live(group) { return group && group.envelope && !group.error && (!group.expiresAt || group.expiresAt * 1000 > now()); }
  function receive(group, envelope, run) {
    if (stopped || run !== group.generation) return;
    var valid = envelope && uuid(envelope.pluginUuid) && (!group.plugin || group.plugin === envelope.pluginUuid) &&
      Array.isArray(envelope.instances) && envelope.instances.length <= 256;
    var expiry = envelope && envelope.validUntilMs;
    if (expiry !== undefined && expiry !== null && (typeof expiry !== 'number' || !isFinite(expiry) || expiry <= now())) valid=false;
    if (!valid) { group.envelope=null;group.error='INVALID_SOURCE';group.ready=true;notify();return; }
    group.envelope=envelope;group.expiresAt=expiry === undefined || expiry === null ? null : Math.floor(expiry / 1000);group.error='';group.ready=true;notify();
  }
  function bind(category, item, plugin, properties, size) {
    var key=(plugin || '*')+'|'+category+'/'+item;
    if (groups[key]) return groups[key];
    var group=groups[key]={key:key,category:category,item:item,plugin:plugin || null,properties:properties,iconPixelSize:size,
      envelope:null,expiresAt:null,error:'',ready:false,handle:null,generation:1};
    // Reading Find My Phone starts ringing in the official plugin. It is an
    // explicit command-only default, never an automatic read or settings probe.
    if (category === 'phone' && item === 'find_my_phone') { group.error='ACTION_ONLY';group.ready=true;return group; }
    if (typeof pebble.subscribeToSource !== 'function') { group.error='PLUGINS_UNAVAILABLE';group.ready=true;return group; }
    var run=group.generation;
    var request={category:category,item:item,onData:function (envelope) { receive(group,envelope,run); },onError:function (failure) {
      if (stopped || run !== group.generation) return;group.envelope=null;group.error=failure && failure.code || 'SOURCE_UNAVAILABLE';group.ready=true;notify();
    }};
    if (plugin) request.plugin=plugin;if (properties) request.properties=properties;if (size) request.iconPixelSize=size;
    try {
      var handle=pebble.subscribeToSource(request);
      if (!stopped && run === group.generation) group.handle=handle;
      else if (handle && typeof handle.unsubscribe === 'function') handle.unsubscribe();
    } catch (failure) { group.error=failure && failure.code || 'SOURCE_UNAVAILABLE';group.ready=true; }
    return group;
  }
  function enumerate() {
    var run=generation;
    if (stopped) return Promise.resolve([]);
    if (discovery) return discovery;
    try { discovery=Promise.resolve(typeof pebble.enumeratePlugins === 'function' ? pebble.enumeratePlugins() : []); }
    catch (failure) { discovery=Promise.reject(failure); }
    discovery=discovery.then(function (value) {
      if (stopped || run !== generation) return [];
      if (!Array.isArray(value)) { plugins=[];error='INVALID_CATALOGUE';notify();return []; }
      plugins=value.filter(function (plugin) { return plugin && uuid(plugin.uuid); }).slice(0,128);error='';notify();return plugins;
    },function (failure) { if (!stopped && run === generation) { plugins=[];error=failure && failure.code || 'PLUGINS_UNAVAILABLE';notify(); }return []; }).then(function (value) {
      if (run === generation) {
        discovery=null;if (discoveryTimer !== null) cancel(discoveryTimer);
        discoveryTimer=later(function () { discoveryTimer=null;enumerate(); },60000);
      }
      return value;
    });
    return discovery;
  }
  function scheduleExpiry() {
    if (expiryTimer !== null) { cancel(expiryTimer);expiryTimer=null; }
    var ends=Object.keys(groups).map(function (key) { return live(groups[key]) && groups[key].expiresAt; }).filter(Boolean);
    if (ends.length) expiryTimer=later(function () {
      expiryTimer=null;Object.keys(groups).forEach(function (key) { var group=groups[key];if (group.expiresAt && group.expiresAt*1000<=now()) { group.envelope=null;group.error='SOURCE_EXPIRED'; } });notify();
    },Math.max(1,Math.min.apply(null,ends)*1000-now()));
  }
  function findGroup(reading) { return groups[(reading.plugin || '*')+'|'+reading.category+'/'+reading.item]; }
  function selectInstance(group, reading) {
    if (!live(group)) return null;
    var instances=group.envelope.instances;
    return reading.instanceId !== undefined ? instances.filter(function (instance) { return instance && instance.instanceId === reading.instanceId; })[0] || null : instances[reading.index || 0] || null;
  }
  function pinItem(pin) {
    var entry=emptyItem('pin:'+pin.id,pin.label,K[pin.icon] || K.generic,2), reading=pin.reading, group=reading && findGroup(reading), instance=group && selectInstance(group,reading), props=instance && instance.properties;
    if (reading && reading.category === 'watch-local') { entry.kind=K.battery;entry.flags|=F.LOCAL_WATCH;entry._local=true; }
    else if (reading) {
      if (['weather','phone','watch'].indexOf(reading.category)<0) entry.flags|=F.PRIVATE;
      if (reading.category==='music'||reading.category==='notifications') entry.flags|=F.PRIVATE;
      entry._sourceValidUntil=live(group)?group.expiresAt:null;
      entry._sourceReady=!!instance;entry._provider=live(group)?group.envelope.pluginUuid:null;
      entry._path=reading.category+'/'+reading.item;entry._groupKey=group&&group.key;
      entry.value=props?essentialValue(text(props[reading.property])):'';
      entry.subtitle=props?text(props.name):'';
      if (!entry.value) { entry.flags|=F.UNAVAILABLE;entry.value='—';entry.subtitle=group&&group.error==='PERMISSION_DENIED'?'Allow on phone':'Unavailable'; }
      entry._sourceSignature=props?JSON.stringify([instance.instanceId,entry.value,pin.action&&pin.action.toggleProperty?boolean(props[pin.action.toggleProperty]):null]):'';
      if (props) entry.image=image(props[reading.property]);
      if (reading.category === 'weather') entry.kind=K.weather;
      if (reading.category === 'phone') entry.kind=K.phone;
    }
    if (pin.openApp && uuid(pin.openApp.watchAppUuid)) entry._openApp=clone(pin.openApp);
    var action=pin.action;
    if (pin.builtin === 'find-phone') {
      var builtin=plugins.filter(function (plugin) { return plugin.uuid === FIND; })[0];
      entry.kind=K.find;entry._commands[0]=command(builtin,'ring',{},'Ring',false);
    } else if (action) {
      var provider=plugins.filter(function (plugin) { return plugin.uuid === action.plugin; })[0], args=clone(action.args || {}), valid=true;
      if (action.toggleProperty) {
        var on=props && boolean(props[action.toggleProperty]);
        var declaration=provider&&declarations(provider).filter(function(candidate){return candidate.name===action.action;})[0];
        var onSchema=declaration&&declaration.parameters&&declaration.parameters.properties&&declaration.parameters.properties.on;
        if (on === null || !instance || group.envelope.pluginUuid !== action.plugin || !onSchema || onSchema.type!=='boolean' ||
            Object.prototype.hasOwnProperty.call(args,'item')&&args.item!==reading.item ||
            Object.prototype.hasOwnProperty.call(args,'instanceId')&&args.instanceId!==instance.instanceId) valid=false;
        else { args.on=!on;args.instanceId=instance.instanceId;args.item=reading.item; }
      }
      if (valid) entry._commands[0]=command(provider,action.action,args,action.label,action.confirm);
    }
    if (entry._commands[0]) { entry.flags|=F.ACTION;if(entry._commands[0].confirm)entry.flags|=F.CONFIRM;entry.actionLabel=entry._commands[0].label; }
    if (entry._openApp) { entry.flags|=F.APP;entry.appLabel=clean(entry._openApp.label||entry.name,32); }
    return entry;
  }
  function mediaItem() {
    var group=groups['*|music/track'], instance=group && selectInstance(group,{index:0}), props=instance && instance.properties;
    if (!props) return null;
    var title=text(props.title);if (!title || title === '?') return null;
    var provider=plugins.filter(function (plugin) { return plugin.uuid === group.envelope.pluginUuid && declares(plugin,'music','track'); })[0];
    var playing=boolean(props.playing),entry=emptyItem('builtin:music',title,K.media,0);
    entry._provider=group.envelope.pluginUuid;entry._sourceValidUntil=group.expiresAt;entry._sourceSignature=JSON.stringify([title,text(props.artist),playing]);
    entry.flags=F.MEDIA|F.PRIVATE|(playing===false?F.PAUSED:0);entry.subtitle=text(props.artist);if(entry.subtitle==='?')entry.subtitle='';
    entry.name='Music';entry.value=playing===true?'Playing':playing===false?'Paused':'';entry.image=image(props.artwork);entry._path='music/track';entry._groupKey=group.key;
    if (group.envelope.pluginUuid===MUSIC)entry._openApp={watchAppUuid:MUSIC_APP,label:'Music'};
    if (provider && provider.uuid === MUSIC) {
      entry._commands[0]=command(provider,'previous_track',{},'Previous',false);
      if (playing !== null) entry._commands[1]=command(provider,'set_playing',{on:!playing},playing?'Pause':'Play',false);
      entry._commands[2]=command(provider,'next_track',{},'Next',false);
    }
    return finalizeActions(entry);
  }
  function notificationItem() {
    var group=groups[NOTIFICATIONS+'|notifications/notification'];if (!live(group)) return null;
    var instance=group.envelope.instances[0],props=instance && instance.properties;if (!props || typeof instance.instanceId !== 'string') return null;
    var title=text(props.name), app=text(props.app);if (!title && !app) return null;
    var entry=emptyItem('notification:'+group.envelope.pluginUuid+':'+instance.instanceId,title||app,K.notification,1);
    entry.flags=F.PRIVATE|F.NOTIFICATION|F.APP;entry._provider=group.envelope.pluginUuid;entry._instanceId=instance.instanceId;entry._sourceValidUntil=group.expiresAt;
    entry.name=app||'Notifications';entry.subtitle=settings.notificationPreview?text(props.body):'';
    entry._sourceSignature=JSON.stringify([title,app,entry.subtitle]);entry.appLabel='Notifications';entry.image=image(props.app_icon);
    entry._openApp={watchAppUuid:NOTIFICATIONS_APP,label:'Notifications'};return entry;
  }
  function snapshot() {
    if (!settings) return {activities:[],notification:null,pins:[],loading:false,error:'SOURCE_UNAVAILABLE',connected:connected,available:typeof pebble.subscribeToSource==='function'};
    var cards=activities?activities.catalogue():[], all=cards.map(function (card) { return fromActivity(card,plugins,Math.floor(now()/1000)); }), media=mediaItem(), notice=notificationItem();
    if (media) all.push(media);
    all=all.filter(function (entry) {
      var key=entry._identity==='builtin:music'?'builtin:music':entry._provider;
      return settings.disabledActivities.indexOf(key)<0 && settings.disabledActivities.indexOf(entry._identity)<0;
    });
    all.sort(function (a,b) {
      var ak=a._identity==='builtin:music'?'builtin:music':a._provider,bk=b._identity==='builtin:music'?'builtin:music':b._provider;
      var ai=settings.activityOrder.indexOf(a._identity),bi=settings.activityOrder.indexOf(b._identity);
      if(ai<0)ai=settings.activityOrder.indexOf(ak);if(bi<0)bi=settings.activityOrder.indexOf(bk);
      return (ai<0?settings.activityOrder.length:ai)-(bi<0?settings.activityOrder.length:bi);
    });
    if (notice && all.some(function (entry) { return entry._provider===notice._provider && entry._activityId===notice._instanceId; })) notice=null;
    var activityStatus=activities?activities.status():{complete:true,available:false,error:'PLUGINS_UNAVAILABLE'};
    var errors=Object.keys(groups).map(function(key){return groups[key].error;}).filter(function(value){return value&&value!=='ACTION_ONLY';});
    var waiting=!activityStatus.complete || Object.keys(groups).some(function (key) { return !groups[key].ready; });
    return {activities:all.slice(0,256),notification:notice,pins:settings.pins.map(pinItem),
      loading:waiting&&now()-startedAt<8000,
      error:error || activityStatus.error || errors[0] || (waiting&&now()-startedAt>=8000?'SOURCE_TIMEOUT':''),connected:connected,available:typeof pebble.subscribeToSource==='function'};
  }
  function start(next) {
    stop();stopped=false;connected=true;settings=next;error='';generation++;startedAt=now();
    settleTimer=later(function(){settleTimer=null;notify();},8000);
    var host=options.activitiesHost || require('pebble-activities/host');
    activities=host.createActivities({pebble:pebble,nativeFormat:3,now:now,later:later,cancelLater:cancel,
      send:function (payload,success) { if(success)success(); },getSettings:function () { return {enabled:true}; },onChanged:notify});
    activities.refresh(true,2);
    bind('music','track',null,['title','artist','playing','artwork'],{w:40,h:40});
    if (settings.showNotifications) bind('notifications','notification',NOTIFICATIONS,['name','app','package','app_icon'].concat(settings.notificationPreview?['body']:[]),{w:24,h:24});
    settings.pins.forEach(function (pin) { if (pin.reading && pin.reading.category !== 'watch-local') bind(pin.reading.category,pin.reading.item,pin.reading.plugin,null,{w:16,h:16}); });
    enumerate();notify();
  }
  function refreshPaths(paths, binding) {
    if (stopped || typeof pebble.readSource !== 'function') return;
    var wanted=Array.isArray(paths)?paths:binding && binding.path?[binding.path]:[];
    Object.keys(groups).forEach(function (key) {
      var group=groups[key],run=group.generation;if (wanted.indexOf(group.category+'/'+group.item)<0 || group.error==='ACTION_ONLY')return;
      var request={category:group.category,item:group.item};if(group.plugin)request.plugin=group.plugin;if(group.properties)request.properties=group.properties;if(group.iconPixelSize)request.iconPixelSize=group.iconPixelSize;
      try { Promise.resolve(pebble.readSource(request)).then(function(envelope){receive(group,envelope,run);},function(){/* Subscription remains authoritative; no optimistic replacement. */}); } catch(ignored) {}
    });
  }
  return {start:start,stop:stop,snapshot:snapshot,refreshPaths:refreshPaths,
    connectionChanged:function(value){connected=!!value;if(!connected){Object.keys(groups).forEach(function(key){stopGroup(groups[key]);});if(activities)activities.connectionChanged(false);notify();}else if(settings)start(settings);},
    configuration:function(){return enumerate().then(function(){return {plugins:clone(plugins),instances:Object.keys(groups).reduce(function(result,key){var group=groups[key];if(!live(group))return result;return result.concat(group.envelope.instances.slice(0,64).map(function(instance){return {plugin:group.envelope.pluginUuid,category:group.category,item:group.item,instanceId:instance.instanceId,name:text(instance.properties&&instance.properties.name),properties:Object.keys(instance.properties||{})};}));},[]),
      activities:(activities?activities.providers():[]).map(function(provider){return {key:provider.uuid,name:provider.name||'Activity'};}).concat([{key:'builtin:music',name:'Music'}]),error:error};});}
  };
};
module.exports.text=text;module.exports.boolean=boolean;module.exports.command=command;module.exports.fromActivity=fromActivity;module.exports.essentialValue=essentialValue;
module.exports.constants={MUSIC:MUSIC,FIND:FIND,NOTIFICATIONS:NOTIFICATIONS,MUSIC_APP:MUSIC_APP,NOTIFICATIONS_APP:NOTIFICATIONS_APP,flag:F,kind:K};
