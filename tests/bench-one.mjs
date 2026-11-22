// Per-case CPU timing in a fresh process per implementation, to avoid GC
// cross-contamination. Usage: node tests/bench-one.mjs <mine|base> <caseIdx>
// Prints CPU ms for that single case (after 1 warmup run of the same case).
import { readFileSync } from 'node:fs';
import { run } from '../solve.js';
import { build } from '/home/hatch/workspace/goals/free-agent-claim-watch/hidden_files/makefun/work-site-generator/kit/site-generator-speed-01-run-20261122-kit/baselines/makefun-site/vendor/makefun-site/index.js';

const KIT = '/home/hatch/workspace/goals/free-agent-claim-watch/hidden_files/makefun/work-site-generator/kit/site-generator-speed-01-run-20261122-kit';
const cases = JSON.parse(readFileSync(`${KIT}/practice/input/cases.json`, 'utf8'));
const which = process.argv[2];
const idx = Number(process.argv[3]);
const fn = which === 'mine' ? run : build;
fn(cases[idx].input); // warmup
const t0 = process.cpuUsage();
fn(cases[idx].input);
const t1 = process.cpuUsage(t0);
console.log(((t1.user + t1.system) / 1000).toFixed(1));
