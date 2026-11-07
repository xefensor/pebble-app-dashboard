'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const data=require('../src/common/translations.json');
test('all 17 interface catalogues are complete and preserve formatting placeholders',()=>{
 assert.equal(data.languages.length,17);
 const keys=Object.keys(data.words.en).sort();
 const tokens=text=>(text.match(/%[0-9.]*l?[usd]|\{[a-zA-Z]+\}/g)||[]).sort();
 for(const lang of data.languages){
  assert.deepEqual(Object.keys(data.words[lang]).sort(),keys,lang);
  for(const key of keys){assert.equal(typeof data.words[lang][key],'string',lang+': '+key);assert.ok(data.words[lang][key].length,lang+': '+key);assert.deepEqual(tokens(data.words[lang][key]),tokens(key),lang+': '+key);}
  for(const key of data.native)assert.ok(data.words[lang][key],lang+': '+key);
 }
});
