# -*- coding: utf-8 -*-
"""
THOC — Instagram carousel renderer, 1080x1350 PNGs straight to disk.

Palette and typefaces come from 00_BRAND/BRAND_BRIEF.md. Only #5B1E25 is an
exact brand value; WARM_WHITE and CHAMPAGNE are readings of "warm white" and
"champagne/gold", which the brief names without hex codes. Swap them the moment
real values exist.

Cormorant Garamond has no Hebrew glyphs, so it carries English only — brand
name, class names, numerals. Frank Ruhl Libre carries the Hebrew.
"""
import os
from PIL import Image, ImageDraw, ImageFont
from bidi.algorithm import get_display

HERE  = os.path.dirname(os.path.abspath(__file__))
FONTS = os.path.join(HERE, "fonts")

W, H   = 1080, 1350
MARGIN = 92

BURGUNDY    = (91, 30, 37)        # #5B1E25 — exact, from the brief
WARM_WHITE  = (245, 240, 233)     # reading of "warm white"
CHAMPAGNE   = (201, 169, 118)     # reading of "champagne/gold"
INK         = (17, 15, 15)

_cache = {}
def F(face, size):
    if (face, size) not in _cache:
        _cache[(face, size)] = ImageFont.truetype(os.path.join(FONTS, face + ".ttf"), size)
    return _cache[(face, size)]

HE_L, HE_M, HE_B = "FrankRuhl-300", "FrankRuhl-500", "FrankRuhl-700"
EN_L, EN_B       = "Cormorant-300", "Cormorant-600"


def vis(s):
    """Hebrew is authored logically; PIL draws visually and has no bidi engine."""
    return get_display(s)


def measure(s, font, track=0):
    v = vis(s)
    w = font.getlength(v)
    return w + track * (len(v) - 1) if track and len(v) > 1 else w


def txt(d, s, x, y, font, fill, track=0, align="center"):
    v = vis(s)
    w = measure(s, font, track)
    if   align == "center": x -= w / 2
    elif align == "right":  x -= w
    if not track:
        d.text((x, y), v, font=font, fill=fill)
        return w
    for ch in v:
        d.text((x, y), ch, font=font, fill=fill)
        x += font.getlength(ch) + track
    return w


def frame(d, n, total, dark=True):
    """Champagne hairline, wordmark, and the slide counter — on every slide."""
    ink = CHAMPAGNE if dark else BURGUNDY
    d.rectangle([MARGIN - 26, MARGIN - 26, W - MARGIN + 26, H - MARGIN + 26],
                outline=ink, width=2)
    txt(d, "THE HOUSE OF CORE", MARGIN, MARGIN - 4, F(EN_B, 26), ink, track=5.5, align="left")
    txt(d, f"{n:02d} / {total:02d}", W - MARGIN, H - MARGIN - 30, F(EN_L, 30), ink,
        track=2, align="right")


def rule(d, y, width=150, color=CHAMPAGNE):
    d.line([(W / 2 - width / 2, y), (W / 2 + width / 2, y)], fill=color, width=2)


# ---------------------------------------------------------------- slide kinds

def cover(path, month="AUGUST", year="2026", kicker="החודש שהיה", n=1, total=8):
    im = Image.new("RGB", (W, H), BURGUNDY); d = ImageDraw.Draw(im)
    frame(d, n, total)
    txt(d, kicker, W / 2, 452, F(HE_L, 42), WARM_WHITE, track=3)
    txt(d, month, W / 2, 530, F(EN_L, 210), WARM_WHITE, track=6)
    rule(d, 792)
    txt(d, "RECAP", W / 2, 828, F(EN_B, 62), CHAMPAGNE, track=22)
    txt(d, year, W / 2, 950, F(EN_L, 40), WARM_WHITE, track=10)
    im.save(path, "PNG", optimize=True); return path


def stat(path, number, unit, label, note, n, total=8):
    """One number, one Hebrew label, one line of context."""
    im = Image.new("RGB", (W, H), BURGUNDY); d = ImageDraw.Draw(im)
    frame(d, n, total)
    y = 430
    fnum = F(EN_L, 260)
    wn = measure(number, fnum)
    if unit:
        fu = F(EN_L, 76); wu = measure(unit, fu); gap = 16
        x0 = W / 2 - (wn + gap + wu) / 2
        txt(d, number, x0, y, fnum, CHAMPAGNE, align="left")
        txt(d, unit, x0 + wn + gap, y + 150, fu, CHAMPAGNE, align="left")
    else:
        txt(d, number, W / 2, y, fnum, CHAMPAGNE)
    rule(d, 790)
    txt(d, label, W / 2, 828, F(HE_M, 62), WARM_WHITE)
    if note:
        txt(d, note, W / 2, 936, F(HE_L, 38), (216, 197, 190))
    im.save(path, "PNG", optimize=True); return path


def statement(path, lines, n, total=8, kicker=None, invert=False):
    """A block of Hebrew lines, optionally on warm white."""
    bg  = WARM_WHITE if invert else BURGUNDY
    fg  = BURGUNDY   if invert else WARM_WHITE
    im = Image.new("RGB", (W, H), bg); d = ImageDraw.Draw(im)
    frame(d, n, total, dark=not invert)
    sizes = [F(HE_M, 60) if b else F(HE_L, 60) for _, b in lines]
    lh = 96
    total_h = lh * len(lines) + (78 if kicker else 0)
    y = (H - total_h) / 2
    if kicker:
        txt(d, kicker, W / 2, y, F(EN_B, 32), CHAMPAGNE if not invert else BURGUNDY, track=8)
        y += 78
    for (s, _), f in zip(lines, sizes):
        txt(d, s, W / 2, y, f, fg); y += lh
    im.save(path, "PNG", optimize=True); return path


def cta(path, headline, lines, button, n, total=8):
    im = Image.new("RGB", (W, H), BURGUNDY); d = ImageDraw.Draw(im)
    frame(d, n, total)
    # Shrink to fit inside the champagne frame rather than letting it bleed out.
    fh, track = F(EN_B, 78), 10
    avail = W - 2 * MARGIN - 56
    for size in range(78, 33, -2):
        fh = F(EN_B, size)
        if measure(headline, fh, track) <= avail:
            break
    txt(d, headline, W / 2, 400 + (78 - fh.size) * 0.6, fh, CHAMPAGNE, track=track)
    rule(d, 540)
    y = 590
    for s in lines:
        txt(d, s, W / 2, y, F(HE_L, 48), WARM_WHITE); y += 78
    bw, bh = 560, 108
    bx, by = (W - bw) / 2, 900
    d.rectangle([bx, by, bx + bw, by + bh], outline=CHAMPAGNE, width=2)
    fb = F(HE_M, 44)
    txt(d, button, W / 2, by + (bh - fb.size * 1.35) / 2, fb, CHAMPAGNE)
    im.save(path, "PNG", optimize=True); return path
