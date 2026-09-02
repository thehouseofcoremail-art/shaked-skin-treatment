from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageEnhance
import os, random
from patterns import PATTERNS

SLIDE_W, H, N = 1080, 1350, 5
PW = SLIDE_W * N                      # 5400
PHOTO = "/root/.claude/uploads/b82771e3-2db0-55b1-a129-84fd19f8ab12/9cec8bf1-image.jpg"
CREAM = (247, 241, 226)
FONT  = "fonts/CooperBT.ttf"
def F(sz): return ImageFont.truetype(FONT, sz)

# ---------- continuous panorama ground ----------
def panorama():
    src = Image.open(PHOTO).convert("RGB")
    # sharp layer: scale to full height
    sh = int(H * 1.02)
    sw = int(src.width * sh / src.height)
    sharp = src.resize((sw, sh), Image.LANCZOS)

    # blurred bed: blow the photo way up so its lawn/tree tones fill the whole strip
    # sample a clean grass patch (right-lower quadrant is pure lawn), then mirror-tile it
    patch = src.crop((int(src.width*0.02), int(src.height*0.55),
                      int(src.width*0.30), int(src.height*0.80)))
    patch = patch.resize((int(PW/6), H), Image.LANCZOS)
    bed = Image.new("RGB", (PW, H))
    x = 0; flip = False
    while x < PW:
        tile = patch.transpose(Image.FLIP_LEFT_RIGHT) if flip else patch
        bed.paste(tile, (x, 0)); x += patch.width; flip = not flip
    bed = bed.filter(ImageFilter.GaussianBlur(78))
    bed = ImageEnhance.Brightness(bed).enhance(0.94)
    bed = ImageEnhance.Color(bed).enhance(1.04)
    # slow luminance drift so it reads as a real field, not flat colour
    import math
    drift = Image.new("L", (PW, 1))
    drift.putdata([int(128 + 46*math.sin(x/PW*math.pi*1.15 + 0.4)) for x in range(PW)])
    drift = drift.resize((PW, H))
    bed = Image.composite(ImageEnhance.Brightness(bed).enhance(1.12),
                          ImageEnhance.Brightness(bed).enhance(0.86), drift)

    pano = bed.copy()
    # feathered mask so the sharp photo melts into the bed
    px = 60
    m = Image.new("L", (sw, sh), 0)
    dm = ImageDraw.Draw(m)
    dm.rectangle([0, 0, sw, sh], fill=255)
    m = m.filter(ImageFilter.GaussianBlur(0))
    grad = Image.new("L", (sw, sh), 255)
    dg = ImageDraw.Draw(grad)
    for i in range(170):
        v = int(255 * (i / 170.0))
        dg.line([sw-1-i, 0, sw-1-i, sh], fill=v)
    m = Image.composite(m, Image.new("L", (sw, sh), 0), grad)
    pano.paste(sharp, (px, -int((sh-H)/2)), m)

    # unify: gentle warm grade + vignette per slide edge
    warm = Image.new("RGB", (PW, H), (58, 54, 36))
    pano = Image.blend(pano, warm, 0.13)
    return pano

# ---------- helpers ----------
def torn_mask(w, h, seed):
    rnd = random.Random(seed)
    m = Image.new("L", (w, h), 0); d = ImageDraw.Draw(m)
    amp = max(4, int(min(w, h) * 0.016)); step = max(8, int(min(w, h) / 26))
    pts = []
    for x in range(0, w+1, step): pts.append((x, rnd.randint(0, amp*2)))
    for y in range(0, h+1, step): pts.append((w - rnd.randint(0, amp*2), y))
    for x in range(w, -1, -step): pts.append((x, h - rnd.randint(0, amp*2)))
    for y in range(h, -1, -step): pts.append((rnd.randint(0, amp*2), y))
    d.polygon(pts, fill=255)
    return m.filter(ImageFilter.GaussianBlur(0.8))

def place(canvas, name, box, seed):
    x, y, w, h = box
    sw = PATTERNS[name](w, h)
    mask = torn_mask(w, h, seed)
    sh = Image.new("L", canvas.size, 0); sh.paste(mask, (x+9, y+16))
    sh = sh.filter(ImageFilter.GaussianBlur(16))
    shadow = Image.new("RGB", canvas.size, (12, 16, 8))
    canvas.paste(Image.composite(shadow, canvas, sh.point(lambda v: int(v*0.55))), (0, 0))
    canvas.paste(sw, (x, y), mask)

def txt(canvas, s, x, y, size, anchor="la"):
    """cream text with a soft dark halo so it holds on any green"""
    f = F(size)
    lay = Image.new("RGBA", canvas.size, (0,0,0,0))
    d = ImageDraw.Draw(lay)
    d.text((x, y), s, font=f, fill=(10, 14, 8, 150), anchor=anchor)
    lay = lay.filter(ImageFilter.GaussianBlur(9))
    canvas.paste(Image.alpha_composite(canvas.convert("RGBA"), lay).convert("RGB"), (0,0))
    d2 = ImageDraw.Draw(canvas)
    d2.text((x, y), s, font=f, fill=CREAM, anchor=anchor)

# ---------- compose ----------
pano = panorama()
S1, S2, S3, S4, S5 = [i*SLIDE_W for i in range(5)]

# slide 1 — title over the couple
txt(pano, "backgrounds", S1+96,  372, 92)
txt(pano, "we're",       S1+612, 520, 92)
txt(pano, "obsessed",    S1+150, 806, 92)
txt(pano, "with",        S1+656, 954, 92)

# slide 2 — Ornamental / Lace
place(pano, "Ornamental", (S2+116, 356, 392, 588), 21)
place(pano, "Lace",       (S2+572, 356, 392, 588), 22)
txt(pano, "Ornamental", S2+312, 1010, 50, anchor="ma")
txt(pano, "Lace",       S2+768, 1010, 50, anchor="ma")

# slide 3 — Botanical / Stripes / Gingham
place(pano, "Botanical", (S3+58,  398, 306, 466), 41)
place(pano, "Stripes",   (S3+387, 398, 306, 466), 42)
place(pano, "Gingham",   (S3+716, 398, 306, 466), 43)
for nm, x in (("Botanical", 58), ("Stripes", 387), ("Gingham", 716)):
    txt(pano, nm, S3+x+153, 928, 46, anchor="ma")

# slide 4 — Damask / Scenic
place(pano, "Damask", (S4+116, 356, 392, 588), 61)
place(pano, "Scenic", (S4+572, 356, 392, 588), 62)
txt(pano, "Damask", S4+312, 1010, 50, anchor="ma")
txt(pano, "Scenic", S4+768, 1010, 50, anchor="ma")

# slide 5 — the close
txt(pano, "one of you said Botanical.", S5+540, 540, 58, anchor="ma")
txt(pano, "the other said Ornamental.", S5+540, 632, 58, anchor="ma")
txt(pano, "settle it in the comments.", S5+540, 820, 40, anchor="ma")

os.makedirs("out2", exist_ok=True)
pano.save("out2/W-01_panorama_full.jpg", "JPEG", quality=92)
for i in range(N):
    pano.crop((i*SLIDE_W, 0, (i+1)*SLIDE_W, H)).save(f"out2/W-01_{i+1}.jpg", "JPEG", quality=94)
print("panorama", pano.size, "-> 5 slides")
