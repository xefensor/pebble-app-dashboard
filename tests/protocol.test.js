'use strict';
var test=require('node:test'),assert=require('node:assert/strict');
var protocol=require('../src/pkjs/protocol');
function item(extra){return Object.assign({token:1,version:1,validUntil:2000000060,flags:0,kind:0,role:2,title:'Kitchen',subtitle:'',value:'65%',appLabel:'',actionLabel:'',name:''},extra);}
function frame(items,extra){return Object.assign({session:1,request:2,sequence:3,now:2000000000,mode:2,status:1,total:items.length,offset:0,activitiesTotal:0,pinsTotal:items.length,items:items},extra);}
test('DSH1 identity and UTF8 lengths are explicit little endian',function(){
  var b=Buffer.from(protocol.encode(frame([item({title:'Kuchyň',value:'13°C'})])));
  assert.equal(b.subarray(0,4).toString(),'DSH1');assert.equal(b.readUInt32LE(4),1);assert.equal(b.readUInt32LE(8),2);
  assert.equal(b.readUInt32LE(12),3);assert.equal(b[20],2);assert.equal(b[22],1);assert.equal(b.readUInt16LE(24),1);
  assert.equal(b.readUInt32LE(32),1);assert.equal(b.readUInt16LE(56),Buffer.byteLength('Kuchyň'));
  assert.equal(b.readUInt16LE(60),Buffer.byteLength('13°C'));
});
test('opaque identities, viewport and byte budgets reject malformed snapshots',function(){
  assert.throws(function(){protocol.encode(frame([item(),item()]));},/identity/);
  assert.throws(function(){protocol.encode(frame([item({token:0})]));},/identity/);
  assert.throws(function(){protocol.encode(frame([item()],{session:0}));},/snapshot/);
  assert.throws(function(){protocol.encode(frame([item()],{offset:1}));},/range/);
  assert.throws(function(){protocol.encode(frame([item({value:'x'.repeat(49)})]));},/value/);
  assert.throws(function(){protocol.encode(frame(Array.from({length:6},function(_,i){return item({token:i+1});})));},/viewport/);
});
test('text truncation respects UTF8 codepoint boundaries',function(){
  assert.equal(protocol.text('A🙂č',5),'A🙂');assert.equal(protocol.text('A🙂č',6),'A🙂');
  assert.equal(protocol.text('A🙂č',7),'A🙂č');assert.deepEqual(protocol.utf8('°C'),[194,176,67]);
  assert.equal(Buffer.from(protocol.utf8('\ud800')).toString(),'�');
});
test('partial media and generic control labels are carried without fake actions',function(){
  var b=Buffer.from(protocol.encode(frame([item({role:0,controls:['Previous','','Next'],flags:protocol.flag.ACTION|protocol.flag.MEDIA_PREVIOUS|protocol.flag.MEDIA_NEXT})],{mode:3})));
  assert.equal(b.readUInt16LE(74),15); // 3 label lengths + 8+0+4 bytes.
  var start=76+Buffer.byteLength('Kitchen')+Buffer.byteLength('65%');
  assert.equal(b[start],8);assert.equal(b.subarray(start+1,start+9).toString(),'Previous');assert.equal(b[start+9],0);
  assert.throws(function(){protocol.encode(frame([item({controls:['Only one']})]));},/controls/);
});
test('optional malformed images cannot invalidate otherwise valid content',function(){
  var bad={width:2,height:1,palette:[255],pixels:[16]};
  var b=Buffer.from(protocol.encode(frame([item({image:bad})])));assert.equal(b[68],0);assert.equal(b.readUInt16LE(72),0);
  var good={width:2,height:1,palette:[192,255],pixels:[1]};
  b=Buffer.from(protocol.encode(frame([item({image:good})])));assert.equal(b[68],2);assert.equal(b.readUInt16LE(72),1);
});
test('frame image allocation is bounded across the whole viewport',function(){
  var image={width:40,height:40,palette:[192],pixels:Array(800).fill(0)};
  var items=Array.from({length:7},function(_,i){return item({token:i+1,role:i<2?0:i===2?1:2,image:image});});
  var bytes=protocol.encode(frame(items,{mode:0}));assert.ok(bytes.length<8192);
  assert.ok(bytes.length<3000,'later optional images must be omitted after budget');
});
test('numeric and symbolic dictionary bridges resolve the same message',function(){
  assert.equal(protocol.get({4001:123},'DB_SESSION'),123);assert.equal(protocol.get({DB_SESSION:456},'DB_SESSION'),456);
});
test('static unavailable pins need no fabricated source lease; live data does',function(){
  assert.ok(protocol.encode(frame([item({value:'',validUntil:0})])).length);
  assert.throws(function(){protocol.encode(frame([item({validUntil:0})]));},/Unleased/);
  assert.throws(function(){protocol.encode(frame([item({value:'',validUntil:0,flags:protocol.flag.PRIVATE})]));},/Unleased/);
  assert.throws(function(){protocol.encode(frame([item()],{mode:protocol.mode.ACTIVITIES}));},/role/);
});
