"""Audit reuse against immutable baseline native bytes and non-icon resources."""
import hashlib,json,struct
from platform_audit import crc32,require
from native_identity import GNU_NOTE,renderer_identity
RANGES=((20,24),(88,92),(120,128),(148,168))
def sha(data):return hashlib.sha256(data).hexdigest()
def identity(binary,pack,menu):
    require(len(binary)>=168 and binary[:8]==b'PBLAPP\0\0' and binary[8:10]==b'\x10\x01' and binary[132:148]==GNU_NOTE,'Unexpected native header')
    loaded=struct.unpack_from('<H',binary,14)[0]|binary[130]<<16
    reloc=struct.unpack_from('<I',binary,100)[0]
    require(168<=loaded<=len(binary) and len(binary)==loaded+4*reloc,'Native loaded/relocation bounds differ')
    require(crc32(binary[130:loaded])==struct.unpack_from('<I',binary,20)[0],'Native CRC differs')
    require(struct.unpack_from('<I',binary,88)[0]==menu and binary[120:124]==pack[4:8],'Native launcher/resource binding differs')
    count=struct.unpack_from('<I',pack)[0]
    require(len(pack)>=4108 and crc32(pack[4108:])==struct.unpack_from('<I',pack,4)[0],'Resource pack CRC differs')
    entries={};spans=[]
    for i in range(count):
        rid,offset,size,crc=struct.unpack_from('<4I',pack,12+16*i);start=4108+offset;data=pack[start:start+size]
        require(rid==i+1 and size>0 and start+size<=len(pack) and crc32(data)==crc,'Resource entry differs')
        if rid!=menu:entries[str(rid)]=sha(data)
        spans.append((start,start+size))
    spans.sort();require(all(a[1]<=b[0] for a,b in zip(spans,spans[1:])),'Resources overlap')
    normalized=bytearray(binary)
    for first,last in RANGES:normalized[first:last]=bytes(last-first)
    return {'normalizedNativeSha256':sha(normalized),'nonIconResources':entries,'nativeBytes':len(binary),'loadedBytes':loaded,'relocations':reloc,'resourceCount':count}
def verify(root,archive,version):
    baseline=json.loads((root/'store/gallery-reuse-baseline.json').read_text())
    proof=json.loads((root/'store/final-gallery-reuse.json').read_text())
    require(proof['result']=='PASS' and proof['version']==version and proof['previousPbwSha256']==baseline['pbwSha256'],'Gallery proof identity differs')
    out={}
    for platform,old in baseline['platforms'].items():
        binary=archive.read(platform+'/pebble-app.bin');pack=archive.read(platform+'/app_resources.pbpack')
        now=identity(binary,pack,baseline['candidateMenuId'])
        for key in ['normalizedNativeSha256','nonIconResources','nativeBytes','loadedBytes','relocations']:
            require(now[key]==old[key],'Gallery native compatibility differs: '+platform+'/'+key)
        require(now['resourceCount']==baseline['candidateResourceCount'],'Gallery resource count differs')
        out[platform]=renderer_identity(binary,pack)
        require(proof['renderer'][platform]==out[platform],'Gallery renderer proof differs')
    return out
