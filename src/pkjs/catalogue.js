'use strict';

// Installed plugin declarations are public metadata. Never cache a source
// envelope, live instance, activity/card, observation or invocation arguments.
// This module is also bundled into plugin.js, whose SDK cannot enumerate peers.
var KEY='dashboard.catalogue.v1',MAX_BYTES=262144;
function object(value){return !!value&&typeof value==='object'&&!Array.isArray(value);}
function uuid(value){return typeof value==='string'&&/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value)&&value!=='00000000-0000-0000-0000-000000000000';}
function text(value,limit){return typeof value==='string'?value.replace(/[\u0000-\u001f\u007f-\u009f]/g,' ').trim().slice(0,limit):'';}
function bytes(value){var size=0;for(var i=0;i<value.length;i++){var c=value.charCodeAt(i);if(c<128)size++;else if(c<2048)size+=2;else if(c>=55296&&c<=56319&&i+1<value.length&&value.charCodeAt(i+1)>=56320&&value.charCodeAt(i+1)<=57343){size+=4;i++;}else size+=3;}return size;}
function key(value,limit){return typeof value==='string'&&value.length>0&&value.length<=limit&&!/[\u0000-\u001f\u007f-\u009f]/.test(value)&&['__proto__','prototype','constructor'].indexOf(value)<0;}
function names(value,limit,count){return Array.isArray(value)?value.filter(function(v){return key(v,limit);}).slice(0,count):[];}
function spend(budget,value){budget.nodes++;budget.bytes+=typeof value==='string'?bytes(value):16;if(budget.nodes>1024||budget.bytes>16384)throw Error('Schema metadata is too large.');}
function schema(input,depth,budget){
  if(!object(input)||depth>6)throw Error('Schema metadata is too deep.');
  spend(budget,64);
  var out={};
  ['type','title','description'].forEach(function(name){if(typeof input[name]==='string'){out[name]=text(input[name],name==='description'?384:128);spend(budget,out[name]);}});
  ['minimum','maximum','minLength','maxLength','minItems','maxItems'].forEach(function(name){if(typeof input[name]==='number'&&isFinite(input[name]))out[name]=input[name];});
  if(typeof input.additionalProperties==='boolean')out.additionalProperties=input.additionalProperties;
  if(Array.isArray(input.required)){
    if(input.required.length>128||input.required.some(function(name){return !key(name,64);}))throw Error('Schema requirements are too large.');
    out.required=input.required.slice();out.required.forEach(function(name){spend(budget,name);});
  }
  if(Array.isArray(input.enum)){
    if(input.enum.length>64||input.enum.some(function(v){return !(v===null||typeof v==='boolean'||typeof v==='number'&&isFinite(v)||typeof v==='string'&&v.length<=256);}))throw Error('Schema choices are too large.');
    out.enum=input.enum.slice();out.enum.forEach(function(v){spend(budget,v);});
  }
  if(object(input.properties)){
    var fields=Object.keys(input.properties);if(fields.length>128||fields.some(function(name){return !key(name,64);}))throw Error('Schema fields are too large.');
    out.properties={};fields.forEach(function(name){spend(budget,name);out.properties[name]=schema(input.properties[name],depth+1,budget);});
  }
  if(object(input.items))out.items=schema(input.items,depth+1,budget);
  return out;
}
function source(input){
  if(!object(input)||!key(input.category,64))return null;
  var out={category:input.category,items:names(input.items,64,64),properties:{}};
  if(!out.items.length)return null;
  if(object(input.properties))Object.keys(input.properties).filter(function(name){return key(name,64);}).slice(0,128).forEach(function(name){out.properties[name]=names(input.properties[name],64,16);});
  if(typeof input.supportsMultiple==='boolean')out.supportsMultiple=input.supportsMultiple;
  return out;
}
function action(input){
  if(!object(input)||!key(input.name,64))return null;
  var out={name:input.name};
  if(typeof input.description==='string')out.description=text(input.description,384);
  if(object(input.parameters)){try{out.parameters=schema(input.parameters,0,{nodes:0,bytes:0});}catch(ignored){return null;}if(bytes(JSON.stringify(out.parameters))>16384)return null;}
  if(Array.isArray(input.targets))out.targets=names(input.targets,192,64);
  if(typeof input.destructive==='boolean')out.destructive=input.destructive;
  if(typeof input.requiresConfirmation==='boolean')out.requiresConfirmation=input.requiresConfirmation;
  return out;
}
function activitySource(value){
  // Matches pebble-activities 0.4.4 consumer.sourceItem(plugin, 3), without
  // starting that consumer or requiring npm modules in the config-only bundle.
  return value.category==='activity'&&Array.isArray(value.properties.schema_version)&&value.properties.schema_version.indexOf('numericValue')>=0&&
    value.items.some(function(item){return ['summary','live','card','session'].indexOf(item)>=0;});
}
function fromPlugins(input){
  if(!Array.isArray(input))throw Error('Plugin catalogue is invalid.');
  var seen=Object.create(null),plugins=[];
  input.slice(0,128).forEach(function(value){
    if(!object(value)||!uuid(value.uuid)||seen[value.uuid.toLowerCase()])return;
    seen[value.uuid.toLowerCase()]=true;
    plugins.push({uuid:value.uuid,name:text(value.name||value.displayName,96)||value.uuid,
      sources:(Array.isArray(value.sources)?value.sources:[]).slice(0,64).map(source).filter(Boolean),
      actions:(Array.isArray(value.actions)?value.actions:[]).slice(0,64).map(action).filter(Boolean)});
  });
  return {plugins:plugins,instances:[],activities:plugins.filter(function(plugin){return plugin.sources.some(activitySource);}).map(function(plugin){return {key:plugin.uuid,name:plugin.name};}).concat([{key:'builtin:music',name:'Music'}])};
}
function save(storage,catalogue){
  if(!storage||typeof storage.setItem!=='function')return false;
  var clean=fromPlugins(catalogue.plugins),value=JSON.stringify({version:1,plugins:clean.plugins});
  // Large declarations keep a bounded provider list, without caching truncated
  // action schemas that could misrepresent their required arguments.
  if(bytes(value)>MAX_BYTES){
    clean.plugins=clean.plugins.map(function(plugin){return {uuid:plugin.uuid,name:plugin.name,actions:[],sources:plugin.sources.filter(activitySource).slice(0,1).map(function(declaration){return {category:'activity',items:declaration.items.filter(function(item){return ['summary','live','card','session'].indexOf(item)>=0;}).slice(0,4),properties:{schema_version:['numericValue']}};})};});
    value=JSON.stringify({version:1,plugins:clean.plugins});
  }
  if(bytes(value)>MAX_BYTES)return false;
  try{if(typeof storage.getItem==='function'&&storage.getItem(KEY)===value)return true;storage.setItem(KEY,value);return true;}catch(ignored){return false;}
}
function load(storage){
  try{
    var value=storage&&storage.getItem(KEY);if(typeof value!=='string'||bytes(value)>MAX_BYTES)return null;
    var decoded=JSON.parse(value);if(!object(decoded)||decoded.version!==1||!Array.isArray(decoded.plugins)||decoded.plugins.length>128)return null;
    return fromPlugins(decoded.plugins);
  }catch(ignored){return null;}
}
function discover(pebble,storage){
  if(!pebble||typeof pebble.enumeratePlugins!=='function')return Promise.reject(Error('Installed plugin discovery is unavailable in this phone runtime.'));
  try{return Promise.resolve(pebble.enumeratePlugins()).then(function(plugins){var catalogue=fromPlugins(plugins);save(storage,catalogue);return catalogue;});}
  catch(error){return Promise.reject(error);}
}
module.exports={fromPlugins:fromPlugins,discover:discover,load:load,save:save,key:KEY,limit:MAX_BYTES};
