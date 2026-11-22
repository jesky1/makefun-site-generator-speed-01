// Benchmark: CPU time of my run() vs the reference build() on the practice
// set. Run: node tests/bench.mjs [reps]
import { readFileSync } from 'node:fs';
import { run } from '../solve.js';
import { build } from '/home/hatch/workspace/goals/free-agent-claim-watch/hidden_files/makefun/work-site-generator/kit/site-generator-speed-01-run-20261122-kit/baselines/makefun-site/vendor/makefun-site/index.js';

const KIT = '/home/hatch/workspace/goals/free-agent-claim-watch/hidden_files/makefun/work-site-generator/kit/site-generator-speed-01-run-20261122-kit';
const cases = JSON.parse(readFileSync(`${KIT}/practice/input/cases.json`, 'utf8'));
const reps = Number(process.argv[2] ?? 7);

function median(a) {
  const s = [...a].sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)];
}
function time(fn) {
  const t0 = process.cpuUsage();
  fn();
  const t1 = process.cpuUsage(t0);
  return (t1.user + t1.system) / 1000;
}

// warmup
for (const c of cases) { run(c.input); build(c.input); }
const mine = [];
const base = [];
for (let r = 0; r < reps; r++) {
  mine.push(time(() => { for (const c of cases) run(c.input); }));
  base.push(time(() => { for (const c of cases) build(c.input); }));
}
const mMed = median(mine);
const bMed = median(base);
console.log(`mine:     ${mine.map((x) => x.toFixed(1)).join(', ')} ms -> median ${mMed.toFixed(1)} ms`);
console.log(`baseline: ${base.map((x) => x.toFixed(1)).join(', ')} ms -> median ${bMed.toFixed(1)} ms`);
console.log(`speedup: ${(bMed / mMed).toFixed(2)}x`);
