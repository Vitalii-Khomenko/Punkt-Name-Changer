# Security Policy

## Local-First Privacy

PunktNameChanger is designed as a local browser tool. Leica files are selected
through the browser file picker, read in memory, renamed in the same tab, and
exported through browser downloads.

The app does not intentionally use:

- remote upload endpoints,
- analytics or telemetry,
- cookies,
- localStorage or sessionStorage,
- WebSocket connections,
- third-party runtime JavaScript.

## Supported Deployment

The primary supported deployment is opening `index_singlefile_mobile.html`
directly on a smartphone or laptop.

The split version (`index.html` + `css/` + `js/`) is suitable for maintenance
and can be hosted as a static site if needed. The split version includes a
stricter Content Security Policy because it does not need inline scripts or
inline styles.

## Content Security Policy

Current browser-level policy:

- `index.html` permits only same-origin scripts and styles and blocks network
  connections.
- `index_singlefile_mobile.html` permits inline script/style because it must
  remain self-contained for field use, but still blocks network connections,
  object embedding, base URI changes, and form submission.

If the app is hosted behind a web server, prefer sending equivalent HTTP
headers:

```text
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
```

For the single-file build, `script-src` and `style-src` require
`'unsafe-inline'` unless the app is rebuilt into external local files.

## Reporting Issues

Do not attach private survey data to public issues. Describe the problem with a
minimal synthetic sample whenever possible.
