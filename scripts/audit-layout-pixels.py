#!/usr/bin/env python3
"""Inspect actual native fixture pixels, independently of C line-box positions."""
from pathlib import Path
import hashlib,json
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
VERSION=json.loads((ROOT/'package.json').read_text())['version']
DIR=ROOT/'docs/qa'/VERSION/'native-ux'
rows=[];captures={}
def sha(data):return hashlib.sha256(data).hexdigest()
def load(name):
    path=DIR/(name+'.png');captures[path.name]=sha(path.read_bytes());return Image.open(path).convert('RGB')
def bbox(im,box,color):
    points=[(x,y) for y in range(box[1],box[3]) for x in range(box[0],box[2]) if im.getpixel((x,y))==color]
    assert points,('No fixture ink',box,color)
    return [min(x for x,y in points),min(y for x,y in points),max(x for x,y in points)+1,max(y for x,y in points)+1]
def center(box):return (box[1]+box[3]-1)/2
def margins(ink,box):return {'top':ink[1]-box[1],'bottom':box[3]-ink[3]}
def paired(name,kind,a,b,limit=1):
    error=abs(center(a)-center(b));assert error<=limit,(name,kind,a,b,error)
    rows.append({'capture':name+'.png','role':kind,'iconOrLabelInk':a,'adjacentTextInk':b,'verticalCenterDifferencePixels':error})
def divider(im,dark):
    shade=(85,85,85) if dark else (170,170,170)
    lines=[y for y in range(30,228) if all(im.getpixel((x,y))==shade for x in range(8,157))]
    assert len(lines)==3,(dark,lines)
    return lines[0],lines[1]
def text_groups(im,box,color):
    ys=[y for y in range(box[1],box[3]) if any(im.getpixel((x,y))==color for x in range(box[0],box[2]))]
    groups=[]
    for y in ys:
        if not groups or y-groups[-1][-1]>3:groups.append([y])
        else:groups[-1].append(y)
    return groups
def snapshot(name,dark,selected,czech=False,full=False):
    im=load(name);foreground=(255,255,255) if dark else (0,0,0);background=(0,0,0) if dark else (255,255,255)
    first,second=divider(im,dark);primary=(4,33,162,first-1);notice=(4,first+2,162,157)
    clock=bbox(im,(94,0,160,30),foreground)
    assert clock[3]-clock[1]>=18,(name,'Clock shrank',clock)
    assert clock[1]>=3 and 30-clock[3]>=3,(name,'Clock touches header',clock)
    rows.append({'capture':name+'.png','role':'Header clock','ink':clock,'visibleHeightPixels':clock[3]-clock[1],'margins':margins(clock,(94,0,160,30))})
    title=bbox(im,(6,0,90,29),foreground)
    paired(name,'Header title/clock',title,clock)
    rows.append({'capture':name+'.png','role':'Header title','ink':title,'visibleHeightPixels':title[3]-title[1],'margins':margins(title,(6,0,90,30))})
    ink=background if selected=='primary' else foreground
    value=bbox(im,(10,33,157,33+(primary[3]-33)//2+2),ink)
    caption_top=value[3]+2
    caption=bbox(im,(40,caption_top,159,primary[3]),ink);symbol=bbox(im,(9,caption_top,35,primary[3]),ink)
    paired(name,'Primary caption/icon',symbol,caption)
    combined=[10,min(value[1],caption[1],symbol[1]),157,max(value[3],caption[3],symbol[3])]
    edge=margins(combined,primary);assert min(edge.values())>=2,(name,'Primary group touches box',edge)
    assert abs(center(combined)-center(primary))<=.5,(name,'Primary group not centered',combined,primary)
    rows.append({'capture':name+'.png','role':'Whole primary value/caption/icon group','box':primary,'ink':combined,'margins':edge,'verticalCenterDifferencePixels':abs(center(combined)-center(primary))})
    ink=background if selected=='notice' else foreground
    split=notice[1]+29
    heading=bbox(im,(40,notice[1],159,split),ink)
    message=bbox(im,(8,split,159,notice[3]),ink)
    symbol=bbox(im,(9,notice[1],35,split),ink)
    paired(name,'Notification heading/icon',symbol,heading)
    combined=[8,min(heading[1],message[1],symbol[1]),157,max(heading[3],message[3],symbol[3])]
    edge=margins(combined,notice);assert min(edge.values())>=2,(name,'Notice text touches box',edge)
    assert abs(center(combined)-center(notice))<=.5,(name,'Notice group not centered',combined,notice)
    rows.append({'capture':name+'.png','role':'Whole notification group','box':notice,'ink':combined,'margins':edge,'verticalCenterDifferencePixels':abs(center(combined)-center(notice))})
    for y,role in ((160,'first-pin'),(195,'second-pin')):
        ink=background if selected==role else foreground;box=(4,y,162,y+32)
        symbol=bbox(im,(9,y,35,y+32),ink)
        if role=='first-pin' and not czech:
            value=bbox(im,(39,y,159,y+32),ink);label=None
        else:
            split=108 if role=='first-pin' else 112
            label=bbox(im,(39,y,split-2,y+32),ink);value=bbox(im,(split,y,159,y+32),ink)
            paired(name,role+' label/value',label,value)
            assert min(margins(label,box).values())>=2,(name,role,'Label touches box',label)
        paired(name,role+' icon/value',symbol,value)
        assert min(margins(value,box).values())>=2,(name,role,'Value touches box',value)
        rows.append({'capture':name+'.png','role':role+' value box','box':box,'ink':value,'margins':margins(value,box)})
    if full:assert notice[3]-notice[1]==62 and primary[3]-primary[1]==59,(name,'Full accent fixture did not exercise tight geometry',primary,notice)

snapshot('snapshot-light',False,'second-pin')
snapshot('snapshot-dark',True,'second-pin')
snapshot('layout-normal-notice-selected',False,'notice')
snapshot('layout-normal-first-pin-selected',False,'first-pin')
for dark in (False,True):
    for selected in ('primary','notice','first-pin','second-pin'):
        snapshot('layout-czech-'+selected+'-selected-'+('dark' if dark else 'light'),dark,selected,True)
    snapshot('layout-full-accent-primary-selected-'+('dark' if dark else 'light'),dark,'primary',True,True)

for dark in (False,True):
    for czech in (False,True):
        name=('layout-czech-media-' if czech else 'layout-media-normal-')+('dark' if dark else 'light')
        im=load(name);ink=(0,0,0) if dark else (255,255,255)
        first,_=divider(im,dark);box=(4,33,162,first-1)
        groups=text_groups(im,(39,33,159,box[3]),ink)
        assert len(groups)==2,(name,groups)
        split=(groups[0][-1]+groups[1][0])//2
        title=bbox(im,(10,33,159,split),ink);artist=bbox(im,(39,split,159,box[3]),ink)
        # The artwork is a supplied, fully opaque fictional24px square. Its
        # colored frame is measured separately from monochrome text pixels.
        color_pixels=[(x,y) for y in range(split,box[3]) for x in range(9,33) if len(set(im.getpixel((x,y))))>1]
        assert color_pixels,name
        art=[min(x for x,y in color_pixels),min(y for x,y in color_pixels),max(x for x,y in color_pixels)+1,max(y for x,y in color_pixels)+1]
        paired(name,'Snapshot Media artwork/artist',art,artist)
        combined=[9,min(title[1],artist[1],art[1]),159,max(title[3],artist[3],art[3])]
        edge=margins(combined,box);assert min(edge.values())>=2,(name,edge)
        assert abs(center(combined)-center(box))<=.5,(name,box,combined)
        rows.append({'capture':name+'.png','role':'Snapshot Media title/artist/artwork group','box':box,'ink':combined,'titleInk':title,'artistInk':artist,'artworkFrame':art,'margins':edge,'verticalCenterDifferencePixels':abs(center(combined)-center(box))})
        notice_box=(4,first+2,162,157);foreground=(255,255,255) if dark else (0,0,0)
        notice_ink=bbox(im,(8,notice_box[1],159,157),foreground)
        assert min(margins(notice_ink,notice_box).values())>=2,(name,notice_ink,notice_box)
        assert abs(center(notice_ink)-center(notice_box))<=.5,(name,notice_ink,notice_box)
        rows.append({'capture':name+'.png','role':'Media Snapshot notice/explicit-hint group','box':notice_box,'ink':notice_ink,'margins':margins(notice_ink,notice_box),'verticalCenterDifferencePixels':abs(center(notice_ink)-center(notice_box))})

for stem in ('first','fifth','reverse','next-page','last','last-reverse'):
    name='layout-accented-list-'+stem;im=load(name)
    background=im.getpixel((0,80));foreground=(255,255,255) if background==(0,0,0) else (0,0,0)
    ys=[y for y in range(30,228) if im.getpixel((8,y))==foreground];assert ys,name
    top,bottom=min(ys),max(ys)+1;box=(4,top,162,bottom)
    ink=bbox(im,(40,top,159,bottom),background);edge=margins(ink,box)
    assert min(edge.values())>=2,(name,'Accented selected row touches edge',edge)
    assert abs(center(ink)-center(box))<=.5,(name,'Accented selected group not centered',ink,box)
    rows.append({'capture':name+'.png','role':'Selected accented collection group','box':box,'ink':ink,'margins':edge,'verticalCenterDifferencePixels':abs(center(ink)-center(box))})

for stem,y,h in [('generic-controls-visible-slots',102,56),('generic-sparse-controls-visible-slots',102,56),('generic-single-control-visible-slots',116,72)]:
    im=load(stem);box=(14,y,152,y+h);ink=bbox(im,box,(255,255,255))
    assert abs(center(ink)-center(box))<=.5,(stem,'Control text not centered',ink,box)
    rows.append({'capture':stem+'.png','role':'Selected generic control','box':box,'ink':ink,'margins':margins(ink,box),'verticalCenterDifferencePixels':abs(center(ink)-center(box))})
for stem,y in [('confirmation-target-sidebar',139),('confirmation-explicit-run-choice',183)]:
    im=load(stem);box=(17,y,152,y+36);ink=bbox(im,box,(255,255,255))
    assert abs(center(ink)-center(box))<=.5,(stem,'Confirmation text not centered',ink,box)
    rows.append({'capture':stem+'.png','role':'Selected confirmation choice','box':box,'ink':ink,'margins':margins(ink,box),'verticalCenterDifferencePixels':abs(center(ink)-center(box))})

for stem in ('activities-list-light','activities-list-dark'):
    im=load(stem);ink=(0,0,0) if stem.endswith('dark') else (255,255,255)
    box=(4,78,161,133);group=bbox(im,(40,78,159,133),ink)
    assert abs(center(group)-center(box))<=.5,(stem,group,box)
    assert min(margins(group,box).values())>=3,(stem,group,box)
    rows.append({'capture':stem+'.png','role':'Normal selected Media collection row','box':box,'ink':group,'margins':margins(group,box),'verticalCenterDifferencePixels':abs(center(group)-center(box))})

report={'result':'PASS','version':VERSION,'candidatePbwSha256':sha((ROOT/'dist'/('Dashboard-'+VERSION+'.pbw')).read_bytes()),
        'scope':'Actual unchanged native fixture PNG ink bounds. English/Czech selected/unselected Snapshot, full-accent tight case, Media title/artist/artwork and explicit preview hint, normal/adaptive collections, generic controls and confirmation. This is not a browser, phone or physical-watch measurement.',
        'captures':captures,'measurements':rows}
(DIR.parent/'layout-pixels.json').write_text(json.dumps(report,indent=2)+'\n')
print('Actual native ink audit PASS:',len(rows),'measurements across',len(captures),'captures')
