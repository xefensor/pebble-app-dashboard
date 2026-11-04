'use strict';

// Dashboard owns this bounded viewport protocol. It does not change ACT3.
var keys={DB_OPERATION:4000,DB_SESSION:4001,DB_REQUEST:4002,DB_MODE:4003,DB_OFFSET:4004,
  DB_TOKEN:4005,DB_VERSION:4006,DB_ACTION:4007,DB_DATA:4008,DB_RESULT:4009,
  DB_TEXT:4010,DB_CONFIRM:4011,DB_INDEX:4012};
var op={HELLO:1,VIEW:2,ACTION:3,OPEN:4,CANCEL:5,READY:6,FOCUS:7};
var mode={OVERVIEW:0,ACTIVITIES:1,PINNED:2,MEDIA:3,DETAIL:3};
var status={LOADING:0,READY:1,PARTIAL:2,OFFLINE:3,PERMISSION:4,ERROR:5};
var result={PENDING:1,SUCCESS:2,FAILED:3,STALE:4,PERMISSION:5,CANCELLED:6,CONFIRM:7};
var flag={ACTION:1,APP:2,MEDIA:4,PRIVATE:8,UNAVAILABLE:16,PAUSED:32,PENDING:64,
  FAILED:128,COUNTDOWN:256,ELAPSED:512,NOTIFICATION:1024,CONFIRM:2048,LOCAL_WATCH:4096,
  MEDIA_PREVIOUS:8192,MEDIA_TOGGLE:16384,MEDIA_NEXT:32768};
var kind={generic:0,timer:1,media:2,notification:3,weather:4,phone:5,light:6,find:7,
  workout:8,navigation:9,calendar:10,battery:11,scene:12};
var fields=['title','subtitle','value','appLabel','actionLabel','name'];
var limits=[192,128,48,32,32,64];
function integer(value,min,max){return typeof value==='number'&&isFinite(value)&&Math.floor(value)===value&&value>=min&&value<=max;}
function uint(value,max){if(!integer(value,0,max===undefined?4294967295:max))throw Error('Invalid protocol integer');return value;}
function utf8(value){
  var out=[],text=String(value===undefined||value===null?'':value);
  for(var i=0;i<text.length;i++){
    var c=text.charCodeAt(i);
    if(c>=0xd800&&c<=0xdbff){var low=text.charCodeAt(i+1);if(low>=0xdc00&&low<=0xdfff){c=65536+((c-0xd800)<<10)+(low-0xdc00);i++;}else c=65533;}
    else if(c>=0xdc00&&c<=0xdfff)c=65533;
    if(c===0)c=65533;
    if(c<128)out.push(c);else if(c<2048)out.push(192|(c>>6),128|(c&63));
    else if(c<65536)out.push(224|(c>>12),128|((c>>6)&63),128|(c&63));
    else out.push(240|(c>>18),128|((c>>12)&63),128|((c>>6)&63),128|(c&63));
  }
  return out;
}
function text(value,max){
  var s=String(value===undefined||value===null?'':value),out='',used=0;
  for(var i=0;i<s.length;i++){
    var point=s.charAt(i),code=s.charCodeAt(i);
    if(code>=0xd800&&code<=0xdbff&&s.charCodeAt(i+1)>=0xdc00&&s.charCodeAt(i+1)<=0xdfff)point+=s.charAt(++i);
    var bytes=utf8(point);if(used+bytes.length>max)break;out+=point;used+=bytes.length;
  }
  return out;
}
function u16(out,value){uint(value,65535);out.push(value&255,(value>>>8)&255);}
function u32(out,value){uint(value);out.push(value&255,(value>>>8)&255,(value>>>16)&255,(value>>>24)&255);}
function picture(image){
  if(!image)return null;
  var w=image.width,h=image.height,p=image.palette,b=image.pixels;
  if(!integer(w,1,40)||!integer(h,1,40)||!Array.isArray(p)||!integer(p.length,1,16)||!Array.isArray(b)||b.length!==Math.ceil(w/2)*h)return null;
  if(p.some(function(v){return !integer(v,0,255);})||b.some(function(v){return !integer(v,0,255);}))return null;
  for(var y=0;y<h;y++)for(var x=0;x<w;x++){
    var pixel=b[y*Math.ceil(w/2)+(x>>1)],index=x%2?pixel&15:pixel>>4;
    if(index>=p.length)return null;
  }
  return {width:w,height:h,palette:p,pixels:b};
}
function encode(snapshot){
  if(!snapshot||!integer(snapshot.session,1,2147483647)||!integer(snapshot.request,1,2147483647)||
      !integer(snapshot.sequence,1,2147483647)||!integer(snapshot.mode,0,3)||!integer(snapshot.status,0,5)||
      !Array.isArray(snapshot.items))throw Error('Invalid Dashboard snapshot');
  var items=snapshot.items,maximum=snapshot.mode===mode.OVERVIEW?7:snapshot.mode===mode.MEDIA?1:5;
  if(items.length>maximum)throw Error('Too many viewport items');
  var total=uint(snapshot.total,65535),offset=uint(snapshot.offset||0,65535);
  if(offset>total||items.length>total-offset)throw Error('Invalid viewport range');
  var out=[68,83,72,49],imageBudget=2048,seen={},roles=[0,0,0];
  u32(out,snapshot.session);u32(out,snapshot.request);u32(out,snapshot.sequence);u32(out,snapshot.now);
  out.push(snapshot.mode,snapshot.status,items.length,snapshot.dark?1:0);
  u16(out,total);u16(out,offset);u16(out,snapshot.activitiesTotal||0);u16(out,snapshot.pinsTotal||0);
  items.forEach(function(item){
    if(!item||!integer(item.token,1,2147483647)||!integer(item.version,1,2147483647)||seen[item.token])throw Error('Invalid item identity');
    seen[item.token]=true;
    var strings=fields.map(function(field,index){
      var bytes=utf8(item[field]);if(bytes.length>limits[index])throw Error('Oversized '+field);return bytes;
    });
    var role=uint(item.role||0,2),flags=uint(item.flags||0,65535),clock=uint(item.clockMode||0,2);
    roles[role]++;
    if((snapshot.mode===mode.PINNED&&role!==2)||((snapshot.mode===mode.ACTIVITIES||snapshot.mode===mode.MEDIA)&&role!==0))throw Error('Invalid item role');
    if(snapshot.mode===mode.MEDIA&&!(flags&flag.ACTION))throw Error('Detail without controls');
    if(!item.validUntil&&!(flags&(flag.ACTION|flag.APP|flag.LOCAL_WATCH))&&!(role===2&&!(flags&flag.PRIVATE)&&!strings[2].length&&!clock))throw Error('Unleased source value');
    if(clock===1&&!(flags&flag.COUNTDOWN)||clock===2&&!(flags&flag.ELAPSED)||!clock&&(item.anchor||item.baseSeconds))throw Error('Invalid clock flags');
    var controls=[];
    if(item.controls){
      if(!Array.isArray(item.controls)||item.controls.length!==3)throw Error('Invalid controls');
      item.controls.forEach(function(label){var b=utf8(label);if(b.length>32)throw Error('Oversized control label');controls.push(b.length);Array.prototype.push.apply(controls,b);});
    }
    var image=picture(item.image),cost=image?image.palette.length+image.pixels.length:0;
    if(cost>imageBudget)image=null;else imageBudget-=cost;
    u32(out,item.token);u32(out,item.version);u32(out,item.validUntil||0);u16(out,item.flags||0);
    out.push(uint(item.kind||0,12),uint(item.clockMode||0,2));u32(out,item.anchor||0);u32(out,item.baseSeconds||0);
    strings.forEach(function(bytes){u16(out,bytes.length);});
    out.push(image?image.width:0,image?image.height:0,image?image.palette.length:0,uint(item.role||0,2));
    u16(out,image?image.pixels.length:0);u16(out,controls.length);
    strings.forEach(function(bytes){Array.prototype.push.apply(out,bytes);});
    Array.prototype.push.apply(out,controls);
    if(image){Array.prototype.push.apply(out,image.palette);Array.prototype.push.apply(out,image.pixels);}
  });
  if(snapshot.mode===mode.OVERVIEW&&(roles[0]>2||roles[1]>1||roles[2]>4))throw Error('Invalid overview roles');
  if(out.length>8192)throw Error('Dashboard frame exceeds inbox limit');
  return out;
}
function get(dict,name){if(!dict)return undefined;return dict[name]===undefined?dict[keys[name]]:dict[name];}
module.exports={keys:keys,op:op,mode:mode,status:status,result:result,flag:flag,kind:kind,
  encode:encode,get:get,utf8:utf8,text:text,picture:picture,limits:limits,MAX_FRAME:8192};
