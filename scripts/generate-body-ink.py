#!/usr/bin/env python3
"""Generate exact ink bounds for the packaged Roboto utility family."""
from pathlib import Path
import hashlib,json,struct
from font_ink_data import pfo_metrics
root=Path(__file__).resolve().parents[1]
package=json.loads((root/'package.json').read_text());packed=(root/'build/emery/app_resources.pbpack').read_bytes()
fonts={};records=[];clock={};clock_records=[]
for i,item in enumerate(package['pebble']['resources']['media']):
    if item['type']!='font':continue
    _,offset,size,_=struct.unpack_from('<4I',packed,12+i*16);data=packed[4108+offset:4108+offset+size];metrics=pfo_metrics(data)
    if item['name'].startswith('FONT_CLOCK_'):
        clock[int(item['name'].split('_')[-1])]=metrics;clock_records.append({'font':item['name'],'pfoSha256':hashlib.sha256(data).hexdigest()});continue
    if item['name'] not in ['FONT_BODY_'+str(p) for p in (20,22,24,26)]:continue
    assert all(ord(c) in metrics for c in 'ÁÉČŘŮžýČaj−…'),item['name']+' lacks required glyphs; check extended:true'
    point=int(item['name'].split('_')[-1]);fonts[point]=metrics
    records.append({'font':item['name'],'pfoSha256':hashlib.sha256(data).hexdigest(),'glyphs':len(metrics),'requiredAccentsAndMinusPresent':True})
assert set(fonts)=={20,22,24,26}
points=sorted(set.union(*(set(m) for m in fonts.values())))
lines=['// Generated from exact SDK PFOs by scripts/generate-body-ink.py. Do not edit.','#pragma once',
       '#define DB_BODY_FALLBACK_INDEX '+str(points.index(0x25af)),
       'static const DbBodyGlyphInk db_body_ink[]={']
for code in points:
    glyphs=[fonts[point].get(code,fonts[point][0x25af]) for point in (20,22,24,26)]
    assert all(g['top']==255 or -128<=g['top']<=126 and -128<=g['bottom']<=127 for g in glyphs)
    lines.append('  {%d,{%s}},'%(code,','.join('{%d,%d}'%((g['top']&255,g['bottom']&255) if g['top']!=255 else (127,0)) for g in glyphs)))
lines+=['};',''];header='\n'.join(lines);(root/'src/c/generated_body_ink.h').write_text(header)
out=root/'docs/qa'/package['version'];out.mkdir(parents=True,exist_ok=True)
(out/'body-ink.json').write_text(json.dumps({'sdk':'4.33.1','fontSourceSha256':hashlib.sha256((root/'resources/fonts/RobotoCondensed-Bold.ttf').read_bytes()).hexdigest(),'fonts':records,'glyphCodepoints':points,'generatedHeaderSha256':hashlib.sha256(header.encode()).hexdigest(),'scope':'Exact packaged custom-font PFO bitmap bounds for the full selected source-font BMP repertoire. Missing characters use the packaged wildcard; Unicode coverage outside that source is not implied.'},indent=2)+'\n')
clock_order=(20,24,26,32,40,36);assert set(clock_order)==set(clock)
clock_points=sorted(set.union(*(set(m) for m in clock.values())))
lines=['// Generated from exact SDK PFOs by scripts/generate-body-ink.py. Do not edit.','#pragma once','static const DbClockGlyphInk db_clock_ink[]={']
for code in clock_points:
    glyphs=[clock[p].get(code,clock[p][0x25af]) for p in clock_order]
    lines.append('  {%d,{%s}},'%(code,','.join('{%d,%d}'%((g['top']&255,g['bottom']&255) if g['top']!=255 else (127,0)) for g in glyphs)))
lines+=['};',''];header='\n'.join(lines);(root/'src/c/generated_clock_ink.h').write_text(header)
(out/'clock-ink.json').write_text(json.dumps({'fontOrder':clock_order,'fonts':clock_records,'generatedHeaderSha256':hashlib.sha256(header.encode()).hexdigest(),'scope':'Exact packaged Fredoka PFO bounds; no text reshaping or font scaling.'},indent=2)+'\n')
print(root/'src/c/generated_body_ink.h')
