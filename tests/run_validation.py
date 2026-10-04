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
SHARED_CSS = ROOT / "shared" / "site.css"
SHARED_APP_CSS = ROOT / "shared" / "app.css"
SHARED_JS = ROOT / "shared" / "site.js"
FIELD_HTML = ROOT / "IPKT-Group-Path-Renamer.html"
BUILD_SCRIPT = ROOT / "build.py"
README = ROOT / "README.md"
VALIDATION = ROOT / "VALIDATION.md"
SECURITY = ROOT / "SECURITY.md"
AGENTS = ROOT / "AGENTS.md"
LICENSE = ROOT / "LICENSE"
MISSION = ROOT / "Mission.md"
FUNCTIONS = ROOT / "Function.txt"
CYRILLIC_RE = re.compile("[\\u0400-\\u04FF]")


class ProjectTests(unittest.TestCase):
    def test_required_project_files_exist(self) -> None:
        for path in [
            SOURCE_HTML,
            SOURCE_CSS,
            SOURCE_JS,
            SHARED_CSS,
            SHARED_APP_CSS,
            SHARED_JS,
            FIELD_HTML,
            BUILD_SCRIPT,
            README,
            VALIDATION,
            SECURITY,
            AGENTS,
            LICENSE,
            MISSION,
            FUNCTIONS,
        ]:
            self.assertTrue(path.exists(), f"Missing required file: {path.name}")

    def test_javascript_syntax(self) -> None:
        for script in [SOURCE_JS, SHARED_JS]:
            subprocess.run(
                ["node", "--check", str(script)],
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

    def test_stale_export_and_download_safeguards(self) -> None:
        source = SOURCE_JS.read_text(encoding="utf-8")
        self.assertIn("function invalidateExport", source)
        self.assertGreaterEqual(source.count("invalidateExport();"), 3)
        self.assertIn("setTimeout(() => URL.revokeObjectURL(url)", source)
        self.assertNotRegex(source, r"link\.remove\(\);\s*URL\.revokeObjectURL")
        self.assertIn("is assigned to both", source)

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
        field = FIELD_HTML.read_text(encoding="utf-8")

        for reference in [
            '<link rel="stylesheet" href="shared/site.css">',
            '<link rel="stylesheet" href="shared/app.css">',
            '<link rel="stylesheet" href="style.css">',
            '<link rel="icon" href="shared/favicon.svg" type="image/svg+xml">',
            '<script src="shared/site.js"></script>',
            '<script src="app.js"></script>',
        ]:
            self.assertIn(reference, split_html)
            self.assertNotIn(reference, field)

        self.assertIn(SOURCE_JS.read_text(encoding="utf-8").strip(), field)
        self.assertIn(SOURCE_CSS.read_text(encoding="utf-8").strip(), field)
        self.assertIn(SHARED_JS.read_text(encoding="utf-8").strip(), field)
        self.assertIn(SHARED_APP_CSS.read_text(encoding="utf-8").strip(), field)
        self.assertEqual(field.count("data:font/woff2;base64,"), 3)
        self.assertNotIn('url("fonts/', field)
        self.assertIn("font-src 'self' data:", field)
        self.assertIn("data:image/svg+xml;base64,", field)

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

    def test_geofield_design_and_responsive_interface(self) -> None:
        html = SOURCE_HTML.read_text(encoding="utf-8")
        shared_css = SHARED_CSS.read_text(encoding="utf-8")
        shared_app_css = SHARED_APP_CSS.read_text(encoding="utf-8")
        shared_js = SHARED_JS.read_text(encoding="utf-8")
        css = SOURCE_CSS.read_text(encoding="utf-8")
        for marker in [
            '<body class="tone-gnss" data-tone="2">',
            '<header class="site-header">',
            '<span class="logo-tag">geofield</span>',
            '<a href="https://geofield.airwitech.com/" aria-current="page">GeoField</a>',
            'id="theme-toggle"',
            '<footer class="site-footer">',
            "airwitech geofield",
            'data-glyphs="tripod,network,bars"',
            'class="steps-row"',
            "Local processing",
            'class="panel tone-amber hidden"',
            'class="panel-head"',
            'class="dropzone"',
            'class="button quiet"',
            'class="swipe-hint"',
        ]:
            self.assertIn(marker, html)
        self.assertNotIn('data-glyphs="window', html)
        for marker in [
            "--ink: #06070c",
            "--paper: #f4f0e9",
            "--cyan: #62e4ff",
            "--alert:",
            ':root[data-theme="light"]',
            "min-width: 320px",
            "overflow-x: hidden",
            "@media (prefers-reduced-motion: reduce)",
        ]:
            self.assertIn(marker, shared_css)
        for marker in [".panel::before", ".steps-row", ".table-wrap", ".dropzone", "@media print"]:
            self.assertIn(marker, shared_app_css)
        for glyph in ["tripod:", "network:", "bars:"]:
            self.assertIn(glyph, shared_js)
        for marker in [".hidden", ".schematic", ".mq-node", "@media (max-width: 760px)"]:
            self.assertIn(marker, css)
        self.assertNotIn("--ink-950", css)

    def test_shared_front_end_has_no_remote_references(self) -> None:
        for path in [SHARED_CSS, SHARED_APP_CSS, SHARED_JS]:
            source = path.read_text(encoding="utf-8")
            self.assertNotRegex(source, r"https?://", path.name)
            self.assertNotIn("fetch(", source)
            self.assertNotIn("XMLHttpRequest", source)

    def test_project_text_is_english_only(self) -> None:
        for path in [
            SOURCE_HTML,
            SOURCE_CSS,
            SOURCE_JS,
            README,
            VALIDATION,
            SECURITY,
            AGENTS,
            MISSION,
            FUNCTIONS,
        ]:
            self.assertIsNone(CYRILLIC_RE.search(path.read_text(encoding="utf-8")), path.name)

    def test_detailed_logic_documentation_is_present(self) -> None:
        mission = MISSION.read_text(encoding="utf-8")
        functions = FUNCTIONS.read_text(encoding="utf-8")
        readme = README.read_text(encoding="utf-8")

        for marker in [
            "Coordinate-aware MQ planning",
            "Bridge detection",
            "Explicit EX mapping",
            "Fixed-width preservation",
            "Quadro height correction",
        ]:
            self.assertIn(marker, mission)
        for marker in [
            "parseIpktBytes",
            "findDuplicateGroups",
            "getCoordinateAwareMqPlan",
            "getExplicitExPlan",
            "replaceFields",
            "build()",
        ]:
            self.assertIn(marker, functions)
        self.assertIn("Mission.md", readme)
        self.assertIn("Function.txt", readme)

    def test_license_is_mit(self) -> None:
        text = LICENSE.read_text(encoding="utf-8")
        self.assertTrue(text.startswith("MIT License"))


if __name__ == "__main__":
    unittest.main(verbosity=2)
