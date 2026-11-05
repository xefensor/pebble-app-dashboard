'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const picker = require('../src/pkjs/app-picker');
const settings = require('../src/pkjs/settings');
const sources = require('../src/pkjs/sources').constants;
const UUID = '6c4b0be2-bf2d-434e-b56f-6ffba2a6e18d';
function hit(overrides) {
  return Object.assign({id:'8b210e928160473495d2fc80', uuid:UUID, title:'Timer', author:'Ty Nichols',
    type:'watchapp', compatibility:{emery:{supported:true, has_binary:true}}}, overrides);
}

test('common app targets use exact watchapp identities independently of plugin identities', () => {
  const apps = picker.common();
  assert.deepEqual(apps, [
    {uuid:sources.MUSIC_APP, name:'Music', author:'Pebble', icon:'media', origin:'common'},
    {uuid:sources.NOTIFICATIONS_APP, name:'Notifications', author:'Pebble', icon:'notification', origin:'common'},
    {uuid:'50e9ef12-a5ab-4369-a3b5-3447bfba5151', name:'Timer', author:'Xef', icon:'timer', origin:'common'}
  ]);
  assert.notEqual(apps[0].uuid, sources.MUSIC);
  assert.notEqual(apps[1].uuid, sources.NOTIFICATIONS);
  assert.ok(apps.every(app => !Object.hasOwn(app, 'installed')));
  apps[0].name = 'Changed'; apps.pop();
  assert.equal(picker.common()[0].name, 'Music'); assert.equal(picker.common().length, 3);
});

test('automatic labels fit the existing 32-byte settings contract without splitting Unicode', () => {
  for (const [input, expected] of [
    ['  Living\nroom\u0000 light  ', 'Living room light'],
    ['é'.repeat(17), 'é'.repeat(16)],
    ['界'.repeat(11), '界'.repeat(10)],
    ['😀'.repeat(9), '😀'.repeat(8)],
    ['a'.repeat(31) + '😀', 'a'.repeat(31)],
    ['\ud800A\udc00', 'A']
  ]) {
    const actual = picker.label(input);
    assert.equal(actual, expected); assert.ok(Buffer.byteLength(actual, 'utf8') <= 32);
    const value = settings.defaults(); value.pins[0].label = actual;
    value.pins[0].openApp = {watchAppUuid:UUID, label:actual};
    assert.equal(settings.normalize(value).pins[0].label, actual);
  }
  for (const value of [null, undefined, {}, 12, '\n\0']) assert.equal(picker.label(value), '');
});

test('name search uses the official public client index and a bounded minimal GET', () => {
  const url = new URL(picker.searchUrl(' Timer & lights?/é😀 '));
  assert.equal(url.origin, 'https://gm3s9tryo4-dsn.algolia.net'); assert.equal(url.pathname, '/1/indexes/apps');
  assert.equal(url.searchParams.get('query'), 'Timer & lights?/é😀');
  assert.equal(url.searchParams.get('hitsPerPage'), '15'); assert.equal(url.searchParams.get('page'), '0');
  assert.deepEqual(JSON.parse(url.searchParams.get('tagFilters')), [['watchapp','companion-app']]);
  assert.deepEqual(JSON.parse(url.searchParams.get('attributesToRetrieve')), ['id','uuid','title','author','type','compatibility']);
  assert.deepEqual(JSON.parse(url.searchParams.get('attributesToHighlight')), []);
  assert.deepEqual(JSON.parse(url.searchParams.get('attributesToSnippet')), []);
  assert.equal(url.searchParams.get('x-algolia-application-id'), 'GM3S9TRYO4');
  assert.equal(url.searchParams.get('x-algolia-api-key'), '0b83b4f8e4e8e9793d2f1f93c21894aa');
  assert.ok(!url.searchParams.has('token')); assert.ok(!url.searchParams.has('Authorization'));
  assert.equal(Array.from(new URL(picker.searchUrl('😀'.repeat(81))).searchParams.get('query')).length, 80);
  assert.equal(new URL(picker.searchUrl('\ud800Hello\udc00\nworld')).searchParams.get('query'), 'Hello world');
  for (const query of ['', ' \n ', null, 42]) assert.throws(() => picker.searchUrl(query), /Enter an app name/);
});

test('a real public store hit keeps its own UUID and author rather than the known suite Timer', () => {
  assert.deepEqual(picker.parseResults({hits:[hit()]}), [
    {uuid:UUID, name:'Timer', author:'Ty Nichols', origin:'store', icon:'generic'}
  ]);
  assert.notEqual(picker.parseResults({hits:[hit()]})[0].uuid, picker.common()[2].uuid);
});

test('search accepts compatible scaled binaries and companion watchapps but rejects binaryless and wrong-platform entries', () => {
  const scaled = hit({uuid:'45590346-d6b9-4ae7-8acb-e036d199f624', title:'TimeR', author:'Sir_Awesomness',
    compatibility:{emery:{supported:true, has_binary:false}, basalt:{supported:true, has_binary:true}}});
  assert.equal(picker.parseResults({hits:[scaled]})[0].name, 'TimeR');
  assert.equal(picker.parseResults({hits:[hit({type:'companion-app'})]}).length, 1);
  for (const overrides of [
    {type:'plugin'}, {type:'watchface'}, {type:'unknown'},
    {compatibility:{emery:{supported:false}}}, {compatibility:{emery:{supported:'true'}}},
    {compatibility:{basalt:{supported:true}}}, {compatibility:null}, {compatibility:[]},
    {compatibility:{emery:true}}, {compatibility:{emery:[]}},
    {compatibility:undefined, _tags:['watchapp','emery']}
  ]) assert.deepEqual(picker.parseResults({hits:[hit(overrides)]}), [], JSON.stringify(overrides));
});

test('store IDs and plugin IDs never substitute for the actual UUID field', () => {
  for (const overrides of [
    {uuid:undefined}, {uuid:null}, {uuid:''}, {uuid:'not-a-uuid'}, {uuid:42},
    {uuid:'00000000-0000-0000-0000-000000000000'},
    {uuid:'8b210e928160473495d2fc80'}, {uuid:undefined, id:UUID, objectID:UUID, pluginUuid:UUID},
    {uuid:' ' + UUID}, {uuid:UUID + '\n'}
  ]) assert.deepEqual(picker.parseResults({hits:[hit(overrides)]}), []);
  assert.equal(picker.parseResults({hits:[hit({uuid:UUID.toUpperCase()})]})[0].uuid, UUID);
});

test('results are bounded, deduplicated, sanitized display metadata without executable or installation fields', () => {
  const entries = [null, 7, [], hit({title:''}), hit({title:12}), hit({title:' First\nname ', author:' Author\0Name ',
    installed:true, action:{plugin:UUID}, image:'https://untrusted.invalid/icon'}), hit({uuid:UUID.toUpperCase(), title:'Duplicate'})];
  for (let i = 0; i < 30; i++) entries.push(hit({uuid:'11111111-2222-4333-8444-' + String(i).padStart(12, '0'), title:'App ' + i}));
  const results = picker.parseResults({hits:entries});
  assert.equal(results.length, 15); assert.equal(new Set(results.map(app => app.uuid)).size, 15);
  assert.deepEqual(results[0], {uuid:UUID, name:'First name', author:'Author Name', origin:'store', icon:'generic'});
  assert.deepEqual(Object.keys(results[0]).sort(), ['author','icon','name','origin','uuid']);
  assert.equal(picker.parseResults({hits:[hit({title:'😀'.repeat(40), author:'界'.repeat(40)})]})[0].name, '😀'.repeat(32));
  for (const invalid of [null, undefined, [], {data:[hit()]}, {hits:{}}, {hits:'bad'}]) assert.deepEqual(picker.parseResults(invalid), []);
  assert.deepEqual(picker.parseResults({hits:Array(100).fill(null).concat(hit())}), []);
});

test('factory runs verbatim in the isolated legacy/bundled browser environment', () => {
  const browser = vm.runInNewContext('(' + picker.browserFactory.toString() + ')()');
  assert.equal(JSON.stringify(browser.common()), JSON.stringify(picker.common()));
  assert.equal(browser.label('é'.repeat(17)), picker.label('é'.repeat(17)));
  assert.equal(browser.searchUrl('Timer'), picker.searchUrl('Timer'));
  assert.equal(JSON.stringify(browser.parseResults({hits:[hit()]})), JSON.stringify(picker.parseResults({hits:[hit()]})));
});

test('manifest grants only the exact public search domain without future app-enumeration permissions', () => {
  const manifest = require('../package.json').pebble;
  const internet = manifest.usesPermissions.filter(permission => permission && permission.name === 'Internet');
  assert.deepEqual(internet, [{name:'Internet', parameters:{domains:['gm3s9tryo4-dsn.algolia.net']}}]);
  assert.ok(!manifest.usesPermissions.includes('GlobalInternet'));
  assert.ok(!manifest.usesPermissions.includes('ReadApps'));
});
