# -*- coding: utf-8 -*-
"""
גיליון בדיקה לנכסי הפרופיל.

    python3 social/preview_profile.py

מציג כל תמונת פרופיל חתוכה לעיגול בשלושת הגדלים שאינסטגרם באמת מציג:
150 (עמוד הפרופיל), 110 (פיד) ו-32 (תגובות). אם הסימן לא נקרא ב-32,
הוא לא עובד — שם רואים אותו הכי הרבה פעמים.
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from PIL import Image, ImageDraw                      # noqa: E402
from build_social import BG, MUTED, MONO              # noqa: E402

OUT = os.path.join(HERE, "out", "profile")
SIZES = [150, 110, 32]


def circle(img, size):
    im = img.convert("RGBA").resize((size, size), Image.LANCZOS)
    mask = Image.new("L", (size * 4, size * 4), 0)
    ImageDraw.Draw(mask).ellipse([0, 0, size * 4 - 1, size * 4 - 1], fill=255)
    im.putalpha(mask.resize((size, size), Image.LANCZOS))
    return im


names = sorted(n for n in os.listdir(OUT) if n.startswith("avatar"))
PAD, ROW = 34, 200
W = 150 + 110 + 32 + PAD * 6 + 190 + 80
sheet = Image.new("RGBA", (W, ROW * len(names) + PAD), (6, 7, 10, 255))
d = ImageDraw.Draw(sheet)

for i, n in enumerate(names):
    src = Image.open(os.path.join(OUT, n))
    y = PAD + i * ROW
    d.text((PAD, y + 70), n.replace(".png", ""), font=MONO(20), fill=MUTED, direction="ltr")
    x = PAD + 190
    for s in SIZES:
        sheet.alpha_composite(circle(src, s), (int(x), int(y + (150 - s) / 2)))
        d.text((x, y + 160), "%dpx" % s, font=MONO(15), fill=MUTED, direction="ltr")
        x += s + PAD
    # אותו 32 על רקע לבן — אינסטגרם במצב בהיר. עיגול כהה בלי שפה נעלם
    # ברקע הנגדי, וזה הדבר היחיד שהגיליון הזה לא מראה אחרת.
    d.rectangle([x - 8, y + 50, x + 56, y + 114], fill=(255, 255, 255))
    sheet.alpha_composite(circle(src, 32), (int(x + 16), int(y + 66)))
    d.text((x, y + 160), "32 light", font=MONO(15), fill=MUTED, direction="ltr")

path = os.path.join(OUT, "_contact-sheet.png")
sheet.convert("RGB").save(path, quality=95)
print(path)
