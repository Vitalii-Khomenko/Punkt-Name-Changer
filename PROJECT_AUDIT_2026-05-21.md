# PunktNameChanger Project Audit

Date: 2026-05-21  
Scope: `index_singlefile_mobile.html`, split `index.html` + `css/` + `js/`, documentation, validation suite, publishing rules, and local browser security posture.  
Audit type: Code and cybersecurity review for a client-side Leica point renaming tool.

## Executive Summary

PunktNameChanger is a local, browser-only field tool for renaming Leica survey point IDs. The current architecture is appropriate for smartphone field use: files are read locally, processed in memory, and exported back through browser downloads. The app does not send files to a server, does not use cookies or browser storage, and does not load third-party JavaScript.

Overall security posture: **Good for local/offline field use**.

Main residual risks are operational rather than remote-exploit risks:

- Large or malformed input files can consume mobile memory because files are read fully into memory.
- Pattern-mode `New Base Prefix` and export suffix validation should be stricter to protect file formatting and output filenames.
- If the app is ever hosted on a website instead of opened locally, it should receive a Content Security Policy and related hardening headers.

No critical remote-code-execution, network exfiltration, credential handling, or obvious DOM-XSS issue was found in the reviewed code.

## Validation Run

The regression suite was run successfully:

```text
python tests/run_validation.py

Ran 9 tests
OK
```

The suite currently protects:

- Partial `.ipkt` source-gap MQ numbering.
- Offset start-point MQ behavior.
- Split/single-file implementation parity for MQ helpers.
- Mobile UI helpers.
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
- The new validation suite partially protects this parity.
- Future work could generate the single-file HTML from split sources to reduce drift, but that would add tooling complexity.

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

Risk level: **Medium**

Observed behavior:

- The file input uses `accept=".imes,.ipkt,.iroh,.lqp,.txt"`.
- Browser `accept` is advisory; users can still provide unexpected files.
- Files are read fully into memory before processing.
- A guard exists for very large newline-free content in `processSingleFileMultiPattern`, but file reading and master analysis happen before this guard.

Assessment:

This is not a remote security vulnerability, but on smartphones a very large or binary-like file can cause slowdowns, high memory use, or browser tab termination.

Recommendations:

1. Add a pre-read file size limit in `handleFileSelect`, for example 5-10 MB per file and a total session limit.
2. Reject unsupported extensions before reading file contents.
3. Show a clear log warning when a file is skipped for size or extension.

### Output Name and Format Integrity

Risk level: **Medium**

Observed behavior:

- Manual new point names reject whitespace and `|`.
- Pattern-mode `New Base Prefix` only checks for non-empty input.
- Export suffix is not constrained.
- Output file names are assigned through `a.download`, not written to disk directly.

Assessment:

Browser download handling limits filesystem impact, but weak validation can still create malformed Leica records or confusing exported filenames. In pattern mode, a prefix containing spaces or `|` can break fixed-width pipe output semantics.

Recommendations:

1. Validate `New Base Prefix` with the same strictness as manual names: no whitespace and no `|`.
2. Consider a positive allowlist such as `^[A-Za-z0-9._-]+$`.
3. Validate output suffix with a filename-safe allowlist such as `^[A-Za-z0-9._-]*$`.
4. Add tests for invalid prefix and suffix rejection.

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

Risk level: **Low for local file use, Medium if hosted**

Observed behavior:

- No CSP is defined in the HTML.
- The single-file app uses inline CSS and inline JavaScript by design.

Assessment:

For local `file://` field use, CSP is less important. If the app is hosted on GitHub Pages or another website, CSP becomes more important because the browser origin is reachable through the network.

Recommendations if hosted:

- Add a CSP appropriate for the deployment mode.
- Prefer a split hosted build with external local scripts and styles to avoid `unsafe-inline`.
- Add headers equivalent to:
  - `Content-Security-Policy`
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: no-referrer`

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
- Add a short security note to `README.md` explaining that files stay local and are not uploaded.

## Findings

| Severity | Finding | Impact | Recommendation |
| --- | --- | --- | --- |
| Medium | Files are read fully into memory before size validation. | Large or binary-like files can freeze or terminate a mobile browser tab. | Add per-file and total session size limits before `FileReader.readAsText`. |
| Medium | Pattern `New Base Prefix` validation is weaker than manual name validation. | Prefixes containing whitespace or `|` can corrupt Leica fixed-width pipe output. | Reject whitespace and `|`; consider `^[A-Za-z0-9._-]+$`. |
| Low | Export suffix is not constrained. | Confusing or awkward output filenames are possible. | Allow only filename-safe suffix characters. |
| Low | No CSP for hosted deployment. | If hosted, injected HTML or future dependencies would have fewer browser-level constraints. | Add deployment-specific CSP and security headers if published as a web page. |
| Low | Split and single-file logic are duplicated. | Future bug fixes can drift between versions. | Keep parity tests; consider a build script later. |

## Suggested Next Hardening Tasks

1. Add file size and extension validation before reading files.
2. Add strict validation for pattern base prefixes and export suffixes.
3. Add regression tests for invalid prefix/suffix handling.
4. Add README privacy/security note.
5. If hosted, add CSP/security-header guidance for that deployment mode.

## Audit Conclusion

The application is well suited for its current local smartphone workflow. Its strongest cybersecurity property is that survey files stay local and no network channel is used. The most important next improvement is not remote-attack defense, but mobile resilience and format-safety hardening: reject oversized files early and constrain user-controlled output name components more strictly.
