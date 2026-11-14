# -*- coding: utf-8 -*-
"""
המרווח — נכסי הפרופיל לאינסטגרם.

    python3 social/build_profile.py

מייצר ל-social/out/profile/:
    avatar-*.png      תמונות פרופיל, 1080x1080 — ארבע גרסאות לבחירה
    highlight-*.png   עטיפות היילייטס, 1080x1920 בפורמט סטורי

אינסטגרם חותך את תמונת הפרופיל לעיגול, ואת עטיפת ההיילייט לעיגול מתוך
מרכז הסטורי. לכן כל מה שחייב להיראות יושב בתוך רדיוס בטוח מהמרכז, ולא
עד הפינות. טקסט הביו והשאר יושבים ב-social/profile.md.

את הגופנים, הצבעים והסימן אנחנו לוקחים מהמחולל של הקרוסלות — אותה שפה
עיצובית בדיוק, אחרת הפרופיל והפוסטים נראים כמו שני מותגים.
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

from PIL import Image, ImageDraw                      # noqa: E402
from build_social import (                            # noqa: E402
    BG, PANEL, PAPER, MUTED, ACCENT, SIGNAL,
    DISPLAY, BODY, MONO, backdrop, draw_rtl, measure,
)

OUT = os.path.join(HERE, "out", "profile")


def brandmark(d, cx, cy, r, ring=False, bars=ACCENT, rule=SIGNAL):
    """שורות טקסט שנעצרות לפני קו השוליים. הרווח ביניהם הוא המרווח.

    בעברית השורה נגמרת משמאל, ולכן קו השוליים משמאל והשורות נמשכות ממנו
    ימינה. העוביים יחסיים ל-r, כדי שהסימן ייראה זהה בכל גודל."""
    if ring:
        d.ellipse([cx - r, cy - r, cx + r, cy + r],
                  outline=ACCENT + (110,), width=max(2, int(r * 0.055)))
    rule_x = cx - r * 0.38
    d.line([(rule_x, cy - r * 0.58), (rule_x, cy + r * 0.58)],
           fill=rule, width=max(3, int(r * 0.095)))
    right = cx + r * 0.56
    for k, dy in enumerate((-r * 0.34, 0, r * 0.34)):
        end = rule_x + r * (0.30 if k == 2 else 0.18)   # השורה האחרונה קצרה
        d.line([(end, cy + dy), (right, cy + dy)],
               fill=bars, width=max(4, int(r * 0.125)))


def canvas(w, h, slug, category, strength, bg=BG):
    img = Image.new("RGBA", (w, h), bg + (255,))
    if strength:
        src = Image.new("RGBA", (1080, 1350), (0, 0, 0, 0))
        backdrop(src, slug, category, strength)
        img.alpha_composite(src.resize((w, h)), (0, 0))
    return img, ImageDraw.Draw(img)


# ------------------------------------------------------------- תמונות פרופיל
S = 1080
CX = CY = S // 2


def avatar_glyph(d, bars, rule, scale=1.0):
    """גיאומטריה ייעודית לאווטאר, לא היחסים של הסימן בקרוסלה.

    שם הסימן יושב בפינה של שקף 1080x1350 ויכול להיות קטן. כאן הוא *כל*
    התמונה, ואינסטגרם מציג אותה גם ב-32 פיקסל — אז הוא ממלא את העיגול.
    בעובי ובמרווחים האלה שלוש השורות עדיין נפרדות זו מזו ב-32."""
    half = 280 * scale
    bar_w = int(88 * scale)
    right = CX + 300 * scale
    rule_x = CX - 300 * scale
    d.line([(rule_x, CY - 310 * scale), (rule_x, CY + 310 * scale)],
           fill=rule, width=int(40 * scale))
    for k, dy in enumerate((-half, 0, half)):
        end = rule_x + (150 if k == 2 else 86) * scale    # השורה האחרונה קצרה
        d.line([(end, CY + dy), (right, CY + dy)], fill=bars, width=bar_w)


def avatar_mark():
    """הסימן לבדו, במלוא העיגול. השורות בלבן־נייר ולא בפריוונקל: בפיד
    כהה פריוונקל על דיו הוא ניגודיות נמוכה, והסימן נמרח בקטן."""
    img, d = canvas(S, S, "profile", "מודל", 0.0, bg=PANEL)
    avatar_glyph(d, PAPER, SIGNAL)
    return img


def avatar_accent():
    """אותה גיאומטריה בפריוונקל — קרוב יותר לשפה של השקפים."""
    img, d = canvas(S, S, "profile", "מודל", 0.35, bg=PANEL)
    avatar_glyph(d, ACCENT, SIGNAL)
    return img


def avatar_hebrew():
    """השם בעברית. נקרא מצוין בפיד, פחות בתגובות — שם הוא 32 פיקסל."""
    img, d = canvas(S, S, "profile", "שוק", 0.5)
    word = "המרווח"
    size = 230
    while measure(word, DISPLAY(size)) > S * 0.62 and size > 90:
        size -= 4
    f = DISPLAY(size)
    w = measure(word, f)
    draw_rtl(d, word, CX + w / 2, CY - size * 0.62, f, PAPER)
    d.line([(CX - w / 2 - 26, CY - size * 0.72), (CX - w / 2 - 26, CY + size * 0.30)],
           fill=SIGNAL, width=12)
    latin = "THE MARGIN"
    lf = MONO(44)
    d.text((CX - lf.getlength(latin, direction="ltr") / 2, CY + size * 0.52),
           latin, font=lf, fill=ACCENT, direction="ltr")
    return img


def avatar_light():
    """גרסה בהירה. הניגודיות הכי גבוהה מכולן, ולכן הכי קריאה בקטן."""
    img, d = canvas(S, S, "profile", "מודל", 0.0, bg=PAPER)
    avatar_glyph(d, (16, 18, 25), (198, 132, 20))
    return img


# -------------------------------------------------------- עטיפות היילייטס
HW, HH = 1080, 1920
HCX, HCY = HW // 2, HH // 2


def highlight(word, category, slug):
    """פורמט סטורי. אינסטגרם חותך עיגול מהמרכז, ולכן המילה יושבת במרכז
    וכל השאר הוא רקע שממילא ייחתך."""
    # רקע פאנל ולא דיו, אחרת העיגול נטמע ברקע השחור של הפרופיל במצב כהה
    img, d = canvas(HW, HH, slug, category, 0.45, bg=PANEL)
    size = 220
    while measure(word, DISPLAY(size)) > 790 and size > 70:
        size -= 4
    f = DISPLAY(size)
    w = measure(word, f)
    d.line([(HCX - 110, HCY - size * 0.86), (HCX + 110, HCY - size * 0.86)],
           fill=SIGNAL, width=12)
    draw_rtl(d, word, HCX + w / 2, HCY - size * 0.50, f, PAPER)
    return img


HIGHLIGHTS = [
    ("מילון", "מודל", "gloss"),
    ("כלים", "תפעול", "tools"),
    ("מספרים", "שוק", "numbers"),
    ("שוק", "שוק", "market"),
    ("מי אני", "מודל", "about"),
    ("המנוי", "מיצוב", "sub"),
]


def build():
    os.makedirs(OUT, exist_ok=True)
    for f in os.listdir(OUT):
        os.remove(os.path.join(OUT, f))

    made = []
    for name, fn in [("avatar-mark", avatar_mark), ("avatar-accent", avatar_accent),
                     ("avatar-hebrew", avatar_hebrew), ("avatar-light", avatar_light)]:
        fn().convert("RGB").save(os.path.join(OUT, name + ".png"), quality=95)
        made.append(name)

    for word, cat, slug in HIGHLIGHTS:
        img = highlight(word, cat, slug)
        n = "highlight-" + slug
        img.convert("RGB").save(os.path.join(OUT, n + ".png"), quality=95)
        made.append(n)

    for n in made:
        print("  " + n)
    print("\n[ok] %d נכסים ב-social/out/profile/" % len(made))


if __name__ == "__main__":
    build()
