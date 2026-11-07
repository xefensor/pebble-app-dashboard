#!/usr/bin/env python3
"""Check every native translation against the exact packaged custom fonts."""
from pathlib import Path
import argparse,json,struct,zipfile
root=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--pbw',type=Path,required=True);args=parser.parse_args()
package=json.loads((root/'package.json').read_text());data=json.loads((root/'src/common/translations.json').read_text())
with zipfile.ZipFile(args.pbw) as archive:packed=archive.read('emery/app_resources.pbpack')
locale_index=next(i for i,item in enumerate(package['pebble']['resources']['media']) if item['name']=='LOCALIZATION')
_,offset,size,_=struct.unpack_from('<4I',packed,12+locale_index*16)
assert packed[4108+offset:4108+offset+size]==(root/'resources/localization.bin').read_bytes(), 'Packaged native locale resource differs'
fonts={}
for i,item in enumerate(package['pebble']['resources']['media']):
 if item['type']!='font' or not item['name'].startswith('FONT_BODY_'):continue
 _,offset,size,_=struct.unpack_from('<4I',packed,12+i*16);pfo=packed[4108+offset:4108+offset+size]
 version,height,count,wild,buckets,cpbytes,header,features=struct.unpack_from('<BBHHBBBB',pfo)
 assert version==3 and cpbytes in (2,4)
 offbytes=2 if features&1 else 4;table=header+buckets*4;base=table+count*(cpbytes+offbytes);glyphs={}
 for bucket in range(buckets):
  _,number,position=struct.unpack_from('<BBH',pfo,header+bucket*4)
  for j in range(number):
   at=table+position+j*(cpbytes+offbytes);code=int.from_bytes(pfo[at:at+cpbytes],'little');glyph=int.from_bytes(pfo[at+cpbytes:at+cpbytes+offbytes],'little');width,rows,left,top,advance=struct.unpack_from('<BBbbb',pfo,base+glyph);glyphs[code]=advance
 fonts[int(item['name'].rsplit('_',1)[1])]=glyphs
checks=0
for lang in data['languages']:
 for key in data['native']:
  text=data.get('nativeWords',{}).get(lang,{}).get(key,data['words'][lang][key])
  for point,glyphs in fonts.items():
   missing=[c for c in text if ord(c) not in glyphs]
   assert not missing,(lang,key,point,missing)
  if key not in data.get('nativeLayout',{}):continue
  point,limit=data['nativeLayout'][key];width=sum(fonts[point][ord(c)] for c in text)
  assert width<=limit,(lang,key,text,width,limit)
  checks+=1
print(str(len(data['languages']))+' native locales: glyph coverage and '+str(checks)+' measured control/help/warning fits PASS')
