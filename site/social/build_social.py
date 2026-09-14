# -*- coding: utf-8 -*-
"""
המרווח — מחולל קרוסלות לאינסטגרם.

מייצר 1080x1350 PNG לכל כתבה, ישר לדיסק, בשפה העיצובית של האתר:
רקע דיו, כותרת Heebo 900 עם פסוקית שנייה בפריוונקל, שכבת מונו לכל מספר,
וסימן המותג — שני קווים עם מרווח מדוד ביניהם.

    python3 social/build_social.py            כל הכתבות
    python3 social/build_social.py netisha    כתבה אחת

מה נכנס לשקפים — ומה לא:
  נכנס:    כותרת, פסקת פתיחה, גוף החלק הפתוח, וכותרות המשנה של החלק בתשלום.
  לא נכנס: אף משפט מגוף הכתבה בתשלום.
כותרות משנה הן תוכן עניינים, לא הניתוח עצמו — זה בדיוק שקף "מה יש בפנים"
שממיר. אם מעדיפים בלי, מריצים עם --no-toc.

עברית: ה-Pillow כאן בנוי עם Raqm, ולכן הטקסט נמסר בסדר לוגי ו-Pillow מריץ
בעצמו bidi ועיצוב גליפים. אסור להפוך את המחרוזת מראש — זה הופך אותה פעמיים.
"""
import json
import os
import re
import sys

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    raise SystemExit("חסר Pillow. התקנה:  pip install Pillow\n"
                     "צריך build עם Raqm כדי שעברית תעוצב נכון.")

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
FONTS = os.path.join(HERE, "fonts")
OUT = os.path.join(HERE, "out")

W, H = 1080, 1350
MARGIN = 88

BG = (10, 11, 15)
PANEL = (20, 22, 29)
PAPER = (242, 243, 247)
MUTED = (134, 139, 160)
ACCENT = (157, 180, 255)
SIGNAL = (240, 180, 41)
POS = (111, 211, 166)

_cache = {}


def F(name, size):
    key = (name, size)
    if key not in _cache:
        _cache[key] = ImageFont.truetype(os.path.join(FONTS, name + ".ttf"), size)
    return _cache[key]


DISPLAY = lambda s: F("Heebo-900", s)
BODY = lambda s: F("Heebo-400", s)
MONO = lambda s: F("IBMPlexMono-500", s)


def LABEL(text, size):
    """שכבת המונו היא לטינית ולמספרים בלבד — ל-IBM Plex Mono אין אותיות
    עבריות, ותווית עברית בו יוצאת ריבועים. עברית חוזרת ל-Heebo."""
    return MONO(size) if all(ord(c) < 0x0590 for c in text) else BODY(size)


def is_rtl(s):
    return any(0x0590 <= ord(c) <= 0x05FF for c in s)


def _dir(s):
    return "rtl" if is_rtl(s) else "ltr"


def measure(s, font):
    return font.getlength(s, direction=_dir(s)) if s else 0


def draw_rtl(d, s, right_x, y, font, fill):
    """מצייר טקסט כשהקצה הימני שלו ב-right_x. הטקסט נמסר בסדר לוגי."""
    if not s:
        return 0
    w = measure(s, font)
    d.text((right_x - w, y), s, font=font, fill=fill, direction=_dir(s))
    return w


def wrap(s, font, max_w):
    """שבירת שורות לפי רוחב בפועל, במילים שלמות."""
    words, lines, cur = s.split(), [], ""
    for word in words:
        trial = (cur + " " + word).strip()
        if measure(trial, font) <= max_w or not cur:
            cur = trial
        else:
            lines.append(cur)
            cur = word
    if cur:
        lines.append(cur)
    return lines


def fit(s, max_w, max_lines, start, floor=34, step=3):
    """מקטין את הגופן עד שהכותרת נכנסת במספר השורות שהוקצב."""
    size = start
    while size > floor:
        font = DISPLAY(size)
        lines = wrap(s, font, max_w)
        if len(lines) <= max_lines:
            return font, lines
        size -= step
    font = DISPLAY(floor)
    return font, wrap(s, font, max_w)[:max_lines]


def split_clause(title):
    """מפצל כותרת לשתי פסוקיות כדי לצבוע את השנייה — הטריק העריכתי
    שגורם לכותרת להיקרא כאמירה ולא כתיאור. בלי סימן פיצול, הכול לבן."""
    for sep in [" — ", ": ", " – "]:
        if sep in title:
            head, tail = title.split(sep, 1)
            return head + sep.rstrip(), tail
    return title, ""


# ------------------------------------------------------------------ רקעים
def seeded(s):
    h = 2166136261
    for ch in s:
        h ^= ord(ch)
        h = (h * 16777619) & 0xFFFFFFFF
    a = h

    def rnd():
        nonlocal a
        a = (a + 0x6D2B79F5) & 0xFFFFFFFF
        t = (a ^ (a >> 15)) * (1 | a) & 0xFFFFFFFF
        t = (t + ((t ^ (t >> 7)) * (61 | t) & 0xFFFFFFFF)) ^ t
        return ((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296

    return rnd


FAMILY = {
    "מודל": "contour", "פתח דבר": "rings", "תזרים": "flow",
    "שימור": "flow", "תפעול": "grid", "תמחור": "grid", "שוק": "contour",
    "שיווק": "rings",
}


def backdrop(img, slug, category, strength=1.0):
    """אותו דפוס שמופיע בעטיפת הכתבה באתר, בעוצמה נמוכה מאחורי הטקסט."""
    import math
    fam = FAMILY.get(category, "contour")
    rnd = seeded(slug)
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)

    def line(pts, alpha):
        a = int(max(0, min(255, alpha * strength)))
        if a > 2 and len(pts) > 1:
            d.line(pts, fill=ACCENT + (a,), width=2)

    if fam == "contour":
        cx, curve = W * (0.28 + rnd() * 0.5), 1 / (W * (0.95 + rnd() * 1.1))
        gap = H / (8 + int(rnd() * 4))
        for k in range(18):
            pts = [(x, H * 1.04 - (x - cx) ** 2 * curve - k * gap) for x in range(-20, W + 40, 40)]
            line(pts, 70 - k * 3.4)
    elif fam == "flow":
        amp, period, gap = 34 + rnd() * 46, 1.4 + rnd() * 1.6, H / 13
        for k in range(14):
            phase = rnd() * 6.28
            pts = [(x, gap * (k + 0.8) + math.sin((x / W) * period * 6.28 + phase) * amp * (0.4 + k / 18))
                   for x in range(-20, W + 40, 36)]
            line(pts, 62 - abs(k - 7) * 5)
    elif fam == "grid":
        cols = 13 + int(rnd() * 16)
        cw = W / cols
        base = H * (0.88 + rnd() * 0.08)
        d.line([(0, base), (W, base)], fill=ACCENT + (55,), width=2)
        for c in range(cols):
            bh = H * (0.12 + rnd() * 0.5)
            x0 = c * cw + cw * 0.24
            d.rectangle([x0, base - bh, x0 + cw * 0.52, base],
                        fill=ACCENT + (int(10 + rnd() * 26),))
    else:
        cx, cy = W * (0.2 + rnd() * 0.6), H * (0.92 + rnd() * 0.2)
        for k in range(1, 15):
            r = k * (H / 9)
            d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=ACCENT + (max(4, int(64 - k * 4)),), width=2)

    img.alpha_composite(layer)


# -------------------------------------------------------------------- chrome
def mark(d, cx, cy, r=32):
    """סימן המותג: שורות טקסט שנעצרות לפני קו השוליים.

    הרווח בין סוף השורות לקו הענבר הוא המרווח עצמו. שני קווים אנכיים עם
    קו ביניהם נקראו כאות H, ולכן הסימן בנוי משורות ומקו שוליים אחד."""
    d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=ACCENT + (110,), width=2)
    rule_x = cx - r * 0.38
    d.line([(rule_x, cy - r * 0.58), (rule_x, cy + r * 0.58)], fill=SIGNAL, width=3)
    right = cx + r * 0.56
    for k, dy in enumerate((-r * 0.34, 0, r * 0.34)):
        end = rule_x + r * (0.30 if k == 2 else 0.18)   # השורה האחרונה קצרה יותר
        d.line([(end, cy + dy), (right, cy + dy)], fill=ACCENT, width=4)


def chrome(img, d, brand, kicker, index, total, footer_left=""):
    right = W - MARGIN
    mark(d, right - 32, MARGIN + 26)
    d.text((right - 88 - MONO(25).getlength(kicker, direction="ltr"), MARGIN + 12),
           kicker, font=MONO(25), fill=MUTED, direction="ltr")

    y = H - MARGIN - 26
    d.line([(MARGIN, y - 26), (W - MARGIN, y - 26)], fill=ACCENT + (40,), width=1)
    counter = "%02d / %02d" % (index, total)
    d.text((MARGIN, y), counter, font=MONO(24), fill=ACCENT, direction="ltr")
    if footer_left:
        draw_rtl(d, footer_left, right, y, LABEL(footer_left, 24), MUTED)


def new_slide(slug, category, strength=1.0):
    img = Image.new("RGBA", (W, H), BG + (255,))
    backdrop(img, slug, category, strength)
    return img, ImageDraw.Draw(img)


# --------------------------------------------------------------- slide kinds
def slide_hook(a, index, total):
    img, d = new_slide(a["slug"], a["category"], 1.0)
    right = W - MARGIN
    maxw = W - MARGIN * 2

    chrome(img, d, a, "// THE MARGIN", index, total, a["date_he"])

    head, tail = split_clause(a["title"])
    font, lines = fit(a["title"], maxw, 5, 92)
    total_h = len(lines) * (font.size * 1.14)
    y = (H - total_h) / 2 - 70

    # הפסוקית השנייה נצבעת — הכותרת נקראת כאמירה, לא כתיאור
    accent_from = None
    if tail:
        joined = ""
        for i, ln in enumerate(lines):
            joined = (joined + " " + ln).strip()
            if len(joined) >= len(head) - 2:
                accent_from = i + 1
                break
    for i, ln in enumerate(lines):
        colour = ACCENT if (accent_from is not None and i >= accent_from) else PAPER
        draw_rtl(d, ln, right, y, font, colour)
        y += font.size * 1.14

    y += 26
    d.line([(right - 120, y), (right, y)], fill=SIGNAL, width=4)
    y += 30
    draw_rtl(d, a["category"], right, y, BODY(27), SIGNAL)
    y += 52
    for ln in wrap(a["dek"], BODY(34), maxw)[:3]:
        draw_rtl(d, ln, right, y, BODY(34), MUTED)
        y += 50
    return img


def slide_body(a, text, index, total, eyebrow=""):
    img, d = new_slide(a["slug"], a["category"], 0.35)
    right = W - MARGIN
    maxw = W - MARGIN * 2
    chrome(img, d, a, "// THE MARGIN", index, total, "%s דק׳ קריאה" % a["readingTime"])

    font, lines = fit(text, maxw, 9, 58, floor=32)
    block = len(lines) * font.size * 1.3 + (64 if eyebrow else 0)
    y = max(MARGIN + 170, (H - block) / 2 - 40)

    if eyebrow:
        draw_rtl(d, eyebrow, right, y, LABEL(eyebrow, 26), SIGNAL)
        y += 64

    for ln in lines:
        draw_rtl(d, ln, right, y, font, PAPER)
        y += font.size * 1.3
    return img


def slide_formula(a, formula, index, total):
    img, d = new_slide(a["slug"], a["category"], 0.25)
    right = W - MARGIN
    chrome(img, d, a, "// THE MARGIN", index, total, "הנוסחה")

    lines = [l for l in formula.split("\n") if l.strip()]
    box_h = len(lines) * 62 + 80
    y = max(MARGIN + 190, (H - box_h - 90) / 2)

    draw_rtl(d, "החישוב עצמו", right, y, BODY(28), SIGNAL)
    y += 90
    d.rectangle([MARGIN, y, W - MARGIN, y + box_h], fill=PANEL + (235,), outline=ACCENT + (70,), width=2)
    yy = y + 40
    for ln in lines:
        size = 40
        while measure(ln, LABEL(ln, size)) > W - MARGIN * 2 - 80 and size > 18:
            size -= 2
        font = LABEL(ln, size)
        if is_rtl(ln):
            draw_rtl(d, ln, W - MARGIN - 40, yy, font, ACCENT)
        else:
            d.text((MARGIN + 40, yy), ln, font=font, fill=ACCENT, direction="ltr")
        yy += 62
    return img


def slide_toc(a, headings, index, total):
    img, d = new_slide(a["slug"], a["category"], 0.3)
    right = W - MARGIN
    maxw = W - MARGIN * 2 - 70
    chrome(img, d, a, "// THE MARGIN", index, total, "למנויות")

    items = headings[:6]
    wrapped = [wrap(h, BODY(37), maxw)[:2] for h in items]
    block = 120 + sum(len(w) * 50 + 34 for w in wrapped)
    y = max(MARGIN + 150, (H - block) / 2)

    draw_rtl(d, "מה יש בפנים", right, y, DISPLAY(64), PAPER)
    y += 120
    for i, lines in enumerate(wrapped, 1):
        d.text((W - MARGIN - 46, y + 6), "%02d" % i, font=MONO(26), fill=SIGNAL, direction="ltr")
        for j, ln in enumerate(lines):
            draw_rtl(d, ln, right - 70, y, BODY(37), PAPER if j == 0 else MUTED)
            y += 50
        y += 34
    return img


def slide_cta(a, cfg, index, total):
    img, d = new_slide(a["slug"], a["category"], 0.5)
    right = W - MARGIN
    maxw = W - MARGIN * 2
    chrome(img, d, a, "// THE MARGIN", index, total)

    y = MARGIN + 250
    draw_rtl(d, "המשך הניתוח", right, y, BODY(30), SIGNAL)
    y += 80
    font, lines = fit(cfg["brand"]["tagline"], maxw, 3, 96)
    for ln in lines:
        draw_rtl(d, ln, right, y, font, PAPER)
        y += font.size * 1.15

    y += 40
    d.line([(right - 140, y), (right, y)], fill=ACCENT, width=4)
    y += 46
    for ln in wrap(cfg["brand"]["description"], BODY(34), maxw)[:4]:
        draw_rtl(d, ln, right, y, BODY(34), MUTED)
        y += 50

    y += 40
    domain = cfg["brand"]["domain"].replace("https://", "")
    box_w = MONO(34).getlength(domain, direction="ltr") + 70
    d.rectangle([right - box_w, y, right, y + 74], outline=ACCENT, width=2)
    d.text((right - box_w + 35, y + 18), domain, font=MONO(34), fill=ACCENT, direction="ltr")
    return img


# ------------------------------------------------------------------ content
def parse_article(path):
    raw = open(path, encoding="utf-8").read()
    m = re.match(r"^---\n(.*?)\n---\n", raw, re.S)
    meta, body = {}, raw[m.end():] if m else raw
    if m:
        for line in m.group(1).split("\n"):
            kv = re.match(r"^([\w-]+):\s*(.*)$", line)
            if kv:
                meta[kv.group(1)] = kv.group(2).strip()

    parts = re.split(r"\n<!--\s*paywall\s*-->\n", body)
    free = parts[0]
    paid = parts[1] if len(parts) > 1 else ""
    meta["_paid"] = paid

    y, mth, dd = meta.get("date", "2026-01-01").split("-")
    meta["date_he"] = "%s.%s.%s" % (dd, mth, y)
    meta["readingTime"] = meta.get("readingTime", "8")

    def clean(t):
        t = re.sub(r"\*\*([^*]+)\*\*", r"\1", t)
        t = re.sub(r"`([^`]+)`", r"\1", t)
        t = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", t)
        return t.strip()

    paragraphs = [clean(p) for p in re.split(r"\n\s*\n", free)
                  if p.strip() and not p.strip().startswith(("#", ">", "-", "|", "{{", "```"))]
    formulas = re.findall(r"```\n(.*?)```", free + "\n" + paid, re.S)
    headings = [clean(h) for h in re.findall(r"^##\s+(.*)$", paid, re.M)]
    return meta, paragraphs, formulas, headings


def build(slug_filter=None, with_toc=True):
    cfg = json.load(open(os.path.join(ROOT, "site.config.json"), encoding="utf-8"))
    src = os.path.join(ROOT, "content/articles")
    made = 0

    for name in sorted(os.listdir(src)):
        if not name.endswith(".md"):
            continue
        meta, paragraphs, formulas, headings = parse_article(os.path.join(src, name))
        slug = meta.get("slug", "")
        if slug_filter and slug != slug_filter:
            continue

        a = {
            "slug": slug, "title": meta["title"], "dek": meta["dek"],
            "category": meta["category"], "date_he": meta["date_he"],
            "readingTime": meta["readingTime"],
        }

        # שקף לכל פסקה מהחלק הפתוח, עד שלוש — הן הטיזר, לא המוצר
        body_texts = [p for p in paragraphs[:3] if len(p) > 40]

        # שמירה אקטיבית: אף משפט מהחלק בתשלום לא מגיע לשקף.
        # כותרות משנה מותרות במפורש — הן תוכן עניינים, לא הניתוח.
        paid_body = meta.get("_paid", "")
        paid_prose = "\n".join(l for l in paid_body.split("\n") if not l.startswith("#"))
        for text in body_texts:
            for sentence in re.split(r"(?<=[.!?])\s+", text):
                sentence = sentence.strip()
                if len(sentence) >= 45 and sentence in paid_prose:
                    raise SystemExit("דליפה: משפט בתשלום הגיע לשקף של %s\n  %s" % (slug, sentence[:70]))
        plan = ["hook"] + ["body"] * len(body_texts)
        if formulas:
            plan.append("formula")
        if with_toc and headings:
            plan.append("toc")
        plan.append("cta")
        total = len(plan)

        out_dir = os.path.join(OUT, slug)
        os.makedirs(out_dir, exist_ok=True)
        for f in os.listdir(out_dir):
            os.remove(os.path.join(out_dir, f))

        bi = 0
        for i, kind in enumerate(plan, 1):
            if kind == "hook":
                img = slide_hook(a, i, total)
            elif kind == "body":
                img = slide_body(a, body_texts[bi], i, total)
                bi += 1
            elif kind == "formula":
                img = slide_formula(a, formulas[0].strip(), i, total)
            elif kind == "toc":
                img = slide_toc(a, headings, i, total)
            else:
                img = slide_cta(a, cfg, i, total)
            img.convert("RGB").save(os.path.join(out_dir, "%02d.png" % i), quality=95)

        made += 1
        print("  %-22s %d שקפים" % (slug, total))

    print("\n[ok] %d קרוסלות ב-social/out/" % made)


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    build(args[0] if args else None, with_toc="--no-toc" not in sys.argv)
