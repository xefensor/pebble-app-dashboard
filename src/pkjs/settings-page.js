'use strict';

var model = require('./settings');
function behavior(initial, makeModel) {
  'use strict';
  var model = makeModel(), $ = function(id) { return document.getElementById(id); };
  var draft, confirmed = '', loaded = false, phase = 'loading', uncertain = false, repairing = false;
  var catalogue = initial.catalogue || {plugins:[], instances:[], activities:[]}, bridgeReady = false, pkjsReady = false;
  var channels = {}, editing = null, inspectVersion = 0, sourceEntries = [], actionEntries = [], argumentFields = [];
  var legacy = initial.mode === 'legacy';
  var cataloguePhase = legacy ? catalogue.error ? 'error' : 'ready' : 'waiting';
  var catalogueMessage = '', bridgeTimer = null, catalogueRefresh = 0, catalogueTargetTimer = null;
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function say(value, error) { $('status').textContent = value; $('status').className = error ? 'status error' : 'status'; }
  function meta(value, fallback) { return typeof value === 'string' && value ? value : fallback || ''; }
  function node(tag, value, className) { var el = document.createElement(tag); if (value !== undefined) el.textContent = value; if (className) el.className = className; return el; }
  function option(select, value, label) { var el = node('option', label); el.value = value; select.appendChild(el); }
  function pending() { return phase === 'saving'; }
  function dirty() { return loaded && (repairing || uncertain || JSON.stringify(draft) !== confirmed); }
  function controls() {
    document.querySelectorAll('[data-edit]').forEach(function(field) { field.disabled = !loaded || pending() || field.getAttribute('data-boundary') === 'true' || field.getAttribute('data-automatic') === 'true'; });
    $('save').disabled = !loaded || pending() || editing !== null || !dirty();
    $('discard').disabled = pending() || !loaded || !dirty() && editing === null;
    $('discard').textContent = legacy ? 'Cancel' : uncertain ? 'Reload saved' : 'Discard';
    $('save').textContent = pending() ? 'Saving…' : 'Save';
    $('retry').hidden = phase !== 'load-error';
    $('add-pin').disabled = !loaded || pending() || draft.pins.length >= 64;
    $('preview').disabled = !loaded || pending() || !draft.showNotifications;
    $('editor').hidden = editing === null;
    if (editing !== null) $('editor-heading').textContent = editing.index < draft.pins.length ? 'Edit pinned item' : 'Add pinned item';
  }
  function changed() {
    if (!loaded || pending()) return;
    draft.dark = $('dark').checked; draft.showNotifications = $('notifications').checked; draft.notificationPreview = $('preview').checked;
    controls(); say(uncertain ? 'Save not confirmed. Reload saved settings or save again.' : dirty() ? 'Unsaved changes.' : 'No changes to save.', uncertain);
  }
  function apply(value, needsRepair) {
    draft = model.normalize(value); confirmed = JSON.stringify(draft); loaded = true; phase = 'ready'; uncertain = false; repairing = !!needsRepair; editing = null;
    $('dark').checked = draft.dark; $('notifications').checked = draft.showNotifications; $('preview').checked = draft.notificationPreview;
    renderPins(); renderActivities(); controls();
    say(repairing ? 'Saved settings were unreadable. Review these defaults before explicitly saving.' : 'No changes to save.', repairing);
  }
  function request(payload, complete, failure, channel, target) {
    channel = channel || 'settings';
    var slot = channels[channel] || (channels[channel] = {id:0, timer:null}), id = ++slot.id;
    if (slot.timer !== null) clearTimeout(slot.timer);
    slot.timer = setTimeout(function() { if (slot.id === id) { slot.id++; slot.timer = null; failure(); } }, 7000);
    function done(fn, response) { if (slot.id !== id) return; slot.id++; clearTimeout(slot.timer); slot.timer = null; fn(response); }
    try {
      var result = Pebble.sendMessage(target || 'plugin', payload);
      if (!result || typeof result.then !== 'function') { done(failure); return; }
      result.then(function(response) { done(complete, response); }, function() { done(failure); });
    } catch (error) { done(failure); }
  }
  function loadFailed() { phase = 'load-error'; loaded = false; controls(); say('Could not load saved settings. Retry before editing.', true); }
  function load() {
    phase = 'loading'; loaded = false; editing = null; controls(); say('Loading settings…');
    if (!bridgeReady) {
      if (bridgeTimer !== null) clearTimeout(bridgeTimer);
      bridgeTimer = setTimeout(function() { bridgeTimer = null; loadFailed(); catalogueFailed('Pebble did not connect to the settings plugin. Reopen this page from Pebble.'); }, 7000);
      return;
    }
    request({type:'load_settings'}, function(response) {
      try { if (!response || response.ok !== true) throw Error(); apply(response.settings, response.needsRepair); }
      catch (error) { loadFailed(); }
    }, loadFailed);
    refreshCatalogue();
  }
  function sourceKey(reading) { return [reading.plugin || '',reading.category,reading.item].join('|'); }
  function actionKey(action) { return action.plugin + '|' + action.action; }
  function collectSources() {
    var entries = [
      {key:'|weather|location', category:'weather', item:'location', name:'Preferred weather', properties:{temperature:['numericValue'], humidity:['numericValue'], high:['numericValue'], low:['numericValue'], condition:['shortText'], sunrise:['timestamp'], sunset:['timestamp']}},
      {key:'|phone|phone_state', category:'phone', item:'phone_state', name:'Phone', properties:{battery_level:['numericValue'], charging:['boolean']}},
      {key:'|watch-local|battery', category:'watch-local', item:'battery', name:'Watch battery', properties:{level:['numericValue']}}
    ];
    (catalogue.plugins || []).forEach(function(plugin) {
      (plugin.sources || []).forEach(function(source) {
        if (!source || typeof source.category !== 'string' || source.category === 'activity') return;
        (source.items || []).forEach(function(item) {
          if (typeof item !== 'string' || source.category === 'phone' && item === 'find_my_phone') return;
          var entry = {plugin:plugin.uuid, category:source.category, item:item, properties:source.properties || {}, name:meta(plugin.name, plugin.uuid) + ' · ' + source.category + '/' + item};
          entry.key = sourceKey(entry); entries.push(entry);
        });
      });
    });
    return entries;
  }
  function collectActions() {
    var entries = [];
    (catalogue.plugins || []).forEach(function(plugin) {
      (plugin.actions || []).forEach(function(action) {
        if (!action || typeof action.name !== 'string') return;
        entries.push({key:plugin.uuid + '|' + action.name, plugin:plugin.uuid, action:action.name, name:meta(plugin.name, plugin.uuid) + ' · ' + meta(action.label || action.title, action.name), metadata:action});
      });
    });
    return entries;
  }
  function refreshCatalogue() {
    if (legacy || !bridgeReady) return;
    var refresh = ++catalogueRefresh, chosen = false;
    if (catalogueTargetTimer !== null) clearTimeout(catalogueTargetTimer);
    catalogueTargetTimer = null;
    cataloguePhase = 'loading'; catalogueMessage = ''; renderActivities(); controls();
    $('catalogue-status').textContent = 'Loading available plugins…';
    function fetch(target, fallback) {
      if (refresh !== catalogueRefresh) return;
      request({type:'catalogue'}, function(response) {
        if (refresh !== catalogueRefresh) return;
        if (!response || response.ok !== true || !response.catalogue || !Array.isArray(response.catalogue.plugins) || !Array.isArray(response.catalogue.activities)) {
          if (target === 'pkjs' && (!response || response.ok !== false)) { fetch('plugin', true); return; }
          catalogueFailed(response && response.message); return;
        }
        catalogue = response.catalogue; cataloguePhase = response.cached ? 'cached' : 'ready'; catalogueMessage = meta(response.message, '');
        if (fallback) catalogueMessage = 'Live discovery is unavailable. ' + (catalogueMessage || 'Open Dashboard on your watch to refresh installed plugins.');
        renderActivities(); controls();
        $('catalogue-status').textContent = response.cached ? catalogueMessage || 'Saved plugin metadata. Open Dashboard on your watch to refresh installed plugins.' :
          'Choose from ' + (catalogue.plugins || []).length + ' installed plugins. Saved unavailable bindings are kept.';
        // A delayed catalogue reply must not replace fields being edited. The
        // next explicit editor open picks up the refreshed metadata.
        if (editing !== null) $('inspect-status').textContent = 'Available plugins updated. Reopen this item to use the refreshed choices.';
        else { sourceEntries = collectSources(); actionEntries = collectActions(); }
      }, function() { if (refresh !== catalogueRefresh) return; if (target === 'pkjs') fetch('plugin', true); else catalogueFailed(); }, 'catalogue', target);
    }
    function choose(target) {
      if (chosen || refresh !== catalogueRefresh) return;
      chosen = true; clearTimeout(catalogueTargetTimer); catalogueTargetTimer = null; fetch(target);
    }
    if (typeof Pebble.targets === 'function') {
      catalogueTargetTimer = setTimeout(function() { choose(pkjsReady ? 'pkjs' : 'plugin'); }, 7000);
      try { Promise.resolve(Pebble.targets()).then(function(targets) {
        choose(Array.isArray(targets) ? targets.some(function(target) { return target && target.id === 'pkjs'; }) ? 'pkjs' : 'plugin' : pkjsReady ? 'pkjs' : 'plugin');
      }, function() { choose(pkjsReady ? 'pkjs' : 'plugin'); }); }
      catch (error) { choose(pkjsReady ? 'pkjs' : 'plugin'); }
    } else choose(pkjsReady ? 'pkjs' : 'plugin');
  }
  function catalogueFailed(message) {
    cataloguePhase = 'error'; catalogueMessage = meta(message, 'Plugin discovery failed. Check plugin access in Pebble, then retry.').slice(0, 180);
    $('catalogue-status').textContent = catalogueMessage + ' Your saved items are kept.';
    renderActivities(); controls();
  }
  function summary(pin) {
    var parts = [];
    if (pin.reading) parts.push(pin.reading.category === 'watch-local' ? 'Watch battery' : pin.reading.category + '/' + pin.reading.item + ' · ' + pin.reading.property);
    if (pin.builtin) parts.push('Tap: Ring phone');
    else if (pin.action) parts.push('Tap: ' + pin.action.label);
    if (pin.openApp) parts.push('Hold: ' + pin.openApp.label);
    return parts.join(' · ') || 'No reading or action configured';
  }
  function smallButton(label, action, title, disabled) {
    var button = node('button', label); button.type = 'button'; button.setAttribute('data-edit', '');
    if (title) button.setAttribute('aria-label', title); button.disabled = !!disabled;
    if (disabled) button.setAttribute('data-boundary', 'true');
    button.onclick = action; return button;
  }
  function moved() { renderPins(); renderActivities(); controls(); say('Unsaved changes.'); }
  function renderPins() {
    var list = $('pins'); list.textContent = '';
    if (!draft) return;
    draft.pins.forEach(function(pin, index) {
      var row = node('li', undefined, 'item'), title = node('div', undefined, 'item-title');
      title.appendChild(node('strong', pin.label)); title.appendChild(node('span', String(index + 1), 'position')); row.appendChild(title);
      row.appendChild(node('p', summary(pin), 'hint'));
      var buttons = node('div', undefined, 'row-buttons');
      buttons.appendChild(smallButton('Edit', function() { openEditor(index); }, 'Edit ' + pin.label));
      buttons.appendChild(smallButton('↑', function() { if (index > 0) { var item = draft.pins.splice(index, 1)[0]; draft.pins.splice(index - 1, 0, item); moved(); } }, 'Move ' + pin.label + ' up', index === 0));
      buttons.appendChild(smallButton('↓', function() { if (index + 1 < draft.pins.length) { var item = draft.pins.splice(index, 1)[0]; draft.pins.splice(index + 1, 0, item); moved(); } }, 'Move ' + pin.label + ' down', index + 1 === draft.pins.length));
      buttons.appendChild(smallButton('Remove', function() { draft.pins.splice(index, 1); moved(); }, 'Remove ' + pin.label));
      row.appendChild(buttons); list.appendChild(row);
    });
    $('pins-empty').hidden = !!draft.pins.length;
  }
  function activityList() {
    var known = {'builtin:music':{key:'builtin:music', name:'Music'}};
    (catalogue.activities || []).forEach(function(item) { if (item && typeof item.key === 'string') known[item.key] = {key:item.key, name:meta(item.name, item.key)}; });
    var keys = (draft ? draft.activityOrder : []).slice();
    if (draft) draft.disabledActivities.forEach(function(key) { if (keys.indexOf(key) < 0) keys.push(key); });
    Object.keys(known).forEach(function(key) { if (keys.indexOf(key) < 0) keys.push(key); });
    return keys.map(function(key) { return known[key] || {key:key, name:'Unavailable activity (' + key + ')'}; });
  }
  function renderActivities() {
    var status = $('activities-status'), retry = $('retry-activities');
    status.className = cataloguePhase === 'error' ? 'hint error' : 'hint';
    status.textContent = cataloguePhase === 'waiting' ? 'Connecting to Pebble to discover installed activity providers…' :
      cataloguePhase === 'loading' ? 'Loading installed activity providers…' :
      cataloguePhase === 'error' ? catalogueMessage || catalogue.error || 'Could not discover installed activity providers. Music and your saved choices are still shown.' :
      cataloguePhase === 'cached' ? catalogueMessage || 'Saved provider list. Open Dashboard on your watch to refresh installed plugins, then check again.' :
      'Installed activity providers are listed even when no activity is running.';
    retry.hidden = legacy || cataloguePhase !== 'error' && cataloguePhase !== 'cached'; retry.disabled = pending();
    retry.textContent = cataloguePhase === 'cached' ? 'Check again' : 'Retry activity discovery';
    var target = $('activities'); target.textContent = ''; if (!draft) return;
    var activities = activityList(); $('activities-empty').hidden = !!activities.length;
    activities.forEach(function(activity, index) {
      var row = node('li', undefined, 'item'), label = node('label', undefined, 'inline'), check = node('input');
      check.type = 'checkbox'; check.checked = draft.disabledActivities.indexOf(activity.key) < 0; check.setAttribute('data-edit', '');
      check.onchange = function() {
        var i = draft.disabledActivities.indexOf(activity.key);
        if (check.checked && i >= 0) draft.disabledActivities.splice(i, 1);
        if (!check.checked && i < 0) draft.disabledActivities.push(activity.key);
        controls(); say('Unsaved changes.');
      };
      label.appendChild(check); label.appendChild(node('span', activity.name)); row.appendChild(label);
      var buttons = node('div', undefined, 'row-buttons');
      function move(delta) { var keys = activities.map(function(item) { return item.key; }), next = index + delta; if (next < 0 || next >= keys.length) return; keys.splice(index, 1); keys.splice(next, 0, activity.key); draft.activityOrder = keys; moved(); }
      buttons.appendChild(smallButton('↑', function() { move(-1); }, 'Raise priority of ' + activity.name, index === 0));
      buttons.appendChild(smallButton('↓', function() { move(1); }, 'Lower priority of ' + activity.name, index + 1 === activities.length));
      row.appendChild(buttons); target.appendChild(row);
    });
  }
  function currentSource() { return sourceEntries.filter(function(entry) { return entry.key === $('source').value; })[0]; }
  function currentAction() { return actionEntries.filter(function(entry) { return entry.key === $('action').value; })[0]; }
  function refreshEditorChoices() {
    if (editing === null) return;
    var current = editing.pin, sourceValue = $('source').value || current.reading && sourceKey(current.reading), actionValue = $('action').value || (current.builtin ? 'builtin:find-phone' : current.action && actionKey(current.action)) || 'none';
    sourceEntries = collectSources(); actionEntries = collectActions();
    if (current.reading && !sourceEntries.some(function(entry) { return entry.key === sourceKey(current.reading); })) {
      var missing = clone(current.reading); missing.key = sourceKey(missing); missing.name = 'Saved source · unavailable'; missing.properties = {}; missing.properties[missing.property] = ['shortText']; sourceEntries.push(missing);
    }
    $('source').textContent = ''; sourceEntries.forEach(function(entry) { option($('source'), entry.key, entry.name); }); $('source').value = sourceValue || sourceEntries[0].key;
    $('action').textContent = ''; option($('action'), 'none', 'No tap action'); option($('action'), 'builtin:find-phone', 'Find phone · Ring');
    actionEntries.forEach(function(entry) { option($('action'), entry.key, entry.name); });
    if (current.action && !actionEntries.some(function(entry) { return entry.key === actionKey(current.action); })) {
      var missingAction = {key:actionKey(current.action), plugin:current.action.plugin, action:current.action.action, name:'Saved action · unavailable', metadata:{}}; actionEntries.push(missingAction); option($('action'), missingAction.key, missingAction.name);
    }
    $('action').value = actionValue; refreshProperties(current.reading); renderArguments(current.action && current.action.args || {}); renderEditorState();
  }
  function refreshProperties(reading) {
    var source = currentSource(), selectedProperty = reading && reading.property || $('property').value, props = source && source.properties || {};
    $('property').textContent = '';
    Object.keys(props).filter(function(name) { return (props[name] || []).some(function(shape) { return ['shortText','longText','numericValue','timestamp','boolean'].indexOf(shape) >= 0; }); }).forEach(function(name) { option($('property'), name, name); });
    if (selectedProperty && !Array.from($('property').options).some(function(item) { return item.value === selectedProperty; })) option($('property'), selectedProperty, selectedProperty + ' (saved)');
    if (selectedProperty) $('property').value = selectedProperty;
    $('toggle').textContent = ''; option($('toggle'), '', 'Use the entered action arguments');
    Object.keys(props).filter(function(name) { return (props[name] || []).indexOf('boolean') >= 0; }).forEach(function(name) { option($('toggle'), name, 'Toggle using ' + name); });
    if (reading && editing && editing.pin.action && editing.pin.action.toggleProperty) {
      var toggle = editing.pin.action.toggleProperty;
      if (!Array.from($('toggle').options).some(function(item) { return item.value === toggle; })) option($('toggle'), toggle, toggle + ' (saved on/off property)');
      $('toggle').value = toggle;
    }
    renderInstances(reading);
    automaticArguments();
  }
  function renderInstances(reading) {
    var source = currentSource(), selected = reading && reading.instanceId !== undefined ? 'id:' + reading.instanceId : $('instance').value || 'index:0';
    $('instance').textContent = ''; option($('instance'), 'index:0', 'First instance (source order)');
    (catalogue.instances || []).filter(function(item) { return source && item.category === source.category && item.item === source.item && (!source.plugin || item.plugin === source.plugin); }).forEach(function(item) { option($('instance'), 'id:' + item.instanceId, meta(item.name, item.instanceId)); });
    if (reading && reading.instanceId === undefined && reading.index > 0) { selected = 'index:' + reading.index; option($('instance'), selected, 'Source position ' + (reading.index + 1) + ' (saved)'); }
    if (selected && !Array.from($('instance').options).some(function(item) { return item.value === selected; })) option($('instance'), selected, selected.slice(3) + ' (saved instance)');
    $('instance').value = selected;
    $('inspect-source').disabled = !source || source.category === 'watch-local';
    $('inspect-source').setAttribute('data-boundary', $('inspect-source').disabled ? 'true' : 'false');
  }
  function renderEditorState() {
    $('reading-fields').hidden = !$('has-reading').checked;
    var hasAction = $('action').value !== 'none'; $('action-fields').hidden = !hasAction || $('action').value === 'builtin:find-phone';
    $('app-fields').hidden = !$('has-app').checked;
    automaticArguments();
  }
  function automaticArguments() {
    var entry = currentAction(), source = currentSource(), schema = entry && entry.metadata.parameters || {};
    var on = schema.properties && schema.properties.on;
    var automatic = !!(entry && entry.action === 'set_on' && on && on.type === 'boolean' &&
      $('has-reading').checked && source && $('toggle').value && $('instance').value.indexOf('id:') === 0);
    argumentFields.forEach(function(argument) {
      var derived = automatic && ['item','instanceId','on'].indexOf(argument.name) >= 0;
      argument.automatic = derived; argument.field.parentNode.hidden = derived;
      argument.field.setAttribute('data-automatic', derived ? 'true' : 'false');
      argument.field.disabled = derived || !loaded || pending();
    });
    $('automatic-args').hidden = !automatic;
    return automatic;
  }
  function renderArguments(args) {
    var entry = currentAction(), schema = entry && (entry.metadata.parameters || entry.metadata.argsSchema || entry.metadata.inputSchema || entry.metadata.schema) || {};
    var properties = schema && schema.properties || {}, required = schema.required || [];
    $('arguments').textContent = ''; argumentFields = [];
    Object.keys(properties).slice(0, 24).forEach(function(name) {
      var property = properties[name] || {}, label = node('label', meta(property.title, name) + (required.indexOf(name) >= 0 ? ' *' : ''));
      var field;
      if (Array.isArray(property.enum)) { field = node('select'); if (required.indexOf(name) < 0) option(field, '', 'Not set'); property.enum.forEach(function(value) { option(field, JSON.stringify(value), String(value)); }); if (args[name] !== undefined) field.value = JSON.stringify(args[name]); }
      else if (property.type === 'boolean') { field = node('select'); if (required.indexOf(name) < 0) option(field, '', 'Not set'); option(field, 'true', 'On / true'); option(field, 'false', 'Off / false'); if (args[name] !== undefined) field.value = String(args[name]); }
      else if (property.type === 'number' || property.type === 'integer') { field = node('input'); field.type = 'number'; field.step = property.type === 'integer' ? '1' : 'any'; if (property.minimum !== undefined) field.min = property.minimum; if (property.maximum !== undefined) field.max = property.maximum; if (args[name] !== undefined) field.value = args[name]; }
      else if (property.type === 'string' || !property.type) { field = node('input'); field.type = 'text'; if (property.maxLength) field.maxLength = property.maxLength; field.value = args[name] === undefined ? '' : String(args[name]); }
      else { field = node('textarea'); field.rows = 3; field.value = args[name] === undefined ? '' : JSON.stringify(args[name]); }
      field.setAttribute('data-edit', ''); field.setAttribute('aria-label', meta(property.title, name));
      label.appendChild(field); $('arguments').appendChild(label); argumentFields.push({name:name, field:field, schema:property, required:required.indexOf(name) >= 0});
    });
    $('args-json').value = JSON.stringify(args, null, 2); $('args-json-wrap').open = !argumentFields.length && Object.keys(args).length > 0;
    $('arguments-note').textContent = argumentFields.length ? 'Values below are taken from the plugin’s declared action fields.' : 'This action declares no editable fields. Extra arguments can be entered under Advanced arguments.';
    automaticArguments();
  }
  function openEditor(index) {
    if (!loaded || pending()) return;
    var pin = draft.pins[index] || {id:'pin-' + Date.now().toString(36), label:'New item', icon:'generic'};
    editing = {index:index, pin:clone(pin)}; inspectVersion++;
    $('pin-label').value = pin.label; $('icon').value = pin.icon || 'generic'; $('has-reading').checked = !!pin.reading;
    $('source').textContent = ''; $('action').textContent = ''; $('property').textContent = ''; $('instance').textContent = '';
    $('action-label').value = pin.action && pin.action.label || 'Run'; $('confirm-action').checked = !!(pin.action && pin.action.confirm);
    $('has-app').checked = !!pin.openApp; $('app-uuid').value = pin.openApp && pin.openApp.watchAppUuid || ''; $('app-label').value = pin.openApp && pin.openApp.label || '';
    $('editor-error').textContent = ''; $('inspect-status').textContent = '';
    refreshEditorChoices(); controls(); say('Editing an item. Choose Use item, then Save to apply it.'); $('pin-label').focus(); $('editor').scrollIntoView({block:'start', behavior:'auto'});
  }
  function gatherArguments() {
    var args;
    try { args = JSON.parse($('args-json').value || '{}'); } catch (error) { throw Error('Advanced arguments must contain a JSON object.'); }
    if (!args || typeof args !== 'object' || Array.isArray(args)) throw Error('Action arguments must be an object.');
    var automatic = automaticArguments();
    argumentFields.forEach(function(entry) {
      if (entry.automatic) { delete args[entry.name]; return; }
      var value = entry.field.value, schema = entry.schema;
      if (value === '') { if (entry.required) throw Error('Enter ' + entry.name + '.'); delete args[entry.name]; return; }
      if (Array.isArray(schema.enum) || schema.type === 'boolean' || schema.type === 'object' || schema.type === 'array') { try { value = JSON.parse(value); } catch (error) { throw Error('Enter a valid value for ' + entry.name + '.'); } }
      else if (schema.type === 'number' || schema.type === 'integer') { value = Number(value); if (!isFinite(value) || schema.type === 'integer' && value % 1) throw Error('Enter a valid number for ' + entry.name + '.'); if (schema.minimum !== undefined && value < schema.minimum || schema.maximum !== undefined && value > schema.maximum) throw Error(entry.name + ' is outside its allowed range.'); }
      if (typeof value === 'string' && (schema.minLength && value.length < schema.minLength || schema.maxLength && value.length > schema.maxLength)) throw Error('Check the length of ' + entry.name + '.');
      args[entry.name] = value;
    });
    if (automatic) ['item','instanceId','on'].forEach(function(name) { delete args[name]; });
    return args;
  }
  function acceptEditor(event) {
    if (event) event.preventDefault(); if (!editing) return;
    try {
      var pin = {id:editing.pin.id, label:$('pin-label').value.trim(), icon:$('icon').value};
      if ($('has-reading').checked) {
        var source = currentSource(); if (!source || !$('property').value) throw Error('Choose a source and reading.');
        pin.reading = {category:source.category, item:source.item, property:$('property').value}; if (source.plugin) pin.reading.plugin = source.plugin;
        var instance = $('instance').value; if (instance.indexOf('id:') === 0) pin.reading.instanceId = instance.slice(3); else pin.reading.index = Number(instance.slice(6));
      }
      if ($('action').value === 'builtin:find-phone') pin.builtin = 'find-phone';
      else if ($('action').value !== 'none') {
        var action = currentAction(); if (!action) throw Error('Choose an available action or keep its saved binding.');
        pin.action = {plugin:action.plugin, action:action.action, args:gatherArguments(), label:$('action-label').value.trim(), confirm:$('confirm-action').checked};
        if ($('toggle').value) { if (!pin.reading) throw Error('Choose a reading before binding its on/off state.'); pin.action.toggleProperty = $('toggle').value; }
      }
      if ($('has-app').checked) pin.openApp = {watchAppUuid:$('app-uuid').value.trim(), label:$('app-label').value.trim()};
      var next = clone(draft); if (editing.index < next.pins.length) next.pins[editing.index] = pin; else next.pins.push(pin);
      draft = model.normalize(next); editing = null; inspectVersion++; renderPins(); controls(); say('Pinned item updated. Save to apply your changes.');
    } catch (error) { $('editor-error').textContent = error.message || 'Check this pinned item.'; }
  }
  $('editor-form').onsubmit = acceptEditor;
  $('editor-cancel').onclick = function() { editing = null; inspectVersion++; controls(); };
  $('add-pin').onclick = function() { openEditor(draft.pins.length); };
  ['dark','notifications','preview'].forEach(function(id) { $(id).onchange = changed; });
  $('has-reading').onchange = renderEditorState; $('has-app').onchange = renderEditorState;
  $('instance').onchange = automaticArguments; $('toggle').onchange = automaticArguments;
  $('source').onchange = function() { inspectVersion++; $('instance').value = 'index:0'; refreshProperties(); $('inspect-status').textContent = ''; };
  $('action').onchange = function() { var entry = currentAction(); if (entry) $('action-label').value = meta(entry.metadata.label || entry.metadata.title, 'Run'); $('toggle').value = ''; renderArguments({}); renderEditorState(); };
  $('inspect-source').onclick = function() {
    if (legacy || !bridgeReady) { $('inspect-status').textContent = 'Reopen Dashboard settings from the Pebble app to refresh instances.'; return; }
    var source = currentSource(), version = ++inspectVersion; if (!source || source.category === 'watch-local') return;
    $('inspect-status').textContent = 'Loading instances…';
    var requestSource = {category:source.category, item:source.item}; if (source.plugin) requestSource.plugin = source.plugin;
    request({type:'inspect_source', source:requestSource}, function(response) {
      if (!editing || inspectVersion !== version || currentSource().key !== source.key) return;
      if (!response || !response.ok || !Array.isArray(response.instances)) { $('inspect-status').textContent = response && response.message || 'Instances could not be loaded. Saved choices are kept.'; return; }
      catalogue.instances = (catalogue.instances || []).filter(function(item) { return !(item.category === source.category && item.item === source.item && (!source.plugin || item.plugin === source.plugin)); }).concat(response.instances);
      renderInstances(); $('inspect-status').textContent = response.instances.length ? 'Instances loaded. Choose the item you want.' : 'No current instances. The saved binding is kept.';
    }, function() { if (editing && inspectVersion === version) $('inspect-status').textContent = 'Instances could not be loaded. Saved choices are kept.'; }, 'inspect');
  };
  $('refresh-catalogue').onclick = refreshCatalogue; $('retry-activities').onclick = refreshCatalogue; $('retry').onclick = load;
  $('discard').onclick = function() {
    if (legacy) { location.href = 'pebblejs://close#'; return; }
    if (uncertain) { load(); return; }
    apply(JSON.parse(confirmed), repairing);
  };
  function saveFailed() { phase = 'ready'; uncertain = true; controls(); say('Save not confirmed. Reload saved settings or save again.', true); }
  function notifyPkjs() {
    if (!pkjsReady) return;
    var saved = confirmed;
    function refreshFailed() {
      if (confirmed === saved && !dirty() && editing === null && phase === 'ready') say('Settings saved. Reopen Dashboard if the watch has not updated.');
    }
    try {
      Promise.resolve(Pebble.sendMessage('pkjs', {type:'reload_settings'})).then(function(response) { if (!response || !response.ok) refreshFailed(); }, refreshFailed);
    } catch (error) { refreshFailed(); }
  }
  $('save').onclick = function(event) {
    if (event) event.preventDefault(); if ($('save').disabled) return;
    var chosen; try { chosen = model.normalize(draft); } catch (error) { say(error.message, true); return; }
    if (legacy) { location.href = 'pebblejs://close#' + encodeURIComponent(JSON.stringify(chosen)); return; }
    phase = 'saving'; controls(); say('Saving settings…');
    request({type:'save_settings', settings:chosen}, function(response) {
      if (!response || !response.ok) { saveFailed(); return; }
      try { apply(response.settings || chosen, false); say('Settings saved.'); notifyPkjs(); } catch (error) { saveFailed(); }
    }, saveFailed);
  };
  function measureFooter() {
    var footer = $('actions'), height = footer.getBoundingClientRect().height, viewport = window.visualViewport && window.visualViewport.height || window.innerHeight;
    var flow = viewport < 560 || height > viewport * 0.3;
    footer.setAttribute('data-flow', flow ? 'true' : 'false'); document.documentElement.style.setProperty('--footer-space', (flow ? 0 : height) + 'px');
  }
  window.addEventListener('resize', measureFooter); if (window.visualViewport) window.visualViewport.addEventListener('resize', measureFooter);
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(measureFooter).observe($('actions'));
  model.icons.forEach(function(icon) { option($('icon'), icon, icon.charAt(0).toUpperCase() + icon.slice(1)); });
  if (legacy) { sourceEntries = collectSources(); actionEntries = collectActions(); try { apply(initial.settings, initial.needsRepair); } catch (error) { loadFailed(); } $('catalogue-status').textContent = catalogue.error || 'Installed sources and saved bindings are shown below.'; }
  else {
    draft = model.defaults(); renderActivities(); load();
    if (typeof Pebble !== 'undefined' && typeof Pebble.addEventListener === 'function') Pebble.addEventListener('ready', function(event) {
      if (event && event.target === 'pkjs') { pkjsReady = true; if (bridgeReady) refreshCatalogue(); return; }
      if (event && event.target && event.target !== 'plugin' || bridgeReady) return;
      bridgeReady = true; clearTimeout(bridgeTimer); bridgeTimer = null; load();
    });
  }
  measureFooter();
}
function render(initial) {
  return [
    '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Dashboard settings</title><style>',
    ':root{color-scheme:light;--page:#f3f4f5;--card:#fff;--ink:#15191d;--muted:#5c6570;--line:#dce0e5;--field:#f6f7f8;--accent:#145ca3;--error:#a32622;--footer-space:130px}',
    '@media(prefers-color-scheme:dark){:root{color-scheme:dark;--page:#15181c;--card:#21262c;--ink:#f5f7fa;--muted:#bac2cb;--line:#3c4651;--field:#2c333c;--accent:#8ac7ff;--error:#ffb5ad}}',
    '*{box-sizing:border-box}html{scroll-padding-bottom:calc(var(--footer-space) + 20px)}body{margin:0;background:var(--page);color:var(--ink);font:16px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}main{max-width:600px;margin:auto;padding:24px 16px calc(var(--footer-space) + 28px)}h1{font-size:29px;line-height:1.2;margin:0 0 10px;letter-spacing:-.5px}h2{font-size:20px;margin:0 0 12px}h3{font-size:17px;margin:16px 0 8px}p{margin:8px 0 16px}header p,.hint{color:var(--muted)}.hint{font-size:14px;overflow-wrap:anywhere}.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:18px 16px;margin:18px 0}.card>p:last-child{margin-bottom:0}',
    'button,input,select,textarea{font:inherit}button,select,input:not([type=checkbox]),textarea{min-height:44px;border:1px solid var(--line);border-radius:8px;background:var(--field);color:var(--ink);padding:10px}button{font-weight:650;cursor:pointer}button:disabled{opacity:.45;cursor:default}input,select,textarea{width:100%;min-width:0}input[type=checkbox]{width:22px;height:22px;flex:0 0 22px;accent-color:var(--accent)}label{display:block;font-weight:650;margin:16px 0 8px}label input,label select,label textarea{display:block;margin-top:7px}.inline{display:flex;align-items:center;gap:12px;min-height:44px}.inline input{margin:0}.inline span{min-width:0;overflow-wrap:anywhere}.item-title{display:flex;align-items:start;justify-content:space-between;gap:16px}.item-title strong{overflow-wrap:anywhere}.position{color:var(--muted);font-size:14px}.items{list-style:none;margin:0;padding:0}.item{padding:16px 0;border-top:1px solid var(--line)}.item:first-child{border-top:0;padding-top:0}.row-buttons{display:flex;gap:8px;flex-wrap:wrap}.row-buttons button{flex:1;min-width:44px}.item .hint{margin-bottom:12px}summary{min-height:44px;cursor:pointer;font-weight:650;align-content:center}.error{color:var(--error)}#editor{scroll-margin-top:16px}#editor .card{margin:12px 0}fieldset{border:0;padding:0;margin:0}legend{font-size:16px;font-weight:650;padding:0}button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible,summary:focus-visible{outline:3px solid var(--accent);outline-offset:3px}[hidden]{display:none!important}',
    'footer{position:fixed;bottom:0;left:0;right:0;padding:12px 16px max(16px,env(safe-area-inset-bottom));background:var(--page);border-top:1px solid var(--line)}footer[data-flow=true]{position:static}.footer-inner{max-width:568px;margin:auto}.status{font-size:14px;min-height:21px;margin:0 0 10px}.actions{display:flex;gap:8px}.actions button{flex:1;min-width:0;overflow-wrap:anywhere}#save,#editor-save{background:#145ca3;color:#fff;border-color:#145ca3}.editor-actions{display:flex;gap:10px;margin-top:20px}.editor-actions button{flex:1}@media(max-width:340px){main{padding-left:12px;padding-right:12px}.card{padding:16px 12px}.row-buttons{gap:6px}.row-buttons button{padding-left:8px;padding-right:8px}.actions{flex-wrap:wrap}.actions button{min-width:90px}}',
    '</style></head><body><main><header><h1>Dashboard</h1><p>Choose your pinned items and activity priority. These settings belong to Dashboard.</p></header>',
    '<section class="card"><h2>On the watch</h2><label class="inline"><input id="dark" type="checkbox" data-edit><span>Dark background</span></label><label class="inline"><input id="notifications" type="checkbox" data-edit><span>Show latest notification</span></label><label class="inline"><input id="preview" type="checkbox" data-edit><span>Show notification message text</span></label><p class="hint">Message text stays private and is cleared when its source withdraws it. The notification row always opens native Notifications, even without a preview.</p></section>',
    '<section class="card"><h2>Pinned items</h2><p class="hint">The first two appear on Snapshot. Hold Down there to browse all pins. A pin can show a reading, perform a tap action, or do both.</p><ol id="pins" class="items"></ol><p id="pins-empty" class="hint" hidden>No pinned items yet.</p><button id="add-pin" type="button" data-edit>Add pinned item</button></section>',
    '<section id="editor" class="card" hidden><h2 id="editor-heading">Pinned item</h2><form id="editor-form"><label>Name<input id="pin-label" type="text" maxlength="32" autocomplete="off" data-edit></label><label>Icon<select id="icon" data-edit></select></label>',
    '<label class="inline"><input id="has-reading" type="checkbox" data-edit><span>Show a reading</span></label><div id="reading-fields"><label>Source<select id="source" data-edit></select></label><label>Reading<select id="property" data-edit></select></label><label>Instance<select id="instance" data-edit></select></label><button id="inspect-source" type="button" data-edit>Refresh instances</button><p id="inspect-status" class="hint" role="status"></p></div>',
    '<label>Tap Select<select id="action" data-edit></select></label><div id="action-fields"><label>Action label<input id="action-label" type="text" maxlength="32" data-edit></label><p id="arguments-note" class="hint"></p><p id="automatic-args" class="hint" hidden>The selected item and its next on/off state are filled automatically from this reading when you press Select.</p><div id="arguments"></div><details id="args-json-wrap"><summary>Advanced arguments</summary><p class="hint">Optional extra arguments, as a JSON object. Declared fields above take precedence; automatic toggle fields always come from the selected reading.</p><label>Arguments<textarea id="args-json" rows="4" spellcheck="false" data-edit>{}</textarea></label></details><label>Toggle an on/off reading<select id="toggle" data-edit></select></label><p class="hint">A toggle uses the source’s actual on/off state. Brightness is never treated as an on/off state.</p><label class="inline"><input id="confirm-action" type="checkbox" data-edit><span>Confirm before running this action</span></label></div>',
    '<details><summary>Associated watch app</summary><label class="inline"><input id="has-app" type="checkbox" data-edit><span>Hold Select to open an app</span></label><div id="app-fields"><label>App name<input id="app-label" type="text" maxlength="32" data-edit></label><label>Watchapp UUID<input id="app-uuid" type="text" autocomplete="off" spellcheck="false" placeholder="00000000-0000-0000-0000-000000000000" data-edit></label><p class="hint">Use the installed watch app’s UUID. This opens the app itself; the plugin’s phone settings are a separate destination.</p></div></details>',
    '<p id="editor-error" class="error" role="alert"></p><div class="editor-actions"><button id="editor-cancel" type="button">Cancel item</button><button id="editor-save" type="submit" data-edit>Use item</button></div></form></section>',
    '<section class="card"><h2>Activity priority</h2><p class="hint">The highest-priority available activity appears on Snapshot. Hold Up there to browse all activities. Hide a provider to keep its activities out of Dashboard. Dynamic keeps its own order.</p><p id="activities-status" class="hint" role="status" aria-live="polite">Connecting to Pebble…</p><button id="retry-activities" type="button" hidden>Retry activity discovery</button><ol id="activities" class="items"></ol><p id="activities-empty" class="hint">Compatible activity providers appear here after discovery.</p></section>',
    '<details class="card"><summary>Available plugins &amp; help</summary><p id="catalogue-status" class="hint">Waiting for plugin discovery…</p><button id="refresh-catalogue" type="button">Retry discovery</button><p class="hint">Allow the selected source/action permissions in Pebble. Missing providers keep their saved bindings and appear unavailable; they never switch to a different plugin.</p><p class="hint">The watch shows a button guide once on first use. Tap Select on Music to play or pause; hold Select to open the Music app. Other items use their available action on tap or associated app on hold. On Snapshot, hold Up for Activities or Down for Pinned. Within a list, hold Up/Down to scroll. Timer controls are planned separately.</p></details>',
    '</main><footer id="actions"><div class="footer-inner"><p id="status" class="status" role="status" aria-live="polite">Loading settings…</p><div class="actions"><button id="retry" type="button" hidden>Retry loading</button><button id="discard" type="button" disabled>Discard</button><button id="save" type="button" disabled>Save</button></div></div></footer><script>(', behavior.toString(), ')(',
    JSON.stringify(initial).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029'), ',(', model.browserFactory.toString(), '));</script></body></html>'
  ].join('\n');
}
module.exports = function(settings, catalogue) {
  var current, needsRepair = false;
  try { current = model.normalize(settings); } catch (error) { current = model.defaults(); needsRepair = true; }
  return render({mode:'legacy', settings:current, catalogue:catalogue || {plugins:[], instances:[], activities:[]}, needsRepair:needsRepair});
};
module.exports.config = function() { return render({mode:'plugin'}); };
