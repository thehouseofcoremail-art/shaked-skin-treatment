#!/usr/bin/env node
/**
 * מאחורי המראות — גנרטור סטטי ללא תלויות.
 *   npm run build            בניית האתר לתוך public/
 *   npm run build -- --demo  בונה גם public/data/bodies.demo.json לתצוגה מקדימה בלבד
 *
 * גוף של כתבה בתשלום לעולם לא נכנס ל-HTML הסטטי. הוא נכתב ל-functions/_data/bodies.js
 * ומוגש רק דרך /api/article/:slug אחרי בדיקת הרשאה.
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const DEMO = process.argv.includes("--demo");
const cfg = JSON.parse(readFileSync(join(ROOT, "site.config.json"), "utf8"));
const FAQ = JSON.parse(readFileSync(join(ROOT, "content/faq.json"), "utf8"));
const warnings = [];

/* ------------------------------------------------------------------ md */
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const NUL = String.fromCharCode(0);

function inline(text) {
  const codes = [];
  let s = esc(text).replace(/`([^`]+)`/g, (_, c) => NUL + (codes.push(c) - 1) + NUL);
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>');
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/(^|[\s(])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  return s.replace(new RegExp(NUL + "(\\d+)" + NUL, "g"), (_, i) => "<code>" + codes[+i] + "</code>");
}

function renderTable(rows) {
  const cells = (r) => r.replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
  const head = cells(rows[0]);
  const body = rows.slice(2).map(cells);
  return `<div class="table-scroll"><table><thead><tr>${head
    .map((c) => `<th>${inline(c)}</th>`)
    .join("")}</tr></thead><tbody>${body
    .map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`)
    .join("")}</tbody></table></div>`;
}

const BLOCK_START = /^(#{2,4}\s|>\s?|[-*]\s|\d+\.\s|\||```|\{\{|---\s*$|\*\*\*\s*$)/;

function md(src, shortcodes = {}) {
  const lines = String(src).replace(/\r\n/g, "\n").split("\n");
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }

    if (line.startsWith("```")) {
      i++;
      const buf = [];
      while (i < lines.length && !lines[i].startsWith("```")) buf.push(lines[i++]);
      i++;
      out.push(`<pre class="code"><code>${esc(buf.join("\n"))}</code></pre>`);
      continue;
    }
    const sc = /^\{\{\s*([\w-]+)\s*\}\}$/.exec(line.trim());
    if (sc) { out.push(shortcodes[sc[1]] || ""); i++; continue; }

    const h = /^(#{2,4})\s+(.*)$/.exec(line);
    if (h) { out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`); i++; continue; }

    if (/^(---|\*\*\*)\s*$/.test(line)) { out.push("<hr />"); i++; continue; }

    if (line.startsWith("|")) {
      const rows = [];
      while (i < lines.length && lines[i].startsWith("|")) rows.push(lines[i++]);
      out.push(renderTable(rows));
      continue;
    }
    if (/^>\s?/.test(line)) {
      const buf = [];
      while (i < lines.length && /^>/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, ""));
      out.push(`<blockquote>${md(buf.join("\n"), shortcodes)}</blockquote>`);
      continue;
    }
    if (/^[-*]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) items.push(lines[i++].replace(/^[-*]\s+/, ""));
      out.push(`<ul>${items.map((t) => `<li>${inline(t)}</li>`).join("")}</ul>`);
      continue;
    }
    if (/^\d+\.\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) items.push(lines[i++].replace(/^\d+\.\s+/, ""));
      out.push(`<ol>${items.map((t) => `<li>${inline(t)}</li>`).join("")}</ol>`);
      continue;
    }
    const buf = [];
    while (i < lines.length && lines[i].trim() && !BLOCK_START.test(lines[i])) buf.push(lines[i++]);
    out.push(`<p>${inline(buf.join(" "))}</p>`);
  }
  return out.join("\n");
}

function frontMatter(raw) {
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(raw);
  if (!m) return { data: {}, body: raw };
  const data = {};
  for (const line of m[1].split("\n")) {
    const kv = /^([\w-]+):\s*(.*)$/.exec(line);
    if (!kv) continue;
    let v = kv[2].trim();
    if (/^\[.*\]$/.test(v)) v = v.slice(1, -1).split(",").map((x) => x.trim()).filter(Boolean);
    else if (v === "true") v = true;
    else if (v === "false") v = false;
    else if (/^\d+$/.test(v)) v = Number(v);
    data[kv[1]] = v;
  }
  return { data, body: raw.slice(m[0].length) };
}

/* -------------------------------------------------------------- helpers */
const rel = (depth) => "../".repeat(depth);
const dateHe = (iso) => { const [y, m, d] = iso.split("-"); return `${d}.${m}.${y}`; };
const words = (s) => s.split(/\s+/).filter(Boolean).length;
const pad2 = (n) => String(n).padStart(2, "0");

/* ------------------------------------------------------------ partials */
const FAVICON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' fill='%230A0B0F'/%3E%3Cpath d='M3 25C7 14 25 14 29 25' stroke='%239DB4FF' stroke-width='2.4' fill='none'/%3E%3Cpath d='M8 30c3-7 13-7 16 0' stroke='%236E86D6' stroke-width='2.4' fill='none'/%3E%3C/svg%3E";

function head({ title, desc, depth, path = "", extra = "", jsonld = "" }) {
  const r = rel(depth);
  const full = `${title} · ${cfg.brand.name}`;
  const url = cfg.brand.domain.replace(/\/$/, "") + "/" + path;
  return `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(full)}</title>
<meta name="description" content="${esc(desc)}" />
<link rel="canonical" href="${esc(url)}" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="${esc(cfg.brand.name)}" />
<meta property="og:title" content="${esc(full)}" />
<meta property="og:description" content="${esc(desc)}" />
<meta property="og:locale" content="he_IL" />
<meta name="twitter:card" content="summary_large_image" />
<link rel="icon" href="${FAVICON}" />
<link rel="alternate" type="application/rss+xml" title="${esc(cfg.brand.name)}" href="${r}feed.xml" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;700;900&amp;family=Assistant:wght@300;400;600&amp;family=IBM+Plex+Mono:wght@400;500&amp;display=swap" />
<link rel="stylesheet" href="${r}assets/site.css" />
${jsonld ? `<script type="application/ld+json">${jsonld}</script>` : ""}
${extra}
</head>
<body>
<a class="skip" href="#main">דילוג לתוכן</a>`;
}

function masthead(depth) {
  const r = rel(depth);
  return `<header class="masthead">
  <div class="wrap masthead-in">
    <a class="wordmark" href="${r}index.html">
      <span class="wordmark-he">${esc(cfg.brand.name)}</span>
      <span class="wordmark-latin">${esc(cfg.brand.latin)}</span>
    </a>
    <nav class="mnav" aria-label="ראשי">
      <a href="${r}index.html">הגיליון</a>
      <a href="${r}tools/unit-economics/index.html">מחשבון</a>
      <a href="${r}about/index.html">על הטור</a>
      <a href="${r}account/index.html">החשבון שלי</a>
    </nav>
    <a class="btn btn--solid btn--sm" href="${r}subscribe/index.html">מנוי</a>
  </div>
</header>`;
}

function ticker(stats) {
  return `<div class="ticker"><div class="wrap ticker-in">
    ${stats.map((s) => `<span>${s}</span>`).join("\n    ")}
  </div></div>`;
}

function footer(depth) {
  const r = rel(depth);
  const year = new Date().getFullYear();
  return `<footer class="foot"><div class="wrap">
  <div class="foot-grid">
    <div>
      <h4>המגזין</h4>
      <p style="color:var(--muted);font-size:.9rem;font-weight:300;max-width:34ch">${esc(cfg.brand.description)}</p>
    </div>
    <div>
      <h4>ניווט</h4>
      <ul>
        <li><a href="${r}index.html">הגיליון</a></li>
        <li><a href="${r}subscribe/index.html">מנוי</a></li>
        <li><a href="${r}tools/unit-economics/index.html">מחשבון יחידת כלכלה</a></li>
        <li><a href="${r}about/index.html">על הטור</a></li>
        <li><a href="${r}feed.xml">RSS</a></li>
      </ul>
    </div>
    <div>
      <h4>המנוי</h4>
      <ul>
        <li><a href="${r}account/index.html">החשבון שלי</a></li>
        <li><a href="${r}terms/index.html">תנאי שימוש</a></li>
        <li><a href="${r}privacy/index.html">פרטיות</a></li>
        <li><a href="mailto:${esc(cfg.author.email)}">${esc(cfg.author.email)}</a></li>
      </ul>
    </div>
  </div>
  <div class="foot-base">
    <span class="mono">${year} &copy; ${esc(cfg.brand.name)} · ${esc(cfg.author.name)}</span>
    <span class="mono">ללא תוכן ממומן · ללא עמלות ספקים</span>
  </div>
</div></footer>
<script src="${r}assets/site.js"></script>
</body>
</html>`;
}

/* ---------------------------------------------------------- components */
function storyCard(a, depth) {
  const r = rel(depth);
  return `<a class="story" href="${r}a/${a.slug}/index.html">
  <div class="story-meta">
    <span class="chip">${esc(a.category)}</span>
    <span class="mono">${dateHe(a.date)}</span>
    <span class="dot">·</span>
    <span class="mono">${a.readingTime} דק׳</span>
    ${a.premium ? '<span class="chip chip--lock">למנויות</span>' : '<span class="chip chip--free">פתוח</span>'}
  </div>
  <h3>${esc(a.title)}</h3>
  <p>${esc(a.dek)}</p>
</a>`;
}

const PLAN_FEATS = {
  trial: ["גישה מלאה לארכיון", "גיליון שבועי במייל", "ביטול בלחיצה, בלי שיחת שימור"],
  annual: ["כל מה שבמסלול החודשי", "חודשיים מתנה בפועל", "נעילת מחיר לשנה"],
  team: ["עד 5 מושבים", "גישה מלאה לכל המושבים", "התאמות לרשתות ולספקים"],
};

function planCard(p) {
  const feats = PLAN_FEATS[p.id] || [];
  const cta = p.id === "team"
    ? `<a class="btn btn--wide" href="mailto:${esc(cfg.author.email)}?subject=${encodeURIComponent("מסלול סטודיו")}">${esc(p.cta)}</a>`
    : `<button class="btn btn--wide ${p.featured ? "btn--solid" : ""}" data-checkout="${p.id}" type="button">${esc(p.cta)}</button>`;
  return `<div class="plan${p.featured ? " plan--featured" : ""}">
  ${p.badge ? `<span class="badge">${esc(p.badge)}</span>` : ""}
  <span class="mono mono--accent">${esc(p.eyebrow)}</span>
  <h3>${esc(p.title)}</h3>
  ${p.price ? `<div class="price">${esc(p.price)}</div>` : ""}
  <p class="price-note">${esc(p.priceNote)}</p>
  <p class="renew">${esc(p.renewNote)}</p>
  <div class="plan-foot">
    ${cta}
    <ul class="plan-feats">${feats.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>
  </div>
</div>`;
}

function plansBlock() {
  return `<div class="plans">${cfg.plans.map(planCard).join("\n")}</div>
  <p class="msg" data-checkout-msg></p>`;
}

const CALC_FIELDS = [
  ["rev", "הכנסה לראש", 75],
  ["cap", "מקומות בשיעור", 12],
  ["fill", "מלאות ממוצעת %", 68],
  ["coach", "עלות מדריכה לשיעור", 180],
  ["vari", "עלות משתנה לראש", 6],
  ["fixed", "עלות קבועה לשעה", 95],
  ["classes", "שיעורים בשבוע", 28],
];

function calculator() {
  return `<div class="calc" data-calc>
  <div class="calc-head">
    <h3>מחשבון יחידת כלכלה</h3>
    <span class="mono">שיעור אחד · תרומה נטו</span>
  </div>
  <div class="calc-body">
    <div class="calc-inputs">
      ${CALC_FIELDS.map(([id, label, def]) => `<div class="field">
        <label for="calc-${id}">${esc(label)}</label>
        <input type="number" id="calc-${id}" value="${def}" data-default="${def}" min="0" step="any" inputmode="decimal" />
      </div>`).join("\n      ")}
    </div>
    <div class="calc-out">
      <div class="out-row"><span class="k">משתתפות בשיעור</span><span class="v" data-out="heads">—</span></div>
      <div class="out-row"><span class="k">הכנסה מהשיעור</span><span class="v" data-out="income">—</span></div>
      <div class="out-row"><span class="k">תרומה נטו לשיעור</span><span class="v" data-out="contribution">—</span></div>
      <div class="out-row"><span class="k">נקודת איזון</span><span class="v" data-out="breakeven">—</span></div>
      <div class="out-row"><span class="k">תרומה חודשית מהלוח</span><span class="v" data-out="monthly">—</span></div>
      <div class="gauge">
        <div class="gauge-track"><div class="gauge-fill" data-out="gauge" style="width:0"></div></div>
        <div class="gauge-legend">
          <span class="mono" data-out="legend">—</span>
          <button class="mono" type="button" data-calc-reset style="background:none;border:0;color:var(--accent);cursor:pointer;padding:0">איפוס</button>
        </div>
      </div>
    </div>
  </div>
  <div class="calc-foot"><span class="mono">ברירות המחדל הן המחשה בלבד, לא נתוני שוק · הנתונים נשמרים בדפדפן שלך ולא נשלחים לשרת</span></div>
</div>`;
}

const ICONS = {
  model: '<path d="M3 21h18M6 21V9m6 12V4m6 17v-8"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>',
  week: '<rect x="3" y="5" width="18" height="16" rx="1"/><path d="M3 10h18M8 3v4m8-4v4"/>',
  archive: '<rect x="3" y="4" width="18" height="4"/><path d="M5 8v12h14V8M10 12h4"/>',
};
const icon = (k) => `<svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[k]}</svg>`;

/* ------------------------------------------------------------- content */
const articles = readdirSync(join(ROOT, "content/articles"))
  .filter((f) => f.endsWith(".md"))
  .map((f) => {
    const { data, body } = frontMatter(readFileSync(join(ROOT, "content/articles", f), "utf8"));
    let [ledeRaw, bodyRaw = ""] = body.split(/\n<!--\s*paywall\s*-->\n/);
    // בכתבה פתוחה אין מה להסתיר: סימון ה-paywall מתעלם והטקסט כולו מוצג.
    if (!data.premium && bodyRaw.trim()) { ledeRaw = ledeRaw + "\n\n" + bodyRaw; bodyRaw = ""; }
    if (data.status === "seed") warnings.push(`טיוטת זרע: content/articles/${f} — להחליף בדיווח שלך לפני עלייה לאוויר`);
    if (data.premium && !bodyRaw.trim()) warnings.push(`כתבה בתשלום בלי סימון paywall: ${f}`);
    return {
      file: f,
      slug: data.slug,
      title: data.title,
      dek: data.dek,
      category: data.category,
      date: data.date,
      issue: data.issue ?? cfg.brand.launchIssue,
      premium: !!data.premium,
      status: data.status || "",
      tags: data.tags || [],
      readingTime: data.readingTime || Math.max(1, Math.round(words(body) / 200)),
      ledeHtml: md(ledeRaw, { calculator: calculator() }),
      bodyHtml: bodyRaw.trim() ? md(bodyRaw, { calculator: calculator() }) : "",
    };
  })
  .sort((a, b) => (a.date < b.date ? 1 : -1));

const pages = Object.fromEntries(
  readdirSync(join(ROOT, "content/pages")).filter((f) => f.endsWith(".md")).map((f) => {
    const { data, body } = frontMatter(readFileSync(join(ROOT, "content/pages", f), "utf8"));
    if (data.legal) warnings.push(`עמוד משפטי: content/pages/${f} — טיוטה, חייבת בדיקת עו״ד לפני עלייה לאוויר`);
    return [f.replace(/\.md$/, ""), { ...data, html: md(body.replace("{{AUTHOR_BIO}}", cfg.author.bio)) }];
  })
);

/* --------------------------------------------------------------- pages */
function homePage() {
  const [lead, ...rest] = articles;
  const totalMin = articles.reduce((s, a) => s + a.readingTime, 0);
  const stats = [
    `גיליון <b>${pad2(cfg.brand.launchIssue)}</b>`,
    `<b>${dateHe(articles[0].date)}</b>`,
    `<b>${articles.length}</b> כתבות בארכיון`,
    `<b>${totalMin}</b> דקות קריאה`,
    `<b>${cfg.paywall.freeArticlesPerMonth}</b> קריאות חינם בחודש`,
    "ללא ספונסרים",
  ];
  return `${head({
    title: cfg.brand.tagline,
    desc: cfg.brand.description,
    depth: 0,
    jsonld: JSON.stringify({
      "@context": "https://schema.org", "@type": "Blog",
      name: cfg.brand.name, description: cfg.brand.description, inLanguage: "he-IL",
      url: cfg.brand.domain, author: { "@type": "Person", name: cfg.author.name },
    }),
  })}
${masthead(0)}
${ticker(stats)}
<main id="main">

<section class="hero">
  <canvas class="contours" aria-hidden="true"></canvas>
  <div class="wrap hero-in">
    <div class="kicker">
      <span class="chip">${esc(lead.category)}</span>
      <span class="mono">${dateHe(lead.date)}</span>
      <span class="rule"></span>
      <span class="mono mono--accent">${esc(cfg.brand.tagline)}</span>
    </div>
    <h1><a href="a/${lead.slug}/index.html">${esc(lead.title)}</a></h1>
    <p class="dek">${esc(lead.dek)}</p>
    <div class="hero-foot">
      <a class="btn btn--solid" href="a/${lead.slug}/index.html">קריאת הגיליון</a>
      <a class="btn" href="subscribe/index.html">מה כולל המנוי</a>
      <span class="mono">${esc(cfg.author.name)} · ${lead.readingTime} דק׳ קריאה</span>
    </div>
  </div>
</section>

<section class="section"><div class="wrap">
  <div class="section-head"><h2>בגיליון הזה</h2><span class="rule"></span><span class="mono">${rest.length} כתבות</span></div>
  <div class="stories">${rest.map((a) => storyCard(a, 0)).join("\n")}</div>
</div></section>

<section class="section"><div class="wrap">
  <div class="section-head"><h2>מה יש כאן</h2><span class="rule"></span></div>
  <div class="value">
    <div><div>${icon("model")}</div><h3>מודלים, לא סיסמאות</h3><p>כל ניתוח מגיע עם הנוסחה ועם ההנחות גלויות. מחליפים במספרים שלכן ומקבלים תשובה על העסק שלכן, לא על עסק ממוצע.</p></div>
    <div><div>${icon("shield")}</div><h3>בלי ספונסרים</h3><p>אין תוכן ממומן, אין עמלות על מערכות ניהול ואין המלצות בתשלום. ההכנסה היחידה היא המנויים — ולכן מותר לכתוב גם את מה שלא נוח.</p></div>
    <div><div>${icon("week")}</div><h3>פעם בשבוע</h3><p>גיליון אחד, נושא אחד, בלי ניוזלטר יומי שאף אחד לא קורא. זמן קריאה מוצהר מראש על כל כתבה.</p></div>
    <div><div>${icon("archive")}</div><h3>ארכיון וכלים</h3><p>גישה מלאה לכל מה שפורסם ולמחשבונים — יחידת כלכלה, נטישה ותמחור — שמתעדכנים עם הגיליונות.</p></div>
  </div>
</div></section>

<section class="section"><div class="wrap">
  <div class="section-head"><h2>לפני שנרשמים, תריצו מספר אחד</h2><span class="rule"></span><span class="mono mono--accent">פתוח לכולן</span></div>
  <p class="read" style="color:var(--paper-dim);font-weight:300">כמה נשאר לכן מכל שיעור אחרי מדריכה, שכירות וחשמל. זה המספר שכל שאר ההחלטות תלויות בו, וברוב הסטודיו מעולם לא חישבו אותו.</p>
  ${calculator()}
  <a class="btn" href="tools/unit-economics/index.html">המחשבון בעמוד נפרד</a>
</div></section>

<section class="section"><div class="wrap">
  <div class="section-head"><h2>מנוי</h2><span class="rule"></span><span class="mono">ביטול בכל רגע</span></div>
  ${plansBlock()}
  <p style="margin-block-start:1.5rem"><a class="btn" href="subscribe/index.html">שאלות נפוצות ופרטי חיוב</a></p>
</div></section>

<section class="section"><div class="wrap read">
  <div class="section-head"><h2>או פשוט תישארו מעודכנות</h2><span class="rule"></span></div>
  <p style="color:var(--paper-dim);font-weight:300">הגיליון הפתוח נשלח במייל. בלי ספאם, יציאה בלחיצה.</p>
  <form class="inline-form" data-post="/newsletter" style="margin-block-start:1.25rem">
    <div class="field">
      <label for="nl-email">כתובת מייל</label>
      <input type="email" id="nl-email" name="email" required placeholder="you@studio.co.il" autocomplete="email" />
    </div>
    <button class="btn btn--solid" type="submit" style="align-self:flex-end">הרשמה</button>
    <p class="msg"></p>
  </form>
</div></section>

</main>
${footer(0)}`;
}

function articlePage(a, idx) {
  const next = articles[idx + 1];
  const annual = cfg.plans.find((p) => p.id === "annual");
  const jsonld = JSON.stringify({
    "@context": "https://schema.org", "@type": "NewsArticle",
    headline: a.title, description: a.dek, datePublished: a.date, inLanguage: "he-IL",
    author: { "@type": "Person", name: cfg.author.name },
    publisher: { "@type": "Organization", name: cfg.brand.name },
    isAccessibleForFree: a.premium ? "False" : "True",
    ...(a.premium && {
      hasPart: { "@type": "WebPageElement", isAccessibleForFree: "False", cssSelector: "#premium" },
    }),
  });
  const gate = a.premium
    ? `<div class="fade" id="fade" aria-hidden="true"></div>
<div class="wrap"><div class="gate" id="gate" data-slug="${a.slug}">
  <p class="meter" data-meter hidden></p>
  <span class="mono mono--accent">המשך הכתבה</span>
  <h2>שאר הניתוח פתוח למנויות</h2>
  <p>נשארו עוד ${Math.max(1, a.readingTime - 2)} דקות קריאה: הנוסחאות, המספרים והצעדים המעשיים.</p>
  <ul>
    <li>המודל המלא וההנחות שמאחוריו</li>
    <li>הארכיון וכל הגיליונות הקודמים</li>
    <li>גיליון שבועי במייל, ביטול בכל רגע</li>
  </ul>
  <div class="gate-actions">
    <button class="btn btn--solid" type="button" data-checkout="annual">מנוי שנתי ${esc(annual.price)}</button>
    <button class="btn" type="button" data-checkout="trial">14 יום חינם</button>
    <button class="btn" type="button" data-unlock hidden>שימוש בקריאה חינם</button>
  </div>
  <p class="msg" data-gate-msg></p>
  <p class="gate-note">כבר מנויה? <a href="../../account/index.html">כניסה עם מייל</a> · <a href="../../subscribe/index.html">כל המסלולים</a></p>
</div></div>`
    : "";
  return `${head({ title: a.title, desc: a.dek, depth: 2, path: `a/${a.slug}/`, jsonld })}
${masthead(2)}
<main id="main">
<article>
  <div class="wrap article-head">
    <div class="kicker">
      <a href="../../index.html" class="mono">חזרה לגיליון</a>
      <span class="chip">${esc(a.category)}</span>
      ${a.premium ? '<span class="chip chip--lock">למנויות</span>' : '<span class="chip chip--free">פתוח</span>'}
      <span class="rule"></span>
      <span class="mono">גיליון ${pad2(a.issue)}</span>
    </div>
    <h1>${esc(a.title)}</h1>
    <p class="dek">${esc(a.dek)}</p>
    <div class="byline">
      <span class="name">${esc(cfg.author.name)}</span>
      <span class="dot">·</span><span class="mono">${dateHe(a.date)}</span>
      <span class="dot">·</span><span class="mono">${a.readingTime} דק׳ קריאה</span>
      ${a.tags.length ? `<span class="dot">·</span><span class="mono">${a.tags.map(esc).join(" · ")}</span>` : ""}
    </div>
  </div>
  <div class="wrap"><div class="prose">${a.ledeHtml}</div></div>
  ${gate}
  <div class="wrap"><div class="prose" id="premium"></div></div>
</article>

${next ? `<section class="section" style="border-block-start:1px solid var(--line);margin-block-start:3rem"><div class="wrap">
  <div class="section-head"><h2>הבא בתור</h2><span class="rule"></span></div>
  <div class="stories">${storyCard(next, 2)}</div>
</div></section>` : ""}

<section class="section"><div class="wrap">
  <div class="section-head"><h2>מנוי</h2><span class="rule"></span></div>
  ${plansBlock()}
</div></section>
</main>
${footer(2)}`;
}

function subscribePage() {
  return `${head({ title: "מנוי", desc: `מנוי — ${cfg.brand.description}`, depth: 1, path: "subscribe/" })}
${masthead(1)}
<main id="main">
<section class="hero">
  <canvas class="contours" aria-hidden="true"></canvas>
  <div class="wrap hero-in">
    <div class="kicker"><span class="mono mono--accent">מנוי</span><span class="rule"></span></div>
    <h1>מי שמשלם הוא מי שקורא</h1>
    <p class="dek">${esc(cfg.brand.description)} בלי ספונסרים, בלי עמלות ספקים ובלי תוכן ממומן, ולכן בתשלום.</p>
  </div>
</section>

<section class="section"><div class="wrap">
  ${plansBlock()}
  <p class="mono" style="margin-block-start:1.5rem">כל המחירים בשקלים וכוללים מע״מ · חיוב מאובטח · ביטול מעמוד החשבון</p>
</div></section>

<section class="section"><div class="wrap">
  <div class="section-head"><h2>מה נכלל</h2><span class="rule"></span></div>
  <div class="value">
    <div><div>${icon("model")}</div><h3>הגיליון השבועי</h3><p>ניתוח אחד בשבוע במייל ובאתר, עם זמן קריאה מוצהר.</p></div>
    <div><div>${icon("archive")}</div><h3>ארכיון מלא</h3><p>כל מה שפורסם, פתוח מהרגע הראשון של המנוי.</p></div>
    <div><div>${icon("week")}</div><h3>מחשבונים</h3><p>יחידת כלכלה, נטישה ותמחור, מתעדכנים עם הגיליונות.</p></div>
    <div><div>${icon("shield")}</div><h3>קו ישיר</h3><p>שאלה על מודל או על מספר מקבלת תשובה. נושאים חוזרים הופכים לגיליון.</p></div>
  </div>
</div></section>

<section class="section"><div class="wrap">
  <div class="section-head"><h2>שאלות נפוצות</h2><span class="rule"></span></div>
  <div class="faq">
    ${FAQ.map((f, i) => `<details${i === 0 ? " open" : ""}>
      <summary>${esc(f.q)}</summary>
      <div class="answer"><p>${esc(f.a)}</p></div>
    </details>`).join("\n    ")}
  </div>
</div></section>
</main>
${footer(1)}`;
}

function accountPage() {
  return `${head({ title: "החשבון שלי", desc: "כניסה וניהול המנוי", depth: 1, path: "account/", extra: '<meta name="robots" content="noindex" />' })}
${masthead(1)}
<main id="main">
<section class="section"><div class="wrap">
  <div class="section-head"><h2>החשבון שלי</h2><span class="rule"></span></div>

  <div class="panel" data-guest-only hidden>
    <div class="status-line"><span class="chip">אורחת</span><span class="mono">לא מחוברת</span></div>
    <p style="color:var(--paper-dim);font-weight:300">אין סיסמאות. מזינות מייל ומקבלות קישור כניסה חד-פעמי.</p>
    <form class="inline-form" data-post="/login" style="margin-block-start:1.25rem">
      <div class="field">
        <label for="login-email">המייל שאיתו נרשמת</label>
        <input type="email" id="login-email" name="email" required placeholder="you@studio.co.il" autocomplete="email" />
      </div>
      <button class="btn btn--solid" type="submit" style="align-self:flex-end">שליחת קישור</button>
      <p class="msg"></p>
    </form>
    <p class="gate-note" style="margin-block-start:1.25rem">עוד לא מנויה? <a href="../subscribe/index.html">המסלולים כאן</a></p>
  </div>

  <div class="panel" data-member-only hidden>
    <div class="status-line"><span class="chip chip--free">מנוי פעיל</span><span class="mono" data-plan-slot></span></div>
    <div class="out-row"><span class="k">מייל</span><span class="v" style="font-size:1rem" data-email-slot></span></div>
    <div class="gate-actions">
      <a class="btn btn--solid" href="../index.html">לגיליון</a>
      <a class="btn" href="/api/portal">ניהול חיוב וביטול</a>
      <button class="btn" type="button" data-logout>יציאה</button>
    </div>
  </div>

  <div class="notice" data-demo-only hidden style="margin-block-start:1.5rem">
    <strong>תצוגה מקדימה.</strong> אין שרת מחובר, ולכן כניסה, סליקה וניהול מנוי אינם פעילים כאן.
    הוראות החיבור נמצאות בקובץ <span class="mono">site/README.md</span>.
  </div>
</div></section>
</main>
${footer(1)}`;
}

function toolPage() {
  return `${head({ title: "מחשבון יחידת כלכלה", desc: "כמה נשאר לכן מכל שיעור — מחשבון פתוח לכולן.", depth: 2, path: "tools/unit-economics/" })}
${masthead(2)}
<main id="main">
<section class="hero">
  <canvas class="contours" aria-hidden="true"></canvas>
  <div class="wrap hero-in">
    <div class="kicker"><span class="chip chip--free">פתוח לכולן</span><span class="rule"></span><span class="mono">כלי</span></div>
    <h1>כמה נשאר לך משיעור אחד</h1>
    <p class="dek">היחידה הכלכלית בעסק כושר היא לא הלקוחה ולא החודש, היא שיעור אחד. הזינו את המספרים שלכן.</p>
  </div>
</section>
<section class="section"><div class="wrap">
  ${calculator()}
  <div class="read" style="margin-block-start:2rem">
    <h2 style="font-size:1.3rem">איך למלא נכון</h2>
    <div class="prose" style="padding-block-start:1rem">
      <ul>
        <li><strong>הכנסה לראש</strong> — סך ההכנסות משיעורים בשלושת החודשים האחרונים, חלקי מספר הכניסות בפועל. לא המחיר במחירון.</li>
        <li><strong>מלאות ממוצעת</strong> — על כל הלוח, כולל המשבצות החלשות. לא על שיעור הדגל.</li>
        <li><strong>עלות מדריכה</strong> — עלות מעסיק מלאה. לשכירה, הוסיפו כשליש מעל הברוטו.</li>
        <li><strong>עלות קבועה לשעה</strong> — שכירות, ארנונה, חשמל, תוכנה, ביטוח ורואה חשבון לחודש, חלקי שעות הפתיחה בפועל.</li>
      </ul>
    </div>
    <p style="margin-block-start:1.5rem"><a class="btn" href="../../a/kama-nishar-mishiur/index.html">הניתוח המלא מאחורי המחשבון</a></p>
  </div>
</div></section>
</main>
${footer(2)}`;
}

function simplePage(key, depth) {
  const p = pages[key];
  return `${head({ title: p.title, desc: p.dek || p.title, depth, path: key + "/" })}
${masthead(depth)}
<main id="main">
<section class="section"><div class="wrap">
  <div class="article-head" style="padding-block-start:0">
    <div class="kicker"><span class="mono mono--accent">${esc(p.title)}</span><span class="rule"></span></div>
    <h1 style="font-size:clamp(1.9rem,4.5vw,3rem)">${esc(p.title)}</h1>
    ${p.dek ? `<p class="dek">${esc(p.dek)}</p>` : ""}
  </div>
  <div class="prose">${p.html}</div>
</div></section>
</main>
${footer(depth)}`;
}

function notFound() {
  return `${head({ title: "לא נמצא", desc: "העמוד לא קיים", depth: 0 })}
${masthead(0)}
<main id="main"><section class="section"><div class="wrap read">
  <span class="mono mono--accent">404</span>
  <h1 style="font-size:clamp(2rem,5vw,3.2rem);margin-block-start:.75rem">העמוד הזה לא קיים</h1>
  <p style="margin-block-start:1rem;color:var(--paper-dim);font-weight:300">אולי הכתובת השתנתה. הגיליון המלא נמצא בעמוד הבית.</p>
  <p style="margin-block-start:1.5rem"><a class="btn btn--solid" href="index.html">לעמוד הבית</a></p>
</div></section></main>
${footer(0)}`;
}

/* -------------------------------------------------------------- feeds */
function feed() {
  // תאריך הכתבה האחרונה ולא שעת הבנייה, כדי שבנייה חוזרת לא תייצר שינוי מדומה ב-git
  const now = new Date(articles[0].date + "T08:00:00Z").toUTCString();
  const base = cfg.brand.domain.replace(/\/$/, "");
  return `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0"><channel>
<title>${esc(cfg.brand.name)}</title>
<link>${esc(base)}/</link>
<description>${esc(cfg.brand.description)}</description>
<language>he-il</language>
<lastBuildDate>${now}</lastBuildDate>
${articles.map((a) => `<item>
  <title>${esc(a.title)}</title>
  <link>${esc(base)}/a/${a.slug}/</link>
  <guid isPermaLink="true">${esc(base)}/a/${a.slug}/</guid>
  <pubDate>${new Date(a.date + "T08:00:00Z").toUTCString()}</pubDate>
  <category>${esc(a.category)}</category>
  <description>${esc(a.dek)}</description>
</item>`).join("\n")}
</channel></rss>`;
}

function sitemap() {
  const base = cfg.brand.domain.replace(/\/$/, "");
  const urls = ["", "subscribe/", "about/", "tools/unit-economics/", "terms/", "privacy/"]
    .concat(articles.map((a) => `a/${a.slug}/`));
  return `<?xml version="1.0" encoding="utf-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `<url><loc>${base}/${u}</loc></url>`).join("\n")}
</urlset>`;
}

/* --------------------------------------------------------------- write */
function write(target, content) {
  const path = join(ROOT, "public", target);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, "utf8");
  return target;
}

const written = [];
if (existsSync(join(ROOT, "public/a"))) rmSync(join(ROOT, "public/a"), { recursive: true, force: true });

written.push(write("index.html", homePage()));
articles.forEach((a, i) => written.push(write(`a/${a.slug}/index.html`, articlePage(a, i))));
written.push(write("subscribe/index.html", subscribePage()));
written.push(write("account/index.html", accountPage()));
written.push(write("about/index.html", simplePage("about", 1)));
written.push(write("terms/index.html", simplePage("terms", 1)));
written.push(write("privacy/index.html", simplePage("privacy", 1)));
written.push(write("tools/unit-economics/index.html", toolPage()));
written.push(write("404.html", notFound()));
written.push(write("feed.xml", feed()));
written.push(write("sitemap.xml", sitemap()));
written.push(write("robots.txt", `User-agent: *\nAllow: /\nSitemap: ${cfg.brand.domain.replace(/\/$/, "")}/sitemap.xml\n`));
written.push(write("_headers", "/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n  X-Frame-Options: SAMEORIGIN\n\n/assets/*\n  Cache-Control: public, max-age=604800\n"));

// אינדקס לצד הלקוח: מטא־דאטה ופסקאות פתיחה בלבד, לעולם לא גוף בתשלום
write("data/articles.json", JSON.stringify(articles.map(({ bodyHtml, ledeHtml, file, ...rest }) => rest), null, 2));

// גופי הכתבות בתשלום: צד שרת בלבד
const bodies = Object.fromEntries(articles.filter((a) => a.bodyHtml).map((a) => [a.slug, a.bodyHtml]));
mkdirSync(join(ROOT, "functions/_data"), { recursive: true });
writeFileSync(
  join(ROOT, "functions/_data/bodies.js"),
  `// נוצר אוטומטית על ידי build.mjs. אין לערוך ידנית.\nexport const BODIES = ${JSON.stringify(bodies, null, 2)};\n`,
  "utf8"
);

if (DEMO) {
  write("data/bodies.demo.json", JSON.stringify(bodies));
  console.log("[!] נבנה גם data/bodies.demo.json — לתצוגה מקדימה בלבד. אל תעלו אותו לאתר החי.");
}

console.log(`\n[ok] ${written.length} עמודים | ${articles.length} כתבות | ${Object.keys(bodies).length} גופים מוגנים`);
articles.forEach((a) => console.log(`     ${a.premium ? "[$]" : "[ ]"} ${a.slug.padEnd(22)} ${a.readingTime} דק`));
if (warnings.length) {
  console.log("\n--- לפני עלייה לאוויר ---");
  warnings.forEach((w) => console.log("  * " + w));
}
console.log("");
