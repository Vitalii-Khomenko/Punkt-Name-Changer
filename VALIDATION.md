# Validation Notes

Run the project checks after every functional or build change:

```bash
python tests/run_validation.py
```

The suite validates:

- Required split sources and the generated field file.
- JavaScript syntax.
- IPKT parsing, arbitrary source-group discovery, MQ/EX mapping, duplicate
  coordinate reporting, fixed-width byte replacement, and export markers.
- Local-only Content Security Policy controls.
- GeoMonitoring color tokens, focus visibility, 44 px touch targets, and
  mobile overflow safeguards.
- Deterministic rebuilding of `IPKT-Group-Path-Renamer.html`.
- English-only project text.
- Presence of the detailed mission and function reference.

The automated checks do not replace review of real Leica files before
production use.
