#!/usr/bin/env python3
"""Exact native Snapshot: configured unavailable pins remain visible.

Synthetic DSH1 source, real Emery rendering and actual OS text sizes.
"""
from pathlib import Path
import argparse,copy,hashlib,json,os,subprocess,sys,tempfile,time,uuid,zipfile
from repo_workflow import candidate
from pebble_tool.commands.install import ToolAppInstaller
from pebble_tool.commands.emucontrol import send_data_to_qemu
from libpebble2.protocol.apps import AppRunState,AppRunStateStart,AppRunStateStop
from libpebble2.protocol.system import TimeMessage,SetUTC
from libpebble2.communication.transports.qemu.protocol import QemuContentSize
from libpebble2.services.appmessage import AppMessageService,ByteArray,Uint32
from libpebble2.services.screenshot import Screenshot
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--pbw',type=Path,default=candidate(ROOT,'Dashboard'))
parser.add_argument('--output',type=Path,default=ROOT/'build/qa/unavailable-snapshot')
args=parser.parse_args();out=args.output.resolve();out.mkdir(parents=True,exist_ok=True)
os.environ['PEBBLE_QA_STATE']=tempfile.mkdtemp(prefix='dashboard-unavailable-')
sys.path.insert(0,str(ROOT.parent/'recovery-validation'))
from pipe_emulator import connect
with zipfile.ZipFile(args.pbw)as source,zipfile.ZipFile(out/'native.pbw','w')as native:
 info=json.loads(source.read('appinfo.json'))
 for name in source.namelist():
  if name=='appinfo.json' or name.startswith('emery/'):native.writestr(name,source.read(name))
p=connect();target=uuid.UUID(info['uuid']);service=AppMessageService(p);messages=[]
service.register_handler('appmessage',lambda tid,app,data:messages.append(dict(data))if app==target else None)
fixture=json.loads((ROOT/'tests/fixtures/overview.json').read_text());checks=[]
p.send_packet(TimeMessage(message=SetUTC(unix_time=fixture['now'],utc_offset=0,tz_name='UTC')))
ToolAppInstaller(p,str(out/'native.pbw'),quiet=True).install()
encoder=subprocess.Popen(['node',str(ROOT/'tests/native-peer.cjs')],stdin=subprocess.PIPE,stdout=subprocess.PIPE,text=True)
def hello():
 messages.clear();service.send_message(target,{4000:Uint32(6)})
 until=time.monotonic()+5
 while time.monotonic()<until:
  found=next((m for m in reversed(messages)if m.get(4000)==1),None)
  if found:return found
  time.sleep(.03)
 raise AssertionError('Native HELLO missing')
try:
 for size in (1,2,3):
  p.send_packet(AppRunState(data=AppRunStateStop(uuid=target)));time.sleep(.15)
  send_data_to_qemu(p.transport,QemuContentSize(size=size))
  p.send_packet(AppRunState(data=AppRunStateStart(uuid=target)));time.sleep(.5)
  # Dismiss the passive first-launch guide with the native Select button.
  from libpebble2.communication.transports.qemu.protocol import QemuButton
  if size==1:
   send_data_to_qemu(p.transport,QemuButton(state=4));time.sleep(.08)
   send_data_to_qemu(p.transport,QemuButton(state=0));time.sleep(.4)
  request=hello();reference=None
  for sequence,status in enumerate((1,3,4,5),1):
   frame=copy.deepcopy(fixture);frame.update(session=request[4001],request=request[4002],sequence=sequence,status=status,dark=True,mode=0,offset=0,activitiesTotal=0,pinsTotal=2)
   frame['items']=[item for item in frame['items']if item['role']==2][:2];frame['total']=len(frame['items'])
   for item,label in zip(frame['items'],['City weather','Desk light']):item.update(flags=16,title=label,value='',validUntil=0)
   encoder.stdin.write(json.dumps(frame)+'\n');encoder.stdin.flush();encoded=json.loads(encoder.stdout.readline());assert 'error'not in encoded,encoded
   service.send_message(target,{4008:ByteArray(bytes(encoded['bytes']))});time.sleep(.45)
   image=Image.frombytes('RGB',(200,228),b''.join(Screenshot(p).grab_image()));image.save(out/f'size-{size}-status-{status}.png')
   content=image.crop((0,34,166,228)).tobytes()
   if reference is None:
    assert sum(content[i:i+3]!=b'\x00\x00\x00'for i in range(0,len(content),3))>500,'Normal Snapshot body is missing'
    reference=content
   else:assert content==reference,f'Configured pins disappear/change at OS size {size}, status {status}'
   checks.append({'osSize':size,'status':status,'configuredPinsVisible':True,'matchesReadyBody':True})
 report={'result':'PASS','pbwSha256':hashlib.sha256(args.pbw.read_bytes()).hexdigest(),'firmware':str(p.watch_info.running),'checks':checks,'scope':'Exact native C/resources with synthetic DSH1 unavailable pins. Real OS sizes and rendering, no real phone/provider/action.'}
 (out/'report.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({'result':'PASS','report':str(out/'report.json')}))
finally:encoder.terminate();encoder.wait(timeout=3)
