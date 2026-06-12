"""Normalize Gleis Leica point IDs into three-digit dot format."""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path


SAFE_PREFIX_RE = re.compile(r"^[A-Za-z0-9._-]+$")


def get_segmented_mq_index(
    pair_index: int,
    mq_step: int,
    consecutive_start_point: int,
    consecutive_end_point: int,
) -> int:
    """Return MQ for a pair, using consecutive MQs inside one point range."""
    base_mq = 1 + pair_index * mq_step
    start_pair_index = (consecutive_start_point - 1) // 2
    end_pair_index = (consecutive_end_point - 1) // 2
    consecutive_transitions = max(
        0,
        min(pair_index, end_pair_index) - start_pair_index,
    )
    return base_mq - consecutive_transitions * (mq_step - 1)


def replace_pipe_point_prefix(
    content: bytes,
    source_prefix: str = "G101",
    target_prefix: str = "G01",
    mq_step: int = 2,
    consecutive_start_point: int = 19,
    consecutive_end_point: int = 36,
) -> tuple[bytes, int]:
    """Normalize point pairs with one consecutive-MQ source point range."""
    source_prefix_bytes = source_prefix.encode("ascii")
    target_prefix_bytes = target_prefix.encode("ascii")
    point_id_re = re.compile(
        rb"^" + re.escape(source_prefix_bytes) + rb"(\.\d+)$",
        re.IGNORECASE,
    )
    output_lines: list[bytes] = []
    replacement_count = 0

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
        match = point_id_re.fullmatch(original_field.strip())
        if not match:
            output_lines.append(line)
            continue

        suffix_index = int(match.group(1)[1:])
        if suffix_index < 1 or suffix_index > 998:
            output_lines.append(line)
            continue

        pair_index = (suffix_index - 1) // 2
        pair_position = (suffix_index - 1) % 2
        mq_index = get_segmented_mq_index(
            pair_index,
            mq_step,
            consecutive_start_point,
            consecutive_end_point,
        )
        target_index = (mq_index - 1) * 2 + pair_position + 1
        if target_index > 998:
            raise ValueError(
                f"Mapped point index {target_index} exceeds the supported maximum 998."
            )

        new_id = target_prefix_bytes + b"." + f"{target_index:03d}".encode("ascii")
        if len(new_id) > len(original_field):
            raise ValueError(
                f"Point ID {new_id.decode('ascii')} does not fit the "
                f"{len(original_field)}-character point field."
            )

        new_field = new_id.rjust(len(original_field), b" ")
        output_lines.append(
            line[: last_pipe_index + 1] + new_field + line[yxz_index:]
        )
        replacement_count += 1

    return b"".join(output_lines), replacement_count


def default_output_path(input_path: Path) -> Path:
    return input_path.with_name(f"{input_path.stem}_normalized{input_path.suffix}")


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Normalize G101.N point pairs with a consecutive-MQ range."
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
        default="G101",
        help="Point prefix to replace. Default: G101.",
    )
    parser.add_argument(
        "--target-prefix",
        default="G01",
        help="Replacement point prefix. Default: G01.",
    )
    parser.add_argument(
        "--mq-step",
        type=int,
        default=2,
        help="MQ increment outside the consecutive range. Default: 2.",
    )
    parser.add_argument(
        "--consecutive-start-point",
        type=int,
        default=19,
        help="First source point in the consecutive-MQ range. Default: 19.",
    )
    parser.add_argument(
        "--consecutive-end-point",
        type=int,
        default=36,
        help="Last source point in the consecutive-MQ range. Default: 36.",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Allow replacing an existing output file.",
    )
    args = parser.parse_args(argv)

    for option_name in ("source_prefix", "target_prefix"):
        if not SAFE_PREFIX_RE.fullmatch(getattr(args, option_name)):
            parser.error(f"--{option_name.replace('_', '-')} contains invalid characters.")
    if args.mq_step < 1:
        parser.error("--mq-step must be at least 1.")
    if args.consecutive_start_point < 1 or args.consecutive_end_point < 1:
        parser.error("Consecutive range point numbers must be at least 1.")
    if args.consecutive_start_point > args.consecutive_end_point:
        parser.error("--consecutive-start-point cannot exceed --consecutive-end-point.")
    if args.consecutive_start_point % 2 == 0 or args.consecutive_end_point % 2 != 0:
        parser.error("Consecutive range must start on an odd point and end on an even point.")

    return args


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

    normalized, replacement_count = replace_pipe_point_prefix(
        input_path.read_bytes(),
        source_prefix=args.source_prefix,
        target_prefix=args.target_prefix,
        mq_step=args.mq_step,
        consecutive_start_point=args.consecutive_start_point,
        consecutive_end_point=args.consecutive_end_point,
    )
    output_path.write_bytes(normalized)

    print(
        f"Replaced {replacement_count} point IDs: "
        f"{args.source_prefix}.N -> {args.target_prefix}.NNN "
        f"with MQ step {args.mq_step} outside points "
        f"{args.consecutive_start_point}..{args.consecutive_end_point}"
    )
    print(f"Output: {output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
