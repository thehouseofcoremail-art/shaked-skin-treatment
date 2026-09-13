/**
 * בדיקת ממשק: שומרת על החוזה של חומת התשלום.
 * דורשת playwright.  npm run build:preview  ואז  npm run test:ui
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname } from "node:path";
const ROOT = new URL("../public", import.meta.url).pathname;
const T = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".json": "application/json" };
const server = createServer(async (req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]);
  if (p.endsWith("/")) p += "index.html";
  try { const b = await readFile(join(ROOT, p)); res.writeHead(200, { "content-type": T[extname(p)] || "text/plain" }); res.end(b); }
  catch { res.writeHead(404); res.end("nope"); }
});
await new Promise(r => server.listen(8099, r));
let chromium;
try { ({ chromium } = await import("playwright")); }
catch { console.log("playwright לא מותקן — דילוג. להתקנה: npm i -D playwright && npx playwright install chromium"); server.close(); process.exit(0); }
const browser = await chromium.launch();
let pass = 0, fail = 0;
const check = (n, c, extra = "") => { c ? pass++ : fail++; console.log((c ? "  PASS  " : "  FAIL  ") + n + (extra ? "  " + extra : "")); };

// 1. plan CTA alignment
let page = await browser.newPage({ viewport: { width: 1440, height: 1400 } });
await page.goto("http://127.0.0.1:8099/subscribe/index.html", { waitUntil: "networkidle" });
const tops = await page.$$eval(".plan .plan-foot > .btn", els => els.map(e => Math.round(e.getBoundingClientRect().top)));
check("plan CTAs share a baseline", new Set(tops).size === 1, "tops=" + tops.join(","));

// 2. paywall gate closed on load, premium text absent from DOM
await page.goto("http://127.0.0.1:8099/a/netisha/index.html", { waitUntil: "networkidle" });
await page.waitForTimeout(400);
check("gate visible on load", await page.isVisible("#gate"));
check("premium body empty before unlock", (await page.$eval("#premium", e => e.innerHTML.trim())) === "");
check("premium text not in DOM", !(await page.content()).includes("אורך חיים ממוצע"));

// 3. demo unlock reveals it
await page.click("[data-unlock]");
await page.waitForTimeout(600);
check("premium body revealed after unlock", (await page.$eval("#premium", e => e.textContent)).includes("אורך חיים ממוצע"));
check("gate hidden after unlock", !(await page.isVisible("#gate")));

// 4. calculator recomputes on input
await page.goto("http://127.0.0.1:8099/tools/unit-economics/index.html", { waitUntil: "networkidle" });
const before = await page.$eval('[data-out="contribution"]', e => e.textContent);
await page.fill("#calc-rev", "20");  // 20/head cannot cover 275 fixed+coach
await page.waitForTimeout(250);
const after = await page.$eval('[data-out="contribution"]', e => e.textContent);
const cls = await page.$eval('[data-out="contribution"]', e => e.className);
check("calculator recomputes", before !== after, `${before} -> ${after}`);
check("loss shows as negative state", cls.includes("neg"), "class=" + cls);

// 5. FAQ accordion
await page.goto("http://127.0.0.1:8099/subscribe/index.html", { waitUntil: "networkidle" });
const opened = await page.$$eval("details", d => d.filter(x => x.open).length);
check("one FAQ open at rest", opened === 1);

// 6. every internal link resolves
await page.goto("http://127.0.0.1:8099/index.html", { waitUntil: "networkidle" });
const hrefs = await page.$$eval("a[href]", as => as.map(a => a.href).filter(h => h.startsWith("http://127.0.0.1")));
const broken = [];
for (const h of [...new Set(hrefs)]) { const r = await fetch(h); if (!r.ok) broken.push(h + " " + r.status); }
check("home links all resolve", broken.length === 0, broken.join(" | "));

await browser.close(); server.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
