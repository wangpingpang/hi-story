"""Offline validation for exported motion PNGs/GIFs, with no image mutation."""
import hashlib,json
from pathlib import Path
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
BASE=ROOT/'docs/examples/motion-v1'
PARTS=ROOT/'public/assets/characters/v3/walk'
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def main():
 manifest=json.loads((BASE/'manifest.json').read_text());parts=json.loads((PARTS/'manifest.json').read_text())
 assert manifest['verifiedMaterials']==1136
 for item in manifest['assets']:assert sha(BASE/item['file'])==item['sha256'],item['file']
 for item in parts['materials']:assert sha(PARTS/item['file'])==item['sha256'],item['file']
 sources=json.loads((ROOT/'public/assets/characters/v3/manifest.json').read_text())
 assert sources['sourceCellCount']==445
 for sheet in sources['sheets'].values():assert sha(ROOT/'public/assets/characters/v3'/sheet['file'])==sheet['sha256']
 files=list(PARTS.glob('*.png'))+list((BASE/'clips').glob('*.png'))+[BASE/'walk-8-directions.png'];frame_count=0
 assert len(files)==81
 for p in files:
  im=Image.open(p);assert im.mode=='RGBA';assert im.size in [(1536,192),(1536,1536)]
  alpha=im.getchannel('A');hist=alpha.histogram();assert sum(hist[1:255])==0,(p,'partial alpha')
  for y in range(0,im.height,192):
   for x in range(0,im.width,192):
    bbox=alpha.crop((x,y,x+192,y+192)).getbbox();assert bbox,(p,'empty frame');assert bbox[0]>0 and bbox[1]>0 and bbox[2]<192 and bbox[3]<192,(p,'edge contact');frame_count+=1
 gifs=[]
 for p in BASE.glob('*-preview.gif'):
  im=Image.open(p);assert im.n_frames==12 and im.info['loop']==0;gifs.append(p.name)
 assert len(gifs)==3
 expressions=Image.open(BASE/'expressions.png');avatars=[]
 for i in range(12):
  x=i%6*200;y=i//6*200;avatars.append(hashlib.sha256(expressions.crop((x+25,y+18,x+175,y+168)).tobytes()).hexdigest())
 assert len(set(avatars))==12,'Expressions must have twelve visually distinct faces'
 return {'sourceSheets':len(sources['sheets']),'sourceCells':445,'verifiedMaterials':1136,'walkingMaterials':len(parts['materials']),'walkingPartFrames':len(parts['materials'])*64,'nonwalkVariants':manifest['nonwalkVariants'],'atlasFiles':len(files),'frames':frame_count,'alpha':'binary','emptyFrames':0,'edgeContacts':0,'distinctExpressions':12,'gifs':gifs}
if __name__=='__main__':print(json.dumps(main(),ensure_ascii=False,indent=2))
