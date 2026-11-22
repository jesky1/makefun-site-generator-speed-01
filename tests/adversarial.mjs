// Hand-written adversarial cases vs the reference build().
// Run: node tests/adversarial.mjs
import { run } from '../solve.js';
import { build } from '/home/hatch/workspace/goals/free-agent-claim-watch/hidden_files/makefun/work-site-generator/kit/site-generator-speed-01-run-20261122-kit/baselines/makefun-site/vendor/makefun-site/index.js';

const BASE_T = {
  post: '<h1>{{ page.title }}</h1>\n{{{ page.content }}}\n',
  page: '<h1>{{ page.title }}</h1>\n{{{ page.content }}}\n',
  index: '{% for p in posts %}{{ p.title }};{% endfor %}\n',
  tag: 'tag {{ tag.name }} {{ tag.count }}\n',
  tags: 'tags {% for t in tags %}{{ t.slug }},{% endfor %}\n',
};
const SITE = { title: 'T', base_url: 'https://e.example/blog/', per_page: 2, recent: 2 };
const fm = (inner) => `---\n${inner}\n---\n`;
const src = (path, content) => ({ path, content });

const CASES = [
  ['slug unicode + collisions', {
    site: SITE, templates: BASE_T, files: [
      src('a.md', `${fm('title: Café Zürich')}x\n`),
      src('b.md', `${fm('title: cafe zurich')}x\n`),
      src('c.md', `${fm('title: CAFE  ZURICH!!')}x\n`),
      src('d.md', `${fm('title: Ｗｉｄｅ Ｆｉｎａｌ')}x\n`),
      src('e.md', `${fm('title: Москва 東京')}x\n`),
      src('f.md', `${fm('title: Ærøskøbing Łódź')}x\n`),
      src('g.md', `${fm('title: ' + 'word '.repeat(30))}x\n`),
      src('h.md', `${fm('title: ' + 'a'.repeat(63) + ' ' + 'b'.repeat(10))}x\n`),
      src('i.md', `${fm('title: !!!')}x\n`),
      src('j.md', `${fm('title: a-b')}x\n`),
      src('k.md', `${fm('title: a - b')}x\n`),
    ],
  }],
  ['front matter edges', {
    site: SITE, templates: BASE_T, files: [
      src('a.md', `${fm('title: "a\\"b\\\\c"')}x\n`),
      src('b.md', `${fm('title: "unclosed')}x\n`),
      src('c.md', `${fm('title: "a"b"')}x\n`),
      src('d.md', `${fm('title: "a\\qb"')}x\n`),
      src('e.md', `${fm('title: [x]')}x\n`),
      src('f.md', `${fm('title: x\ndate: 2000-02-29')}x\n`),
      src('g.md', `${fm('title: x\ndate: 1900-02-29')}x\n`),
      src('h.md', `${fm('title: x\ndate: 2000-02-30')}x\n`),
      src('i.md', `${fm('title: x\ntags: []')}x\n`),
      src('j.md', `${fm('title: x\ntags: [a,  b ,c]')}x\n`),
      src('k.md', `${fm('title: x\ntags: [a,,b]')}x\n`),
      src('l.md', `${fm('title: x\ntags: [a, "b"]')}x\n`),
      src('m.md', `${fm('title: x\ntags: one')}x\n`),
      src('n.md', `${fm('title: x\nslug: ' + 's'.repeat(64))}x\n`),
      src('o.md', `${fm('title: x\nslug: ' + 's'.repeat(65))}x\n`),
      src('p.md', `${fm('title: x\ndraft: TRUE')}x\n`),
      src('q.md', `${fm('title: x\nlayout: Post')}x\n`),
      src('r.md', `${fm('title: x\ntitle: y')}x\n`),
      src('s.md', `${fm('title:')}x\n`),
      src('t.md', `${fm('title:  x')}x\n`),
      src('u.md', `${fm('title:x')}x\n`),
      src('v.md', `${fm('title : x')}x\n`),
      src('w.md', `${fm('title:\tx')}x\n`),
      src('x.md', `${fm('# comment\n\n  \ntitle: x')}x\n`),
      src('y.md', '---\ntitle: x'),
      src('z.md', ''),
      src('aa.md', '---'),
      src('ab.md', '---\n---\nbody\n'),
    ],
  }],
  ['template errors + include depth', {
    site: SITE,
    templates: {
      ...BASE_T,
      post: '{% include "deep" %}\n{{{ page.content }}}\n',
      deep: 'D{% include "deep" %}D',
      cyc1: '{% include "cyc2" %}\n',
      cyc2: '{% include "cyc1" %}\n',
      bad1: '{{ x }}\n{% include "cyc1" %}\n',
      bad2: '{{ unclosed',
      bad3: '{{{ unclosed }}',
      bad4: '{% unclosed',
      bad5: '{{ 9bad }}',
      bad6: '{% wat %}\n',
      bad7: '{% for x in %}\n{% endfor %}\n',
      bad8: '{% if %}\n{% endif %}\n',
      bad9: '{% if x %}\n',
      bad10: '{% for x in y %}\n',
      bad11: '{% else %}\n',
      bad12: '{% endfor %}\n',
      bad13: '{% endif %}\n',
      bad14: '{% include "no-such" %}{% include "Bad Name" %}\n',
      bad15: '{% if not %}\n{% endif %}\n',
      bad16: '{% for 1x in y %}{% endfor %}\n',
      bad17: '{{ a.b.c }} {{ a. }} {{ .a }} {{ a..b }}\n',
      bad18: '{% if x %}{% else %}{% else %}{% endif %}\n',
      bad19: '{% for x in y %}{% endif %}\n',
      bad20: '{{ x }} {{ x }',
    },
    files: [
      src('a.md', `${fm('title: A')}body\n`),
      src('b.md', `${fm('title: B\nlayout: bad1')}body\n`),
      src('c.md', `${fm('title: C\nlayout: bad2')}body\n`),
    ],
  }],
  ['include depth boundary', {
    site: SITE,
    templates: {
      ...BASE_T,
      post: '{% include "l1" %}\n',
      l1: '1{% include "l2" %}1',
      l2: '2{% include "l3" %}2',
      l3: '3{% include "l4" %}3',
      l4: '4{% include "l5" %}4',
      l5: '5{% include "l6" %}5',
      l6: '6{% include "l7" %}6',
      l7: '7{% include "l8" %}7',
      l8: '8{% include "l9" %}8',
      l9: '9{% include "l10" %}9',
      l10: 'X',
    },
    files: [src('a.md', `${fm('title: A')}body\n`)],
  }],
  ['shadowed statics + empty site', {
    site: SITE, templates: BASE_T, files: [
      src('a.md', `${fm('title: A')}x\n`),
      src('a/index.html', 'STATIC A\n'),
      src('index.html', 'STATIC INDEX\n'),
      src('build-report.txt', 'STATIC REPORT\n'),
    ],
  }],
  ['no posts, no files', {
    site: SITE, templates: BASE_T, files: [],
  }],
  ['links: climbs, fragments, drafts, refused', {
    site: SITE, templates: BASE_T, files: [
      src('posts/2020/a.md', `${fm('title: A\ndate: 2026-01-01')}[up](../../x.md) [root](/abs) [frag](#h) [self](a.md) [sib](../2020/b.md) [static](../img.svg) [gone](nope.md) [empty]() [space](a b.md) [draft](draft.md) [refused](bad.md)\n`),
      src('posts/2020/b.md', `${fm('title: B\ndate: 2026-01-02')}hi\n`),
      src('posts/draft.md', `${fm('title: D\ndate: 2026-01-03\ndraft: true')}hi\n`),
      src('posts/bad.md', `${fm('title: D\ndate: not-a-date')}hi\n`),
      src('img.svg', '<svg/>\n'),
      src('x.md', `${fm('title: X')}hi\n`),
    ],
  }],
  ['heading ids + lists + quotes', {
    site: SITE, templates: BASE_T, files: [
      src('a.md', `${fm('title: A')}## Same\n## Same\n### Same\n# Top #\n####### seven\n#nospace\n## \n##  spaced  \n\n- one\n- two\n  continued\n  - nested?\n* star\n1. first\n2. second\n  cont\n99. ninety-nine\n1234567890. ten-digit\n- back to bullet\n\n> quote one\n>\n> \n> quote two\n\n>single\n\npara\n---\npara2\n***\npara3\n=== setext?\n\n    code?\n\n\`\`\`\ncode <>&\n\`\`\`\n\n\`\`\`js extra\nnot fence\n\`\`\`\n\n\`\`\`js\nunclosed\n`),
    ],
  }],
  ['crlf + trailing spaces + tabs', {
    site: SITE, templates: BASE_T, files: [
      src('a.md', `---\r\ntitle: CRLF\r\ndate: 2026-01-01\r\n---\r\nline one  \r\nline two\r\n\r\n## Head\t \r\n`),
      src('b.md', `${fm('title: Tabs')}\tTabbed line\t\n\t\n`),
    ],
  }],
  ['tags dedup + unicode tags', {
    site: SITE, templates: BASE_T, files: [
      src('posts/a.md', `${fm('title: A\ndate: 2026-01-01\ntags: [JavaScript, javascript, Java Script, Café, cafe, Écriture, ecriture]')}x\n`),
      src('posts/b.md', `${fm('title: B\ndate: 2026-01-02\ntags: [Café, Rust]')}x\n`),
      src('c.md', `${fm('title: C\ntags: [Rust, Go, café]')}x\n`),
      src('d.md', `${fm('title: D\ntags: []')}x\n`),
    ],
  }],
  ['posts order + newer/older + pager', {
    site: { title: 'T', base_url: 'https://e.example', per_page: 2, recent: 0 },
    templates: {
      ...BASE_T,
      post: '{{ page.newer.title }}|{{ page.older.title }}|{{ page.newer.date_long }}|{{ page.date_long }}\n',
      index: '{% for p in posts %}{{ p.title }},{% endfor %}|{{ pager.number }}/{{ pager.total }}|{{ pager.newer_url }}|{{ pager.older_url }}\n',
    },
    files: [
      src('posts/b.md', `${fm('title: B\ndate: 2026-01-02')}x\n`),
      src('posts/a.md', `${fm('title: A\ndate: 2026-01-02')}x\n`),
      src('posts/c.md', `${fm('title: C\ndate: 2026-01-01')}x\n`),
      src('posts/d.md', `${fm('title: D\ndate: 2026-01-03')}x\n`),
      src('posts/e.md', `${fm('title: E\ndate: 2026-01-03')}x\n`),
    ],
  }],
  ['template values: numbers, arrays, loop', {
    site: SITE,
    templates: {
      ...BASE_T,
      post: '{{ page.reading_minutes }} {{ page.tags }} {{ page.toc }} {{ page.toc.length }} {{ site.title }} {{ nosuch.deep }} {{ page.nosuch }} {{ page.is_post }}\n{% for t in page.tags %}{{ loop.index }}:{{ loop.first }}:{{ loop.last }}:{{ loop.length }}:{{ t.name }};{% endfor %}\n',
      index: '{% for p in posts %}{% if loop.first %}F{% endif %}{{ p.title }}{% if loop.last %}L{% endif %};{% endfor %}\n',
    },
    files: [
      src('posts/a.md', `${fm('title: A\ndate: 2026-01-01\ntags: [One, Two]')}## H1\n## H2\nword `.repeat(1) + 'word '.repeat(250) + '\n'),
      src('b.md', `${fm('title: B')}plain\n`),
    ],
  }],
  ['standalone tags + whitespace lines', {
    site: SITE,
    templates: {
      ...BASE_T,
      post: 'A\n  {% if page %}  \nB\n  {% endif %}  \nC\n{% if page %}D{% endif %}\n\t{% include "head" %}\t\nE\n',
      head: 'HEAD {{ page.title }}\n',
    },
    files: [src('a.md', `${fm('title: A')}x\n`)],
  }],
];

let pass = 0;
for (const [name, input] of CASES) {
  let mine;
  let ref;
  let me = null;
  let re = null;
  try { mine = run(input); } catch (e) { me = e; }
  try { ref = build(input); } catch (e) { re = e; }
  const ok = (me === null) === (re === null) && (me !== null || JSON.stringify(mine) === JSON.stringify(ref));
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${me || re ? ` (mineErr=${me && me.message} refErr=${re && re.message})` : ''}`);
  if (!ok) {
    if (me === null) {
      for (const k of Object.keys(mine)) {
        if (JSON.stringify(mine[k]) !== JSON.stringify(ref[k])) {
          console.log('  key:', k);
          console.log('  mine:', JSON.stringify(mine[k]).slice(0, 500));
          console.log('  ref :', JSON.stringify(ref[k]).slice(0, 500));
        }
      }
    }
  } else pass++;
}
console.log(`adversarial: ${pass}/${CASES.length}`);
process.exit(pass === CASES.length ? 0 : 1);
