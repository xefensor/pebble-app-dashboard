'use strict';

// Design prototype only. All data is fictional; no Pebble SDK, phone API or
// command dispatcher is connected. Rendering happens only after user input.
(function () {
  const W=200,H=228,layouts=Array.from(document.querySelectorAll('.watch'),watch=>watch.dataset.layout);
  const scenes={
    'timer-media':{activities:[
      {id:'activity-0',kind:'timer',name:'Tea',value:'02:31',caption:'Timer',openApp:{id:'timer',name:'Timer'}},
      {id:'activity-1',kind:'media',title:'Night Drive',artist:'The Midnight',caption:'Music',openApp:{id:'music',name:'Music'}}],
      notification:{id:'notification',kind:'notification',sender:'Sam',app:'Signal',age:'2m',body:'At the entrance.'}},
    'workout-navigation':{activities:[
      {id:'activity-0',kind:'workout',name:'Evening run',value:'6.2 km',caption:'Workout',openApp:{id:'workout',name:'Workout'}},
      {id:'activity-1',kind:'navigation',name:'Oak Street',value:'200 m',caption:'Directions',openApp:{id:'directions',name:'Directions'}}],
      notification:{id:'notification',kind:'notification',sender:'Sam',app:'Signal',age:'2m',body:'Meet at the bridge.'}},
    long:{activities:[
      {id:'activity-0',kind:'timer',name:'Overnight timer',value:'12:34:56',caption:'Timer',openApp:{id:'timer',name:'Timer'}},
      {id:'activity-1',kind:'media',title:'Better Than the Cyberpunk We Got',artist:'The Midnight',caption:'Music',openApp:{id:'music',name:'Music'}}],
      notification:{id:'notification',kind:'notification',sender:'Alexandra',app:'Signal',age:'2m',body:'Can you bring the blue bag to the entrance?'}},
    quiet:{activities:[],notification:null}
  };
  const state={scenario:'timer-media',theme:'light',messagePreview:true,lightOn:true,extraLights:{desk:false,hall:true},playing:true,track:0,swapped:false,active:'snapshot'};
  const views={};
  const tracks=['Night Drive','Sunset','Lost Boy'];
  const status=document.getElementById('status');
  let context,drawLog,gesture=null;
  const groupNames={activities:'Activities',pinned:'Pinned'};

  function announce(message){status.textContent=message;}
  function colors(){return state.theme==='dark'?{bg:'#000000',ink:'#FFFFFF',muted:'#AAAAAA',line:'#555555',accent:'#55AAFF'}:
    {bg:'#FFFFFF',ink:'#000000',muted:'#555555',line:'#AAAAAA',accent:'#55AAFF'};}
  function font(size,clock=false){return '700 '+size+'px "'+(clock?'Fredoka Watch':'Roboto Watch')+'"';}
  function measure(value,size,clock=false){context.font=font(size,clock);return context.measureText(value).width;}
  function fit(value,width,size,clock=false){
    const source=String(value||'');if(measure(source,size,clock)<=width)return source;
    const points=Array.from(source);while(points.length&&measure(points.join('')+'…',size,clock)>width)points.pop();
    return points.length?points.join('')+'…':measure('…',size,clock)<=width?'…':'';
  }
  function text(value,x,y,size,color,width=188,align='left',clock=false){
    const source=String(value===undefined?'':value),shown=fit(source,width,size,clock);
    context.font=font(size,clock);context.textAlign=align;context.textBaseline='alphabetic';context.fillStyle=color;
    const metrics=context.measureText(shown),left=align==='right'?x-metrics.width:align==='center'?x-metrics.width/2:x;
    context.fillText(shown,x,y);
    const bounds={x:left,y:y-metrics.actualBoundingBoxAscent,width:metrics.width,height:metrics.actualBoundingBoxAscent+metrics.actualBoundingBoxDescent};
    drawLog.text.push({source,shown,size,bounds});
    if(bounds.x<-.1||bounds.y<-.1||bounds.x+bounds.width>W+.1||bounds.y+bounds.height>H+.1)
      drawLog.boundsViolations.push({source,shown,bounds});
    return metrics.width;
  }
  function number(value,x,y,size,color,width=184,align='center'){
    const clock=/^[0-9:.,°CF%+−-]+$/.test(value);
    while(size>18&&measure(value,size,clock)>width)size--;
    return text(value,x,y,size,color,width,align,clock);
  }
  function wrapLines(value,size,width,maxLines){
    const words=String(value).split(/\s+/),lines=[];let line='';
    for(let i=0;i<words.length;i++){
      const next=line?line+' '+words[i]:words[i];
      if(measure(next,size)<=width){line=next;continue;}
      if(line){lines.push(line);line='';}
      if(lines.length===maxLines-1){line=words.slice(i).join(' ');break;}
      if(measure(words[i],size)>width){lines.push(fit(words[i],width,size));}else line=words[i];
      if(lines.length>=maxLines){line='';break;}
    }
    if(line&&lines.length<maxLines)lines.push(line);
    return lines;
  }
  function wrapped(value,x,baseline,size,color,width,maxLines,lineHeight){
    const lines=wrapLines(value,size,width,maxLines);
    lines.forEach((value,i)=>text(value,x,baseline+i*lineHeight,size,color,width));
    return lines.length;
  }
  function rect(x,y,w,h,fill,r=0){
    context.fillStyle=fill;context.beginPath();context.roundRect(x,y,w,h,r);context.fill();
  }
  function line(x,y,x2,y2,color,width=1){context.strokeStyle=color;context.lineWidth=width;context.beginPath();context.moveTo(x,y);context.lineTo(x2,y2);context.stroke();}
  function ring(x,y,w,h,color,r=4){context.strokeStyle=color;context.lineWidth=1;context.beginPath();context.roundRect(x+.5,y+.5,w-1,h-1,r);context.stroke();}
  function panel(id,x,y,w,h,outline=false){
    const c=colors(),selected=views[drawLog.layout].selectedId===id;
    if(selected)rect(x,y,w,h,c.ink,4);else if(outline)ring(x,y,w,h,c.line);
    drawLog.regions.push({id,x,y,width:w,height:h,selected});
    return {ink:selected?c.bg:c.ink,muted:selected?(state.theme==='dark'?'#555555':'#AAAAAA'):c.muted,accent:selected?c.bg:c.accent,bg:selected?c.ink:c.bg};
  }
  function icon(kind,x,y,size,color){
    context.save();context.translate(x,y);context.scale(size/20,size/20);context.strokeStyle=color;context.fillStyle=color;context.lineWidth=1.7;context.lineCap='round';context.lineJoin='round';
    function path(points){context.beginPath();points.forEach((p,i)=>i?context.lineTo(p[0],p[1]):context.moveTo(p[0],p[1]));context.stroke();}
    function circle(cx,cy,r,fill=false){context.beginPath();context.arc(cx,cy,r,0,Math.PI*2);fill?context.fill():context.stroke();}
    if(kind==='timer'){path([[4,2],[16,2],[16,5],[5,15],[5,18],[16,18]]);path([[5,2],[5,5],[16,15],[16,18]]);path([[4,18],[17,18]]);path([[7,16],[10,13],[13,16]]);}
    else if(kind==='media'){path([[7,14],[7,5],[16,3],[16,12]]);path([[7,8],[16,6]]);circle(4.5,14.5,2.5,true);circle(13.5,12.5,2.5,true);}
    else if(kind==='workout'){circle(12,3,2,true);path([[5,9],[9,6],[13,10],[17,10]]);path([[10,7],[8,13],[12,16],[10,19]]);path([[8,13],[4,16],[1,16]]);}
    else if(kind==='navigation'){path([[3,17],[3,8],[14,8]]);path([[10,3],[15,8],[10,13]]);}
    else if(kind==='notification'){path([[3,3],[17,3],[17,14],[9,14],[4,18],[4,14],[3,14],[3,3]]);path([[6,7],[14,7]]);path([[6,10],[11,10]]);}
    else if(kind==='weather'){circle(7,6,3);path([[7,0],[7,1]]);path([[0,6],[1,6]]);path([[2,1],[3,2]]);context.beginPath();context.arc(8,13,4,Math.PI,0);context.arc(13,11,4,Math.PI,0);context.arc(17,14,3,-Math.PI/2,Math.PI/2);context.lineTo(5,17);context.arc(5,14,3,Math.PI/2,Math.PI*1.5);context.stroke();}
    else if(kind==='phone'||kind==='find'){context.strokeRect(5,2,10,16);path([[9,15],[11,15]]);if(kind==='find'){path([[1,4],[0,8],[1,12]]);path([[19,4],[20,8],[19,12]]);}}
    else if(kind==='light'){circle(10,7,5);path([[6,11],[7,15],[13,15],[14,11]]);path([[8,18],[12,18]]);}
    else if(kind==='download'){path([[10,2],[10,13]]);path([[5,9],[10,14],[15,9]]);path([[3,14],[3,18],[17,18],[17,14]]);}
    else if(kind==='delivery'){context.strokeRect(2,5,16,13);path([[2,5],[10,1],[18,5]]);path([[10,5],[10,11]]);}
    else if(kind==='battery'){context.strokeRect(2,5,15,10);context.fillRect(18,8,2,4);context.fillRect(5,8,8,4);}
    else if(kind==='humidity'){context.beginPath();context.moveTo(10,1);context.bezierCurveTo(4,8,2,10,4,15);context.bezierCurveTo(7,21,17,18,17,12);context.bezierCurveTo(17,9,14,6,10,1);context.stroke();}
    else if(kind==='calendar'){context.strokeRect(2,4,16,14);path([[2,8],[18,8]]);path([[6,1],[6,6]]);path([[14,1],[14,6]]);}
    else if(kind==='sunrise'){path([[1,15],[19,15]]);context.beginPath();context.arc(10,15,5,Math.PI,Math.PI*2);context.stroke();path([[10,1],[10,5]]);path([[3,6],[5,8]]);path([[17,6],[15,8]]);}
    else if(kind==='scene'){path([[10,1],[12,7],[19,10],[12,12],[10,19],[8,12],[1,10],[8,7],[10,1]]);}
    else if(kind==='play'){context.beginPath();context.moveTo(6,3);context.lineTo(17,10);context.lineTo(6,17);context.closePath();context.fill();}
    else if(kind==='pause'){context.fillRect(5,3,4,14);context.fillRect(12,3,4,14);}
    else if(kind==='previous'||kind==='next'){context.translate(kind==='previous'?20:0,0);context.scale(kind==='previous'?-1:1,1);context.beginPath();context.moveTo(3,4);context.lineTo(13,10);context.lineTo(3,16);context.closePath();context.fill();context.fillRect(15,4,2,12);}
    context.restore();
  }
  function artwork(x,y,size){
    rect(x,y,size,size,'#005555');rect(x,y,size*.34,size,'#55AAAA');rect(x+size*.34,y+size*.50,size*.66,size*.50,'#000055');
    context.fillStyle='#FFAA55';context.beginPath();context.arc(x+size*.68,y+size*.37,size*.18,0,Math.PI*2);context.fill();
    rect(x,y+size*.76,size,size*.06,'#AAAAFF');
  }
  function scene(){
    const s=JSON.parse(JSON.stringify(scenes[state.scenario]));
    s.activities.forEach(a=>{if(a.kind==='media'&&state.scenario!=='long')a.title=tracks[state.track%tracks.length];});
    if(state.swapped)s.activities.reverse();
    // A latest-notification card must not duplicate the same source occurrence
    // if it is already among the visible activities.
    if(s.notification&&s.activities.some(a=>a.occurrence&&a.occurrence===s.notification.occurrence))s.notification=null;
    return s;
  }
  function items(){
    const s=scene(),weather={id:'pin-weather',kind:'weather',name:'Weather',value:'13°C',openApp:{id:'weather',name:'Weather'}},phone={id:'pin-phone',kind:'phone',name:'Phone',value:'76%'};
    const light={id:'control-light',kind:'light',name:'Kitchen light',value:state.lightOn?'65%':'Off',action:{kind:'toggle',label:'Toggle'}},
      find={id:'control-find',kind:'find',name:'Find phone',action:{kind:'ring',label:'Ring'}};
    const activities=s.activities.length?[...s.activities,
      {id:'activity-2',kind:'navigation',name:'Oak Street',value:'200 m',caption:'Directions',openApp:{id:'directions',name:'Directions'}},
      {id:'activity-3',kind:'workout',name:'Walk',value:'1.4 km',caption:'Workout',openApp:{id:'workout',name:'Workout'}},
      {id:'activity-4',kind:'download',name:'Podcast',value:'42%',caption:'Download',openApp:{id:'podcasts',name:'Podcasts'}},
      {id:'activity-5',kind:'delivery',name:'Delivery',value:'18 min',caption:'Delivery'}]:[];
    // A pin may expose a value, a press action, or both. Its icon describes the
    // source; it does not decide whether the item is actionable.
    const pinned=[weather,light,phone,find,
      {id:'pin-watch',kind:'battery',name:'Watch',value:'85%'},
      {id:'control-desk',kind:'light',name:'Desk light',value:state.extraLights.desk?'40%':'Off',action:{kind:'toggle',label:'Toggle'}},
      {id:'pin-humidity',kind:'humidity',name:'Humidity',value:'42%'},
      {id:'control-hall',kind:'light',name:'Hall light',value:state.extraLights.hall?'80%':'Off',action:{kind:'toggle',label:'Toggle'}},
      {id:'pin-calendar',kind:'calendar',name:'Next event',value:'15:30'},
      {id:'control-evening',kind:'scene',name:'Evening scene',action:{kind:'run',label:'Run'}},
      {id:'pin-sunrise',kind:'sunrise',name:'Sunrise',value:'06:58'},
      {id:'control-reading',kind:'scene',name:'Reading scene',action:{kind:'run',label:'Run'}}];
    return {activities:s.activities,notification:s.notification,pinned:pinned.slice(0,4),groups:{activities,pinned},
      ordered:[...s.activities,...(s.notification?[s.notification]:[]),...pinned.slice(0,4)],
      listed:[...s.activities,...(s.notification?[s.notification]:[]),...pinned.slice(0,4)]};
  }
  function entries(layout){const data=items(),section=views[layout]&&views[layout].section;return section?data.groups[section]:layout==='list'?data.listed:data.ordered;}
  function selected(layout){return entries(layout).find(item=>item.id===views[layout].selectedId);}
  function groupFor(entry){return !entry?null:entry.id.startsWith('activity-')?'activities':entry.id.startsWith('pin-')||entry.id.startsWith('control-')?'pinned':null;}
  function associatedApp(entry){return !entry?null:entry.kind==='notification'?{id:'notifications',name:'Notifications'}:entry.openApp||null;}
  function hasControls(entry){return entry&&entry.kind==='media';}
  function header(label='Dashboard',trailing='13:42'){const c=colors();text(label,8,15,16,c.ink,132);text(trailing,192,15,14,c.muted,47,'right');line(6,19.5,194,19.5,c.line);}
  function footer(layout,detail=false){
    const c=colors(),view=views[layout],entry=selected(layout);
    line(6,203.5,194,203.5,c.line);
    let action=entry&&entry.action?entry.action.label:hasControls(entry)?'Controls':'—';
    if(detail)action=view.detailFocus===1?(state.playing?'Pause':'Play'):view.detailFocus===0?'Previous':'Next';
    if(entry&&entry.kind==='notification')action='Notifications';
    text('Select: '+action,8,214,12,c.muted,118);
    const app=associatedApp(entry);
    if(app)text('Hold: '+app.name,192,214,12,c.muted,76,'right');
    text(view.mode==='overview'?'Hold Up: Activities · Down: Pinned':view.mode==='section'?'Hold Up / Down to scroll':'Up / Down: choose control',100,226,11,c.muted,188,'center');
  }
  function activityRow(a,y,h=36){
    const p=panel(a.id,4,y+2,192,h-4),baseline=y+25;
    if(a.kind==='media'){
      artwork(9,y+6,24);text(a.title,40,y+16,16,p.ink,148);text(a.artist,40,y+31,14,p.muted,148);
    }else{
      icon(a.kind,9,y+8,20,p.accent);
      let valueSize=a.kind==='timer'?26:23;const clock=a.kind==='timer';
      const width=measure(a.value,valueSize,clock),room=192-width-40;
      if(room>=34)text(a.name,36,baseline-1,16,p.ink,room);
      else valueSize=a.kind==='timer'?24:valueSize;
      number(a.value,190,baseline,valueSize,p.ink,room>=34?127:156,'right');
    }
  }
  function notification(n,y,h=42){
    const p=panel(n.id,4,y,192,h,true);icon('notification',10,y+7,16,p.accent);
    text(n.sender,32,y+15,16,p.ink,85);text(n.app+' · '+n.age,190,y+15,12,p.muted,74,'right');
    text(state.messagePreview?n.body:'New message',10,y+34,16,p.ink,178);
  }
  function pinTile(item,x,y,w,h){
    const p=panel(item.id,x,y,w,h,true);
    if(item.value!==undefined){
      icon(item.kind,x+7,y+3,12,p.accent);text(item.name,x+25,y+12,11,p.muted,w-30);
      number(item.value,x+8,y+h-4,h<38?20:23,p.ink,w-16,'left');
    }else{
      icon(item.kind,x+6,y+(h-15)/2,15,p.accent);text(item.name,x+25,y+h/2+5,14,p.ink,w-30);
    }
  }
  function pinCompact(item,x,y,w,h){
    const p=panel(item.id,x,y,w,h,true);icon(item.kind,x+7,y+(h-15)/2,15,p.accent);
    if(item.value!==undefined)number(item.value,x+w-7,y+h-5,19,p.ink,w-30,'right');
    else text(item.name,x+26,y+h/2+5,14,p.ink,w-31);
  }
  function emptyActivities(y){const c=colors();icon('timer',88,y,24,c.muted);text('No live activities',100,y+43,18,c.ink,184,'center');}
  function snapshot(layout){
    const data=items();header();
    if(!data.activities.length){
      emptyActivities(35);text('Your favourites are ready',100,99,14,colors().muted,184,'center');
      data.pinned.forEach((item,i)=>pinTile(item,4+(i%2)*98,108+Math.floor(i/2)*48,94,44));
    }else{
      data.activities.slice(0,2).forEach((a,i)=>activityRow(a,20+i*36));
      if(data.notification)notification(data.notification,92,38);
      data.pinned.forEach((item,i)=>pinTile(item,4+(i%2)*98,134+Math.floor(i/2)*35,94,32));
    }
    footer(layout);
  }
  function focus(layout){
    const data=items();header();
    if(!data.activities.length){snapshot(layout);return;}
    const main=data.activities[0],p=panel(main.id,4,23,192,57);
    if(main.kind==='media'){
      const lines=wrapLines(main.title,20,180,2);
      lines.forEach((value,i)=>text(value,10,59-(lines.length-1-i)*22,20,p.ink,180));
      artwork(10,64,16);text(main.artist,33,77,14,p.muted,155);
    }else{
      number(main.value,100,60,43,p.ink,180);
      const nameWidth=measure(main.name,14);icon(main.kind,(200-nameWidth-23)/2,64,15,p.accent);text(main.name,(200-nameWidth+23)/2,77,14,p.muted,160);
    }
    if(data.activities[1])activityRow(data.activities[1],82,36);
    if(data.notification)notification(data.notification,121,38);
    data.pinned.forEach((item,i)=>pinCompact(item,4+(i%2)*98,161+Math.floor(i/2)*21,94,20));
    footer(layout);
  }
  function listRow(item,y){
    if(item.id.startsWith('activity-')){activityRow(item,y,36);return;}
    const p=panel(item.id,4,y+2,188,32);
    icon(item.kind,10,y+9,18,p.accent);
    if(item.kind==='notification'){
      text(item.sender+' · '+item.app,37,y+15,14,p.muted,146);text(state.messagePreview?item.body:'New message',37,y+31,16,p.ink,148);
    }else if(item.value!==undefined){
      const valueWidth=Math.min(69,measure(item.value,24,/^[0-9:.,°CF%+−-]+$/.test(item.value)));
      text(item.name,37,y+24,16,p.ink,140-valueWidth);number(item.value,185,y+26,24,p.ink,69,'right');
    }else{text(item.name,37,y+24,18,p.ink,146);}
  }
  function list(layout){
    const view=views[layout],data=entries(layout);
    const selectedIndex=Math.max(0,data.findIndex(item=>item.id===view.selectedId));
    header(view.section?groupNames[view.section]:'Dashboard',view.section?(data.length?selectedIndex+1:0)+'/'+data.length:'13:42');
    if(!data.length){emptyActivities(71);view.visibleIds=[];footer(layout);return;}
    const first=Math.min(Math.max(0,selectedIndex-3),Math.max(0,data.length-5));
    view.visibleIds=data.slice(first,first+5).map(item=>item.id);
    data.slice(first,first+5).forEach((item,i)=>listRow(item,23+i*36));
    if(data.length>5){const c=colors(),thumb=168*5/data.length;rect(197,27,2,168,c.line);rect(197,27+first/(data.length-5)*(168-thumb),2,thumb,c.ink);}
    footer(layout);
  }
  function detail(layout){
    const view=views[layout],entry=selected(layout),c=colors();if(!entry){view.mode='overview';return;}
    if(hasControls(entry)){
      header('Music');
      const lines=wrapLines(entry.title,24,182,2);
      lines.forEach((value,i)=>text(value,9,91-(lines.length-1-i)*26,24,c.ink,182));
      artwork(9,104,40);text(entry.artist,58,119,17,c.ink,132);text(state.playing?'Playing':'Paused',58,139,14,c.muted,132);
      ['previous',state.playing?'pause':'play','next'].forEach((kind,i)=>{
        const active=view.detailFocus===i,x=5+i*65;rect(x,163,60,37,active?c.ink:c.bg,5);if(!active)ring(x,163,60,37,c.line,5);
        icon(kind,x+20,171,20,active?c.bg:c.ink);
      });
    }
    footer(layout,true);
  }
  function quantize(){
    const pixels=context.getImageData(0,0,W,H),data=pixels.data;
    for(let i=0;i<data.length;i+=4){data[i]=Math.round(data[i]/85)*85;data[i+1]=Math.round(data[i+1]/85)*85;data[i+2]=Math.round(data[i+2]/85)*85;data[i+3]=255;}
    context.putImageData(pixels,0,0);
  }
  function render(layout){
    const view=views[layout],data=entries(layout);
    if(!data.some(item=>item.id===view.selectedId))view.selectedId=data.length?data[0].id:null;
    context=view.canvas.getContext('2d',{willReadFrequently:true});context.fontKerning='none';drawLog={layout,text:[],regions:[],boundsViolations:[]};
    rect(0,0,W,H,colors().bg);view.visibleIds=view.mode==='detail'?[view.selectedId]:data.map(item=>item.id);
    if(view.mode==='detail')detail(layout);else if(view.mode==='section')list(layout);else ({snapshot,focus,list})[layout](layout);
    quantize();view.log=drawLog;
    const entry=selected(layout);view.canvas.setAttribute('aria-label',layout+' '+view.mode+': '+(entry?(entry.name||entry.title||entry.sender):'No live activities'));
    const watch=view.canvas.closest('.watch');
    for(const key of ['up','down']){
      const hold=view.mode==='overview'?'open all '+(key==='up'?'Activities':'Pinned items'):view.mode==='section'?'scroll '+key:'move within Music controls';
      watch.querySelector('[data-key="'+key+'"]').setAttribute('aria-label',layout+': tap '+key+' to move; hold to '+hold);
    }
  }
  function renderAll(){layouts.forEach(render);}
  function cancelGesture(){if(gesture)clearTimeout(gesture.timer);gesture=null;}
  function frame(view){return {mode:view.mode,section:view.section,selectedId:view.selectedId,detailFocus:view.detailFocus};}
  function remember(view){view.stack.push(frame(view));}
  function goBack(layout){
    const view=views[layout],previous=view.stack.pop();
    if(previous)Object.assign(view,previous);else{view.mode='overview';view.section=null;}
    render(layout);announce('Back to '+(view.section?groupNames[view.section]:layout+' overview')+'.');
  }
  function reset(){
    cancelGesture();layouts.forEach(layout=>{
      Object.assign(views[layout],{mode:'overview',section:null,stack:[],detailFocus:1,lastNavigation:null,actionCount:0});
      views[layout].selectedId=entries(layout)[0].id;
    });renderAll();
  }
  function openSection(layout,section){
    const view=views[layout],data=items().groups[section];
    if(view.mode==='section'&&view.section===section)return;
    const selectedId=data.some(item=>item.id===view.selectedId)?view.selectedId:data.length?data[0].id:null;
    // Switching collections replaces the current list. Opening a collection
    // from an overview or useful controls view retains that exact return frame.
    if(view.mode!=='section')remember(view);
    Object.assign(view,{mode:'section',section,selectedId,detailFocus:1});render(layout);
    announce(groupNames[section]+': '+data.length+' entries. Up / Down to browse; Back returns to the previous screen.');
  }
  function openAssociatedApp(layout){
    const view=views[layout],app=associatedApp(selected(layout));
    if(!app)return;
    view.lastNavigation=app.id;
    announce('Preview: open '+app.name+'. Associated-app navigation intent only; no real app is launched.');
  }
  function press(layout,key){
    if(!key.startsWith('hold'))cancelGesture();
    const view=views[layout];state.active=layout;
    if(key==='back'){goBack(layout);return;}
    if(key==='hold'){openAssociatedApp(layout);return;}
    if(key==='hold-up'||key==='hold-down'){
      if(view.mode==='overview'){openSection(layout,key==='hold-up'?'activities':'pinned');return;}
      key=key==='hold-up'?'up':'down';
    }
    if(key==='up'||key==='down'){
      const delta=key==='down'?1:-1;
      if(view.mode==='detail'){
        if(hasControls(selected(layout)))view.detailFocus=Math.max(0,Math.min(2,view.detailFocus+delta));
      }else{
        const data=entries(layout),index=data.findIndex(item=>item.id===view.selectedId);
        if(data.length)view.selectedId=data[Math.min(data.length-1,Math.max(0,index+delta))].id;
      }
      render(layout);const entry=selected(layout);if(entry)announce('Selected '+(entry.name||entry.title||entry.sender)+'.');return;
    }
    if(key!=='select')return;
    const entry=selected(layout);if(!entry)return;
    if(view.mode==='detail'){
      if(hasControls(entry)){
        view.actionCount++;
        if(view.detailFocus===1)state.playing=!state.playing;
        else state.track=(state.track+(view.detailFocus===0?-1:1)+tracks.length)%tracks.length;
        renderAll();announce('Simulated music control. No phone command sent.');
      }
    }else if(entry.action){
      view.actionCount++;
      if(entry.id==='control-light')state.lightOn=!state.lightOn;
      else if(entry.id==='control-desk')state.extraLights.desk=!state.extraLights.desk;
      else if(entry.id==='control-hall')state.extraLights.hall=!state.extraLights.hall;
      renderAll();announce('Simulated '+entry.name+' action. No phone command sent.');
    }else if(entry.kind==='notification'){
      view.lastNavigation='notifications';
      announce('Preview: the native Notifications app would open. The preview records the destination and stays on this screen.');
    }else if(hasControls(entry)){
      remember(view);view.mode='detail';view.detailFocus=1;render(layout);announce('Opened music controls.');
    }
  }
  function sameTarget(pending){return JSON.stringify(frame(views[pending.layout]))===pending.target;}
  function startGesture(layout,source,key){
    if(gesture)return;
    const pending={layout,source,key,target:JSON.stringify(frame(views[layout])),fired:false};
    gesture=pending;
    const held=()=>{
      if(gesture!==pending)return;
      pending.fired=true;
      if(!sameTarget(pending))return;
      const wasOverview=views[layout].mode==='overview',before=pending.target;
      press(layout,pending.key==='select'?'hold':'hold-'+pending.key);
      // Collections use conventional hold-to-scroll. Keep the target in sync
      // only after this gesture's own navigation, and stop at either boundary.
      const after=JSON.stringify(frame(views[layout]));
      if(gesture===pending&&pending.key!=='select'&&!wasOverview&&after!==before){
        pending.target=after;pending.timer=setTimeout(held,140);
      }
    };
    pending.timer=setTimeout(held,600);
  }
  function releaseGesture(source){
    const pending=gesture;if(!pending||pending.source!==source)return;
    const tap=!pending.fired&&sameTarget(pending);cancelGesture();
    if(tap)press(pending.layout,pending.key);
  }
  document.querySelectorAll('.watch').forEach(watch=>{
    const layout=watch.dataset.layout,canvas=watch.querySelector('canvas');canvas.dataset.layout=layout;
    views[layout]={canvas,selectedId:'activity-0',mode:'overview',section:null,stack:[],detailFocus:1,visibleIds:[],lastNavigation:null,actionCount:0};
    watch.addEventListener('focusin',()=>state.active=layout);
    watch.querySelectorAll('button').forEach(button=>{
      if(button.dataset.key==='back'){button.addEventListener('click',()=>press(layout,'back'));return;}
      button.addEventListener('pointerdown',event=>{
        if(event.button!==0)return;
        button.setPointerCapture(event.pointerId);startGesture(layout,'pointer-'+event.pointerId,button.dataset.key);
      });
      button.addEventListener('pointerup',event=>releaseGesture('pointer-'+event.pointerId));
      button.addEventListener('pointercancel',cancelGesture);
      button.addEventListener('lostpointercapture',cancelGesture);
      // Real pointer clicks were handled on release. Keep assistive synthetic
      // activation available without allowing a hold to also execute a tap.
      button.addEventListener('click',event=>{if(event.detail===0)press(layout,button.dataset.key);});
    });
    canvas.addEventListener('click',()=>{state.active=layout;canvas.focus();});
  });
  document.addEventListener('keydown',event=>{
    const watch=event.target.closest&&event.target.closest('.watch');if(!watch)return;
    const gestureKey=event.key==='Enter'||event.code==='Space'?'select':event.key==='ArrowUp'?'up':event.key==='ArrowDown'?'down':null;
    if(gestureKey){
      event.preventDefault();if(!event.repeat)startGesture(watch.dataset.layout,'key-'+event.code,gestureKey);return;
    }
    const key={Escape:'back',Backspace:'back',h:'hold',H:'hold',w:'hold-up',W:'hold-up',s:'hold-down',S:'hold-down'}[event.key];
    if(key){event.preventDefault();cancelGesture();press(watch.dataset.layout,key);}
  });
  document.addEventListener('keyup',event=>{
    if(event.key==='Enter'||event.code==='Space'||event.key==='ArrowUp'||event.key==='ArrowDown'){
      if(gesture&&gesture.source==='key-'+event.code){event.preventDefault();releaseGesture('key-'+event.code);}
    }
  });
  window.addEventListener('blur',cancelGesture);
  const api={layouts,
    setScenario(key){if(!scenes[key])throw Error('Unknown scenario');state.scenario=key;state.track=0;state.playing=true;state.swapped=false;document.getElementById('scenario').value=key;document.getElementById('swap').disabled=scenes[key].activities.length<2;reset();},
    swapActivities(){state.swapped=!state.swapped;renderAll();},
    setTheme(theme){state.theme=theme==='dark'?'dark':'light';const button=document.getElementById('theme');button.setAttribute('aria-pressed',String(state.theme==='dark'));button.textContent=state.theme==='dark'?'Light screens':'Dark screens';renderAll();},
    setMessagePreview(enabled){state.messagePreview=!!enabled;document.getElementById('message-preview').checked=state.messagePreview;renderAll();},
    reset,press,
    select(layout,id){
      cancelGesture();const view=views[layout],data=items(),overview=layout==='list'?data.listed:data.ordered;
      if(!overview.some(item=>item.id===id))throw Error('Missing overview item '+id);
      Object.assign(view,{selectedId:id,mode:'overview',section:null,stack:[],lastNavigation:null});render(layout);
    },
    snapshot(layout){return views[layout].canvas.toDataURL('image/png');},
    inspect(){return {theme:state.theme,scenario:state.scenario,swapped:state.swapped,messagePreview:state.messagePreview,layouts:Object.fromEntries(layouts.map(layout=>[layout,{mode:views[layout].mode,section:views[layout].section,sectionCounts:Object.fromEntries(Object.entries(items().groups).map(([key,values])=>[key,values.length])),returnDepth:views[layout].stack.length,lastNavigation:views[layout].lastNavigation,actionCount:views[layout].actionCount,selectedId:views[layout].selectedId,visibleIds:views[layout].visibleIds,boundsViolations:views[layout].log.boundsViolations,text:views[layout].log.text,regions:views[layout].log.regions}]))};}
  };
  api.ready=Promise.all([document.fonts.load('700 16px "Roboto Watch"'),document.fonts.load('700 32px "Fredoka Watch"')]).then(()=>{
    reset();announce('Ready. Select uses available controls. Hold Select opens the associated app. Hold Up for Activities; hold Down for Pinned.');return true;
  });
  window.dashboardPreview=api;
  document.getElementById('scenario').addEventListener('change',event=>api.setScenario(event.target.value));
  document.getElementById('theme').addEventListener('click',()=>api.setTheme(state.theme==='light'?'dark':'light'));
  document.getElementById('message-preview').addEventListener('change',event=>api.setMessagePreview(event.target.checked));
  document.getElementById('actual-size').addEventListener('change',event=>document.body.classList.toggle('actual-size',event.target.checked));
  document.getElementById('reset').addEventListener('click',()=>{api.reset();announce('Quick-launch overview restored.');});
  document.getElementById('swap').addEventListener('click',()=>api.swapActivities());
})();
