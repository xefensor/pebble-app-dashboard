'use strict';

var settings = require('../pkjs/settings');
function safeText(value, max) { return typeof value === 'string' ? value.replace(/[\u0000-\u001f]/g, '').slice(0, max || 128) : ''; }
function object(value) { return !!value && typeof value === 'object' && !Array.isArray(value); }
function uuid(value) { return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value); }
function catalogue(plugins) {
  if (!Array.isArray(plugins)) throw Error('Plugin catalogue is unavailable.');
  var clean = plugins.slice(0, 128).filter(function(plugin) { return object(plugin) && uuid(plugin.uuid); }).map(function(plugin) {
    return {uuid:plugin.uuid, name:safeText(plugin.name || plugin.displayName || plugin.uuid, 96),
      sources:Array.isArray(plugin.sources) ? plugin.sources.slice(0, 64).filter(object) : [],
      actions:Array.isArray(plugin.actions) ? plugin.actions.slice(0, 64).filter(object) : []};
  });
  return {plugins:clean, instances:[], activities:clean.filter(function(plugin) {
    return plugin.sources.some(function(source) { return source.category === 'activity' && Array.isArray(source.items) && source.items.some(function(item) { return ['summary','live','card','session'].indexOf(item) !== -1; }); });
  }).map(function(plugin) { return {key:plugin.uuid, name:plugin.name}; }).concat([{key:'builtin:music', name:'Music'}])};
}
function instanceName(instance) {
  var property = instance && instance.properties && instance.properties.name;
  return safeText(property && (property.shortText && property.shortText.text || property.longText && property.longText.text) || instance && instance.instanceId, 96);
}
function register(pebble, storage) {
  pebble.registerConfigHandler(function(message, respond) {
    message = message || {};
    var type = message.type;
    if (!type || type === 'load_settings' || type === 'getSettings') {
      var loaded = settings.load(storage);
      respond({ok:true, settings:loaded || settings.defaults(), needsRepair:!loaded});
    } else if (type === 'save_settings' || type === 'saveSettings') {
      try { respond({ok:true, settings:settings.save(storage, message.settings)}); }
      catch (error) { respond({ok:false, message:safeText(error && error.message || 'Settings were not saved.', 160)}); }
    } else if (type === 'catalogue') {
      if (typeof pebble.enumeratePlugins !== 'function') { respond({ok:false, message:'Enable plugins in the Pebble app to choose sources.'}); return; }
      try {
        Promise.resolve(pebble.enumeratePlugins()).then(function(plugins) {
          try { respond({ok:true, catalogue:catalogue(plugins)}); }
          catch (error) { respond({ok:false, message:'Plugin catalogue is invalid.'}); }
        }, function() { respond({ok:false, message:'Could not read installed plugins.'}); });
      } catch (error) { respond({ok:false, message:'Could not read installed plugins.'}); }
    } else if (type === 'inspect_source') {
      var source = message.source;
      if (!object(source) || typeof source.category !== 'string' || typeof source.item !== 'string' ||
          source.category.length > 64 || source.item.length > 64 || source.plugin !== undefined && !uuid(source.plugin) ||
          source.category === 'phone' && source.item === 'find_my_phone') {
        respond({ok:false, message:'This source cannot be inspected. Find phone is an action, not a reading.'}); return;
      }
      if (typeof pebble.readSource !== 'function') { respond({ok:false, message:'Source inspection is unavailable. You can keep the configured instance.'}); return; }
      try {
        var request = {category:source.category, item:source.item, properties:['name']};
        if (source.plugin) request.plugin = source.plugin;
        Promise.resolve(pebble.readSource(request)).then(function(envelope) {
          if (!envelope || !Array.isArray(envelope.instances) || !uuid(envelope.pluginUuid) || source.plugin && source.plugin.toLowerCase() !== envelope.pluginUuid.toLowerCase()) {
            respond({ok:false, message:'Source data is unavailable or came from a different plugin.'}); return;
          }
          respond({ok:true, instances:envelope.instances.slice(0, 128).filter(function(instance) { return instance && typeof instance.instanceId === 'string' && instance.instanceId.length <= 128 && !/[\u0000-\u001f]/.test(instance.instanceId); }).map(function(instance) {
            return {plugin:envelope.pluginUuid, category:source.category, item:source.item, instanceId:instance.instanceId, name:instanceName(instance), properties:Object.keys(instance.properties || {}).slice(0, 128)};
          })});
        }, function() { respond({ok:false, message:'Could not read instances. Check source permissions in Pebble.'}); });
      } catch (error) { respond({ok:false, message:'Could not read source instances.'}); }
    } else respond({ok:false, message:'Unknown settings request.'});
  });
}
if (typeof Pebble !== 'undefined') register(Pebble, localStorage);
module.exports = {register:register, catalogue:catalogue};
