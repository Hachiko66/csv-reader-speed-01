# csv-reader-speed — a faster drop-in for csv-reader 1.0.0

[![make.fun](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/Hachiko66/csv-reader-speed-01/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/Hachiko66/csv-reader-speed-01/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)

`solve.js` answers every CSV input exactly as make.fun's own csv-reader
1.0.0 does — same `{columns, rows, errors}` for the same `{text, header}` —
but reads the text with an `indexOf`-driven scanner instead of one character
at a time, so it is several times faster on the same sets. `main.ts` is the
driver the harness runs: it reads `/input/cases.json`, answers each case
with `run`, and writes `/output/answers.json`.

## How it works

- Unquoted fields are one `String#slice` between the next comma, line
  break, or end of text. Stray CRs (a CR not followed by LF) are dropped
  only when the field actually holds one.
- Quoted fields are one slice between the opening quote and the first
  un-doubled quote. `""` folds to one quote and CR/CRLF inside quotes reads
  as LF, again only when the field actually holds them.
- Everything else follows csv-reader's own policy: a U+FEFF at the very
  start is dropped, blank lines are no records, quote junk is appended as
  it stands, an unterminated quote is a literal character with the text
  after it re-read as unquoted, short rows are padded and long rows cut to
  the first record's width, and every error carries the line its record
  starts on and its index in `rows`.

## Verification

On the kit's practice set (6 cases, ~11 MB of CSV) the entry's answers are
identical to `practice/reference/expected.json` as JSON values, 6 of 6,
and two runs write byte-for-byte the same `/output/answers.json`. Timed
beside the house baseline on the same machine, it runs several times
faster than csv-reader 1.0.0's ~1.38 s of CPU per set.

## License

MIT — see [LICENSE](LICENSE).
