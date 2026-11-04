'use strict';

function createModel() {
var KEY = 'dashboard.settings.v1';
var ICONS = ['generic','timer','media','notification','weather','phone','light','find','workout','navigation','calendar','battery','scene'];
var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function object(value) { return !!value && typeof value === 'object' && !Array.isArray(value); }
function bytes(value) { return encodeURIComponent(value).replace(/%[0-9a-f]{2}|./gi, 'x').length; }
function invalid(message) { throw new Error(message || 'Invalid Dashboard settings.'); }
function known(value, names) {
  if (!object(value) || Object.keys(value).some(function(name) { return names.indexOf(name) < 0; })) invalid('Unknown settings field.');
}
function string(value, length, label) {
  if (typeof value !== 'string' || !value.length || /[\u0000-\u001f\u007f]/.test(value) || bytes(value) > length) invalid('Invalid ' + label + '.');
  return value;
}
function uuid(value) {
  if (typeof value !== 'string' || !UUID.test(value) || /^0{8}-0{4}-0{4}-0{4}-0{12}$/.test(value)) invalid('Invalid plugin or watchapp UUID.');
  return value.toLowerCase();
}
function identifier(value, label) {
  value = string(value, 64, label);
  if (!/^[a-zA-Z0-9_.:/-]+$/.test(value)) invalid('Invalid ' + label + '.');
  return value;
}
function boolean(value, fallback, label) {
  if (value === undefined) return fallback;
  if (typeof value !== 'boolean') invalid('Invalid ' + label + '.');
  return value;
}
function json(value, depth) {
  if (depth > 6) invalid('Action arguments are too deeply nested.');
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    if (typeof value === 'string' && /[\u0000]/.test(value)) invalid('Invalid action argument text.');
    return value;
  }
  if (typeof value === 'number' && isFinite(value)) return value;
  if (Array.isArray(value)) {
    if (value.length > 64) invalid('Too many action argument values.');
    return value.map(function(entry) { return json(entry, depth + 1); });
  }
  if (!object(value)) invalid('Action arguments must contain JSON values.');
  var result = {};
  Object.keys(value).forEach(function(name) {
    if (name === '__proto__' || name === 'prototype' || name === 'constructor' || bytes(name) > 64) invalid('Invalid action argument name.');
    result[name] = json(value[name], depth + 1);
  });
  return result;
}
function reading(value) {
  known(value, ['plugin','category','item','property','instanceId','index']);
  var out = {category:identifier(value.category, 'source category'), item:identifier(value.item, 'source item'), property:identifier(value.property, 'reading property')};
  if (value.plugin !== undefined) out.plugin = uuid(value.plugin);
  if (value.instanceId !== undefined) out.instanceId = string(value.instanceId, 128, 'source instance');
  if (value.index !== undefined) {
    if (typeof value.index !== 'number' || value.index % 1 || value.index < 0 || value.index > 4095) invalid('Invalid source index.');
    out.index = value.index;
  }
  return out;
}
function action(value) {
  known(value, ['plugin','action','args','label','confirm','toggleProperty']);
  var out = {plugin:uuid(value.plugin), action:identifier(value.action, 'action name'), label:string(value.label, 32, 'action label')};
  if (value.args !== undefined) {
    if (!object(value.args)) invalid('Action arguments must be an object.');
    out.args = json(value.args, 0);
    if (bytes(JSON.stringify(out.args)) > 2048) invalid('Action arguments exceed 2048 bytes.');
  }
  if (value.confirm !== undefined) out.confirm = boolean(value.confirm, false, 'action confirmation');
  if (value.toggleProperty !== undefined) out.toggleProperty = identifier(value.toggleProperty, 'Boolean toggle property');
  return out;
}
function pin(value) {
  known(value, ['id','label','icon','builtin','reading','action','openApp']);
  var out = {id:string(value.id, 64, 'pin ID'), label:string(value.label, 32, 'pin name')};
  if (value.icon !== undefined) {
    if (ICONS.indexOf(value.icon) < 0) invalid('Unknown pin icon.');
    out.icon = value.icon;
  }
  if (value.builtin !== undefined) {
    if (value.builtin !== 'find-phone') invalid('Unknown built-in pin.');
    out.builtin = value.builtin;
  }
  if (value.reading !== undefined) out.reading = reading(value.reading);
  if (value.action !== undefined) out.action = action(value.action);
  if (out.builtin && out.action) invalid('Choose either the built-in action or a custom action.');
  if (value.openApp !== undefined) {
    known(value.openApp, ['watchAppUuid','label']);
    out.openApp = {watchAppUuid:uuid(value.openApp.watchAppUuid), label:string(value.openApp.label, 32, 'app label')};
  }
  return out;
}
function strings(value, label) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 128) invalid('Too many ' + label + '.');
  var seen = Object.create(null);
  return value.map(function(entry) {
    entry = string(entry, 192, label);
    if (seen[entry]) invalid('Duplicate ' + label + '.');
    seen[entry] = true; return entry;
  });
}
function defaults() {
  return {version:1, dark:false, notificationPreview:false, showNotifications:true,
    activityOrder:[], disabledActivities:[], pins:[
      {id:'weather', label:'Weather', icon:'weather', reading:{category:'weather', item:'location', property:'temperature', index:0}},
      {id:'phone', label:'Phone', icon:'phone', reading:{category:'phone', item:'phone_state', property:'battery_level', index:0}},
      {id:'watch-battery', label:'Watch', icon:'battery', reading:{category:'watch-local', item:'battery', property:'level'}},
      {id:'find-phone', label:'Find phone', icon:'find', builtin:'find-phone'}
    ]};
}
function normalize(value) {
  known(value, ['version','dark','notificationPreview','showNotifications','activityOrder','disabledActivities','pins']);
  if (value.version !== 1 || !Array.isArray(value.pins) || value.pins.length > 64) invalid('Invalid Dashboard settings version or pin count.');
  var seen = Object.create(null), out = {version:1,
    dark:boolean(value.dark, false, 'watch theme'),
    notificationPreview:boolean(value.notificationPreview, false, 'notification preview'),
    showNotifications:boolean(value.showNotifications, true, 'notification visibility'),
    activityOrder:strings(value.activityOrder, 'activity priority entries'),
    disabledActivities:strings(value.disabledActivities, 'hidden activity entries'),
    pins:value.pins.map(function(entry) {
      var item = pin(entry); if (seen[item.id]) invalid('Duplicate pin ID.'); seen[item.id] = true; return item;
    })};
  if (bytes(JSON.stringify(out)) > 32768) invalid('Dashboard settings exceed 32 KiB.');
  return out;
}
function load(storage) {
  try {
    var encoded = storage.getItem(KEY);
    return encoded === null || encoded === undefined ? defaults() : normalize(JSON.parse(encoded));
  } catch (error) { return null; }
}
function save(storage, value) {
  var out = normalize(value), encoded = JSON.stringify(out);
  storage.setItem(KEY, encoded);
  if (storage.getItem(KEY) !== encoded) invalid('Settings could not be confirmed.');
  return out;
}
return {key:KEY, icons:ICONS, defaults:defaults, normalize:normalize, load:load, save:save};
}
module.exports = createModel();
module.exports.browserFactory = createModel;
