"""Regression and project-invariant checks for the IPKT Group Path Renamer."""

from __future__ import annotations

import re
import subprocess
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE_HTML = ROOT / "index.html"
SOURCE_CSS = ROOT / "style.css"
SOURCE_JS = ROOT / "app.js"
FIELD_HTML = ROOT / "IPKT-Group-Path-Renamer.html"
BUILD_SCRIPT = ROOT / "build.py"
README = ROOT / "README.md"
VALIDATION = ROOT / "VALIDATION.md"
SECURITY = ROOT / "SECURITY.md"
AGENTS = ROOT / "AGENTS.md"
LICENSE = ROOT / "LICENSE"
CYRILLIC_RE = re.compile("[\\u0400-\\u04FF]")


class ProjectTests(unittest.TestCase):
    def test_required_project_files_exist(self) -> None:
        for path in [
            SOURCE_HTML,
            SOURCE_CSS,
            SOURCE_JS,
            FIELD_HTML,
            BUILD_SCRIPT,
            README,
            VALIDATION,
            SECURITY,
            AGENTS,
            LICENSE,
        ]:
            self.assertTrue(path.exists(), f"Missing required file: {path.name}")

    def test_javascript_syntax(self) -> None:
        subprocess.run(
            ["node", "--check", str(SOURCE_JS)],
            cwd=ROOT,
            check=True,
            capture_output=True,
            text=True,
        )

    def test_active_ipkt_workflows_are_present(self) -> None:
        source = SOURCE_JS.read_text(encoding="utf-8")
        for marker in [
            "function parseSourcePointId",
            "function parseIpktBytes",
            "function findDuplicateGroups",
            "function renderDuplicateAnalysis",
            "function buildDuplicateReport",
            "function getCoordinateAwareMqPlan",
            "function detectBridgeTransitions",
            "function buildExplicitExChunks",
            "function findExplicitExAnchor",
            "function getExplicitExPlan",
            "function buildExplicitExName",
            "function replaceFields",
            "function applyQuadroHeightOffsets",
            "function buildReport",
            "normalizedBytes: replaceFields",
        ]:
            self.assertIn(marker, source)

        html = SOURCE_HTML.read_text(encoding="utf-8")
        for marker in [
            "Download Normalized IPKT",
            "Download Renamed IPKT",
            "Download TXT Report",
        ]:
            self.assertIn(marker, html)

    def test_split_sources_build_the_field_file_exactly(self) -> None:
        subprocess.run(
            [sys.executable, str(BUILD_SCRIPT)],
            cwd=ROOT,
            check=True,
            capture_output=True,
            text=True,
        )

        split_html = SOURCE_HTML.read_text(encoding="utf-8")
        css = SOURCE_CSS.read_text(encoding="utf-8").strip()
        javascript = SOURCE_JS.read_text(encoding="utf-8").strip()
        field = FIELD_HTML.read_text(encoding="utf-8")

        self.assertIn('<link rel="stylesheet" href="style.css">', split_html)
        self.assertIn('<script src="app.js"></script>', split_html)
        self.assertNotIn('<link rel="stylesheet" href="style.css">', field)
        self.assertNotIn('<script src="app.js"></script>', field)
        self.assertIn(css, field)
        self.assertIn(javascript, field)

    def test_local_only_security_controls(self) -> None:
        split_html = SOURCE_HTML.read_text(encoding="utf-8")
        field = FIELD_HTML.read_text(encoding="utf-8")
        for source in [split_html, field]:
            self.assertIn("connect-src 'none'", source)
            self.assertIn("object-src 'none'", source)
            self.assertIn("form-action 'none'", source)
            self.assertIn("never uploaded", source)
        self.assertIn("script-src 'self'; style-src 'self';", split_html)
        self.assertIn("script-src 'self' 'unsafe-inline'", field)

    def test_geomonitoring_responsive_interface(self) -> None:
        html = SOURCE_HTML.read_text(encoding="utf-8")
        css = SOURCE_CSS.read_text(encoding="utf-8")
        for marker in [
            'class="product-header"',
            "GeoMonitoring field tools",
            "Local processing",
            'class="card source-card"',
            'class="card result-card hidden"',
            'class="quiet"',
            'class="swipe-hint"',
        ]:
            self.assertIn(marker, html)
        for marker in [
            "--ink-950: #071a22",
            "--canvas: #eaf0f2",
            "--primary-700: #075f5a",
            "min-width: 320px",
            "overflow-x: hidden",
            "min-height: 44px",
            ":focus-visible",
            "@media (max-width: 760px)",
            "@media (prefers-reduced-motion: reduce)",
        ]:
            self.assertIn(marker, css)

    def test_project_text_is_english_only(self) -> None:
        for path in [SOURCE_HTML, SOURCE_CSS, SOURCE_JS, README, VALIDATION, SECURITY, AGENTS]:
            self.assertIsNone(CYRILLIC_RE.search(path.read_text(encoding="utf-8")), path.name)

    def test_license_is_mit(self) -> None:
        text = LICENSE.read_text(encoding="utf-8")
        self.assertTrue(text.startswith("MIT License"))


if __name__ == "__main__":
    unittest.main(verbosity=2)
