# חמשת סוכני התוכן — מדריך הפעלה

חמישה סוכנים אוטונומיים, אחד לכל לקוח. כל סוכן מכיר מותג אחד בלבד, חוקר רק את מרחב העיסוק שלו, ומייצר תוצרים מוכנים להפקה.

| סוכן | לקוח | תיקיית מותג |
|---|---|---|
| `thoc-content-director` | THE HOUSE OF CORE | `content/THOC/` |
| `merchav-mudaout-content-director` | מרחב מודעות — פריידי מרגלית | `content/MERCHAV_MUDAOUT/` |
| `welcome-content-director` | Welcome — RSVP & Wedding Website | `content/WELCOME/` |
| `renanails-content-director` | Renanails | `content/RENANAILS/` |
| `shaked-skin-content-director` | Shaked Skin Treatment | `content/SHAKED_SKIN/` |

---

## מה כל סוכן עושה בלי לשאול אותך

מחקר מתחרים ושחקנים חדשים · מחקר טרנדים באינסטגרם ובטיקטוק · לוח תוכן מתגלגל לארבעה שבועות · קרוסלות סלייד-אחר-סלייד · רצפי סטוריז פריים-אחר-פריים · רילסים עם shot list מלא · קופי, קפשנים ו-CTA · שכפול טמפלט בקאנבה ועריכת עותק · ביקורת עצמית ותיקון לפני שהוא מציג לך.

## מה הוא לעולם לא עושה בלי אישור מפורש

לפרסם · לתזמן · לפנות ללקוחות · להוציא תקציב פרסום · לערוך Master Template בקאנבה · להשתמש בתמונות לקוח מזוהות ללא אישור מתועד · להמציא מחיר, זמינות, המלצה, תוצאה או הסמכה.

## מתי הוא כן יעצור וישאל

רק כשעובדה חסרה משנה את התוצר — מחיר, שירות, זמינות, אישור לקוח, נכס ויזואלי חסר או כלל מותג סותר. השאלות מגיעות מרוכזות בסוף, לא באמצע העבודה.

---

## שלב 1 — מלאי את ה-Brand Brief (30–45 דקות ללקוח)

זה הצעד היחיד שבלעדיו התוצרים יהיו "בערך במותג".

פתחי `content/<BRAND>/00_BRAND/BRAND_BRIEF.md` ומלאי. שדה שאת לא יודעת — כתבי `UNKNOWN`, לא ניחוש.
הכי קריטי: **צבעים ב-HEX, שמות פונטים, קישורי לוגו, קישור Brand Kit בקאנבה, רשימת שירותים ומחירים, שלוש התנגדויות נפוצות.**

הוסיפי לתיקיות:
- `01_OFFERS/` — שירותים, מחירים, מדיניות, FAQ
- `02_CONTENT/` — פוסטים קודמים + צילומי מסך של ביצועים
- `03_MEDIA/` — תמונות וסרטונים מאושרים **בלבד**, עם קובץ `RIGHTS.md` שמפרט מי אישר פרסום ומה מותר להשתמש

> אל תעלי תיקיית תמונות בלי לציין זכויות שימוש ואישורי לקוחות. סוכן לא יכול לנחש מי הסכים.

## שלב 2 — הרצת Onboarding (סוכן אחד בכל פעם)

בטרמינל, מתוך תיקיית הפרויקט, הדביקי:

```
Use the shaked-skin-content-director agent.

Start with onboarding only. Read the complete brand folder at content/SHAKED_SKIN/ and audit what exists.

Then return:
1. What you currently know about the brand, in your own words.
2. Missing or conflicting information, ranked by how much it blocks accurate work.
3. Five direct competitors and three emerging players, with dated sources.
4. Current Instagram and TikTok trends that genuinely fit this brand, each with the bridge line to a business goal.
5. A proposed four-week content calendar.
6. The first seven production-ready content pieces.

Ask me only the minimum questions that block accurate work. Do not publish anything.
```

לכל סוכן אחר — החליפי את שם הסוכן ואת נתיב התיקייה. הנוסח שמור ב-`content/_templates/ONBOARDING_PROMPT.md`.

**עני על השאלות שהוא מחזיר לפני שאת ממשיכה.** התשובות שלך נכנסות ל-BRAND_BRIEF, ומשם הן קבועות לכל הרצה הבאה.

## שלב 3 — שגרת עבודה

- **פעם בשבוע:** `Use the <agent>. Run the weekly research pass and update the four-week calendar.`
- **בכל יום עבודה:** `Use the <agent>. Produce today's content package per the calendar.`
- **פעם בחודש:** `Use the <agent>. Analyse last month's performance and rebalance the reach / trust / conversion mix.`

---

## חיבורים

| מה | למה זה נדרש | סטטוס |
|---|---|---|
| Web Search / Browse | בלי זה הסוכן לא באמת מכיר טרנדים עכשוויים — הוא ינחש | חובה |
| Canva MCP | שכפול טמפלטים ועריכת עותקים | מחובר |
| Google Drive / Sheets | לוחות תוכן משותפים | אופציונלי |
| כלי פרסום | תזמון ופרסום בפועל | לא מחובר — החבילה עוצרת בטיוטה מוכנה |

### קאנבה — מצב מאומת (2026-08-27)

חשבון הקאנבה מחובר. כל חמשת המותגים כבר קיימים בו כ-Brand Kits:

| מותג | Brand Kit ID | Master Template קיים |
|---|---|---|
| THOC | `kAHOmHGbSRE` | ❌ אין — צריך ליצור קרוסלה + סטורי |
| מרחב מודעות | `kAHSr3nG-ow` | `EAHTb7elXPM` — K-10 לדעת לקבל |
| Welcome | `kAHAev_d9kc` | `EAHSlruQPR4` — welcome wed (IG Story) |
| Renanails | `kAHLayVj_bA` | `EAHTcLB3jOg` — renanails · קרוסלה |
| Shaked Skin | `kAEeVAw86H8` | `EAHTbwoK0PY` — 4-Slide Daily Carousel |

הפרטים המלאים בכל `content/<BRAND>/00_BRAND/CANVA.md`.

**שתי פעולות בקאנבה שכדאי לעשות היום:**
1. ה-Brand Kit של Shaked (`kAEeVAw86H8`) הוא ללא שם בחשבון — תני לו שם.
2. ל-THOC אין עדיין Brand Template. בלי טמפלט הסוכן יכתוב קופי מצוין אבל לא יוכל לעצב.

**כלל קאנבה:** ה-Master נעול, הסוכן תמיד משכפל ועובד על עותק.

---

## מבנה תיקיות

```
content/<BRAND>/
├── 00_BRAND/     brand book, לוגו, פונטים, פלטה, טון  ← BRAND_BRIEF.md
├── 01_OFFERS/    שירותים, מחירים, FAQ, מדיניות
├── 02_CONTENT/   פוסטים קודמים וביצועים
├── 03_MEDIA/     תמונות וסרטונים מאושרים + RIGHTS.md
├── 04_RESEARCH/  מקורות, טרנדים, מתחרים
├── 05_CALENDAR/  לוח חודשי ושבועי
└── 06_DRAFTS/    קישורי Canva, קופי, סקריפטים
```

תבניות מוכנות: `content/_templates/`

## עריכת הסוכנים

הגדרות הסוכנים נמצאות ב-`.claude/agents/*.md`. אפשר לערוך אותן ישירות בכל רגע — הן נטענות מחדש בכל הרצה.
- `model: sonnet` — אפשר להעלות ל-`opus` להרצות מחקר כבדות או לקמפיינים.
- `maxTurns: 40` — הורדה תקצר ריצות, העלאה מאפשרת מחקר עמוק יותר.
