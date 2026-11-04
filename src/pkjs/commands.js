'use strict';

var WATCH_STATE = '00000000-0000-0000-0001-000000000007';
var RESULT = {PENDING: 1, SUCCESS: 2, FAILED: 3, STALE: 4, PERMISSION: 5, CANCELLED: 6, CONFIRM: 7};
function positive(value) { return typeof value === 'number' && isFinite(value) && Math.floor(value) === value && value > 0 && value <= 2147483647; }
function choice(value,max) { return typeof value==='number'&&isFinite(value)&&Math.floor(value)===value&&value>=0&&value<=max; }
function copy(value) { return JSON.parse(JSON.stringify(value)); }
function safeText(value) { return typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 64) : ''; }

module.exports = function createCommands(options) {
  var pebble = options.pebble, now = options.now || Date.now, later = options.later || setTimeout;
  var cancel = options.cancelLater || clearTimeout, session = 0, entries = Object.create(null), outstanding = null, watermark=0;
  function prune(){
    var ids=Object.keys(entries).sort(function(a,b){return Number(a)-Number(b);});
    while(ids.length>32){
      var evict=ids.filter(function(key){return entries[key]!==outstanding;})[0];
      if(evict===undefined)return;
      delete entries[evict];ids.splice(ids.indexOf(evict),1);
    }
  }
  function emit(item, result, text) {
    item.result = result; item.text = text || '';
    options.sendResult(item.request, result, item.text);
  }
  function valid(item) {
    var binding = options.lookup(item.token);
    return session === item.session && binding && binding.version === item.version &&
      binding.valid !== false && (!binding.expiresAt || binding.expiresAt * 1000 > now()) ? binding : null;
  }
  function finish(item, result, text) {
    if (item.state !== 'dispatched' && item.state !== 'scheduled') return;
    if (item.timer !== null) cancel(item.timer);
    item.timer = null; item.state = 'done';
    if (outstanding === item) outstanding = null;
    if (options.onPending) options.onPending(item.token, false, result !== RESULT.SUCCESS);
    if (session === item.session) emit(item, result, text);
  }
  function run(item) {
    item.state = 'scheduled'; outstanding = item;
    emit(item, RESULT.PENDING, 'Working…');
    if (options.onPending) options.onPending(item.token, true, false);
    // Dispatch in a microtask so a queued cancellation/source withdrawal can
    // invalidate this exact target before the platform operation starts.
    Promise.resolve().then(function () {
      if (item.state !== 'scheduled' || session !== item.session) return;
      var binding = valid(item), command = binding && (item.open ? binding.openApp : binding.actions && binding.actions[item.action]);
      if (!command) { finish(item, RESULT.STALE, 'Item changed'); return; }
      item.state = 'dispatched';
      item.timer = later(function () { finish(item, RESULT.FAILED, 'No response'); }, 8000);
      var request = item.open ? {plugin: WATCH_STATE, action: 'launch_app', args: {uuid: command.watchAppUuid}, timeoutMs: 8000} :
        {plugin: command.plugin, action: command.action, args: copy(command.args || {}), timeoutMs: 8000};
      var pending;
      try { pending = pebble.invokeAction(request); }
      catch (error) { finish(item, RESULT.FAILED, 'Action unavailable'); return; }
      Promise.resolve(pending).then(function (result) {
        if (item.state !== 'dispatched' || session !== item.session) return;
        if (!result || result.ok !== true) {
          var code = result && result.code;
          finish(item, code === 'PERMISSION_DENIED' || code === 'AUTH_REQUIRED' ? RESULT.PERMISSION : RESULT.FAILED,
            code === 'PERMISSION_DENIED' ? 'Allow in Pebble app' : code === 'AUTH_REQUIRED' ? 'Sign in on phone' : 'Action failed');
          return;
        }
        finish(item, RESULT.SUCCESS, safeText(result.text) || (item.open ? 'Opening app' : 'Action sent'));
        if (!item.open && options.onRefresh) options.onRefresh(result.refreshed, binding);
      }, function (error) {
        if (item.state === 'dispatched') finish(item, error && error.code === 'PERMISSION_DENIED' ? RESULT.PERMISSION : RESULT.FAILED,
          error && error.code === 'PERMISSION_DENIED' ? 'Allow in Pebble app' : 'Action failed');
      });
    });
  }
  function cancelAll() {
    Object.keys(entries).forEach(function (key) { var item = entries[key]; if (item.timer !== null) cancel(item.timer); item.state = 'cancelled'; });
    entries = Object.create(null); outstanding = null;watermark=0;
  }
  return {
    start: function (next) { cancelAll(); session = positive(next) ? next : 0; },
    stop: function () { cancelAll(); session = 0; },
    execute: function (request, open) {
      if(request&&open&&request.action===undefined){request=copy(request);request.action=0;}
      if (!request || request.session !== session || !positive(session) || !positive(request.request) ||
          !positive(request.token) || !positive(request.version) || !choice(request.action,2) || !choice(request.confirm,1) ||
          typeof pebble.invokeAction !== 'function') return false;
      var old = entries[request.request];
      if (old) {
        if (old.token !== request.token || old.version !== request.version || old.open !== !!open || old.action !== request.action) return false;
        if (old.state === 'confirm' && request.confirm === 1) {
          if (outstanding) { old.state='done';emit(old,RESULT.FAILED,'Still working');return false; }
          if (!valid(old)) { old.state = 'done'; emit(old, RESULT.STALE, 'Item changed'); return false; }
          run(old); return true;
        }
        emit(old, old.result, old.text); return false;
      }
      // Keep only recent receipt details. The native request counter is strictly
      // increasing; its high-water mark prevents an evicted old request from
      // ever being dispatched again, without limiting the session's lifetime.
      if(request.request<=watermark){options.sendResult(request.request,RESULT.STALE,'Already handled');return false;}
      watermark=request.request;
      var item = {session: session, request: request.request, token: request.token, version: request.version,
        action: request.action, open: !!open, state: 'new', timer: null};
      entries[item.request] = item;
      prune();
      var binding = valid(item), command = binding && (open ? binding.openApp : binding.actions && binding.actions[item.action]);
      if (!command) { item.state = 'done'; emit(item, RESULT.STALE, 'Item changed'); return false; }
      if (outstanding) { item.state = 'done'; emit(item, RESULT.FAILED, 'Still working'); return false; }
      if (!open && command.confirm) { item.state = 'confirm'; emit(item, RESULT.CONFIRM, command.label || 'Confirm action'); return true; }
      if (request.confirm === 1) { item.state = 'done'; emit(item, RESULT.STALE, 'Confirm again'); return false; }
      run(item); return true;
    }
  };
};
module.exports.RESULT = RESULT;
