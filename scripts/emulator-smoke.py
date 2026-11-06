#!/usr/bin/env python3
"""Real native Emery UI against a synthetic protocol peer, over isolated FIFOs.

No phone JavaScript, installed phone plugins, real hardware or action execution.
The installed native-only PBW retains exact native bytes of --pbw. Use the local
SDK environment: source ../recovery-validation/env.sh; python3 scripts/emulator-smoke.py.
"""
from pathlib import Path
import argparse
import copy
import hashlib
import json
import os
import queue
import subprocess
import sys
import tempfile
import threading
import time
import uuid
import zipfile

ROOT=Path(__file__).resolve().parents[1]
VERSION=json.loads((ROOT/'package.json').read_text())['version']
sys.path.insert(0,str(ROOT.parent/'recovery-validation'))


def digest(data):return hashlib.sha256(data).hexdigest()


def run(pbw,output,expected_sha256=None,notifications_only=False,ux_only=False,reliability_only=False,paused_repro=False,activities_only=False,startup_theme_only=False):
    from pipe_emulator import connect
    from libpebble2.services.appmessage import AppMessageService,Uint32,ByteArray,CString
    from libpebble2.services.screenshot import Screenshot
    from libpebble2.protocol.apps import AppRunState,AppRunStateRequest,AppRunStateStart,AppRunStateStop
    from libpebble2.protocol.system import TimeMessage,SetUTC
    from libpebble2.communication.transports.qemu.protocol import QemuButton,QemuBluetoothConnection,QemuBattery
    from pebble_tool.commands.emucontrol import send_data_to_qemu
    from pebble_tool.commands.install import ToolAppInstaller
    from PIL import Image

    pbw=pbw.resolve();output=output.resolve()
    if expected_sha256 and digest(pbw.read_bytes())!=expected_sha256:raise RuntimeError('Candidate PBW hash changed before native QA')
    output.mkdir(parents=True,exist_ok=True)
    if not os.environ.get('PEBBLE_QA_STATE'):
        os.environ['PEBBLE_QA_STATE']=tempfile.mkdtemp(prefix='dashboard-emery-')
    state_dir=Path(os.environ['PEBBLE_QA_STATE'])
    fresh_flash=not Path(os.environ.get('PEBBLE_QA_FLASH',str(state_dir/'spi-flash.bin'))).exists()
    if startup_theme_only and not fresh_flash:raise RuntimeError('Startup theme QA requires a fresh isolated flash; do not reuse saved app data')
    native=output/'native-candidate.pbw'
    with zipfile.ZipFile(pbw) as source,zipfile.ZipFile(native,'w') as target:
        appinfo=json.loads(source.read('appinfo.json'))
        payload={name:source.read(name) for name in source.namelist() if name.startswith('emery/')}
        for info in source.infolist():
            if info.filename=='appinfo.json' or info.filename.startswith('emery/'):
                target.writestr(info,source.read(info.filename))
    with zipfile.ZipFile(native) as archive:
        assert 'pebble-js-app.js' not in archive.namelist()
        assert all(archive.read(name)==data for name,data in payload.items())
    target=uuid.UUID(appinfo['uuid']);keys=appinfo['messageKeys']
    encoder=subprocess.Popen(['node',str(ROOT/'tests/native-peer.cjs')],cwd=ROOT,stdin=subprocess.PIPE,stdout=subprocess.PIPE,text=True,bufsize=1)
    p=connect();service=AppMessageService(p)
    condition=threading.Condition();receipts={};requests=[];errors=[];captures=[];proofs=[];theme_samples=[]
    pending=queue.Queue();send_lock=threading.Lock();encoder_lock=threading.Lock()
    stopped=threading.Event()

    def receive(_tid,app_uuid,data):
        if app_uuid!=target:return
        entry={key:int(value) if isinstance(value,int) else value for key,value in data.items()}
        with condition:requests.append(entry);condition.notify_all()
        pending.put(entry)
    def receipt(ok):
        def callback(tid,app_uuid):
            if app_uuid==target:
                with condition:receipts[tid]=ok;condition.notify_all()
        return callback
    handles=[service.register_handler('appmessage',receive),service.register_handler('ack',receipt(True)),service.register_handler('nack',receipt(False))]

    def send(dictionary):
        with send_lock:
            with condition:
                tid=service.send_message(target,dictionary)
                if not condition.wait_for(lambda:tid in receipts,timeout=8):raise RuntimeError('Peer AppMessage ACK timeout')
                if not receipts.pop(tid):raise RuntimeError('Native rejected mock peer message')
    def encode(snapshot):
        with encoder_lock:
            encoder.stdin.write(json.dumps(snapshot)+'\n');encoder.stdin.flush();result=json.loads(encoder.stdout.readline())
            if 'error' in result:raise RuntimeError(result['error'])
            return bytes(result['bytes'])
    def key(name):return keys[name]

    class Peer:
        def __init__(self):
            self.lock=threading.RLock();self.session=0;self.sequence=0;self.view=None;self.respond=True;self.dark=False;self.empty=False
            self.actions=[];self.opens=[];self.frames=[];self.suppressed=[]
            self.action_behavior='success';self.pending_actions=[]
            overview=json.loads((ROOT/'tests/fixtures/overview.json').read_text())
            self.fixture_now=overview['now'];self.activities=copy.deepcopy(json.loads((ROOT/'tests/fixtures/activity-list.json').read_text())['items'])
            self.activities+=copy.deepcopy(json.loads((ROOT/'tests/fixtures/generic-controls.json').read_text())['items'])
            self.activities[1]['value']='Playing'
            self.notice=copy.deepcopy(next(x for x in overview['items'] if x['role']==1))
            pins=copy.deepcopy(json.loads((ROOT/'tests/fixtures/pinned-list.json').read_text())['items'])
            defaults=[x['token'] for x in overview['items'] if x['role']==2]
            self.pins=[next(x for x in pins if x['token']==token) for token in defaults]+[x for x in pins if x['token'] not in defaults]
            watch=next(x for x in self.pins if x['token']==8);watch['flags']=4096;watch['validUntil']=0
            for index,(title,value,kind,flags) in enumerate([
                    ('Humidity','42%',0,0),('Next event','15:30',10,0),('Desk light','Off',6,1),
                    ('Hall light','80%',6,1),('Sunrise','06:58',4,2),('Evening scene','',12,1),('Reading scene','',12,3)]):
                self.pins.append({'token':20+index,'version':1,'validUntil':0 if flags&1 and not value else self.fixture_now+3600,'flags':flags,'kind':kind,'role':2,
                    'title':title,'subtitle':'','value':value,'appLabel':'Home' if flags&2 else '',
                    'actionLabel':'Run' if flags&1 else '','name':''})
        def items(self):return ([] if self.empty else self.activities),self.pins
        def frame(self,request=None):
            with self.lock:
                if not self.view:return None
                view=self.view if request is None else request;mode=view.get(key('DB_MODE'),0);offset=view.get(key('DB_OFFSET'),0);acts,pins=self.items()
                if mode==0:items=acts[:1]+([self.notice] if self.notice else [])+pins[:2];total=len(items);offset=0
                elif mode==3:items=[x for x in acts if x['token']==view.get(key('DB_TOKEN'))][:1];total=len(items);offset=0
                else:
                    all_items=acts if mode==1 else pins;total=len(all_items);offset=min(offset,max(0,total-5))
                    if request is None and self.view.get('preserve') and self.view.get(key('DB_TOKEN')):
                        selected=next((i for i,x in enumerate(all_items) if x['token']==self.view[key('DB_TOKEN')]),None)
                        if selected is not None:
                            if selected<offset:offset=selected
                            elif selected>=offset+5:offset=selected-4
                            offset=min(offset,max(0,total-5))
                    self.view[key('DB_OFFSET')]=offset
                    items=all_items[offset:offset+5]
                now=int(time.time());shift=now-self.fixture_now;items=copy.deepcopy(items)
                for item in items:
                    if item.get('validUntil'):item['validUntil']+=shift
                    if item.get('anchor'):item['anchor']+=shift
                self.sequence+=1
                return {'session':self.session,'request':view[key('DB_REQUEST')],'sequence':self.sequence,'now':now,'mode':mode,'status':1,
                    'dark':self.dark,'total':total,'offset':offset,'activitiesTotal':len(acts),'pinsTotal':len(pins),'items':items}
        def publish(self,request=None):
            frame=self.frame(request)
            if frame:
                send({key('DB_DATA'):ByteArray(encode(frame))})
                with self.lock:self.frames.append({'request':frame['request'],'sequence':frame['sequence'],'mode':frame['mode'],'offset':frame['offset'],'tokens':[x['token'] for x in frame['items']]})
        def result(self,request,result,text=''):
            send({key('DB_SESSION'):Uint32(self.session),key('DB_REQUEST'):Uint32(request[key('DB_REQUEST')]),key('DB_RESULT'):Uint32(result),key('DB_TEXT'):CString(text)})
        def complete(self,request,result=2,text='Done'):
            with self.lock:
                acts,pins=self.items();found=next((x for x in acts+pins if x['token']==request.get(key('DB_TOKEN'))),None)
                if result==2 and found:
                    if found['kind']==6:found['value']='Off' if found['value']!='Off' else '65%';found['version']+=1
                    elif found['kind']==2 and request.get(key('DB_ACTION'))==1:
                        found['flags']^=32;found['controls'][1]='Play' if found['flags']&32 else 'Pause';found['value']='Paused' if found['flags']&32 else 'Playing';found['version']+=1
            self.publish();self.result(request,result,text)
        def process(self,request):
            operation=request.get(key('DB_OPERATION'))
            if operation in (1,2):
                with self.lock:
                    if operation==1 and request[key('DB_SESSION')]!=self.session:self.session=request[key('DB_SESSION')];self.sequence=0
                    self.view=copy.deepcopy(request)
                if self.respond:self.publish()
                else:self.suppressed.append(request)
                with self.lock:self.view['preserve']=True
            elif operation in (3,4):
                with self.lock:
                    acts,pins=self.items();found=next((x for x in acts+pins+([self.notice] if self.notice else []) if x['token']==request.get(key('DB_TOKEN'))),None)
                    if not found or found['version']!=request.get(key('DB_VERSION')):self.result(request,4,'Item changed');return
                    if operation==4:self.opens.append(request);self.result(request,2,'Opening app');return
                    self.actions.append(request)
                    if self.action_behavior=='confirm' and not request.get(key('DB_CONFIRM')):
                        self.result(request,7,'Ring Find phone?');return
                    self.result(request,1,'Working')
                    if self.action_behavior=='defer':self.pending_actions.append(request);return
                    outcome=3 if self.action_behavior=='failure' else 5 if self.action_behavior=='denied' else 2
                self.complete(request,outcome,'Light did not respond' if outcome==3 else 'Allow on phone' if outcome==5 else 'Done')
            elif operation==7:
                with self.lock:
                    if self.view and request.get(key('DB_REQUEST'))==self.view.get(key('DB_REQUEST')):
                        self.view.update(request);self.view['preserve']=True
            elif operation==5:pass
    peer=Peer()
    if startup_theme_only:peer.respond=False;peer.dark=True
    def worker():
        while not stopped.is_set():
            try:request=pending.get(timeout=.1)
            except queue.Empty:continue
            try:peer.process(request)
            except Exception as error:
                errors.append(repr(error));print('Peer error:',error,flush=True)
    thread=threading.Thread(target=worker,daemon=True);thread.start()

    def await_condition(test,message,timeout=8):
        deadline=time.monotonic()+timeout
        while time.monotonic()<deadline:
            if errors:raise RuntimeError(errors[-1])
            if test():return
            time.sleep(.025)
        raise RuntimeError(message)
    def button(name,hold=.08):
        send_data_to_qemu(p.transport,QemuButton(state=int(getattr(QemuButton.Button,name))));time.sleep(hold)
        send_data_to_qemu(p.transport,QemuButton(state=0));time.sleep(.22)
    def capture(name,settle=2.2):
        # Ordinary scenes settle transient success feedback; explicit UX scenes
        # use a short delay to retain their pending/error/preview state.
        time.sleep(settle);rows=Screenshot(p).grab_image();assert len(rows)==228 and all(len(x)==600 for x in rows)
        rgb=b''.join(rows);path=output/(name+'.png');Image.frombytes('RGB',(200,228),rgb).save(path)
        captures.append({'name':name,'file':path.name,'sha256':digest(path.read_bytes()),'rgbSha256':digest(rgb),'pixels':[200,228],'nativePixelsModified':False})
        print('Native capture:',name,flush=True);return rgb
    def counts():return len(peer.actions),len(peer.opens)
    def theme_pixels(name,pixels,dark):
        background=(0,0,0) if dark else (255,255,255);foreground=(255,255,255) if dark else (0,0,0)
        points=[(1,10),(1,80),(1,225),(164,225)]
        for x,y in points:assert tuple(pixels[(y*200+x)*3:(y*200+x)*3+3])==background,(name,x,y,'wrong background')
        assert tuple(pixels[(10*200+190)*3:(10*200+190)*3+3])==foreground,(name,'sidebar contrast')
        theme_samples.append({'capture':name+'.png','dark':dark,'background':list(background),'backgroundPoints':points,'sidebarPoint':[190,10],'sidebarColor':list(foreground)})
    def themed_capture(name,dark,settle=.1):
        pixels=capture(name,settle);theme_pixels(name,pixels,dark);return pixels
    def active_mode():return peer.view.get(key('DB_MODE')) if peer.view else None
    def snapshot_home():
        # Back out at most two context levels; root Back would quit, so inspect
        # the last actual VIEW from native before deciding on another press.
        while active_mode()!=0:button('Back');await_condition(lambda:bool(peer.frames) and peer.frames[-1]['mode']==active_mode(),'Back view not delivered')
    def select_snapshot(token):
        snapshot_home()
        for _ in range(4):button('Up')
        tokens=peer.frames[-1]['tokens'];assert token in tokens
        for _ in range(tokens.index(token)):button('Down')
        await_condition(lambda:peer.view.get(key('DB_TOKEN'))==token,'Snapshot selection did not reach '+str(token))
    def restart_without_guide():
        before=counts();frames=len(peer.frames);old_session=peer.session
        p.send_packet(AppRunState(data=AppRunStateStop(uuid=target)));time.sleep(.25)
        p.send_packet(AppRunState(data=AppRunStateStart(uuid=target)))
        await_condition(lambda:len(peer.frames)>frames and peer.session!=old_session,'Dashboard restart did not handshake',12)
        button('Down');await_condition(lambda:peer.view.get(key('DB_TOKEN'))==3,'First-use guide reappeared after dismissal/restart')
        assert counts()==before
        capture('guide-dismissed-after-restart',.1);button('Up')
        button('Up',.75);await_condition(lambda:active_mode()==1,'Activities header view missing');capture('activities-title-count-clock',.1)
        snapshot_home();button('Down',.75);await_condition(lambda:active_mode()==2,'Pinned header view missing');capture('pinned-title-count-clock',.1)
        snapshot_home()
        proofs.append({'check':'First-use guide dismissal persists across a native app restart; ordinary navigation works immediately and dispatches no action','passed':True})
    def ux_checks():
        snapshot_home()
        with peer.lock:
            saved_activities=copy.deepcopy(peer.activities);saved_pins=copy.deepcopy(peer.pins);saved_notice=copy.deepcopy(peer.notice)
            peer.empty=False;peer.dark=False
            timer=next(x for x in peer.activities if x['token']==1)
            peer.activities=[timer]+[x for x in peer.activities if x['token']!=1]
            weather=next(x for x in peer.pins if x['token']==4);light=next(x for x in peer.pins if x['token']==5)
            peer.pins=[weather,light]+[x for x in peer.pins if x['token'] not in (4,5)]
        peer.publish();select_snapshot(5)
        ready=capture('second-pin-ready',.1)
        peer.action_behavior='defer';before=len(peer.actions);button('Select')
        await_condition(lambda:len(peer.pending_actions)==1 and len(peer.actions)==before+1,'Deferred action did not reach pending')
        pending_pixels=capture('second-pin-pending',.1);pending_request=peer.pending_actions.pop()
        peer.complete(pending_request);success=capture('second-pin-success',.1)
        # Header/sidebar feedback must not erase the second pin icon.
        pin_icon_roi=(5,194,35,224)
        baseline=Image.frombytes('RGB',(200,228),ready).crop(pin_icon_roi).tobytes()
        assert all(Image.frombytes('RGB',(200,228),pixels).crop(pin_icon_roi).tobytes()==baseline for pixels in (pending_pixels,success))
        time.sleep(2.1);peer.action_behavior='failure';before=len(peer.actions);button('Select')
        await_condition(lambda:len(peer.actions)==before+1,'Failure action missing');failed=capture('second-pin-failure',.1)
        assert Image.frombytes('RGB',(200,228),failed).crop(pin_icon_roi).tobytes()==baseline
        proofs.append({'check':'Pending, success and failure feedback leaves the selected second Snapshot pin visible; values change only on successful synthetic source refresh','passed':True})
        button('Up');button('Down') # Acknowledge the persistent error before reviewing the reading's own reason.
        with peer.lock:light['flags']|=16;light['subtitle']='Allow on phone';light['value']='';light['version']+=1
        peer.publish();capture('reading-permission-action-available',.1)
        peer.action_behavior='success';before=len(peer.actions);button('Select')
        await_condition(lambda:len(peer.actions)==before+1,'Reading permission incorrectly blocked independent action')
        assert peer.actions[-1][key('DB_TOKEN')]==5
        proofs.append({'check':'Selected permission/unavailable reading is explained while its independently declared pin action remains usable','passed':True})
        time.sleep(1.1)
        with peer.lock:
            music=next(x for x in peer.activities if x['token']==2)
            peer.activities=[music]+[x for x in peer.activities if x['token']!=2]
        peer.publish();select_snapshot(2);before=counts();button('Select')
        await_condition(lambda:len(peer.actions)==before[0]+1,'Ordinary Music tap missing in hold-cancellation check')
        assert peer.actions[-1][key('DB_ACTION')]==1 and len(peer.opens)==before[1]
        time.sleep(1.1);before=counts();button('Select',.4);assert counts()==before
        button('Select',.75);await_condition(lambda:len(peer.opens)==before[1]+1,'Completed Music hold did not open its app')
        assert len(peer.actions)==before[0] and peer.opens[-1][key('DB_TOKEN')]==2
        proofs.append({'check':'Ordinary Music tap runs slot1; releasing Select at400ms after destination preview cancels without a tap or launch, while a completed hold opens Music exactly once','passed':True})
        time.sleep(1.1)
        with peer.lock:peer.activities=[timer]+[x for x in peer.activities if x['token']!=1]
        peer.publish();select_snapshot(1);before=counts()
        send_data_to_qemu(p.transport,QemuButton(state=int(QemuButton.Button.Select)));time.sleep(.28)
        capture('held-select-app-preview',0)
        send_data_to_qemu(p.transport,QemuButton(state=0));time.sleep(.2)
        assert counts()==before
        button('Select',.75);await_condition(lambda:len(peer.opens)==before[1]+1,'Held Select app destination did not open')
        assert len(peer.actions)==before[0] and peer.opens[-1][key('DB_TOKEN')]==1
        select_snapshot(5);before=counts();button('Select',.75);assert counts()==before
        proofs.append({'check':'Select hold previews the actual Timer destination, launches it exactly once, and adds no tap action; a pin without an app does nothing on hold','passed':True})
        with peer.lock:
            find=next(x for x in peer.pins if x['token']==7);find['flags']|=2048
            peer.pins=[weather,find]+[x for x in peer.pins if x['token'] not in (4,7)]
        peer.publish();select_snapshot(7);peer.action_behavior='confirm';before=len(peer.actions);button('Select')
        await_condition(lambda:len(peer.actions)==before+1,'Confirmation request missing');capture('confirmation-target-sidebar',.1)
        assert not peer.actions[-1].get(key('DB_CONFIRM'))
        button('Back');assert len(peer.actions)==before+1
        button('Select');await_condition(lambda:len(peer.actions)==before+2,'Confirmation retry missing')
        request_id=peer.actions[-1][key('DB_REQUEST')];button('Select');assert len(peer.actions)==before+2
        button('Select');await_condition(lambda:len(peer.actions)==before+3,'Safe confirmation retry missing')
        request_id=peer.actions[-1][key('DB_REQUEST')];button('Down');capture('confirmation-explicit-run-choice',.1);button('Select')
        await_condition(lambda:len(peer.actions)==before+4,'Confirmation acceptance missing')
        assert peer.actions[-1][key('DB_CONFIRM')]==1 and peer.actions[-1][key('DB_REQUEST')]==request_id and peer.actions[-1][key('DB_TOKEN')]==7
        proofs.append({'check':'Confirmation identifies Find phone and its action; safe Keep is initial, Back/Select cancel, and explicit Down then Select confirms only the original bound request','passed':True})
        peer.action_behavior='success';time.sleep(2.1)
        for fixture_name,expected in [('generic-controls',1),('generic-sparse-controls',2),('generic-single-control',1)]:
            snapshot_home()
            activity=copy.deepcopy(json.loads((ROOT/'tests/fixtures'/(fixture_name+'.json')).read_text())['items'][0])
            with peer.lock:peer.activities=[activity]
            peer.publish();select_snapshot(activity['token']);before=len(peer.actions);button('Select')
            await_condition(lambda:active_mode()==3 and peer.frames[-1]['tokens']==[activity['token']],'Generic controls view missing')
            assert len(peer.actions)==before
            capture(fixture_name+'-visible-slots',.1)
            button('Down');button('Down');button('Select')
            await_condition(lambda:len(peer.actions)==before+1,'Generic control dispatch missing')
            assert peer.actions[-1][key('DB_ACTION')]==expected and peer.actions[-1][key('DB_TOKEN')]==activity['token']
            if fixture_name=='generic-sparse-controls':
                # Remove focused slot2 on a live update; surviving slot0 owns the next press.
                activity['controls'][2]='';activity['flags']&=~32768;activity['version']+=1;peer.publish();before=len(peer.actions);button('Select')
                await_condition(lambda:len(peer.actions)==before+1,'Removed focus did not normalize')
                assert peer.actions[-1][key('DB_ACTION')]==0
                capture('sparse-control-focus-removed',.1)
            button('Back');await_condition(lambda:active_mode()==0,'Controls Back did not restore Snapshot')
        proofs.append({'check':'Two controls show no invented third row; sparse 0/2 and sole slot1 retain original dispatch indices, stay bounded, and normalize focus after live removal','passed':True})
        with peer.lock:peer.activities=[];peer.notice=None
        peer.publish();select_snapshot(7);capture('snapshot-idle-neutral',.1)
        before=counts();button('Select',.75);assert counts()==before
        proofs.append({'check':'Snapshot with no activity or notification uses a neutral idle state and safely retains configured pins','passed':True})
        with peer.lock:peer.activities=saved_activities;peer.pins=saved_pins;peer.notice=saved_notice;peer.action_behavior='success'
        peer.publish();select_snapshot(1)
    def write_report(result='PASS'):
        report={'result':result,'version':json.loads((ROOT/'package.json').read_text())['version'],
            'scope':'Real native Emery QEMU UI and AppMessage requests with an explicit fictional protocol peer; no phone JavaScript, live plugins, real app launches or physical watch.',
            'focusedNotificationsOnly':notifications_only,'focusedUxOnly':ux_only,'focusedReliabilityOnly':reliability_only,'pausedMediaReproduction':paused_repro,'focusedActivitiesOnly':activities_only,'focusedStartupThemeOnly':startup_theme_only,'candidatePbwSha256':digest(pbw.read_bytes()),'nativeOnlyPbwSha256':digest(native.read_bytes()),
            'nativePayloadSha256':{name:digest(data) for name,data in payload.items()},'phoneJavascriptExecuted':False,
            'stateDirectory':str(state_dir),'freshIsolatedFlash':fresh_flash,'session':peer.session,'checks':proofs,'captures':captures,'themePixelChecks':theme_samples,
            'requests':[{str(k):v for k,v in request.items()} for request in requests],
            'mockActions':[{str(k):v for k,v in request.items()} for request in peer.actions],
            'mockAppOpens':[{str(k):v for k,v in request.items()} for request in peer.opens],
            'visualReview':{'reviewed':False}}
        (output/'emulator.json').write_text(json.dumps(report,indent=2)+'\n')
        print('Dashboard native emulator smoke PASS:',len(captures),'captures,',len(proofs),'behavior checks',flush=True)
        return report

    try:
        p.send_packet(TimeMessage(message=SetUTC(unix_time=int(time.time()),utc_offset=0,tz_name='UTC')))
        send_data_to_qemu(p.transport,QemuBluetoothConnection(connected=True));send_data_to_qemu(p.transport,QemuBattery(percent=85,charging=False))
        ToolAppInstaller(p,str(native),quiet=True).install();p.send_packet(AppRunState(data=AppRunStateStart(uuid=target)))
        if startup_theme_only:
            await_condition(lambda:peer.view is not None,'First native HELLO missing',12)
            assert not peer.frames
            themed_capture('startup-first-ever-default-light-guide',False)
            peer.respond=True;peer.publish()
            proofs.append({'check':'Fresh isolated first launch defaults to light before receiving any phone frame, retaining the first-use guide','passed':True})
        await_condition(lambda:peer.view is not None and bool(peer.frames),'Native HELLO/frame exchange missing',12)
        primary_roi=(4,29,162,102);notice_roi=(4,108,162,151)
        guide_pixels=capture('first-use-button-guide',.1);before=counts()
        button('Down');button('Select',.75);assert counts()==before
        button('Select');assert counts()==before
        dismissed=capture('first-use-guide-dismissed',.1)
        assert guide_pixels!=dismissed
        proofs.append({'check':'First-use native button guide explains controls; dismissal consumes Select without dispatching an action or app launch','passed':True})
        restart_without_guide()
        if startup_theme_only:
            def restart_withheld(name,dark,online):
                peer.respond=False;previous=peer.session;frames=len(peer.frames)
                p.send_packet(AppRunState(data=AppRunStateStop(uuid=target)));time.sleep(.25)
                p.send_packet(AppRunState(data=AppRunStateStart(uuid=target)))
                if online:
                    await_condition(lambda:peer.session!=previous,'Relaunch did not establish a fresh native session',12)
                    assert peer.view.get(key('DB_TOKEN'),0)==0,'Startup restored an old selection binding'
                else:time.sleep(.4)
                await_condition(lambda:getattr(p.send_and_read(AppRunState(data=AppRunStateRequest()),AppRunState).data,'uuid',None)==target,'Native foreground did not settle after restart',4)
                pixels=themed_capture(name,dark)
                assert len(peer.frames)==frames,'Withheld phone unexpectedly sent a display frame'
                return {'previousConnectedSession':previous,'newConnectedSession':peer.session if online else None,'online':online,'phoneFramesSent':0}
            before=counts()
            dark_restart=restart_withheld('startup-dark-loading-without-phone-frame',True,True)
            # Decode-valid, wrong-request data must not change or persist theme.
            rejected=peer.frame();rejected['request']+=1;rejected['dark']=False
            send({key('DB_DATA'):ByteArray(encode(rejected))})
            themed_capture('startup-dark-rejects-wrong-request-light',True)
            time.sleep(6.2);themed_capture('startup-dark-loading-timeout',True)
            peer.dark=False;peer.respond=True;peer.publish();themed_capture('startup-first-valid-light-snapshot',False)
            light_restart=restart_withheld('startup-light-loading-without-phone-frame',False,True)
            time.sleep(6.2);themed_capture('startup-light-loading-timeout',False)
            send_data_to_qemu(p.transport,QemuBluetoothConnection(connected=False));time.sleep(26)
            light_offline=restart_withheld('startup-light-offline-relaunch',False,False)
            previous=peer.session;previous_request=peer.view.get(key('DB_REQUEST'));peer.respond=False
            send_data_to_qemu(p.transport,QemuBluetoothConnection(connected=True))
            await_condition(lambda:peer.session!=previous or peer.view.get(key('DB_REQUEST'))!=previous_request,'Offline process did not send a new HELLO request after reconnect',12)
            peer.dark=True;peer.respond=True;peer.publish();themed_capture('startup-first-valid-dark-after-reconnect',True)
            send_data_to_qemu(p.transport,QemuBluetoothConnection(connected=False));time.sleep(26)
            dark_offline=restart_withheld('startup-dark-offline-relaunch',True,False)
            assert counts()==before==(0,0)
            proofs.append({'check':'Confirmed dark and light themes survive process relaunch with all phone frames withheld, six-second loading timeout and actual stock-debounced offline startup','passed':True,'darkRestart':dark_restart,'lightRestart':light_restart,'lightOffline':light_offline,'darkOffline':dark_offline,'disconnectWaitSecondsEach':26})
            proofs.append({'check':'A wrong-request frame cannot change theme; first accepted snapshots switch dark to light and light to dark, and the new confirmed theme persists','passed':True})
            proofs.append({'check':'Guide dismissal remains saved, connected restarts use fresh native sessions and no restored selected token; no action or app-open replay occurs','passed':True})
            assert not errors
            return write_report()
        if paused_repro or activities_only:
            snapshot_home()
            with peer.lock:
                originals=copy.deepcopy(peer.activities)
                music=copy.deepcopy(next(x for x in originals if x['token']==2))
                music['flags']&=~32;music['value']='Playing';music['controls'][1]='Pause'
                peer.activities=[music]+[x for x in originals if x['token']!=2]
            peer.publish();select_snapshot(3)
            active=capture('media-primary-active-unselected',.1)
            music['flags']|=32;music['value']='Paused';music['controls'][1]='Play';music['version']+=1
            peer.publish();paused=capture('media-primary-paused-unselected',.1)
            def crop(pixels,bounds):return Image.frombytes('RGB',(200,228),pixels).crop(bounds).tobytes()
            identical=crop(active,primary_roi)==crop(paused,primary_roi)
            if paused_repro:
                assert identical
                proofs.append({'check':'Paused Media primary is pixel-identical to active when another row is selected; playback state is invisible','reproduced':True,'region':primary_roi})
                return write_report('REPRODUCED')
            assert not identical
            music['subtitle']='';music['version']+=1;peer.publish();paused_empty=capture('media-paused-no-artist',.1)
            music['flags']&=~32;music['value']='Playing';music['version']+=1;peer.publish();active_empty=capture('media-active-no-artist',.1)
            assert crop(paused_empty,primary_roi)!=crop(active_empty,primary_roi)
            music['flags']|=32;music['value']='Paused';music['version']+=1;peer.publish();button('Up',.75)
            await_condition(lambda:active_mode()==1,'Activities list did not open');capture('media-paused-activity-list',.1);button('Back')
            proofs.append({'check':'Paused Media is visible in the existing primary/footer and list row, with and without artist, independently of sidebar selection','passed':True})

            # Use the actual public summary projection, not a hand-corrected
            # media flag. A standard activity is allowed to use the media icon.
            projection="""
const summary=require('pebble-activities/summary'),sources=require('./src/pkjs/sources');
const provider='11111111-2222-4333-8444-555555555555',seconds=2000000000;
const record=summary.standard('recording',{name:'Recorder',icon:'media',headline:summary.countdown({deadline:seconds+300}),actions:[{id:'stop',label:'Stop',action:'stop',args:{id:'recording'},semantic:'stop'}],openApp:{watchAppUuid:'22222222-2222-4333-8444-555555555555'}});
const card=summary.toView({provider,record,revision:1,observedAt:seconds,validUntil:seconds+3600,private:false});
const item=sources.fromActivity(card,[{uuid:provider,actions:[{name:'stop'}]}],seconds);
item.token=91;item.version=1;process.stdout.write(JSON.stringify(item));
"""
            standard=json.loads(subprocess.check_output(['node','-e',projection],cwd=ROOT,text=True))
            assert not standard['flags']&4 and standard['kind']==2 and standard['clockMode']==1
            assert standard['controls']==['Stop','',''] and standard['anchor']==peer.fixture_now+300
            (output/'standard-media-icon-projection.json').write_text(json.dumps(standard,indent=2)+'\n')
            with peer.lock:peer.activities=[standard]
            peer.publish();select_snapshot(91);capture('standard-media-icon-countdown',.1)
            before=counts();button('Select');await_condition(lambda:active_mode()==3,'Generic controls did not open')
            assert counts()==before;capture('standard-media-icon-stop-controls',.1)
            button('Select');await_condition(lambda:len(peer.actions)==before[0]+1,'Generic Stop intent missing')
            assert peer.actions[-1][key('DB_TOKEN')]==91 and peer.actions[-1][key('DB_ACTION')]==0
            button('Back');before=len(peer.opens);button('Select',.75)
            await_condition(lambda:len(peer.opens)==before+1,'Standard media-icon destination missing')
            assert peer.opens[-1][key('DB_TOKEN')]==91
            proofs.append({'check':'Real summary.standard media-icon projection encodes/displays its countdown and generic Stop control; tap opens controls, original slot0 dispatches, and hold retains the same exact destination token','passed':True})

            # A second complete frame must not silently select the new primary.
            with peer.lock:peer.activities=[music]
            peer.publish();capture('withdrawn-selection-inert',2.2)
            peer.publish();capture('withdrawn-selection-repeated-frame-inert',.1)
            before=counts();button('Select');button('Select',.75);assert counts()==before
            button('Down');await_condition(lambda:peer.view.get(key('DB_TOKEN')) in (2,3),'Explicit navigation did not recover a current row')
            recovered=peer.view[key('DB_TOKEN')];capture('withdrawn-selection-navigation-recovered',.1)
            assert recovered in peer.frames[-1]['tokens']
            button('Up',.75);await_condition(lambda:active_mode()==1,'Explicit collection navigation remained inert')
            capture('withdrawn-selection-collection-recovered',.1)
            proofs.append({'check':'A withdrawn selected activity remains inert through repeated complete frames and Select/hold; deliberate navigation and collection entry recover current rows','passed':True})
            assert not errors
            return write_report()
        if reliability_only:
            def inject(frame):
                send({key('DB_DATA'):ByteArray(encode(frame))})
                with peer.lock:peer.frames.append({'request':frame['request'],'sequence':frame['sequence'],'mode':frame['mode'],'offset':frame['offset'],'tokens':[x['token'] for x in frame['items']]})
            snapshot_home()
            with peer.lock:
                original_activities=copy.deepcopy(peer.activities);original_pins=copy.deepcopy(peer.pins);original_notice=copy.deepcopy(peer.notice)
            frame=peer.frame();timer=frame['items'][0]
            timer.update(clockMode=1,anchor=frame['now']+3,baseSeconds=0,validUntil=frame['now']+90)
            inject(frame)
            before=capture('countdown-before-zero',.1);time.sleep(3.2)
            zero=capture('countdown-final-zero',.1);still=capture('countdown-zero-still',1.2)
            reference=copy.deepcopy(frame)
            with peer.lock:peer.sequence+=1;reference['sequence']=peer.sequence
            reference['items'][0]['anchor']=0
            inject(reference);expected=capture('countdown-zero-reference',.1)
            def crop(pixels,bounds):return Image.frombytes('RGB',(200,228),pixels).crop(bounds).tobytes()
            assert crop(before,primary_roi)!=crop(zero,primary_roi)
            assert crop(zero,primary_roi)==crop(still,primary_roi)==crop(expected,primary_roi)
            proofs.append({'check':'A running countdown paints exact00:00 before stopping second redraws; final pixels match an explicit zero-clock reference without inferring owner completion','passed':True})

            # Static zero above leaves a MINUTE subscription. The next one-
            # second clock therefore finishes on the SDK's first SECOND tick,
            # whose units_changed is zero. Set only this isolated fixture RTC
            # to establish an exact one-second window; no native alarms exist.
            first_tick=copy.deepcopy(reference);first_tick['now']=int(time.time())
            p.send_packet(TimeMessage(message=SetUTC(unix_time=first_tick['now'],utc_offset=0,tz_name='UTC')))
            with peer.lock:peer.sequence+=1;first_tick['sequence']=peer.sequence
            first_tick['items'][0].update(anchor=first_tick['now']+1,validUntil=first_tick['now']+90)
            inject(first_tick);one=capture('first-second-callback-before-zero',0)
            completed=capture('first-second-callback-final-zero',1.2)
            first_reference=copy.deepcopy(first_tick)
            with peer.lock:peer.sequence+=1;first_reference['sequence']=peer.sequence
            first_reference['items'][0]['anchor']=0;inject(first_reference)
            expected=capture('first-second-callback-zero-reference',.1)
            assert crop(one,primary_roi)!=crop(completed,primary_roi)
            assert crop(completed,primary_roi)==crop(expected,primary_roi)
            proofs.append({'check':'A new one-second clock from a static view paints00:00 on the SDK zero-unit first tick; pixels match an explicit zero reference','passed':True,'isolatedFixtureClockSet':True})

            # With no running clock, an unavailable reading's independent
            # capability still needs the absolute expiry callback, not the
            # next minute tick. All fields below are fictional peer data.
            with peer.lock:
                peer.activities=[];peer.notice=None
                pin=copy.deepcopy(next(x for x in original_pins if x['token']==5))
                pin['flags']=1|2|8|16;pin['value']='—';pin['subtitle']='No data';pin['appLabel']='Home'
                peer.pins=[pin]
            frame=peer.frame();frame['items'][0]['validUntil']=frame['now']+5
            inject(frame);select_snapshot(5)
            before=capture('unavailable-capability-before-expiry',.1);time.sleep(5.2)
            expired=capture('unavailable-capability-expired',.1)
            assert crop(before,(4,154,162,225))!=crop(expired,(4,154,162,225))
            before_actions=counts();button('Select');button('Select',.75);assert counts()==before_actions
            proofs.append({'check':'Without running clocks, a short private unavailable-pin lease clears its identity and independent action/app binding; expired tap/hold cannot dispatch','passed':True})

            with peer.lock:
                generic=next(x for x in original_activities if x.get('controls') and x.get('kind')!=2)
                peer.activities=[generic]+[x for x in original_activities if x['token']!=generic['token']]
                peer.pins=original_pins;peer.notice=original_notice
            peer.publish();select_snapshot(generic['token']);button('Select')
            await_condition(lambda:active_mode()==3,'Generic controls did not open')
            peer.respond=False;button('Back');await_condition(lambda:active_mode()==0,'Back did not request Snapshot')
            bootstrap=peer.frame();bootstrap['status']=0;bootstrap['items']=[x for x in bootstrap['items'] if x['token']!=generic['token']];bootstrap['total']=len(bootstrap['items'])
            inject(bootstrap);capture('requested-target-bootstrap-inert',.1)
            before_actions=counts();button('Select');button('Select',.75);assert counts()==before_actions
            peer.respond=True;peer.publish();capture('requested-target-restored',.1);button('Select')
            await_condition(lambda:active_mode()==3 and peer.view.get(key('DB_TOKEN'))==generic['token'],'Exact requested target was not restored after bootstrap')
            proofs.append({'check':'A requested identity omitted during LOADING stays inert instead of retargeting another action; exact identity returns after bootstrap','passed':True})
            assert not errors
            return write_report()
        if ux_only:
            ux_checks();assert not errors;return write_report()
        if notifications_only:
            # Explicitly fictional launcher binding. Real host destination and
            # SDK execution are independently verified by packaged-runtime QA.
            empty=json.loads((ROOT/'tests/fixtures/overview-empty-notifications.json').read_text())
            with peer.lock:
                original_notice=copy.deepcopy(peer.notice)
                peer.notice=copy.deepcopy(next(x for x in empty['items'] if x['role']==1));peer.notice['version']=2
            peer.publish();capture('empty-notifications-snapshot')
            assert peer.frames[-1]['tokens'][1]==3 and len(peer.frames[-1]['tokens'])==4
            button('Down');await_condition(lambda:peer.view.get(key('DB_TOKEN'))==3,'Empty notification row cannot be selected')
            empty_pixels=capture('empty-notifications-selected')
            before=counts();button('Select')
            await_condition(lambda:len(peer.opens)==before[1]+1,'Empty notification row did not request Notifications')
            opened=peer.opens[-1]
            assert len(peer.actions)==before[0] and active_mode()==0 and opened[key('DB_TOKEN')]==3 and opened[key('DB_VERSION')]==2
            assert opened[key('DB_SESSION')]==peer.session and opened[key('DB_OPERATION')]==4
            proofs.append({'check':'Empty Notifications is a real selectable Snapshot row; tap sends exactly one bound OPEN with current session/token/version and no ACTION','passed':True})
            button('Down');await_condition(lambda:peer.view.get(key('DB_TOKEN'))==4,'Down did not leave empty notification row')
            button('Up');await_condition(lambda:peer.view.get(key('DB_TOKEN'))==3,'Up did not restore empty notification selection')
            before=counts();button('Select',.75)
            await_condition(lambda:len(peer.opens)==before[1]+1,'Held Select on empty notification row did not request its app')
            assert len(peer.actions)==before[0] and peer.opens[-1][key('DB_TOKEN')]==3
            proofs.append({'check':'Empty Notifications participates in ordinary Up/Down navigation; held Select opens once without an added tap/action','passed':True})
            before=counts();send_data_to_qemu(p.transport,QemuButton(state=int(QemuButton.Button.Select)));time.sleep(.12)
            with peer.lock:peer.notice['version']=3;peer.notice['subtitle']='Open notifications'
            peer.publish();time.sleep(.12);send_data_to_qemu(p.transport,QemuButton(state=0));time.sleep(.25)
            assert counts()==before
            capture('notifications-shortcut-waiting')
            button('Select');await_condition(lambda:len(peer.opens)==before[1]+1,'Waiting Notifications shortcut did not request its app')
            assert len(peer.actions)==before[0] and peer.opens[-1][key('DB_VERSION')]==3
            proofs.append({'check':'Waiting/error shortcut is also selectable; source revision during a press cancels the stale OPEN before the rebound shortcut can open','passed':True})
            with peer.lock:peer.notice=original_notice;peer.notice['version']=4
            peer.publish();private_pixels=capture('notification-private-preview')
            private_frame=peer.frame()
            next(x for x in private_frame['items'] if x['role']==1)['validUntil']=private_frame['now']+1
            send({key('DB_DATA'):ByteArray(encode(private_frame))})
            expired_pixels=capture('notification-expired-inert')
            assert Image.frombytes('RGB',(200,228),private_pixels).crop(notice_roi).tobytes()!=Image.frombytes('RGB',(200,228),expired_pixels).crop(notice_roi).tobytes()
            before=counts();button('Select');button('Select',.75);assert counts()==before
            proofs.append({'check':'Private notice expiry erases its preview and keeps the row inert until an explicit current public launcher binding arrives','passed':True})
            with peer.lock:peer.notice=copy.deepcopy(next(x for x in empty['items'] if x['role']==1));peer.notice['version']=5
            peer.publish();capture('empty-notifications-rebound')
            before=counts();button('Select');await_condition(lambda:len(peer.opens)==before[1]+1,'Rebound empty notification row did not open')
            assert len(peer.actions)==before[0] and peer.opens[-1][key('DB_TOKEN')]==3 and peer.opens[-1][key('DB_VERSION')]==5
            assert peer.view.get(key('DB_TOKEN'))==3
            proofs.append({'check':'Explicit empty launcher rebind preserves the selected row and uses its new version for exactly one OPEN','passed':True})
            peer.empty=True;peer.publish()
            await_condition(lambda:peer.view.get(key('DB_TOKEN'))==3 and peer.view.get(key('DB_INDEX'))==0,'Notification selection did not survive removing all activities')
            capture('empty-notifications-no-activity')
            before=counts();button('Select');await_condition(lambda:len(peer.opens)==before[1]+1,'Empty Notifications with no activity did not open')
            assert len(peer.actions)==before[0] and peer.opens[-1][key('DB_TOKEN')]==3 and active_mode()==0
            proofs.append({'check':'Empty Notifications also remains selected and opens when no activity exists','passed':True})
            assert not errors
            return write_report()
        first_clock=capture('snapshot-light');time.sleep(1.2);next_clock=capture('snapshot-ticking')
        first_image=Image.frombytes('RGB',(200,228),first_clock);next_image=Image.frombytes('RGB',(200,228),next_clock)
        assert first_image.crop(primary_roi).tobytes()!=next_image.crop(primary_roi).tobytes()
        assert len(peer.frame()['items'])==4
        proofs.append({'check':'Four-item Snapshot shows one activity, one notification and two pins; countdown advances locally','passed':True})
        before=counts();button('Select');assert counts()==before
        proofs.append({'check':'Timer tap has no action or enlarged view','passed':True})
        button('Select',.72);await_condition(lambda:len(peer.opens)==before[1]+1,'Timer associated app not requested')
        assert peer.opens[-1][key('DB_TOKEN')]==1 and len(peer.actions)==before[0]
        proofs.append({'check':'Timer hold requests exactly one associated app and no action','passed':True})
        # Exercise the actual primary Music renderer before longer lifecycle QA.
        # This peer only records requests; it never executes a real phone action.
        with peer.lock:
            original_activities=list(peer.activities);music=next(x for x in peer.activities if x['token']==2)
            peer.activities=[music]+[x for x in peer.activities if x['token']!=2]
        peer.publish();button('Down');button('Up');capture('music-playing')
        before=counts();button('Select')
        await_condition(lambda:len(peer.actions)==before[0]+1,'Primary Music tap did not dispatch directly')
        assert active_mode()==0 and peer.actions[-1][key('DB_TOKEN')]==2 and peer.actions[-1][key('DB_ACTION')]==1
        assert music['value']=='Paused';capture('music-paused')
        before=counts();button('Select',.75)
        await_condition(lambda:len(peer.opens)==before[1]+1,'Music hold did not request its app')
        assert len(peer.actions)==before[0] and peer.opens[-1][key('DB_TOKEN')]==2 and active_mode()==0
        proofs.append({'check':'Primary Music tap dispatches slot1 directly; hold opens its app exactly once without toggling','passed':True})
        before=len(peer.actions);button('Select');await_condition(lambda:len(peer.actions)==before+1,'Music resume request missing')
        assert peer.actions[-1][key('DB_ACTION')]==1 and music['value']=='Playing';capture('music-resumed')
        button('Up',.75);await_condition(lambda:active_mode()==1 and peer.frames[-1]['mode']==1,'Music collection did not open')
        before=len(peer.actions);button('Select');await_condition(lambda:len(peer.actions)==before+1,'Music collection tap did not dispatch directly')
        assert active_mode()==1 and peer.actions[-1][key('DB_TOKEN')]==2 and peer.actions[-1][key('DB_ACTION')]==1
        capture('music-in-activities')
        before=counts();button('Select',.75);await_condition(lambda:len(peer.opens)==before[1]+1,'Music list hold did not open app')
        assert len(peer.actions)==before[0] and active_mode()==1
        button('Back');await_condition(lambda:active_mode()==0,'Music collection Back did not restore Snapshot')
        proofs.append({'check':'Music list tap is also direct; Back restores Snapshot without an intermediate media view','passed':True})
        # Default values/icons and deliberate custom aliases use the same native
        # renderer and protocol as ordinary data, without altering screenshot pixels.
        with peer.lock:
            peer.activities=original_activities
            defaults=list(peer.pins)
            by_token={x['token']:x for x in peer.pins}
            peer.pins=[by_token[6],by_token[8]]+[x for x in defaults if x['token'] not in (6,8)]
        peer.publish();capture('default-value-pins')
        with peer.lock:peer.pins=[by_token[7],by_token[6]]+[x for x in defaults if x['token'] not in (7,6)]
        peer.publish();capture('default-action-and-value-pins')
        with peer.lock:
            peer.pins=[by_token[5],by_token[7]]+[x for x in defaults if x['token'] not in (5,7)]
            alias=by_token[5]['title'];by_token[5]['title']='Desk lamp';by_token[5]['version']+=1
        peer.publish();capture('custom-pin-alias')
        with peer.lock:
            by_token[5]['title']=alias;by_token[5]['version']+=1
            peer.pins=[by_token[token] for token in (4,5,6,7,8)]+[x for x in defaults if x['token'] not in (4,5,6,7,8)]
            baseline_pins=list(peer.pins);baseline_notice=peer.notice
            long=json.loads((ROOT/'tests/fixtures/overview-long.json').read_text())
            peer.activities=[copy.deepcopy(x) for x in long['items'] if x['role']==0]
            peer.notice=copy.deepcopy(next(x for x in long['items'] if x['role']==1))
            peer.pins=[copy.deepcopy(x) for x in long['items'] if x['role']==2]
        peer.publish();capture('snapshot-long-text')
        with peer.lock:peer.activities=original_activities;peer.notice=baseline_notice;peer.pins=baseline_pins
        peer.publish();button('Down');button('Up')
        proofs.append({'check':'Native captures cover primary Music states, default value/action icons, a custom pin alias and long text','passed':True})
        # With one activity, the next Snapshot item is the notification.
        before=len(peer.opens);button('Down');button('Select')
        await_condition(lambda:len(peer.opens)==before+1,'Notification did not request its app')
        assert peer.opens[-1][key('DB_TOKEN')]==3 and active_mode()==0
        capture('notification-selected');proofs.append({'check':'Notification tap directly requests native Notifications','passed':True})
        button('Down');before=counts();button('Select');assert counts()==before and active_mode()==0
        capture('weather-read-only');proofs.append({'check':'Value-only pin tap has no action or enlarged screen','passed':True})
        with peer.lock:peer.pins[0]['flags']|=16;peer.pins[0]['version']+=1
        peer.publish();before=len(peer.opens);button('Select',.72)
        await_condition(lambda:len(peer.opens)==before+1,'Independent pin app route was blocked by missing reading')
        assert peer.opens[-1][key('DB_TOKEN')]==4;capture('weather-unavailable-app-available')
        with peer.lock:peer.pins[0]['flags']&=~16;peer.pins[0]['version']+=1
        peer.publish();button('Down')
        with peer.lock:peer.pins[1]['flags']|=16;peer.pins[1]['version']+=1
        peer.publish();before=len(peer.actions);button('Select')
        await_condition(lambda:len(peer.actions)==before+1,'Independent pin action was blocked by missing reading')
        assert peer.actions[-1][key('DB_TOKEN')]==5;capture('light-unavailable-action-available')
        with peer.lock:peer.pins[1]['flags']&=~16;peer.pins[1]['version']+=1
        peer.publish();proofs.append({'check':'Unavailable reading does not disable an independent declared pin action or app route','passed':True})
        capture('light-confirmed-off')
        before=counts();button('Select',.75);assert counts()==before
        proofs.append({'check':'Pin with no app ignores held Select without also toggling','passed':True})
        button('Up',.75);await_condition(lambda:active_mode()==1 and peer.frames[-1]['mode']==1,'Activities hold did not open collection');capture('all-activities')
        button('Down',1.8);await_condition(lambda:any(x['offset']>0 for x in peer.frames if x['mode']==1),'Activity list did not page');capture('activities-last')
        before_actions=len(peer.actions);button('Select')
        await_condition(lambda:active_mode()==3 and peer.frames[-1]['tokens']==[12],'Generic activity controls missing');capture('generic-activity-controls')
        button('Select');await_condition(lambda:len(peer.actions)==before_actions+1,'Generic activity action missing')
        assert peer.actions[-1][key('DB_TOKEN')]==12 and peer.actions[-1][key('DB_ACTION')]==0
        button('Back');await_condition(lambda:active_mode()==1,'Generic controls did not return to collection')
        proofs.append({'check':'Generic activity still opens useful labelled controls and runs its first available action','passed':True})
        button('Back');await_condition(lambda:active_mode()==0,'Activities Back failed')
        before=len(peer.actions);button('Select');await_condition(lambda:len(peer.actions)==before+1,'Overview light selection lost after list Back')
        assert peer.actions[-1][key('DB_TOKEN')]==5
        proofs.append({'check':'Activities hold opens once; list hold pages; Back restores the Snapshot pin','passed':True})
        button('Down',.75);await_condition(lambda:active_mode()==2 and peer.frames[-1]['mode']==2,'Pinned hold did not open list');capture('all-pinned')
        before_actions=len(peer.actions);button('Down',3.3)
        await_condition(lambda:peer.frames[-1]['offset']==7,'Pinned hold did not reach final window');capture('pinned-last')
        assert active_mode()==2 and len(peer.actions)==before_actions
        before=len(peer.opens);button('Select',.75);await_condition(lambda:len(peer.opens)==before+1,'Final pin not selected after held scrolling')
        assert peer.opens[-1][key('DB_TOKEN')]==26
        proofs.append({'check':'Held Down reaches12thpin; release adds no move, group switch or item action','passed':True})
        button('Up',3.3);before=counts();button('Select');assert counts()==before
        before=len(peer.opens);button('Select',.72);await_condition(lambda:len(peer.opens)==before+1,'Held Up did not return first pin')
        assert peer.opens[-1][key('DB_TOKEN')]==4
        proofs.append({'check':'Held Up returns to first pin in the same collection','passed':True})
        stable_before=capture('pinned-stable-before-stale')
        wrong=peer.frame();wrong['request']=max(1,wrong['request']-1);wrong['dark']=True
        send({key('DB_DATA'):ByteArray(encode(wrong))});stable_after=capture('pinned-stable-after-stale')
        # Header time may cross a minute independently of this stale reply.
        assert Image.frombytes('RGB',(200,228),stable_before).crop((0,22,200,228)).tobytes()==Image.frombytes('RGB',(200,228),stable_after).crop((0,22,200,228)).tobytes()
        proofs.append({'check':'Outdated view reply cannot replace the current native page','passed':True})
        button('Down');before_actions=len(peer.actions)
        send_data_to_qemu(p.transport,QemuButton(state=int(QemuButton.Button.Select)));time.sleep(.12)
        with peer.lock:peer.pins[1]['version']+=1
        peer.publish();time.sleep(.12);send_data_to_qemu(p.transport,QemuButton(state=0));time.sleep(.25)
        assert len(peer.actions)==before_actions
        proofs.append({'check':'Source revision change during Select cancels the stale press','passed':True})
        button('Up',3.3)
        for _ in range(4):button('Down')
        await_condition(lambda:peer.view.get(key('DB_TOKEN'))==8,'Native local focus was not reported')
        with peer.lock:
            extra=copy.deepcopy(peer.pins[5]);extra['token']=77;extra['title']='Inserted pin';peer.pins.insert(0,extra)
        peer.publish();capture('pinned-live-insert')
        button('Up');await_condition(lambda:peer.view.get(key('DB_TOKEN'))==7,'Live insertion lost the selected source')
        proofs.append({'check':'Native local focus survives insertion beyond the old page boundary','passed':True})
        peer.dark=True;peer.publish();capture('pinned-dark');snapshot_home()
        with peer.lock:peer.activities=[music]+[x for x in peer.activities if x['token']!=2]
        peer.publish();private_before=capture('snapshot-dark')
        expired=peer.frame()
        for item in expired['items']:
            if item['flags']&8:item['validUntil']=expired['now']-1
        send({key('DB_DATA'):ByteArray(encode(expired))});expired_pixels=capture('private-lease-expired')
        before_image=Image.frombytes('RGB',(200,228),private_before);expired_image=Image.frombytes('RGB',(200,228),expired_pixels)
        assert before_image.crop(primary_roi).tobytes()!=expired_image.crop(primary_roi).tobytes()
        assert before_image.crop(notice_roi).tobytes()!=expired_image.crop(notice_roi).tobytes()
        proofs.append({'check':'Shortened private lease clears Music and notification pixels immediately','passed':True})
        peer.publish();private_before=capture('private-source-restored')
        send_data_to_qemu(p.transport,QemuBluetoothConnection(connected=False));time.sleep(26);private_after=capture('phone-disconnected')
        before_image=Image.frombytes('RGB',(200,228),private_before);after_image=Image.frombytes('RGB',(200,228),private_after)
        assert before_image.crop(primary_roi).tobytes()!=after_image.crop(primary_roi).tobytes()
        assert before_image.crop(notice_roi).tobytes()!=after_image.crop(notice_roi).tobytes()
        proofs.append({'check':'SDK-reported disconnect clears private primary Music and notification regions','passed':True,'sdkDebounceSeconds':25,
            'transportNote':'QEMU connection event and standard SDK debounce; protocol transport stays active, no real Bluetooth/phone link.'})
        send_data_to_qemu(p.transport,QemuBluetoothConnection(connected=True));time.sleep(.5)
        peer.dark=False;peer.empty=True;peer.publish();button('Up',.72)
        await_condition(lambda:active_mode()==1 and peer.frames[-1]['tokens']==[],'Empty Activities list missing');capture('activities-empty')
        before=counts();button('Select');button('Select',.72);assert counts()==before;button('Down',.8);assert active_mode()==1
        proofs.append({'check':'Empty Activities accepts navigation and no-op actions safely','passed':True})
        button('Back');peer.respond=False;button('Down',.75);capture('loading');time.sleep(6.1);capture('loading-timeout')
        peer.respond=True;peer.publish();capture('recovered-pinned')
        proofs.append({'check':'View timeout leaves usable UI; a matching late reply recovers','passed':True})
        old_session=peer.session;old_frame=peer.frame()
        with peer.lock:peer.session=0;peer.sequence=0;peer.view=None;peer.empty=False;peer.activities=original_activities
        send({key('DB_OPERATION'):Uint32(6)})
        await_condition(lambda:peer.session not in (0,old_session) and peer.frames[-1]['mode']==0,'Phone restart did not create a fresh native epoch')
        await_condition(lambda:any(x.get(key('DB_OPERATION'))==7 and x.get(key('DB_SESSION'))==peer.session for x in requests),'Fresh sequence1 frame not accepted after phone restart')
        capture('phone-runtime-restarted');send({key('DB_DATA'):ByteArray(encode(old_frame))});time.sleep(.2)
        assert peer.session!=old_session
        before=len(peer.opens);button('Select',.72);await_condition(lambda:len(peer.opens)==before+1,'Fresh runtime controls unavailable after restart')
        assert peer.opens[-1][key('DB_TOKEN')]==1 and peer.opens[-1][key('DB_SESSION')]==peer.session
        proofs.append({'check':'Phone-runtime restart accepts sequence1 in a fresh epoch; stale prior-session frame cannot replace it','passed':True})
        ux_checks()
        assert not errors
        return write_report()
    finally:
        stopped.set();thread.join(timeout=1)
        for handle in handles:service.unregister_handler(handle)
        service.shutdown();encoder.terminate()


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--pbw',type=Path,default=ROOT/('dist/Dashboard-'+VERSION+'.pbw'))
    parser.add_argument('--output',type=Path,default=ROOT/('docs/qa/'+VERSION+'/native'))
    parser.add_argument('--expected-sha256',help='Require these exact candidate bytes before installing')
    parser.add_argument('--notifications-only',action='store_true',help='Focused empty Notifications navigation, expiry and app-open checks')
    parser.add_argument('--ux-only',action='store_true',help='Focused guide, feedback, hold preview, confirmation, sparse controls and idle UX checks')
    parser.add_argument('--reliability-only',action='store_true',help='Focused final-zero paint, exact unavailable capability expiry and inert bootstrap identity checks')
    parser.add_argument('--paused-media-repro',action='store_true',help='Record the old invisible paused-primary bug against a supplied baseline PBW')
    parser.add_argument('--activities-only',action='store_true',help='Focused activity presentation/selection checks')
    parser.add_argument('--startup-theme-only',action='store_true',help='Focused first-launch, cached dark/light startup, timeout, offline and accepted-theme switch checks on fresh flash')
    args=parser.parse_args()
    if sum((args.notifications_only,args.ux_only,args.reliability_only,args.paused_media_repro,args.activities_only,args.startup_theme_only))>1:parser.error('Choose at most one focused suite')
    run(args.pbw,args.output,args.expected_sha256,args.notifications_only,args.ux_only,args.reliability_only,args.paused_media_repro,args.activities_only,args.startup_theme_only)
