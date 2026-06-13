# PunktNameChanger — Leica Mobile Renamer V3

Mobile-friendly web tool for batch renaming Leica survey point IDs in `.imes`, `.ipkt`, `.iroh`, and `.lqp` files.
Optimized for field use (tested on Samsung A55). No server or installation required — open directly in any browser.

**Two versions:**
- `Punkt-Name-Changer.html` — all-in-one file, ideal for mobile (copy to phone, open in browser)
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
| Family   | `G`, `P`, `Q`, or `QL` | `G`, `P`, `Q`, `QL` |
| Path     | `01`..`10`     | `05`      |
| Index    | `001`..`998`   | `023`     |

Examples: `G01.001`, `P05.003`, `Q01.004`, `QL01.004`, `G10.998`

Points outside this format are ignored.

---

## Numeric Leica ID Normalizer

Some Leica field files use simple numeric IDs such as `101.1` instead of the
dot format required by the browser app. The included Python utility converts
one numeric series into a supported pattern while preserving fixed-width
alignment, original line endings, and all non-ID bytes.

For the default prism conversion `101.1` or `101.01` → `P01.001`:

```bash
python scripts/normalize_leica_point_ids.py 20260612_YXZ.ipkt
```

This writes `20260612_YXZ_normalized.ipkt`. It converts `101.1` through
`101.998` into `P01.001` through `P01.998`. It also converts the `101.EX.NN`
series into groups of four, starting at MQ 19:

| Source IDs | Normalized IDs |
| --- | --- |
| `101.EX.01..04` | `101.MQ19-1..4` |
| `101.EX.05..08` | `101.MQ20-1..4` |
| `101.EX.09..12` | `101.MQ21-1..4` |
| `101.EX.13..16` | `101.MQ22-1..4` |
| `101.EX.17..20` | `101.MQ24-1..4` |

`MQ23` is reserved, so the EX sequence jumps from `MQ22` directly to `MQ24`.

Set another EX starting MQ when needed:

```bash
python scripts/normalize_leica_point_ids.py input.ipkt --ex-start-mq 25
```

Use explicit mappings for other numeric series:

```bash
python scripts/normalize_leica_point_ids.py input.ipkt --source-prefix 205 --target-pattern P05
```

Use `--in-place` only when the original file should be replaced. In-place mode
creates an adjacent `.bak` backup before writing.

### Gleis Prefix Mini-Script

For Gleis files that use IDs such as `G101.01`, use the separate focused
mini-script:

```bash
python scripts/normalize_gleis_point_prefix.py "20260612_YXZ_Gleis 101_Gleisaufnahme.ipkt"
```

By default, it uses every other MQ, except source points `G101.19..G101.36`,
which use consecutive MQs:

| Source IDs | Normalized IDs | MQ |
| --- | --- | --- |
| `G101.01 / G101.02` | `G01.001 / G01.002` | `MQ01` |
| `G101.03 / G101.04` | `G01.005 / G01.006` | `MQ03` |
| `G101.17 / G101.18` | `G01.033 / G01.034` | `MQ17` |
| `G101.19 / G101.20` | `G01.037 / G01.038` | `MQ19` |
| `G101.21 / G101.22` | `G01.039 / G01.040` | `MQ20` |
| `G101.35 / G101.36` | `G01.053 / G01.054` | `MQ27` |
| `G101.37 / G101.38` | `G01.057 / G01.058` | `MQ29` |

The script leaves other points such as `T1..T4` unchanged. The consecutive
range can be changed with `--consecutive-start-point` and
`--consecutive-end-point`.

### 20260613 Multi-Family Mini-Script

Use the dedicated converter for the four source families in
`20260613_YXZ.ipkt`:

```bash
python scripts/normalize_20260613_point_ids.py 20260613_YXZ.ipkt
```

Numeric point mapping:

| Source family | Target pattern |
| --- | --- |
| `2505.1.NN` | `P02.NNN` |
| `2500.1.NN` | `P03.NNN` |
| `2504.2.NN` | `P04.NNN` |
| `2504.1.NN` | `P05.NNN` |

Each source family's EX points keep their source family prefix. EX points use
four positions per MQ through `MQ22-2`, then jump across the bridge:

```text
EX.14 -> MQ22-2
EX.15 -> MQ24-1
EX.16 -> MQ24-2
EX.17 -> MQ25-1
```

From `MQ25-1`, normal four-position MQ groups resume.

---

## Output Name Format

```
[BasePrefix].MQ[NN].[SuffixCode]
```

Example: `3560.MQ03.1`

Final suffix codes are always single digits: `1`, `2`, `3`, or `4`.

### Suffix Codes

| Family | Index parity | Suffix |
|--------|-------------|--------|
| `P`    | Odd         | `1`   |
| `P`    | Even        | `2`   |
| `G`    | Odd         | `3`   |
| `G`    | Even        | `4`   |
| `Q`    | 1st in each group of 4 | `3` |
| `Q`    | 2nd in each group of 4 | `4` |
| `Q`    | 3rd in each group of 4 | `1` |
| `Q`    | 4th in each group of 4 | `2` |
| `QL`   | 1st in each group of 4 | `1` |
| `QL`   | 2nd in each group of 4 | `3` |
| `QL`   | 3rd in each group of 4 | `4` |
| `QL`   | 4th in each group of 4 | `2` |

### Quadro Measurement Mode

`Q` and `QL` patterns are additional measurement modes for one combined four-point setup.
Each group of four source points shares one MQ index. `Q` records rail, rail, prism, prism:

| Source ID | Output suffix | Role |
|-----------|---------------|------|
| `Q01.001` | `3` | Rail point 1 |
| `Q01.002` | `4` | Rail point 2 |
| `Q01.003` | `1` | Prism point 1 |
| `Q01.004` | `2` | Prism point 2 |

`QL` records prism, rail, rail, prism:

| Source ID | Output suffix | Role |
|-----------|---------------|------|
| `QL01.001` | `1` | Prism point 1 |
| `QL01.002` | `3` | Rail point 1 |
| `QL01.003` | `4` | Rail point 2 |
| `QL01.004` | `2` | Prism point 2 |

For Quadro prism points only, the tool subtracts `0.04 m` from the existing height field while preserving the original numeric formatting as much as possible.

### MQ Index Numbering Rules

`G` and `P` points naturally come in pairs: `001/002`, `003/004`, `071/072`, and so on.
Odd + even points from the same source pair share the same MQ. `Q` and `QL` points use groups of four, so `001..004` share one MQ, `005..008` share the next MQ, and so on.

MQ is based on the original source point pair index for `G`/`P` and on the original source group-of-four index for `Q`/`QL`, not only on the count of rows encountered in the file:

```
G/P groupIndex  = floor((sourceIndex - 1) / 2)
Q/QL groupIndex = floor((sourceIndex - 1) / 4)
mqIndex = startMq + groupIndex - startGroupIndex
```

Example with Start Point `G01.001` and Start MQ `1`:

| Source ID | New MQ |
|-----------|--------|
| `G01.001` | `MQ01` |
| `G01.016` | `MQ08` |
| `G01.071` | `MQ36` |
| `G01.088` | `MQ44` |

This means partial measurements work correctly when the file contains the first part of a path and then jumps to the end of the path.
For Quadro patterns, skipped sections are represented by the source index inside the same path. For example, with Start Point `Q01.001` or `QL01.001` and Start MQ `1`, indexes `001..004` map to `MQ01`, `005..008` map to `MQ02`, `037..040` map to `MQ10`, and `045..048` map to `MQ12`.

---

## Workflow

### 1. Load Files

Upload all related files (master + siblings). The tool reads everything into session memory at once.

### 2. Select Master File

Choose the file used as the coordinate reference (`.imes` or `.ipkt` preferred).
The tool automatically:
- parses all point IDs and their coordinates from the master,
- detects all present dot-format patterns (e.g. `G05`, `P02`, `Q01`, `QL01`),
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
| **Manual: New Point Name** | Exact target name, e.g. `3560.MQ01.3` |

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
- **Quadro height adjustment**: `Q` and `QL` prism positions only receive a `-0.04 m` height offset during rename.
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

1. Copy `Punkt-Name-Changer.html` to your phone.
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
Punkt-Name-Changer.html  — all-in-one version (use on mobile)
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

The suite also rebuilds `dist/Punkt-Name-Changer.generated.html` and checks that the generated file remains self-contained, keeps the mobile safety features, and does not modify `Punkt-Name-Changer.html`.

Generate a separate single-file build without touching the smartphone field file:

```bash
python scripts/build_singlefile_dist.py
```

The generated file is written to `dist/Punkt-Name-Changer.generated.html`.

## License

MIT License

## Notes

- Client-side only — no backend, no installation required.
- Keep original source files as backup before production batch operations.
