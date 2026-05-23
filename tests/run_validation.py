"""Regression and project-invariant tests for PunktNameChanger.

The browser app is plain JavaScript and this machine may not have Node
installed, so these tests use a small Python mirror of the active renaming
rules. The suite protects field-critical behavior and project hygiene.
"""

from __future__ import annotations

import re
import subprocess
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
HTML_PATH = ROOT / "Punkt-Name-Changer.html"
README_PATH = ROOT / "README.md"
MISSION_PATH = ROOT / "Mission.md"
FUNCTIONS_PATH = ROOT / "Function.txt"
RULES_PATH = ROOT / "rules.txt"
AGENTS_PATH = ROOT / "AGENTS.md"
VALIDATION_PATH = ROOT / "VALIDATION.md"
LICENSE_PATH = ROOT / "LICENSE"
SECURITY_PATH = ROOT / "SECURITY.md"
BUILD_SCRIPT_PATH = ROOT / "scripts" / "build_singlefile_dist.py"
GENERATED_HTML_PATH = ROOT / "dist" / "Punkt-Name-Changer.generated.html"
RENAMER_PATH = ROOT / "js" / "renamer.js"
MAIN_PATH = ROOT / "js" / "main.js"
CYRILLIC_RE = re.compile("[\\u0400-\\u04FF]")
POINT_ID_RE = re.compile(r"^([GPQ])(0[1-9]|10)\.(\d{3})$")


def pad2(value: int) -> str:
    return str(int(value)).zfill(2)


def pad3(value: int) -> str:
    return str(int(value)).zfill(3)


def parse_point_id(value: str) -> dict[str, object] | None:
    match = POINT_ID_RE.match(str(value).strip().upper())
    if not match:
        return None
    index = int(match.group(3))
    if index < 1 or index > 998:
        return None
    family = match.group(1)
    path = match.group(2)
    return {
        "normalized": f"{family}{path}.{pad3(index)}",
        "family": family,
        "path": path,
        "index": index,
        "patternKey": f"{family}{path}",
    }


def suffix_code(parsed: dict[str, object]) -> str:
    if parsed["family"] == "Q":
        return ["03", "04", "01", "02"][(int(parsed["index"]) - 1) % 4]

    is_odd = int(parsed["index"]) % 2 != 0
    if parsed["family"] == "P":
        return "01" if is_odd else "02"
    return "03" if is_odd else "04"


def is_quadro_prism(parsed: dict[str, object]) -> bool:
    return parsed["family"] == "Q" and (int(parsed["index"]) - 1) % 4 >= 2


def pair_index(source_index: int) -> int:
    return (source_index - 1) // 2


def mq_group_index(parsed: dict[str, object]) -> int:
    if parsed["family"] == "Q":
        return (int(parsed["index"]) - 1) // 4
    return pair_index(int(parsed["index"]))


def mq_index(session: dict[str, object], parsed: dict[str, object]) -> int:
    start_mq = int(session.get("startMq", session["mqIndex"]))
    start_pair = int(session.get("startPairIndex", mq_group_index(parsed)))
    return start_mq + mq_group_index(parsed) - start_pair


def make_ipkt_line(lfnr: int, point_id: str) -> str:
    parsed = parse_point_id(point_id)
    assert parsed is not None
    idx = int(parsed["index"])
    y = 2600000.0 + idx
    x = 5700000.0 + idx
    return (
        f" {lfnr:06d}|  |      |  |      |      |             {point_id}|YXZ|"
        f" {y:13.5f}| {x:13.5f}|      83.00000|2026-05-21T09:00:00|"
        "      |    | 1.0| 1.0|                         |"
    )


def build_sample_ipkt() -> str:
    lines = [
        "# @Kommentar=",
        "#<LfNr>+BC+<-OS->+GC+<GDim>+<GExz>+<---Punktnummer---->",
    ]
    lfnr = 1
    for idx in list(range(1, 9)) + list(range(71, 79)):
        lines.append(make_ipkt_line(lfnr, f"G01.{pad3(idx)}"))
        lfnr += 1
    return "\n".join(lines)


def extract_imes_ipkt_point_id(line: str) -> str | None:
    yxz_index = line.find("|YXZ|")
    if yxz_index == -1:
        return None
    pre_yxz = line[:yxz_index]
    last_pipe_index = pre_yxz.rfind("|")
    if last_pipe_index == -1:
        return None
    return pre_yxz[last_pipe_index + 1 :].strip()


def build_coordinate_map(text: str) -> dict[str, tuple[float, float]]:
    coordinates: dict[str, tuple[float, float]] = {}
    for line in text.splitlines():
        yxz_index = line.find("|YXZ|")
        if yxz_index == -1:
            continue
        point_id = extract_imes_ipkt_point_id(line)
        parts = line[yxz_index + 5 :].split("|")
        if point_id and len(parts) >= 2:
            coordinates[point_id] = (float(parts[0].strip()), float(parts[1].strip()))
    return coordinates


def replace_imes_ipkt_id(line: str, new_name: str) -> str:
    yxz_index = line.find("|YXZ|")
    pre = line[:yxz_index]
    pipe_index = pre.rfind("|")
    original_segment = line[pipe_index + 1 : yxz_index]
    padding = max(len(original_segment) - len(new_name), 0)
    return line[: pipe_index + 1] + (" " * padding) + new_name + line[yxz_index:]


def add_delta_to_numeric_field(value_text: str, delta: float) -> str:
    match = re.match(r"^(\s*)([+-]?\d+(?:\.\d+)?)(\s*)$", value_text)
    assert match is not None
    numeric_text = match.group(2)
    decimals = max(len(numeric_text.split(".")[1]), 2) if "." in numeric_text else 2
    updated = f"{float(numeric_text) + delta:.{decimals}f}"
    target_width = max(len(value_text) - len(match.group(3)), len(updated))
    return updated.rjust(target_width) + match.group(3)


def apply_quadro_prism_height_offset_to_ipkt(line: str) -> str:
    yxz_index = line.find("|YXZ|")
    parts = line[yxz_index + 5 :].split("|")
    parts[2] = add_delta_to_numeric_field(parts[2], 0.04)
    return line[: yxz_index + 5] + "|".join(parts)


def process_ipkt_pattern(content: str, session: dict[str, object]) -> tuple[str, int]:
    coordinates = build_coordinate_map(content)
    output: list[str] = []
    count = 0
    for line in content.splitlines():
        point_id = extract_imes_ipkt_point_id(line)
        parsed = parse_point_id(point_id) if point_id else None
        if parsed and parsed["patternKey"] == session["patternKey"] and not session["done"]:
            if not session["active"] and point_id == session["startOldId"]:
                session["active"] = True
            if session["active"] and int(session["renamedCount"]) < int(session["limit"]):
                if point_id in coordinates:
                    current_mq = mq_index(session, parsed)
                    new_name = f"{session['basePrefix']}.MQ{pad2(current_mq)}.{suffix_code(parsed)}"
                    line = replace_imes_ipkt_id(line, new_name)
                    if is_quadro_prism(parsed):
                        line = apply_quadro_prism_height_offset_to_ipkt(line)
                    session["lastSuffixCode"] = suffix_code(parsed)
                    session["mqIndex"] = max(int(session["mqIndex"]), current_mq + 1)
                    session["renamedCount"] = int(session["renamedCount"]) + 1
                    count += 1
                    if int(session["renamedCount"]) >= int(session["limit"]):
                        session["active"] = False
                        session["done"] = True
        output.append(line)
    return "\n".join(output), count


def process_single_point_rename(
    content: str,
    ext: str,
    old_id: str,
    new_name: str,
    coordinates: dict[str, tuple[float, float]],
) -> tuple[str, int]:
    if old_id not in coordinates:
        return content, 0

    output: list[str] = []
    count = 0

    for line in content.splitlines():
        if ext in {"imes", "ipkt"}:
            yxz_index = line.find("|YXZ|")
            if yxz_index > -1 and extract_imes_ipkt_point_id(line) == old_id:
                parts = line[yxz_index + 5 :].split("|")
                if len(parts) >= 2:
                    y = float(parts[0].strip())
                    x = float(parts[1].strip())
                    master_y, master_x = coordinates[old_id]
                    if abs(master_y - y) <= 0.05 and abs(master_x - x) <= 0.05:
                        line = replace_imes_ipkt_id(line, new_name)
                        count += 1
            output.append(line)
            continue

        if ext == "iroh":
            parts = [part.strip() for part in line.split("|")]
            pid = None
            y = None
            x = None
            is_header = False
            for part in parts:
                if part.startswith("PID:"):
                    pid = part[4:].strip()
                elif part.startswith("Y:"):
                    y = float(part[2:].strip())
                elif part.startswith("X:"):
                    x = float(part[2:].strip())
                elif part == "CLS:STAT" or part == "CODE:iGeo":
                    is_header = True

            if pid == old_id and not is_header and y is not None and x is not None:
                master_y, master_x = coordinates[old_id]
                if abs(master_y - y) <= 0.05 and abs(master_x - x) <= 0.05:
                    line = line.replace(old_id, new_name, 1)
                    count += 1
            output.append(line)
            continue

        if ext == "lqp":
            tokens = line.strip().split()
            if len(tokens) >= 3 and tokens[0] == old_id and old_id in coordinates:
                second = float(tokens[1])
                third = float(tokens[2])
                looks_like_measurement = 0 <= second <= 400 and 0 <= third <= 400
                if looks_like_measurement:
                    line = line.replace(old_id, new_name, 1)
                    count += 1
            output.append(line)
            continue

        output.append(line)

    return "\n".join(output), count


def make_session(start_index: int, start_mq: int, limit: int) -> dict[str, object]:
    start_id = f"G01.{pad3(start_index)}"
    parsed_start = parse_point_id(start_id)
    assert parsed_start is not None
    return {
        "patternKey": "G01",
        "basePrefix": "3560",
        "startOldId": start_id,
        "startIndex": start_index,
        "startMq": start_mq,
        "startPairIndex": mq_group_index(parsed_start),
        "mqIndex": start_mq,
        "limit": limit,
        "renamedCount": 0,
        "active": False,
        "done": False,
        "lastSuffixCode": None,
    }


def make_quadro_session(start_index: int, start_mq: int, limit: int) -> dict[str, object]:
    start_id = f"Q01.{pad3(start_index)}"
    parsed_start = parse_point_id(start_id)
    assert parsed_start is not None
    return {
        "patternKey": "Q01",
        "basePrefix": "3560",
        "startOldId": start_id,
        "startIndex": start_index,
        "startMq": start_mq,
        "startPairIndex": mq_group_index(parsed_start),
        "mqIndex": start_mq,
        "limit": limit,
        "renamedCount": 0,
        "active": False,
        "done": False,
        "lastSuffixCode": None,
    }


class RenamingRegressionTests(unittest.TestCase):
    def test_partial_ipkt_source_gap_preserves_mq_pair_numbers(self) -> None:
        content = build_sample_ipkt()
        session = make_session(start_index=1, start_mq=1, limit=16)

        output, count = process_ipkt_pattern(content, session)

        self.assertEqual(count, 16)
        self.assertIn("3560.MQ01.03", output)
        self.assertIn("3560.MQ04.04", output)
        self.assertIn("3560.MQ36.03", output)
        self.assertIn("3560.MQ39.04", output)
        self.assertNotIn("3560.MQ05.03", output)
        self.assertEqual(session["mqIndex"], 40)

    def test_offset_start_point_renumbers_from_configured_start_mq(self) -> None:
        content = build_sample_ipkt()
        session = make_session(start_index=71, start_mq=1, limit=8)

        output, count = process_ipkt_pattern(content, session)

        self.assertEqual(count, 8)
        self.assertIn("3560.MQ01.03", output)
        self.assertIn("3560.MQ04.04", output)
        self.assertNotIn("3560.MQ36.03", output)
        self.assertEqual(session["mqIndex"], 5)

    def test_quadro_pattern_maps_four_measurements_to_one_mq_and_offsets_prisms(self) -> None:
        content = "\n".join(make_ipkt_line(idx, f"Q01.{pad3(idx)}") for idx in range(1, 5))
        session = make_quadro_session(start_index=1, start_mq=1, limit=4)

        output, count = process_ipkt_pattern(content, session)

        self.assertEqual(count, 4)
        self.assertIn("3560.MQ01.03", output)
        self.assertIn("3560.MQ01.04", output)
        self.assertIn("3560.MQ01.01", output)
        self.assertIn("3560.MQ01.02", output)
        self.assertEqual(output.count("83.04000"), 2)
        self.assertEqual(output.count("83.00000"), 2)
        self.assertEqual(session["mqIndex"], 2)

    def test_coordinate_safety_skips_mismatches_across_supported_formats(self) -> None:
        master = {"G01.001": (2600001.0, 5700001.0)}

        ipkt = make_ipkt_line(1, "G01.001").replace("2600001.00000", "2600010.00000")
        output, count = process_single_point_rename(ipkt, "ipkt", "G01.001", "3560.MQ01.03", master)
        self.assertEqual(count, 0)
        self.assertIn("G01.001", output)
        self.assertNotIn("3560.MQ01.03", output)

        iroh = "PID:             G01.001|Y:2600010.000|X:5700001.000|CLS:MEAS|"
        output, count = process_single_point_rename(iroh, "iroh", "G01.001", "3560.MQ01.03", master)
        self.assertEqual(count, 0)
        self.assertIn("G01.001", output)
        self.assertNotIn("3560.MQ01.03", output)

        lqp = "G01.001 100.000 100.000 1.0"
        output, count = process_single_point_rename(lqp, "lqp", "G01.001", "3560.MQ01.03", {})
        self.assertEqual(count, 0)
        self.assertIn("G01.001", output)

        lqp_non_measurement = "G01.001 401.000 100.000 1.0"
        output, count = process_single_point_rename(lqp_non_measurement, "lqp", "G01.001", "3560.MQ01.03", master)
        self.assertEqual(count, 0)
        self.assertIn("G01.001", output)


class ProjectInvariantTests(unittest.TestCase):
    def test_required_project_files_exist(self) -> None:
        paths = [
            HTML_PATH,
            README_PATH,
            MISSION_PATH,
            FUNCTIONS_PATH,
            RULES_PATH,
            AGENTS_PATH,
            VALIDATION_PATH,
            LICENSE_PATH,
            SECURITY_PATH,
            BUILD_SCRIPT_PATH,
            RENAMER_PATH,
            MAIN_PATH,
        ]
        for path in paths:
            self.assertTrue(path.exists(), f"Missing required file: {path.name}")

    def test_project_text_files_do_not_contain_cyrillic(self) -> None:
        for path in [README_PATH, MISSION_PATH, FUNCTIONS_PATH, RULES_PATH, AGENTS_PATH, VALIDATION_PATH]:
            text = path.read_text(encoding="utf-8")
            self.assertIsNone(CYRILLIC_RE.search(text), f"Cyrillic text found in {path.name}")

    def test_split_and_single_file_use_source_pair_mq_numbering(self) -> None:
        renamer = RENAMER_PATH.read_text(encoding="utf-8")
        main = MAIN_PATH.read_text(encoding="utf-8")
        html = HTML_PATH.read_text(encoding="utf-8")

        for source in [renamer, html]:
            self.assertIn("function getPairIndexFromPointIndex", source)
            self.assertIn("function getMqGroupIndexFromParsedPoint", source)
            self.assertIn("getMqIndexForParsedPoint(session, parsed)", source)
            self.assertIn("session.mqIndex = Math.max(session.mqIndex, mqIndex + 1)", source)
            self.assertIn("applyQuadroPrismHeightOffset(line, patternType)", source)

        for source in [main, html]:
            self.assertIn("startMq: cfg.startMq", source)
            self.assertIn("startPairIndex: getMqGroupIndexFromParsedPoint(parsePointId(`${cfg.patternKey}.${pad3(cfg.startIndex)}`))", source)

    def test_single_file_build_stays_synchronized_with_split_sources(self) -> None:
        html = HTML_PATH.read_text(encoding="utf-8")
        css = (ROOT / "css" / "style.css").read_text(encoding="utf-8").strip()
        style_match = re.search(r"<style>\n(.*?)\n    </style>", html, re.DOTALL)

        self.assertIsNotNone(style_match)
        self.assertEqual(css, style_match.group(1).strip())

        for path in [ROOT / "js" / "utils.js", ROOT / "js" / "parsers.js", RENAMER_PATH, MAIN_PATH]:
            source = path.read_text(encoding="utf-8")
            for function_name in re.findall(r"^function\s+([A-Za-z0-9_]+)\s*\(", source, re.MULTILINE):
                self.assertIn(f"function {function_name}(", html, f"{function_name} missing from single-file build")

    def test_mobile_ui_keeps_field_work_helpers(self) -> None:
        css = (ROOT / "css" / "style.css").read_text(encoding="utf-8")
        utils = (ROOT / "js" / "utils.js").read_text(encoding="utf-8")
        html = HTML_PATH.read_text(encoding="utf-8")
        split_html = (ROOT / "index.html").read_text(encoding="utf-8")

        for source in [html, split_html]:
            self.assertIn("viewport-fit=cover", source)
            self.assertIn('class="action-row"', source)
            self.assertIn('inputmode="numeric"', source)
            self.assertIn('id="busyStatus"', source)
            self.assertIn('id="exportSummary"', source)

        for source in [css, html]:
            self.assertIn("position: sticky", source)
            self.assertIn("env(safe-area-inset-bottom)", source)
            self.assertIn("-webkit-overflow-scrolling: touch", source)
            self.assertIn(".status-line", source)
            self.assertIn(".summary-box", source)

        for source in [utils, html]:
            self.assertIn("logDiv.scrollTop = logDiv.scrollHeight", source)

        main = MAIN_PATH.read_text(encoding="utf-8")
        for source in [main, html]:
            self.assertIn("function setAppBusy", source)
            self.assertIn("function updateExportSummary", source)
            self.assertIn("setAppBusy(true, 'Reading selected files...')", source)
            self.assertIn("setAppBusy(true, 'Renaming points...')", source)

    def test_security_hardening_checks_are_present(self) -> None:
        utils = (ROOT / "js" / "utils.js").read_text(encoding="utf-8")
        main = MAIN_PATH.read_text(encoding="utf-8")
        html = HTML_PATH.read_text(encoding="utf-8")

        for source in [utils, html]:
            self.assertIn("SUPPORTED_INPUT_EXTENSIONS", source)
            self.assertIn("MAX_INPUT_FILE_SIZE_BYTES", source)
            self.assertIn("MAX_SESSION_FILE_SIZE_BYTES", source)
            self.assertIn("function filterAcceptedInputFiles", source)
            self.assertIn("function isSafeNameComponent", source)
            self.assertIn("function isSafeOutputSuffix", source)
            self.assertIn("/^[A-Za-z0-9._-]+$/", source)
            self.assertIn("/^[A-Za-z0-9._-]*$/", source)

        for source in [main, html]:
            self.assertIn("filterAcceptedInputFiles(selectedFiles)", source)
            self.assertIn("No supported files remained after safety checks.", source)
            self.assertIn("New Base Prefix may contain only letters, numbers, dot, underscore, and hyphen.", source)
            self.assertIn("Output Suffix may contain only letters, numbers, dot, underscore, and hyphen.", source)

    def test_csp_and_privacy_guidance_are_present(self) -> None:
        html = HTML_PATH.read_text(encoding="utf-8")
        split_html = (ROOT / "index.html").read_text(encoding="utf-8")
        readme = README_PATH.read_text(encoding="utf-8")
        security = SECURITY_PATH.read_text(encoding="utf-8")

        for source in [html, split_html]:
            self.assertIn('http-equiv="Content-Security-Policy"', source)
            self.assertIn("connect-src 'none'", source)
            self.assertIn("object-src 'none'", source)
            self.assertIn("form-action 'none'", source)

        self.assertIn("Files stay local in the browser tab and are not uploaded.", readme)
        self.assertIn("The app does not intentionally use:", security)
        self.assertIn("Content-Security-Policy", security)

    def test_generated_single_file_script_writes_only_to_dist(self) -> None:
        script = BUILD_SCRIPT_PATH.read_text(encoding="utf-8")
        gitignore = (ROOT / ".gitignore").read_text(encoding="utf-8")

        self.assertIn('DIST_DIR = ROOT / "dist"', script)
        self.assertIn('OUTPUT_PATH = DIST_DIR / "Punkt-Name-Changer.generated.html"', script)
        self.assertIn("does not modify", script)
        self.assertIn("Punkt-Name-Changer.html", script)
        self.assertIn("dist/", gitignore)

    def test_generated_single_file_build_contains_required_runtime_features(self) -> None:
        smartphone_html_before = HTML_PATH.read_text(encoding="utf-8")

        subprocess.run(
            [sys.executable, str(BUILD_SCRIPT_PATH)],
            cwd=ROOT,
            check=True,
            capture_output=True,
            text=True,
        )

        smartphone_html_after = HTML_PATH.read_text(encoding="utf-8")
        generated = GENERATED_HTML_PATH.read_text(encoding="utf-8")

        self.assertEqual(smartphone_html_before, smartphone_html_after)
        self.assertTrue(GENERATED_HTML_PATH.exists())
        self.assertIn("Leica Mobile Renamer V3 (Generated Single File)", generated)
        self.assertIn('http-equiv="Content-Security-Policy"', generated)
        self.assertIn("script-src 'self' 'unsafe-inline'", generated)
        self.assertIn("style-src 'self' 'unsafe-inline'", generated)
        self.assertIn("connect-src 'none'", generated)
        self.assertIn("object-src 'none'", generated)
        self.assertIn("form-action 'none'", generated)
        self.assertNotIn('href="css/style.css"', generated)
        self.assertNotRegex(generated, r'<script\s+src="js/')

        for marker in [
            'id="busyStatus"',
            'id="exportSummary"',
            "SUPPORTED_INPUT_EXTENSIONS",
            "MAX_INPUT_FILE_SIZE_BYTES",
            "MAX_SESSION_FILE_SIZE_BYTES",
            "function filterAcceptedInputFiles",
            "function isSafeNameComponent",
            "function isSafeOutputSuffix",
            "getMqIndexForParsedPoint(session, parsed)",
            "startPairIndex: getMqGroupIndexFromParsedPoint(parsePointId(`${cfg.patternKey}.${pad3(cfg.startIndex)}`))",
            "session.mqIndex = Math.max(session.mqIndex, mqIndex + 1)",
            "applyQuadroPrismHeightOffset(line, patternType)",
            "setAppBusy(true, 'Reading selected files...')",
            "setAppBusy(true, 'Renaming points...')",
            "position: sticky",
            ".summary-box",
        ]:
            self.assertIn(marker, generated)

    def test_project_requires_validation_commit_and_github_push(self) -> None:
        agents = AGENTS_PATH.read_text(encoding="utf-8")
        rules = RULES_PATH.read_text(encoding="utf-8")
        self.assertIn("python tests/run_validation.py", agents)
        self.assertIn("push the updated project to GitHub", agents)
        self.assertIn("push to GitHub", rules)

    def test_readme_documents_testing_and_license(self) -> None:
        readme = README_PATH.read_text(encoding="utf-8")
        self.assertIn("python tests/run_validation.py", readme)
        self.assertIn("MIT License", readme)

    def test_license_is_mit(self) -> None:
        license_text = LICENSE_PATH.read_text(encoding="utf-8")
        self.assertTrue(license_text.startswith("MIT License"))
        self.assertIn("Vitalii Khomenko", license_text)


if __name__ == "__main__":
    unittest.main(verbosity=2)
