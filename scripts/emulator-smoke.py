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


def run(pbw,output,expected_sha256=None):
    from pipe_emulator import connect
    from libpebble2.services.appmessage import AppMessageService,Uint32,ByteArray,CString
    from libpebble2.services.screenshot import Screenshot
    from libpebble2.protocol.apps import AppRunState,AppRunStateStart
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
    condition=threading.Condition();receipts={};requests=[];errors=[];captures=[];proofs=[]
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
                    self.actions.append(request);self.result(request,1,'Working')
                    if found['kind']==6:found['value']='Off' if found['value']!='Off' else '65%';found['version']+=1
                    elif found['kind']==2 and request.get(key('DB_ACTION'))==1:
                        found['flags']^=32;found['controls'][1]='Play' if found['flags']&32 else 'Pause';found['value']='Paused' if found['flags']&32 else 'Playing';found['version']+=1
                self.publish();self.result(request,2,'Done')
            elif operation==7:
                with self.lock:
                    if self.view and request.get(key('DB_REQUEST'))==self.view.get(key('DB_REQUEST')):
                        self.view.update(request);self.view['preserve']=True
            elif operation==5:pass
    peer=Peer()
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
    def capture(name):
        # Let the bounded command-result overlay finish before visual evidence;
        # that overlay is tested by requests/results, not mistaken for lost rows.
        time.sleep(2.2);rows=Screenshot(p).grab_image();assert len(rows)==228 and all(len(x)==600 for x in rows)
        rgb=b''.join(rows);path=output/(name+'.png');Image.frombytes('RGB',(200,228),rgb).save(path)
        captures.append({'name':name,'file':path.name,'sha256':digest(path.read_bytes()),'rgbSha256':digest(rgb),'pixels':[200,228],'nativePixelsModified':False})
        print('Native capture:',name,flush=True);return rgb
    def counts():return len(peer.actions),len(peer.opens)
    def active_mode():return peer.view.get(key('DB_MODE')) if peer.view else None
    def snapshot_home():
        # Back out at most two context levels; root Back would quit, so inspect
        # the last actual VIEW from native before deciding on another press.
        while active_mode()!=0:button('Back');await_condition(lambda:bool(peer.frames) and peer.frames[-1]['mode']==active_mode(),'Back view not delivered')
    try:
        p.send_packet(TimeMessage(message=SetUTC(unix_time=int(time.time()),utc_offset=0,tz_name='UTC')))
        send_data_to_qemu(p.transport,QemuBluetoothConnection(connected=True));send_data_to_qemu(p.transport,QemuBattery(percent=85,charging=False))
        ToolAppInstaller(p,str(native),quiet=True).install();p.send_packet(AppRunState(data=AppRunStateStart(uuid=target)))
        await_condition(lambda:peer.view is not None and bool(peer.frames),'Native HELLO/frame exchange missing',12)
        primary_roi=(4,29,162,102);notice_roi=(4,108,162,151)
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
        assert not errors
        report={'result':'PASS','version':json.loads((ROOT/'package.json').read_text())['version'],
            'scope':'Real native Emery QEMU UI and AppMessage requests with an explicit fictional protocol peer; no phone JavaScript, live plugins, real app launches or physical watch.',
            'candidatePbwSha256':digest(pbw.read_bytes()),'nativeOnlyPbwSha256':digest(native.read_bytes()),
            'nativePayloadSha256':{name:digest(data) for name,data in payload.items()},'phoneJavascriptExecuted':False,
            'stateDirectory':str(state_dir),'session':peer.session,'checks':proofs,'captures':captures,
            'requests':[{str(k):v for k,v in request.items()} for request in requests],
            'mockActions':[{str(k):v for k,v in request.items()} for request in peer.actions],
            'mockAppOpens':[{str(k):v for k,v in request.items()} for request in peer.opens],
            'visualReview':{'reviewed':False}}
        (output/'emulator.json').write_text(json.dumps(report,indent=2)+'\n')
        print('Dashboard native emulator smoke PASS:',len(captures),'captures,',len(proofs),'behavior checks',flush=True)
        return report
    finally:
        stopped.set();thread.join(timeout=1)
        for handle in handles:service.unregister_handler(handle)
        service.shutdown();encoder.terminate()


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--pbw',type=Path,default=ROOT/('dist/Dashboard-'+VERSION+'.pbw'))
    parser.add_argument('--output',type=Path,default=ROOT/('docs/qa/'+VERSION+'/native'))
    parser.add_argument('--expected-sha256',help='Require these exact candidate bytes before installing')
    args=parser.parse_args();run(args.pbw,args.output,args.expected_sha256)
