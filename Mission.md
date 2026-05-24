# Mission: Universal Leica Point Renamer (Mobile V3 — Session-Based)

> **Status:** Active / Optimized for Samsung A55
> **Latest Update:** Session-based multi-run architecture, per-pattern UI configuration, dot-format IDs (G01.001..G10.998 / P01.001..P10.998 / Q01.001..Q10.998), manual single-point rename by `<LfNr>`, TXT export with rename log.

## 1. Project Overview

Build a robust mobile web app for batch renaming Leica point IDs in `.imes`, `.ipkt`, `.iroh`, and `.lqp` files. The app is optimized for Samsung A55 and field usage.

**Two distribution formats:**
- `Punkt-Name-Changer.html` — single self-contained file (recommended for mobile field use)
- `index.html` + `css/` + `js/` — split version (identical logic, easier to maintain)

### Core goals
1. **Data Safety:** Prevent accidental renaming of wrong points via coordinate validation and strict QTY limits.
2. **Predictable Control:** Per-pattern configuration UI. Manual single-point mode for corrections.
3. **Format Integrity:** Preserve each file format's structure and field alignment.
4. **Session Workflow:** Files stay in memory across multiple rename runs; export only when ready.

---

## 2. Core Logic & Architecture

### 2.1 Supported Point ID Format

**Dot-format only:**

```
[Family][Path].[Index]
  Family : G, P, or Q
  Path   : 01..10
  Index  : 001..998
```

Examples: `G01.001`, `P05.003`, `Q01.004`, `G10.998`

Any other ID format is ignored entirely.

### 2.2 Session Model

1. User uploads files → all files are read into memory (`uploadedFileEntries[]`).
2. Each entry stores `originalContent` (immutable) and `currentContent` (modified in place over runs).
3. The master file is selected from the same pool — its `originalContent` is always used to build the coordinate map.
4. Multiple rename runs accumulate changes on `currentContent`.
5. **Export TXT** downloads all modified files plus a rename log covering all runs in the session.
6. Selecting new files resets the session.

The app does not upload files, use analytics, store browser data, or make remote API calls.

### 2.3 Coordinate Map

Built from the selected Master file's `originalContent` on every rename run.
Stores `{ y, x }` per point ID string.

### 2.4 Pattern Detection

After building the coordinate map, `detectPatternsFromMaster()` iterates all keys and groups them by `patternKey` (e.g. `G05`, `P02`, `Q01`).
Each group reports: count, min index, max index, ordered list of IDs.

The UI renders one configuration block per detected pattern.

### 2.5 Pattern Mode (Normal Run)

For each detected pattern the user sets:
- **New Base Prefix** — e.g. `3560`
- **Start Point (###)** — index of the first point, e.g. `1`
- **QTY to Rename** — number of consecutive points to process
- **Start MQ Index** — starting MQ counter, e.g. `1`

**Session objects** are created per pattern. Each session tracks:
- `startOldId` — the first point ID to match, e.g. `G05.001`
- `startMq` — the configured MQ value for the start point
- `startPairIndex` — the source pair index of the configured start point
- `mqIndex` — current MQ counter
- `renamedCount` / `limit` — progress and cap
- `active` / `done` — state flags
- `lastSuffixCode` — for orphan-odd detection

Files are processed in order: master first, then others. The same session objects are passed through all files, so MQ state is continuous across files.

**Validation** is performed before any file is touched:
- Base prefix must not be empty.
- Start point must exist in the coordinate map and in the ordered list.
- QTY must not exceed available points from the start position.

### 2.6 Manual Mode (Single Point by `<LfNr>`)

Enabled by the **Manual start by `<LfNr>`** checkbox. Requires `.imes` or `.ipkt` master.

User provides:
- **Start `<LfNr>`** — row number in the master (e.g. `22` or `000022`)
- **Manual: New Point Name** — exact target name (e.g. `3560.MQ01.03`)

The tool:
1. Looks up the point ID at the given `<LfNr>` in the master.
2. Verifies the ID is in the coordinate map.
3. Renames exactly **that one point ID** across all session files (via `processSingleFileSinglePointRename`).

Useful for correcting individual points in an already-processed session without disturbing others.

### 2.7 Output Name Format

```
[BasePrefix].MQ[NN].[SuffixCode]
```

| Family | Index parity | SuffixCode |
|--------|-------------|------------|
| `P`    | Odd         | `01`       |
| `P`    | Even        | `02`       |
| `G`    | Odd         | `03`       |
| `G`    | Even        | `04`       |
| `Q`    | 1st in group of 4 | `03` |
| `Q`    | 2nd in group of 4 | `04` |
| `Q`    | 3rd in group of 4 | `01` |
| `Q`    | 4th in group of 4 | `02` |

Quadro mode uses four source points per MQ. `Q01.001` and `Q01.002` are rail-point positions; `Q01.003` and `Q01.004` are prism positions. Only the Quadro prism positions receive a `-0.04 m` height offset during rename.

### 2.8 MQ Numbering Rules

MQ numbering is based on the original source point pair index for `G` and `P`, and on the original source group-of-four index for `Q`, not only on the count of rows encountered in the current file.

```
G/P groupIndex = floor((sourceIndex - 1) / 2)
Q groupIndex   = floor((sourceIndex - 1) / 4)
mqIndex = startMq + groupIndex - startGroupIndex
```

This makes the tool correct when a file contains a partial measurement, such as the first part of a path and then the final part of the same path. For Quadro, skipped sections are represented by source indexes inside the same path: `Q01.001..Q01.004` maps to `MQ01`, `Q01.005..Q01.008` maps to `MQ02`, `Q01.037..Q01.040` maps to `MQ10`, and `Q01.045..Q01.048` maps to `MQ12`.

Example with Start Point `G01.001` and Start MQ `1`:

| Source ID | New MQ |
|-----------|--------|
| `G01.001` | `MQ01` |
| `G01.016` | `MQ08` |
| `G01.071` | `MQ36` |
| `G01.088` | `MQ44` |

### 2.9 State Machine (per session, per file)

1. **Idle** — scan lines until `id === session.startOldId`
2. **Active** — rename while `renamedCount < limit` and validation passes
3. **Done** — hard stop after `limit` renames; `session.done = true`

---

## 3. File-Format Rules

### 3.1 `.imes` / `.ipkt` (fixed-width pipe)

- ID field: space-padded token immediately before `|YXZ|`
- Coordinates extracted from `|YXZ| Y | X |` segment
- Replacement: right-align new name in original field width (pad left with spaces)
- `<LfNr>` is the first token before the first `|`

### 3.2 `.iroh` (tagged pipe)

- ID field: `PID:` tag inside `|`-delimited record
- Coordinates extracted from `Y:` and `X:` tags
- Replacement: right-align new name in `PID:` field
- **Never rename** lines with `CLS:STAT` or `CODE:iGeo` (station/header rows)
- **Never rename** lines without explicit numeric `Y:` and `X:` values

### 3.3 `.lqp` (space-delimited blocks)

- ID is first token on a measurement line
- Coordinate map is built from `-----`-separated blocks (ID on line 0, Y X on line 1)
- Measurement line guard: second and third tokens must be finite numbers in `0..400`
- Replacement: right-align new name to the end of the original ID column position

---

## 4. Safety Rules

- **Coordinate tolerance:** Y and X must match master within ± 0.05 m. Mismatches → skip with warning.
- **Pre-read file limits:** unsupported extensions are skipped before reading, each input file is capped at 10 MB, and the total selected session is capped at 30 MB.
- **Safe name components:** pattern base prefixes and export suffixes allow only letters, numbers, dot, underscore, and hyphen.
- **Hard QTY limit:** renaming stops exactly when `renamedCount === limit`.
- **Quadro height offset:** only Quadro prism positions receive a `-0.04 m` height adjustment.
- **Header protection:** `.iroh` station/header lines are never touched.
- **LQP guard:** shape check prevents renaming section headers or date lines.
- **Log limit:** capped at 400 lines to protect mobile memory.
- **Format preservation:** field widths are always preserved by padding.

---

## 5. UI

### Layout
- Vertical card-based layout (mobile-first, 1-column)
- 2-column grid on screens ≥ 600 px (tablet / desktop)
- Safe-area padding for modern phone browser viewports
- Sticky action row inside the configuration card for Rename and Export TXT
- Numeric mobile keyboard hints for numeric entry fields
- Auto-scrolling touch log for field feedback
- Content Security Policy metadata blocks network connections and object embedding
- Busy status while files are read or rename runs are active
- Export summary showing loaded files, modified files, and TXT log entries

### Session Card 1 — File Selection
- File upload input (multi-file)
- Master File dropdown (auto-selects `.imes`/`.ipkt` if present)

### Session Card 2 — Configuration
- **Detected Patterns** block (rendered dynamically per pattern from master)
  - Per-pattern: New Base Prefix, Start MQ, Start Point (###), QTY to Rename
- **Manual `<LfNr>` mode** checkbox + Start `<LfNr>` field
- **Manual: New Point Name** field (shown only when manual mode active)
- **Output Suffix** field
- **Rename** button
- **Export TXT** button

### Session Card 3 — Log
- Dark monospace console, 150 px height, scrollable
- Color-coded: green (success), yellow (warning), red (error)

---

## 6. Export

**Export TXT** button triggers:
1. Download each modified session file with suffix appended to filename.
2. Download a `.txt` rename log:
   - Header: app name + ISO timestamp
   - One line per rename: `filename|oldId -> newName`
   - Named after master file: `<masterBaseName>_log.txt`

---

## 7. Implementation Status

- [x] Dot-format ID parsing: `G01.001..G10.998`, `P01.001..P10.998`, `Q01.001..Q10.998`
- [x] Quadro mode: four source points per MQ with prism-only `-0.04 m` height offset
- [x] Per-pattern dynamic UI configuration
- [x] Session-based multi-run architecture (files in memory)
- [x] Pattern mode: multi-pattern, multi-file processing
- [x] Manual `<LfNr>` mode: single-point rename across all session files
- [x] Coordinate validation (± 0.05 m)
- [x] Source-pair MQ numbering for partial measurements with skipped ranges
- [x] Hard QTY limit per pattern session
- [x] Format-preserving replacement for `.imes/.ipkt`, `.iroh`, `.lqp`
- [x] Header/station protection for `.iroh`
- [x] LQP measurement-line guard
- [x] TXT rename log export
- [x] Log memory cap (400 lines)
- [x] Mobile CSS (touch-friendly inputs, fat buttons, 16 px font)
- [x] Busy state and visible export summary for smartphone workflows
- [x] Single-file distribution (`Punkt-Name-Changer.html`)
- [x] Multi-file distribution (`index.html` + `css/` + `js/`)
- [x] Regression validation suite (`tests/run_validation.py`)
- [x] Generated single-file build script writes only to `dist/`
