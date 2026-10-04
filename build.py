"""Build the self-contained IPKT group/path renamer from the split sources.

The canonical sources are index.html, style.css, and app.js, plus the shared
Airwitech front end in shared/ (site.css, site.js, fonts, favicon). The build
inlines every asset, including fonts and the favicon as data URIs, and replaces
IPKT-Group-Path-Renamer.html deterministically.
"""

from __future__ import annotations

import base64
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parent
SHARED = ROOT / "shared"
SOURCE_HTML = ROOT / "index.html"
SOURCE_CSS = ROOT / "style.css"
SOURCE_JS = ROOT / "app.js"
SHARED_CSS = SHARED / "site.css"
SHARED_JS = SHARED / "site.js"
FAVICON = SHARED / "assets" / "favicon.svg"
OUTPUT_HTML = ROOT / "IPKT-Group-Path-Renamer.html"

INLINE_CSP = (
    "default-src 'self'; script-src 'self' 'unsafe-inline'; "
    "style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; "
    "font-src 'self' data:; connect-src 'none'; object-src 'none'; "
    "base-uri 'none'; form-action 'none'"
)

SHARED_CSS_LINK = '    <link rel="stylesheet" href="shared/site.css">'
TOOL_CSS_LINK = '    <link rel="stylesheet" href="style.css">'
FAVICON_LINK = '<link rel="icon" href="shared/assets/favicon.svg" type="image/svg+xml">'
SHARED_JS_TAG = '<script src="shared/site.js"></script>'
TOOL_JS_TAG = '<script src="app.js"></script>'
FONT_URL_PATTERN = re.compile(r'url\("assets/fonts/([^"?]+)(?:\?[^"]*)?"\)')


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
        font = (SHARED / "assets" / "fonts" / match.group(1)).read_bytes()
        return f'url("{to_data_uri(font, "font/woff2")}")'

    return FONT_URL_PATTERN.sub(embed, css)


def replace_once(html: str, marker: str, replacement: str) -> str:
    if marker not in html:
        raise RuntimeError(f"Split HTML is missing the expected reference: {marker}")
    return html.replace(marker, replacement, 1)


def build() -> None:
    html = SOURCE_HTML.read_text(encoding="utf-8")
    shared_css = inline_fonts(SHARED_CSS.read_text(encoding="utf-8").rstrip())
    tool_css = SOURCE_CSS.read_text(encoding="utf-8").rstrip()
    shared_js = SHARED_JS.read_text(encoding="utf-8").rstrip()
    tool_js = SOURCE_JS.read_text(encoding="utf-8").rstrip()
    favicon = to_data_uri(FAVICON.read_bytes(), "image/svg+xml")

    html = replace_csp(html, INLINE_CSP)
    html = replace_once(html, FAVICON_LINK, f'<link rel="icon" href="{favicon}" type="image/svg+xml">')
    html = replace_once(html, SHARED_CSS_LINK, f"    <style>\n{shared_css}\n    </style>")
    html = replace_once(html, TOOL_CSS_LINK, f"    <style>\n{tool_css}\n    </style>")
    html = replace_once(html, SHARED_JS_TAG, f"<script>\n{shared_js}\n</script>")
    html = replace_once(html, TOOL_JS_TAG, f"<script>\n{tool_js}\n</script>")

    OUTPUT_HTML.write_text(html, encoding="utf-8")
    print(f"Built {OUTPUT_HTML.relative_to(ROOT)} from split sources")


def main() -> None:
    build()


if __name__ == "__main__":
    main()
