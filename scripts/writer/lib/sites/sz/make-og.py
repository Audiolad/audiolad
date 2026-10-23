import sys,textwrap
from PIL import Image,ImageDraw,ImageFont
F="/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"; FB="/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
def make(title,out):
    W,H=1200,630; im=Image.new("RGB",(W,H),(246,236,247)); d=ImageDraw.Draw(im)
    d.rectangle([0,0,W,16],fill=(119,96,168))
    x=80
    f1=ImageFont.truetype(F,28); d.text((x,75),"Сергей и Зоя",font=f1,fill=(112,92,150))
    f2=ImageFont.truetype(F,36); d.text((x,152),"Статьи",font=f2,fill=(122,99,171))
    ft=ImageFont.truetype(FB,54)
    # wrap by pixel width
    words=title.split(); lines=[]; cur=""
    for w in words:
        t=(cur+" "+w).strip()
        if d.textlength(t,font=ft)<=W-2*x: cur=t
        else: lines.append(cur); cur=w
    lines.append(cur)
    while len(lines)>3:
        ft=ImageFont.truetype(FB,ft.size-4); return_=None
        words=title.split(); lines=[]; cur=""
        for w in words:
            t=(cur+" "+w).strip()
            if d.textlength(t,font=ft)<=W-2*x: cur=t
            else: lines.append(cur); cur=w
        lines.append(cur)
    y=250
    for l in lines: d.text((x,y),l,font=ft,fill=(42,31,69)); y+=int(ft.size*1.45)
    f3=ImageFont.truetype(F,28); d.text((x,545),"sergey-zoya.ru",font=f3,fill=(122,99,171))
    im.save(out,"JPEG",quality=88)
make(sys.argv[1],sys.argv[2])
