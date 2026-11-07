'use strict';

var settingsStyle = require('pebble-xoce-ui/settings-style');

var model = require('./settings');
var appPicker = require('./app-picker');
var makeLanguage = require('./settings-i18n');
function behavior(initial, makeModel, makeApps, makeLanguage) {
  'use strict';
  var language = makeLanguage((navigator.languages && navigator.languages[0]) || navigator.language || 'en', initial.translations), t = language.text;
  language.staticPage(document.body);
  var model = makeModel(), apps = makeApps(), $ = function(id) { return document.getElementById(id); };
  var draft, confirmed = '', loaded = false, phase = 'loading', uncertain = false, repairing = false, savedHere = false;
  var catalogue = initial.catalogue || {plugins:[], instances:[], activities:[]}, bridgeReady = false, pkjsReady = false;
  var channels = {}, editing = null, inspectVersion = 0, sourceEntries = [], actionEntries = [], argumentFields = [];
  var legacy = initial.mode === 'legacy';
  var cataloguePhase = legacy ? catalogue.error ? 'error' : 'ready' : 'waiting';
  var catalogueMessage = '', bridgeTimer = null, catalogueRefresh = 0, catalogueTargetTimer = null;
  var appEntries = [], appResults = [], appRequest = null, appSearchVersion = 0;
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function say(value, error) { $('status').textContent = t(value); $('status').className = error ? 'status error' : 'status'; }
  function meta(value, fallback) { return typeof value === 'string' && value ? value : fallback || ''; }
  function node(tag, value, className) { var el = document.createElement(tag); if (value !== undefined) el.textContent = value; if (className) el.className = className; return el; }
  function option(select, value, label) { var el = node('option', label); el.value = value; select.appendChild(el); }
  function pending() { return phase === 'saving'; }
  function dirty() {
    if(!loaded)return false;if(repairing||uncertain)return true;
    if(editing!==null){try{return JSON.stringify(editedSettings())!==confirmed;}catch(error){return true;}}
    return JSON.stringify(draft)!==confirmed;
  }
  function controls() {
    document.querySelectorAll('[data-edit]').forEach(function(field) { field.disabled = !loaded || pending() || editing !== null && !!field.closest('#pins') || field.getAttribute('data-boundary') === 'true' || field.getAttribute('data-automatic') === 'true'; });
    $('save').disabled = !loaded || pending() || !dirty();
    $('discard').disabled = pending() || !loaded || !dirty() && editing === null;
    $('discard').textContent = legacy ? t('Cancel') : uncertain ? t('Reload saved') : t('Discard');
    $('save').textContent = t('Save');
    $('retry').hidden = phase !== 'load-error';
    $('add-pin').disabled = !loaded || pending() || editing !== null || draft.pins.length >= 64;
    $('preview').disabled = !loaded || pending() || !draft.showNotifications;
    $('editor').hidden = editing === null;
    $('editor-cancel').disabled = pending();
    if (editing !== null) {
      $('editor-heading').textContent = editing.index < draft.pins.length ? t('Edit pinned item') : t('Add pinned item');
      $('editor-save').textContent = editing.index < draft.pins.length ? t('Done') : t('Add pin');
      $('pin-quick-setup').hidden = editing.index < draft.pins.length;
    }
  }
  function draftStatus() {
    say(uncertain?t('Save not confirmed. Reload saved settings or save again.'):dirty()?t('Unsaved changes.'):savedHere?t('✓ Saved'):t('No changes to save.'),uncertain);
  }
  function changed() {
    if (!loaded || pending()) return;
    draft.dark = $('dark').value === 'dark'; draft.showNotifications = $('notifications').checked; draft.notificationPreview = $('preview').checked;
    controls();draftStatus();
  }
  function apply(value, needsRepair) {
    cancelAppSearch();
    draft = model.normalize(value); confirmed = JSON.stringify(draft); loaded = true; phase = 'ready'; uncertain = false; repairing = !!needsRepair; savedHere = false; editing = null;
    $('dark').value = draft.dark ? 'dark' : 'light'; $('notifications').checked = draft.showNotifications; $('preview').checked = draft.notificationPreview;
    renderPins(); renderActivities(); controls();
    say(repairing ? t('Saved settings were unreadable. Review these defaults before explicitly saving.') : t('No changes to save.'), repairing);
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
  function loadFailed() { phase = 'load-error'; loaded = false; controls(); say(t('Could not load saved settings. Retry before editing.'), true); }
  function load() {
    phase = 'loading'; loaded = false; editing = null; controls(); say(t('Loading settings…'));
    if (!bridgeReady) {
      if (bridgeTimer !== null) clearTimeout(bridgeTimer);
      bridgeTimer = setTimeout(function() { bridgeTimer = null; loadFailed(); catalogueFailed(t('Pebble did not connect to the settings plugin. Reopen this page from Pebble.')); }, 7000);
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
      {key:'|weather|location', category:'weather', item:'location', name:t('Weather'), properties:{temperature:['numericValue'], humidity:['numericValue'], high:['numericValue'], low:['numericValue'], condition:['shortText'], sunrise:['timestamp'], sunset:['timestamp']}},
      {key:'|phone|phone_state', category:'phone', item:'phone_state', name:t('Phone'), properties:{battery_level:['numericValue'], charging:['boolean']}},
      {key:'|watch-local|battery', category:'watch-local', item:'battery', name:t('Watch battery'), properties:{level:['numericValue']}}
    ];
    (catalogue.plugins || []).forEach(function(plugin) {
      (plugin.sources || []).forEach(function(source) {
        if (!source || typeof source.category !== 'string' || source.category === 'activity') return;
        (source.items || []).forEach(function(item) {
          if (typeof item !== 'string' || source.category === 'phone' && item === 'find_my_phone') return;
          var entry = {plugin:plugin.uuid, category:source.category, item:item, properties:source.properties || {}, name:meta(plugin.name, 'Plugin') + ' · ' + friendly(item)};
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
        entries.push({key:plugin.uuid + '|' + action.name, plugin:plugin.uuid, action:action.name, name:meta(plugin.name, 'Plugin') + ' · ' + meta(action.label || action.title, friendly(action.name)), metadata:action});
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
    $('catalogue-status').textContent = t('Loading available plugins…');
    function fetch(target, fallback) {
      if (refresh !== catalogueRefresh) return;
      request({type:'catalogue'}, function(response) {
        if (refresh !== catalogueRefresh) return;
        if (!response || response.ok !== true || !response.catalogue || !Array.isArray(response.catalogue.plugins) || !Array.isArray(response.catalogue.activities)) {
          if (target === 'pkjs' && (!response || response.ok !== false)) { fetch('plugin', true); return; }
          catalogueFailed(response && response.message); return;
        }
        catalogue = response.catalogue; cataloguePhase = response.cached ? 'cached' : 'ready'; catalogueMessage = t(meta(response.message, ''));
        if (fallback) catalogueMessage = t('Live discovery is unavailable. ') + (catalogueMessage || t('Open Dashboard on your watch to refresh installed plugins.'));
        renderActivities(); controls();
        $('catalogue-status').textContent = response.cached ? catalogueMessage || t('Saved plugin metadata. Open Dashboard on your watch to refresh installed plugins.') :
          t('Choose from ') + (catalogue.plugins || []).length + t(' installed plugins. Saved unavailable bindings are kept.');
        // A delayed catalogue reply must not replace fields being edited. The
        // next explicit editor open picks up the refreshed metadata.
        if (editing !== null) $('inspect-status').textContent = t('Available plugins updated. Reopen this item to use the refreshed choices.');
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
    cataloguePhase = 'error'; catalogueMessage = t(meta(message, t('Plugin discovery failed. Check plugin access in Pebble, then retry.'))).slice(0, 180);
    $('catalogue-status').textContent = catalogueMessage + t(' Your saved items are kept.');
    renderActivities(); controls();
  }
  function summary(pin) {
    var parts = [];
    if (pin.reading) parts.push(readingTitle(pin.reading));
    if (pin.builtin) parts.push(t('Tap: Ring phone'));
    else if (pin.action) parts.push(t('Tap: ') + pin.action.label);
    if (pin.openApp) parts.push(t('Hold: ') + pin.openApp.label);
    return parts.join(' · ') || t('No reading or action configured');
  }
  function smallButton(label, action, title, disabled) {
    var button = node('button', label); button.type = 'button'; button.setAttribute('data-edit', '');
    if (title) button.setAttribute('aria-label', title); button.disabled = !!disabled;
    if (disabled) button.setAttribute('data-boundary', 'true');
    button.onclick = action; return button;
  }
  function moved() { renderPins(); renderActivities(); controls(); say(t('Unsaved changes.')); }
  function renderPins() {
    var list = $('pins'); list.textContent = '';
    if (!draft) return;
    draft.pins.forEach(function(pin, index) {
      var row = node('li', undefined, 'item'), title = node('div', undefined, 'item-title');
      title.appendChild(node('strong', pin.label)); title.appendChild(node('span', String(index + 1), 'position')); row.appendChild(title);
      row.appendChild(node('p', summary(pin), 'hint'));
      var buttons = node('div', undefined, 'row-buttons');
      buttons.appendChild(smallButton(t('Edit'), function() { openEditor(index); }, t('Edit ') + pin.label));
      buttons.appendChild(smallButton('↑', function() { if (index > 0) { var item = draft.pins.splice(index, 1)[0]; draft.pins.splice(index - 1, 0, item); moved(); } }, t('Move ') + pin.label + t(' up'), index === 0));
      buttons.appendChild(smallButton('↓', function() { if (index + 1 < draft.pins.length) { var item = draft.pins.splice(index, 1)[0]; draft.pins.splice(index + 1, 0, item); moved(); } }, t('Move ') + pin.label + t(' down'), index + 1 === draft.pins.length));
      buttons.appendChild(smallButton(t('Remove'), function() { draft.pins.splice(index, 1); moved(); }, t('Remove ') + pin.label));
      row.appendChild(buttons); list.appendChild(row);
    });
    $('pins-empty').hidden = !!draft.pins.length;
  }
  function activityList() {
    var known = {'builtin:music':{key:'builtin:music', name:t('Music')}};
    (catalogue.activities || []).forEach(function(item) { if (item && typeof item.key === 'string') known[item.key] = {key:item.key, name:meta(item.name, item.key)}; });
    var keys = (draft ? draft.activityOrder : []).slice();
    if (draft) draft.disabledActivities.forEach(function(key) { if (keys.indexOf(key) < 0) keys.push(key); });
    Object.keys(known).forEach(function(key) { if (keys.indexOf(key) < 0) keys.push(key); });
    return keys.map(function(key) { return known[key] || {key:key, name:t('Unavailable activity (') + key + ')'}; });
  }
  function renderActivities() {
    var status = $('activities-status'), retry = $('retry-activities');
    status.className = cataloguePhase === 'error' ? 'hint error' : 'hint';
    status.textContent = cataloguePhase === 'waiting' ? t('Connecting to Pebble to discover installed activity providers…') :
      cataloguePhase === 'loading' ? t('Loading installed activity providers…') :
      cataloguePhase === 'error' ? catalogueMessage || catalogue.error || t('Could not discover installed activity providers. Music and your saved choices are still shown.') :
      cataloguePhase === 'cached' ? catalogueMessage || t('Saved provider list. Open Dashboard on your watch to refresh installed plugins, then check again.') :
      t('Installed activity providers are listed even when no activity is running.');
    retry.hidden = legacy || cataloguePhase !== 'error' && cataloguePhase !== 'cached'; retry.disabled = pending();
    retry.textContent = cataloguePhase === 'cached' ? t('Check again') : t('Retry activity discovery');
    var target = $('activities'); target.textContent = ''; if (!draft) return;
    var activities = activityList(); $('activities-empty').hidden = !!activities.length;
    activities.forEach(function(activity, index) {
      var row = node('li', undefined, 'item activity-item'), label = node('label', undefined, 'inline'), check = node('input');
      check.type = 'checkbox'; check.checked = draft.disabledActivities.indexOf(activity.key) < 0; check.setAttribute('data-edit', '');
      check.onchange = function() {
        var i = draft.disabledActivities.indexOf(activity.key);
        if (check.checked && i >= 0) draft.disabledActivities.splice(i, 1);
        if (!check.checked && i < 0) draft.disabledActivities.push(activity.key);
        controls(); say(t('Unsaved changes.'));
      };
      label.appendChild(check); label.appendChild(node('span', activity.name)); row.appendChild(label);
      var buttons = node('div', undefined, 'row-buttons');
      function move(delta) { var keys = activities.map(function(item) { return item.key; }), next = index + delta; if (next < 0 || next >= keys.length) return; keys.splice(index, 1); keys.splice(next, 0, activity.key); draft.activityOrder = keys; moved(); }
      buttons.appendChild(smallButton('↑', function() { move(-1); }, t('Raise priority of ') + activity.name, index === 0));
      buttons.appendChild(smallButton('↓', function() { move(1); }, t('Lower priority of ') + activity.name, index + 1 === activities.length));
      row.appendChild(buttons); target.appendChild(row);
    });
  }
  function currentSource() { return sourceEntries.filter(function(entry) { return entry.key === $('source').value; })[0]; }
  function currentAction() { return actionEntries.filter(function(entry) { return entry.key === $('action').value; })[0]; }
  function friendly(value) {
    if (typeof value !== 'string' || !value) return t('Reading');
    var labels = {temperature:t('Temperature'),humidity:t('Humidity'),high:t('High'),low:t('Low'),condition:t('Conditions'),sunrise:t('Sunrise'),sunset:t('Sunset'),
      battery_level:t('Battery'),level:t('Level'),charging:t('Charging'),brightness:t('Brightness'),on:t('On / off'),name:t('Name')};
    return labels[value] || value.replace(/[_-]+/g, ' ').replace(/^./, function(c) { return c.toUpperCase(); });
  }
  function readingTitle(reading) {
    if (reading.category === 'watch-local') return t('Watch battery');
    if (reading.category === 'phone') return t('Phone · ') + friendly(reading.property);
    if (reading.category === 'weather') return t('Weather · ') + friendly(reading.property);
    var plugin = (catalogue.plugins || []).filter(function(item) { return item.uuid === reading.plugin; })[0];
    return (plugin ? meta(plugin.name, 'Plugin') + ' · ' : '') + friendly(reading.property);
  }
  function suggestName(name, icon) {
    if (!editing || editing.index < draft.pins.length) return;
    if (!editing.nameChanged) $('pin-label').value = apps.label(name) || t('New item');
    if (!editing.iconChanged && icon) $('icon').value = icon;
  }
  function cancelAppSearch() {
    appSearchVersion++;
    var current = appRequest; appRequest = null;
    if (current) try { current.abort(); } catch (ignored) {}
    if ($('app-search')) $('app-search').textContent = t('Search');
  }
  function currentApp() { return appEntries.filter(function(entry) { return entry.uuid === $('app-target').value; })[0]; }
  function renderAppChoices(selected) {
    if (!editing) return;
    var chosen = selected === undefined ? $('app-target').value : selected, seen = Object.create(null), entries = [];
    function add(entry) {
      if (!entry || !entry.uuid || seen[entry.uuid.toLowerCase()]) return;
      var copy = clone(entry); copy.uuid = copy.uuid.toLowerCase(); seen[copy.uuid] = true; entries.push(copy);
    }
    apps.common().forEach(add);
    draft.pins.forEach(function(pin) { if (pin.openApp) add({uuid:pin.openApp.watchAppUuid,name:pin.openApp.label,origin:'saved',icon:pin.icon || 'generic'}); });
    if (editing.pin.openApp) add({uuid:editing.pin.openApp.watchAppUuid,name:editing.pin.openApp.label,origin:'saved',icon:editing.pin.icon || 'generic'});
    add(editing.app); appResults.forEach(add);
    if (chosen && chosen !== '__custom__' && !seen[chosen]) add({uuid:chosen,name:$('app-label').value || t('Saved app'),origin:'saved',icon:'generic'});
    appEntries = entries; var target = $('app-target'); target.textContent = ''; option(target, '', t('Do nothing'));
    [['system',t('PebbleOS apps')],['common',t('Other apps')],['saved',t('Your saved apps')],['store',t('Store search results')]].forEach(function(group) {
      var items = entries.filter(function(entry) { return entry.origin === group[0]; }); if (!items.length) return;
      var list = node('optgroup'); list.label = t(group[1]);
      items.forEach(function(entry) { option(list, entry.uuid, (entry.origin === 'system' ? t(entry.name) : entry.name) + (entry.author && entry.origin !== 'system' ? ' · ' + entry.author : '')); }); target.appendChild(list);
    });
    option(target, '__custom__', t('Custom app…')); target.value = chosen || '';
    renderAppState(); renderAppResults();
  }
  function renderAppResults() {
    var list = $('app-results'); list.textContent = '';
    appResults.forEach(function(entry) {
      var button = node('button'); button.type = 'button'; button.setAttribute('data-edit', ''); button.setAttribute('data-app-uuid', entry.uuid);
      button.setAttribute('aria-label', t('Choose ') + entry.name + (entry.author ? t(' by ') + entry.author : ''));
      button.appendChild(node('strong', entry.name)); if (entry.author) button.appendChild(node('span', entry.author, 'hint'));
      button.onclick = function() { $('app-target').value = entry.uuid; selectApp(); $('app-search-panel').open = false; $('app-target').scrollIntoView({block:'center'}); };
      list.appendChild(button);
    });
  }
  function renderAppState() {
    var selected = $('app-target').value, custom = selected === '__custom__';
    $('app-fields').hidden = !selected; $('custom-app-fields').hidden = !custom;
    if (custom) $('app-advanced').open = true;
    $('app-selection').textContent = !selected ? t('Hold Select will do nothing.') : custom ? t('Enter the details for an unlisted app below.') :
      t('Hold Select opens ') + ($('app-label').value || (currentApp() && currentApp().name) || t('the selected app')) + '.';
  }
  function selectApp() {
    if (!editing) return;
    cancelAppSearch();
    var selected = currentApp();
    if (selected) {
      var previous = $('app-uuid').value.trim().toLowerCase(); editing.app = clone(selected); $('app-uuid').value = selected.uuid;
      if (selected.uuid !== previous || !$('app-label').value.trim()) $('app-label').value = apps.label(selected.name);
      suggestName(selected.name, selected.icon || 'generic');
    }
    renderAppState();
  }
  function searchApps() {
    if (!editing || !loaded || pending()) return;
    cancelAppSearch(); var editor = editing, version = appSearchVersion, query = $('app-search-query').value.trim(), url;
    try { url = apps.searchUrl(query); } catch (error) { $('app-status').textContent = t(error.message || t('Enter an app name.')); return; }
    appResults = []; renderAppChoices();
    $('app-status').textContent = t('Searching the Pebble app store…'); $('app-search').textContent = t('Search again');
    function active() { return editing === editor && version === appSearchVersion; }
    function failed() { if (active()) { appRequest = null; $('app-search').textContent = t('Search'); $('app-status').textContent = t('Could not search the app store. Check your connection and Dashboard’s app-store Internet access in Pebble. After changing access, finish and save any edits, then reopen these settings. Your selected app is kept.'); } }
    try {
      var request = new XMLHttpRequest(); appRequest = request; request.open('GET', url, true); request.timeout = 7000; request.withCredentials = false;
      request.onerror = request.ontimeout = failed;
      request.onload = function() {
        if (!active()) return;
        appRequest = null; $('app-search').textContent = t('Search');
        try {
          if (request.status !== 200 || typeof request.responseText !== 'string' || request.responseText.length > 524288) throw Error('Invalid app store response');
          var body = JSON.parse(request.responseText); if (!body || !Array.isArray(body.hits)) throw Error('Invalid app store response');
          appResults = apps.parseResults(body); renderAppChoices();
          $('app-status').textContent = appResults.length ? t('Choose an app below. It must already be installed on your watch.') : t('No compatible apps found. Try another name, or use Custom app for an unlisted app.');
        } catch (error) { failed(); }
      };
      request.send();
    } catch (error) { failed(); }
  }
  function refreshEditorChoices() {
    if (editing === null) return;
    var current = editing.pin, sourceValue = $('source').value || current.reading && sourceKey(current.reading), actionValue = $('action').value || (current.builtin ? 'builtin:find-phone' : current.action && actionKey(current.action)) || 'none';
    sourceEntries = collectSources(); actionEntries = collectActions();
    if (current.reading && !sourceEntries.some(function(entry) { return entry.key === sourceKey(current.reading); })) {
      var missing = clone(current.reading); missing.key = sourceKey(missing); missing.name = t('Saved source · unavailable'); missing.properties = {}; missing.properties[missing.property] = ['shortText']; sourceEntries.push(missing);
    }
    $('source').textContent = ''; sourceEntries.forEach(function(entry) { option($('source'), entry.key, entry.name); }); $('source').value = sourceValue || sourceEntries[0].key;
    $('action').textContent = ''; option($('action'), 'none', t('No tap action')); option($('action'), 'builtin:find-phone', t('Find phone · Ring'));
    actionEntries.forEach(function(entry) { option($('action'), entry.key, entry.name); });
    if (current.action && !actionEntries.some(function(entry) { return entry.key === actionKey(current.action); })) {
      var missingAction = {key:actionKey(current.action), plugin:current.action.plugin, action:current.action.action, name:t('Saved action · unavailable'), metadata:{}}; actionEntries.push(missingAction); option($('action'), missingAction.key, missingAction.name);
    }
    $('action').value = actionValue; refreshProperties(current.reading); renderArguments(current.action && current.action.args || {}); renderEditorState();
  }
  function refreshProperties(reading) {
    var source = currentSource(), selectedProperty = reading && reading.property || $('property').value, props = source && source.properties || {};
    $('property').textContent = '';
    Object.keys(props).filter(function(name) { return (props[name] || []).some(function(shape) { return ['shortText','longText','numericValue','timestamp','boolean'].indexOf(shape) >= 0; }); }).forEach(function(name) { option($('property'), name, friendly(name)); });
    if (selectedProperty && !Array.from($('property').options).some(function(item) { return item.value === selectedProperty; })) option($('property'), selectedProperty, selectedProperty + t(' (saved)'));
    if (selectedProperty) $('property').value = selectedProperty;
    $('toggle').textContent = ''; option($('toggle'), '', t('Use the entered action arguments'));
    Object.keys(props).filter(function(name) { return (props[name] || []).indexOf('boolean') >= 0; }).forEach(function(name) { option($('toggle'), name, t('Toggle using ') + name); });
    if (reading && editing && editing.pin.action && editing.pin.action.toggleProperty) {
      var toggle = editing.pin.action.toggleProperty;
      if (!Array.from($('toggle').options).some(function(item) { return item.value === toggle; })) option($('toggle'), toggle, toggle + t(' (saved on/off property)'));
      $('toggle').value = toggle;
    }
    renderInstances(reading);
    automaticArguments();
  }
  function renderInstances(reading) {
    var source = currentSource(), selected = reading && reading.instanceId !== undefined ? 'id:' + reading.instanceId : $('instance').value || 'index:0';
    $('instance').textContent = ''; option($('instance'), 'index:0', t('First instance (source order)'));
    (catalogue.instances || []).filter(function(item) { return source && item.category === source.category && item.item === source.item && (!source.plugin || item.plugin === source.plugin); }).forEach(function(item) { option($('instance'), 'id:' + item.instanceId, meta(item.name, item.instanceId)); });
    if (reading && reading.instanceId === undefined && reading.index > 0) { selected = 'index:' + reading.index; option($('instance'), selected, t('Source position ') + (reading.index + 1) + t(' (saved)')); }
    if (selected && !Array.from($('instance').options).some(function(item) { return item.value === selected; })) option($('instance'), selected, selected.slice(3) + t(' (saved instance)'));
    $('instance').value = selected;
    $('inspect-source').disabled = !source || source.category === 'watch-local';
    $('inspect-source').setAttribute('data-boundary', $('inspect-source').disabled ? 'true' : 'false');
  }
  function renderEditorState() {
    $('reading-fields').hidden = !$('has-reading').checked;
    var hasAction = $('action').value !== 'none'; $('action-fields').hidden = !hasAction || $('action').value === 'builtin:find-phone';
    renderAppState();
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
      if (Array.isArray(property.enum)) { field = node('select'); if (required.indexOf(name) < 0) option(field, '', t('Not set')); property.enum.forEach(function(value) { option(field, JSON.stringify(value), String(value)); }); if (args[name] !== undefined) field.value = JSON.stringify(args[name]); }
      else if (property.type === 'boolean') { field = node('select'); if (required.indexOf(name) < 0) option(field, '', t('Not set')); option(field, 'true', t('On / true')); option(field, 'false', t('Off / false')); if (args[name] !== undefined) field.value = String(args[name]); }
      else if (property.type === 'number' || property.type === 'integer') { field = node('input'); field.type = 'number'; field.step = property.type === 'integer' ? '1' : 'any'; if (property.minimum !== undefined) field.min = property.minimum; if (property.maximum !== undefined) field.max = property.maximum; if (args[name] !== undefined) field.value = args[name]; }
      else if (property.type === 'string' || !property.type) { field = node('input'); field.type = 'text'; if (property.maxLength) field.maxLength = property.maxLength; field.value = args[name] === undefined ? '' : String(args[name]); }
      else { field = node('textarea'); field.rows = 3; field.value = args[name] === undefined ? '' : JSON.stringify(args[name]); }
      field.setAttribute('data-edit', ''); field.setAttribute('aria-label', meta(property.title, name));
      label.appendChild(field); $('arguments').appendChild(label); argumentFields.push({name:name, field:field, schema:property, required:required.indexOf(name) >= 0});
    });
    $('args-json').value = JSON.stringify(args, null, 2); $('args-json-wrap').open = !argumentFields.length && Object.keys(args).length > 0;
    $('arguments-note').textContent = argumentFields.length ? t('Values below are taken from the plugin’s declared action fields.') : t('This action declares no editable fields. Extra arguments can be entered under Advanced arguments.');
    automaticArguments();
  }
  function openEditor(index) {
    if (!loaded || pending()) return;
    cancelAppSearch(); appResults = [];
    var pin = draft.pins[index] || {id:'pin-' + Date.now().toString(36), label:t('New item'), icon:'generic'};
    editing = {index:index, pin:clone(pin), nameChanged:false, iconChanged:false, app:null}; inspectVersion++;
    $('pin-label').value = pin.label; $('icon').value = pin.icon || 'generic'; $('has-reading').checked = !!pin.reading;
    $('source').textContent = ''; $('action').textContent = ''; $('property').textContent = ''; $('instance').textContent = '';
    $('action-label').value = pin.action && pin.action.label || t('Run'); $('confirm-action').checked = !!(pin.action && pin.action.confirm);
    $('app-uuid').value = pin.openApp && pin.openApp.watchAppUuid || ''; $('app-label').value = pin.openApp && pin.openApp.label || '';
    $('app-search-query').value = ''; $('app-status').textContent = ''; $('app-search-panel').open = false; $('app-advanced').open = false;
    renderAppChoices(pin.openApp ? pin.openApp.watchAppUuid : '');
    $('editor-error').textContent = ''; $('inspect-status').textContent = '';
    refreshEditorChoices(); controls(); say(t('Edit this pin, then Save to apply your changes.')); $('editor').scrollIntoView({block:'start', behavior:'auto'});
  }
  function gatherArguments() {
    var args;
    try { args = JSON.parse($('args-json').value || '{}'); } catch (error) { throw Error(t('Advanced arguments must contain a JSON object.')); }
    if (!args || typeof args !== 'object' || Array.isArray(args)) throw Error(t('Action arguments must be an object.'));
    var automatic = automaticArguments();
    argumentFields.forEach(function(entry) {
      if (entry.automatic) { delete args[entry.name]; return; }
      var value = entry.field.value, schema = entry.schema;
      if (value === '') { if (entry.required) throw Error(t('Enter ') + entry.name + '.'); delete args[entry.name]; return; }
      if (Array.isArray(schema.enum) || schema.type === 'boolean' || schema.type === 'object' || schema.type === 'array') { try { value = JSON.parse(value); } catch (error) { throw Error(t('Enter a valid value for ') + entry.name + '.'); } }
      else if (schema.type === 'number' || schema.type === 'integer') { value = Number(value); if (!isFinite(value) || schema.type === 'integer' && value % 1) throw Error(t('Enter a valid number for ') + entry.name + '.'); if (schema.minimum !== undefined && value < schema.minimum || schema.maximum !== undefined && value > schema.maximum) throw Error(entry.name + t(' is outside its allowed range.')); }
      if (typeof value === 'string' && (schema.minLength && value.length < schema.minLength || schema.maxLength && value.length > schema.maxLength)) throw Error(t('Check the length of ') + entry.name + '.');
      args[entry.name] = value;
    });
    if (automatic) ['item','instanceId','on'].forEach(function(name) { delete args[name]; });
    return args;
  }
  function editedSettings() {
    var pin = {id:editing.pin.id, label:$('pin-label').value.trim(), icon:$('icon').value};
    if ($('has-reading').checked) {
      var source = currentSource(); if (!source || !$('property').value) throw Error(t('Choose a source and reading.'));
      pin.reading = {category:source.category, item:source.item, property:$('property').value}; if (source.plugin) pin.reading.plugin = source.plugin;
      var instance = $('instance').value; if (instance.indexOf('id:') === 0) pin.reading.instanceId = instance.slice(3); else pin.reading.index = Number(instance.slice(6));
    }
    if ($('action').value === 'builtin:find-phone') pin.builtin = 'find-phone';
    else if ($('action').value !== 'none') {
      var action = currentAction(); if (!action) throw Error(t('Choose an available action or keep its saved binding.'));
      pin.action = {plugin:action.plugin, action:action.action, args:gatherArguments(), label:$('action-label').value.trim(), confirm:$('confirm-action').checked};
      if ($('toggle').value) { if (!pin.reading) throw Error(t('Choose a reading before binding its on/off state.')); pin.action.toggleProperty = $('toggle').value; }
    }
    if ($('app-target').value) pin.openApp = {watchAppUuid:$('app-target').value === '__custom__' ? $('app-uuid').value.trim() : $('app-target').value, label:$('app-label').value.trim()};
    var next = clone(draft); if (editing.index < next.pins.length) next.pins[editing.index] = pin; else next.pins.push(pin);
    return model.normalize(next);
  }
  function acceptEditor(event) {
    if (event) event.preventDefault(); if (!editing || pending()) return;
    try {
      draft = editedSettings(); cancelAppSearch(); editing = null; inspectVersion++; renderPins(); controls();draftStatus();
    } catch (error) { $('editor-error').textContent = t(error.message || t('Check this pinned item.')); }
  }
  $('editor-form').onsubmit = acceptEditor;
  function editorDraftChanged(event) {
    if(!editing||pending()||event&&event.target.id==='app-search-query')return;
    controls();draftStatus();
  }
  $('editor-form').addEventListener('input',editorDraftChanged);
  $('editor-form').addEventListener('change',editorDraftChanged);

  $('editor-cancel').onclick = function() { cancelAppSearch(); editing = null; inspectVersion++; controls();draftStatus(); };
  $('add-pin').onclick = function() { openEditor(draft.pins.length); };
  ['dark','notifications','preview'].forEach(function(id) { $(id).onchange = changed; });
  $('has-reading').onchange = renderEditorState;
  $('pin-label').oninput = function() { if (editing) editing.nameChanged = true; };
  $('icon').onchange = function() { if (editing) editing.iconChanged = true; };
  $('app-target').onchange = selectApp; $('app-search').onclick = searchApps; $('app-label').oninput = renderAppState;
  $('app-search-query').onkeydown = function(event) { if (event.key === 'Enter') { event.preventDefault(); searchApps(); } };
  $('pin-reading').onclick = function() { $('has-reading').checked = true; renderEditorState(); $('source').onchange(); $('reading-fields').scrollIntoView({block:'center'}); };
  $('pin-action').onclick = function() { $('action').scrollIntoView({block:'center'}); };
  $('pin-app').onclick = function() { $('app-target').scrollIntoView({block:'center'}); };
  $('instance').onchange = automaticArguments; $('toggle').onchange = automaticArguments;
  $('source').onchange = function() { inspectVersion++; $('instance').value = 'index:0'; refreshProperties(); $('inspect-status').textContent = ''; var source = currentSource(); if (source) suggestName(readingTitle({category:source.category,property:$('property').value,plugin:source.plugin}), source.category === 'weather' ? 'weather' : source.category === 'phone' ? 'phone' : source.category === 'watch-local' ? 'battery' : 'generic'); };
  $('property').onchange = function() { var source = currentSource(); if (source) suggestName(readingTitle({category:source.category,property:$('property').value,plugin:source.plugin})); };
  $('action').onchange = function() { var entry = currentAction(); if (entry) { $('action-label').value = apps.label(meta(entry.metadata.label || entry.metadata.title, friendly(entry.action))); suggestName(meta(entry.metadata.label || entry.metadata.title, friendly(entry.action))); } else if ($('action').value === 'builtin:find-phone') suggestName(t('Find phone'), 'find'); $('toggle').value = ''; renderArguments({}); renderEditorState(); };
  $('inspect-source').onclick = function() {
    if (legacy || !bridgeReady) { $('inspect-status').textContent = t('Reopen Dashboard settings from the Pebble app to refresh instances.'); return; }
    var source = currentSource(), version = ++inspectVersion; if (!source || source.category === 'watch-local') return;
    $('inspect-status').textContent = t('Loading instances…');
    var requestSource = {category:source.category, item:source.item}; if (source.plugin) requestSource.plugin = source.plugin;
    request({type:'inspect_source', source:requestSource}, function(response) {
      if (!editing || inspectVersion !== version || currentSource().key !== source.key) return;
      if (!response || !response.ok || !Array.isArray(response.instances)) { $('inspect-status').textContent = response && t(response.message) || t('Instances could not be loaded. Saved choices are kept.'); return; }
      catalogue.instances = (catalogue.instances || []).filter(function(item) { return !(item.category === source.category && item.item === source.item && (!source.plugin || item.plugin === source.plugin)); }).concat(response.instances);
      renderInstances(); $('inspect-status').textContent = response.instances.length ? t('Instances loaded. Choose the item you want.') : t('No current instances. The saved binding is kept.');
    }, function() { if (editing && inspectVersion === version) $('inspect-status').textContent = t('Instances could not be loaded. Saved choices are kept.'); }, 'inspect');
  };
  $('refresh-catalogue').onclick = refreshCatalogue; $('retry-activities').onclick = refreshCatalogue; $('retry').onclick = load;
  $('discard').onclick = function() {
    if (legacy) { location.href = 'pebblejs://close#'; return; }
    if (uncertain) { load(); return; }
    apply(JSON.parse(confirmed), repairing);
  };
  function saveFailed() { phase = 'ready'; uncertain = true; controls(); say(t('Save not confirmed. Reload saved settings or save again.'), true); }
  function settingsTarget(complete, failure) {
    if (typeof Pebble.targets !== 'function') { complete(pkjsReady ? 'pkjs' : 'plugin'); return; }
    var settled = false, timer = setTimeout(function() { finish(failure); }, 7000);
    function finish(fn, value) { if (settled) return; settled = true; clearTimeout(timer); fn(value); }
    try {
      Promise.resolve(Pebble.targets()).then(function(targets) {
        if (!Array.isArray(targets)) { finish(failure); return; }
        finish(complete, targets.some(function(target) { return target && target.id === 'pkjs'; }) ? 'pkjs' : 'plugin');
      }, function() { finish(failure); });
    } catch (error) { finish(failure); }
  }
  $('save').onclick = function(event) {
    if (event) event.preventDefault(); if ($('save').disabled) return;
    var chosen; try { chosen = editing !== null ? editedSettings() : model.normalize(draft); }
    catch (error) { if (editing !== null) $('editor-error').textContent = t(error.message || t('Check this pinned item.')); say(t('Couldn’t save. Try again.'),true); return; }
    if (legacy) { location.href = 'pebblejs://close#' + encodeURIComponent(JSON.stringify(chosen)); return; }
    cancelAppSearch(); inspectVersion++;
    phase = 'saving'; controls(); say(t('Saving…'));
    var attempts = 0;
    function saved(value) {
      var x=window.scrollX,y=window.scrollY,editorIndex=editing&&editing.index;
      var editorHadFocus=editing&&$('editor').contains(document.activeElement);
      apply(value,false);savedHere=true;say(t('✓ Saved'));
      if(editorHadFocus){var row=$('pins').children[editorIndex],button=row&&row.querySelector('button');if(button)button.focus({preventScroll:true});}
      if(window.scrollX!==x||window.scrollY!==y)window.scrollTo(x,y);
    }
    function write(target) {
      if (++attempts > 3) { saveFailed(); return; }
      request({type:'save_settings', settings:chosen}, function(response) {
        var value;
        try {
          if (!response || !response.ok) throw Error();
          value = model.normalize(response.settings);
          if (JSON.stringify(value) !== JSON.stringify(chosen)) throw Error();
        } catch (error) { saveFailed(); return; }
        // Android PKJS keeps a separate storage snapshot. It must own live
        // writes, including when it starts during a closed-plugin save.
        if (target === 'plugin') settingsTarget(function(current) { if (current === 'pkjs') write(current); else saved(value); }, saveFailed);
        else saved(value);
      }, function() {
        if (target !== 'pkjs') { saveFailed(); return; }
        // Only confirmed shutdown permits the plugin fallback: a still-live
        // PKJS could later overwrite it with its stale storage snapshot.
        settingsTarget(function(current) { if (current === 'plugin') write(current); else saveFailed(); }, saveFailed);
      }, 'settings', target);
    }
    settingsTarget(write, saveFailed);
  };
  function measureFooter() {
    var footer = $('actions'), height = footer.getBoundingClientRect().height, viewport = window.visualViewport && window.visualViewport.height || window.innerHeight;
    var flow = viewport < 560 || height > viewport * 0.3;
    footer.setAttribute('data-flow', flow ? 'true' : 'false'); document.documentElement.style.setProperty('--footer-space', (flow ? 0 : height) + 'px');
  }
  window.addEventListener('resize', measureFooter); if (window.visualViewport) window.visualViewport.addEventListener('resize', measureFooter);
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(measureFooter).observe($('actions'));
  model.icons.forEach(function(icon) { option($('icon'), icon, language.language==='en'?icon.charAt(0).toUpperCase()+icon.slice(1):t(icon)); });
  if (legacy) { sourceEntries = collectSources(); actionEntries = collectActions(); try { apply(initial.settings, initial.needsRepair); } catch (error) { loadFailed(); } $('catalogue-status').textContent = catalogue.error || t('Installed sources and saved bindings are shown below.'); }
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
  initial.translations=makeLanguage.catalogue;
  return [
    '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Dashboard settings</title><style id="xoce-settings-style">',
    settingsStyle,
    '</style><style>',
    ':root{--accent:#076b65;--accent-ink:#fff;--footer-space:130px}',
    '@media(prefers-color-scheme:dark){:root{--accent:#83d7ca;--accent-ink:#102522}}',
    '.inline{display:flex;align-items:center;gap:12px;min-height:44px}.inline input{margin:0}.inline span{min-width:0;overflow-wrap:anywhere}.item-title{display:flex;align-items:start;justify-content:space-between;gap:16px}.item-title strong{overflow-wrap:anywhere}.position{color:var(--muted);font-size:14px}.items{list-style:none;margin:0;padding:0}.item{padding:16px 0;border-top:1px solid var(--line)}.item:first-child{border-top:0;padding-top:0}.row-buttons{display:flex;gap:8px;flex-wrap:wrap}.row-buttons button{flex:1;min-width:4.5em;padding-left:6px;padding-right:6px}.row-buttons button:nth-child(2),.row-buttons button:nth-child(3){flex:0 0 2.75em;min-width:2.75em}.activity-item .row-buttons button{flex:0 0 2.75em;min-width:2.75em}.item .hint{margin-bottom:12px}#editor{scroll-margin-top:16px}#editor .card{margin:12px 0}fieldset{border:0;padding:0;margin:0}legend{font-size:16px;font-weight:650;padding:0}',
    '#editor-save{min-height:48px;background:var(--accent);color:var(--accent-ink);border-color:var(--accent)}.editor-actions{display:flex;gap:8px;margin-top:20px}.editor-actions button{flex:1}@media(max-width:340px){.row-buttons{gap:6px}.row-buttons button{padding-left:8px;padding-right:8px}}',
    '.pin-section{border-top:1px solid var(--line);margin-top:24px;padding-top:20px}.pin-section legend{padding-top:18px;font-size:18px}.pin-section>label:first-of-type{margin-top:8px}.quick-setup{display:flex;gap:8px;flex-wrap:wrap}.quick-setup button{flex:1;min-width:110px}.search-row{display:flex;gap:8px;align-items:end}.search-row label{flex:1;min-width:0}.search-row button{flex:0 0 auto;margin-bottom:8px}.pin-section details{margin-top:12px}#app-selection{margin-bottom:8px}#app-results button{display:block;width:100%;margin:8px 0;text-align:left;overflow-wrap:anywhere}#app-results strong,#app-results span{display:block}@media(max-width:340px){.search-row{display:block}.search-row button{width:100%}}',
    '</style></head><body><main><header><h1>Dashboard</h1><p>Choose Dashboard’s pinned items and activity priority.</p></header>',
    '<section class="card"><h2>On the watch</h2><label>Watch appearance<select id="dark" data-edit><option value="light">Light</option><option value="dark">Dark</option></select></label><label class="inline"><input id="notifications" type="checkbox" data-edit><span>Show latest notification</span></label><label class="inline"><input id="preview" type="checkbox" data-edit><span>Show notification message text</span></label><p class="hint">Message text stays private and is cleared when its source withdraws it. The notification row always opens native Notifications, even without a preview.</p></section>',
    '<section class="card"><h2>Pinned items</h2><p class="hint">The first two appear on Snapshot. Hold Down there to browse all pins. A pin can show a reading, perform a tap action, or do both.</p><ol id="pins" class="items"></ol><p id="pins-empty" class="hint" hidden>No pinned items yet.</p><button id="add-pin" type="button" data-edit>Add pinned item</button></section>',
    '<section id="editor" class="card" hidden><h2 id="editor-heading">Pinned item</h2><form id="editor-form"><div id="pin-quick-setup"><p class="hint">Start with what you need. You can combine a reading, a tap action and an app in the same pin.</p><div class="quick-setup"><button id="pin-reading" type="button" data-edit>Show a reading</button><button id="pin-action" type="button" data-edit>Add an action</button><button id="pin-app" type="button" data-edit>Open an app</button></div></div><label>Name on the watch<input id="pin-label" type="text" maxlength="32" autocomplete="off" data-edit></label><details><summary>Change icon</summary><label>Icon<select id="icon" data-edit></select></label></details>',
    '<fieldset class="pin-section"><legend>Show a reading</legend><label class="inline"><input id="has-reading" type="checkbox" data-edit><span>Show a value on this pin</span></label><div id="reading-fields"><label>From<select id="source" data-edit></select></label><label>Value<select id="property" data-edit></select></label><label>Which item<select id="instance" data-edit></select></label><button id="inspect-source" type="button" data-edit>Refresh items</button><p id="inspect-status" class="hint" role="status"></p></div></fieldset>',
    '<fieldset class="pin-section"><legend>Tap Select</legend><label>Action<select id="action" data-edit></select></label><div id="action-fields"><p id="arguments-note" class="hint"></p><p id="automatic-args" class="hint" hidden>The selected item and its next on/off state are filled automatically from this reading when you press Select.</p><div id="arguments"></div><label>Use this reading’s on/off state<select id="toggle" data-edit></select></label><p class="hint">Optional: toggle using a real on/off value. Brightness is a separate reading.</p><details><summary>Action options</summary><label>Name on the watch<input id="action-label" type="text" maxlength="32" data-edit></label><label class="inline"><input id="confirm-action" type="checkbox" data-edit><span>Ask before running</span></label><details id="args-json-wrap"><summary>Advanced arguments</summary><p class="hint">Optional extra arguments as a JSON object. The fields above take precedence.</p><label>Arguments<textarea id="args-json" rows="4" spellcheck="false" data-edit>{}</textarea></label></details></details></div></fieldset>',
    '<fieldset class="pin-section"><legend>Hold Select</legend><label>Open app<select id="app-target" data-edit><option value="">Do nothing</option></select></label><p id="app-selection" class="hint">Hold Select will do nothing.</p><p class="hint">PebbleOS apps need no store search. Some depend on your watch or PebbleOS version.</p><details id="app-search-panel"><summary>Find another app by name</summary><p class="hint">Search the Pebble app store for an app already installed on your watch. Store results do not show what you have installed. Search needs Dashboard’s app-store Internet access in Pebble.</p><div class="search-row"><label>App name<input id="app-search-query" type="search" maxlength="80" autocomplete="off" data-edit></label><button id="app-search" type="button" data-edit>Search</button></div><p id="app-status" class="hint" role="status" aria-live="polite"></p><div id="app-results"></div></details><div id="app-fields" hidden><details id="app-advanced"><summary>App details</summary><label>Name on the watch<input id="app-label" type="text" maxlength="32" data-edit></label><div id="custom-app-fields" hidden><label>Watchapp UUID<input id="app-uuid" type="text" autocomplete="off" spellcheck="false" placeholder="00000000-0000-0000-0000-000000000000" data-edit></label><p class="hint">Only needed for an unlisted custom app. Existing destinations stay saved when offline or unavailable.</p></div></details></div></fieldset>',
    '<p id="editor-error" class="error" role="alert"></p><div class="editor-actions"><button id="editor-cancel" type="button">Cancel</button><button id="editor-save" type="submit" data-edit>Add pin</button></div></form></section>',
    '<section class="card"><h2>Activity priority</h2><p class="hint">The highest-priority available activity appears on Snapshot. Hold Up there to browse all activities. Hide a provider to keep its activities out of Dashboard. Dynamic keeps its own order.</p><p id="activities-status" class="hint" role="status" aria-live="polite">Connecting to Pebble…</p><button id="retry-activities" type="button" hidden>Retry activity discovery</button><ol id="activities" class="items"></ol><p id="activities-empty" class="hint">Compatible activity providers appear here after discovery.</p></section>',
    '<details class="card"><summary>Available plugins &amp; help</summary><p id="catalogue-status" class="hint">Waiting for plugin discovery…</p><button id="refresh-catalogue" type="button">Retry discovery</button><p class="hint">Allow the selected source/action permissions in Pebble. Missing providers keep their saved bindings and appear unavailable; they never switch to a different plugin.</p><p class="hint">The watch shows a button guide once on first use. Tap Select on Music to play or pause; hold Select to open the Music app. Other items use their available action on tap or associated app on hold. On Snapshot, hold Up for Activities or Down for Pinned. Within a list, hold Up/Down to scroll. Timer controls are planned separately.</p></details>',
    '</main><footer id="actions"><div class="footer-inner"><p id="status" class="status" role="status" aria-live="polite" aria-atomic="true">Loading settings…</p><div class="actions"><button id="retry" type="button" hidden>Retry loading</button><button id="discard" type="button" disabled>Discard</button><button id="save" type="button" disabled>Save</button></div></div></footer><script>(', behavior.toString(), ')(',
    JSON.stringify(initial).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029'), ',(', model.browserFactory.toString(), '),(', appPicker.browserFactory.toString(), '),(', makeLanguage.toString(), '));</script></body></html>'
  ].join('\n');
}
module.exports = function(settings, catalogue) {
  var current, needsRepair = false;
  try { current = model.normalize(settings); } catch (error) { current = model.defaults(); needsRepair = true; }
  return render({mode:'legacy', settings:current, catalogue:catalogue || {plugins:[], instances:[], activities:[]}, needsRepair:needsRepair});
};
module.exports.config = function() { return render({mode:'plugin'}); };
