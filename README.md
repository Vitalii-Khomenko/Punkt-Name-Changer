# IPKT Group Path Renamer

A local, browser-based Leica IPKT tool that discovers arbitrary point groups,
maps them to measurement paths, checks duplicate coordinates, and exports
normalized or final MQ point names.

Files remain in browser memory and are never uploaded.

## Files

- `index.html` — canonical split HTML.
- `style.css` — GeoMonitoring design-system presentation.
- `app.js` — parsing, configuration, renaming, duplicate checking, and export.
- `build.py` — deterministic single-file builder.
- `IPKT-Group-Path-Renamer.html` — generated self-contained field file.

Open `index.html` during development. Copy
`IPKT-Group-Path-Renamer.html` to a phone or field computer when a single
offline-capable file is preferable.

## Build

After changing any split source, rebuild the field file:

```bash
python build.py
```

The builder inlines `style.css` and `app.js`, adjusts the Content Security
Policy for inline assets, and replaces `IPKT-Group-Path-Renamer.html`.

## Validation

Run:

```bash
python tests/run_validation.py
```

Validation checks JavaScript syntax, required renaming behavior, local-only
security controls, GeoMonitoring interface invariants, and exact split-to-field
build parity.

## License

MIT License
