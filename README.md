# IPKT Group Path Renamer

A local, browser-based tool that turns field-assigned Leica IPKT point names into
structured track measurement names such as `3560.MQ08.3`, without touching any
other byte of the file.

Files stay in browser memory and are never uploaded.

## Why it exists

Survey crews name points in the field by measurement session (`101.7`,
`G101.19`, `2505.1.EX.14`). Downstream processing needs names that say where on
the track a point belongs and which physical point it is: the measurement
cross-section (MQ) and the position inside it.

Renaming by hand is slow and error-prone, because the right MQ number is not the
row count. Sections get skipped, bridges have no points, extra (`.EX`) points
have no regular index, quadro prisms need a height correction, and every new ID
must still fit the original fixed-width column. One mistake can shift the
numbering of a whole path and is often found only after leaving the site.

This tool does the conversion deterministically and shows its reasoning before
anything is exported. The full background, goals, and non-goals are in
[`Mission.md`](Mission.md).

## What it does

- Discovers arbitrary point groups from the Point IDs in the file.
- Maps each group to a path type: `G` (rail), `P` (prism), `Q` (quadro), or `QL`.
- Numbers MQs from original source indexes, plus coordinate-detected gaps.
- Recognizes bridges so long spans are not mistaken for missing sections.
- Anchors `.EX` groups to the nearest prism or rail MQ by coordinates.
- Applies the -0.04 m height correction to quadro prism positions only.
- Reports duplicate coordinates within a chosen tolerance.
- Preserves the original fixed-width layout and field alignment.

## Quick start

1. Open `IPKT-Group-Path-Renamer.html` in any modern browser (works offline).
2. Select one `.ipkt` file (up to 10 MB), set the duplicate tolerance, and
   choose Discover Point Groups.
3. Enable the groups to process and set each one's type, path number, prefix,
   and start MQ.
4. Review the MQ line, inferred gaps, bridges, and duplicate results.
5. Choose Build Renamed IPKT, then download the normalized IPKT, renamed IPKT,
   TXT report, and optional duplicate report.

Changing any setting after a build hides the downloads until you build again.

## Example

A group configured as `P`, path 1, prefix `3560`, start MQ 1:

```text
101.1  ->  P01.001  ->  3560.MQ01.1
101.2  ->  P01.002  ->  3560.MQ01.2
101.3  ->  P01.003  ->  3560.MQ02.1
101.4  ->  P01.004  ->  3560.MQ02.2
```

The first name is the field ID, the second is the normalized intermediate, and
the third is the final MQ name. More examples, including gaps, bridges, quadro,
and EX points, are in `Mission.md`.

## Documentation

- [`Mission.md`](Mission.md) — why the project exists, glossary, data model,
  workflow, naming rules, MQ planning, bridges, EX anchoring, byte
  preservation, exports, limitations, and architecture.
- [`Function.txt`](Function.txt) — function-by-function reference for `app.js`
  and `build.py`.
- [`VALIDATION.md`](VALIDATION.md) — automated coverage and a manual field
  checklist.
- [`SECURITY.md`](SECURITY.md) — local-processing and input/output safety model.

## Repository layout

- `index.html` — canonical split HTML.
- `style.css` — tool-specific components on top of the GeoField design.
- `shared/` — vendored GeoField front end (`site.css`, `app.css`, `site.js`, fonts,
  favicon); see `shared/README.md`.
- `app.js` — parsing, configuration, renaming, duplicate checking, and export.
- `build.py` — deterministic single-file builder.
- `IPKT-Group-Path-Renamer.html` — generated self-contained field file.
- `tests/run_validation.py` — regression and project-invariant checks.

Open `index.html` during development. Copy `IPKT-Group-Path-Renamer.html` to a
phone or field computer when a single offline file is preferable.

## Design and GeoField integration

The page uses the GeoField interface and belongs to the GeoField section: the
shared header (`airwitech | geofield`, GeoField marked current, theme toggle), the
shared footer, the dark and light themes, the self-hosted fonts, the panels,
drop zone, tables, pixel glyphs (`tripod`, `network`, `bars`), and the meteor
field all come from the vendored `shared/` files, which are copies of the
Field Checker repository's `web/static` front end.

To integrate the tool into the GeoField site later:

1. Keep the GeoField site's own header, footer, `site.css`, `app.css`, and `site.js`.
2. Take the content of `<main>` in `index.html` as the page body.
3. Add the contents of `style.css` after `app.css`, and `app.js` after the shared
   script. The tool needs no backend.
4. Keep the element IDs: `app.js` finds every control by ID.

## Development

Requirements: Python 3 and Node.js (Node is used for the JavaScript syntax
check). There are no runtime dependencies and no backend.

Edit only `index.html`, `style.css`, and `app.js`, then rebuild the field file:

```bash
python build.py
```

The builder inlines both stylesheets, both scripts, the fonts, and the favicon,
adjusts the Content Security Policy for inline assets, and replaces
`IPKT-Group-Path-Renamer.html`.

Run the checks after every change:

```bash
python tests/run_validation.py
```

Validation covers JavaScript syntax, required renaming behavior, local-only
security controls, GeoField design invariants, and exact split-to-field
build parity. Always review output from real Leica files before production use.

## License

MIT License

## Hosting

The page is served at <https://geofield.airwitech.com/ipkt-renamer/> by a small static
container maintained in the Airwitech website repository (`geofield-tools/`), which vendors
this repository's `index.html`, `style.css`, `app.js`, and `shared/` files (never the IPKT
sample files, which are ignored by Git). After a change here, run
`tools/sync-geofield-tools.ps1` in that repository and redeploy. The header carries the
shared Airwitech navigation (including HiFi) and a slim GeoField tool bar.
