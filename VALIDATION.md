# Validation Notes

## Automated checks

Run the project checks after every functional or build change. Python 3 and
Node.js must be installed (Node runs the JavaScript syntax check):

```bash
python tests/run_validation.py
```

The suite validates:

- Required split sources, documentation, and the generated field file.
- JavaScript syntax.
- Presence of the IPKT parsing, MQ/EX mapping, duplicate-coordinate, fixed-width
  replacement, quadro correction, and export logic.
- Stale-export protection, delayed download URL revocation, and rejection of
  final names shared by different groups.
- Local-only Content Security Policy controls.
- Shared GeoField header, footer, glyphs, panels, theme tokens, and mobile overflow
  safeguards.
- Deterministic rebuilding of `IPKT-Group-Path-Renamer.html`.
- English-only project text.
- Presence of the detailed mission and function reference.

## What automation does not cover

- Behavior on real field files from every instrument and firmware version.
- Browser-specific download behavior, especially on phones.
- Whether the chosen configuration matches what the crew actually measured.

## Manual field checklist

Run this on a representative file before relying on a new build:

1. Discover groups and confirm the group names, counts, and index ranges match
   the file.
2. Confirm the duplicate report matches known repeat measurements.
3. Check the MQ line: gaps and bridges appear where the track has them.
4. Build, then compare the TXT report with the file for a few lines per group.
5. Diff the source and renamed IPKT: only Point ID fields and Q/QL prism
   heights may differ, and column alignment must be unchanged.
6. Change one setting and confirm the downloads disappear until rebuilt.
7. Repeat steps 1 and 5 on a phone browser with the single field file.
