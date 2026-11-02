from pathlib import Path
from PIL import Image, ImageDraw
ROOT = Path(__file__).resolve().parents[2]
paths = sorted((ROOT/'assets/visual/events').glob('*.webp'))
w,h,label,cols = 480,267,34,3
rows=(len(paths)+cols-1)//cols
sheet=Image.new('RGB',(w*cols,(h+label)*rows),(24,27,24))
d=ImageDraw.Draw(sheet)
for i,p in enumerate(paths):
    x=(i%cols)*w;y=(i//cols)*(h+label)
    im=Image.open(p).convert('RGB').resize((w,h),Image.Resampling.LANCZOS)
    sheet.paste(im,(x,y));d.text((x+10,y+h+9),p.stem,fill=(211,191,143))
out=Path(__file__).resolve().parent/'contact-sheet.jpg'
sheet.save(out,'JPEG',quality=90)
print(out)
