// The program the harness runs: `node /bot/main.ts` (Node 22.18 or later).
// It reads every case from /input/cases.json, answers each one alone with
// run() from solve.js, and writes /output/answers.json — one answer per
// case, in the cases' order. Outside a container, MAKEFUN_INPUT_DIR and
// MAKEFUN_OUTPUT_DIR stand in for /input and /output.
//
// The answers are written as they are produced, one case at a time, so the
// whole set is never held as one JSON string: the bytes are exactly the
// ones JSON.stringify of the full answers array would write.

import { readFileSync, mkdirSync, openSync, writeSync, closeSync } from 'node:fs';
import { join } from 'node:path';
import { setFlagsFromString } from 'node:v8';

// A roomier young generation, set before solve.js is imported: the run
// builds a large number of short-lived slices and rows, and fewer young
// collections measurably lower its CPU time (the house baseline tunes V8's
// flags the same way, and an entry may tune them too).
setFlagsFromString('--max-semi-space-size=128');
// The harness runs this program once per process, cold: the optimizing
// compiler's compile cost is only repaid over repeated hot runs, so skipping
// it (and incremental marking) lowers this run's CPU time. Measured on the
// practice set at about 10% faster than the semi-space flag alone. The code
// still computes the same answers; only how it is compiled changes.
setFlagsFromString('--no-opt');
setFlagsFromString('--no-incremental-marking');

/** run(input) from solve.js, the module this driver answers with. */
const { run } = (await import(new URL('./solve.js', import.meta.url).href)) as {
  run: (input: unknown) => unknown;
};

const inputDir = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

type Case = { id: string; input: unknown };

const cases = JSON.parse(readFileSync(join(inputDir, 'cases.json'), 'utf8')) as Case[];

mkdirSync(outputDir, { recursive: true });
const fd = openSync(join(outputDir, 'answers.json'), 'w');
try {
  writeSync(fd, '[');
  for (let i = 0; i < cases.length; i++) {
    writeSync(fd, (i === 0 ? '' : ',') + JSON.stringify(run(cases[i].input)));
  }
  writeSync(fd, ']');
} finally {
  closeSync(fd);
}
