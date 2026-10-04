# Project Instructions

## Language

Use English only in UI text, documentation, comments, script output, commits,
pull requests, issues, and generated examples.

## Active Application

- `IPKT-Group-Path-Renamer.html` is the generated self-contained field file.
- `index.html`, `style.css`, and `app.js` are the canonical split sources, plus
  the vendored GeoField front end in `shared/`.
- `build.py` must deterministically rebuild the field file from those sources,
  inlining the shared CSS, JavaScript, fonts, and favicon.
- Do not add a backend; keep processing local and offline-capable.
- Preserve IPKT parsing, normalized IPKT, renamed IPKT, duplicate TXT, and
  rename-report TXT workflows.
- Preserve original fixed-width formatting and field alignment.
- Keep MQ numbering based on original source indexes and coordinate-aware gaps.
- Keep explicit EX coordinate anchoring and bridge handling.
- Follow the GeoField interface (the Field Checker `web/static` files, with the
  Airwitech design behind them). The page is part of the GeoField site: it uses
  the same header and footer as every Airwitech page (`geofield` wordmark tag,
  GeoField marked `aria-current="page"`, theme toggle), the GeoField hero
  glyphs (`tripod`, `network`, `bars`), and the vendored front end in `shared/`.
- Do not edit `shared/`; copy updated files from the Field Checker repository.
  Put tool-specific styles in `style.css` only.

## Workflow

- Update documentation after functional changes.
- Keep `Mission.md` and `Function.txt` aligned with active logic.
- Run `python tests/run_validation.py` after functional changes.
- Commit and push completed functional changes to GitHub.
- Keep comments and developer notes concise and accurate.
