# -*- coding: utf-8 -*-
"""Design preview for the August recap. Every […] is a slot Romy still has to fill."""
import os, carousel as C

OUT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "AUGUST_RECAP"))
os.makedirs(OUT, exist_ok=True)
p = lambda i: os.path.join(OUT, f"thoc-august-recap-{i:02d}.png")

C.cover(p(1), "AUGUST", "2026", "החודש שהיה")

C.statement(p(2), [("אוגוסט הוא החודש", False),
                   ("שהכי קל לוותר בו.", True),
                   ("", False),
                   ("אצלנו הוא נראה אחרת.", True)], 2, kicker="THE MONTH")

C.stat(p(3), "[000]", "",  "שיעורים בחודש אחד",      "[שורת הקשר — למשל: הכי הרבה מאז שנפתחנו]", 3)
C.stat(p(4), "[00]",  "",  "פרצופים חדשים על הרפורמר", "[מאיפה הם הגיעו]", 4)
C.stat(p(5), "[00]",  "°", "בסטודיו, כל שיעור",        "Hot Pilates · Hot Sculpt", 5)

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

for i in range(1, 9): print(p(i))
