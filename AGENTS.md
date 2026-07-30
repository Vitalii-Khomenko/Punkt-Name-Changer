# Project Instructions

## Language

Use English only in UI text, documentation, comments, script output, commits,
pull requests, issues, and generated examples.

## Active Application

- `IPKT-Group-Path-Renamer.html` is the generated self-contained field file.
- `index.html`, `style.css`, and `app.js` are the canonical split sources.
- `build.py` must deterministically rebuild the field file from those sources.
- Do not add a backend; keep processing local and offline-capable.
- Preserve IPKT parsing, normalized IPKT, renamed IPKT, duplicate TXT, and
  rename-report TXT workflows.
- Preserve original fixed-width formatting and field alignment.
- Keep MQ numbering based on original source indexes and coordinate-aware gaps.
- Keep explicit EX coordinate anchoring and bridge handling.
- Follow the GeoMonitoring Interface Standard already represented by the CSS
  design tokens and responsive component rules.

## Workflow

- Update documentation after functional changes.
- Keep `Mission.md` and `Function.txt` aligned with active logic.
- Run `python tests/run_validation.py` after functional changes.
- Commit and push completed functional changes to GitHub.
- Keep comments and developer notes concise and accurate.
