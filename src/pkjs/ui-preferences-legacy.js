'use strict';
var model=require('./settings');
function load(storage){var value=model.load(storage);return value?{version:1,theme:value.dark?'dark':'light'}:null;}
function save(storage,value){
  var current=model.load(storage);if(!current)return false;
  try{current.dark=value.theme==='dark';model.save(storage,current);return load(storage).theme===value.theme;}catch(error){return false;}
}
module.exports={key:model.key,load:load,save:save};
