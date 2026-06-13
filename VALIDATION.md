# Validation Notes

The current test suite is a regression suite for the live browser
implementation. It mirrors the active renaming rules in Python so the suite can
run without Node, a browser driver, or network access.

Run validation with:

```bash
python tests/run_validation.py
```

## Current Regression Cases

| Case | Expected behavior |
| --- | --- |
| IPKT duplicate checker | The standalone HTML remains self-contained and local-only, accepts `.ipkt`, defaults to a `0.10 m` per-component coordinate tolerance, handles exact 10 cm boundary differences, and exports a dated detailed TXT log with direct matching pairs. |
| IPKT group path renamer | The standalone HTML remains self-contained and local-only, uses a compact letter-only Type selector with a legend and a live MQ line schematic, discovers arbitrary source groups, checks every valid YXZ record for duplicates, supports P/G/Q/QL suffix rules, preserves source-index and coordinate-inferred MQ gaps, recognizes multiple separate bounded bridge spans, and automatically maps explicit `.EX` groups from the nearest configured prism/rail MQ using four positions normally and two positions beside bridge gaps. It refuses an unanchored EX export instead of starting at MQ01, preserves skipped EX positions, applies direct-output Q/QL prism height offsets, replaces fixed-width fields as raw bytes, and exports normalized-path, final-MQ, rename-report, and separate duplicate-report files. |
| 20260613 multi-family normalization | The dedicated Python mini-script maps four prism source families to `P02`, `P03`, `P04`, and `P05`, then maps every explicitly marked EX sequence, including `101.EX.09`, with the fixed bridge rule from `MQ22-2` to `MQ24-1/2` and resumes four-position groups at `MQ25-1`; ordinary non-EX families remain unchanged. |
| Single-digit output suffixes | Pattern output names end in `.1`, `.2`, `.3`, or `.4` without a leading zero in both split and single-file implementations. |
| Gleis prefix normalization | The focused Python mini-script maps source pairs to every other MQ, uses consecutive MQs for `G101.19..36`, resumes every-other-MQ mapping after point 36, preserves fixed-width bytes, and leaves non-matching control points unchanged. |
| Numeric Leica ID normalization | The Python preprocessor converts prism ID `101.1` to `P01.001`, applies the same fixed bridge-interruption calculation only to explicitly marked EX points, and preserves fixed-width bytes and CRLF endings. |
| Partial `.ipkt` measurement with a source gap | `G01.001` starts at `MQ01`, while `G01.071` maps to `MQ36` when the configured start is `G01.001` / `MQ01`. |
| Offset start point | If the configured start point is `G01.071` / `MQ01`, then `G01.071` maps to `MQ01` and `G01.078` maps to `MQ04`. |
| Quadro mode | `Q01.001..Q01.004` maps to one MQ with suffixes `3`, `4`, `1`, `2`, and only the two prism positions receive the `-0.04 m` height offset. |
| Quadro line mode | `QL01.001..QL01.004` maps to one MQ with suffixes `1`, `3`, `4`, `2`, and only the first and fourth prism positions receive the `-0.04 m` height offset. |
| Quadro skipped sections | Within one path such as `Q01` or `QL01`, indexes `037..040` map to `MQ10` and `045..048` map to `MQ12`, so skipped sections keep their real source-index-derived MQ positions. |
| Split and single-file parity | Both implementations contain the source-pair MQ helper and session start-pair metadata. |
| Single-file sync | The single-file CSS matches `css/style.css`, and split JS function definitions are represented in the single-file build. |
| Security hardening | Both implementations keep pre-read file filtering, size limits, safe prefix validation, and safe suffix validation. |
| CSP/privacy hardening | HTML files include CSP metadata, and README/SECURITY document local-only privacy guarantees. |
| Coordinate safety | Regression coverage checks mismatch/guard skip behavior across `.ipkt`, `.iroh`, and `.lqp`. |
| Busy/export UX | Both implementations keep busy status helpers and visible export summary UI. |
| Generated build isolation | The generated single-file build script writes only to `dist/` and keeps the smartphone field file untouched. |
| Generated build content | The validation suite rebuilds `dist/Punkt-Name-Changer.generated.html` and checks that it remains self-contained with CSP, file safety, MQ numbering, busy status, and export summary features. |
| Project publishing rules | AGENTS.md and rules.txt require validation, commit, and push to GitHub after functional updates. |

## Important Limitation

These tests protect current renaming behavior. They are not a replacement for
manual review of real Leica exports before production use.
