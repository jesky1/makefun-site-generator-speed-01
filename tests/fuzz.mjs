// Adversarial + fuzz test: random small sites vs the reference build().
// Run: node tests/fuzz.mjs [count] [seed]
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
const rng = mulberry32(Number(process.argv[3] ?? 12345));
const COUNT = Number(process.argv[2] ?? 5000);
const pick = (arr) => arr[Math.floor(rng() * arr.length)];
const ri = (lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
const chance = (p) => rng() < p;

const WORDS = ['the', 'quick', 'brown', 'café', 'Zürich', 'naïve', 'Ærø', 'Москва', '東京', 'ﬁnal', 'Ｗｉｄｅ', 'a', 'I', 'x', 'hello-world', "it's", 'a & b', 'x<y', 'say "hi"', '100', 'under_score', 'C++', 'node.js'];
const TAGNAMES = ['JavaScript', 'javascript', 'Java Script', 'Café', 'cafe', 'Écriture', 'ecriture', 'a-b', 'A B', 'x', '', 'a"b', 'a[b', 'a]b', '  spaced  '];

function randTitle() {
  const n = ri(1, 6);
  const ws = [];
  for (let i = 0; i < n; i++) ws.push(pick(WORDS));
  let t = ws.join(' ');
  if (chance(0.2)) t += pick(['!', '?', ' & more', ' (2)', ': sub', '"']);
  if (chance(0.1)) t = '  ' + t;
  return t;
}

function randInline(depth = 0) {
  const parts = [];
  const n = ri(0, 6);
  for (let i = 0; i < n; i++) {
    const k = ri(0, 15);
    const w = pick(WORDS);
    switch (k) {
      case 0: parts.push(`*${w}*`); break;
      case 1: parts.push(`**${w}**`); break;
      case 2: parts.push(`\`${w}\``); break;
      case 3: parts.push(`[${w}](target${ri(0, 4)})`); break;
      case 4: parts.push(`[${w}](${pick(['#frag', '/abs', 'https://x.example/a?b=c', 'mailto:a@b.c', '../up.md', './same.md', 'missing.md', 'a b', '', 'page.md#h', 'a%20b'])})`); break;
      case 5: parts.push(`\\*${w}\\*`); break;
      case 6: parts.push(`\\${pick(['*', '`', '[', ']', '(', ')', '#', '+', '-', '.', '!', '>', '\\', '_', 'x', '&'])}`); break;
      case 7: parts.push(`**${w} *${pick(WORDS)}* ${w}**`); break;
      case 8: parts.push(`*${w} **${w}**`); break;
      case 9: parts.push('`unclosed'); break;
      case 10: parts.push(`**unclosed ${w}`); break;
      case 11: parts.push(`*unclosed ${w}`); break;
      case 12: parts.push(`[unclosed ${w}`); break;
      case 13: parts.push(`${w} & ${w} < ${w} > ${w} "${w}" '${w}'`); break;
      case 14: parts.push(`_${w}_`); break;
      default: parts.push(w);
    }
    if (chance(0.5)) parts.push(' ');
  }
  return parts.join('');
}

function randBody(linkTargets) {
  const blocks = [];
  const n = ri(0, 8);
  for (let i = 0; i < n; i++) {
    const k = ri(0, 14);
    switch (k) {
      case 0: blocks.push(randInline()); break;
      case 1: blocks.push(`${'#'.repeat(ri(1, 8))} ${randInline()}`); break;
      case 2: blocks.push(`#${pick(WORDS)} ${randInline()}`); break;
      case 3: blocks.push(`${pick(['---', '***', '---  ', '----', '****'])}`); break;
      case 4: blocks.push(`\`\`\`${pick(['', 'js', 'c++', 'bad lang!', 'py'])}` + '\n' + `${randInline()}\n<tag> & stuff\n\`\`\``); break;
      case 5: blocks.push(`\`\`\`js\nunclosed fence\n${randInline()}`); break;
      case 6: blocks.push(`> ${randInline()}\n> ${randInline()}\n>\n>   \n> ${randInline()}`); break;
      case 7: blocks.push(`- ${randInline()}\n- ${randInline()}\n  ${randInline()}`); break;
      case 8: blocks.push(`${ri(1, 20)}. ${randInline()}\n${ri(1, 20)}. ${randInline()}`); break;
      case 9: blocks.push(`1234567890. ${randInline()}`); break;
      case 10: blocks.push(`    indented ${randInline()}\n    more`); break;
      case 11: blocks.push(`${randInline()}\n${pick(['---', '===', '***'])}`); break;
      case 12: blocks.push(`<div>${randInline()}</div>`); break;
      case 13: blocks.push(`${ri(1, 30)}) ${randInline()}\n+ ${randInline()}`); break;
      default: blocks.push(`${randInline()}\n${randInline()}`);
    }
  }
  return blocks.join(chance(0.2) ? '\n\n\n' : '\n\n');
}

const TMPL_SNIPPETS = [
  '<h1>{{ page.title }}</h1>\n{{{ page.content }}}\n',
  '{% if page %}has page: {{ page.title }}{% else %}no page{% endif %}\n',
  '{% for p in posts %}[{{ loop.index }}/{{ loop.length }} {{ p.title }}]{% endfor %}\n',
  '{% for t in tags %}{{ t.name }} ({{ t.count }}){% if not loop.last %}, {% endif %}{% endfor %}\n',
  '{% include "head" %}\n{% include "missing" %}\n',
  '{% include "self" %}\n',
  '{% include "a" %}\n',
  '{{ site.title }} | {{ site.base_url }} | {{ nosuch }} | {{ page.slug }} | {{ page.date_long }} | {{ page.reading_minutes }}\n',
  '{{ page.tags }}|{{ tags }}|{{ recent }}|{{ page.newer }}|{{ page.older }}|{{ page.is_post }}\n',
  '{{{ page.excerpt }}} vs {{ page.excerpt }}\n',
  '{% for h in page.toc %}<a href="#{{ h.id }}">{{{ h.html }}}</a>{% endfor %}\n',
  '{% if not posts %}empty{% endif %}{% if posts %}has posts{% endif %}\n',
  '{% for x in page.tags %}{% for y in tags %}{{ x.name }}={{ y.slug }};{% endfor %}{% endfor %}\n',
  '{{ loop.index }}\n',
  '{% if page.date %}dated {{ page.date }}{% else %}undated{% endif %}\n',
  'text {{unclosed\n',
  'text {{{unclosed\n',
  'text {% unclosed\n',
  'text {{ 1bad }}\n',
  'text {{ a..b }}\n',
  'text {% frobnicate %}\n',
  'text {% for x in y %}\n',
  'text {% if x %}\n',
  'text {% else %}\n',
  'text {% endfor %}\n',
  'text {% endif %}\n',
  '{% for x in nosuch %}never{% endfor %}\n',
  '{% if nosuch %}never{% else %}else-branch{% endif %}\n',
  '{% for loop in posts %}{{ loop }}{% endfor %}\n',
  '{{ page.toc.length }} {{ posts.length }} {{ tags.length }}\n',
  '{% for p in recent %}{{ p.url }} {{ p.summary }} {{ p.reading_minutes }}min\n{% endfor %}\n',
  'a\n{% if page %}\nb\n{% endif %}\nc\n',
  '{% if page %}x{% endif %} tail\n',
  '{{ page.title }}',
];

function randTemplates() {
  const t = {};
  const names = ['post', 'page', 'index', 'tag', 'tags', 'head', 'meta', 'nav', 'card', 'a', 'b', 'self'];
  for (const n of names) {
    if (chance(0.75)) t[n] = pick(TMPL_SNIPPETS) + (chance(0.3) ? pick(TMPL_SNIPPETS) : '');
  }
  return t;
}

function randFM(path, isPost) {
  const lines = ['---'];
  if (chance(0.03)) return 'no front matter here\n\nbody';
  if (chance(0.05)) lines.push('# a comment');
  if (chance(0.05)) lines.push('');
  const title = randTitle();
  if (chance(0.08)) {
    // refusal variants
  } else if (chance(0.3) || title.startsWith('"') || title.startsWith('[') || title !== title.trim()) {
    lines.push(`title: "${title.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`);
  } else lines.push(`title: ${title}`);
  if (isPost || chance(0.15)) {
    const d = pick(['2026-11-09', '2020-02-29', '2019-02-29', '1970-01-01', '2099-12-31', '2100-01-01', '2026-13-01', '2026-00-10', '26-11-19', '2026-2-9']);
    lines.push(`date: ${d}`);
  }
  if (chance(0.5)) {
    const tags = [];
    for (let i = 0; i < ri(0, 4); i++) tags.push(pick(TAGNAMES));
    lines.push(`tags: [${tags.join(pick([', ', ',', ' , ']))}]`);
  }
  if (chance(0.12)) lines.push(`draft: ${pick(['true', 'false', 'yes', 'True'])}`);
  if (chance(0.08)) lines.push(`slug: ${pick(['ok-slug', 'Bad Slug', 'a--b', '-x', 'x-', 'x'.repeat(70), 'a'.repeat(64), ''])}`);
  if (chance(0.2)) lines.push(`summary: ${pick(['plain summary', '"quoted \\"sum\\"ary"', '[bad', ''])}`);
  if (chance(0.08)) lines.push(`layout: ${pick(['post', 'page', 'nope', 'Bad Name', 'index'])}`);
  if (chance(0.06)) lines.push(pick(['author: someone', 'Title: Cap', 'title: dup', 'badline', 'key:', 'title:', 'tags: one, two', 'tags: [a, "b"]', 'date: 2026-02-30', 'title: "unclosed']));
  if (chance(0.04)) lines.push(lines[1]); // duplicate a line
  if (chance(0.03)) return `${lines.join('\n')}\nbody without close`;
  lines.push('---');
  return lines.join('\n');
}

function randSite() {
  const templates = randTemplates();
  const files = [];
  const nFiles = ri(1, 25);
  const paths = [];
  for (let i = 0; i < nFiles; i++) {
    const isPost = chance(0.6);
    const dir = isPost ? `posts/${ri(2018, 2026)}` : pick(['', '', 'docs', 'docs/guides', 'about', 'notes', 'tags', 'page']);
    const name = `${pick(WORDS).replace(/[^a-z0-9]/gi, 'x')}-${i}.md`;
    const path = dir === '' ? name : `${dir}/${name}`;
    paths.push(path);
    let content = `${randFM(path, isPost)}\n${randBody(paths)}\n`;
    if (chance(0.05)) content = content.replace(/\n/g, '\r\n');
    if (chance(0.03)) content = content.replace(/^---\n/, '');
    files.push({ path, content });
  }
  for (let i = 0; i < ri(0, 4); i++) {
    files.push({ path: pick(['assets/style.css', 'robots.txt', 'index.html', 'posts/x/index.html']), content: `static ${i}\n` });
  }
  // shuffle file order
  for (let i = files.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [files[i], files[j]] = [files[j], files[i]];
  }
  return {
    site: {
      title: pick(['My Site', 'Café & Co.', 'x', '']),
      base_url: pick(['https://example.com', 'https://example.com/blog', 'https://example.com/blog/', 'https://example.com///', 'https://example.com/blog//']),
      per_page: ri(1, 6),
      recent: ri(0, 5),
    },
    templates,
    files,
  };
}

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
      if (out.length > 3) return;
    }
    return;
  }
  out.push(`${path}: ${JSON.stringify(String(a).slice(0, 200))} vs ${JSON.stringify(String(b).slice(0, 200))}`);
}

let fails = 0;
for (let i = 0; i < COUNT; i++) {
  const input = randSite();
  let mine;
  let ref;
  let mineErr = null;
  let refErr = null;
  try { mine = run(input); } catch (e) { mineErr = e; }
  try { ref = build(input); } catch (e) { refErr = e; }
  if ((mineErr === null) !== (refErr === null)) {
    fails++;
    console.log(`\nMISMATCH #${i}: throw mismatch mine=${mineErr && mineErr.message} ref=${refErr && refErr.message}`);
    console.log(JSON.stringify(input, null, 1).slice(0, 4000));
    if (fails >= 3) break;
    continue;
  }
  if (mineErr) continue;
  if (JSON.stringify(mine) !== JSON.stringify(ref)) {
    fails++;
    const d = [];
    diffKeys(mine, ref, '', d);
    console.log(`\nMISMATCH #${i}: ${d.join('\n  ')}`);
    console.log(JSON.stringify(input, null, 1).slice(0, 6000));
    if (fails >= 3) break;
  }
}
console.log(`\nfuzz: ${COUNT - fails}/${COUNT} match, ${fails} mismatch`);
process.exit(fails ? 1 : 0);
