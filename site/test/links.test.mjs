/**
 * כל קישור יחסי באתר מוביל לקובץ שקיים.
 * הכתבות מקשרות זו לזו ולמחשבונים, ו-slug שמשתנה שובר קישור בשקט.
 * רץ בלי דפדפן.  node test/links.test.mjs
 */
// בדיקת קישורים על כל האתר, לא רק על עמוד הבית — נוספו הרבה קישורים פנימיים
import { readdirSync, statSync, readFileSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
const ROOT = new URL("../public", import.meta.url).pathname;
const walk = (d, a = []) => { for (const n of readdirSync(d)) { const p = join(d, n); statSync(p).isDirectory() ? walk(p, a) : n.endsWith(".html") && a.push(p); } return a; };
let checked = 0; const broken = [];
for (const file of walk(ROOT)) {
  const html = readFileSync(file, "utf8");
  for (const m of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    const href = m[1];
    if (/^(https?:|mailto:|data:|#|\/api\/)/.test(href)) continue;
    checked++;
    const target = resolve(dirname(file), href.split("#")[0]);
    if (!existsSync(target)) broken.push(`${file.slice(ROOT.length)}  ->  ${href}`);
  }
}
console.log(`נבדקו ${checked} קישורים יחסיים ב-${walk(ROOT).length} עמודים`);
if (broken.length) { console.log("\nשבורים:"); [...new Set(broken)].forEach(b => console.log("  " + b)); process.exit(1); }
console.log("  PASS  כל הקישורים היחסיים מובילים לקובץ קיים");
