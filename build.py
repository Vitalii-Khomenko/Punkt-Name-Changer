"""Build the self-contained IPKT group/path renamer from the split sources.

The canonical sources are index.html, style.css, and app.js, plus the vendored
GeoField front end in shared/ (site.css, app.css, site.js, fonts, favicon). The
build inlines every asset, including fonts and the favicon as data URIs, and
replaces IPKT-Group-Path-Renamer.html deterministically.
"""

from __future__ import annotations

import base64
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parent
SHARED = ROOT / "shared"
SOURCE_HTML = ROOT / "index.html"
OUTPUT_HTML = ROOT / "IPKT-Group-Path-Renamer.html"

INLINE_CSP = (
    "default-src 'self'; script-src 'self' 'unsafe-inline'; "
    "style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; "
    "font-src 'self' data:; connect-src 'none'; object-src 'none'; "
    "base-uri 'none'; form-action 'none'"
)

FAVICON_LINK = '<link rel="icon" href="shared/favicon.svg" type="image/svg+xml">'
STYLE_LINKS = [
    ('    <link rel="stylesheet" href="shared/site.css">', SHARED / "site.css"),
    ('    <link rel="stylesheet" href="shared/app.css">', SHARED / "app.css"),
    ('    <link rel="stylesheet" href="style.css">', ROOT / "style.css"),
]
SCRIPT_TAGS = [
    ('<script src="shared/site.js"></script>', SHARED / "site.js"),
    ('<script src="app.js"></script>', ROOT / "app.js"),
]
FONT_URL_PATTERN = re.compile(r'url\("fonts/([^"?]+)(?:\?[^"]*)?"\)')


def replace_csp(html: str, value: str) -> str:
    return re.sub(
        r'<meta http-equiv="Content-Security-Policy" content="[^"]+">',
        f'<meta http-equiv="Content-Security-Policy" content="{value}">',
        html,
        count=1,
    )


def to_data_uri(data: bytes, media_type: str) -> str:
    return f"data:{media_type};base64,{base64.b64encode(data).decode('ascii')}"


def inline_fonts(css: str) -> str:
    def embed(match: re.Match[str]) -> str:
        font = (SHARED / "fonts" / match.group(1)).read_bytes()
        return f'url("{to_data_uri(font, "font/woff2")}")'

    return FONT_URL_PATTERN.sub(embed, css)


def replace_once(html: str, marker: str, replacement: str) -> str:
    if marker not in html:
        raise RuntimeError(f"Split HTML is missing the expected reference: {marker}")
    return html.replace(marker, replacement, 1)


def build() -> None:
    html = replace_csp(SOURCE_HTML.read_text(encoding="utf-8"), INLINE_CSP)

    favicon = to_data_uri((SHARED / "favicon.svg").read_bytes(), "image/svg+xml")
    html = replace_once(html, FAVICON_LINK, f'<link rel="icon" href="{favicon}" type="image/svg+xml">')

    for link, path in STYLE_LINKS:
        css = path.read_text(encoding="utf-8").rstrip()
        if path.name == "site.css":
            css = inline_fonts(css)
        html = replace_once(html, link, f"    <style>\n{css}\n    </style>")

    for tag, path in SCRIPT_TAGS:
        script = path.read_text(encoding="utf-8").rstrip()
        html = replace_once(html, tag, f"<script>\n{script}\n</script>")

    OUTPUT_HTML.write_text(html, encoding="utf-8")
    print(f"Built {OUTPUT_HTML.relative_to(ROOT)} from split sources")


def main() -> None:
    build()


if __name__ == "__main__":
    main()
