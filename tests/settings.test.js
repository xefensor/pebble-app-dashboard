'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const model = require('../src/pkjs/settings');
const page = require('../src/pkjs/settings-page');
const config = require('../src/plugin');
const PLUGIN = '00aabbcc-2233-4455-6677-889900aabbcc';
function storage() { const values = new Map(); return {getItem:key => values.has(key) ? values.get(key) : null, setItem:(key, value) => values.set(key, value)}; }
function pin() { return {id:'kitchen', label:'Kitchen light', icon:'light', reading:{plugin:PLUGIN, category:'home', item:'light', property:'brightness', instanceId:'3'}, action:{plugin:PLUGIN, action:'set_on', label:'Toggle', args:{item:'light', instanceId:'3'}, toggleProperty:'on', confirm:false}}; }
function value() { const settings = model.defaults(); settings.pins.push(pin()); return settings; }
function handler(pebble, store) { let receive; config.register(Object.assign({registerConfigHandler:fn => { receive = fn; }}, pebble), store || storage()); return message => new Promise(resolve => receive(message, resolve)); }

test('defaults have separate values, a local watch reading and an explicit unresolved Find phone capability', () => {
  const settings = model.defaults();
  assert.equal(settings.pins.length, 4); assert.equal(settings.notificationPreview, false);
  assert.deepEqual(settings.pins[2].reading, {category:'watch-local', item:'battery', property:'level'});
  assert.equal(settings.pins[3].builtin, 'find-phone'); assert.equal(settings.pins[3].action, undefined);
  settings.pins[0].label = 'Changed'; assert.equal(model.defaults().pins[0].label, 'Weather');
});
test('mixed pin model preserves exact source, action, Boolean state binding and optional app', () => {
  const settings = value(); settings.pins[4].openApp = {watchAppUuid:PLUGIN.toUpperCase(), label:'Lights'};
  const normalized = model.normalize(settings), item = normalized.pins[4];
  assert.equal(item.reading.instanceId, '3'); assert.equal(item.reading.property, 'brightness'); assert.equal(item.action.toggleProperty, 'on');
  assert.equal(item.action.args.instanceId, '3'); assert.equal(item.openApp.watchAppUuid, PLUGIN);
  item.action.args.item = 'changed'; assert.equal(settings.pins[4].action.args.item, 'light');
});
test('action-only, value-only and unavailable pins remain distinct', () => {
  const settings = model.defaults(); settings.pins = [{id:'a', label:'Only value', reading:{category:'phone', item:'phone_state', property:'battery_level'}}, {id:'b', label:'Only action', action:{plugin:PLUGIN, action:'ring', label:'Ring'}}, {id:'c', label:'Unavailable'}];
  assert.equal(model.normalize(settings).pins.length, 3);
  settings.pins[0].action = {plugin:'bad', action:'ring', label:'Ring'}; assert.throws(() => model.normalize(settings), /UUID/);
});
test('clearing a built-in action never re-creates it by pin ID', () => {
  const settings = model.defaults(); delete settings.pins[3].builtin;
  assert.deepEqual(model.normalize(settings).pins[3], {id:'find-phone', label:'Find phone', icon:'find'});
  settings.pins[3].builtin = 'find-phone'; settings.pins[3].action = {plugin:PLUGIN, action:'ring', label:'Ring'};
  assert.throws(() => model.normalize(settings), /either/);
});
test('invalid and oversized settings fail closed', () => {
  const cases = [
    settings => { settings.privateBody = 'must not persist'; },
    settings => { settings.pins[0].reading.observedValue = 21; },
    settings => { settings.pins[0].reading.index = -1; },
    settings => { settings.pins[0].reading.plugin = 'not-a-uuid'; },
    settings => { settings.pins[0].openApp = {watchAppUuid:'00000000-0000-0000-0000-000000000000', label:'Invalid'}; },
    settings => { settings.pins.push(settings.pins[0]); },
    settings => { settings.pins = Array.from({length:65}, (_,i) => ({id:String(i), label:'Pin'})); },
    settings => { settings.activityOrder = ['duplicate','duplicate']; },
    settings => { settings.pins[0].label = 'é'.repeat(17); },
    settings => { settings.dark = 'true'; }
  ];
  for (const mutate of cases) { const settings = model.defaults(); mutate(settings); assert.throws(() => model.normalize(settings)); }
});
test('argument validation rejects prototype keys, non-JSON data and excessive depth', () => {
  const cases = [JSON.parse('{"__proto__":{"polluted":true}}'), {value:Infinity}, {value:undefined}, {value:'x'.repeat(2050)}, {a:{b:{c:{d:{e:{f:{g:{h:1}}}}}}}}];
  for (const args of cases) { const settings = value(); settings.pins[4].action.args = args; assert.throws(() => model.normalize(settings)); }
  assert.equal({}.polluted, undefined);
});
test('load distinguishes missing settings from unreadable storage without writing', () => {
  const store = storage(); assert.deepEqual(model.load(store), model.defaults()); assert.equal(store.getItem(model.key), null);
  store.setItem(model.key, 'broken'); assert.equal(model.load(store), null); assert.equal(store.getItem(model.key), 'broken');
  assert.equal(model.load({getItem() { throw Error('denied'); }}), null);
});
test('save validates before write and confirms the exact normalized record', () => {
  const store = storage(), settings = value(); assert.deepEqual(model.save(store, settings), model.normalize(settings));
  assert.deepEqual(model.load(store), model.normalize(settings));
  assert.throws(() => model.save({setItem() {}, getItem() { return null; }}, settings), /confirmed/);
  const before = store.getItem(model.key); settings.pins[4].action.plugin = 'wrong'; assert.throws(() => model.save(store, settings)); assert.equal(store.getItem(model.key), before);
});
test('browser and phone use the same validation factory', () => {
  const browser = vm.runInNewContext('(' + model.browserFactory.toString() + ')()');
  assert.equal(JSON.stringify(browser.normalize(value())), JSON.stringify(model.normalize(value())));
  const malformed = value(); malformed.pins[4].action.args = JSON.parse('{"constructor":1}');
  assert.throws(() => browser.normalize(malformed));
});
test('settings HTML escapes source data and includes independent pinned/activity editors', () => {
  const settings = model.defaults(); settings.pins[0].label = '</script><script>bad()';
  const html = page(settings, {plugins:[], instances:[], activities:[]});
  assert.ok(!html.includes('</script><script>bad()')); assert.ok(html.includes('\\u003c/script>'));
  for (const id of ['pins','activities','arguments','source','property','instance','action','toggle','has-app','save']) assert.ok(html.includes('id="' + id + '"'));
  assert.ok(page.config().includes('registerConfigHandler') === false);
  assert.ok(page({version:99,pins:[]}).includes('"needsRepair":true'));
});
test('config handler works while native app is closed and never silently repairs storage', async () => {
  const store = storage(); store.setItem(model.key, '{broken'); const receive = handler({}, store);
  const loaded = await receive({type:'load_settings'}); assert.equal(loaded.ok, true); assert.equal(loaded.needsRepair, true); assert.equal(store.getItem(model.key), '{broken');
  const saved = await receive({type:'save_settings', settings:value()}); assert.equal(saved.ok, true); assert.deepEqual(saved.settings, model.normalize(value()));
  const bad = await receive({type:'save_settings', settings:{version:99,pins:[]}}); assert.equal(bad.ok, false); assert.deepEqual(model.load(store), saved.settings);
});
test('closed plugin settings use public metadata cache without an unsupported enumeration API', async () => {
  const metadata = require('../src/pkjs/catalogue'), store = storage();
  let enumerations = 0, reads = 0, actions = 0;
  const receive = handler({enumeratePlugins:() => { enumerations++; throw Error('Plugin runtime does not expose this API'); }, readSource:() => { reads++; }, invokeAction:() => { actions++; }}, store);
  const missing = await receive({type:'catalogue'});
  assert.equal(missing.ok, true); assert.equal(missing.cached, true); assert.match(missing.message, /Open Dashboard/);
  assert.deepEqual(missing.catalogue.activities,[{key:'builtin:music',name:'Music'}]);
  assert.equal(metadata.save(store, metadata.fromPlugins([{uuid:PLUGIN, name:'Timer provider', sources:[{category:'activity',items:['summary'],properties:require('pebble-activities/summary').SOURCE_PROPERTIES}],actions:[{name:'stop',parameters:{type:'object',properties:{run:{type:'string'}},required:['run']}}]}])),true);
  const cached = await receive({type:'catalogue'});
  assert.equal(cached.ok, true); assert.equal(cached.cached, true); assert.match(cached.message, /refresh/);
  assert.equal(cached.catalogue.plugins[0].actions[0].name, 'stop');
  assert.deepEqual(cached.catalogue.instances, []);
  assert.deepEqual(cached.catalogue.activities,[{key:PLUGIN,name:'Timer provider'},{key:'builtin:music',name:'Music'}]);
  assert.deepEqual([enumerations,reads,actions],[0,0,0]);
});
test('Find phone can never be probed while inspecting settings', async () => {
  let reads = 0; const receive = handler({readSource:() => { reads++; throw Error('must not ring'); }});
  const result = await receive({type:'inspect_source',source:{category:'phone', item:'find_my_phone'}});
  assert.equal(result.ok, false); assert.equal(reads, 0);
});
test('source inspection returns selector metadata only and verifies exact provider', async () => {
  let request; const receive = handler({readSource:input => { request = input; return {pluginUuid:PLUGIN, instances:[{instanceId:'3', properties:{name:{shortText:{text:'Kitchen'}}, brightness:{numericValue:{value:65}}, private_message:{longText:{text:'private content'}}}}]}; }});
  const result = await receive({type:'inspect_source',source:{plugin:PLUGIN,category:'home',item:'light'}});
  assert.equal(result.ok, true); assert.equal(result.instances[0].name, 'Kitchen'); assert.ok(!JSON.stringify(result).includes('private content')); assert.ok(!JSON.stringify(result).includes('65'));
  assert.deepEqual(request.properties, ['name']);
  const wrong = handler({readSource:() => ({pluginUuid:'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', instances:[]})});
  assert.equal((await wrong({type:'inspect_source', source:{plugin:PLUGIN, category:'home', item:'light'}})).ok, false);
});
test('missing and corrupt public catalogue caches explain the supported discovery path', async () => {
  const metadata = require('../src/pkjs/catalogue'), store = storage();
  for (const value of ['broken', JSON.stringify({version:99,plugins:[]})]) {
    store.setItem(metadata.key, value);
    const response = await handler({},store)({type:'catalogue'});
    assert.equal(response.ok, true); assert.equal(response.cached, true); assert.match(response.message, /Open Dashboard/);
    assert.deepEqual(response.catalogue.plugins, []); assert.deepEqual(response.catalogue.activities,[{key:'builtin:music',name:'Music'}]);
    assert.equal(store.getItem(metadata.key), value, 'reading a bad metadata cache cannot overwrite it');
  }
});
