'use strict';
// Execute the shipped controller in a small DOM model. This covers persistence
// semantics without a browser socket; it does not measure layout or WebView UI.
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const settings = require('../src/pkjs/settings');
const page = require('../src/pkjs/settings-page');

function boot(initial, language = 'en') {
  const all = [], byId = {}, events = {}, timers = new Map(); let timer = 0;
  class Element {
    constructor(tag, attrs = {}) { this.tagName = tag.toUpperCase(); this.attrs = attrs; this.children = []; this.value = attrs.value || ''; this.type = attrs.type || ''; this.checked = false; this.disabled = false; this.hidden = 'hidden' in attrs; this.style = {setProperty() {}}; this.textContent = ''; all.push(this); }
    appendChild(child) { child.parentNode = this; this.children.push(child); if (this.tagName === 'SELECT' && this.children.length === 1) this.value = child.value; return child; }
    set textContent(value) { this._text = value; this.children = []; }
    get textContent() { return this._text; }
    setAttribute(name, value) { this.attrs[name] = value; }
    getAttribute(name) { return this.attrs[name] ?? null; }
    addEventListener() {}
    getBoundingClientRect() { return {height:120}; }
    closest(selector) { return selector === '#pins' && this.parentNode ? this.parentNode.attrs.id === 'pins' ? this.parentNode : this.parentNode.closest(selector) : null; }
    contains(element) { return element === this || this.children.some(child => child.contains(element)); }
    querySelector(selector) { return this.children.find(child => selector === 'button' && child.tagName === 'BUTTON') || this.children.map(child => child.querySelector(selector)).find(Boolean) || null; }
  }
  const html = page.config();
  for (const match of html.matchAll(/<([a-z]+)\b([^>]*\bid="[^"]+"[^>]*)>/g)) {
    const attrs = {}; for (const attr of match[2].matchAll(/([\w-]+)(?:="([^"]*)")?/g)) attrs[attr[1]] = attr[2] ?? '';
    byId[attrs.id] = new Element(match[1], attrs);
  }
  const body = new Element('body'), documentElement = new Element('html');
  const document = {body, documentElement, activeElement:body, title:'Dashboard settings', getElementById:id => {assert.ok(byId[id], id); return byId[id];}, createElement:tag => new Element(tag), createTreeWalker:() => ({nextNode:() => null}), querySelectorAll:selector => selector === '[data-edit]' ? all.filter(el => 'data-edit' in el.attrs) : []};
  const state = {saved:structuredClone(initial), writes:[], reject:false, mismatch:false};
  const location = {href:'preview://settings'};
  const window = {scrollX:0, scrollY:193, innerHeight:800, addEventListener() {}, scrollTo(x,y) {this.scrollX=x; this.scrollY=y;}};
  const Pebble = {addEventListener:(type, fn) => {events[type] = fn;}, targets:async () => [{id:'plugin'}, {id:'pkjs'}], sendMessage:async (target, message) => {
    if (message.type === 'load_settings') return {ok:true,settings:state.saved};
    if (message.type === 'catalogue') return {ok:true,catalogue:{plugins:[],instances:[],activities:[]}};
    if (message.type === 'save_settings') {
      state.writes.push({target, settings:structuredClone(message.settings)});
      if (state.reject) throw Error('uncertain write');
      state.saved = structuredClone(message.settings);
      return {ok:true,settings:state.mismatch ? {...state.saved,dark:!state.saved.dark} : state.saved};
    }
    throw Error('Unexpected request '+message.type);
  }};
  const context = {window, document, location, navigator:{language}, Pebble, Promise, setTimeout:fn => {timers.set(++timer,fn); return timer;}, clearTimeout:id => timers.delete(id), console};
  vm.runInNewContext(html.match(/<script>([\s\S]*)<\/script>/)[1], context);
  events.ready({target:'plugin'});
  return {byId, state, window, location, document, async flush() {for(let i=0;i<30;i++) await Promise.resolve();}, change(value) {byId.dark.value=value; byId.dark.onchange();}};
}
for (const locale of ['en', 'cs']) test('appearance selector preserves boolean persistence, confirmed stay-open Save and reopen in '+locale, async () => {
  const initial=settings.defaults(); initial.dark=true;
  initial.pins[0].openApp={watchAppUuid:'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', label:'My custom Weather'};
  const ui=boot(initial,locale); await ui.flush();
  assert.equal(ui.byId.dark.value,'dark'); assert.equal(ui.byId.save.disabled,true);
  ui.change('light'); assert.equal(ui.byId.save.disabled,false);
  ui.byId.save.onclick(); await ui.flush();
  assert.equal(ui.state.writes.length,1); assert.equal(ui.state.writes[0].target,'pkjs');
  assert.equal(ui.state.saved.dark,false); assert.equal(typeof ui.state.saved.dark,'boolean');
  assert.deepEqual(ui.state.saved.pins,initial.pins);
  assert.equal(ui.location.href,'preview://settings'); assert.equal(ui.window.scrollY,193); assert.equal(ui.document.activeElement,ui.document.body);
  assert.equal(ui.byId.status.textContent,locale==='cs'?'✓ Uloženo':'✓ Saved'); assert.equal(ui.byId.save.disabled,true);
  await ui.flush(); assert.equal(ui.byId.status.textContent,locale==='cs'?'✓ Uloženo':'✓ Saved');
  const reopened=boot(ui.state.saved,locale); await reopened.flush(); assert.equal(reopened.byId.dark.value,'light'); assert.equal(reopened.byId.save.disabled,true);
  ui.change('dark'); assert.equal(ui.byId.save.disabled,false); assert.equal(ui.byId.status.textContent,locale==='cs'?'Neuložené změny.':'Unsaved changes.');
});
test('mismatched persistence acknowledgement keeps the appearance draft unconfirmed until explicit reload', async () => {
  const ui=boot(settings.defaults()); await ui.flush(); ui.change('dark'); ui.state.mismatch=true;
  ui.byId.save.onclick(); await ui.flush();
  assert.equal(ui.byId.dark.value,'dark'); assert.equal(ui.byId.save.disabled,false);
  assert.match(ui.byId.status.textContent,/not confirmed/); assert.equal(ui.state.writes.length,1);
  ui.byId.discard.onclick(); await ui.flush(); assert.equal(ui.byId.dark.value,'dark'); assert.equal(ui.byId.save.disabled,true);
});

for(const locale of require('../src/common/translations.json').languages) test('localized settings save/reopen with unchanged bindings: '+locale,async()=>{
 const initial=settings.defaults(),ui=boot(initial,locale);await ui.flush();
 assert.equal(ui.document.documentElement.lang,locale);
 ui.change('dark');ui.byId.save.onclick();await ui.flush();
 assert.equal(ui.byId.status.textContent,require('../src/common/translations.json').words[locale]['✓ Saved']);
 assert.deepEqual(ui.state.saved.pins,initial.pins);
 const reopened=boot(ui.state.saved,locale);await reopened.flush();assert.equal(reopened.byId.dark.value,'dark');assert.equal(reopened.byId.save.disabled,true);
});
