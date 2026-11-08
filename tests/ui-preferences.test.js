'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const prefs=require('../src/pkjs/ui-preferences'),legacy=require('../src/pkjs/ui-preferences-legacy');
const light={version:2,textSize:'follow',appearance:'light',lastExplicit:'light'};
const large={version:2,textSize:'large',appearance:'dark',lastExplicit:'dark'};
function setup(map=new Map(),transport=true){
 const sent=[],timers=new Map();let id=0,failWrite=false;
 const storage={getItem:key=>map.get(key)??null,setItem(key,value){if(failWrite)throw Error('disk');map.set(key,value);}};
 const controller=prefs.create({storage,send:transport?(message,fail,ok)=>sent.push({message,fail,ok}):undefined,later(fn){timers.set(++id,fn);return id;},cancel(id){timers.delete(id);}});
 return {controller,map,sent,timers,fail(value){failWrite=value;},request(type,settings){let result;controller.handle({type,settings},value=>result=value);return result;},ack(index=sent.length-1,edit){const bytes=sent[index].message.DB_UI_PREFERENCES.slice();if(edit)edit(bytes);return controller.receive(bytes);},tick(){const entry=timers.entries().next().value;assert.ok(entry);timers.delete(entry[0]);entry[1]();}};
}
test('phone save survives reopen; only exact persisted watch receipt marks applied',()=>{
 const offline=setup(new Map(),false),saved=offline.request('saveUiPreferences',large);
 assert.equal(saved.saved,true);assert.equal(saved.delivery.pending,true);assert.equal(offline.sent.length,0);
 const live=setup(offline.map);assert.deepEqual(live.request('getUiPreferences').settings,large);
 live.controller.reconcile(true);assert.equal(live.sent.length,1);
 live.sent[0].ok();assert.equal(live.request('getUiPreferences').delivery.applied,false);
 live.ack(0,b=>b[4]++);assert.equal(live.request('getUiPreferences').delivery.applied,false);
 live.ack(0,b=>b[8]=1);assert.equal(live.request('getUiPreferences').delivery.applied,false);
 assert.equal(live.ack(),true);assert.equal(live.timers.size,0);
 assert.equal(setup(live.map,false).request('getUiPreferences').delivery.applied,true);
});
test('new choices supersede old acknowledgments and retry at most three times',()=>{
 const s=setup();s.request('saveUiPreferences',light);const old=s.sent[0].message.DB_UI_PREFERENCES;
 s.request('saveUiPreferences',large);s.controller.receive(old);
 assert.equal(s.request('getUiPreferences').delivery.applied,false);
 s.sent[1].fail();s.tick();s.sent[2].ok();s.tick();s.tick();s.sent[3].fail();
 assert.equal(s.sent.length,4);assert.equal(s.timers.size,0);
 assert.equal(s.request('getUiPreferences').delivery.pending,true);
 s.request('retryUiPreferences');assert.equal(s.sent.length,5);
});
test('fresh watch state invalidates an earlier receipt even if pending metadata cannot be written',()=>{
 const s=setup();s.request('saveUiPreferences',large);s.ack();s.fail(true);
 const hello=prefs.encode(light,0);hello[3]=1;s.controller.receive(hello);
 assert.equal(s.request('getUiPreferences').delivery.applied,false);
 assert.equal(s.sent.length,1,'metadata failure must not send a reusable revision');
 assert.equal(s.ack(),false,'an old receipt cannot undo known watch mismatch');
 s.fail(false);s.request('retryUiPreferences');s.ack();
 assert.equal(s.request('getUiPreferences').delivery.applied,true);
});
test('save failure cannot become applied; retry and reopening retain desired choices',()=>{
 const s=setup();s.request('saveUiPreferences',large);s.ack(0,b=>b[2]=1);
 assert.equal(s.request('getUiPreferences').delivery.error,'watch_save_unconfirmed');
 assert.equal(setup(s.map,false).request('getUiPreferences').delivery.pending,true);
 s.request('retryUiPreferences');s.ack();assert.equal(s.request('getUiPreferences').delivery.applied,true);
});
test('explicit legacy migration keeps manual text and Follow appearance keeps its fallback',()=>{
 const map=new Map([[legacy.key,JSON.stringify({...require('../src/pkjs/settings').defaults(),dark:true})]]),s=setup(map);
 assert.deepEqual(s.request('getUiPreferences').settings,{...light,appearance:'dark',lastExplicit:'dark'});
 s.request('saveUiPreferences',{...large,appearance:'follow'});s.ack();
 assert.equal(s.request('getUiPreferences').settings.appearance,'follow');
 legacy.save({setItem:(k,v)=>map.set(k,v),getItem:k=>map.get(k)},{version:1,theme:'light'});
 assert.deepEqual(s.request('getUiPreferences').settings,{...large,appearance:'light',lastExplicit:'light'});
 s.controller.reconcile(true);s.ack();
 assert.deepEqual(s.request('getUiPreferences').settings,{...large,appearance:'light',lastExplicit:'light'});
});
test('corrupt phone store requires explicit repair; invalid choices and unconfirmed writes fail closed',()=>{
 const s=setup(new Map([[prefs.key,'broken']]));
 assert.equal(s.request('getUiPreferences').needsRepair,true);assert.equal(s.controller.reconcile(true),false);
 assert.equal(s.map.get(prefs.key),'broken');
 assert.equal(s.request('saveUiPreferences',{...large,extra:true}).ok,false);
 s.fail(true);assert.equal(s.request('saveUiPreferences',large).ok,false);assert.equal(s.sent.length,0);
 s.fail(false);assert.equal(s.request('saveUiPreferences',large).saved,true);
});
test('wire codec rejects malformed lengths, flags, enum and manual fallback inconsistencies',()=>{
 const bytes=prefs.encode(large,0xfedcba98);assert.equal(prefs.decode(bytes).revision,0xfedcba98);
 for(const mutate of [b=>b.pop(),b=>b[1]=2,b=>b[2]=2,b=>b[3]=2,b=>b[8]=4,b=>b[16]=1,b=>b[9]=256]){
  const invalid=bytes.slice();mutate(invalid);assert.equal(prefs.decode(invalid),null);
 }
});

test('editing an uncommitted legacy migration keeps advancing the known revision',()=>{
 const s=setup();s.request('saveUiPreferences',large);s.ack();
 const revision=JSON.parse(s.map.get(prefs.key)).revision;
 s.map.set(legacy.key,JSON.stringify({...require('../src/pkjs/settings').defaults(),dark:false}));
 const edited={...large,textSize:'small'};s.request('saveUiPreferences',edited);
 assert.ok(JSON.parse(s.map.get(prefs.key)).revision>revision);
});

test('preference mirror preserves exact Dashboard pin/action bindings and stop prevents further transport',()=>{
 const model=require('../src/pkjs/settings'),map=new Map(),value=model.defaults();
 value.pins[0].openApp={watchAppUuid:'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',label:'Exact Weather'};
 value.notificationPreview=true;model.save({getItem:k=>map.get(k),setItem:(k,v)=>map.set(k,v)},value);
 const s=setup(map);s.request('saveUiPreferences',large);
 assert.deepEqual(model.load({getItem:k=>map.get(k)}),{...value,dark:true});
 s.controller.stop();const sent=s.sent.length;s.request('saveUiPreferences',light);
 assert.equal(s.sent.length,sent);assert.equal(s.timers.size,0);
});

test('a fresh watch mismatch rotates the revision before resending and rejects the prior receipt',()=>{
 const s=setup();s.request('saveUiPreferences',large);s.ack();
 const old=s.sent[0].message.DB_UI_PREFERENCES.slice();
 const hello=prefs.encode(light,0);hello[3]=1;s.controller.receive(hello);
 const current=s.sent.at(-1).message.DB_UI_PREFERENCES;
 assert.notEqual(prefs.decode(current).revision,prefs.decode(old).revision);
 s.controller.receive(old);assert.equal(s.request('getUiPreferences').delivery.applied,false);
 s.ack();assert.equal(s.request('getUiPreferences').delivery.applied,true);
 s.request('retryUiPreferences');s.controller.receive(current);
 assert.equal(s.request('getUiPreferences').delivery.applied,false,'manual retry has a new delivery identity');
 s.ack();assert.equal(s.request('getUiPreferences').delivery.applied,true);
});

test('a failed reset revision cancels the previous receipt wait and ignores its late transport callback',()=>{
 const s=setup();s.request('saveUiPreferences',large);s.sent[0].ok();assert.equal(s.timers.size,1);
 s.fail(true);const hello=prefs.encode(light,0);hello[3]=1;s.controller.receive(hello);
 assert.equal(s.timers.size,0);s.sent[0].ok();assert.equal(s.timers.size,0);
 s.ack(0);assert.equal(s.request('getUiPreferences').delivery.applied,false);
 s.fail(false);s.request('retryUiPreferences');s.ack();assert.equal(s.request('getUiPreferences').delivery.applied,true);
});
