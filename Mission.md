# Mission: IPKT Group Path Renamer

## 1. Purpose

The project provides one reliable, local-first browser tool for converting
arbitrary Leica IPKT point families into normalized path IDs and final MQ
names. It is intended for field and office use on phones and laptops without a
backend or upload service.

The application must make its decisions reviewable. Before export, the user
can see discovered source groups, configuration, inferred missing sections,
recognized bridges, automatic EX positions, duplicate coordinates, and the
proposed MQ line.

## 2. Distribution and source architecture

The canonical maintainable sources are:

- `index.html` for semantic workflow markup.
- `style.css` for the GeoMonitoring interface.
- `app.js` for all runtime logic.

`python build.py` deterministically inlines the CSS and JavaScript into
`IPKT-Group-Path-Renamer.html`. The generated file is the portable field
distribution and must remain behaviorally identical to the split sources.

All processing happens in one browser tab. There is no backend, dependency
bundle, remote API, analytics, cookie, or browser-storage requirement.

## 3. Input model

### 3.1 Supported file

The active application accepts one `.ipkt` file up to 10 MB.

Only records containing the ASCII marker `|YXZ|` participate in analysis. The
parser works on `Uint8Array` data so it can preserve every byte outside fields
that are intentionally replaced.

For each valid line, the parser records:

- LfNr from the first pipe-delimited field.
- PointID from the fixed-width field immediately before `|YXZ|`.
- Y, X, and height from the fields following `|YXZ|`.
- Source line number.
- Exact PointID byte start, end, and width.
- Exact height field start and end when present.

Malformed PointIDs can still participate in duplicate-coordinate analysis when
their Y and X values are valid, but they are excluded from group renaming.

### 3.2 Source-group discovery

A renameable PointID must end in a dot plus a numeric index from 1 to 998:

```text
<arbitrary source group>.<numeric index>
```

Examples:

```text
2505.1.01
101.7
G101.19
2505.1.EX.14
```

Everything before the final numeric segment is the source-group name. This
allows the tool to normalize project-specific names without requiring a fixed
input prefix.

A group whose name explicitly ends in `.EX` uses automatic EX planning.

## 4. Workflow state

The browser keeps five main state values:

1. Selected source File.
2. Immutable source bytes.
3. Discovered groups and records.
4. Latest generated outputs.
5. Latest duplicate-coordinate analysis.

Changing the selected file or pressing Clear invalidates all derived state.
Downloads are enabled only after the corresponding analysis or build exists.

## 5. Duplicate-coordinate analysis

The duplicate tolerance applies independently to Y and X:

```text
abs(left.Y - right.Y) <= tolerance
abs(left.X - right.X) <= tolerance
```

The default is 0.1 m and the accepted UI range is 0 to 1 m.

At zero tolerance, coordinates are grouped by exact Y/X keys. At nonzero
tolerance, records are assigned to spatial buckets and compared with records in
the surrounding cells. A union-find structure merges transitive matches into
duplicate groups.

The on-screen result and duplicate TXT report include:

- File name and generated date/time.
- Selected tolerance.
- Valid and skipped YXZ counts.
- Duplicate group and point counts.
- PointID, LfNr, source line, Y, X, and height.
- Full Y/X range per duplicate group.
- Every direct matching pair with component differences.

Duplicate analysis never modifies source bytes.

## 6. Measurement configuration

Each non-EX source group can be mapped to:

| Type | Meaning | Records per MQ | Suffix order |
| --- | --- | ---: | --- |
| `G` | Rail path | 2 | `3`, `4` |
| `P` | Prism path | 2 | `1`, `2` |
| `Q` | Quadro | 4 | `3`, `4`, `1`, `2` |
| `QL` | Quadro line | 4 | `1`, `3`, `4`, `2` |

The user configures:

- Whether the group is enabled.
- Measurement type.
- Target path number from 1 to 10.
- Final base prefix.
- Start MQ.
- Coordinate gap checking.
- Normal section step in meters.
- Optional bridge detection.
- Bridge minimum span.
- Maximum measured approach distance.

The start source index is the group's first discovered index and is retained as
hidden configuration. Its measured section must exist.

Two enabled groups cannot share the same normalized target path.

## 7. Source-index MQ numbering

MQ numbering is based on the original source section, not the count of rows
encountered:

```text
sectionSize = 2 for G/P, 4 for Q/QL
sectionIndex = floor((sourceIndex - 1) / sectionSize)
mqIndex = startMq + sectionIndex - startSectionIndex
```

This preserves real MQ locations in partial measurements.

Example for `G`, start source index 1, and start MQ 1:

```text
index 001 -> MQ01
index 016 -> MQ08
index 071 -> MQ36
index 088 -> MQ44
```

For Q/QL:

```text
001..004 -> MQ01
005..008 -> MQ02
037..040 -> MQ10
045..048 -> MQ12
```

## 8. Coordinate-aware MQ planning

Records are grouped into their source-index sections. The section coordinate is
the arithmetic mean of all records in that section that have finite Y/X.

For every consecutive measured section:

```text
sourceAdvance = right.sectionIndex - left.sectionIndex
coordinateAdvance = max(1, round(distance / normalStep))
mqAdvance = max(sourceAdvance, coordinateAdvance)
```

The larger advance wins. Coordinate evidence can reveal additional missing MQ
positions, but it can never compress a source-index gap.

The plan is calculated in both directions around the configured start section.
Any result below MQ01 is rejected.

## 9. Bridge detection

Bridge detection is optional for ordinary G/P/Q/QL groups.

A candidate is one long transition or a consecutive run of transitions whose
distances are each at least Bridge min. It becomes a recognized bridge only
when:

- A measured approach exists immediately before the complete long run.
- A measured approach exists immediately after the complete long run.
- Both approaches are no longer than Bridge approach max.

For recognized bridge transitions, coordinate-derived MQ skipping is
suppressed. Source-index advances remain intact. Multiple separately bounded
bridges can be recognized in one group and are listed individually in the
schematic and TXT report.

## 10. Explicit EX mapping

### 10.1 Anchor selection

For a source group ending in `.EX`, the first EX record with valid coordinates
is compared with every planned section center from enabled non-EX `P` and `G`
groups.

The nearest section becomes the starting MQ anchor. If distances are equal, a
candidate from the same source family is preferred.

Export is rejected when no configured prism or rail anchor is available. The
tool never silently starts an unanchored EX group at MQ01.

### 10.2 Position and bridge rules

EX records are sorted by original source index. Missing source indexes are kept
as empty positions so later records preserve their real position.

- Ordinary EX chunks use four positions per MQ.
- The last MQ before a detected EX bridge uses up to two positions.
- The first MQ after a detected EX bridge uses up to two positions.
- One MQ is reserved across each bridge.

The final EX format is:

```text
<editable prefix>.MQ<index>-<position>
```

The schematic distinguishes measured positions, missing positions, bridge-side
positions, and reserved bridge MQs.

## 11. Output construction

### 11.1 Normalized IPKT

Ordinary configured groups become:

```text
G01.001
P02.001
Q03.001
QL04.001
```

Explicit EX groups use their planned final EX names because they have no
ordinary normalized path mapping.

### 11.2 Final renamed IPKT

Ordinary groups become:

```text
<base prefix>.MQ<two-digit-or-longer MQ>.<suffix>
```

EX groups use the hyphenated position format described above.

### 11.3 Fixed-width preservation

The output begins as a clone of the original byte array. For each PointID:

1. Confirm the new ASCII name fits the original field width.
2. Fill only that original field with ASCII spaces.
3. Right-align the new name at the original field end.

No other source bytes are rewritten.

### 11.4 Quadro height correction

Only prism positions receive `-0.04 m`:

- Q positions 3 and 4.
- QL positions 1 and 4.

The adjusted value preserves the fixed-width height field and at least the
original decimal precision. Export fails if it cannot fit.

## 12. Exports

The application can produce:

- Normalized IPKT.
- Final renamed IPKT.
- Rename TXT report.
- Duplicate-coordinate TXT report.

The rename report records:

- Source file and generated date/time.
- Renamed record count.
- Every group configuration.
- Coordinate gaps and additional skipped MQs.
- Every detected bridge and its approaches.
- EX anchor and bridge reservation evidence.
- Line-by-line source, normalized, and final PointID mapping.

All downloads use temporary browser object URLs and remain local.

## 13. Interface requirements

The interface follows the GeoMonitoring standard:

- Dark technical product header and visible local-processing indicator.
- Separate source, processing, quality-check, and result stages.
- One dominant action in each stage.
- 44 px minimum standard controls and visible focus rings.
- Semantic labels, headings, and polite live status.
- Horizontally scrollable data tables with phone guidance.
- No page-level horizontal overflow at 320 px.
- Reduced-motion preference support.

## 14. Security and failure behavior

- Reject missing files, non-IPKT extensions, and inputs over 10 MB.
- Accept duplicate tolerance only from 0 to 1 m.
- Permit only letters, numbers, dot, underscore, and hyphen in output prefixes.
- Reject incomplete or conflicting configurations.
- Reject invalid distance relationships.
- Reject output below MQ01.
- Reject names or heights that exceed original field widths.
- Keep Content Security Policy network connections disabled.
- Show normal validation errors in the page rather than blocking dialogs.

## 15. Maintenance rules

- Edit only the split sources.
- Run `python build.py` after source changes.
- Run `python tests/run_validation.py`.
- Keep the generated field file synchronized and deterministic.
- Update this document and `Function.txt` when logic changes.
