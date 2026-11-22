// Focused inline soup fuzz: random strings over the inline metacharacters,
// as paragraph, heading, list-item and link text. Run: node tests/fuzz-inline.mjs [count] [seed]
import { run } from '../solve.js';
import { build } from '/home/hatch/workspace/goals/free-agent-claim-watch/hidden_files/makefun/work-site-generator/kit/site-generator-speed-01-run-20261122-kit/baselines/makefun-site/vendor/makefun-site/index.js';

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(Number(process.argv[3] ?? 777));
const COUNT = Number(process.argv[2] ?? 5000);
const CHARS = ['\\', '*', '`', '[', ']', '(', ')', '#', 'a', 'b', ' ', '&', '<', '>', '"', "'", '_', '+', '-', '.', '!', 'x', 'é'];
const pick = (arr) => arr[Math.floor(rng() * arr.length)];
const ri = (lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));

function soup(n) {
  let s = '';
  for (let i = 0; i < n; i++) s += pick(CHARS);
  return s;
}

const TEMPLATES = {
  post: '<h1>{{ page.title }}</h1>\n{{{ page.content }}}\n',
  page: '<h1>{{ page.title }}</h1>\n{{{ page.content }}}\n',
  index: '{% for p in posts %}{{ p.excerpt }}|{% endfor %}\n',
  tag: 'tag\n',
  tags: 'tags\n',
};

let fails = 0;
for (let i = 0; i < COUNT; i++) {
  const kind = ri(0, 4);
  let body;
  const s = soup(ri(0, 60));
  const s2 = soup(ri(0, 40));
  switch (kind) {
    case 0: body = s; break;
    case 1: body = `## ${s}`; break;
    case 2: body = `- ${s}\n- ${s2}\n  ${s}`; break;
    case 3: body = `> ${s}\n> ${s2}`; break;
    default: body = `${s}\n\n${s2}`;
  }
  const input = {
    site: { title: 'T', base_url: 'https://e.example', per_page: 5, recent: 2 },
    templates: TEMPLATES,
    files: [
      { path: 'posts/a.md', content: `---\ntitle: Soup\n date: 2026-01-02\n---\n${body}\n`.replace(' date:', 'date:') },
      { path: 'b.md', content: `---\ntitle: B\n---\n[${s}](other.md)\n` },
      { path: 'other.md', content: '---\ntitle: Other\n---\nplain\n' },
    ],
  };
  let mine;
  let ref;
  let me = null;
  let re = null;
  try { mine = run(input); } catch (e) { me = e; }
  try { ref = build(input); } catch (e) { re = e; }
  if ((me === null) !== (re === null) || (me === null && JSON.stringify(mine) !== JSON.stringify(ref))) {
    fails++;
    console.log(`\nMISMATCH #${i} kind=${kind} mineErr=${me && me.message} refErr=${re && re.message}`);
    console.log(JSON.stringify(body));
    if (me === null) {
      const ka = Object.keys(mine);
      for (const k of ka) {
        if (JSON.stringify(mine[k]) !== JSON.stringify(ref[k])) {
          console.log('key:', k);
          console.log('mine:', JSON.stringify(mine[k]).slice(0, 600));
          console.log('ref :', JSON.stringify(ref[k]).slice(0, 600));
        }
      }
    }
    if (fails >= 3) break;
  }
}
console.log(`\ninline-soup fuzz: ${COUNT - fails}/${COUNT} match, ${fails} mismatch`);
process.exit(fails ? 1 : 0);
