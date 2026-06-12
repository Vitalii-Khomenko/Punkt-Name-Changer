"""Normalize numeric Leica point IDs into PunktNameChanger dot format."""

from __future__ import annotations

import argparse
import re
import shutil
import sys
from pathlib import Path


TARGET_PATTERN_RE = re.compile(r"^(?:QL|[GPQ])(?:0[1-9]|10)$")


def normalize_pipe_content(
    content: bytes,
    source_prefix: str = "101",
    target_pattern: str = "G01",
) -> tuple[bytes, int]:
    """Replace simple numeric IDs in Leica pipe records without reformatting."""
    source_prefix_bytes = source_prefix.encode("ascii")
    target_pattern_bytes = target_pattern.upper().encode("ascii")
    source_id_re = re.compile(rb"^" + re.escape(source_prefix_bytes) + rb"\.(\d{1,3})$")

    normalized_lines: list[bytes] = []
    replacement_count = 0

    for line in content.splitlines(keepends=True):
        yxz_index = line.find(b"|YXZ|")
        if yxz_index == -1:
            normalized_lines.append(line)
            continue

        last_pipe_index = line.rfind(b"|", 0, yxz_index)
        if last_pipe_index == -1:
            normalized_lines.append(line)
            continue

        original_field = line[last_pipe_index + 1 : yxz_index]
        match = source_id_re.fullmatch(original_field.strip())
        if not match:
            normalized_lines.append(line)
            continue

        index = int(match.group(1))
        if index < 1 or index > 998:
            normalized_lines.append(line)
            continue

        new_id = target_pattern_bytes + b"." + f"{index:03d}".encode("ascii")
        if len(new_id) > len(original_field):
            raise ValueError(
                f"Point ID {new_id.decode('ascii')} does not fit the "
                f"{len(original_field)}-character point field."
            )

        new_field = new_id.rjust(len(original_field), b" ")
        line = line[: last_pipe_index + 1] + new_field + line[yxz_index:]
        normalized_lines.append(line)
        replacement_count += 1

    return b"".join(normalized_lines), replacement_count


def default_output_path(input_path: Path) -> Path:
    return input_path.with_name(f"{input_path.stem}_normalized{input_path.suffix}")


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Convert simple numeric Leica point IDs such as 101.1 into "
            "PunktNameChanger IDs such as G01.001."
        )
    )
    parser.add_argument("input", type=Path, help="Input .imes or .ipkt file.")
    parser.add_argument(
        "-o",
        "--output",
        type=Path,
        help="Output file. Defaults to <input>_normalized.<extension>.",
    )
    parser.add_argument(
        "--source-prefix",
        default="101",
        help="Numeric source prefix before the final dot. Default: 101.",
    )
    parser.add_argument(
        "--target-pattern",
        default="G01",
        help="Target PunktNameChanger family and path. Default: G01.",
    )
    parser.add_argument(
        "--in-place",
        action="store_true",
        help="Replace the input file and create a .bak backup.",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Allow replacing an existing output or backup file.",
    )
    args = parser.parse_args(argv)

    if args.output and args.in_place:
        parser.error("--output and --in-place cannot be used together.")
    if not re.fullmatch(r"\d+", args.source_prefix):
        parser.error("--source-prefix must contain digits only.")
    args.target_pattern = args.target_pattern.upper()
    if not TARGET_PATTERN_RE.fullmatch(args.target_pattern):
        parser.error(
            "--target-pattern must be G01..G10, P01..P10, "
            "Q01..Q10, or QL01..QL10."
        )

    return args


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    input_path = args.input.resolve()

    if not input_path.is_file():
        print(f"Input file not found: {input_path}", file=sys.stderr)
        return 2
    if input_path.suffix.lower() not in {".imes", ".ipkt"}:
        print("Input must be an .imes or .ipkt file.", file=sys.stderr)
        return 2

    output_path = (
        input_path
        if args.in_place
        else (args.output or default_output_path(input_path)).resolve()
    )
    backup_path = input_path.with_suffix(input_path.suffix + ".bak")

    if not args.in_place and output_path.exists() and not args.force:
        print(f"Output already exists: {output_path}. Use --force to replace it.", file=sys.stderr)
        return 2
    if args.in_place and backup_path.exists() and not args.force:
        print(f"Backup already exists: {backup_path}. Use --force to replace it.", file=sys.stderr)
        return 2

    original = input_path.read_bytes()
    normalized, replacement_count = normalize_pipe_content(
        original,
        source_prefix=args.source_prefix,
        target_pattern=args.target_pattern,
    )

    if args.in_place:
        shutil.copy2(input_path, backup_path)
    output_path.write_bytes(normalized)

    print(
        f"Normalized {replacement_count} point IDs: "
        f"{args.source_prefix}.N -> {args.target_pattern}.NNN"
    )
    print(f"Output: {output_path}")
    if args.in_place:
        print(f"Backup: {backup_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
