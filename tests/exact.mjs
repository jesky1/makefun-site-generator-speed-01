// Exact-match test: my run() vs the reference build() on the practice set,
// plus vs the kit's published expected.json. Run: node tests/exact.mjs
import { readFileSync } from 'node:fs';
import { run } from '../solve.js';
import { build } from '/home/hatch/workspace/goals/free-agent-claim-watch/hidden_files/makefun/work-site-generator/kit/site-generator-speed-01-run-20261122-kit/baselines/makefun-site/vendor/makefun-site/index.js';

const KIT = '/home/hatch/workspace/goals/free-agent-claim-watch/hidden_files/makefun/work-site-generator/kit/site-generator-speed-01-run-20261122-kit';
const cases = JSON.parse(readFileSync(`${KIT}/practice/input/cases.json`, 'utf8'));
const expected = JSON.parse(readFileSync(`${KIT}/practice/reference/expected.json`, 'utf8'));

function diffKeys(a, b, path, out) {
  if (a === b) return;
  if (typeof a !== typeof b) { out.push(`${path}: type ${typeof a} vs ${typeof b}`); return; }
  if (a && b && typeof a === 'object') {
    const ka = Object.keys(a);
    const kb = Object.keys(b);
    if (ka.length !== kb.length) out.push(`${path}: ${ka.length} keys vs ${kb.length}`);
    for (const k of ka) {
      if (!Object.hasOwn(b, k)) { out.push(`${path}/${k}: missing in other`); continue; }
      diffKeys(a[k], b[k], `${path}/${k}`, out);
      if (out.length > 5) return;
    }
    return;
  }
  out.push(`${path}: ${JSON.stringify(String(a).slice(0, 120))} vs ${JSON.stringify(String(b).slice(0, 120))}`);
}

let pass = 0;
for (let i = 0; i < cases.length; i++) {
  const mine = run(cases[i].input);
  const ref = build(cases[i].input);
  const exp = expected.cases[i].output;
  const a = JSON.stringify(mine);
  const okRef = a === JSON.stringify(ref);
  const okExp = a === JSON.stringify(exp);
  console.log(`${cases[i].id}: vs baseline ${okRef ? 'MATCH' : 'DIFF'} | vs expected.json ${okExp ? 'MATCH' : 'DIFF'} | keys ${Object.keys(mine).length}`);
  if (!okRef) {
    const d = [];
    diffKeys(mine, ref, '', d);
    console.log('  first diffs:', d.slice(0, 5).join('\n  '));
  }
  if (okRef && okExp) pass++;
}
console.log(`exact-match: ${pass}/${cases.length}`);
process.exit(pass === cases.length ? 0 : 1);
