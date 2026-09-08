# -*- coding: utf-8 -*-
"""
Shaked Skin Treatment — HOLIDAY PREPARATIONS story frames.
Renders 1080x1920 PNGs straight to disk. No Canva assembly step.

Palette + type scale sampled from the approved template EAHTbwoK0PY and
recorded in 00_BRAND/BRAND_BRIEF.md sections 2 / 2b. Do not invent colours.
"""
import os, sys
from PIL import Image, ImageDraw, ImageFont
HERE = os.path.dirname(os.path.abspath(__file__))
FONTS = os.path.join(HERE, "fonts")

W, H = 1080, 1920
SAFE_TOP, SAFE_BOT = 250, 250          # Instagram profile row / reply bar
MARGIN = 96

BG   = (245, 244, 240)                 # #F5F4F0
INK  = (86, 86, 85)                    # #565655
LOGO = (51, 52, 51)                    # #333433
MUTE = (154, 153, 149)                 # hairlines + ordinals, tinted from INK

LIGHT, REG, MED = 300, 400, 500
_cache = {}
def F(weight, size):
    key = (weight, size)
    if key not in _cache:
        _cache[key] = ImageFont.truetype(os.path.join(FONTS, f"Heebo-{weight}.ttf"), size)
    return _cache[key]


def is_rtl(s):
    """Any Hebrew codepoint makes the run right-to-left."""
    return any(0x0590 <= ord(c) <= 0x05FF for c in s)


def _dir(s):
    return "rtl" if is_rtl(s) else "ltr"


def measure(s, font, track=0):
    w = font.getlength(s, direction=_dir(s))
    # Tracking is only ever applied to the Latin chrome, which is drawn glyph
    # by glyph. Hebrew is handed to the shaper whole, so it carries no tracking.
    if track and not is_rtl(s) and len(s) > 1:
        w += track * (len(s) - 1)
    return w


def draw_text(d, s, cx, y, font, fill, track=0, align="center"):
    """y is the top of the line box. cx is the centre (or left edge if align='left').

    This Pillow is built with Raqm, so ImageDraw.text runs the bidi algorithm
    and the shaper itself. Text must therefore be passed in LOGICAL order —
    reordering it first (with python-bidi, say) reverses it twice and the line
    comes out mirrored. Hebrew is also never drawn glyph by glyph for tracking,
    because that bypasses the shaper and breaks the ordering the same way.
    """
    w = measure(s, font, track)
    x = cx - w / 2 if align == "center" else cx
    if track and not is_rtl(s):
        for ch in s:
            d.text((x, y), ch, font=font, fill=fill)
            x += font.getlength(ch) + track
        return w
    d.text((x, y), s, font=font, fill=fill, direction=_dir(s))
    return w


# ---------- frame chrome ----------

def chrome(im, d, day=3, total=14):
    """Logotype block, hairline, and the visible series counter."""
    x = MARGIN
    y = SAFE_TOP + 34
    f1 = F(MED, 34)
    draw_text(d, "Shaked skin treatment", x, y, f1, LOGO, track=0.4, align="left")
    y += 48
    f2 = F(LIGHT, 23)
    draw_text(d, f"HOLIDAY PREPARATIONS · DAY {day} OF {total}", x, y, f2, INK, track=2.6, align="left")
    y += 46
    d.line([(MARGIN, y), (W - MARGIN, y)], fill=(224, 222, 216), width=2)
    return y + 1


def counter(d, day=3, total=14):
    """Fourteen ticks along the foot: what you have, and what you missed.

    The series is read right to left, so day 1 is the rightmost tick and the
    filled run grows leftward. Filling from the left reads as counting down.
    """
    gap, th = 10, 5
    tw = (W - 2 * MARGIN - gap * (total - 1)) / total
    y = H - SAFE_BOT - 26
    for i in range(total):
        x0 = MARGIN + i * (tw + gap)
        on = i >= total - day
        d.rounded_rectangle([x0, y, x0 + tw, y + th], radius=th / 2,
                            fill=INK if on else (224, 222, 216))


# ---------- stacking ----------
# A block is (kind, payload). Heights are measured first so the whole stack
# can be optically centred in the band between the two safe zones.

def block_height(b):
    k = b[0]
    if k == "h":   return int(b[2].size * 1.16)
    if k == "b":   return int(b[2].size * 1.75)
    if k == "gap": return b[1]
    if k == "rule":return b[1]
    if k == "steps":return b[1] * len(b[2])
    raise ValueError(k)


# Frames 2-5 all open with a heading. Pinning that heading to one y stops it
# jumping as the viewer taps through; only the matter underneath moves.
HEAD_ANCHOR = 700


def render(blocks, path, day=3, anchor=True):
    im = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(im)
    top = chrome(im, d, day)
    counter(d, day)

    band_top, band_bot = top + 40, H - SAFE_BOT - 90
    total = sum(block_height(b) for b in blocks)
    if anchor:
        y = HEAD_ANCHOR
    else:
        y = band_top + (band_bot - band_top - total) / 2
    assert y + total <= band_bot, f"{path}: stack overflows the safe area by {y+total-band_bot:.0f}px"

    for b in blocks:
        k = b[0]
        hgt = block_height(b)
        if k in ("h", "b"):
            _, s, font, fill = b[0], b[1], b[2], b[3]
            track = b[4] if len(b) > 4 else 0
            # centre the glyph box inside the line box
            asc, desc = font.getmetrics()
            draw_text(d, s, W / 2, y + (hgt - (asc + desc)) / 2, font, fill, track)
        elif k == "rule":
            wdt = b[2]
            d.line([(W / 2 - wdt / 2, y + hgt / 2), (W / 2 + wdt / 2, y + hgt / 2)],
                   fill=(224, 222, 216), width=2)
        elif k == "steps":
            _, lh, items = b
            fo, fl = F(MED, 28), F(LIGHT, 52)
            gap = 30
            wo = max(measure(o, fo) for o, _ in items)
            wl = max(measure(l, fl) for _, l in items)
            # RTL: the eye starts at the right, so the ordinal column sits there and
            # the Hebrew labels hang off a shared right-hand axis running leftward.
            right = W / 2 + (wl + gap + wo) / 2
            axis = right - wo - gap
            ao, al = fo.getmetrics(), fl.getmetrics()
            yy = y
            for o, l in items:
                draw_text(d, o, right - measure(o, fo), yy + (lh - sum(ao)) / 2,
                          fo, MUTE, align="left")
                draw_text(d, l, axis - measure(l, fl), yy + (lh - sum(al)) / 2,
                          fl, INK, align="left")
                yy += lh
        y += hgt

    im.save(path, "PNG", optimize=True)
    return path


# ---------- the five frames ----------

HEAD_C = F(LIGHT, 84)     # cover
HEAD_I = F(REG,   76)     # inner heading
BODY   = F(LIGHT, 44)
NOTE   = F(LIGHT, 38)
SUM    = F(LIGHT, 46)

DAYS = {}

DAYS[3] = {
1: [("h", "אותם מוצרים בדיוק.", HEAD_C, INK, 1.2),
    ("h", "סדר אחר.",           HEAD_C, INK, 1.2),
    ("h", "תוצאה אחרת.",        HEAD_C, INK, 1.2)],

2: [("h", "בוקר", HEAD_I, INK, 0.4),
    ("gap", 34),
    ("rule", 34, 120),
    ("gap", 26),
    ("steps", 104, [("01", "ניקוי"), ("02", "סרום"),
                    ("03", "לחות"),  ("04", "מסנן קרינה")])],

3: [("h", "ערב", HEAD_I, INK, 0.4),
    ("gap", 34),
    ("rule", 34, 120),
    ("gap", 26),
    ("steps", 104, [("01", "ניקוי"), ("02", "טיפול, אם יש"),
                    ("03", "לחות")]),
    ("gap", 40),
    ("b", "בלילה אין מסנן. אין ממה להגן.", NOTE, MUTE)],

4: [("h", "הכלל", HEAD_I, INK, 0.4),
    ("gap", 34),
    ("rule", 34, 120),
    ("gap", 30),
    ("b", "מהמרקם הדליל לסמיך.", BODY, INK),
    ("gap", 18),
    ("b", "ומסנן קרינה תמיד אחרון —", BODY, INK),
    ("b", "אם מרחת עליו לחות, ביטלת אותו.", BODY, INK)],

5: [("h", "יום שלישי", HEAD_I, INK, 0.4),
    ("gap", 34),
    ("rule", 34, 120),
    ("gap", 30),
    ("b", "בוקר — ניקוי · סרום · לחות · מסנן", SUM, INK),
    ("b", "ערב — ניקוי · טיפול · לחות",        SUM, INK),
    ("gap", 30),
    ("b", "מהדליל לסמיך. מסנן אחרון.", SUM, INK),
    ("gap", 44),
    ("rule", 34, 120),
    ("gap", 20),
    ("b", "שמרי. מחר — יום רביעי.", NOTE, MUTE)],
}

# Day 4 keeps day 3's grammar exactly — heading, rule, body, and a summary that
# repeats the three markers — so four days in, the series reads as one object.
DAYS[4] = {
1: [("h", "טיפול אחד",            HEAD_C, INK, 1.2),
    ("h", "לא נמדד ביום שאחריו.", HEAD_C, INK, 1.2)],

2: [("h", "שבוע", HEAD_I, INK, 0.4),
    ("gap", 34),
    ("rule", 34, 120),
    ("gap", 30),
    ("b", "לחות. רכות. זוהר.", BODY, INK),
    ("gap", 18),
    ("b", "אלה מגיעים מהר,", BODY, INK),
    ("b", "כי זה מים — לא מבנה.", BODY, INK)],

3: [("h", "חודש", HEAD_I, INK, 0.4),
    ("gap", 34),
    ("rule", 34, 120),
    ("gap", 30),
    ("b", "מחזור התחדשות אחד.", BODY, INK),
    ("gap", 18),
    ("b", "כאן כבר אפשר לדעת", BODY, INK),
    ("b", "אם הכיוון נכון.", BODY, INK),
    ("gap", 40),
    ("b", "והמחזור מתארך עם הגיל.", NOTE, MUTE)],

4: [("h", "שלושה חודשים", HEAD_I, INK, 0.4),
    ("gap", 34),
    ("rule", 34, 120),
    ("gap", 30),
    ("b", "פיגמנטציה. צלקות.", BODY, INK),
    ("gap", 18),
    ("b", "אלה זזות לאט —", BODY, INK),
    ("b", "וזה לא סימן שלא עובד.", BODY, INK)],

5: [("h", "יום רביעי", HEAD_I, INK, 0.4),
    ("gap", 34),
    ("rule", 34, 120),
    ("gap", 30),
    ("b", "שבוע — לחות ורכות",              SUM, INK),
    ("b", "חודש — מחזור התחדשות אחד",       SUM, INK),
    ("b", "שלושה חודשים — פיגמנטציה וצלקות", SUM, INK),
    ("gap", 44),
    ("rule", 34, 120),
    ("gap", 20),
    ("b", "שמרי. מחר — יום חמישי.", NOTE, MUTE)],
}

# Day 6 — the deep clean: not pampering, not punishment. Poll-driven.
#
# Three earlier versions were rejected. All three rejections are load-bearing:
#   1. A question box. ~95 followers; a box that returns two answers reads as
#      ignored, and the closing frame promised answers the next day.
#   2. The strong-peel myth (redness = damaged barrier). Collides head-on with
#      the Dermapen, which works by controlled micro-injury and leaves the
#      skin red. Blocked until the contraindication list allows drawing the
#      controlled-injury vs damage distinction.
#   3. SPF in September. A near-duplicate of an existing unit —
#      06_DRAFTS/SHAKED_2026-08-27_stories_sunscreen-daily.md, six frames,
#      same "גם בעננים" line, same poll. Generic education is the weakest
#      thing a 95-follower account can post; it competes with everyone.
#
# ALWAYS grep 06_DRAFTS and the whole client folder for the topic before
# choosing one. That check is what would have caught version 3.
#
# This version is her entry treatment and her own positioning line, unused
# until now (DAHTtayM4q0 p5), and it argues against the device-and-acid hype
# that fills the category — which is something only she can say.
#
# Frame 2 is deliberately empty below the copy — that is where the poll
# sticker goes. It is a native IG sticker, not an element.
# No quotation marks anywhere: a leading straight quote on a Hebrew line
# renders on the wrong side, same family as the digits rule.
DAYS[6] = {
1: [("h", "לפני המכשירים.", HEAD_C, INK, 1.2),
    ("h", "לפני החומצות.",  HEAD_C, INK, 1.2)],

2: [("h", "השאלה", HEAD_I, INK, 0.4),
    ("gap", 34),
    ("rule", 34, 120),
    ("gap", 30),
    ("b", "ניקוי עור בשבילך —", BODY, INK),
    ("b", "פינוק או עונש?", BODY, INK)],

3: [("h", "התשובה", HEAD_I, INK, 0.4),
    ("gap", 34),
    ("rule", 34, 120),
    ("gap", 30),
    ("b", "לא פינוק.", BODY, INK),
    ("b", "ולא עונש.", BODY, INK),
    ("gap", 18),
    ("b", "זו עבודה.", BODY, INK)],

4: [("h", "למה קודם", HEAD_I, INK, 0.4),
    ("gap", 34),
    ("rule", 34, 120),
    ("gap", 30),
    ("b", "הוצאת שחורים נכונה", BODY, INK),
    ("b", "היא הבסיס.", BODY, INK),
    ("gap", 18),
    ("b", "עליה נבנה כל השאר —", BODY, INK),
    ("b", "מכשירים, חומצות, סדרות.", BODY, INK)],

5: [("h", "יום שישי", HEAD_I, INK, 0.4),
    ("gap", 34),
    ("rule", 34, 120),
    ("gap", 30),
    ("b", "לא פינוק. לא עונש.",        SUM, INK),
    ("b", "הבסיס.",                     SUM, INK),
    ("gap", 18),
    ("b", "בואי נבדוק מה העור שלך",    SUM, INK),
    ("b", "צריך לפני החג — כתבי לי.",  SUM, INK),
    ("gap", 44),
    ("rule", 34, 120),
    ("gap", 20),
    ("b", "מחר — יום שביעי.", NOTE, MUTE)],
}


# Day 10 — four days out: what is still on the table, and what is not.
# Direction from Romy: a beauty treatment, something that leaves no marks.
#
# The frames deliberately do NOT name a treatment and do NOT state how many
# days before an event each treatment needs. Both are facts only Shaked has,
# and TREATMENTS.md still marks the timings UNKNOWN. Frame 4 routes that
# decision to her instead of inventing it.
#
# Frame 2 is deliberately empty below the copy — the poll sticker goes there
# (זוהר לחג · תהליך). It also segments her DMs: whoever taps "זוהר לחג" is
# ready to book this week.
DAYS[10] = {
1: [("h", "עוד אפשר.",      HEAD_C, INK, 1.2),
    ("h", "רק לא כל דבר.", HEAD_C, INK, 1.2)],

2: [("h", "השאלה", HEAD_I, INK, 0.4),
    ("gap", 34),
    ("rule", 34, 120),
    ("gap", 30),
    ("b", "מה את מחפשת עכשיו —", BODY, INK),
    ("b", "זוהר לחג,", BODY, INK),
    ("b", "או תהליך לטווח ארוך?", BODY, INK)],

3: [("h", "הכלל", HEAD_I, INK, 0.4),
    ("gap", 34),
    ("rule", 34, 120),
    ("gap", 30),
    ("b", "לפני אירוע לא מנסים", BODY, INK),
    ("b", "משהו חדש על העור.", BODY, INK),
    ("gap", 18),
    ("b", "זה לא הזמן לגלות", BODY, INK),
    ("b", "איך את מגיבה.", BODY, INK)],

4: [("h", "מה כן", HEAD_I, INK, 0.4),
    ("gap", 34),
    ("rule", 34, 120),
    ("gap", 30),
    ("b", "טיפול שמאיר ומרענן", BODY, INK),
    ("b", "ולא משאיר סימנים.", BODY, INK),
    ("gap", 18),
    ("b", "איזה בדיוק — תלוי בעור", BODY, INK),
    ("b", "ובכמה ימים נשארו.", BODY, INK)],

5: [("h", "יום עשירי", HEAD_I, INK, 0.4),
    ("gap", 34),
    ("rule", 34, 120),
    ("gap", 30),
    ("b", "עוד אפשר — רק לא כל דבר.",        SUM, INK),
    ("b", "בוחרים מה שלא משאיר סימנים.",    SUM, INK),
    ("gap", 18),
    ("b", "כתבי לי מה מתוכנן ומתי,",        SUM, INK),
    ("b", "ונתאים.",                         SUM, INK),
    ("gap", 44),
    ("rule", 34, 120),
    ("gap", 20),
    ("b", "מחר — יום אחד עשר. שלושה ימים בלבד לערב החג!", NOTE, MUTE)],
}

if __name__ == "__main__":
    import sys
    day = int(sys.argv[1]) if len(sys.argv) > 1 else 3
    if day not in DAYS:
        sys.exit(f"no frames written for day {day}; days available: {sorted(DAYS)}")
    out = os.path.abspath(os.path.join(HERE, "..", f"DAY{day:02d}"))
    os.makedirs(out, exist_ok=True)
    for n in sorted(DAYS[day]):
        p = os.path.join(out, f"shaked-day{day:02d}-{n:02d}.png")
        render(DAYS[day][n], p, day=day, anchor=(n != 1))
        print(p)
