# Security

The application is local-only and has no backend. Survey data is treated as
confidential: it never leaves the browser tab.

## Data handling

- Selected IPKT files are read into browser memory only.
- No analytics, cookies, or remote API calls are used. The shared front end keeps
  one value in browser storage, the light or dark theme choice; file data is
  never stored.
- Generated downloads are created locally with temporary browser object URLs.
- Closing the tab or choosing Clear discards the file and all derived results.

## Controls

- The Content Security Policy sets `connect-src 'none'`, `object-src 'none'`,
  `base-uri 'none'`, and `form-action 'none'`, so the page cannot send data out.
- The split sources use `script-src 'self'` and `style-src 'self'`. The
  generated single-file build must allow inline script and style, so it uses
  `'unsafe-inline'` for those two directives, plus `font-src data:` for the
  embedded fonts.
- Input is limited to one `.ipkt` file of at most 10 MB.
- Output prefixes accept only letters, numbers, dot, underscore, and hyphen.
- Names and heights are checked against the original fixed-width field sizes.
- All page text is written with `textContent`, never as HTML.

## Limitations

- The tool does not authenticate or sign its output.
- A copy of the field file is only as trustworthy as where it came from;
  rebuild it with `python build.py` from the repository to verify it.
- Users should retain original field files and review generated output before
  production use.
