"""Import two explicitly selected monster animations and CC0 spell images.

Requires Pillow. Only visual metadata is read from monster pages: id, actions,
image URL. No combat statistics are imported. Cached source files stay ignored.
"""
from __future__ import annotations
import argparse, hashlib, html, io, json, re, time, zipfile
from pathlib import Path
from urllib.request import Request, urlopen
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / '_handoff' / 'combat-assets-source'
OUT = ROOT / 'public' / 'assets'
SOURCE = 'https://www.molibaike.com'
MONSTERS = [
 ('skeleton', '骷髅战士', '/Monster/Detail/ede4ca95-20f6-4463-9f27-778c545fe2e1?u=True'),
 ('lizard', '火龙蜥', '/Monster/Detail/2fa9d8bb-363f-4950-97be-6534ed64dcb9?u=True'),
]
NOTICE = '原站图档版权归史克威尔艾尼克斯（中国）；未发现开放素材许可证。仅记录来源，不授予使用或再分发权利。'

def digest(raw): return hashlib.sha256(raw).hexdigest()
def write(path, value):
 path.parent.mkdir(parents=True, exist_ok=True)
 path.write_text(json.dumps(value, ensure_ascii=False, separators=(',', ':'))+'\n', encoding='utf-8')

def fetch(url, name, offline=False):
 path=CACHE/name
 if path.exists(): return path.read_bytes()
 if offline: raise FileNotFoundError(path)
 time.sleep(.26)
 with urlopen(Request(url, headers={'User-Agent':'hi-story-visual-import/1'}), timeout=30) as response:
  raw=response.read(12_000_001)
 if len(raw)>12_000_000: raise ValueError('Asset exceeds download budget')
 path.parent.mkdir(parents=True, exist_ok=True);path.write_bytes(raw)
 return raw

def atlas(frames):
 positions=[];x=y=row=used=0
 for im in frames:
  if x and x+im.width>2048: x=0;y+=row;row=0
  positions.append((x,y));x+=im.width;used=max(used,x);row=max(row,im.height)
 if y+row>4096: raise ValueError('Atlas too tall')
 image=Image.new('RGBA',(used,y+row))
 for im,p in zip(frames,positions): image.alpha_composite(im,p)
 return image,positions

def monsters(offline):
 report={'version':'combat-assets-verification/1','monsters':[],'failures':[]}
 for slug,name,detail in MONSTERS:
  page=fetch(SOURCE+detail,slug+'.html',offline).decode('utf-8')
  base=re.search(r"var id = '(\d+)'",page).group(1)
  select=re.search(r'<select\s+id="actionType"[\s\S]*?</select>',page).group()
  actions=[{'id':int(i),'label':html.unescape(label)} for i,label in re.findall(r'<option value="(\d+)"[^>]*>(.*?)</option>',select)]
  prefix=('0'+base) if int(base)>=2000 else base
  model='monster-'+base;folder=OUT/'monsters'/'molibaike'/model;folder.mkdir(parents=True,exist_ok=True)
  manifest={'version':'molibaike-monster/1','characterId':model,'name':name,'source':SOURCE+detail,'licenseNotice':NOTICE,'pivotPolicy':'source canvas bottom center; one stand scale for every pose','standHeight':None,'atlases':[],'clips':{},'availableClips':len(actions)*8,'requestedClips':len(actions)*8,'actions':actions}
  total_frames=0;stand_heights=[]
  for action in actions:
   clips=[];frames=[]
   for direction in range(8):
    filename=f'CG{prefix}{direction}{action["id"]:02}.gif';url=SOURCE+'/Content/Monster/'+filename
    raw=fetch(url,'gifs/'+filename,offline)
    image=Image.open(io.BytesIO(raw))
    if image.format!='GIF' or image.n_frames>250 or max(image.size)>2048: raise ValueError('Unexpected GIF')
    durations=[];start=len(frames)
    for i in range(image.n_frames):
     image.seek(i);frame=image.convert('RGBA');duration=image.info.get('duration',0)
     if duration<=0 or frame.getbbox() is None: raise ValueError('Invalid frame/duration')
     frames.append(frame.copy());durations.append(duration)
     if action['id']==0: stand_heights.append(frame.getbbox()[3]-frame.getbbox()[1])
    clips.append({'actionId':action['id'],'directionId':direction,'sourceUrl':url,'sourceSha256':digest(raw),'sourceBytes':len(raw),'loop':action['id'] in (0,1,3),'durationMs':sum(durations),'durations':durations,'start':start})
   im,positions=atlas(frames);buf=io.BytesIO();im.save(buf,'WEBP',lossless=True,exact=True,method=4);raw=buf.getvalue()
   if len(raw)>700_000: raise ValueError('Atlas too large')
   filename=f'action-{action["id"]}.webp';(folder/filename).write_bytes(raw);url=f'assets/monsters/molibaike/{model}/{filename}'
   manifest['atlases'].append({'id':f'action-{action["id"]}','url':url,'width':im.width,'height':im.height,'bytes':len(raw),'sha256':digest(raw)})
   # Reopen emitted atlas and compare every composited RGBA pixel to the GIF.
   decoded=Image.open(io.BytesIO(raw)).convert('RGBA')
   for clip in clips:
    output=[]
    for i,duration in enumerate(clip.pop('durations')):
     index=clip['start']+i;frame=frames[index];x,y=positions[index];w,h=frame.size
     expected=Image.alpha_composite(Image.new('RGBA',frame.size),frame)
     if decoded.crop((x,y,x+w,y+h)).tobytes()!=expected.tobytes(): raise ValueError('Pixel mismatch')
     output.append({'rect':[x,y,w,h],'pivot':[w/2,h],'durationMs':duration})
    clip.pop('start');clip.update(atlasId=f'action-{action["id"]}',atlasUrl=url,frames=output)
    manifest['clips'][f'{action["id"]}:{clip["directionId"]}']=clip
   total_frames+=len(frames)
  manifest['standHeight']=max(stand_heights);write(folder/'manifest.json',manifest)
  report['monsters'].append({'id':model,'name':name,'source':SOURCE+detail,'actions':actions,'clips':len(manifest['clips']),'frames':total_frames,'atlasBytes':sum(a['bytes'] for a in manifest['atlases']),'pixelVerification':'every frame RGBA, disposal, duration and hash'})
  print(json.dumps(report['monsters'][-1],ensure_ascii=False),flush=True)
 write(OUT/'monsters'/'molibaike'/'verification.json',report)

def effects(offline):
 packs=[('starsteel','https://opengameart.org/sites/default/files/Spell%20Effects.zip','https://opengameart.org/content/spell-effects-by-starsteelgaming','StarsteelGaming'),('devwizard','https://opengameart.org/sites/default/files/pixelart_spells_1.zip','https://opengameart.org/content/pixel-art-spells','DevWizard')]
 sources={};archives={}
 for key,url,page,author in packs:
  raw=fetch(url,key+'.zip',offline);archives[key]=zipfile.ZipFile(io.BytesIO(raw));sources[key]={'url':url,'page':page,'author':author,'license':'CC0-1.0','licenseUrl':'https://creativecommons.org/publicdomain/zero/1.0/','sha256':digest(raw)}
 sequences={'fire':('starsteel',[f'Fireball{i}.png' for i in range(1,10)]),'ice':('starsteel',['Icespear.png']+[f'Icespear{i}.png' for i in range(2,7)]),'lightning':('starsteel',[f'Thundersphere{i}.png' for i in range(1,9)]),'wind':('devwizard',['Pixelart Spells/PNG Files/Wind Bolt.png']),'arcane':('devwizard',['Pixelart Spells/PNG Files/Magic Orb.png'])}
 manifest={'version':'combat-spell-assets/1','sources':sources,'effects':{}}
 for key,(source,names) in sequences.items():
  frames=[]
  for name in names:
   im=Image.open(io.BytesIO(archives[source].read(name))).convert('RGBA')
   if key in ('wind','arcane'): frames.extend(im.crop((x,0,x+16,16)) for x in range(0,im.width,16))
   else: frames.append(im)
  im,positions=atlas(frames);buf=io.BytesIO();im.save(buf,'WEBP',lossless=True,exact=True);raw=buf.getvalue();folder=OUT/'effects'/'spells';folder.mkdir(parents=True,exist_ok=True);(folder/(key+'.webp')).write_bytes(raw)
  decoded=Image.open(io.BytesIO(raw)).convert('RGBA');out=[]
  for frame,(x,y) in zip(frames,positions):
   expected=Image.alpha_composite(Image.new('RGBA',frame.size),frame)
   if decoded.crop((x,y,x+frame.width,y+frame.height)).tobytes()!=expected.tobytes(): raise ValueError('Effect pixel mismatch')
   out.append({'rect':[x,y,frame.width,frame.height],'durationMs':90})
  manifest['effects'][key]={'source':source,'files':names,'url':f'assets/effects/spells/{key}.webp','width':im.width,'height':im.height,'sha256':digest(raw),'frames':out,'timingPolicy':'90ms/frame presentation timing; PNG sources do not specify timing'}
 write(OUT/'effects'/'spells'/'manifest.json',manifest)
 print('Verified five CC0 spell sequences',flush=True)

if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('--offline',action='store_true');args=parser.parse_args()
 effects(args.offline);monsters(args.offline)
