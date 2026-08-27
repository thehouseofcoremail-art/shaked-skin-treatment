---
name: fraidy-loz-to-asana
description: Load a monthly לוז (content schedule) for Fraidy Margalit / מרחב מודעות into the Asana project "סושיאל 2026". Use when asked to enter, import, sync, or build a month's schedule in Asana for פריידי / מרחב מודעות — e.g. "תכניס את הלוז של ספטמבר לאסנה", "load October's schedule", "sync the content plan to Asana". Parses the לוז PDF into content units (K/R/S/T codes), assigns dates from the week-level שיבוץ table, de-dupes against existing Asana tasks, and flags editorial conflicts before writing.
---

# לוז → Asana · מרחב מודעות (פריידי מרגלית)

Converts the monthly content-system document into dated Asana tasks.

**Paths below are relative to this skill directory** (`.claude/skills/fraidy-loz-to-asana/`).

The לוז arrives as a PDF ("מערכת התוכן המלאה"). It defines content **units** with
codes — `K-nn` קרוסלה, `R-nn` ריל, `S-nn` סטוריז, `T-nn` TikTok — and ends with a
**`שיבוץ … — ברמת אסטרטגיה (לאסנה)`** table mapping units to *weeks*. That table is
the authoritative schedule; everything before it is the unit catalog.

The document commits to **weeks, not days**. Day-level dates are assigned by
`lib/plan.mjs` and every task says so in its notes. Do not present them as the
client's choice.

## Target

| | |
|---|---|
| Project | `סושיאל 2026` — gid `1208559583775601` |
| Section | `רעיונות` — gid `1208559583775616` (where all dated content lives) |
| Workspace | gid `1201258145502958` |
| Access | Asana MCP tools. There is no API token in the environment — a standalone HTTP driver will not work. |

## Prerequisites

`pdftotext`/`pdfinfo` are **not** available and `apt-get install poppler-utils`
fails in this container. Use `pypdf`:

```bash
pip install --quiet pypdf
pip install --quiet --upgrade cffi   # required: see Gotchas
node --version                        # v22.22.2
```

## Step 1 — PDF → raw text

`extract_text()` throws on emoji in this document, so re-encode defensively:

```bash
python3 -c "
import pypdf
r = pypdf.PdfReader('LOZ.pdf')
parts=[]
for i,p in enumerate(r.pages):
    try: t=p.extract_text()
    except Exception as e: t=f'[extract error {e}]'
    parts.append(f'=========== PAGE {i+1} ===========\n' + t.encode('utf-8','replace').decode('utf-8'))
open('loz_raw.txt','w',encoding='utf-8').write('\n'.join(parts))
print('pages:', len(r.pages))
"
```

## Step 2 — raw text → unit catalog

```bash
node lib/extract-units.mjs loz_raw.txt data/units.json
```

Prints a per-type census. **Reconcile it against the counts the document states
about itself** ("קרוסלות 11 יחידות", "סטוריז 8 רצפים", "TikTok · 18 יחידות").
For the September לוז this printed:

```
extracted 44 units
  קרוסלה   11  K-01 … K-11
  ריל       9  R-01 R-02 R-03 R-04 R-06 R-07 R-08 R-09 R-10
  סטוריז    8  S-01 … S-08
  TikTok   16  T-01 … T-08 T-11 … T-18
```

9 רילים against a stated 10, and 16 TikTok against a stated 18, are both
**correct** — see Gotchas.

## Step 3 — describe the schedule

Hand-write `data/schedule.json` from the שיבוץ table (5 rows — transcribing is
more reliable than parsing a mangled RTL table). Units named only in prose
("קרוסלת ראש השנה", "אפטר-מובי מהאירוע") get synthetic codes in `adHoc`.
Recurring formats go in `weekly` (`S-07` הודיה של שישי → every Friday).

Record editorial conflicts in `data/flags.json` with `severity`:
`blocker` (never create), `conflict` (create, but surface), `info`.

## Step 4 — snapshot what Asana already has

Never skip this — September already held 47 tasks before any import.

```
mcp__Asana__search_tasks
  projects_any   = 1208559583775601
  due_on_after   = 2026-08-31      # exclusive
  due_on_before  = 2026-10-01      # exclusive
  opt_fields     = name,due_on,completed
  limit          = 100
```

Save to `data/existing-asana.json`. De-dupe matches a unit code appearing
*inside* an existing task name, case- and separator-insensitive — the team
writes it inline, e.g. `קרוסלה-הגוף שומע כל מילה k09` ⇒ `K-09` already placed.

## Step 5 — plan (agent path)

```bash
node lib/plan.mjs            # human-readable review table
node lib/plan.mjs --json     # { tasks, skipped, flags } ready for Asana
```

The review table shows date, weekday, code, type, title, `📌` pinned-recurring,
`⚠️` flagged, and `(+N קיימות)` for tasks already on that day. **Read the
דילוגים and התראות sections before writing anything.**

## Step 6 — write to Asana

Show the plan to the user and get approval first — day-level dates are inferred.
Then batch the `--json` tasks:

```
mcp__Asana__create_tasks
  default_project  = 1208559583775601
  default_assignee = "me"                    # required — see below
  tasks = [ { name, due_on, notes, section_id: "1208559583775616" }, … ]
```

**Every task must be assigned.** The team's standing convention is that content
tasks carry an owner; `default_assignee: "me"` covers a whole batch. To fix
tasks already created unassigned, `mcp__Asana__update_tasks` takes up to 50
`{task, assignee: "me"}` objects in one call.

**Tags must be applied by hand.** Neither `create_tasks` nor `update_tasks`
exposes a tags field, and no other Asana MCP tool sets one — the capability
simply is not in the toolset. The project uses tags rather than custom fields
(it has *no* custom fields at all), so after creating, select the new tasks in
the Asana UI and apply the type tag in bulk. GIDs are in `data/tags.json`:
`קרוסלה` `1211415827285507`, `רילס` `1210844438986273`. The task **name** is
built as `<type> <code> · <title>` precisely so the type is filterable even
before tags are on.

## Gotchas

- **`pdfinfo`/`pdftoppm` are absent** and poppler-utils will not install. The
  `Read` tool cannot render this PDF either. `pypdf` is the only path.
- **`pypdf` import crashes** with `ModuleNotFoundError: No module named
  '_cffi_backend'` from a broken system `cryptography`. Fix: `pip install
  --upgrade cffi`. pypdf only touches `cryptography` for encrypted PDFs.
- **`extract_text()` raises `UnicodeEncodeError: surrogates not allowed`** on
  emoji (page 2 onward). Re-encode with `errors='replace'` per page.
- **The words "שיבוץ ספטמבר" appear twice** — once in the cover title, once as
  the schedule heading. Splitting on them puts the whole catalog on the wrong
  side and yields **0 units**. Anchor on `ברמת אסטרטגיה` instead.
- **RTL extraction mangles titles**: runs of spaces collapse and quote marks lose
  their partner (`"אתם חושבים ש— שינוי`). `cleanTitle()` strips odd-count quotes.
- **`T-08–T-10` is one range header** for a 3-part series; T-09 and T-10 have no
  blocks of their own. `plan.mjs` aliases them onto the series unit — without
  that, scheduled T-10 looks undefined.
- **A missing code is not always an extraction bug.** `R-05` has no catalog block
  because its slot holds a client rejection: *"לא מתאים החודש. שמרי את זה לחודש
  יולי… הביאי כאן משהו על שינוי."* It is a `blocker` in `flags.json`.
- **The doc contradicts itself on dates.** September's week-4 header reads
  "שבוע האירוע, ראש השנה", but the event is 18.09 (week 3) and ראש השנה is
  11–13.09 (week 2) per both `K-06` and Asana. Flag; never silently "fix".
- **Recurring formats are invisible to the table.** `S-07` appears once per week
  row but is a standing Friday slot — it must expand to every Friday.
- **The last unit of a section swallows the next banner.** Unit bodies run until
  the next unit code, so `S-08` absorbed the entire TikTok section intro and
  `T-18` picked up the dangling `שיבוץ ספטמבר —`. `SECTION` in
  `extract-units.mjs` closes a unit on those banners; check any unit that is
  last in its group after changing the regex.
- **`create_tasks` accepts 50 tasks but the call truncates far earlier.** Hebrew
  notes escape to ~6 bytes per character, so a batch of 8 full-copy tasks
  (~26 KB encoded) is silently cut and rejected as unparseable JSON. Batch by
  *encoded size*, not task count — 8 tasks worked repeatedly, 8 with the longest
  carousel copy did not; drop to 4 when the notes are long.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `extracted 0 units` | Split marker matched the cover title — anchor on `ברמת אסטרטגיה`. |
| `DUPLICATE CODES: [...]` for most codes | Catalog/schedule split failed; the שיבוץ table is being parsed as definitions. |
| `pyo3_runtime.PanicException` on `import pypdf` | `pip install --upgrade cffi`. |
| `UnicodeEncodeError: surrogates not allowed` | Per-page `.encode('utf-8','replace').decode('utf-8')`. |
| Unit skipped `אין הגדרה בקטלוג` | Either a range member needing an alias, or a prose-only unit needing an `adHoc` entry. |
| `InputValidationError: could not be parsed as JSON` on create_tasks | The payload truncated. Halve the batch — it is size, not the 50-task cap. |
| New tasks show no tag | Expected. No MCP tool sets tags; apply them in the Asana UI (`data/tags.json`). |
| New tasks show no assignee | `default_assignee` was omitted; fix with `update_tasks`. |
