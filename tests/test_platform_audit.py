"""Reject package corruption, wrong platform limits and truncated wide headers."""
import importlib.util,json,struct,tempfile,unittest,uuid,zipfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('platform_audit',ROOT/'scripts/platform_audit.py')
a=importlib.util.module_from_spec(spec);spec.loader.exec_module(a)
ID='50e9ef12-a5ab-4369-a3b5-3447bfba5151'

def fixture(root,platform='emery',loaded=70000,virtual=71000):
    root.joinpath('package.json').write_text(json.dumps({'version':'1.2.3','pebble':{'uuid':ID,'targetPlatforms':[platform]}}))
    binary=bytearray(loaded);binary[:8]=b'PBLAPP\0\0';binary[8:10]=b'\x10\x01'
    struct.pack_into('<H',binary,14,loaded&65535);struct.pack_into('<H',binary,128,virtual&65535)
    binary[130]=loaded>>16;binary[131]=virtual>>16;binary[104:120]=uuid.UUID(ID).bytes
    binary[132:]=b'\x71'*(loaded-132)
    struct.pack_into('<I',binary,120,a.crc32(b''))
    struct.pack_into('<I',binary,20,a.crc32(binary[130:loaded]))
    resources=bytearray(4108);struct.pack_into('<II',resources,0,0,a.crc32(b''))
    names=b'\0.header\0.text\0.bss\0.shstrtab\0'
    # Allocated sections retain their actual native addresses, with ELF file offsets independent.
    elf=bytearray(52+loaded+len(names));elf[:6]=b'\x7fELF\x01\x01';elf[52:52+loaded]=binary
    names_at=len(elf)-len(names);elf[names_at:]=names
    table=len(elf);struct.pack_into('<I',elf,32,table);struct.pack_into('<HHH',elf,46,40,5,4)
    rows=[(0,0,0,0,0,0,0,0,0,0),(1,1,2,0,52,132,0,0,1,0),
          (9,1,2,132,184,loaded-132,0,0,1,0),(15,8,2,loaded,0,virtual-loaded,0,0,1,0),
          (20,3,0,0,names_at,len(names),0,0,1,0)]
    for row in rows:elf.extend(struct.pack('<10I',*row))
    folder=root/'build'/platform;folder.mkdir(parents=True);(folder/'pebble-app.elf').write_bytes(elf)
    return {'appinfo.json':json.dumps({'uuid':ID,'versionLabel':'1.2.3','targetPlatforms':[platform]}).encode(),
            platform+'/pebble-app.bin':binary,platform+'/app_resources.pbpack':resources,
            platform+'/manifest.json':json.dumps({'application':{'size':len(binary),'crc':a.crc32(binary)},
             'resources':{'size':len(resources),'crc':a.crc32(resources)}}).encode()}

def write(root,files):
    path=root/'candidate.pbw'
    with zipfile.ZipFile(path,'w',zipfile.ZIP_DEFLATED) as z:
        for name,value in files.items():z.writestr(name,value)
    return path

class Platforms(unittest.TestCase):
    def test_wide_header_above_64k(self):
        for platform in ('emery','gabbro'):
            with self.subTest(platform=platform),tempfile.TemporaryDirectory() as d:
                root=Path(d);report=a.audit_platforms(root,write(root,fixture(root,platform)))
                self.assertEqual(report['platforms'][platform]['staticBytes'],71000)
    def test_flint_retains_64k_limit(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);path=write(root,fixture(root,'flint'))
            with self.assertRaisesRegex(ValueError,'memory/file'):a.audit_platforms(root,path)
    def test_rejects_changed_code_and_metadata(self):
        for mutation in ('code','header','manifest','extra-platform','truncated-elf'):
            with self.subTest(mutation=mutation),tempfile.TemporaryDirectory() as d:
                root=Path(d);files=fixture(root)
                if mutation=='code':files['emery/pebble-app.bin'][150]^=1
                if mutation=='header':files['emery/pebble-app.bin'][130]=0
                if mutation=='manifest':files['emery/manifest.json']=b'{"application":{"crc":0}}'
                if mutation=='extra-platform':files['flint/pebble-app.bin']=b'bad'
                if mutation=='truncated-elf':(root/'build/emery/pebble-app.elf').write_bytes(b'bad')
                with self.assertRaises((ValueError,KeyError)):a.audit_platforms(root,write(root,files))
    def test_stm32_word_order_and_short_word(self):
        # Independent MSB-first shift register, after reversing each full SDK word.
        for data in (b'',b'1',b'12',b'123',b'1234',b'123456789'):
            expected=0xffffffff
            for at in range(0,len(data),4):
                word=data[at:at+4]
                bits=word[::-1] if len(word)==4 else b'\0'*(4-len(word))+word
                for byte in bits:
                    for bit in range(7,-1,-1):
                        top=(expected>>31)^((byte>>bit)&1)
                        expected=((expected<<1)&0xffffffff)^(0x04c11db7 if top else 0)
            self.assertEqual(a.crc32(data),expected)

if __name__=='__main__':unittest.main()
