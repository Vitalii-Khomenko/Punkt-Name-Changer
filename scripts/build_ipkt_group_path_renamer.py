"""Build the self-contained IPKT group/path renamer from split sources.

The canonical sources live in ipkt-group-path-renamer/. Use --extract once to
bootstrap those sources from the existing self-contained field file. Normal
builds replace IPKT-Group-Path-Renamer.html deterministically.
"""

from __future__ import annotations

import argparse
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "ipkt-group-path-renamer"
SOURCE_HTML = SOURCE_DIR / "index.html"
SOURCE_CSS = SOURCE_DIR / "style.css"
SOURCE_JS = SOURCE_DIR / "app.js"
OUTPUT_HTML = ROOT / "IPKT-Group-Path-Renamer.html"

EXTERNAL_CSP = (
    "default-src 'self'; script-src 'self'; style-src 'self'; "
    "img-src 'self' data: blob:; connect-src 'none'; object-src 'none'; "
    "base-uri 'none'; form-action 'none'"
)
INLINE_CSP = (
    "default-src 'self'; script-src 'self' 'unsafe-inline'; "
    "style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; "
    "connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"
)


def replace_csp(html: str, value: str) -> str:
    return re.sub(
        r'<meta http-equiv="Content-Security-Policy" content="[^"]+">',
        f'<meta http-equiv="Content-Security-Policy" content="{value}">',
        html,
        count=1,
    )


def extract_sources() -> None:
    source = OUTPUT_HTML.read_text(encoding="utf-8")
    style_match = re.search(r"    <style>\n(.*?)\n    </style>", source, re.DOTALL)
    script_match = re.search(r"\n<script>\n(.*?)\n</script>", source, re.DOTALL)
    if style_match is None or script_match is None:
        raise RuntimeError("The field file does not contain the expected inline CSS and JavaScript.")

    html = source[: style_match.start()]
    html += '    <link rel="stylesheet" href="style.css">\n'
    html += source[style_match.end() : script_match.start()]
    html += '\n<script src="app.js"></script>'
    html += source[script_match.end() :]
    html = replace_csp(html, EXTERNAL_CSP)

    SOURCE_DIR.mkdir(exist_ok=True)
    SOURCE_HTML.write_text(html, encoding="utf-8")
    SOURCE_CSS.write_text(style_match.group(1).strip() + "\n", encoding="utf-8")
    SOURCE_JS.write_text(script_match.group(1).strip() + "\n", encoding="utf-8")
    print(f"Extracted canonical sources into {SOURCE_DIR.relative_to(ROOT)}/")


def build() -> None:
    html = SOURCE_HTML.read_text(encoding="utf-8")
    css = SOURCE_CSS.read_text(encoding="utf-8").rstrip()
    javascript = SOURCE_JS.read_text(encoding="utf-8").rstrip()

    if '<link rel="stylesheet" href="style.css">' not in html:
        raise RuntimeError("Split HTML is missing the expected stylesheet reference.")
    if '<script src="app.js"></script>' not in html:
        raise RuntimeError("Split HTML is missing the expected script reference.")

    html = replace_csp(html, INLINE_CSP)
    html = html.replace(
        '    <link rel="stylesheet" href="style.css">',
        f"    <style>\n{css}\n    </style>",
        1,
    )
    html = html.replace(
        '<script src="app.js"></script>',
        f"<script>\n{javascript}\n</script>",
        1,
    )

    OUTPUT_HTML.write_text(html, encoding="utf-8")
    print(f"Built {OUTPUT_HTML.relative_to(ROOT)} from split sources")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--extract",
        action="store_true",
        help="Bootstrap split sources from the current self-contained field file.",
    )
    args = parser.parse_args()

    if args.extract:
        extract_sources()
    build()


if __name__ == "__main__":
    main()
