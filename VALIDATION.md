# Validation Notes

The current test suite is a regression suite for the live browser
implementation. It mirrors the active renaming rules in Python so the suite can
run without Node, a browser driver, or network access.

Run validation with:

```bash
python tests/run_validation.py
```

## Current Regression Cases

| Case | Expected behavior |
| --- | --- |
| Partial `.ipkt` measurement with a source gap | `G01.001` starts at `MQ01`, while `G01.071` maps to `MQ36` when the configured start is `G01.001` / `MQ01`. |
| Offset start point | If the configured start point is `G01.071` / `MQ01`, then `G01.071` maps to `MQ01` and `G01.078` maps to `MQ04`. |
| Split and single-file parity | Both implementations contain the source-pair MQ helper and session start-pair metadata. |
| Single-file sync | The single-file CSS matches `css/style.css`, and split JS function definitions are represented in the single-file build. |
| Security hardening | Both implementations keep pre-read file filtering, size limits, safe prefix validation, and safe suffix validation. |
| CSP/privacy hardening | HTML files include CSP metadata, and README/SECURITY document local-only privacy guarantees. |
| Coordinate safety | Regression coverage checks mismatch/guard skip behavior across `.ipkt`, `.iroh`, and `.lqp`. |
| Busy/export UX | Both implementations keep busy status helpers and visible export summary UI. |
| Generated build isolation | The generated single-file build script writes only to `dist/` and keeps the smartphone field file untouched. |
| Project publishing rules | AGENTS.md and rules.txt require validation, commit, and push to GitHub after functional updates. |

## Important Limitation

These tests protect current renaming behavior. They are not a replacement for
manual review of real Leica exports before production use.
