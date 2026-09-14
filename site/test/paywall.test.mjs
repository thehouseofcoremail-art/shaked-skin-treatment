/**
 * בדיקת אטימות של חומת התשלום.
 *
 * לוקחת כל משפט מגוף כתבה בתשלום ומוודאת שהוא לא מופיע באף קובץ סטטי ב-public/.
 * זו ההבטחה המרכזית של המוצר, ולכן היא נבדקת אוטומטית ולא בעין.
 *
 * הרצה:  npm run build  ואז  node test/paywall.test.mjs
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const PUBLIC = join(ROOT, "public");

const { BODIES } = await import(join(ROOT, "functions/_data/bodies.js"));

/** כל קבצי הטקסט שמוגשים לדפדפן, למעט קובץ ההדגמה שלא עולה לאוויר */
function textFiles(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) { textFiles(path, acc); continue; }
    if (name === "bodies.demo.json") continue;
    if ([".html", ".json", ".xml", ".txt", ".js", ".css", ".svg"].includes(extname(name))) acc.push(path);
  }
  return acc;
}

const files = textFiles(PUBLIC).map((p) => ({ path: p.slice(PUBLIC.length), text: readFileSync(p, "utf8") }));

const strip = (html) =>
  html.replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/g, " ").replace(/\s+/g, " ").trim();

let checked = 0;
const leaks = [];

for (const [slug, html] of Object.entries(BODIES)) {
  // משפטים ארוכים מספיק כדי להיות ייחודיים, ולא כותרת או תווית של מחשבון
  const sentences = strip(html)
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 45);

  for (const sentence of sentences) {
    checked++;
    const hit = files.find((f) => f.text.includes(sentence));
    if (hit) leaks.push({ slug, file: hit.path, sentence: sentence.slice(0, 70) });
  }
}

console.log(`נבדקו ${checked} משפטים מ-${Object.keys(BODIES).length} כתבות בתשלום מול ${files.length} קבצים סטטיים`);

if (leaks.length) {
  console.log(`\n  FAIL  ${leaks.length} קטעים בתשלום דלפו ל-public/:\n`);
  for (const l of leaks.slice(0, 10)) console.log(`    ${l.file}  (${l.slug})\n      "${l.sentence}…"`);
  process.exit(1);
}

console.log("  PASS  שום משפט בתשלום לא מופיע בקבצים הסטטיים");
