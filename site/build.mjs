#!/usr/bin/env node
/**
 * המרווח — גנרטור סטטי ללא תלויות.
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

/* ------------------------------------------------- עטיפות גרפיות לכתבות
 * כל כתבה מקבלת דפוס שנגזר דטרמיניסטית מה-slug שלה, במשפחה שנקבעת
 * לפי המדור. אותה כתבה תיתן תמיד את אותה תמונה. אין כאן תמונות מלאי.
 */
const COVER_FAMILY = {
  "מודל": "contour", "פתח דבר": "rings", "תזרים": "flow", "שימור": "flow",
  "תפעול": "grid", "תמחור": "grid", "שוק": "contour",
};

function seeded(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  let a = h >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const r1 = (n) => Math.round(n * 10) / 10;

function coverSvg(slug, category) {
  const rand = seeded(slug);
  const family = COVER_FAMILY[category] || "contour";
  const W = 800, H = 460;
  const marks = [];

  if (family === "contour") {
    const cx = W * (0.28 + rand() * 0.5), curve = 1 / (W * (0.95 + rand() * 1.1));
    const gap = H / (8 + Math.floor(rand() * 4));
    const wob = 6 + rand() * 12;
    for (let k = 0; k < 16; k++) {
      const pts = [];
      for (let x = -20; x <= W + 20; x += 40) {
        const d = x - cx;
        pts.push(`${r1(x)},${r1(H * 1.06 - d * d * curve - k * gap + Math.sin((x / W) * 3 + k) * wob)}`);
      }
      marks.push(`<polyline points="${pts.join(" ")}" opacity="${r1(Math.max(0.1, 0.64 - k * 0.035))}"/>`);
    }
  } else if (family === "flow") {
    const amp = 22 + rand() * 34, period = 1.4 + rand() * 1.6, gap = H / 11;
    for (let k = 0; k < 12; k++) {
      const phase = rand() * 6.28, drift = (rand() - 0.5) * 26;
      const pts = [];
      for (let x = -20; x <= W + 20; x += 40) {
        const t = (x / W) * period * 6.28 + phase;
        pts.push(`${r1(x)},${r1(gap * (k + 0.7) + Math.sin(t) * amp * (0.4 + k / 16) + drift * (x / W))}`);
      }
      marks.push(`<polyline points="${pts.join(" ")}" opacity="${r1(0.5 - Math.abs(k - 6) * 0.05)}"/>`);
    }
  } else if (family === "grid") {
    const cols = 13 + Math.floor(rand() * 16), cw = W / cols;
    const base = H * (0.9 + rand() * 0.08);
    marks.push(`<line x1="0" y1="${r1(base)}" x2="${W}" y2="${r1(base)}" opacity=".5"/>`);
    for (let c = 0; c < cols; c++) {
      const h = H * (0.16 + rand() * 0.78);
      marks.push(
        `<rect x="${r1(c * cw + cw * 0.22)}" y="${r1(H - h)}" width="${r1(cw * 0.56)}" height="${r1(h)}" ` +
        `fill="currentColor" stroke="none" opacity="${r1(0.06 + rand() * 0.2)}"/>`
      );
      if (rand() > 0.66) {
        marks.push(`<line x1="${r1(c * cw + cw * 0.22)}" y1="${r1(H - h)}" x2="${r1(c * cw + cw * 0.78)}" y2="${r1(H - h)}" opacity=".55"/>`);
      }
    }
  } else {
    const cx = W * (0.2 + rand() * 0.6), cy = H * (0.9 + rand() * 0.3);
    for (let k = 1; k <= 13; k++) {
      marks.push(`<circle cx="${r1(cx)}" cy="${r1(cy)}" r="${r1(k * (H / 7.5))}" opacity="${r1(Math.max(0.05, 0.52 - k * 0.036))}"/>`);
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="">
<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stop-color="#14161D"/><stop offset="1" stop-color="#0A0B0F"/></linearGradient></defs>
<rect width="${W}" height="${H}" fill="url(#g)"/>
<g fill="none" stroke="#9DB4FF" color="#9DB4FF" stroke-width="1.1">
${marks.join("\n")}
</g></svg>`;
}

/* ------------------------------------------------------------ partials */
const FAVICON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' fill='%230A0B0F'/%3E%3Cpath d='M8 4v24M24 4v24' stroke='%239DB4FF' stroke-width='2.6'/%3E%3Cpath d='M8 16h16' stroke='%23F0B429' stroke-width='2.8'/%3E%3C/svg%3E";

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
      <a href="${r}archive/index.html">ארכיון</a>
      <a href="${r}tools/index.html">מחשבונים</a>
      <a href="${r}about/index.html">על המרווח</a>
    </nav>
    <a class="btn btn--ghost btn--sm mnav-account" href="${r}account/index.html">כניסה</a>
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
      <a class="wordmark wordmark--foot" href="${r}index.html">
        <span class="wordmark-he">${esc(cfg.brand.name)}</span>
        <span class="wordmark-latin">${esc(cfg.brand.latin)}</span>
      </a>
      <p class="foot-blurb">${esc(cfg.brand.description)}</p>
      <p class="mono" style="margin-block-start:1rem">ללא תוכן ממומן · ללא עמלות ספקים</p>
    </div>
    <div>
      <h4>לקרוא</h4>
      <ul>
        <li><a href="${r}index.html">הגיליון</a></li>
        <li><a href="${r}archive/index.html">ארכיון</a></li>
        <li><a href="${r}about/index.html">על המרווח</a></li>
        <li><a href="${r}feed.xml">RSS</a></li>
      </ul>
    </div>
    <div>
      <h4>כלים</h4>
      <ul>
        <li><a href="${r}tools/unit-economics/index.html">יחידת כלכלה</a></li>
        <li><a href="${r}tools/churn/index.html">נטישה ו-LTV</a></li>
        <li><a href="${r}tools/pricing/index.html">תמחור</a></li>
      </ul>
    </div>
    <div>
      <h4>המנוי</h4>
      <ul>
        <li><a href="${r}subscribe/index.html">מסלולים</a></li>
        <li><a href="${r}account/index.html">החשבון שלי</a></li>
        <li><a href="${r}terms/index.html">תנאי שימוש</a></li>
        <li><a href="${r}privacy/index.html">פרטיות</a></li>
        <li><a href="mailto:${esc(cfg.author.email)}">${esc(cfg.author.email)}</a></li>
      </ul>
    </div>
  </div>
  <div class="foot-base">
    <span class="mono">${year} &copy; ${esc(cfg.brand.name)} · ${esc(cfg.author.name)}</span>
    <span class="mono">${esc(cfg.brand.tagline)}</span>
  </div>
</div></footer>
<script src="${r}assets/site.js"></script>
</body>
</html>`;
}

/* ---------------------------------------------------------- components */
const lockChip = (a) =>
  a.premium ? '<span class="chip chip--lock">למנויות</span>' : '<span class="chip chip--free">פתוח</span>';

function storyCard(a, depth, size = "sm") {
  const r = rel(depth);
  return `<a class="story story--${size}" href="${r}a/${a.slug}/index.html">
  <span class="story-art"><img src="${r}covers/${a.slug}.svg" alt="" loading="lazy" width="800" height="460" /></span>
  <span class="story-body">
    <span class="story-meta">
      <span class="chip">${esc(a.category)}</span>
      <span class="mono">${dateHe(a.date)}</span>
      <span class="dot">·</span>
      <span class="mono">${a.readingTime} דק׳</span>
      ${lockChip(a)}
    </span>
    <span class="story-title">${esc(a.title)}</span>
    <span class="story-dek">${esc(a.dek)}</span>
  </span>
</a>`;
}

function listRow(a, depth) {
  const r = rel(depth);
  return `<a class="row" href="${r}a/${a.slug}/index.html">
  <span class="mono row-date">${dateHe(a.date)}</span>
  <span class="row-main">
    <span class="row-title">${esc(a.title)}</span>
    <span class="row-dek">${esc(a.dek)}</span>
  </span>
  <span class="row-meta">
    <span class="chip">${esc(a.category)}</span>
    <span class="mono">${a.readingTime} דק׳</span>
    ${lockChip(a)}
  </span>
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

const plansBlock = () =>
  `<div class="plans">${cfg.plans.map(planCard).join("\n")}</div>\n  <p class="msg" data-checkout-msg></p>`;

/* -------------------------------------------------------- מחשבונים
 * הגדרה אחת לכל מחשבון. החישוב עצמו יושב ב-site.js לפי אותו מזהה.
 */
const CALCS = {
  unit: {
    title: "יחידת כלכלה",
    sub: "שיעור אחד · תרומה נטו",
    blurb: "כמה נשאר לך מכל שיעור אחרי מדריכה, שכירות וחשמל.",
    slug: "unit-economics",
    fields: [
      ["rev", "הכנסה לראש", 75], ["cap", "מקומות בשיעור", 12],
      ["fill", "מלאות ממוצעת %", 68], ["coach", "עלות מדריכה לשיעור", 180],
      ["vari", "עלות משתנה לראש", 6], ["fixed", "עלות קבועה לשעה", 95],
      ["classes", "שיעורים בשבוע", 28],
    ],
    outputs: [
      ["heads", "משתתפות בשיעור"], ["income", "הכנסה מהשיעור"],
      ["contribution", "תרומה נטו לשיעור"], ["breakeven", "נקודת איזון"],
      ["monthly", "תרומה חודשית מהלוח"],
    ],
  },
  churn: {
    title: "נטישה ו-LTV",
    sub: "כמה שווה לקוחה אחת",
    blurb: "אורך החיים של לקוחה, הערך שלה, וכמה מותר להוציא כדי לגייס אותה.",
    slug: "churn",
    fields: [
      ["active", "לקוחות פעילות בתחילת החודש", 140],
      ["left", "נטשו החודש", 11],
      ["contrib", "תרומה חודשית ללקוחה", 260],
      ["cac", "עלות גיוס לקוחה", 1100],
    ],
    outputs: [
      ["churn", "נטישה חודשית"], ["life", "אורך חיים ממוצע"],
      ["ltv", "ערך חיים (LTV)"], ["ratio", "יחס LTV ל-CAC"],
      ["payback", "החזר הגיוס"],
    ],
  },
  pricing: {
    title: "תמחור",
    sub: "מה את חייבת לגבות",
    blurb: "המחיר לראש שמכסה את העלויות ואת הרווח שהצבת כיעד.",
    slug: "pricing",
    fields: [
      ["fixedm", "עלות קבועה חודשית", 34000], ["classes", "שיעורים בשבוע", 28],
      ["cap", "מקומות בשיעור", 12], ["fill", "מלאות יעד %", 72],
      ["coach", "עלות מדריכה לשיעור", 180], ["vari", "עלות משתנה לראש", 6],
      ["target", "רווח יעד חודשי", 18000], ["current", "המחיר שלך היום", 75],
    ],
    outputs: [
      ["headsMonth", "כניסות בחודש"], ["needed", "הכנסה נדרשת"],
      ["price", "מחיר לראש נדרש"], ["sub8", "מנוי 8 כניסות"],
      ["gap", "הפער מהמחיר הנוכחי"],
    ],
  },
};

function calcWidget(id, compact = false) {
  const c = CALCS[id];
  return `<div class="calc${compact ? " calc--compact" : ""}" data-calc="${id}">
  <div class="calc-head">
    <h3>${esc(c.title)}</h3>
    <span class="mono">${esc(c.sub)}</span>
  </div>
  <div class="calc-body">
    <div class="calc-inputs${c.fields.length <= 4 ? " calc-inputs--narrow" : ""}">
      ${c.fields.map(([f, label, def]) => `<div class="field">
        <label for="${id}-${f}">${esc(label)}</label>
        <input type="number" id="${id}-${f}" data-f="${f}" value="${def}" data-default="${def}" min="0" step="any" inputmode="decimal" />
      </div>`).join("\n      ")}
    </div>
    <div class="calc-out">
      ${c.outputs.map(([k, label], i) => `<div class="out-row${i === 2 ? " out-row--hero" : ""}">
        <span class="k">${esc(label)}</span><span class="v" data-out="${k}">—</span>
      </div>`).join("\n      ")}
      <div class="gauge">
        <div class="gauge-track"><div class="gauge-fill" data-out="gauge" style="width:0"></div></div>
        <div class="gauge-legend">
          <span class="mono" data-out="legend">—</span>
          <button class="linkbtn mono" type="button" data-calc-reset>איפוס</button>
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
  calc: '<rect x="4" y="3" width="16" height="18" rx="1"/><path d="M8 7h8M8 12h2m4 0h2M8 16h2m4 0h2"/>',
  churn: '<path d="M3 17l5-6 4 3 4-6 5 4"/><path d="M3 21h18"/>',
  tag: '<path d="M3 12V4h8l9 9-8 8z"/><circle cx="7.5" cy="7.5" r="1.3"/>',
};
const icon = (k) => `<svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[k]}</svg>`;

/* ------------------------------------------------------------- content */
const SHORTCODES = {
  calculator: calcWidget("unit"),
  "calc-unit": calcWidget("unit"),
  "calc-churn": calcWidget("churn"),
  "calc-pricing": calcWidget("pricing"),
};

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
      ledeHtml: md(ledeRaw, SHORTCODES),
      bodyHtml: bodyRaw.trim() ? md(bodyRaw, SHORTCODES) : "",
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

const categories = [...new Set(articles.map((a) => a.category))]
  .filter((c) => c !== "פתח דבר")
  .map((c) => ({ name: c, items: articles.filter((a) => a.category === c) }))
  .sort((a, b) => b.items.length - a.items.length);

const totalMin = articles.reduce((s, a) => s + a.readingTime, 0);
const issues = new Set(articles.map((a) => a.issue)).size;

/* --------------------------------------------------------------- pages */
function homePage() {
  const [lead, second, third, ...rest] = articles;
  const stats = [
    `גיליון <b>${pad2(Math.max(...articles.map((a) => a.issue)))}</b>`,
    `<b>${dateHe(articles[0].date)}</b>`,
    `<b>${articles.length}</b> כתבות בארכיון`,
    `<b>${totalMin}</b> דקות קריאה`,
    `<b>3</b> מחשבונים`,
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
    <div class="hero-grid">
      <div class="hero-text reveal">
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
      <a class="hero-art reveal reveal--2" href="a/${lead.slug}/index.html" aria-hidden="true" tabindex="-1">
        <img src="covers/${lead.slug}.svg" alt="" width="800" height="460" />
      </a>
    </div>
  </div>
</section>

<section class="section"><div class="wrap">
  <div class="stories stories--two">
    ${[second, third].filter(Boolean).map((a) => storyCard(a, 0, "md")).join("\n")}
  </div>
</div></section>

<section class="band"><div class="wrap band-in">
  <div class="band-item"><span class="band-n">${pad2(issues)}</span><span class="mono">גיליונות</span></div>
  <div class="band-item"><span class="band-n">${articles.length}</span><span class="mono">ניתוחים בארכיון</span></div>
  <div class="band-item"><span class="band-n">3</span><span class="mono">מחשבונים פתוחים</span></div>
  <div class="band-item"><span class="band-n">0</span><span class="mono">מפרסמים</span></div>
</div></section>

<section class="section"><div class="wrap">
  <div class="section-head">
    <h2>בארכיון</h2><span class="rule"></span>
    <a class="mono mono--accent" href="archive/index.html">כל הכתבות</a>
  </div>
  <div class="stories">${rest.map((a) => storyCard(a, 0)).join("\n")}</div>
</div></section>

<section class="section section--tools"><div class="wrap">
  <div class="section-head"><h2>הכלים</h2><span class="rule"></span><span class="mono mono--accent">פתוחים לכולן</span></div>
  <p class="lede-p">שלושה מחשבונים שעונים על שלוש השאלות שחוזרות הכי הרבה. הכול רץ בדפדפן שלך — שום מספר לא נשלח לשרת.</p>
  <div class="tools-row">
    ${[["calc", "unit", "unit-economics"], ["churn", "churn", "churn"], ["tag", "pricing", "pricing"]].map(([ic, key, slug]) => `
    <a class="tool-card" href="tools/${slug}/index.html">
      <span class="tool-ic">${icon(ic)}</span>
      <span class="tool-title">${esc(CALCS[key].title)}</span>
      <span class="tool-blurb">${esc(CALCS[key].blurb)}</span>
      <span class="mono mono--accent tool-go">פתיחת המחשבון</span>
    </a>`).join("")}
  </div>
  ${calcWidget("unit")}
</div></section>

<section class="section"><div class="wrap">
  <div class="section-head"><h2>מה יש כאן</h2><span class="rule"></span></div>
  <div class="value">
    <div><div>${icon("model")}</div><h3>מודלים, לא סיסמאות</h3><p>כל ניתוח מגיע עם הנוסחה ועם ההנחות גלויות. מחליפים במספרים שלכן ומקבלים תשובה על העסק שלכן, לא על עסק ממוצע.</p></div>
    <div><div>${icon("shield")}</div><h3>בלי ספונסרים</h3><p>אין תוכן ממומן, אין עמלות על מערכות ניהול ואין המלצות בתשלום. ההכנסה היחידה היא המנויים — ולכן מותר לכתוב גם את מה שלא נוח.</p></div>
    <div><div>${icon("week")}</div><h3>פעם בשבוע</h3><p>גיליון אחד, נושא אחד, בלי ניוזלטר יומי שאף אחד לא קורא. זמן קריאה מוצהר מראש על כל כתבה.</p></div>
    <div><div>${icon("archive")}</div><h3>ארכיון וכלים</h3><p>גישה מלאה לכל ${articles.length} הניתוחים ולשלושת המחשבונים, מהרגע הראשון של המנוי.</p></div>
  </div>
</div></section>

<section class="section"><div class="wrap">
  <div class="section-head"><h2>מנוי</h2><span class="rule"></span><span class="mono">ביטול בכל רגע</span></div>
  ${plansBlock()}
</div></section>

<section class="section"><div class="wrap">
  <div class="section-head"><h2>שאלות</h2><span class="rule"></span><a class="mono mono--accent" href="subscribe/index.html">כל השאלות</a></div>
  <div class="faq">
    ${FAQ.slice(0, 3).map((f, i) => `<details${i === 0 ? " open" : ""}>
      <summary>${esc(f.q)}</summary>
      <div class="answer"><p>${esc(f.a)}</p></div>
    </details>`).join("\n    ")}
  </div>
</div></section>

<section class="section section--news"><div class="wrap">
  <div class="news-box">
    <div>
      <span class="mono mono--accent">ללא עלות</span>
      <h2>הגיליון הפתוח במייל</h2>
      <p>הכתבות הפתוחות והכלים החדשים, פעם בשבוע. בלי ספאם, יציאה בלחיצה.</p>
    </div>
    <form class="inline-form" data-post="/newsletter">
      <div class="field">
        <label for="nl-email">כתובת מייל</label>
        <input type="email" id="nl-email" name="email" required placeholder="you@studio.co.il" autocomplete="email" />
      </div>
      <button class="btn btn--solid" type="submit">הרשמה</button>
      <p class="msg"></p>
    </form>
  </div>
</div></section>

</main>
${footer(0)}`;
}

function articlePage(a, idx) {
  const more = articles.filter((x) => x.slug !== a.slug && x.category === a.category).slice(0, 2);
  const fallback = articles.filter((x) => x.slug !== a.slug).slice(0, 2);
  const related = (more.length ? more : fallback);
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
    <li>הארכיון — ${articles.length} ניתוחים, ${totalMin} דקות קריאה</li>
    <li>שלושת המחשבונים והגיליון השבועי</li>
  </ul>
  <div class="gate-actions">
    <button class="btn btn--solid" type="button" data-checkout="annual">מנוי שנתי ${esc(annual.price)}</button>
    <button class="btn" type="button" data-checkout="trial">14 יום חינם</button>
    <button class="btn btn--ghost" type="button" data-unlock hidden>שימוש בקריאה חינם</button>
  </div>
  <p class="msg" data-gate-msg></p>
  <p class="gate-note">כבר מנויה? <a href="../../account/index.html">כניסה עם מייל</a> · <a href="../../subscribe/index.html">כל המסלולים</a></p>
</div></div>`
    : "";
  return `${head({ title: a.title, desc: a.dek, depth: 2, path: `a/${a.slug}/`, jsonld })}
<div class="progress" aria-hidden="true"><div class="progress-bar" id="progress"></div></div>
${masthead(2)}
<main id="main">
<article>
  <div class="wrap article-head">
    <div class="kicker">
      <a href="../../archive/index.html" class="mono">הארכיון</a>
      <span class="chip">${esc(a.category)}</span>
      ${lockChip(a)}
      <span class="rule"></span>
      <span class="mono">גיליון ${pad2(a.issue)}</span>
    </div>
    <h1>${esc(a.title)}</h1>
    <p class="dek">${esc(a.dek)}</p>
    <div class="byline">
      <span class="avatar" aria-hidden="true">${esc(cfg.author.name.slice(0, 1))}</span>
      <span class="name">${esc(cfg.author.name)}</span>
      <span class="dot">·</span><span class="mono">${dateHe(a.date)}</span>
      <span class="dot">·</span><span class="mono">${a.readingTime} דק׳ קריאה</span>
      ${a.tags.length ? `<span class="dot">·</span><span class="mono">${a.tags.map(esc).join(" · ")}</span>` : ""}
    </div>
  </div>
  <div class="wrap"><div class="article-art"><img src="../../covers/${a.slug}.svg" alt="" width="800" height="460" /></div></div>
  <div class="wrap"><div class="prose">${a.ledeHtml}</div></div>
  ${gate}
  <div class="wrap"><div class="prose" id="premium"></div></div>
</article>

<section class="section"><div class="wrap">
  <div class="section-head"><h2>בהמשך</h2><span class="rule"></span><a class="mono mono--accent" href="../../archive/index.html">כל הארכיון</a></div>
  <div class="stories stories--two">${related.map((x) => storyCard(x, 2, "md")).join("\n")}</div>
</div></section>

<section class="section"><div class="wrap">
  <div class="section-head"><h2>מנוי</h2><span class="rule"></span></div>
  ${plansBlock()}
</div></section>
</main>
${footer(2)}`;
}

function archivePage() {
  return `${head({ title: "ארכיון", desc: `כל ${articles.length} הניתוחים של ${cfg.brand.name}.`, depth: 1, path: "archive/" })}
${masthead(1)}
<main id="main">
<section class="hero hero--slim">
  <canvas class="contours" aria-hidden="true"></canvas>
  <div class="wrap hero-in">
    <div class="kicker"><span class="mono mono--accent">ארכיון</span><span class="rule"></span><span class="mono">${articles.length} כתבות · ${totalMin} דקות</span></div>
    <h1>כל מה שפורסם</h1>
    <p class="dek">${articles.length} ניתוחים ב-${issues} גיליונות. המנוי פותח את כולם.</p>
  </div>
</section>
${categories.map((c) => `
<section class="section"><div class="wrap">
  <div class="section-head"><h2>${esc(c.name)}</h2><span class="rule"></span><span class="mono">${c.items.length}</span></div>
  <div class="rows">${c.items.map((a) => listRow(a, 1)).join("\n")}</div>
</div></section>`).join("")}
<section class="section"><div class="wrap">
  <div class="section-head"><h2>מנוי</h2><span class="rule"></span></div>
  ${plansBlock()}
</div></section>
</main>
${footer(1)}`;
}

function toolsHubPage() {
  return `${head({ title: "מחשבונים", desc: "שלושה מחשבונים לניהול עסק כושר: יחידת כלכלה, נטישה ו-LTV, ותמחור.", depth: 1, path: "tools/" })}
${masthead(1)}
<main id="main">
<section class="hero hero--slim">
  <canvas class="contours" aria-hidden="true"></canvas>
  <div class="wrap hero-in">
    <div class="kicker"><span class="chip chip--free">פתוח לכולן</span><span class="rule"></span><span class="mono">3 כלים</span></div>
    <h1>המספרים שלך, לא של מישהו אחר</h1>
    <p class="dek">שלושה מחשבונים שרצים בדפדפן שלך. שום נתון לא נשלח לשרת ולא נשמר אצלי.</p>
  </div>
</section>
<section class="section"><div class="wrap">
  <div class="tools-row">
    ${[["calc", "unit", "unit-economics"], ["churn", "churn", "churn"], ["tag", "pricing", "pricing"]].map(([ic, key, slug]) => `
    <a class="tool-card" href="${slug}/index.html">
      <span class="tool-ic">${icon(ic)}</span>
      <span class="tool-title">${esc(CALCS[key].title)}</span>
      <span class="tool-blurb">${esc(CALCS[key].blurb)}</span>
      <span class="mono mono--accent tool-go">פתיחת המחשבון</span>
    </a>`).join("")}
  </div>
</div></section>
${Object.entries(CALCS).map(([id, c]) => `
<section class="section"><div class="wrap">
  <div class="section-head"><h2>${esc(c.title)}</h2><span class="rule"></span><a class="mono mono--accent" href="${c.slug}/index.html">בעמוד נפרד</a></div>
  ${calcWidget(id)}
</div></section>`).join("")}
</main>
${footer(1)}`;
}

const TOOL_HELP = {
  unit: [
    ["הכנסה לראש", "סך ההכנסות משיעורים בשלושת החודשים האחרונים, חלקי מספר הכניסות בפועל. לא המחיר במחירון."],
    ["מלאות ממוצעת", "על כל הלוח, כולל המשבצות החלשות. לא על שיעור הדגל."],
    ["עלות מדריכה", "עלות מעסיק מלאה. לשכירה, הוסיפו כשליש מעל הברוטו."],
    ["עלות קבועה לשעה", "שכירות, ארנונה, חשמל, תוכנה, ביטוח ורואה חשבון לחודש, חלקי שעות הפתיחה בפועל."],
  ],
  churn: [
    ["לקוחות פעילות", "מי שנכנסה לפחות פעם אחת בחודש שקדם. לא מי שרשומה במערכת."],
    ["נטשו החודש", "מנוי שלא חודש, או לקוחה שלא נכנסה מעל התקופה שהגדרתן כנטישה."],
    ["תרומה חודשית ללקוחה", "ההכנסה החודשית ממנה פחות העלויות המשתנות שהיא גוררת."],
    ["עלות גיוס", "כל ההוצאה על גיוס חלקי מספר הלקוחות המשלמות שנוצרו ממנה — כולל הזמן שלכן."],
  ],
  pricing: [
    ["עלות קבועה חודשית", "שכירות, ארנונה, חשמל, תוכנה, ביטוח, רואה חשבון והשכר שלכן."],
    ["מלאות יעד", "לא המלאות של היום — זו שאתן מתכננות להגיע אליה ומאמינות בה."],
    ["רווח יעד חודשי", "מה שצריך להישאר אחרי הכול. אם משאירים אפס, מקבלים מחיר איזון בלבד."],
    ["המחיר שלך היום", "ההכנסה בפועל לכניסה, כדי לראות את הפער."],
  ],
};

function toolPage(id) {
  const c = CALCS[id];
  const linked = articles.find((a) => (id === "unit" ? a.slug === "kama-nishar-mishiur" : id === "churn" ? a.slug === "netisha" : a.slug === "hamechir"));
  return `${head({ title: c.title, desc: c.blurb, depth: 2, path: `tools/${c.slug}/` })}
${masthead(2)}
<main id="main">
<section class="hero hero--slim">
  <canvas class="contours" aria-hidden="true"></canvas>
  <div class="wrap hero-in">
    <div class="kicker"><span class="chip chip--free">פתוח לכולן</span><span class="rule"></span><span class="mono">מחשבון</span></div>
    <h1>${esc(c.title)}</h1>
    <p class="dek">${esc(c.blurb)}</p>
  </div>
</section>
<section class="section"><div class="wrap">
  ${calcWidget(id)}
  <div class="read" style="margin-block-start:2.5rem">
    <h2 class="h-sm">איך למלא נכון</h2>
    <div class="prose" style="padding-block-start:1rem">
      <ul>${TOOL_HELP[id].map(([t, d]) => `<li><strong>${esc(t)}</strong> — ${esc(d)}</li>`).join("")}</ul>
    </div>
    ${linked ? `<p style="margin-block-start:1.75rem"><a class="btn" href="../../a/${linked.slug}/index.html">הניתוח המלא מאחורי המחשבון</a></p>` : ""}
  </div>
</div></section>
<section class="section"><div class="wrap">
  <div class="section-head"><h2>שאר הכלים</h2><span class="rule"></span></div>
  <div class="tools-row">
    ${Object.entries(CALCS).filter(([k]) => k !== id).map(([k, o]) => `
    <a class="tool-card" href="../${o.slug}/index.html">
      <span class="tool-ic">${icon(k === "unit" ? "calc" : k === "churn" ? "churn" : "tag")}</span>
      <span class="tool-title">${esc(o.title)}</span>
      <span class="tool-blurb">${esc(o.blurb)}</span>
      <span class="mono mono--accent tool-go">פתיחת המחשבון</span>
    </a>`).join("")}
  </div>
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

<section class="band"><div class="wrap band-in">
  <div class="band-item"><span class="band-n">${articles.length}</span><span class="mono">ניתוחים פתוחים מיד</span></div>
  <div class="band-item"><span class="band-n">${totalMin}</span><span class="mono">דקות קריאה</span></div>
  <div class="band-item"><span class="band-n">3</span><span class="mono">מחשבונים</span></div>
  <div class="band-item"><span class="band-n">0</span><span class="mono">מפרסמים</span></div>
</div></section>

<section class="section"><div class="wrap">
  <div class="section-head"><h2>מה נכלל</h2><span class="rule"></span></div>
  <div class="value">
    <div><div>${icon("model")}</div><h3>הגיליון השבועי</h3><p>ניתוח אחד בשבוע במייל ובאתר, עם זמן קריאה מוצהר.</p></div>
    <div><div>${icon("archive")}</div><h3>ארכיון מלא</h3><p>כל ${articles.length} הניתוחים, פתוחים מהרגע הראשון של המנוי.</p></div>
    <div><div>${icon("calc")}</div><h3>שלושה מחשבונים</h3><p>יחידת כלכלה, נטישה ו-LTV, ותמחור. מתעדכנים עם הגיליונות.</p></div>
    <div><div>${icon("shield")}</div><h3>קו ישיר</h3><p>שאלה על מודל או על מספר מקבלת תשובה. נושאים חוזרים הופכים לגיליון.</p></div>
  </div>
</div></section>

<section class="section"><div class="wrap">
  <div class="section-head"><h2>מה יש בפנים</h2><span class="rule"></span></div>
  <div class="rows">${articles.filter((a) => a.premium).slice(0, 6).map((a) => listRow(a, 1)).join("\n")}</div>
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
    <p class="lede-p">אין סיסמאות. מזינות מייל ומקבלות קישור כניסה חד-פעמי.</p>
    <form class="inline-form" data-post="/login" style="margin-block-start:1.25rem">
      <div class="field">
        <label for="login-email">המייל שאיתו נרשמת</label>
        <input type="email" id="login-email" name="email" required placeholder="you@studio.co.il" autocomplete="email" />
      </div>
      <button class="btn btn--solid" type="submit">שליחת קישור</button>
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
      <button class="btn btn--ghost" type="button" data-logout>יציאה</button>
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

function simplePage(key, depth) {
  const p = pages[key];
  return `${head({ title: p.title, desc: p.dek || p.title, depth, path: key + "/" })}
${masthead(depth)}
<main id="main">
<section class="section"><div class="wrap">
  <div class="article-head" style="padding-block-start:0">
    <div class="kicker"><span class="mono mono--accent">${esc(p.title)}</span><span class="rule"></span></div>
    <h1 class="h-page">${esc(p.title)}</h1>
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
  <h1 class="h-page" style="margin-block-start:.75rem">העמוד הזה לא קיים</h1>
  <p class="lede-p" style="margin-block-start:1rem">אולי הכתובת השתנתה. הארכיון המלא נמצא כאן.</p>
  <p style="margin-block-start:1.5rem"><a class="btn btn--solid" href="index.html">לעמוד הבית</a> <a class="btn" href="archive/index.html">לארכיון</a></p>
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
  const urls = ["", "subscribe/", "about/", "archive/", "tools/", "terms/", "privacy/"]
    .concat(Object.values(CALCS).map((c) => `tools/${c.slug}/`))
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
for (const dir of ["public/a", "public/covers", "public/tools"]) {
  if (existsSync(join(ROOT, dir))) rmSync(join(ROOT, dir), { recursive: true, force: true });
}

written.push(write("index.html", homePage()));
articles.forEach((a, i) => {
  written.push(write(`a/${a.slug}/index.html`, articlePage(a, i)));
  write(`covers/${a.slug}.svg`, coverSvg(a.slug, a.category));
});
written.push(write("archive/index.html", archivePage()));
written.push(write("tools/index.html", toolsHubPage()));
Object.entries(CALCS).forEach(([id, c]) => written.push(write(`tools/${c.slug}/index.html`, toolPage(id))));
written.push(write("subscribe/index.html", subscribePage()));
written.push(write("account/index.html", accountPage()));
written.push(write("about/index.html", simplePage("about", 1)));
written.push(write("terms/index.html", simplePage("terms", 1)));
written.push(write("privacy/index.html", simplePage("privacy", 1)));
written.push(write("404.html", notFound()));
written.push(write("feed.xml", feed()));
written.push(write("sitemap.xml", sitemap()));
written.push(write("robots.txt", `User-agent: *\nAllow: /\nSitemap: ${cfg.brand.domain.replace(/\/$/, "")}/sitemap.xml\n`));
written.push(write("_headers", "/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n  X-Frame-Options: SAMEORIGIN\n\n/assets/*\n  Cache-Control: public, max-age=604800\n\n/covers/*\n  Cache-Control: public, max-age=604800\n"));

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

console.log(`\n[ok] ${written.length} עמודים | ${articles.length} כתבות | ${articles.length} עטיפות | ${Object.keys(bodies).length} גופים מוגנים`);
categories.forEach((c) => console.log(`     ${c.name.padEnd(10)} ${c.items.length}`));
if (warnings.length) {
  console.log("\n--- לפני עלייה לאוויר ---");
  warnings.forEach((w) => console.log("  * " + w));
}
console.log("");
