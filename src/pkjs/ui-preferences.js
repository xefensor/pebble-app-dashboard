'use strict';

var legacy=require('./ui-preferences-legacy');
var KEY='dashboard-ui-preferences-v1';
var sizes=['follow','small','medium','large'],looks=['follow','light','dark'];
function normalize(value){
  if(!value||value.version!==2||Object.keys(value).sort().join(',')!=='appearance,lastExplicit,textSize,version'||
      sizes.indexOf(value.textSize)<0||looks.indexOf(value.appearance)<0||
      ['light','dark'].indexOf(value.lastExplicit)<0||
      value.appearance!=='follow'&&value.appearance!==value.lastExplicit)return null;
  return {version:2,textSize:value.textSize,appearance:value.appearance,lastExplicit:value.lastExplicit};
}
function equal(a,b){return JSON.stringify(a)===JSON.stringify(b);}
function defaults(theme){return {version:2,textSize:'follow',appearance:theme,lastExplicit:theme};}
function put(bytes,at,value){for(var i=0;i<4;i++)bytes[at+i]=(value>>>(8*i))&255;}
function u32(bytes,at){return (bytes[at]|bytes[at+1]<<8|bytes[at+2]<<16|bytes[at+3]<<24)>>>0;}
function encode(settings,revision){
  var bytes=[1,3,0,0];put(bytes,4,revision);put(bytes,8,sizes.indexOf(settings.textSize));
  put(bytes,12,looks.indexOf(settings.appearance));put(bytes,16,looks.indexOf(settings.lastExplicit));return bytes;
}
function decode(input){
  if(!input||input.length!==20)return null;
  var bytes=Array.prototype.slice.call(input);
  if(!bytes.every(function(value){return Number.isInteger(value)&&value>=0&&value<=255;})||
      bytes[0]!==1||bytes[1]!==3||bytes[2]>1||bytes[3]>1)return null;
  var value=normalize({version:2,textSize:sizes[u32(bytes,8)],appearance:looks[u32(bytes,12)],lastExplicit:looks[u32(bytes,16)]});
  return value?{settings:value,revision:u32(bytes,4),status:bytes[2],hello:bytes[3]===1}:null;
}
function matches(frame,record){var value=decode(frame);return !!value&&value.status===0&&value.revision===record.revision&&equal(value.settings,record.settings);}
function next(revision){return ((revision+1)>>>0)||1;}
function isRequest(message){return message&&['getUiPreferences','saveUiPreferences','retryUiPreferences'].indexOf(message.type)>=0;}
function create(options){
  var storage=options.storage,send=options.send,later=options.later||function(fn,ms){return setTimeout(fn,ms);},cancel=options.cancel||function(id){clearTimeout(id);};
  var generation=0,timer=null,attempts=0,watchMismatch=false,closed=false;
  function stop(){if(timer!==null)cancel(timer);timer=null;}
  function read(){
    var old=legacy.load(storage),raw=storage.getItem(KEY),record,stored=raw!==null&&raw!==undefined;
    if(!stored)return {healthy:!!old,stored:false,record:{version:1,settings:defaults(old?old.theme:'light'),revision:1,applied:null,error:null,legacyTheme:old?old.theme:'light'}};
    try{record=JSON.parse(raw);}catch(error){record=null;}
    if(!record||record.version!==1||!normalize(record.settings)||!Number.isInteger(record.revision)||record.revision<1||record.revision>0xffffffff||
        ['light','dark'].indexOf(record.legacyTheme)<0||record.applied!==null&&!decode(record.applied)||
        record.error!==null&&typeof record.error!=='string')
      return {healthy:false,stored:false,record:{version:1,settings:defaults(old?old.theme:'light'),revision:1,applied:null,error:null,legacyTheme:old?old.theme:'light'}};
    record.settings=normalize(record.settings);
    if(old&&old.theme!==record.legacyTheme){
      record.legacyTheme=old.theme;
      if(old.theme!==record.settings.lastExplicit){
        record.settings.appearance=old.theme;record.settings.lastExplicit=old.theme;
        record.revision=next(record.revision);record.applied=null;record.error=null;stored=false;
      }
    }
    return {healthy:true,stored:stored,record:record};
  }
  function commit(record){
    try{var encoded=JSON.stringify(record);storage.setItem(KEY,encoded);return storage.getItem(KEY)===encoded;}catch(error){return false;}
  }
  function response(state){
    var record=state.record,applied=state.healthy&&!watchMismatch&&matches(record.applied,record);
    return {ok:true,settings:record.settings,needsRepair:!state.healthy,saved:state.stored,
      delivery:{applied:applied,pending:!applied,error:record.error}};
  }
  function pending(record){record.applied=null;record.error=null;return commit(record);}
  function retry(g){
    if(g!==generation||attempts>=3||!send)return;
    stop();timer=later(function(){timer=null;if(g===generation)deliver(g);},500*attempts);
  }
  function deliver(g){
    if(g!==generation||attempts>=3||!send)return;
    var state;try{state=read();}catch(error){return;}
    if(!state.healthy||!state.stored||!watchMismatch&&matches(state.record.applied,state.record))return;
    ++attempts;
    var message={DB_UI_PREFERENCES:encode(state.record.settings,state.record.revision)};
    send(message,function(){retry(g);},function(){
      if(g!==generation)return;
      var latest;try{latest=read();}catch(error){return;}
      if(latest.healthy&&!watchMismatch&&matches(latest.record.applied,latest.record))return;
      stop();timer=later(function(){timer=null;retry(g);},1500);
    });
  }
  function reconcile(force){
    if(closed)return false;
    var state;try{state=read();}catch(error){return false;}
    if(!state.healthy)return false;
    if(!state.stored&&!commit(state.record))return false;
    if(force){watchMismatch=true;if(!pending(state.record))return false;}
    ++generation;attempts=0;stop();deliver(generation);return true;
  }
  function save(value){
    var selected=normalize(value);if(!selected)return {ok:false,error:'invalid_settings'};
    var state;try{state=read();}catch(error){return {ok:false,error:'save_unconfirmed'};}
    var record=state.record;
    if(!state.healthy||!equal(record.settings,selected)){
      record={version:1,settings:selected,revision:state.healthy?next(record.revision):1,
        applied:null,error:null,legacyTheme:record.legacyTheme};
    }
    if(!commit(record))return {ok:false,error:'save_unconfirmed'};
    // The verified new record owns the choices. Keep the earlier phone page's
    // colour-only mirror without making a failed mirror lose the new choice.
    if(legacy.save(storage,{version:1,theme:selected.lastExplicit})){
      record.legacyTheme=selected.lastExplicit;commit(record);
    }
    reconcile(false);
    try{return response(read());}catch(error){return {ok:false,error:'save_unconfirmed'};}
  }
  function receive(input){
    var received=decode(input),state;if(!received)return false;
    try{state=read();}catch(error){return false;}
    if(!state.healthy)return false;
    if(received.revision===state.record.revision&&equal(received.settings,state.record.settings)){
      if(received.status===0){
        state.record.applied=encode(received.settings,received.revision);state.record.error=null;
        if(!commit(state.record)){watchMismatch=true;return false;}
        watchMismatch=false;
        stop();return true;
      }
      watchMismatch=true;
      state.record.applied=null;state.record.error='watch_save_unconfirmed';commit(state.record);return false;
    }
    if(received.hello){watchMismatch=true;pending(state.record);reconcile(false);}
    return false;
  }
  function handle(message,respond){
    try{
      if(typeof message==='string')message=JSON.parse(message);
      if(message.type==='getUiPreferences')respond(response(read()));
      else if(message.type==='saveUiPreferences')respond(save(message.settings));
      else if(message.type==='retryUiPreferences'){
        if(!reconcile(true)){respond({ok:false,error:'save_unconfirmed'});return;}
        respond(response(read()));
      }else respond({ok:false,error:'unknown_request'});
    }catch(error){respond({ok:false,error:'save_unconfirmed'});}
  }
  function legacyChanged(chosen){
    try{
      if(storage.getItem(KEY)===null)return false;
      var state=read();if(!state.healthy)return false;
      var selected=state.record.settings;selected.appearance=chosen.theme;selected.lastExplicit=chosen.theme;
      return save(selected).ok;
    }catch(error){return false;}
  }
  return {handle:handle,receive:receive,reconcile:reconcile,legacyChanged:legacyChanged,stop:function(){closed=true;++generation;stop();}};
}
module.exports={key:KEY,normalize:normalize,encode:encode,decode:decode,isRequest:isRequest,create:create};
