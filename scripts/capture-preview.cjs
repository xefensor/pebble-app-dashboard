#!/usr/bin/env node
'use strict';

// Capture the code-native Dashboard design study; this does not build a watchapp.
// Run: node scripts/capture-preview.cjs
// Plan: node scripts/capture-preview.cjs --plan
// Optional: --output DIRECTORY, --chromium /path/to/chromium
// Chromium uses an isolated temporary profile and closes when the script exits.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const {spawn} = require('node:child_process');
const {pathToFileURL} = require('node:url');

const root = path.resolve(__dirname, '..');
const layouts = ['snapshot', 'focus', 'list'];
const labels = {snapshot:'Snapshot', focus:'Activity focus', list:'Scrollable list'};
const scenarios = ['timer-media', 'workout-navigation', 'long', 'quiet'];
const argv = process.argv.slice(2);
const usage = 'Usage: node scripts/capture-preview.cjs [--plan] [--output DIRECTORY] [--chromium PATH]';
if (argv.includes('--help')) {console.log(usage); process.exit(0);}
let output = path.join(root, 'previews');
let chromium = process.env.CHROMIUM_BINARY || '/usr/bin/chromium';
let plan = false;
for (let i=0;i<argv.length;i++) {
  if (argv[i] === '--plan') plan=true;
  else if (argv[i] === '--output' && argv[i+1]) output=path.resolve(argv[++i]);
  else if (argv[i] === '--chromium' && argv[i+1]) chromium=argv[++i];
  else throw Error(usage);
}
if (plan) {
  console.log(JSON.stringify({entry:'previews/index.html', dimensions:[200,228], layouts, scenarios,
    output, contactSheets:['overview-light.png','overview-dark.png','alternate-activities.png','media-first.png','detail-overview.png',
      'expansion-overview.png','expansion-dark.png','expansion-navigation.png'],
    checks:['64-colour opaque pixels','bounded drawing','button and keyboard navigation','static idle frames','selected/detail captures',
      'six activities and twelve mixed pinned entries','value and optional action on the same pinned item','detail and section Back restoration','real pointer/keyboard hold suppresses tap','native notification handoff intent',
      'focused Snapshot page real hold and Back']},null,2));
  process.exit(0);
}

const sleep = ms => new Promise(resolve => setTimeout(resolve,ms));
const sha = data => crypto.createHash('sha256').update(data).digest('hex');
const imageBytes = url => {
  assert.match(url,/^data:image\/png;base64,/);
  const bytes=Buffer.from(url.slice(url.indexOf(',')+1),'base64');
  assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  return bytes;
};
function inputs(directory, prefix='') {
  const result={};
  for(const entry of fs.readdirSync(directory,{withFileTypes:true})) {
    const name=path.join(prefix,entry.name),full=path.join(directory,entry.name);
    if(entry.isDirectory() && entry.name!=='screens') Object.assign(result,inputs(full,name));
    else if(entry.isFile() && /\.(?:html|css|js|ttf|woff2?|txt)$/.test(entry.name)) result[name]=sha(fs.readFileSync(full));
  }
  return result;
}

let browser, socket, logFd, scratch;
let requestId=0;
const pending=new Map(), exceptions=[];
async function send(method,params={}) {
  const id=++requestId;
  return new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout: '+method));},15000);
    pending.set(id,{resolve:value=>{clearTimeout(timeout);resolve(value);},reject:error=>{clearTimeout(timeout);reject(error);}});
    socket.send(JSON.stringify({id,method,params}));
  });
}
async function evaluate(expression) {
  const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
  assert.equal(result.exceptionDetails,undefined,JSON.stringify(result.exceptionDetails));
  return result.result.value;
}
async function until(predicate,label,timeout=15000) {
  const end=Date.now()+timeout;
  while(Date.now()<end) {if(await predicate()) return;await sleep(50);}
  throw Error('Timed out waiting for '+label);
}
async function api(name,...args) {
  return evaluate('window.dashboardPreview['+JSON.stringify(name)+'](...'+JSON.stringify(args)+')');
}
async function inspect() {
  const state=await api('inspect');
  assert.ok(state&&state.layouts,'Preview inspect() must describe the three layouts');
  for(const id of layouts) {
    assert.ok(state.layouts[id],id+' missing from inspect()');
    assert.ok(Array.isArray(state.layouts[id].visibleIds),id+' must expose visibleIds');
    const violations=state.layouts[id].boundsViolations;
    assert.notEqual(violations,undefined,id+' must expose boundsViolations');
    assert.equal(Array.isArray(violations)?violations.length:violations,0,id+' drawing exceeds screen bounds');
  }
  return state;
}
async function configure(scenario='timer-media',theme='light') {
  await api('reset');await api('setScenario',scenario);await api('setTheme',theme);await api('setMessagePreview',true);
  return inspect();
}
async function view(layout) {return (await inspect()).layouts[layout];}
async function focusCanvas(layout) {
  assert.equal(await evaluate(`(()=>{const c=document.querySelector('canvas[data-layout="${layout}"]');if(!c)return false;c.focus();return document.activeElement===c;})()`),true,
    layout+' canvas needs a focusable data-layout attribute');
}
async function key(type,key,code=key,extra={}) {await send('Input.dispatchKeyEvent',{type,key,code,...extra});}
async function tapKey(keyName,code=keyName) {await key('keyDown',keyName,code);await key('keyUp',keyName,code);}
async function pointerSelect(layout,hold=false) {
  const point=await evaluate(`(()=>{const b=document.querySelector('.watch[data-layout="${layout}"] .hardware[data-key="select"]');if(!b)return null;b.scrollIntoView({block:'center'});const r=b.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
  assert.ok(point,layout+' Select button is missing');
  await send('Input.dispatchMouseEvent',{type:'mouseMoved',...point});
  await send('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',buttons:1,clickCount:1});
  if(hold)await sleep(850);
  await send('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',buttons:0,clickCount:1});
}
function assertSection(current,section,layout) {
  assert.equal(current.mode,'section',layout+' hold must open a section');
  assert.equal(current.section,section,layout+' opened the wrong section');
  const expected=section==='activities'?6:12;
  assert.equal(current.sectionCounts[section],expected,layout+' '+section+' has the wrong fictional entry count');
  assert.ok(current.visibleIds.length>0&&current.visibleIds.length<=5,layout+' section viewport must contain at most five rows');
  assert.ok(current.visibleIds.includes(current.selectedId),layout+' section selection must stay visible');
}

const captures=[], sheets=[];
async function capture(layout,name) {
  const state=await inspect(), url=await api('snapshot',layout), bytes=imageBytes(url);
  assert.equal(bytes.readUInt32BE(16),200);assert.equal(bytes.readUInt32BE(20),228);
  const palette=await evaluate(`(async()=>{
    const image=new Image();image.src=${JSON.stringify(url)};await image.decode();
    const canvas=document.createElement('canvas');canvas.width=200;canvas.height=228;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0);
    const data=ctx.getImageData(0,0,200,228).data,colors=new Set();let opaque=true,quantized=true;
    for(let i=0;i<data.length;i+=4){opaque=opaque&&data[i+3]===255;quantized=quantized&&data[i]%85===0&&data[i+1]%85===0&&data[i+2]%85===0;colors.add((data[i]<<16)|(data[i+1]<<8)|data[i+2]);}
    return {opaque,quantized,colors:colors.size};
  })()`);
  assert.equal(palette.opaque,true,name+' includes transparent screen pixels');
  assert.equal(palette.quantized,true,name+' is not quantized to Pebble colour levels');
  assert.ok(palette.colors<=64,name+' exceeds 64 colours');
  const file=path.join('screens',name+'.png');fs.writeFileSync(path.join(output,file),bytes);
  const record={file,layout,scenario:state.scenario,theme:state.theme,swapped:state.swapped,messagePreview:state.messagePreview,...state.layouts[layout],
    width:200,height:228,bytes:bytes.length,sha256:sha(bytes),palette};
  captures.push(record);return {record,url};
}

async function sheet(name,frames,subtitle,columns=3) {
  const title=({'expansion-overview':'Snapshot and expanded groups','expansion-dark':'Expanded groups in dark',
    'expansion-navigation':'Open details and return'})[name]||name;
  const url=await evaluate(`(async()=>{
    const frames=${JSON.stringify(frames.map(frame=>({url:frame.url,label:frame.label||labels[frame.record.layout],note:frame.note||''})))},columns=${columns};
    const scale=2,w=200*scale,h=228*scale,gap=28,header=86,caption=68,rows=Math.ceil(frames.length/columns);
    const canvas=document.createElement('canvas');canvas.width=columns*w+(columns+1)*gap;canvas.height=header+rows*(h+caption+gap)+gap;
    const ctx=canvas.getContext('2d');ctx.fillStyle='#f3f3ef';ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle='#20251f';ctx.font='600 26px system-ui';ctx.fillText(${JSON.stringify('Dashboard / '+title)},gap,36);
    ctx.font='16px system-ui';ctx.fillStyle='#5d655a';ctx.fillText(${JSON.stringify(subtitle)},gap,64);
    for(let index=0;index<frames.length;index++) {
      const frame=frames[index],image=new Image();image.src=frame.url;await image.decode();
      const x=gap+(index%columns)*(w+gap),y=header+Math.floor(index/columns)*(h+caption+gap);
      ctx.fillStyle='#232921';ctx.fillRect(x-2,y-2,w+4,h+4);ctx.imageSmoothingEnabled=false;ctx.drawImage(image,x,y,w,h);
      ctx.fillStyle='#20251f';ctx.font='600 21px system-ui';ctx.fillText(frame.label,x,y+h+30);
      ctx.fillStyle='#5d655a';ctx.font='15px system-ui';ctx.fillText(frame.note,x,y+h+53);
    }
    return canvas.toDataURL('image/png');
  })()`);
  const bytes=imageBytes(url),file=name+'.png';fs.writeFileSync(path.join(output,file),bytes);
  sheets.push({file,title,width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20),sha256:sha(bytes)});
}

async function run() {
  const entry=path.join(root,'previews/index.html');assert.ok(fs.existsSync(entry),'Preview is not ready: previews/index.html is missing');
  fs.mkdirSync(path.join(output,'screens'),{recursive:true});
  scratch=fs.mkdtempSync(path.join(os.tmpdir(),'pebble-dashboard-preview-'));
  logFd=fs.openSync(path.join(scratch,'chromium.log'),'w');
  browser=spawn(chromium,['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--disable-background-networking',
    '--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--user-data-dir='+scratch,'about:blank'],
    {stdio:['ignore',logFd,logFd],detached:true});
  let launchError;browser.on('error',error=>{launchError=error;});
  const portFile=path.join(scratch,'DevToolsActivePort');
  await until(()=>{
    if(launchError)throw launchError;
    if(browser.exitCode!==null||browser.signalCode!==null)throw Error('Chromium exited: '+fs.readFileSync(path.join(scratch,'chromium.log'),'utf8').slice(-2500));
    return fs.existsSync(portFile);
  },'isolated Chromium');
  const port=fs.readFileSync(portFile,'utf8').split('\n')[0],endpoint='http://127.0.0.1:'+port;
  const tabs=await (await fetch(endpoint+'/json')).json();
  socket=new WebSocket(tabs.find(tab=>tab.type==='page').webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
  socket.onmessage=event=>{
    const data=JSON.parse(event.data);
    if(data.id) {const item=pending.get(data.id);if(!item)return;pending.delete(data.id);data.error?item.reject(Error(JSON.stringify(data.error))):item.resolve(data.result);}
    else if(data.method==='Runtime.exceptionThrown')exceptions.push(data.params.exceptionDetails);
  };
  socket.onclose=()=>{for(const item of pending.values())item.reject(Error('Chromium connection closed'));pending.clear();};
  await send('Page.enable');await send('Runtime.enable');
  await send('Page.addScriptToEvaluateOnNewDocument',{source:`(()=>{
    const q=window.__previewCaptureWork={intervals:0,framesScheduled:0,framesRun:0};
    const interval=window.setInterval,frame=window.requestAnimationFrame;
    window.setInterval=function(...args){q.intervals++;return interval.apply(this,args);};
    window.requestAnimationFrame=function(callback){q.framesScheduled++;return frame.call(this,time=>{q.framesRun++;callback(time);});};
  })();`});
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1100,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url:pathToFileURL(entry).href});
  await until(()=>evaluate('!!window.dashboardPreview'),'preview API');
  await evaluate('Promise.resolve(window.dashboardPreview.ready).then(()=>document.fonts.ready).then(()=>true)');
  assert.deepEqual(await evaluate('window.dashboardPreview.layouts'),layouts);
  await configure();

  const idleBefore=await evaluate('({...window.__previewCaptureWork})');
  const initial=Object.fromEntries(await Promise.all(layouts.map(async id=>[id,await api('snapshot',id)])));
  await sleep(400);
  for(const id of layouts)assert.equal(await api('snapshot',id),initial[id],id+' changes without input');
  const idleAfter=await evaluate('({...window.__previewCaptureWork})');
  assert.equal(idleAfter.intervals,0,'Preview starts a repeating interval');
  assert.equal(idleAfter.framesScheduled,idleBefore.framesScheduled,'Preview schedules idle animation frames');
  assert.equal(await evaluate('document.getAnimations().filter(animation=>animation.playState==="running").length'),0,'Preview has an automatic CSS animation');

  for(const theme of ['light','dark']) {
    await configure('timer-media',theme);const frames=[];
    for(const id of layouts)frames.push(await capture(id,id+'-'+theme));
    await sheet('overview-'+theme,frames,'Actual 200 × 228 canvas pixels, enlarged 2×. Synthetic data; design study only.');
  }
  await configure('workout-navigation','light');const alternate=[];
  for(const id of layouts)alternate.push(await capture(id,id+'-workout-navigation'));
  await sheet('alternate-activities',alternate,'The two activities can be any types; these examples use workout and navigation.');
  await configure();await api('swapActivities');const mediaFirst=[];
  for(const id of layouts) {
    assert.equal((await inspect()).layouts[id].selectedId,'activity-1','Swapping keeps the promoted media occurrence selected');
    mediaFirst.push(await capture(id,id+'-media-first'));
  }
  await sheet('media-first',mediaFirst,'Swap activities: media is first and Timer is second; either activity can lead.');
  for(const scenario of ['long','quiet']) {
    await configure(scenario,'light');
    for(const id of layouts)await capture(id,id+'-'+scenario);
  }
  await configure('long');await api('swapActivities');await capture('focus','focus-long-media-first');
  const privacy=[];
  await configure();const unmasked=Object.fromEntries(await Promise.all(layouts.map(async id=>[id,await api('snapshot',id)])));
  await api('setMessagePreview',false);
  for(const id of layouts) {
    const view=(await inspect()).layouts[id];
    assert.ok(view.text.some(item=>item.shown==='New message'),id+' must show the body-free notification summary');
    assert.ok(!view.text.some(item=>item.shown.includes('At the entrance')),id+' still paints a private body');
    assert.notEqual(await api('snapshot',id),unmasked[id]);
    await capture(id,id+'-notification-private');privacy.push({layout:id,bodyReplaced:true});
  }
  const selectedChecks=[];
  for(const id of layouts) {
    await configure();await api('select',id,'notification');
    let state=await inspect();assert.equal(state.layouts[id].selectedId,'notification');
    assert.ok(state.layouts[id].visibleIds.includes('notification'));
    await capture(id,id+'-notification-selected');
    await api('select',id,'control-find');state=await inspect();
    assert.equal(state.layouts[id].selectedId,'control-find');assert.ok(state.layouts[id].visibleIds.includes('control-find'));
    await capture(id,id+'-control-selected');
    selectedChecks.push({layout:id,selectionCanReachLatestNotificationAndControl:true,selectedControlVisible:true});
  }
  const details=[];
  for(const [id,label] of [['activity-0','Timer detail'],['activity-1','Music detail'],['notification','Native notification handoff'],['control-light','Light controls']]) {
    await configure();await api('select','focus',id);const before=(await inspect()).layouts.focus;
    const previousPixels=await api('snapshot','focus');
    await api('press','focus','select');const after=(await inspect()).layouts.focus;
    if(id==='control-light') {
      assert.equal(after.mode,before.mode,'An explicit light toggle stays in the overview');
      assert.notEqual(await api('snapshot','focus'),previousPixels,'Light toggle must update its displayed state');
    } else if(id==='notification') {
      assert.equal(after.mode,'overview','Notifications must hand off without inventing a Dashboard detail');
      assert.equal(after.lastNavigation,'notifications','Notification Select records the native-app destination');
    } else assert.notEqual(after.mode,before.mode,id+' Select must open its detail or controls');
    const frame=await capture('focus','detail-'+id);frame.label=label;details.push(frame);
    await api('press','focus','back');assert.equal((await inspect()).layouts.focus.mode,before.mode);
  }
  await sheet('detail-overview',details,'Select opens details or its destination; light toggles. Timer controls are future work.',2);

  const readingDetails=[];
  for(const id of layouts) {
    await configure();await api('select',id,'pin-weather');await api('press',id,'select');
    assert.equal((await inspect()).layouts[id].mode,'detail','Reading Select opens its detail');
    await api('press',id,'select');const after=(await inspect()).layouts[id];
    assert.equal(after.mode,'overview','Reading detail Select follows its Back hint');
    assert.equal(after.selectedId,'pin-weather','Returning retains the selected reading');
    readingDetails.push({layout:id,detailSelectReturns:true,selectedReadingRetained:true});
  }

  const mixedPins=[];
  for(const layout of layouts) {
    await configure();await api('select',layout,'control-light');
    // Previous simulations can leave the light off. Start this check on the
    // reported 65% state, then prove that the same pin is also actionable.
    if(!(await view(layout)).text.some(item=>item.source==='65%'))await api('press',layout,'select');
    const before=await view(layout);
    assert.ok(before.text.some(item=>item.source==='65%'),layout+' light pin must show its brightness reading');
    assert.ok(before.text.some(item=>item.source==='Select: Toggle'),layout+' light brightness pin must advertise its optional action');
    await api('press',layout,'select');const off=await view(layout);
    assert.equal(off.mode,'overview');assert.equal(off.selectedId,'control-light');
    assert.equal(off.actionCount,before.actionCount+1,layout+' brightness pin must toggle once');
    assert.ok(off.text.some(item=>item.source==='Off'),layout+' toggled brightness pin must show Off');
    await api('press',layout,'select');
    assert.ok((await view(layout)).text.some(item=>item.source==='65%'),layout+' light toggle must restore its reported brightness');
    await api('press',layout,'hold');let pinned=await view(layout);assertSection(pinned,'pinned',layout);
    assert.ok(pinned.text.some(item=>item.source==='65%'),layout+' the mixed Pinned list must also show brightness');
    assert.ok(pinned.visibleIds.includes('pin-weather')&&pinned.visibleIds.includes('control-light')&&pinned.visibleIds.includes('control-find'),
      layout+' Pinned must mix a value-only reading, value/action light and action-only Find phone');
    const heldCount=pinned.actionCount;
    await api('press',layout,'down');await api('press',layout,'down');pinned=await view(layout);
    assert.equal(pinned.selectedId,'control-find',layout+' unified list ordering must reach Find phone after Light and Phone');
    assert.ok(pinned.text.some(item=>item.source==='Select: Ring'),layout+' action-only pin must keep its own action hint');
    await api('press',layout,'select');const rang=await view(layout);assertSection(rang,'pinned',layout);
    assert.equal(rang.actionCount,heldCount+1);assert.equal(rang.selectedId,'control-find');
    await api('press',layout,'back');assert.equal((await view(layout)).selectedId,'control-light');
    mixedPins.push({layout,valueAndActionSamePin:true,brightnessToggleUpdatesReading:true,
      valueOnlyAndActionOnlyInSameGroup:true,actionStaysInPinned:true,backRestoresOrigin:true});
  }

  const groups=[['activities','activity-0','All activities','activities'],['pinned','pin-weather','Pinned: value only','pinned-reading'],['pinned','control-light','Pinned: value + action','pinned-action']];
  const sectionNavigation=[],notificationNavigation=[],holdGestures=[];
  const expansionFrames={light:[],dark:[]},navigationFrames=[];
  for(const theme of ['light','dark']) {
    await configure('timer-media',theme);
    const overview=await capture('snapshot','snapshot-expand-overview-'+theme);
    overview.label='Snapshot';overview.note='Select opens / runs · hold Select shows more';expansionFrames[theme].push(overview);
    for(const [section,trigger,label,fileLabel] of groups) {
      await api('select','snapshot',trigger);await api('press','snapshot','hold');
      const current=await view('snapshot');assertSection(current,section,'snapshot');
      const frame=await capture('snapshot','snapshot-all-'+fileLabel+'-'+theme);
      frame.label=label;frame.note=section==='activities'?'6 examples · Up / Down · Back restores Snapshot':
        trigger==='control-light'?'Same list · brightness + Select to toggle':'12 mixed pins · values and optional actions';expansionFrames[theme].push(frame);
      await api('press','snapshot','back');assert.equal((await view('snapshot')).selectedId,trigger);
    }
  }
  await sheet('expansion-overview',expansionFrames.light,'Hold Select for Activities or Pinned. A pinned item can show a value and have an action.',2);
  await sheet('expansion-dark',expansionFrames.dark,'The same four screens in the dark theme. Synthetic data; browser design preview.',2);

  for(const layout of layouts) {
    for(const [section,trigger] of groups) {
      await configure();await api('select',layout,trigger);const overview=await view(layout);
      await api('press',layout,'hold');const first=await view(layout);assertSection(first,section,layout);
      for(let index=1;index<first.sectionCounts[section];index++)await api('press',layout,'down');
      const last=await view(layout);assertSection(last,section,layout);
      assert.ok(!first.visibleIds.includes(last.selectedId),layout+' '+section+' must scroll beyond the initial five rows');
      assert.notDeepEqual(last.visibleIds,first.visibleIds,layout+' '+section+' viewport must follow selection');
      // The last Pinned row may execute an action. Use the Sunrise reading to
      // verify a value-only detail inside the same mixed group.
      if(section==='pinned') {
        for(let step=0;step<last.sectionCounts.pinned&&((await view(layout)).selectedId!=='pin-sunrise');step++)await api('press',layout,'up');
        assert.equal((await view(layout)).selectedId,'pin-sunrise',layout+' must expose the Sunrise reading in Pinned');
      }
      const beforeDetail=await view(layout);
      await api('press',layout,'select');assert.equal((await view(layout)).mode,'detail',layout+' expanded value-only row Select opens detail');
      await api('press',layout,'back');const detailReturned=await view(layout);
      assertSection(detailReturned,section,layout);assert.equal(detailReturned.selectedId,beforeDetail.selectedId,layout+' detail Back must retain the selected occurrence');
      assert.deepEqual(detailReturned.visibleIds,beforeDetail.visibleIds,layout+' detail Back must retain section position');
      await api('press',layout,'back');const returned=await view(layout);
      assert.equal(returned.mode,'overview',layout+' section Back returns to overview');
      assert.equal(returned.selectedId,overview.selectedId,layout+' section Back retains the original card');
      assert.deepEqual(returned.visibleIds,overview.visibleIds,layout+' section Back retains the original viewport');
      assert.equal(returned.returnDepth,0,layout+' Back should consume the section return frame');
      sectionNavigation.push({layout,section,origin:trigger,total:first.sectionCounts[section],viewportLimit:5,lastEntryReachable:true,
        detailBackRetainsRowAndViewport:true,overviewBackRetainsCellAndViewport:true});
    }
    await configure();await api('select',layout,'notification');await api('press',layout,'select');const notification=await view(layout);
    assert.equal(notification.mode,'overview',layout+' notification opens the native app, not a Dashboard detail');
    assert.equal(notification.lastNavigation,'notifications',layout+' notification handoff destination is missing');
    assert.equal(notification.selectedId,'notification',layout+' notification handoff keeps its originating card');
    notificationNavigation.push({layout,destination:'notifications',mockIntentOnly:true,createsDashboardDetail:false});
  }

  // Capture the activity drill-down and its return at the exact same selected occurrence.
  await configure();await api('press','snapshot','hold');await api('press','snapshot','down');
  const sectionBefore=await view('snapshot');
  let frame=await capture('snapshot','snapshot-section-before-detail');frame.label='All activities';frame.note='Select Music from the expanded group';navigationFrames.push(frame);
  await api('press','snapshot','select');assert.equal((await view('snapshot')).mode,'detail');
  frame=await capture('snapshot','snapshot-section-activity-detail');frame.label='Activity detail';frame.note='Back returns to the same activity in the group';navigationFrames.push(frame);
  await api('press','snapshot','back');const sectionAfter=await view('snapshot');
  assert.equal(sectionAfter.selectedId,sectionBefore.selectedId);assert.deepEqual(sectionAfter.visibleIds,sectionBefore.visibleIds);
  frame=await capture('snapshot','snapshot-section-after-detail');frame.label='Back: same Music row';frame.note='The selected occurrence and scroll position survive';navigationFrames.push(frame);
  await api('press','snapshot','back');await api('select','snapshot','notification');await api('press','snapshot','select');
  frame=await capture('snapshot','snapshot-notification-handoff');frame.label='Notifications';frame.note='Select requests the native app · preview intent only';navigationFrames.push(frame);
  await sheet('expansion-navigation',navigationFrames,'Activity detail returns to its list; notifications go directly to the native app.',2);

  // Real DOM gestures verify that releasing a hold cannot also run the selected control.
  for(const layout of layouts) {
    await configure();await api('select',layout,'control-light');const before=await view(layout);
    assert.equal(typeof before.actionCount,'number',layout+' must expose actionCount');
    await pointerSelect(layout,true);let after=await view(layout);assertSection(after,'pinned',layout);
    assert.equal(after.actionCount,before.actionCount,layout+' pointer hold release must not toggle a control');
    await api('press',layout,'back');await pointerSelect(layout);after=await view(layout);
    assert.equal(after.mode,'overview',layout+' fresh pointer tap after hold stays overview');
    assert.equal(after.actionCount,before.actionCount+1,layout+' fresh pointer tap must execute exactly one control action');
    for(const [keyName,code] of [['Enter','Enter'],[' ','Space']]) {
      await configure();await api('select',layout,'control-light');await focusCanvas(layout);const count=(await view(layout)).actionCount;
      await key('keyDown',keyName,code);await sleep(850);
      await key('keyDown',keyName,code,{autoRepeat:true});await key('keyUp',keyName,code);
      after=await view(layout);assertSection(after,'pinned',layout);
      assert.equal(after.actionCount,count,layout+' '+code+' hold release must not run its control');
      await tapKey('Escape');assert.equal((await view(layout)).mode,'overview');
      await tapKey(keyName,code);after=await view(layout);
      assert.equal(after.actionCount,count+1,layout+' fresh '+code+' tap after hold must run exactly once');
    }
    await configure();await api('select',layout,'control-light');const sectionCount=(await view(layout)).actionCount;
    await api('press',layout,'hold');await api('press',layout,'select');after=await view(layout);
    assertSection(after,'pinned',layout);assert.equal(after.actionCount,sectionCount+1,layout+' an expanded actionable pin must run exactly once and retain Pinned');
    await configure();await api('select',layout,'activity-0');await pointerSelect(layout,true);
    assertSection(await view(layout),'activities',layout);
    holdGestures.push({layout,pointerHoldControlSuppressesTap:true,pointerFreshTapRunsOnce:true,
      enterHoldSuppressesTap:true,spaceHoldSuppressesTap:true,keyboardFreshTapRunsOnce:true,expandedControlRunsOnce:true,pointerHoldActivityOpensGroup:true});
  }

  await configure();
  const keyboard=[];
  for(const id of layouts) {
    await focusCanvas(id);
    const before=(await inspect()).layouts[id];
    for(const [type,key,code] of [['keyDown','ArrowDown','ArrowDown'],['keyUp','ArrowDown','ArrowDown']]) await send('Input.dispatchKeyEvent',{type,key,code});
    const after=(await inspect()).layouts[id];assert.notEqual(after.selectedId,before.selectedId,id+' ArrowDown does not move focus');
    await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter'});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter'});
    assert.notEqual((await inspect()).layouts[id].mode,after.mode,id+' Enter does not open detail');
    await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape'});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape'});
    assert.equal((await inspect()).layouts[id].mode,after.mode,id+' Escape does not return');
    keyboard.push({layout:id,arrowDown:true,enter:true,escape:true});
  }

  const focusedEntry=path.join(root,'previews/snapshot.html');assert.ok(fs.existsSync(focusedEntry),'Focused Snapshot preview is missing');
  await send('Page.navigate',{url:pathToFileURL(focusedEntry).href});
  await until(()=>evaluate('!!window.dashboardPreview && JSON.stringify(window.dashboardPreview.layouts)===JSON.stringify(["snapshot"])'),'focused Snapshot API');
  await evaluate('Promise.resolve(window.dashboardPreview.ready).then(()=>document.fonts.ready).then(()=>true)');
  assert.equal(await evaluate('document.querySelectorAll("canvas[data-layout]").length'),1,'Focused preview must contain only Snapshot');
  await api('setTheme','light');await api('setScenario','timer-media');
  const focusedBefore=(await api('inspect')).layouts.snapshot;
  await focusCanvas('snapshot');await key('keyDown','Enter');await sleep(850);await key('keyUp','Enter');
  assertSection((await api('inspect')).layouts.snapshot,'activities','focused snapshot');
  await tapKey('Escape');const focusedAfter=(await api('inspect')).layouts.snapshot;
  assert.equal(focusedAfter.mode,'overview');assert.equal(focusedAfter.selectedId,focusedBefore.selectedId);
  assert.deepEqual(focusedAfter.visibleIds,focusedBefore.visibleIds);
  await api('select','snapshot','control-light');const focusedCount=(await api('inspect')).layouts.snapshot.actionCount;
  await pointerSelect('snapshot',true);const focusedControl=(await api('inspect')).layouts.snapshot;
  assertSection(focusedControl,'pinned','focused snapshot');assert.equal(focusedControl.actionCount,focusedCount);
  await api('press','snapshot','back');assert.equal((await api('inspect')).layouts.snapshot.selectedId,'control-light');
  const focusedEntrySmoke={entry:'previews/snapshot.html',layouts:['snapshot'],canvases:1,
    realKeyboardHoldOpensActivities:true,backRetainsOriginalItemAndViewport:true,realPointerHoldDoesNotRunControl:true};
  assert.deepEqual(exceptions,[],'Browser exceptions occurred');
  const report={result:'PASS',scope:'Code-native Chromium design previews with synthetic data; not a Pebble SDK build, native screenshot, live plugin or physical-watch test.',
    dimensions:[200,228],captureScriptSha256:sha(fs.readFileSync(__filename)),sourceHashes:inputs(path.join(root,'previews')),scenarios,layouts,
    idle:{staticPixels:true,repeatingIntervals:idleAfter.intervals,framesBefore:idleBefore,framesAfter:idleAfter},
    selectedChecks,readingDetails,mixedPins,privacy,keyboard,sectionNavigation,notificationNavigation,holdGestures,focusedEntrySmoke,
    browserExceptions:exceptions,captures,contactSheets:sheets};
  fs.writeFileSync(path.join(output,'validation.json'),JSON.stringify(report,null,2)+'\n');
  for(const group of ['readouts','controls'])for(const theme of ['light','dark']) {
    const obsolete=path.join(output,'screens','snapshot-all-'+group+'-'+theme+'.png');
    if(fs.existsSync(obsolete))fs.unlinkSync(obsolete);
  }
  console.log(JSON.stringify({result:report.result,captures:captures.length,contactSheets:sheets.length,dimensions:report.dimensions,output},null,2));
}

async function cleanup() {
  if(socket&&socket.readyState===WebSocket.OPEN) {
    try {await Promise.race([send('Browser.close'),sleep(1000)]);}catch{}
    socket.close();
  }
  if(browser&&browser.exitCode===null&&browser.signalCode===null) {
    await Promise.race([new Promise(resolve=>browser.once('exit',resolve)),sleep(500)]);
    if(browser.exitCode===null&&browser.signalCode===null)try{process.kill(-browser.pid,'SIGTERM');}catch(error){if(error.code!=='ESRCH')throw error;}
  }
  if(logFd!==undefined)fs.closeSync(logFd);
  if(scratch)fs.rmSync(scratch,{recursive:true,force:true});
}
run().catch(error=>{console.error(error.stack||error);process.exitCode=1;}).finally(cleanup);
