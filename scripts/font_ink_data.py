"""Read the pinned SDK v3 PFO lookup/bitmap bounds used by the QA generator."""
import struct

def pfo_metrics(data):
    version,height,count,wildcard,buckets,cp_bytes,header,features=struct.unpack_from('<BBHHBBBB',data)
    assert version==3 and cp_bytes in (2,4) and features&~1==0
    offset_bytes=2 if features&1 else 4;table=header+buckets*4;entries={}
    for bucket in range(buckets):
        _,number,position=struct.unpack_from('<BBH',data,header+bucket*4)
        row=[]
        for i in range(number):
            at=table+position+i*(cp_bytes+offset_bytes)
            code=int.from_bytes(data[at:at+cp_bytes],'little');offset=int.from_bytes(data[at+cp_bytes:at+cp_bytes+offset_bytes],'little');row.append((code,offset))
        for code in {entry[0] for entry in row}:
            left,right=0,len(row)-1
            while left<=right:
                middle=(left+right)//2;candidate,offset=row[middle]
                if candidate<code:left=middle+1
                elif candidate>code:right=middle-1
                else:entries[code]=offset;break
    base=table+count*(cp_bytes+offset_bytes);result={}
    for code,offset in entries.items():
        width,rows,left,top,advance=struct.unpack_from('<BBbbb',data,base+offset)
        bitmap=data[base+offset+5:base+offset+5+(width*rows+7)//8]
        result[code]={'top':top if any(bitmap) else 255,'bottom':top+rows-1 if any(bitmap) else 0,'advance':advance,'left':left,'width':width}
    return result
