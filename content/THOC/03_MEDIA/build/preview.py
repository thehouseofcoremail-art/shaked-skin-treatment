# -*- coding: utf-8 -*-
"""
Build the August recap.

With no august_stats.json present this renders the design with [slots] showing
what is still missing. Run ingest_registrations.py over the registrations
export first and the numbers drop in by themselves.

A number only gets called a record when the export actually contains earlier
months to beat it; otherwise the slide states the count plainly.
"""
import os, json, carousel as C

HERE = os.path.dirname(os.path.abspath(__file__))
OUT  = os.path.abspath(os.path.join(HERE, "..", "AUGUST_RECAP"))
os.makedirs(OUT, exist_ok=True)
p = lambda i: os.path.join(OUT, f"thoc-august-recap-{i:02d}.png")

STATS = None
sp = os.path.join(HERE, "august_stats.json")
if os.path.exists(sp):
    STATS = json.load(open(sp, encoding="utf-8"))

def num(key, fallback):
    return f"{STATS['august'][key]:,}" if STATS else fallback

def note(key, fallback):
    """Only claim a record when there is history in the file proving one."""
    if not STATS:
        return fallback
    if STATS.get("has_history") and STATS["records"].get(key):
        prev = max(v[key] for k, v in STATS["per_month"].items() if k < "2026-08")
        return f"שיא. הקודם היה {prev:,}."
    return "" if STATS.get("has_history") else "‏"

TOP = (STATS or {}).get("top_formats") or []
fmt_line = " · ".join(f for f, _ in TOP[:2]) if TOP else "Hot Pilates · Hot Sculpt"

C.cover(p(1), "AUGUST", "2026", "החודש שהיה")

C.statement(p(2), [("אוגוסט הוא החודש", False),
                   ("שהכי קל לוותר בו.", True),
                   ("", False),
                   ("אצלנו הוא נראה אחרת.", True)], 2, kicker="THE MONTH")

C.stat(p(3), num("regs",    "[000]"), "", "הרשמות לשיעורים",       note("regs",    "[שיא? צריך חודשים קודמים בקובץ]"), 3)
C.stat(p(4), num("members", "[00]"),  "", "מתאמנים עברו בסטודיו",  note("members", "[מתוכם כמה חדשים]"),              4)
C.stat(p(5), "[00]",                  "°", "בסטודיו, כל שיעור",     fmt_line,                                          5)

C.statement(p(6), [("[הרגע של החודש]", True),
                   ("", False),
                   ("[שתי שורות על מה שקרה,]", False),
                   ("[ולמה הוא נשאר לכם בראש.]", False)], 6,
            kicker="THE MOMENT", invert=True)

C.statement(p(7), [("ספטמבר הוא חודש של איפוס.", False),
                   ("", False),
                   ("THOC RESET", True),
                   ("[תאריך פתיחה]", False)], 7, kicker="WHAT'S NEXT")

C.cta(p(8), "SEE YOU ON THE MAT",
      ["איינשטיין 82, רמת אביב", "Hot Pilates · MegaReformer"],
      "הלינק בביו", 8)

print("stats:", STATS["source"] if STATS else "none — rendered with [slots]")
for i in range(1, 9):
    print(p(i))
