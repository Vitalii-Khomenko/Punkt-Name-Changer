# Mission: IPKT Group Path Renamer

## 1. Why this project exists

### 1.1 Context

Track survey crews measure points with a total station or GNSS receiver and receive an IPKT
file: a fixed-width text file with one line per measured point. Each line carries
a Point ID, Y, X, and height. The Point IDs are typed or generated in the field,
so they describe the measurement session, not the final project structure.
Typical field IDs look like this:

```text
101.7
G101.19
2505.1.01
2505.1.EX.14
```

The office and the downstream processing expect something different: a
structured ID that says where along the track a point belongs and which physical
point of that location it is:

```text
<prefix>.MQ<nn>.<suffix>        for example 3560.MQ08.3
<prefix>.MQ<n>-<position>       for example 3560.MQ12-2 (explicit EX points)
```

Here an MQ is a numbered measurement cross-section along the track, and the
suffix identifies the point inside that cross-section (prism or rail side,
quadro corner).

Turning the first kind of ID into the second is the whole job of this tool.

### 1.2 The problem

Doing this conversion by hand, or with a generic find-and-replace, is slow and
unreliable because the correct MQ number is not simply "the Nth row":

- **Partial measurements.** A crew may skip sections, start in the middle of a
  track, or measure a path in several sessions. The MQ number must follow the
  real position, not the row count.
- **Gaps visible only in coordinates.** Sometimes a whole section was never
  measured and the source index shows no gap, but the coordinates show a long
  jump between two neighbors. The missing MQs must still be reserved so later
  sections keep their true numbers.
- **Bridges.** On a bridge no points are measured. A long coordinate span there
  is expected and must not be mistaken for missing sections.
- **EX points.** Extra points (`.EX`) have no regular index. Their place is
  defined only by where they are, so they must be anchored to the nearest
  measured prism or rail section by coordinates.
- **Per-type suffix rules.** Rail, prism, quadro, and quadro-line groups all use
  different suffix orders and section sizes.
- **Quadro prism heights.** Certain quadro positions need a fixed -0.04 m height
  correction, applied to those points only.
- **Fixed-width format.** A renamed ID must stay inside its original column so
  every other byte of the file, and every field alignment, is unchanged. A
  naive rewrite can shift columns and corrupt the file for later tools.
- **Duplicate coordinates.** Accidental repeat measurements are easy to miss in
  hundreds of lines and should be reported before the data is renamed.

A single mistake silently corrupts the numbering of a whole path, and it is
usually found late, after the crew has left the site.

### 1.3 How this tool answers the problem

| Need | Design decision |
| --- | --- |
| Correct numbering after partial or irregular measurement | MQ numbers come from original source indexes plus coordinate-aware gaps; they are never a row count. |
| Trust before export | Everything the tool infers is shown first: groups, proposed names, MQ line, gaps, bridges, EX anchors, duplicates. |
| Traceability | A rename report lists every configuration and every `source -> normalized -> final` mapping per line. |
| Safe re-runs | The normalized IPKT (`G01.001`, `P02.001`, ...) is a stable intermediate that does not depend on the project prefix. |
| No damage to the file | Output starts as a byte-for-byte clone; only the Point ID field (and Q/QL prism heights) change. |
| Field use without connectivity | One self-contained HTML file, no backend, no install, works offline on a phone or laptop. |
| Confidential survey data | Files stay in browser memory and are never uploaded; the Content Security Policy blocks network connections. |
| Fewer silent failures | Conflicts, invalid ranges, overflowing fields, and ambiguous names stop the export with a visible message. |

### 1.4 Users and environments

- Survey technicians checking and renaming data on site, often on a phone with
  gloves, bright light, and a poor connection.
- Office staff preparing deliveries from the same files on a laptop.
- Reviewers who need evidence of how every name was produced.

### 1.5 Goals

- Produce correct, reviewable MQ names for G, P, Q, QL, and EX point families.
- Preserve the original file layout everywhere except intended fields.
- Run entirely locally, offline, in one browser tab.
- Stay usable on a 320 px wide phone screen.
- Keep behavior deterministic: the same file and settings always give the same
  output.

### 1.6 Non-goals

- No backend, accounts, cloud storage, analytics, or remote API.
- No editing of coordinates; heights change only for the Quadro correction.
- No guessing when evidence is missing; the tool rejects instead (for example an
  EX group with no anchor).
- No support for formats other than IPKT `|YXZ|` lines.
- Not a replacement for reviewing real output before production use.

### 1.7 Success criteria

- A technician can load a file, review the proposed MQ line, and export without
  hand-editing a single Point ID.
- The renamed file differs from the source only in Point ID fields and
  Quadro prism heights.
- Every inferred decision can be traced in the screen preview or TXT report.
- Invalid or ambiguous setups never produce an export.

## 2. Glossary

| Term | Meaning |
| --- | --- |
| IPKT | Fixed-width point text file; only lines containing `|YXZ|` are used. |
| Point ID | The fixed-width field immediately before `|YXZ|`. |
| Source group | Everything before the final numeric segment of a Point ID. |
| Source index | The final numeric segment (1 to 998) of a Point ID. |
| MQ | Measurement cross-section: a numbered position along the track. |
| Section | The set of source records belonging to one MQ: 2 for G/P, 4 for Q/QL. |
| G / P | Rail path / prism path, two records per MQ. |
| Q / QL | Quadro / quadro line, four records per MQ. |
| EX | Extra points whose group name ends in `.EX`; placed by coordinates. |
| Bridge | A stretch where long spans between measured sections are expected. |
| Normalized IPKT | Intermediate output with IDs such as `G01.001`. |
| Final IPKT | Output with IDs such as `3560.MQ08.3`. |

## 3. Distribution and source architecture

The canonical maintainable sources are:

- `index.html` for semantic workflow markup.
- `style.css` for the tool-specific components (forms, table, MQ schematic).
- `shared/` for the vendored GeoField front end: `site.css`, `app.css`, `site.js`,
  fonts, and favicon (copies from the Field Checker repository; see
  `shared/README.md`).
- `app.js` for all runtime logic.

`python build.py` deterministically inlines both stylesheets, both scripts, the
fonts, and the favicon (as data URIs) into
`IPKT-Group-Path-Renamer.html`. The generated file is the portable field
distribution and must remain behaviorally identical to the split sources.

All processing happens in one browser tab. There is no backend, dependency
bundle, remote API, analytics, or cookie. The shared front end stores one value,
the light or dark theme choice, in the browser; it never stores file data.

## 4. Input model

### 4.1 Supported file

The active application accepts one `.ipkt` file up to 10 MB. Lines may end in LF
or CRLF.

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

### 4.2 Source-group discovery

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

## 5. Workflow state

The browser keeps five main state values:

1. Selected source File.
2. Immutable source bytes.
3. Discovered groups and records.
4. Latest generated outputs.
5. Latest duplicate-coordinate analysis.

Changing the selected file or pressing Clear invalidates all derived state.
Editing any group configuration field or pressing Apply Default Prefix
invalidates the latest renamed output and hides the export card until Build
Renamed IPKT is run again, so a download always matches the visible settings.
Downloads are enabled only after the corresponding analysis or build exists.

## 6. Duplicate-coordinate analysis

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

## 7. Measurement configuration

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

## 8. Source-index MQ numbering

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

## 9. Coordinate-aware MQ planning

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

Example with a normal step of 3 m: two neighboring sections whose centers are
9.1 m apart give `coordinateAdvance = round(3.03) = 3`. If the source indexes
are consecutive (`sourceAdvance = 1`), the later section is numbered three MQs
after the earlier one and two MQs are reported as skipped.

The plan is calculated in both directions around the configured start section.
Any result below MQ01 is rejected.

## 10. Bridge detection

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

Example with Bridge min 9 m and Bridge approach max 2.5 m: spans of
2.4 m, 14.0 m, and 2.3 m form a bridge. The 14.0 m span would otherwise add
`round(14 / 3) = 5` MQs, but as a bridge it advances only by the source index.

## 11. Explicit EX mapping

### 11.1 Anchor selection

For a source group ending in `.EX`, the first EX record with valid coordinates
is compared with every planned section center from enabled non-EX `P` and `G`
groups.

The nearest section becomes the starting MQ anchor. If distances are equal, a
candidate from the same source family is preferred.

Export is rejected when no configured prism or rail anchor is available. The
tool never silently starts an unanchored EX group at MQ01.

### 11.2 Position and bridge rules

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

The MQ index in EX names is not zero-padded. The schematic distinguishes
measured positions, missing positions, bridge-side positions, and reserved
bridge MQs.

## 12. Output construction

### 12.1 Normalized IPKT

Ordinary configured groups become:

```text
G01.001
P02.001
Q03.001
QL04.001
```

Explicit EX groups use their planned final EX names because they have no
ordinary normalized path mapping.

### 12.2 Final renamed IPKT

Ordinary groups become:

```text
<base prefix>.MQ<two-digit-or-longer MQ>.<suffix>
```

EX groups use the hyphenated position format described above.

### 12.3 Fixed-width preservation

The output begins as a clone of the original byte array. For each PointID:

1. Confirm the new ASCII name fits the original field width.
2. Fill only that original field with ASCII spaces.
3. Right-align the new name at the original field end.

No other source bytes are rewritten.

### 12.4 Quadro height correction

Only prism positions receive `-0.04 m`:

- Q positions 3 and 4.
- QL positions 1 and 4.

The adjusted value preserves the fixed-width height field and at least the
original decimal precision. Export fails if it cannot fit.

## 13. Worked example

Source lines for one group, configured as `P` path 1, prefix `3560`, start MQ 1:

```text
101.1  ->  P01.001  ->  3560.MQ01.1
101.2  ->  P01.002  ->  3560.MQ01.2
101.3  ->  P01.003  ->  3560.MQ02.1
101.4  ->  P01.004  ->  3560.MQ02.2
```

The same group configured as `Q` follows the quadro suffix order. The height
correction follows the source position within the section (positions 3 and 4),
not the output suffix:

```text
101.1  ->  3560.MQ01.3
101.2  ->  3560.MQ01.4
101.3  ->  3560.MQ01.1   (height -0.04 m, for example 34.63268 -> 34.59268)
101.4  ->  3560.MQ01.2   (height -0.04 m)
```

An `.EX` group with prefix `3560` anchored at MQ12 maps as:

```text
101.EX.01 -> 3560.MQ12-1
101.EX.04 -> 3560.MQ12-4
101.EX.05 -> 3560.MQ13-1
```

## 14. Exports

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

All downloads use temporary browser object URLs and remain local. The URL is
revoked after a delay so slow mobile downloads can finish.

## 15. Interface requirements

The interface follows the GeoField design (the Airwitech design as applied by
the Field Checker pages) and is part of the GeoField site:

- The shared header (`airwitech | geofield` wordmark, site navigation with
  GeoField marked current, theme toggle) and footer, identical to every other
  Airwitech page, with the meteor field and light/dark themes.
- A compact hero with the GeoField glyphs, a row of numbered step cards, and a
  visible local-processing statement.
- Numbered panels for the source, processing, quality-check, and result stages,
  each with the coloured line of the GeoField panel.
- One dominant action in each stage.
- 44 px minimum standard controls and visible focus rings.
- Semantic labels, headings, and polite live status.
- Horizontally scrollable data tables with phone guidance.
- No page-level horizontal overflow at 320 px.
- Reduced-motion preference support.

## 16. Security and failure behavior

- Reject missing files, non-IPKT extensions, and inputs over 10 MB.
- Accept duplicate tolerance only from 0 to 1 m.
- Permit only letters, numbers, dot, underscore, and hyphen in output prefixes.
- Reject incomplete or conflicting configurations.
- Reject invalid distance relationships.
- Reject output below MQ01.
- Reject final names that two different source groups would both receive.
- Reject names or heights that exceed original field widths.
- Keep Content Security Policy network connections disabled.
- Show normal validation errors in the page rather than blocking dialogs.

## 17. Assumptions and limitations

- Only lines containing `|YXZ|` are read; all other lines pass through unchanged.
- Source indexes must be from 1 to 998; other Point IDs are skipped and counted.
- Section centers use Y/X only; height does not influence planning.
- EX groups anchor only to enabled `P` and `G` groups.
- Names must fit the original Point ID field; the tool never widens a column.
- The tool cannot know which MQ a crew intended; it infers from indexes and
  coordinates and shows the result for review.
- Automated tests do not replace review of real field files before production
  use.

## 18. Maintenance rules

- Edit only the split sources.
- Run `python build.py` after source changes.
- Run `python tests/run_validation.py`.
- Keep the generated field file synchronized and deterministic.
- Update this document and `Function.txt` when logic changes.
