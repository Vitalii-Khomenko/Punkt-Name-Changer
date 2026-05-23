"""Build a generated single-file HTML into dist/.

This script intentionally writes to dist/ only. It does not modify
Punkt-Name-Changer.html, which remains the manually maintained field file
used on smartphones.
"""

from __future__ import annotations

import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DIST_DIR = ROOT / "dist"
OUTPUT_PATH = DIST_DIR / "Punkt-Name-Changer.generated.html"
SCRIPT_ORDER = [
    "js/utils.js",
    "js/parsers.js",
    "js/renamer.js",
    "js/main.js",
]
INLINE_CSP = (
    "default-src 'self'; script-src 'self' 'unsafe-inline'; "
    "style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; "
    "connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"
)


def main() -> None:
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    css = (ROOT / "css" / "style.css").read_text(encoding="utf-8").rstrip()

    html = re.sub(
        r'<meta http-equiv="Content-Security-Policy" content="[^"]+">',
        f'<meta http-equiv="Content-Security-Policy" content="{INLINE_CSP}">',
        html,
    )
    html = html.replace(
        '<link rel="stylesheet" href="css/style.css">',
        f"<style>\n{css}\n    </style>",
    )

    for script_path in SCRIPT_ORDER:
        script = (ROOT / script_path).read_text(encoding="utf-8").rstrip()
        html = html.replace(
            f'<script src="{script_path}"></script>',
            f"<script>\n{script}\n    </script>",
        )

    html = html.replace(
        "<title>Leica Mobile Renamer V3</title>",
        "<title>Leica Mobile Renamer V3 (Generated Single File)</title>",
    )

    DIST_DIR.mkdir(exist_ok=True)
    OUTPUT_PATH.write_text(html, encoding="utf-8")
    print(f"Wrote {OUTPUT_PATH.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
