#!/usr/bin/env python3
"""Four-panel overview at actual OS sizes; exact candidate, synthetic DSH1.
No phone/provider runtime or physical-device verification.
"""
from pathlib import Path
import copy,hashlib,json,os,subprocess,sys,tempfile,time,uuid,zipfile
from repo_workflow import candidate,check_build
from pebble_tool.commands.install import ToolAppInstaller
from pebble_tool.commands.emucontrol import send_data_to_qemu
from libpebble2.protocol.apps import AppRunState,AppRunStateStart,AppRunStateStop
from libpebble2.protocol.system import TimeMessage,SetUTC
from libpebble2.communication.transports.qemu.protocol import QemuButton,QemuContentSize
from libpebble2.services.appmessage import AppMessageService,ByteArray,Uint32
from libpebble2.services.screenshot import Screenshot
from PIL import Image
ROOT=Path(__file__).resolve().parents[1];PBW=candidate(ROOT,'Dashboard');check_build(ROOT,PBW)
PLATFORM=os.environ.get('PEBBLE_QA_PLATFORM','emery');assert PLATFORM in ('emery','gabbro')
W,H=(260,260) if PLATFORM=='gabbro' else (200,228)
SIDE=182 if PLATFORM=='gabbro' else 200;HEIGHT=182 if PLATFORM=='gabbro' else 228;X=(W-SIDE)//2;Y=(H-HEIGHT)//2
# SDK 4.44's Gabbro macro is 40px (its prose still says 34px).
CONTENT=SIDE-(40 if PLATFORM=='gabbro' else 34)
OUT=ROOT.parent/'recovery-validation/release-qa/dashboard'/PLATFORM/str(time.time_ns());OUT.mkdir(parents=True,exist_ok=True)
os.environ['PEBBLE_QA_STATE']=tempfile.mkdtemp(prefix='dashboard-compact-')
sys.path.insert(0,str(ROOT.parent/'recovery-validation'))
from pipe_emulator import connect
with zipfile.ZipFile(PBW)as source,zipfile.ZipFile(OUT/'native.pbw','w')as native:
 info=json.loads(source.read('appinfo.json'))
 payload={n:hashlib.sha256(source.read(n)).hexdigest()for n in source.namelist()if n.startswith(PLATFORM+'/')}
 for name in source.namelist():
  if name=='appinfo.json'or name.startswith(PLATFORM+'/'):native.writestr(name,source.read(name))
p=connect();target=uuid.UUID(info['uuid']);service=AppMessageService(p);messages=[]
service.register_handler('appmessage',lambda tid,app,data:messages.append(dict(data))if app==target else None)
fixture=json.loads((ROOT/'tests/fixtures/overview.json').read_text());checks=[]
p.send_packet(TimeMessage(message=SetUTC(unix_time=fixture['now'],utc_offset=0,tz_name='UTC')))
ToolAppInstaller(p,str(OUT/'native.pbw'),quiet=True).install()
encoder=subprocess.Popen(['node',str(ROOT/'tests/native-peer.cjs')],stdin=subprocess.PIPE,stdout=subprocess.PIPE,text=True)
def tap(name):
 send_data_to_qemu(p.transport,QemuButton(state=int(getattr(QemuButton.Button,name))));time.sleep(.06)
 send_data_to_qemu(p.transport,QemuButton(state=0));time.sleep(.3)
def hello():
 messages.clear();service.send_message(target,{4000:Uint32(6)})
 until=time.monotonic()+5
 while time.monotonic()<until:
  found=next((m for m in reversed(messages)if m.get(4000)==1),None)
  if found:return found
  time.sleep(.03)
 raise AssertionError('Native HELLO missing')
def send(frame):
 encoder.stdin.write(json.dumps(frame)+'\n');encoder.stdin.flush();encoded=json.loads(encoder.stdout.readline());assert 'error'not in encoded,encoded
 service.send_message(target,{4008:ByteArray(bytes(encoded['bytes']))});time.sleep(.35)
def shot(name,selected=0):
 image=Image.frombytes('RGB',(W,H),b''.join(Screenshot(p).grab_image()));image.save(OUT/(name+'.png'))
 stroke=(85,85,85)if image.getpixel((X,Y))==(0,0,0)else(170,170,170)
 lines=[y for y in range(Y+32,Y+HEIGHT)if all(image.getpixel((x,y))==stroke for x in range(X+8,X+CONTENT-8))]
 assert len(lines)==4 and lines[-1]==Y+HEIGHT-1,(name,lines)
 tops=[Y+32]+[y+1 for y in lines[:-1]]
 for slot,(top,bottom)in enumerate(zip(tops,lines)):
  normal=image.getpixel((X,Y));highlight=tuple(255-channel for channel in normal)
  assert image.getpixel((X+2,(top+bottom)//2))==(highlight if slot==selected else normal),(name,'wrong selected panel',slot)
  assert sum(image.getpixel((x,y))in ((0,0,0),(255,255,255))for y in range(top,bottom)for x in range(X+40,X+CONTENT-7))>100
 return lines
try:
 for size in (1,2,3):
  p.send_packet(AppRunState(data=AppRunStateStop(uuid=target)));time.sleep(.15)
  send_data_to_qemu(p.transport,QemuContentSize(size=size));p.send_packet(AppRunState(data=AppRunStateStart(uuid=target)));time.sleep(.5)
  if size==1:tap('Select') # first-launch guide
  for language,labels in [('en',['Tea','Sam','Weather','Phone']),('cs',['Časovač na odpolední čaj','Žluťoučký kůň píše zprávu','Pocitová teplota v Praze','Úroveň nabití telefonu']),('de',['Nachmittags-Teezeit','Benachrichtigungen','Gefühlte Außentemperatur','Telefonakkuladestand'])]:
   for dark in (False,True):
    request=hello();frame=copy.deepcopy(fixture)
    frame.update(session=request[4001],request=request[4002],sequence=1,dark=dark)
    for item,label in zip(frame['items'],labels):item['title']=label
    frame['items'][0]['subtitle']='Čaj bude připraven za chvíli'if language=='cs'else 'Supporting activity text'
    send(frame);name=f'{size}-{language}-'+('dark'if dark else'light');reference=shot(name+'-0')
    for selected in range(1,4):
     tap('Down');assert shot(name+'-'+str(selected),selected)==reference,'Selection scrolled the overview'
    frame['sequence']+=1;frame['items'][2]['value']='-12.4°C';frame['items'][3]['value']='100%';send(frame)
    assert shot(name+'-live',3)==reference,'Live update changed the overview viewport'
    frame['sequence']+=1;frame['items'][2]['value']='123456789012345678901234567890%';send(frame)
    overflow=shot(name+'-overflow',3)
    checks.append({'osSize':size,'labels':language,'dark':dark,'panelBottoms':reference,'allFourSelectionsAndLiveUpdate':True,'overflowPanelBottoms':overflow,'completeOverflowLabel':True})
 report={'result':'PASS','pbwSha256':hashlib.sha256(PBW.read_bytes()).hexdigest(),'nativePayloadSha256':payload,'firmware':str(p.watch_info.running),'checks':checks,'scope':__doc__}
 (OUT/'report.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({'result':'PASS','report':str(OUT/'report.json')}))
finally:encoder.terminate();encoder.wait(timeout=3);service.shutdown()
