import sys,glob
from PIL import Image
d=sys.argv[1]; out=sys.argv[2]
fs=sorted(glob.glob(d+'/frame-*.png'))
ims=[Image.open(f).resize((640,360)) for f in fs]
cols=2 if len(ims)<=6 else 3
rows=(len(ims)+cols-1)//cols
sheet=Image.new('RGB',(640*cols,360*rows))
for i,im in enumerate(ims): sheet.paste(im,((i%cols)*640,(i//cols)*360))
sheet.save(out)
