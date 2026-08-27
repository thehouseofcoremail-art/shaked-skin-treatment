#!/usr/bin/env node
// Turn the week-level שיבוץ into dated Asana task payloads.
// The לוז commits to weeks, not days -- day assignment happens here and is
// reported as a proposal, never presented as if it came from the document.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const load = f => JSON.parse(readFileSync(join(HERE, '..', 'data', f), 'utf8'));

const DOW = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const HE_DOW = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];

const iso = d => d.toISOString().slice(0, 10);
const parse = s => new Date(`${s}T00:00:00Z`);

function daysOf(week) {
  const out = [];
  for (let d = parse(week.from); iso(d) <= week.to; d.setUTCDate(d.getUTCDate() + 1)) out.push(iso(d));
  return out;
}

// Spread n items across the week's days as evenly as the week allows, keeping
// document order. Pinned days (S-07 on Friday) are removed from the pool first.
function spread(items, days) {
  return items.map((it, i) => ({ ...it, due_on: days[Math.floor((i * days.length) / items.length)] }));
}

export function buildPlan() {
  const units = load('units.json');
  const sched = load('schedule.json');
  const existing = load('existing-asana.json');
  const flags = load('flags.json');

  const byCode = new Map(units.map(u => [u.code, u]));
  // "T-08–T-10" defines one series block; alias the intermediate codes onto it so
  // a schedule entry for T-09/T-10 resolves instead of looking undefined.
  for (const u of units) {
    if (!u.rangeEnd) continue;
    const [pfx, from] = [u.code[0], +u.code.slice(2)];
    for (let n = from + 1; n <= +u.rangeEnd.slice(2); n++) {
      const code = `${pfx}-${String(n).padStart(2, '0')}`;
      if (!byCode.has(code)) byCode.set(code, { ...u, code, aliasOf: u.code });
    }
  }
  const flagged = new Map(flags.map(f => [f.unit, f]));

  // A unit counts as already-present if its code appears in an existing task name
  // (the team writes it inline, e.g. "קרוסלה-הגוף שומע כל מילה k09").
  const codeIn = name => {
    const n = name.toLowerCase().replace(/[\s-]/g, '');
    return code => n.includes(code.toLowerCase().replace(/[\s-]/g, ''));
  };
  const presentCodes = new Set();
  for (const t of existing.tasks) {
    const has = codeIn(t.name);
    for (const c of byCode.keys()) if (has(c)) presentCodes.add(c);
  }

  const planned = [];
  const skipped = [];

  for (const week of sched.weeks) {
    const days = daysOf(week);
    const pinned = [];
    const free = [];

    for (const code of week.units) {
      const f = flagged.get(code);
      if (f?.severity === 'blocker') { skipped.push({ code, week: week.n, reason: `חסום — ${f.proposal}` }); continue; }
      const meta = byCode.get(code) || sched.adHoc[code];
      if (!meta) { skipped.push({ code, week: week.n, reason: 'אין הגדרה בקטלוג ולא ב-adHoc' }); continue; }
      if (presentCodes.has(code)) { skipped.push({ code, week: week.n, reason: 'כבר קיים באסנה' }); continue; }

      const item = { code, week: week.n, theme: week.theme, type: meta.type, title: meta.title, flag: f || null, aliasOf: meta.aliasOf || null };
      // An event-relative unit (a countdown) ignores its week and expands into one
      // task per step, dated off the anchor event. The לוז schedules these by week,
      // which contradicts their own spec -- see data/flags.json.
      const exp = sched.expand?.[code];
      if (exp) {
        const ev = sched.events[exp.anchorEvent];
        for (const st of exp.steps) {
          const d = parse(ev.date);
          d.setUTCDate(d.getUTCDate() + st.offset);
          pinned.push({ ...item, due_on: iso(d), step: st, anchor: ev });
        }
        continue;
      }

      const rule = sched.weekly[code];
      if (rule) {
        const day = days.find(d => DOW[parse(d).getUTCDay()] === rule.day);
        if (day) { pinned.push({ ...item, due_on: day, pinned: rule.note }); continue; }
      }
      free.push(item);
    }

    const pinnedDays = new Set(pinned.map(p => p.due_on));
    const pool = days.filter(d => !pinnedDays.has(d));
    planned.push(...pinned, ...spread(free, pool.length ? pool : days));
  }

  planned.sort((a, b) => a.due_on.localeCompare(b.due_on) || a.code.localeCompare(b.code));
  return { planned, skipped, sched, existing, flags, units: byCode };
}

export function toAsanaTasks(planned, units, sched) {
  return planned.map(p => {
    const u = units.get(p.code);
    const head = [
      `יחידה ${p.code} · ${p.type}`,
      `שבוע ${p.week} — ${p.theme}`,
      p.step
        ? `שלב: ${p.step.label} (${p.step.offset >= 0 ? '+' : ''}${p.step.offset} ימים מ-${p.anchor.date} · ${p.anchor.title})\nקופי: ${p.step.copy}`
        : p.pinned ? `שיבוץ קבוע: ${p.pinned}` : 'תאריך היום הוצע אוטומטית מתוך שיבוץ ברמת שבוע.',
      p.flag ? `⚠️ ${p.flag.issue}\nהצעה: ${p.flag.proposal}` : null,
      `מקור: ${sched.source}`,
    ].filter(Boolean).join('\n');
    const body = u?.body ? `\n\n${'—'.repeat(20)}\n${u.body}` : '';
    return {
      name: (p.step
        ? `${p.type} ${p.code} · ${p.title} — ${p.step.label}`
        : `${p.type} ${p.code} · ${p.title}`).trim(),
      due_on: p.due_on,
      notes: (head + body).slice(0, 4000),
    };
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { planned, skipped, sched, existing, flags, units } = buildPlan();
  const json = process.argv.includes('--json');
  if (json) {
    console.log(JSON.stringify({ tasks: toAsanaTasks(planned, units, sched), skipped, flags }, null, 2));
  } else {
    console.log(`\n=== תוכנית שיבוץ ספטמבר — ${planned.length} משימות חדשות ===\n`);
    let week = null;
    const load = new Map();
    for (const t of existing.tasks) load.set(t.due_on, (load.get(t.due_on) || 0) + 1);
    // Event-anchored units are dated outside their filed week, so grouping by
    // p.week makes the header oscillate. Group by the week the date falls in.
    const weekOf = d => sched.weeks.find(w => d >= w.from && d <= w.to);
    for (const p of planned) {
      const w = weekOf(p.due_on);
      if (w && w.n !== week) { week = w.n; console.log(`\n── שבוע ${week}: ${w.theme}`); }
      const d = parse(p.due_on);
      const before = load.get(p.due_on) || 0;
      console.log(
        `  ${p.due_on.slice(5)} ${HE_DOW[d.getUTCDay()]}  ${p.code.padEnd(9)} ${p.type.padEnd(7)} ${p.title.slice(0, 42).padEnd(44)}` +
        `${p.pinned ? '📌' : p.step ? '🎯' : '  '}${p.flag && p.flag.severity !== 'resolved' ? ' ⚠️' : ''}` +
        `${p.step ? ` [${p.step.label}]` : ''}${before ? ` (+${before} קיימות)` : ''}`
      );
    }
    console.log(`\n── דילוגים (${skipped.length})`);
    for (const s of skipped) console.log(`  ${s.code.padEnd(9)} שבוע ${s.week}  ${s.reason}`);
    console.log(`\n── התראות (${flags.length})`);
    for (const f of flags) console.log(`  [${f.severity}] ${f.unit}: ${(f.severity === 'resolved' ? f.proposal : f.issue).slice(0, 110)}…`);
    console.log();
  }
}
