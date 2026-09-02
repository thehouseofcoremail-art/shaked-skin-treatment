from PIL import Image, ImageDraw, ImageFilter
import math, random

S = 3  # supersample

def new(w, h, bg):
    return Image.new("RGB", (w*S, h*S), bg)

def down(im, w, h):
    return im.resize((w, h), Image.LANCZOS)

# ---------- individual pattern painters (drawn at S scale) ----------

def p_ornamental(w, h):
    bg, ink = "#FBFAF6", "#3F6C8C"
    im = new(w, h, bg); d = ImageDraw.Draw(im)
    lw = max(1, int(2.4*S))
    stx, sty = 132*S, 158*S
    def paisley(cx, cy, flip):
        R = int(30*S)
        # teardrop body: circle + curved tail
        d.ellipse([cx-R, cy-int(R*0.82), cx+R, cy+int(R*0.82)], outline=ink, width=lw)
        d.ellipse([cx-int(R*0.62), cy-int(R*0.5), cx+int(R*0.62), cy+int(R*0.5)], outline=ink, width=lw)
        # four petal tips around the medallion
        for i in range(4):
            aa = 45 + i*90
            px = cx + int(math.cos(math.radians(aa))*R*1.28)
            py = cy + int(math.sin(math.radians(aa))*R*1.05)
            d.ellipse([px-int(7*S), py-int(7*S), px+int(7*S), py+int(7*S)], outline=ink, width=lw)
        # inner dots
        for i in range(6):
            aa = i*60
            px = cx + int(math.cos(math.radians(aa))*R*0.34)
            py = cy + int(math.sin(math.radians(aa))*R*0.28)
            d.ellipse([px-int(2.6*S), py-int(2.6*S), px+int(2.6*S), py+int(2.6*S)], fill=ink)
        # base leaves
        for sg in (-1, 1):
            lx = cx + sg*int(R*1.15); ly = cy + int(R*0.9)
            d.ellipse([lx-int(9*S), ly-int(3.4*S), lx+int(9*S), ly+int(3.4*S)], outline=ink, width=lw)
    for gy in range(-1, h*S//sty + 2):
        for gx in range(-1, w*S//stx + 2):
            paisley(gx*stx + (stx//2 if gy % 2 else 0), gy*sty, (gx+gy) % 2 == 0)
    return down(im, w, h)

def p_lace(w, h):
    bg, ink = "#FFFDF9", "#B9AFA2"
    im = new(w, h, bg); d = ImageDraw.Draw(im)
    # net of fine dots
    st = 26*S
    for y in range(0, h*S, st):
        for x in range(0, w*S, st):
            xo = x + (st//2 if (y//st) % 2 else 0)
            d.ellipse([xo-int(1.8*S), y-int(1.8*S), xo+int(1.8*S), y+int(1.8*S)], fill=ink)
    # scalloped inner border
    m = 46*S; r = 26*S
    for x in range(m, w*S-m+1, r*2):
        d.arc([x-r, m-r, x+r, m+r], 0, 180, fill=ink, width=int(4*S))
        d.arc([x-r, h*S-m-r, x+r, h*S-m+r], 180, 360, fill=ink, width=int(4*S))
    for y in range(m, h*S-m+1, r*2):
        d.arc([m-r, y-r, m+r, y+r], 90, 270, fill=ink, width=int(4*S))
        d.arc([w*S-m-r, y-r, w*S-m+r, y+r], 270, 450, fill=ink, width=int(4*S))
    d.rectangle([m, m, w*S-m, h*S-m], outline=ink, width=int(2.5*S))
    return down(im, w, h)

def p_botanical(w, h):
    bg = "#FFFDF7"
    im = new(w, h, bg); d = ImageDraw.Draw(im)
    rnd = random.Random(7)
    petals = ["#C0798B", "#D9AE6A", "#8FA8C2", "#9A86AE", "#C98F86"]
    leaf = "#7C9463"
    st = 74*S
    for gy in range(-1, h*S//st + 2):
        for gx in range(-1, w*S//st + 2):
            cx = gx*st + (st//2 if gy % 2 else 0) + rnd.randint(-7*S, 7*S)
            cy = gy*st + rnd.randint(-7*S, 7*S)
            col = petals[(gx*2 + gy*3) % len(petals)]
            d.line([cx, cy+int(4*S), cx, cy+int(24*S)], fill=leaf, width=max(1, int(1.8*S)))
            for sg in (-1, 1):
                lx = cx + sg*int(9*S); ly = cy + int(15*S)
                d.ellipse([lx-int(7*S), ly-int(2.6*S), lx+int(7*S), ly+int(2.6*S)], fill=leaf)
            pr = int(4.0*S)
            for i in range(5):
                ang = i*72 + rnd.randint(-12, 12)
                px = cx + int(math.cos(math.radians(ang))*pr*1.35)
                py = cy + int(math.sin(math.radians(ang))*pr*1.35)
                d.ellipse([px-pr, py-pr, px+pr, py+pr], fill=col)
            d.ellipse([cx-int(2.2*S), cy-int(2.2*S), cx+int(2.2*S), cy+int(2.2*S)], fill="#E3C87A")
    return down(im, w, h)

def p_stripes(w, h):
    bg = "#FAFCFB"
    im = new(w, h, bg); d = ImageDraw.Draw(im)
    rnd = random.Random(3)
    cols = ["#3F5B3A", "#3F5B3A", "#9FBFD0", "#2E4A2B"]
    x = 0; i = 0
    while x < w*S:
        wd = rnd.choice([10, 16, 24, 34])*S
        if i % 2 == 0:
            col = cols[i % len(cols)]
            # hand-painted wobble
            pts_l, pts_r = [], []
            for y in range(0, h*S+1, 22*S):
                pts_l.append((x + rnd.randint(-3*S, 3*S), y))
                pts_r.append((x + wd + rnd.randint(-3*S, 3*S), y))
            poly = pts_l + pts_r[::-1]
            d.polygon(poly, fill=col)
        x += wd + rnd.choice([12, 18, 26])*S
        i += 1
    return down(im, w, h)

def p_gingham(w, h):
    bg = "#FFFFFF"
    im = new(w, h, bg)
    d = ImageDraw.Draw(im, "RGBA")
    c = (122, 142, 106, 118)
    st = 46*S
    for x in range(0, w*S, st*2):
        d.rectangle([x, 0, x+st, h*S], fill=c)
    for y in range(0, h*S, st*2):
        d.rectangle([0, y, w*S, y+st], fill=c)
    return down(im, w, h)

def p_damask(w, h):
    bg, ink = "#FFFCFA", "#9B2F26"
    im = new(w, h, bg); d = ImageDraw.Draw(im)
    lw = max(1, int(2.6*S))
    stx, sty = 150*S, 190*S
    def motif(cx, cy, k):
        # central stem
        d.line([cx, cy-int(46*S), cx, cy+int(40*S)], fill=ink, width=lw)
        # crown bud
        d.ellipse([cx-int(7*S), cy-int(58*S), cx+int(7*S), cy-int(40*S)], outline=ink, width=lw)
        # mirrored scrolls
        for sg in (-1, 1):
            for j, (dx, dy, rr, a0, a1) in enumerate((
                (24, -26, 22, 200, 350),
                (34,   2, 26, 190, 340),
                (26,  26, 19, 180, 330),
            )):
                x0 = cx + sg*int(dx*S) - int(rr*S); y0 = cy + int(dy*S) - int(rr*S)
                x1 = cx + sg*int(dx*S) + int(rr*S); y1 = cy + int(dy*S) + int(rr*S)
                s0, s1 = (a0, a1) if sg > 0 else (360-a1, 360-a0)
                d.arc([x0, y0, x1, y1], s0, s1, fill=ink, width=lw)
            # leaf tips
            lx = cx + sg*int(46*S); ly = cy + int(34*S)
            d.ellipse([lx-int(11*S), ly-int(4*S), lx+int(11*S), ly+int(4*S)], outline=ink, width=lw)
        # base diamond
        r = int(6*S)
        d.polygon([(cx, cy+int(44*S)-r), (cx+r, cy+int(44*S)), (cx, cy+int(44*S)+r), (cx-r, cy+int(44*S))], fill=ink)
    for gy in range(-1, h*S//sty + 2):
        for gx in range(-1, w*S//stx + 2):
            motif(gx*stx + (stx//2 if gy % 2 else 0), gy*sty, gx+gy)
    return down(im, w, h)

def p_scenic(w, h):
    im = new(w, h, "#D6E3EA"); d = ImageDraw.Draw(im)
    W_, H_ = w*S, h*S
    hz = int(H_*0.46)
    # sky gradient
    for y in range(hz):
        t = y/hz
        d.line([0, y, W_, y], fill=(int(206+26*t), int(222+16*t), int(232+10*t)))
    # layered hills, soft
    d.polygon([(0,hz-int(H_*0.07)), (int(W_*0.28),hz-int(H_*0.12)), (int(W_*0.58),hz-int(H_*0.05)),
               (W_,hz-int(H_*0.10)), (W_,hz+int(H_*0.02)), (0,hz+int(H_*0.02))], fill="#B3C4A6")
    d.polygon([(0,hz-int(H_*0.02)), (int(W_*0.42),hz-int(H_*0.06)), (W_,hz-int(H_*0.01)),
               (W_,hz+int(H_*0.05)), (0,hz+int(H_*0.05))], fill="#9DB38D")
    # ground
    d.rectangle([0, hz, W_, H_], fill="#8AA478")
    # vineyard rows: off-centre vanishing point, wide spread
    vpx, vpy = int(W_*0.62), hz+int(H_*0.01)
    for i in range(-26, 27):
        xb = int(W_*0.5 + i*W_*0.115)
        d.line([vpx, vpy, xb, H_], fill="#6F8C5B", width=max(1, int(9*S)))
        d.line([vpx, vpy, xb+int(26*S), H_], fill="#A8BE92", width=max(1, int(5*S)))
    # horizontal haze bands to break the triangle
    for k in range(7):
        yy = hz + int((H_-hz)*(k/7.0)**1.7)
        d.line([0, yy, W_, yy], fill="#94AC80", width=max(1, int((2+k)*S)))
    d.rectangle([0, int(H_*0.955), W_, H_], fill="#5F7A4C")
    im = im.filter(ImageFilter.GaussianBlur(radius=2.2*S))
    return down(im, w, h)

PATTERNS = {
    "Ornamental": p_ornamental,
    "Lace": p_lace,
    "Botanical": p_botanical,
    "Stripes": p_stripes,
    "Gingham": p_gingham,
    "Damask": p_damask,
    "Scenic": p_scenic,
}
