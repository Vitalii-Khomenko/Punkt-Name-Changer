"""Normalize the multi-family point IDs used by the 20260613 Leica file."""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path


FAMILY_MAP = {
    b"2505.1": b"G02",
    b"2500.1": b"G03",
    b"2504.2": b"G04",
    b"2504.1": b"G05",
}
SOURCE_ID_RE = re.compile(rb"^(2505\.1|2500\.1|2504\.2|2504\.1)\.(\d{1,3})$")
EX_ID_RE = re.compile(rb"^(2505\.1|2500\.1|2504\.2|2504\.1)\.EX\.(\d{1,3})$")


def get_bridge_ex_name(source_family: bytes, ex_index: int) -> bytes:
    """Map one EX index around the bridge interruption."""
    if ex_index <= 14:
        mq_index = 19 + (ex_index - 1) // 4
        position = (ex_index - 1) % 4 + 1
    elif ex_index <= 16:
        mq_index = 24
        position = ex_index - 14
    else:
        mq_index = 25 + (ex_index - 17) // 4
        position = (ex_index - 17) % 4 + 1

    return (
        source_family
        + b".MQ"
        + str(mq_index).encode("ascii")
        + b"-"
        + str(position).encode("ascii")
    )


def normalize_pipe_content(content: bytes) -> tuple[bytes, int, int]:
    """Normalize supported numeric and EX IDs without changing other bytes."""
    output_lines: list[bytes] = []
    numeric_count = 0
    ex_count = 0

    for line in content.splitlines(keepends=True):
        yxz_index = line.find(b"|YXZ|")
        if yxz_index == -1:
            output_lines.append(line)
            continue

        last_pipe_index = line.rfind(b"|", 0, yxz_index)
        if last_pipe_index == -1:
            output_lines.append(line)
            continue

        original_field = line[last_pipe_index + 1 : yxz_index]
        point_id = original_field.strip()
        numeric_match = SOURCE_ID_RE.fullmatch(point_id)
        ex_match = EX_ID_RE.fullmatch(point_id)

        if numeric_match:
            source_family = numeric_match.group(1)
            source_index = int(numeric_match.group(2))
            if source_index < 1 or source_index > 998:
                output_lines.append(line)
                continue
            new_id = FAMILY_MAP[source_family] + b"." + f"{source_index:03d}".encode("ascii")
            numeric_count += 1
        elif ex_match:
            source_family = ex_match.group(1)
            ex_index = int(ex_match.group(2))
            if ex_index < 1 or ex_index > 998:
                output_lines.append(line)
                continue
            new_id = get_bridge_ex_name(source_family, ex_index)
            ex_count += 1
        else:
            output_lines.append(line)
            continue

        if len(new_id) > len(original_field):
            raise ValueError(
                f"Point ID {new_id.decode('ascii')} does not fit the "
                f"{len(original_field)}-character point field."
            )

        new_field = new_id.rjust(len(original_field), b" ")
        output_lines.append(
            line[: last_pipe_index + 1] + new_field + line[yxz_index:]
        )

    return b"".join(output_lines), numeric_count, ex_count


def default_output_path(input_path: Path) -> Path:
    return input_path.with_name(f"{input_path.stem}_normalized{input_path.suffix}")


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Normalize the four point families and bridge EX sequence in 20260613_YXZ.ipkt."
    )
    parser.add_argument("input", type=Path, help="Input .imes or .ipkt file.")
    parser.add_argument(
        "-o",
        "--output",
        type=Path,
        help="Output file. Defaults to <input>_normalized.<extension>.",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Allow replacing an existing output file.",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    input_path = args.input.resolve()
    output_path = (args.output or default_output_path(input_path)).resolve()

    if not input_path.is_file():
        print(f"Input file not found: {input_path}", file=sys.stderr)
        return 2
    if input_path.suffix.lower() not in {".imes", ".ipkt"}:
        print("Input must be an .imes or .ipkt file.", file=sys.stderr)
        return 2
    if output_path.exists() and not args.force:
        print(f"Output already exists: {output_path}. Use --force to replace it.", file=sys.stderr)
        return 2

    normalized, numeric_count, ex_count = normalize_pipe_content(input_path.read_bytes())
    output_path.write_bytes(normalized)

    print(f"Normalized {numeric_count} numeric point IDs across four source families.")
    print(f"Normalized {ex_count} EX point IDs with the bridge MQ interruption.")
    print(f"Output: {output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
