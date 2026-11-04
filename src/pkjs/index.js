'use strict';

var createRuntime=require('./runtime');
var settings=require('./settings');
var runtime=createRuntime({pebble:Pebble,storage:localStorage});
Pebble.addEventListener('ready',function(){runtime.ready();});
Pebble.addEventListener('appmessage',function(event){runtime.message(event&&event.payload);});
Pebble.addEventListener('showConfiguration',function(){
  var page=require('./settings-page');
  Promise.resolve(runtime.configuration()).then(function(value){
    Pebble.openURL('data:text/html;charset=utf-8,'+encodeURIComponent(page(value.needsRepair?null:value.settings,value.catalogue)));
  },function(){
    var current=settings.load(localStorage);
    Pebble.openURL('data:text/html;charset=utf-8,'+encodeURIComponent(page(current,{plugins:[],instances:[],activities:[],error:'Plugin discovery is unavailable. Saved choices are preserved.'})));
  });
});
Pebble.addEventListener('webviewclosed',function(event){
  if(!event||!event.response)return;
  try{
    var source=event.response;
    var value=JSON.parse(source.charAt(0)==='{'?source:decodeURIComponent(source));
    runtime.configure(value.settings||value);
  }catch(ignored){/* Invalid or cancelled drafts never replace saved settings. */}
});
Pebble.addEventListener('configmessage',function(event){
  if(!event||typeof event.respond!=='function')return;
  var message=event.message||event.data||event.payload||event;
  try{
    if(typeof message==='string')message=JSON.parse(message);
    if(message&&message.type==='catalogue'){
      runtime.catalogue().then(function(value){event.respond({ok:true,catalogue:value,cached:false});},function(){event.respond({ok:false,message:'Could not read installed plugins. Retry discovery.'});});return;
    }
    if(!message||message.type!=='reload_settings'){event.respond({ok:false});return;}
    var current=settings.load(localStorage);
    if(!current){event.respond({ok:false});return;}
    runtime.reloadSettings();event.respond({ok:true});
  }catch(ignored){event.respond({ok:false});}
});
