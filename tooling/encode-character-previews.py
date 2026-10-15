"""Offline GIF encoder; source artwork and animation are rendered by the app."""
import sys
from PIL import Image
frames=[Image.open(path).convert('RGB') for path in sys.argv[2:]]
# Learn one palette across all frames to avoid palette flicker.
contact=Image.new('RGB',(frames[0].width,len(frames)*frames[0].height))
for i,frame in enumerate(frames):contact.paste(frame,(0,i*frame.height))
palette=contact.quantize(colors=128)
indexed=[frame.quantize(palette=palette,dither=Image.Dither.NONE) for frame in frames]
indexed[0].save(sys.argv[1],save_all=True,append_images=indexed[1:],duration=100,loop=0,disposal=2,optimize=False)
