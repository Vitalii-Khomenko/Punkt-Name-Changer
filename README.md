# PunktNameChanger — Leica Mobile Renamer V3

Mobile-friendly web tool for batch renaming Leica survey point IDs in `.imes`, `.ipkt`, `.iroh`, and `.lqp` files.
Optimized for field use (tested on Samsung A55). No server or installation required — open directly in any browser.

**Two versions:**
- `index_singlefile_mobile.html` — all-in-one file, ideal for mobile (copy to phone, open in browser)
- `index.html` — multi-file version (same functionality, loads `css/` and `js/` separately)

---

## Supported File Formats

| Extension | Description |
|-----------|-------------|
| `.imes`   | Leica raw measurement (fixed-width pipe format) |
| `.ipkt`   | Leica measurement packet (same pipe format) |
| `.iroh`   | Leica report / result file (tagged pipe format) |
| `.lqp`    | Leica quality protocol (space-delimited blocks) |

---

## Supported Point ID Format

**Dot-format only:**

```
[Family][Path].[Index]
```

| Part     | Values         | Example   |
|----------|----------------|-----------|
| Family   | `G` or `P`     | `G`, `P`  |
| Path     | `01`..`10`     | `05`      |
| Index    | `001`..`998`   | `023`     |

Examples: `G01.001`, `P05.003`, `G10.998`

Points outside this format are ignored.

---

## Output Name Format

```
[BasePrefix].MQ[NN].[SuffixCode]
```

Example: `3560.MQ03.01`

### Suffix Codes

| Family | Index parity | Suffix |
|--------|-------------|--------|
| `P`    | Odd         | `01`   |
| `P`    | Even        | `02`   |
| `G`    | Odd         | `03`   |
| `G`    | Even        | `04`   |

### MQ Index Numbering Rules

Points naturally come in pairs: `001/002`, `003/004`, `071/072`, and so on.
Odd + even points from the same source pair share the same MQ.

MQ is based on the original source point pair index, not only on the count of rows encountered in the file:

```
pairIndex = floor((sourceIndex - 1) / 2)
mqIndex = startMq + pairIndex - startPairIndex
```

Example with Start Point `G01.001` and Start MQ `1`:

| Source ID | New MQ |
|-----------|--------|
| `G01.001` | `MQ01` |
| `G01.016` | `MQ08` |
| `G01.071` | `MQ36` |
| `G01.088` | `MQ44` |

This means partial measurements work correctly when the file contains the first part of a path and then jumps to the end of the path.

---

## Workflow

### 1. Load Files

Upload all related files (master + siblings). The tool reads everything into session memory at once.

### 2. Select Master File

Choose the file used as the coordinate reference (`.imes` or `.ipkt` preferred).
The tool automatically:
- parses all point IDs and their coordinates from the master,
- detects all present dot-format patterns (e.g. `G05`, `P02`),
- renders a configuration row for each pattern.

### 3. Configure Patterns (Pattern Mode)

For each detected pattern group:

| Field                 | Description |
|-----------------------|-------------|
| **New Base Prefix**   | Prefix for the new names, e.g. `3560` |
| **Start Point (###)** | Index of the first point to rename, e.g. `1` |
| **QTY to Rename**     | Number of consecutive points to process |
| **Start MQ Index**    | Starting MQ counter value, e.g. `1` |

Renaming begins when the tool encounters the configured **Start Point** in the file, then processes exactly **QTY** points.

### 4. Run

Press **Rename**. The tool processes all loaded files in memory.
Modified files are kept in session — you can run again with different settings (changes accumulate).

### 5. Export

Press **Export TXT** to:
- download all **modified files** (with the configured suffix appended to the filename),
- download a **rename log** `.txt` listing every `oldID → newName` substitution.

---

## Manual Mode (Single Point by `<LfNr>`)

Enable **Manual start by `<LfNr>`** for `.imes` / `.ipkt` files.

| Field                      | Description |
|----------------------------|-------------|
| **Start `<LfNr>`**         | Row number in the master file, e.g. `22` or `000022` |
| **Manual: New Point Name** | Exact target name, e.g. `3560.MQ01.03` |

The tool looks up the point ID at the given `<LfNr>` in the master, then renames exactly **that one point** across all session files.
Useful for correcting individual points without running a full pattern session.

---

## Multi-Run Session

All files remain in memory between runs. You can:
- run Pattern Mode for one group, then run again for another group,
- run Manual Mode multiple times to fix individual points.

Exported files always reflect the **cumulative** state of all runs in the session.
Starting a new file selection resets the session completely.

---

## Safety Rules

- **Pre-read file safety**: unsupported extensions are skipped before reading, files over 10 MB are skipped, and one session is capped at 30 MB total.
- **Coordinate validation**: each candidate rename is checked against the master coordinate (Y, X tolerance ± 0.05 m). Mismatches are skipped with a warning.
- **Format preservation**: replacement strings are padded to preserve the original field width in every format.
- **Safe name components**: pattern base prefixes and export suffixes may contain only letters, numbers, dot, underscore, and hyphen.
- **Header/station exclusion**: in `.iroh`, lines with `CLS:STAT` or `CODE:iGeo` are never renamed.
- **Hard limit**: renaming stops exactly at the configured QTY; excess points in the file are left unchanged.
- **LQP guard**: only rows that look like measurement lines (two finite numeric tokens within 0–400 range) are eligible.
- **Log limit**: log is capped at 400 lines to protect memory on mobile devices.

---

## Logging

The on-screen log shows:
- master file name and indexed point count
- detected patterns with range and count
- per-rename warnings (coordinate mismatches, skips)
- final summary: total renames, files changed, per-pattern MQ progress

---

## Quick Start (Mobile)

1. Copy `index_singlefile_mobile.html` to your phone.
2. Open it in Chrome or Samsung Internet.
3. Tap **Upload Files** and select all relevant Leica files.
4. Verify the **Master File** dropdown (prefer `.imes` / `.ipkt`).
5. For each detected pattern, fill in **New Base Prefix**, adjust **Start Point** and **QTY** if needed.
6. Press **Rename**.
7. Review the log. Run again if needed.
8. Press **Export TXT** to download renamed files and the rename log.

---

## Mobile Field UX

- The single-file app is the primary smartphone build.
- Main action buttons stay available near the bottom of the configuration card while scrolling.
- Numeric fields request numeric mobile keyboards where possible.
- The log auto-scrolls to the newest message and supports touch momentum scrolling.
- Safe-area padding is enabled for modern phone browser viewports.
- File reads and rename runs show a busy status and disable the main action controls.
- The configuration card shows an export summary with loaded files, modified files, and TXT log entries.

---

## Privacy And Security

- Files stay local in the browser tab and are not uploaded.
- The app does not use analytics, cookies, browser storage, or remote API calls.
- Unsupported files and oversized inputs are skipped before reading.
- Content Security Policy metadata blocks network connections and object embedding.
- See `SECURITY.md` for deployment and reporting guidance.

---

## Project Structure

```
index_singlefile_mobile.html  — all-in-one version (use on mobile)
index.html                    — multi-file version (use on desktop)
css/style.css                 — mobile-first styles
js/utils.js                   — global state, helpers, logging
js/parsers.js                 — coordinate map building (imes/ipkt/iroh/lqp)
js/renamer.js                 — renaming engine (pattern mode + manual mode)
js/main.js                    — UI orchestration, session management, export
Mission.md                    — detailed product/logic mission document
tests/run_validation.py       — regression validation suite
scripts/build_singlefile_dist.py — generated single-file builder, writes only to dist/
AGENTS.md                     — agent instructions
rules.txt                     — development and publishing rules
VALIDATION.md                 — validation notes
Function.txt                  — behavior notes and source-of-truth guidance
SECURITY.md                   — security and deployment guidance
LICENSE                       — MIT license
```

## Testing

Run the regression suite with:

```bash
python tests/run_validation.py
```

Generate a separate single-file build without touching the smartphone field file:

```bash
python scripts/build_singlefile_dist.py
```

The generated file is written to `dist/index_singlefile_mobile.generated.html`.

## License

MIT License

## Notes

- Client-side only — no backend, no installation required.
- Keep original source files as backup before production batch operations.
