# Security

The application is local-only and has no backend.

- Selected IPKT files are read in browser memory.
- No analytics, cookies, browser storage, or remote API calls are used.
- Content Security Policy blocks network connections and object embedding.
- Input size, filename components, and fixed-width output fields are validated.
- Generated downloads are created locally with browser object URLs.

Users should retain original Leica files and review generated output before
production use.
