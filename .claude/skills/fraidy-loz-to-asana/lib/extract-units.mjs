#!/usr/bin/env node
// Split a raw לוז text dump into content units keyed by code (K-01, R-02, S-03, T-04...).
// The PDF text layer is RTL-mangled; we keep blocks verbatim rather than trying to fix them.
import { readFileSync, writeFileSync } from 'node:fs';

const TYPE = { K: 'קרוסלה', R: 'ריל', S: 'סטוריז', T: 'TikTok' };

// A unit header looks like:  "K-01    ·למה חזרתי מהמערה   ( 8 עמודים-אישית)"
// Ranges appear too:         "T-08–T-10    ·המערה— סדרה ב-3 חלקים"
const HEADER = /^([KRST]-\d{2})(?:\s*[–-]\s*([KRST]-\d{2}))?\s*[·:]?\s*(.*)$/;

// Everything after this heading is the weekly שיבוץ table, not unit definitions.
// The same codes reappear there, so parsing past it yields phantom duplicate units.
// Anchor on 'ברמת אסטרטגיה' -- the bare words 'שיבוץ ספטמבר' also appear in the cover title.
export const SCHEDULE_MARKER = 'ברמת אסטרטגיה';

export function splitCatalog(raw) {
  const i = raw.indexOf(SCHEDULE_MARKER);
  return i === -1
    ? { catalog: raw, schedule: '' }
    : { catalog: raw.slice(0, i), schedule: raw.slice(i) };
}

export function extractUnits(raw) {
  const lines = splitCatalog(raw).catalog.split('\n');
  const units = [];
  let cur = null;

  for (const line of lines) {
    if (/^=+ PAGE \d+ =+$/.test(line.trim())) continue; // page markers are noise
    const m = HEADER.exec(line.trim());
    if (m) {
      if (cur) units.push(cur);
      const [, code, rangeEnd, rest] = m;
      cur = {
        code,
        rangeEnd: rangeEnd || null,
        type: TYPE[code[0]],
        title: cleanTitle(rest),
        body: [],
      };
    } else if (cur) {
      cur.body.push(line);
    }
  }
  if (cur) units.push(cur);

  for (const u of units) {
    u.body = u.body.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }
  return units;
}

// Strip the trailing "( 8 עמודים...)" / "( 30–45 שנ׳" format hint, then repair the
// PDF text layer's RTL damage: collapsed runs of spaces and orphaned quote marks
// (a title like `"אתם חושבים ש— שינוי` loses its closing quote during extraction).
function cleanTitle(s) {
  let t = s
    .replace(/\s*\(\s*[^)]*$/, '')
    .replace(/\s*\([^)]*\)\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
  if ((t.match(/"/g) || []).length % 2 === 1) t = t.replace(/"/g, '');
  return t.replace(/^[\s·—-]+/, '').replace(/[\s·—-]+$/, '').trim();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , inFile, outFile] = process.argv;
  if (!inFile) { console.error('usage: extract-units.mjs <raw.txt> [out.json]'); process.exit(1); }
  const units = extractUnits(readFileSync(inFile, 'utf8'));
  const seen = new Map();
  for (const u of units) seen.set(u.code, (seen.get(u.code) || 0) + 1);
  const dupes = [...seen].filter(([, n]) => n > 1);

  console.log(`extracted ${units.length} units`);
  for (const t of ['קרוסלה', 'ריל', 'סטוריז', 'TikTok']) {
    const list = units.filter(u => u.type === t);
    console.log(`  ${t.padEnd(8)} ${String(list.length).padStart(2)}  ${list.map(u => u.code).join(' ')}`);
  }
  if (dupes.length) console.log('DUPLICATE CODES:', dupes);
  if (outFile) { writeFileSync(outFile, JSON.stringify(units, null, 2)); console.log(`wrote ${outFile}`); }
}
