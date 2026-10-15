"""Register imagegen source regions; reads source PNGs without modifying them.
Requires Pillow only for this offline registration command, never at runtime.
"""
import hashlib, json
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / 'public/assets/characters/v3'
# Calibrated separators from the selected generated sheets. Generation is not a grid guarantee.
SPEC = {
 'hair': ([0,220,418,605,800,1024],[0,118,217,355,480,608,732,850,1017,1132,1243,1384,1536], 'crop bob long ponytail bun mohawk curly braids swept braided-bun wavy undercut'.split()),
 'face': ([0,344,532,724,910,1244],[0,156,309,465,626,788,952,1109,1265], 'oval round square angular heart long-face diamond cheekbones'.split()),
 'body-male': ([0,368,546,680,855,1223],[0,168,327,489,644,851,981,1144,1286], 'slim balanced broad stocky tall compact muscular heavy'.split()),
 'body-female': ([0,301,499,648,843,1145],[0,172,344,522,784,949,1163,1373], 'slim balanced broad tall compact muscular heavy'.split()),
 'body-female-stocky': ([0,452,858,1134,1532,1958],[0,780], ['stocky']),
 'top': ([0,244,440,584,780,1024],[0,130,240,352,475,595,709,860,988,1101,1226,1355,1536], 'tunic shirt vest coat armor wrap robe gambeson tank sweater doublet winter'.split()),
 'pants': ([0,228,430,599,794,1024],[0,117,240,334,470,584,748,883,1028,1157,1263,1387,1536], 'straight loose shorts patched skirt long-skirt leggings cargo culottes pleated breeches draped'.split()),
 'shoes': ([0,239,482,677,914,1145],[0,221,363,485,615,829,1006,1159,1374], 'boots ankle cloth sandals riding wrapped sabatons fur-boots'.split()),
 'accessory': ([0,256,494,700,937,1196],[0,130,223,322,475,596,715,806,918,1007,1145,1315], 'scarf glasses earring satchel pendant headband pouch gloves belt cloak bracers'.split()),
 'weapons': ([0,367,550,695,879,1246],[0,109,240,389,505,615,745,869,981,1134,1262], 'dagger sword greatsword axe mace spear bow crossbow staff shield'.split()),
}

def main():
 sheets={}
 for key,(xs,ys,styles) in SPEC.items():
  path=BASE/(key+'.png');im=Image.open(path).convert('RGBA');w,h=im.size
  # Last edge follows actual file size (the five-body strip may be one pixel different).
  xs[-1]=w;ys[-1]=h
  regions={}
  for row,style in enumerate(styles):
   views=[]
   for col in range(5):
    crop=(xs[col],ys[row],xs[col+1],ys[row+1]);cell=im.crop(crop)
    pixels=list(cell.getdata());valid=[]
    for i,(r,g,b,a) in enumerate(pixels):
     if a>180 and not (max(r,g,b)>230 and min(r,g,b)<35 and (r>g*1.7 or g>r*2)):
      valid.append((i%cell.width,i//cell.width))
    if len(valid)<30:raise ValueError(f'Empty source {key}/{style}/{col}')
    left=min(x for x,y in valid);right=max(x for x,y in valid)+1;top=min(y for x,y in valid);bottom=max(y for x,y in valid)+1
    views.append([crop[0]+left,crop[1]+top,right-left,bottom-top])
   regions[style]=views
  sheets[key]={'file':key+'.png','width':w,'height':h,'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'regions':regions}
 manifest={'version':'character-materials/3','authoredDirections':['S','SE','E','NE','N'],'mirrors':{'SW':'SE','W':'E','NW':'NE'},'sourceCellCount':sum(len(s['regions'])*5 for s in sheets.values()),'sheets':sheets}
 for target in [BASE/'manifest.json',ROOT/'src/presentation/character-materials-v3.json']:
  target.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
 print(json.dumps({'sourceCells':manifest['sourceCellCount'],'sheets':len(sheets)}))

if __name__=='__main__':main()
