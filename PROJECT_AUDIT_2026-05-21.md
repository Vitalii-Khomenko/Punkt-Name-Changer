# PunktNameChanger Project Audit

Date: 2026-05-21  
Scope: `index_singlefile_mobile.html`, split `index.html` + `css/` + `js/`, documentation, validation suite, publishing rules, and local browser security posture.  
Audit type: Code and cybersecurity review for a client-side Leica point renaming tool.

## Remediation Update

The first three audit findings were addressed after this report was created:

- Pre-read file filtering now skips unsupported extensions, files over 10 MB, and selections that would exceed 30 MB total.
- Pattern `New Base Prefix` now accepts only letters, numbers, dot, underscore, and hyphen.
- `Output Suffix` now accepts only letters, numbers, dot, underscore, and hyphen.

The next three audit items were also addressed:

- HTML files now include Content Security Policy metadata. The split build uses same-origin scripts/styles, while the single-file field build permits inline code only because it must remain self-contained.
- README and `SECURITY.md` now document local-only privacy behavior and hosted deployment guidance.
- The validation suite now checks stronger single-file/split-source synchronization by comparing CSS and verifying split JS function definitions are represented in the single-file build.

## Executive Summary

PunktNameChanger is a local, browser-only field tool for renaming Leica survey point IDs. The current architecture is appropriate for smartphone field use: files are read locally, processed in memory, and exported back through browser downloads. The app does not send files to a server, does not use cookies or browser storage, and does not load third-party JavaScript.

Overall security posture: **Good for local/offline field use**.

Main residual risks are operational rather than remote-exploit risks:

- Coordinate-mismatch behavior should receive broader regression coverage across every supported format.
- Long-running file reads and rename runs could benefit from disabled/loading UI states.

No critical remote-code-execution, network exfiltration, credential handling, or obvious DOM-XSS issue was found in the reviewed code.

## Validation Run

The regression suite was run successfully:

```text
python tests/run_validation.py

Ran 12 tests
OK
```

The suite currently protects:

- Partial `.ipkt` source-gap MQ numbering.
- Offset start-point MQ behavior.
- Split/single-file implementation parity for MQ helpers.
- Single-file CSS and split JS function synchronization checks.
- Mobile UI helpers.
- CSP and privacy documentation.
- Required project files.
- MIT license presence.
- Publishing rules requiring validation, commit, and GitHub push.

## Architecture Review

### Strengths

- Client-side only: no backend, API token, server endpoint, or remote processing is used.
- `index_singlefile_mobile.html` remains self-contained for smartphone field use.
- Split implementation keeps maintainable source files in `js/` and `css/`.
- No package manager runtime dependency is required by the app.
- No third-party CDN or external script is loaded by the single-file mobile app.
- Files remain in browser memory and are exported with local `Blob` downloads.
- Object URLs are revoked after download.
- The on-screen log uses `textContent`, not HTML injection.

### Maintainability Notes

- The single-file and split-file versions duplicate logic. This is intentional for field distribution, but every logic change must be applied to both versions.
- The validation suite now compares the single-file CSS with `css/style.css` and verifies split JS function definitions are represented in the single-file build.
- Future work could generate the single-file HTML from split sources to reduce manual update effort, but that would add tooling complexity.

## Cybersecurity Review

### Data Privacy

Risk level: **Low**

Observed behavior:

- Leica files are read with `FileReader.readAsText`.
- No `fetch`, `XMLHttpRequest`, `WebSocket`, analytics, cookies, localStorage, or sessionStorage usage was found.
- No external network dependency was found in the app.

Assessment:

Survey data stays local to the browser session. This is a strong privacy property for field use.

Recommendation:

- Keep the app offline-capable and avoid adding analytics, telemetry, or remote file upload features.

### DOM Injection / XSS

Risk level: **Low**

Observed behavior:

- Dynamic UI is mostly built with `document.createElement`.
- User/file-derived text is placed through `textContent` or option `.text`, which is safe.
- `innerHTML` is used for clearing containers and for one constant placeholder option only.
- No `eval`, `new Function`, `document.write`, or dynamic script loading was found.

Assessment:

No practical DOM-XSS path was identified in the reviewed code.

Recommendation:

- Continue using `textContent` and `createElement`.
- Avoid adding HTML rendering for file names, point IDs, logs, or report content.

### File Input Handling

Risk level: **Resolved**

Observed behavior:

- The file input uses `accept=".imes,.ipkt,.iroh,.lqp,.txt"`.
- Unsupported extensions are skipped before reading.
- Files over 10 MB are skipped before reading.
- The total accepted session is capped at 30 MB.
- Skipped files are reported in the log.

Assessment:

The original mobile-memory risk is addressed for normal field use.

### Output Name and Format Integrity

Risk level: **Resolved**

Observed behavior:

- Manual new point names reject whitespace and `|`.
- Pattern-mode `New Base Prefix` accepts only letters, numbers, dot, underscore, and hyphen.
- Export suffix accepts only letters, numbers, dot, underscore, and hyphen.
- Output file names are assigned through `a.download`, not written to disk directly.

Assessment:

The original format-integrity risk is addressed.

### Coordinate Safety

Risk level: **Low**

Observed behavior:

- Candidate renames are checked against the master coordinate map.
- Coordinate tolerance is `0.05 m`.
- `.iroh` station/header rows are protected.
- `.lqp` processing uses measurement-line guards.
- Pattern runs stop at the configured QTY limit.

Assessment:

The tool has meaningful protections against accidental wrong-point renames.

Recommendation:

- Keep coordinate validation mandatory.
- Add regression tests for coordinate mismatch skips in each supported format.

### Download / Blob Handling

Risk level: **Low**

Observed behavior:

- Downloads are created with `Blob` and `URL.createObjectURL`.
- Object URLs are revoked after the click.
- Download content is text generated from the current in-memory session.

Assessment:

The current download pattern is appropriate for a local browser app.

Recommendation:

- Keep revoking object URLs.
- Sanitize generated filenames if suffix validation is added.

### Content Security Policy

Risk level: **Resolved for current deployment model**

Observed behavior:

- `index.html` includes CSP metadata that allows same-origin scripts/styles and blocks network connections, object embedding, base URI changes, and form submission.
- `index_singlefile_mobile.html` includes CSP metadata that allows inline scripts/styles because it must remain self-contained, while still blocking network connections, object embedding, base URI changes, and form submission.
- `SECURITY.md` documents recommended hosted HTTP headers.

Assessment:

The original hosted-hardening gap is addressed at the HTML metadata and documentation level.

## Mobile Field UX Review

Risk level: **Low**

Strengths:

- Touch-sized controls are used.
- Numeric inputs request numeric keyboards where possible.
- Action buttons are sticky inside the configuration card.
- The log auto-scrolls and supports touch momentum scrolling.
- Safe-area padding is enabled.

Recommendations:

- Add disabled/loading states during long file reads and rename runs.
- Add a visible summary before export showing how many files changed.
- Consider a "Clear session" button for field workflows where users need an explicit reset.

## Documentation and Repository Hygiene

Strengths:

- `README.md`, `Mission.md`, `Function.txt`, `VALIDATION.md`, `AGENTS.md`, and `rules.txt` document current behavior.
- MIT license is present.
- Project rules require validation, commit, and GitHub push after functional updates.
- `.gitignore` excludes common local artifacts.

Recommendations:

- Keep this audit updated after major logic changes.
- Keep `README.md` and `SECURITY.md` aligned with any future deployment changes.

## Findings

No open cybersecurity findings remain from this audit batch.

### Resolved Findings

| Severity | Finding | Resolution |
| --- | --- | --- |
| Medium | Files were read fully into memory before size validation. | Added pre-read extension, per-file size, and total-session size checks. |
| Medium | Pattern `New Base Prefix` validation was weaker than manual name validation. | Added a safe allowlist for pattern base prefixes. |
| Low | Export suffix was not constrained. | Added a safe allowlist for export suffixes. |
| Low | No CSP existed for hosted deployment. | Added CSP metadata and `SECURITY.md` deployment guidance. |
| Low | Split and single-file logic are duplicated. | Added stronger validation checks for CSS and JS function synchronization. |

## Suggested Next Hardening Tasks

1. Add regression tests for coordinate mismatch skips in `.imes/.ipkt`, `.iroh`, and `.lqp`.
2. Add disabled/loading states during long file reads and rename runs.
3. Add a visible changed-file summary before export.
4. Consider a future build script to generate `index_singlefile_mobile.html` from split sources.

## Audit Conclusion

The application is well suited for its current local smartphone workflow. Its strongest cybersecurity property is that survey files stay local and no network channel is used. The audit findings from the first two remediation passes have been addressed. The next useful work is quality and UX hardening: add broader coordinate-mismatch tests, add loading states, and make export summaries more explicit.
