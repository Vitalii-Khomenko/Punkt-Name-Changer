"""Normalize numeric Leica point IDs into PunktNameChanger dot format."""

from __future__ import annotations

import argparse
import re
import shutil
import sys
from pathlib import Path


TARGET_PATTERN_RE = re.compile(r"^(?:QL|[GPQ])(?:0[1-9]|10)$")


def get_bridge_ex_mapping(ex_index: int) -> tuple[int, int]:
    """Return the fixed MQ and position used for every explicit EX point."""
    if ex_index <= 14:
        return 19 + (ex_index - 1) // 4, (ex_index - 1) % 4 + 1
    if ex_index <= 16:
        return 24, ex_index - 14
    return 25 + (ex_index - 17) // 4, (ex_index - 17) % 4 + 1


def normalize_pipe_content(
    content: bytes,
    source_prefix: str = "101",
    target_pattern: str = "P01",
) -> tuple[bytes, int, int]:
    """Replace numeric and EX IDs in Leica pipe records without reformatting."""
    source_prefix_bytes = source_prefix.encode("ascii")
    target_pattern_bytes = target_pattern.upper().encode("ascii")
    source_id_re = re.compile(rb"^" + re.escape(source_prefix_bytes) + rb"\.(\d{1,3})$")
    ex_id_re = re.compile(rb"^([A-Za-z0-9._-]+)\.EX\.(\d{1,3})$")

    normalized_lines: list[bytes] = []
    numeric_replacement_count = 0
    ex_replacement_count = 0

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
        point_id = original_field.strip()
        numeric_match = source_id_re.fullmatch(point_id)
        ex_match = ex_id_re.fullmatch(point_id)
        if not numeric_match and not ex_match:
            normalized_lines.append(line)
            continue

        index = int(numeric_match.group(1) if numeric_match else ex_match.group(2))
        if index < 1 or index > 998:
            normalized_lines.append(line)
            continue

        if numeric_match:
            new_id = target_pattern_bytes + b"." + f"{index:03d}".encode("ascii")
            numeric_replacement_count += 1
        else:
            assert ex_match is not None
            mq_index, group_position = get_bridge_ex_mapping(index)
            new_id = (
                ex_match.group(1)
                + b".MQ"
                + str(mq_index).encode("ascii")
                + b"-"
                + str(group_position).encode("ascii")
            )
            ex_replacement_count += 1

        if len(new_id) > len(original_field):
            raise ValueError(
                f"Point ID {new_id.decode('ascii')} does not fit the "
                f"{len(original_field)}-character point field."
            )

        new_field = new_id.rjust(len(original_field), b" ")
        line = line[: last_pipe_index + 1] + new_field + line[yxz_index:]
        normalized_lines.append(line)

    return b"".join(normalized_lines), numeric_replacement_count, ex_replacement_count


def default_output_path(input_path: Path) -> Path:
    return input_path.with_name(f"{input_path.stem}_normalized{input_path.suffix}")


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Convert simple numeric Leica point IDs such as 101.1 into "
            "PunktNameChanger IDs such as P01.001."
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
        default="P01",
        help="Target PunktNameChanger family and path. Default: P01.",
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
    normalized, numeric_replacement_count, ex_replacement_count = normalize_pipe_content(
        original,
        source_prefix=args.source_prefix,
        target_pattern=args.target_pattern,
    )

    if args.in_place:
        shutil.copy2(input_path, backup_path)
    output_path.write_bytes(normalized)

    print(
        f"Normalized {numeric_replacement_count} numeric point IDs: "
        f"{args.source_prefix}.N -> {args.target_pattern}.NNN"
    )
    print(
        f"Normalized {ex_replacement_count} explicit EX point IDs from all source families "
        "with fixed bridge-interruption MQ groups"
    )
    print("Explicit EX rule: EX.14 -> MQ22-2, EX.15 -> MQ24-1, EX.16 -> MQ24-2, EX.17 -> MQ25-1")
    print(f"Output: {output_path}")
    if args.in_place:
        print(f"Backup: {backup_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
