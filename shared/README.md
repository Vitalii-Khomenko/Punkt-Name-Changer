# Shared Airwitech front end

These files are a vendored copy of the shared front end from the Airwitech
website repository (`Airwitech.com/shared`, upstream commit `5395844`). They give
this tool the same header, footer, themes, fonts, and meteor field as every other
Airwitech site and product.

- `site.css` — design tokens, themes, header, footer, hero, and shared components.
- `site.js` — theme toggle, meteor field, hero glyph, rail, and reveal.
- `assets/fonts/` — self-hosted Sora and Source Sans 3 (see `SORA-LICENSE.txt`).
- `assets/favicon.svg` — the pixel-trail mark.

Rules:

- Do not edit these files here. Copy updated versions from the website repository.
- One intentional difference from upstream: the font URLs in `site.css` are
  relative (`assets/fonts/...`) instead of root-absolute (`/assets/fonts/...`),
  so the split sources also work when `index.html` is opened from disk.
- Tool-specific styles belong in `../style.css`, never in `site.css`.
- `python build.py` inlines these files, with fonts and the favicon as data URIs,
  into the single-file field build.
