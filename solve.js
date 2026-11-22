// Fast drop-in for makefun-site 1.0.0 — written from scratch for speed.
// Semantics follow the reference (README + code): same front matter dialect,
// Markdown subset, template dialect, slug rule and report, byte for byte.
// Optimisations: bulk HTML escaping (no per-character escape calls), a
// single-pass Markdown renderer (no token objects), index-based front-matter
// scanning (no per-line regexes), per-run slug/resolve caches, and a template
// interpreter that appends to an array with a reused loop frame.

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const ESC_RE = /[&<>"']/g;
const ESC_TEST = /[&<>"']/;
function escapeHtml(s) {
  // Most strings hold nothing to escape; skip the replace machinery then.
  return ESC_TEST.test(s) ? s.replace(ESC_RE, (c) => ESC_MAP[c]) : s;
}

const byCodeUnits = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const dirOf = (path) => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '');

// ---------------------------------------------------------------- slugs

const COMBINING_RE = /\p{M}/gu;
function slugifyRaw(text) {
  let ascii = true;
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) >= 128) { ascii = false; break; }
  }
  // NFKD is the identity on ASCII, and ASCII holds no combining marks.
  const plain = ascii ? text : text.normalize('NFKD').replace(COMBINING_RE, '');
  let out = '';
  let gap = false;
  for (let i = 0; i < plain.length; i++) {
    const c = plain.charCodeAt(i);
    if (c >= 65 && c <= 90) {
      if (gap) { out += '-'; gap = false; }
      out += String.fromCharCode(c + 32);
    } else if ((c >= 97 && c <= 122) || (c >= 48 && c <= 57)) {
      if (gap) { out += '-'; gap = false; }
      out += plain[i];
    } else {
      gap = out.length > 0;
    }
  }
  if (out.length > 64) out = out.slice(0, 64);
  let e = out.length;
  while (e > 0 && out.charCodeAt(e - 1) === 45) e--;
  out = out.slice(0, e);
  return out === '' ? 'untitled' : out;
}

function uniqueSlug(slug, taken) {
  let out = slug;
  for (let n = 2; taken.has(out); n++) out = `${slug}-${n}`;
  taken.add(out);
  return out;
}

function longDate(d) {
  return `${Number(d.slice(8, 10))} ${MONTHS[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`;
}

// ---------------------------------------------------------------- front matter

const KEY_SET = new Set(['title', 'date', 'tags', 'draft', 'layout', 'slug', 'summary']);

function daysIn(y, m) {
  if (m === 2) return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 29 : 28;
  return m === 4 || m === 6 || m === 9 || m === 11 ? 30 : 31;
}

function stringOf(raw) {
  if (raw.charCodeAt(0) === 34) {
    if (raw.length < 2 || raw.charCodeAt(raw.length - 1) !== 34) return { error: 'a quoted string is not closed' };
    let out = '';
    for (let i = 1; i < raw.length - 1; i++) {
      const c = raw[i];
      if (c === '\\') {
        const n = raw[i + 1];
        if ((n !== '"' && n !== '\\') || i + 1 === raw.length - 1) return { error: 'a quoted string holds an escape other than \\" or \\\\' };
        out += n;
        i++;
      } else if (c === '"') return { error: 'a quoted string holds a stray quote' };
      else out += c;
    }
    return { value: out };
  }
  if (raw.charCodeAt(0) === 91) return { error: 'a bare string opens on [' };
  return { value: raw };
}

function isName(s) {
  if (s.length === 0) return false;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (!((c >= 97 && c <= 122) || (c >= 48 && c <= 57) || c === 45)) return false;
  }
  return true;
}

function isSlugValue(s) {
  if (s.length === 0 || s.length > 64) return false;
  let prevDash = true; // also rejects a leading '-'
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 45) {
      if (prevDash) return false;
      prevDash = true;
    } else if ((c >= 97 && c <= 122) || (c >= 48 && c <= 57)) prevDash = false;
    else return false;
  }
  return !prevDash; // rejects a trailing '-'
}

function valueOf(key, raw) {
  switch (key) {
    case 'title':
    case 'summary': {
      const s = stringOf(raw);
      return 'error' in s ? { error: `key "${key}": ${s.error}` } : s;
    }
    case 'date': {
      let ok = raw.length === 10 && raw.charCodeAt(4) === 45 && raw.charCodeAt(7) === 45;
      if (ok) {
        for (let i = 0; i < 10; i++) {
          if (i === 4 || i === 7) continue;
          const c = raw.charCodeAt(i);
          if (c < 48 || c > 57) { ok = false; break; }
        }
      }
      const y = ok ? Number(raw.slice(0, 4)) : 0;
      const mo = ok ? Number(raw.slice(5, 7)) : 0;
      const d = ok ? Number(raw.slice(8, 10)) : 0;
      if (!ok || y < 1970 || y > 2099 || mo < 1 || mo > 12 || d < 1 || d > daysIn(y, mo)) {
        return { error: 'key "date": not a date from 1970-01-01 to 2099-12-31 (YYYY-MM-DD)' };
      }
      return { value: raw };
    }
    case 'tags': {
      if (!raw.startsWith('[') || !raw.endsWith(']')) return { error: 'key "tags": not a list [a, b]' };
      const inner = raw.slice(1, -1);
      if (inner.trim() === '') return { value: [] };
      const tags = inner.split(',').map((t) => t.trim());
      for (const t of tags) {
        if (t === '' || t.indexOf('"') !== -1 || t.indexOf('[') !== -1 || t.indexOf(']') !== -1) {
          return { error: 'key "tags": an empty tag, or one holding " [ or ]' };
        }
      }
      return { value: tags };
    }
    case 'draft':
      return raw === 'true' ? { value: true } : raw === 'false' ? { value: false } : { error: 'key "draft": true or false' };
    case 'layout':
      return isName(raw) ? { value: raw } : { error: 'key "layout": not a template name' };
    case 'slug':
      return isSlugValue(raw) ? { value: raw } : { error: 'key "slug": not a slug' };
    default:
      return { error: `unknown key "${key}"` };
  }
}

// Parse front matter from \n-normalised text: { data, body } or { error }.
function parseFM(text) {
  const n0 = text.indexOf('\n');
  const first = n0 === -1 ? text : text.slice(0, n0);
  if (first !== '---') return { error: 'no front matter' };
  let closeStart = -1;
  let closeEnd = -1;
  let pos = n0;
  while (true) {
    const idx = text.indexOf('\n---', pos);
    if (idx === -1) break;
    const after = idx + 4;
    if (after === text.length || text.charCodeAt(after) === 10) { closeStart = idx + 1; closeEnd = after; break; }
    pos = idx + 1;
  }
  if (closeStart === -1) return { error: 'the front matter is not closed' };
  const data = {};
  const regionEnd = closeStart - 1; // index of the '\n' before the closing line
  let ls = n0 + 1;
  let lineNo = 2;
  while (ls < regionEnd) {
    let le = text.indexOf('\n', ls);
    if (le === -1 || le > regionEnd) le = regionEnd;
    const line = text.slice(ls, le);
    ls = le + 1;
    const cur = lineNo;
    lineNo++;
    let blank = true;
    for (let i = 0; i < line.length; i++) {
      const c = line.charCodeAt(i);
      if (c !== 32 && c !== 9) { blank = false; break; }
    }
    if (blank) continue;
    if (line.charCodeAt(0) === 35) continue; // '#'
    const colon = line.indexOf(':');
    if (colon <= 0) return { error: `line ${cur} is not "key: value"` };
    let keyOk = true;
    for (let i = 0; i < colon; i++) {
      const c = line.charCodeAt(i);
      if (!((c >= 97 && c <= 122) || c === 95)) { keyOk = false; break; }
    }
    if (!keyOk) return { error: `line ${cur} is not "key: value"` };
    let raw;
    if (colon === line.length - 1) raw = '';
    else if (line.charCodeAt(colon + 1) === 32) raw = line.slice(colon + 2);
    else return { error: `line ${cur} is not "key: value"` };
    let e = raw.length;
    while (e > 0 && (raw.charCodeAt(e - 1) === 32 || raw.charCodeAt(e - 1) === 9)) e--;
    raw = raw.slice(0, e);
    const key = line.slice(0, colon);
    if (!KEY_SET.has(key)) return { error: `unknown key "${key}"` };
    if (Object.hasOwn(data, key)) return { error: `key "${key}" is given twice` };
    if (raw === '') return { error: `key "${key}" has no value` };
    const v = valueOf(key, raw);
    if ('error' in v) return v;
    data[key] = v.value;
  }
  if (!Object.hasOwn(data, 'title')) return { error: 'no title' };
  return { data, body: closeEnd === text.length ? '' : text.slice(closeEnd + 1) };
}

// ---------------------------------------------------------------- templates

class TemplateError extends Error {}

const PATH_RE = /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*$/;
const FOR_RE = /^for ([A-Za-z_][A-Za-z0-9_]*) in (\S+)$/;
const IF_RE = /^if (not )?(\S+)$/;
const INC_RE = /^include "([a-z0-9-]+)"$/;

function pathOf(name, text) {
  if (!PATH_RE.test(text)) throw new TemplateError(`template "${name}": ${JSON.stringify(text)} is not a path`);
  return text.split('.');
}

function isBlankStr(s) {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c !== 32 && c !== 9) return false;
  }
  return true;
}

function tokenize(name, src) {
  const tokens = [];
  let text = '';
  let i = 0;
  while (i < src.length) {
    const open = src.indexOf('{', i);
    if (open === -1 || open === src.length - 1) {
      text += src.slice(i);
      break;
    }
    const next = src[open + 1];
    if (next !== '{' && next !== '%') {
      text += src.slice(i, open + 1);
      i = open + 1;
      continue;
    }
    text += src.slice(i, open);
    if (next === '{') {
      const raw = src[open + 2] === '{';
      const close = src.indexOf(raw ? '}}}' : '}}', open + (raw ? 3 : 2));
      if (close === -1) throw new TemplateError(`template "${name}": a ${raw ? '{{{' : '{{'} is not closed`);
      if (text !== '') tokens.push({ t: 'text', text });
      text = '';
      tokens.push({ t: raw ? 'raw' : 'var', path: pathOf(name, src.slice(open + (raw ? 3 : 2), close).trim()) });
      i = close + (raw ? 3 : 2);
      continue;
    }
    const close = src.indexOf('%}', open + 2);
    if (close === -1) throw new TemplateError(`template "${name}": a {% is not closed`);
    const end = close + 2;
    const lineStart = src.lastIndexOf('\n', open - 1) + 1;
    const nl = src.indexOf('\n', end);
    const lineEnd = nl === -1 ? src.length : nl;
    const standalone = isBlankStr(src.slice(lineStart, open)) && isBlankStr(src.slice(end, lineEnd));
    if (standalone) text = text.slice(0, text.length - (open - lineStart));
    if (text !== '') tokens.push({ t: 'text', text });
    text = '';
    tokens.push({ t: 'tag', tag: src.slice(open + 2, close).trim() });
    i = standalone ? (nl === -1 ? src.length : nl + 1) : end;
  }
  if (text !== '') tokens.push({ t: 'text', text });
  return tokens;
}

function parseTemplate(name, src) {
  const root = { kind: 'root', body: [] };
  const stack = [root];
  let body = root.body;
  for (const tok of tokenize(name, src)) {
    if (tok.t === 'text') body.push({ kind: 'text', text: tok.text });
    else if (tok.t === 'var' || tok.t === 'raw') body.push({ kind: tok.t, path: tok.path });
    else {
      const tag = tok.tag;
      const top = stack[stack.length - 1];
      let m;
      if ((m = FOR_RE.exec(tag)) !== null) {
        const node = { kind: 'for', name: m[1], path: pathOf(name, m[2]), body: [] };
        body.push(node);
        stack.push(node);
        body = node.body;
      } else if ((m = IF_RE.exec(tag)) !== null) {
        const node = { kind: 'if', not: m[1] !== undefined, path: pathOf(name, m[2]), then: [], else: null };
        body.push(node);
        stack.push(node);
        body = node.then;
      } else if (tag === 'else') {
        if (top.kind !== 'if' || top.else !== null) throw new TemplateError(`template "${name}": an else outside an if`);
        top.else = [];
        body = top.else;
      } else if (tag === 'endfor' || tag === 'endif') {
        if (top.kind !== (tag === 'endfor' ? 'for' : 'if')) throw new TemplateError(`template "${name}": an ${tag} with no open ${tag.slice(3)}`);
        stack.pop();
        const parent = stack[stack.length - 1];
        body = parent.kind === 'root' ? parent.body : parent.kind === 'for' ? parent.body : parent.else ?? parent.then;
      } else if ((m = INC_RE.exec(tag)) !== null) body.push({ kind: 'include', name: m[1] });
      else throw new TemplateError(`template "${name}": {% ${tag} %} is not a tag`);
    }
  }
  if (stack.length > 1) throw new TemplateError(`template "${name}": a ${stack[stack.length - 1].kind} is not closed`);
  return root.body;
}

function lookup(frames, path) {
  let v;
  let found = false;
  for (let f = frames.length - 1; f >= 0; f--) {
    if (Object.hasOwn(frames[f], path[0])) { v = frames[f][path[0]]; found = true; break; }
  }
  if (!found) return undefined;
  for (let k = 1; k < path.length; k++) {
    if (v === null || typeof v !== 'object' || !Object.hasOwn(v, path[k])) return undefined;
    v = v[path[k]];
  }
  return v;
}

function textOf(v) {
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (Array.isArray(v)) {
    let s = '';
    for (let i = 0; i < v.length; i++) {
      if (i) s += ', ';
      s += textOf(v[i]);
    }
    return s;
  }
  return '';
}

function truthy(v) {
  if (Array.isArray(v)) return v.length > 0;
  return v !== undefined && v !== null && v !== false && v !== '' && v !== 0;
}

function renderNodes(nodes, frames, ctx, depth, out) {
  for (let n = 0; n < nodes.length; n++) {
    const node = nodes[n];
    switch (node.kind) {
      case 'text':
        out.push(node.text);
        break;
      case 'var':
        out.push(escapeHtml(textOf(lookup(frames, node.path))));
        break;
      case 'raw':
        out.push(textOf(lookup(frames, node.path)));
        break;
      case 'if': {
        const v = truthy(lookup(frames, node.path));
        const branch = v !== node.not ? node.then : node.else;
        if (branch !== null) renderNodes(branch, frames, ctx, depth, out);
        break;
      }
      case 'for': {
        const xs = lookup(frames, node.path);
        if (!Array.isArray(xs)) break;
        const frame = {};
        const loop = { index: 0, first: true, last: false, length: xs.length };
        frame.loop = loop;
        frames.push(frame);
        for (let k = 0; k < xs.length; k++) {
          if (node.name !== 'loop') frame[node.name] = xs[k];
          loop.index = k + 1;
          loop.first = k === 0;
          loop.last = k === xs.length - 1;
          renderNodes(node.body, frames, ctx, depth, out);
        }
        frames.pop();
        break;
      }
      case 'include': {
        const t = ctx.templates.get(node.name);
        if (t === undefined || depth >= 8) break;
        // A partial that only reads site/tags/recent, rendered in the root
        // scope alone, is the same on every page: render once per depth.
        if (frames.length === 1 && ctx.cacheable.has(node.name)) {
          const key = `${node.name}\n${depth}`;
          let s = ctx.cache.get(key);
          if (s === undefined) {
            const tmp = [];
            renderNodes(t, frames, ctx, depth + 1, tmp);
            s = tmp.join('');
            ctx.cache.set(key, s);
          }
          out.push(s);
        } else {
          renderNodes(t, frames, ctx, depth + 1, out);
        }
        break;
      }
    }
  }
}

// ---------------------------------------------------------------- the build

export function run(input) {
  const slugCache = new Map();
  const slugify = (t) => {
    let s = slugCache.get(t);
    if (s === undefined) { s = slugifyRaw(t); slugCache.set(t, s); }
    return s;
  };

  // -- Markdown (single-pass renderer; closures capture slugify/link state)
  const ESCAPABLE = new Set(['\\', '`', '*', '_', '[', ']', '(', ')', '#', '+', '-', '.', '!', '>']);
  const WS_RE = /\s/;

  // First index >= from where s holds `what` outside a backslash escape, or -1.
  // A candidate is skipped exactly when an odd run of '\' precedes it.
  function findUnescaped(s, what, from) {
    let j = s.indexOf(what, from);
    while (j !== -1) {
      let b = j - 1;
      let n = 0;
      while (b >= from && s.charCodeAt(b) === 92) { n++; b--; }
      if (n % 2 === 0) return j;
      j = s.indexOf(what, j + 1);
    }
    return -1;
  }

  // First single '*' (not part of '**', not escaped) from `from`, or -1.
  function findSingleStar(s, from) {
    let j = s.indexOf('*', from);
    while (j !== -1) {
      let b = j - 1;
      let n = 0;
      while (b >= from && s.charCodeAt(b) === 92) { n++; b--; }
      if (n % 2 === 1) { j = s.indexOf('*', j + 1); continue; }
      if (s.charCodeAt(j + 1) === 42) { j = s.indexOf('*', j + 2); continue; }
      return j;
    }
    return -1;
  }

  function inlineInto(s, link, out) {
    // The regex finds every character that needs action. Plain runs between
    // them hold no escapable character (the regex would have matched it), so
    // a run is pushed raw; an escapable character is pushed as its entity
    // right here instead of a second escaping pass over the run.
    const re = /[\\`*\[&<>"']/g;
    let last = 0;
    let m;
    while ((m = re.exec(s)) !== null) {
      const j = m.index;
      const c = m[0];
      if (c === '&' || c === '<' || c === '>' || c === '"' || c === "'") {
        if (j > last) out.push(s.slice(last, j));
        out.push(ESC_MAP[c]);
        last = j + 1;
        continue;
      }
      if (c === '\\') {
        if (j + 1 < s.length && ESCAPABLE.has(s[j + 1])) {
          if (j > last) out.push(s.slice(last, j));
          out.push(s[j + 1] === '>' ? '&gt;' : s[j + 1]);
          last = j + 2;
          re.lastIndex = j + 2;
        }
        continue;
      }
      if (c === '`') {
        const k = s.indexOf('`', j + 1);
        if (k > j + 1) {
          if (j > last) out.push(s.slice(last, j));
          out.push('<code>', escapeHtml(s.slice(j + 1, k)), '</code>');
          last = k + 1;
          re.lastIndex = k + 1;
        }
        continue;
      }
      if (c === '*') {
        if (s.charCodeAt(j + 1) === 42) {
          const k = findUnescaped(s, '**', j + 2);
          if (k > j + 2) {
            if (j > last) out.push(s.slice(last, j));
            out.push('<strong>');
            inlineInto(s.slice(j + 2, k), link, out);
            out.push('</strong>');
            last = k + 2;
            re.lastIndex = k + 2;
          } else {
            re.lastIndex = j + 2; // a failed '**' is skipped whole, as in the reference
          }
          continue;
        }
        const k = findSingleStar(s, j + 1);
        if (k > j + 1) {
          if (j > last) out.push(s.slice(last, j));
          out.push('<em>');
          inlineInto(s.slice(j + 1, k), link, out);
          out.push('</em>');
          last = k + 1;
          re.lastIndex = k + 1;
        }
        continue;
      }
      if (c === '[') {
        const k = findUnescaped(s, ']', j + 1);
        if (k !== -1 && s.charCodeAt(k + 1) === 40) {
          const m2 = s.indexOf(')', k + 2);
          if (m2 !== -1) {
            const target = s.slice(k + 2, m2);
            if (target !== '' && !WS_RE.test(target)) {
              if (j > last) out.push(s.slice(last, j));
              out.push('<a href="', escapeHtml(link(target)), '">');
              inlineInto(s.slice(j + 1, k), link, out);
              out.push('</a>');
              last = m2 + 1;
              re.lastIndex = m2 + 1;
              continue;
            }
          }
        }
        continue;
      }
    }
    if (s.length > last) out.push(s.slice(last));
  }

  const isBlank = (line) => {
    for (let i = 0; i < line.length; i++) {
      const c = line.charCodeAt(i);
      if (c !== 32 && c !== 9) return false;
    }
    return true;
  };

  const trimLine = (line) => {
    let a = 0;
    let b = line.length;
    while (a < b && (line.charCodeAt(a) === 32 || line.charCodeAt(a) === 9)) a++;
    while (b > a && (line.charCodeAt(b - 1) === 32 || line.charCodeAt(b - 1) === 9)) b--;
    return line.slice(a, b);
  };

  // Fence open: line of ``` + optional language, spaces/tabs only after.
  // Returns the language, or null when the line is no fence open.
  function fenceLang(line) {
    if (line.charCodeAt(0) !== 96 || line.charCodeAt(1) !== 96 || line.charCodeAt(2) !== 96) return null;
    let i = 3;
    let lang = '';
    while (i < line.length) {
      const c = line.charCodeAt(i);
      if ((c >= 65 && c <= 90) || (c >= 97 && c <= 122) || (c >= 48 && c <= 57) || c === 95 || c === 43 || c === 45) { lang += line[i]; i++; }
      else break;
    }
    while (i < line.length) {
      const c = line.charCodeAt(i);
      if (c !== 32 && c !== 9) return null;
      i++;
    }
    return lang;
  }

  function fenceClose(line) {
    if (line.charCodeAt(0) !== 96 || line.charCodeAt(1) !== 96 || line.charCodeAt(2) !== 96) return false;
    let i = 3;
    while (i < line.length) {
      const c = line.charCodeAt(i);
      if (c !== 32 && c !== 9) return false;
      i++;
    }
    return true;
  }

  function headingOf(line) {
    let h = 0;
    while (h < line.length && line.charCodeAt(h) === 35) h++;
    if (h === 0 || h > 6) return null;
    let j = h;
    while (j < line.length && (line.charCodeAt(j) === 32 || line.charCodeAt(j) === 9)) j++;
    if (j === h) return null;
    let e = line.length;
    while (e > j && (line.charCodeAt(e - 1) === 32 || line.charCodeAt(e - 1) === 9)) e--;
    if (e === j) return null;
    return { depth: h, text: line.slice(j, e) };
  }

  function isHR(line) {
    if (line.startsWith('---') || line.startsWith('***')) {
      let i = 3;
      while (i < line.length) {
        const c = line.charCodeAt(i);
        if (c !== 32 && c !== 9) return false;
        i++;
      }
      return true;
    }
    return false;
  }

  function endsParagraph(line) {
    if (line === '') return true;
    const c0 = line.charCodeAt(0);
    if (c0 === 32 || c0 === 9) return isBlank(line);
    if (c0 === 96 && line.charCodeAt(1) === 96 && line.charCodeAt(2) === 96) return fenceLang(line) !== null;
    if (c0 === 35) return headingOf(line) !== null;
    if (c0 === 45 || c0 === 42) return isHR(line);
    return false;
  }

  // A list marker: { ordered, start, content } or null.
  function listMarker(line) {
    const c0 = line.charCodeAt(0);
    if ((c0 === 45 || c0 === 42) && line.charCodeAt(1) === 32) return { ordered: false, start: 1, content: line.slice(2) };
    let i = 0;
    while (i < line.length && line.charCodeAt(i) >= 48 && line.charCodeAt(i) <= 57) i++;
    if (i > 0 && i <= 9 && line.charCodeAt(i) === 46 && line.charCodeAt(i + 1) === 32) {
      return { ordered: true, start: Number(line.slice(0, i)), content: line.slice(i + 2) };
    }
    return null;
  }

  function isContinued(line) {
    let i = 0;
    while (line.charCodeAt(i) === 32) i++;
    if (i < 2) return false;
    const ch = line[i];
    return ch !== undefined && !WS_RE.test(ch);
  }

  function renderMarkdown(src, link) {
    const lines = src.split('\n');
    const n = lines.length;
    const blocks = [];
    const toc = [];
    const ids = new Set();
    let excerpt = null;
    let i = 0;

    // One list starting at lines[i] with its first marker already read.
    const renderList = (firstMk) => {
      const isOrd = firstMk.ordered;
      const items = [];
      const start = firstMk.start;
      items.push([trimLine(firstMk.content)]);
      i++;
      while (i < n) {
        const m2 = listMarker(lines[i]);
        if (m2 !== null && m2.ordered === isOrd) { items.push([trimLine(m2.content)]); i++; }
        else if (isContinued(lines[i])) { items[items.length - 1].push(trimLine(lines[i])); i++; }
        else break;
      }
      const tag = isOrd ? 'ol' : 'ul';
      const open = isOrd && start !== 1 ? `<ol start="${start}">` : `<${tag}>`;
      const parts = [`${open}\n`];
      for (const itemParts of items) {
        const out = [];
        inlineInto(itemParts.join('\n'), link, out);
        parts.push(`<li>${out.join('')}</li>\n`);
      }
      parts.push(`</${tag}>`);
      blocks.push(parts.join(''));
    };

    while (i < n) {
      const line = lines[i];
      if (line === '') { i++; continue; }
      const c0 = line.charCodeAt(0);
      if (c0 === 32 || c0 === 9) {
        if (isBlank(line)) { i++; continue; }
        // Indented line: a paragraph line (never a fence, heading or list).
      } else if (c0 === 96 && line.charCodeAt(1) === 96 && line.charCodeAt(2) === 96) {
        const lang = fenceLang(line);
        if (lang !== null) {
          const body = [];
          i++;
          while (i < n && !fenceClose(lines[i])) body.push(lines[i++]);
          i++;
          const code = body.length ? `${escapeHtml(body.join('\n'))}\n` : '';
          blocks.push(`<pre><code${lang === '' ? '' : ` class="language-${lang}"`}>${code}</code></pre>`);
          continue;
        }
      } else if (c0 === 35) {
        const hd = headingOf(line);
        if (hd !== null) {
          const id = uniqueSlug(slugify(hd.text), ids);
          const out = [];
          inlineInto(hd.text, link, out);
          const html = out.join('');
          blocks.push(`<h${hd.depth} id="${id}">${html}</h${hd.depth}>`);
          if (hd.depth === 2 || hd.depth === 3) toc.push({ level: hd.depth, id, html });
          i++;
          continue;
        }
      } else if (c0 === 45 || c0 === 42) {
        if (isHR(line)) { blocks.push('<hr>'); i++; continue; }
        const mk = listMarker(line);
        if (mk !== null) { renderList(mk); continue; }
      } else if (c0 === 62) {
        const body = [];
        while (i < n && lines[i].charCodeAt(0) === 62) {
          let l = lines[i++];
          l = l.slice(1);
          if (l.charCodeAt(0) === 32) l = l.slice(1);
          body.push(l);
        }
        const ls = body.map(trimLine).filter((l) => l !== '');
        if (ls.length === 0) blocks.push('<blockquote>\n</blockquote>');
        else {
          const out = [];
          inlineInto(ls.join('\n'), link, out);
          blocks.push(`<blockquote>\n<p>${out.join('')}</p>\n</blockquote>`);
        }
        continue;
      } else if (c0 >= 48 && c0 <= 57) {
        const mk = listMarker(line);
        if (mk !== null) { renderList(mk); continue; }
      }
      // Paragraph: this line and the lines after it up to a blank line, a
      // fence, a heading or a thematic break.
      const body = [trimLine(line)];
      i++;
      while (i < n && !endsParagraph(lines[i])) body.push(trimLine(lines[i++]));
      const out = [];
      inlineInto(body.join('\n'), link, out);
      const html = out.join('');
      if (excerpt === null) excerpt = html;
      blocks.push(`<p>${html}</p>`);
    }
    return { html: blocks.length ? blocks.map((b) => `${b}\n`).join('') : '', toc, excerpt: excerpt === null ? '' : excerpt };
  }

  function countWords(text) {
    let n = 0;
    let i = 0;
    const len = text.length;
    while (i < len) {
      const c = text.charCodeAt(i);
      if (c === 32 || c === 9 || c === 10 || c === 13 || c === 12 || c === 11) { i++; continue; }
      if (c >= 128 && WS_RE.test(text[i])) { i++; continue; }
      n++;
      i++;
      while (i < len) {
        const d = text.charCodeAt(i);
        if (d === 32 || d === 9 || d === 10 || d === 13 || d === 12 || d === 11) break;
        if (d >= 128 && WS_RE.test(text[i])) break;
        i++;
      }
    }
    return n;
  }

  function resolvePathRaw(dir, rel) {
    const parts = dir === '' ? [] : dir.split('/');
    const segs = rel.split('/');
    for (let s = 0; s < segs.length; s++) {
      const seg = segs[s];
      if (seg === '' || seg === '.') continue;
      if (seg === '..') {
        if (parts.length === 0) return null;
        parts.pop();
      } else parts.push(seg);
    }
    return parts.join('/');
  }

  // -- 1. templates, in code-unit order of name
  const templates = new Map();
  const report = [];
  for (const name of Object.keys(input.templates).sort(byCodeUnits)) {
    try {
      templates.set(name, parseTemplate(name, input.templates[name]));
    } catch (err) {
      if (!(err instanceof TemplateError)) throw err;
      report.push(err.message);
    }
  }
  const base = input.site.base_url.replace(/\/+$/, '');

  // Which templates may be cached across pages: those whose every read
  // (transitively through includes) is a first segment of site, tags or
  // recent only. Read sets propagate over the include graph to a fixpoint,
  // so cycles stay conservative.
  const ROOT_ONLY = new Set(['site', 'tags', 'recent']);
  const readSets = new Map();
  const includeEdges = new Map();
  const collectReads = (nodes, reads, includes) => {
    for (const node of nodes) {
      if (node.kind === 'var' || node.kind === 'raw' || node.kind === 'if' || node.kind === 'for') reads.add(node.path[0]);
      if (node.kind === 'for') collectReads(node.body, reads, includes);
      else if (node.kind === 'if') {
        collectReads(node.then, reads, includes);
        if (node.else !== null) collectReads(node.else, reads, includes);
      } else if (node.kind === 'include') includes.add(node.name);
    }
  };
  for (const [name, nodes] of templates) {
    const reads = new Set();
    const includes = new Set();
    collectReads(nodes, reads, includes);
    readSets.set(name, reads);
    includeEdges.set(name, includes);
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const [name, reads] of readSets) {
      for (const inc of includeEdges.get(name)) {
        const sub = readSets.get(inc);
        if (!sub) continue;
        for (const s of sub) {
          if (!reads.has(s)) { reads.add(s); changed = true; }
        }
      }
    }
  }
  const cacheable = new Set();
  for (const [name, reads] of readSets) {
    let ok = true;
    for (const s of reads) {
      if (!ROOT_ONLY.has(s)) { ok = false; break; }
    }
    if (ok) cacheable.add(name);
  }
  const ctx = { templates, cacheable, cache: new Map() };

  // -- 2. sources, sorted by path; .md is a source, the rest static
  const files = [...input.files].sort((x, y) => byCodeUnits(x.path, y.path));
  const sources = [];
  const statics = [];
  for (const f of files) {
    if (f.path.endsWith('.md')) sources.push({ path: f.path, text: f.content.replace(/\r\n?/g, '\n') });
    else statics.push({ path: f.path, content: f.content });
  }

  // -- 3. front matter and the refusal/draft checks, in order
  const kept = [];
  for (const s of sources) {
    const fm = parseFM(s.text);
    if ('error' in fm) {
      report.push(`refused ${s.path}: ${fm.error}`);
      continue;
    }
    s.data = fm.data;
    s.body = fm.body;
    s.post = s.path.startsWith('posts/');
    let own;
    if (s.path.startsWith('tags/')) own = 'tags';
    else if (s.path.startsWith('page/')) own = 'page';
    if (own !== undefined) {
      report.push(`refused ${s.path}: ${own}/ is the generator's own`);
      continue;
    }
    if (s.post && !Object.hasOwn(s.data, 'date')) {
      report.push(`refused ${s.path}: a post needs a date`);
      continue;
    }
    const layout = s.data.layout ?? (s.post ? 'post' : 'page');
    if (!templates.has(layout)) {
      report.push(`refused ${s.path}: layout "${layout}" is no template that parses`);
      continue;
    }
    s.layout = layout;
    if (s.data.draft === true) {
      report.push(`draft ${s.path}`);
      continue;
    }
    kept.push(s);
  }

  // -- 4. permalinks: slug made unique in its directory, in source order
  const taken = new Map();
  const bySource = new Map();
  for (const s of kept) {
    const dir = s.post ? 'posts' : dirOf(s.path);
    let set = taken.get(dir);
    if (!set) {
      set = new Set(dir === '' ? ['posts', 'tags', 'page'] : []);
      taken.set(dir, set);
    }
    const slug = uniqueSlug(s.data.slug ?? slugify(s.data.title), set);
    s.slug = slug;
    s.outDir = dir === '' ? slug : `${dir}/${slug}`;
    s.url = `${base}/${s.outDir}/`;
    bySource.set(s.path, s);
  }

  // -- 5. Markdown, links resolved
  const staticPaths = new Set(statics.map((f) => f.path));
  const broken = new Set();
  const resolveCache = new Map();
  const SCHEME_RE = /^[A-Za-z][A-Za-z0-9+.-]*:/;
  for (const s of kept) {
    const dir = dirOf(s.path);
    const spath = s.path;
    const link = (target) => {
      if (SCHEME_RE.test(target) || target.charCodeAt(0) === 47 || target.charCodeAt(0) === 35) return target;
      const hash = target.indexOf('#');
      const rel = hash === -1 ? target : target.slice(0, hash);
      const frag = hash === -1 ? '' : target.slice(hash);
      let path = null;
      if (rel !== '') {
        const key = `${dir}\n${rel}`;
        if (resolveCache.has(key)) path = resolveCache.get(key);
        else {
          path = resolvePathRaw(dir, rel);
          resolveCache.set(key, path);
        }
      }
      if (path !== null && bySource.has(path)) return `${bySource.get(path).url}${frag}`;
      if (path !== null && staticPaths.has(path)) return `${base}/${path}${frag}`;
      broken.add(`broken-link ${spath} -> ${target}`);
      return target;
    };
    const md = renderMarkdown(s.body, link);
    s.html = md.html;
    s.toc = md.toc;
    s.excerpt = md.excerpt;
    s.words = countWords(s.body);
  }

  // -- 6. collections: posts newest first, equal dates by slug
  const posts = kept.filter((s) => s.post);
  posts.sort((x, y) => byCodeUnits(y.data.date, x.data.date) || byCodeUnits(x.slug, y.slug));
  posts.forEach((p, k) => {
    p.newer = k === 0 ? null : posts[k - 1];
    p.older = k === posts.length - 1 ? null : posts[k + 1];
  });

  // -- 7. tags
  const bySlug = new Map();
  const ownTags = (s) => {
    const seen = new Set();
    const out = [];
    for (const name of s.data.tags ?? []) {
      const slug = slugify(name);
      if (!seen.has(slug)) { seen.add(slug); out.push(name); }
    }
    return out;
  };
  for (const p of posts) {
    p.tagRefs = [];
    for (const name of ownTags(p)) {
      const slug = slugify(name);
      let tag = bySlug.get(slug);
      if (!tag) {
        tag = { name, slug, url: `${base}/tags/${slug}/`, posts: [] };
        bySlug.set(slug, tag);
      }
      tag.posts.push(p);
      p.tagRefs.push(tag);
    }
  }
  for (const s of kept) {
    if (s.post) continue;
    s.tagRefs = ownTags(s).map((name) => {
      const slug = slugify(name);
      return bySlug.get(slug) ?? { name, slug, url: '', posts: [] };
    });
  }
  const tags = [...bySlug.values()].sort((x, y) => y.posts.length - x.posts.length || byCodeUnits(x.slug, y.slug));

  // -- 8. layouts
  const cardOf = (s) => ({
    title: s.data.title,
    url: s.url,
    date: s.data.date ?? '',
    date_long: s.data.date === undefined ? '' : longDate(s.data.date),
    summary: s.data.summary ?? '',
    excerpt: s.excerpt,
    reading_minutes: Math.max(1, Math.ceil(s.words / 200)),
    tags: s.tagRefs.map((t) => ({ name: t.name, slug: t.slug, url: t.url })),
  });
  const linkOf = (s) => (s === null ? null : {
    title: s.data.title,
    url: s.url,
    date: s.data.date ?? '',
    date_long: s.data.date === undefined ? '' : longDate(s.data.date),
  });
  const cards = new Map(posts.map((p) => [p, cardOf(p)]));
  const site = { title: input.site.title, base_url: base };
  const allTags = tags.map((t) => ({ name: t.name, slug: t.slug, url: t.url, count: t.posts.length }));
  const recent = posts.slice(0, input.site.recent).map((p) => cards.get(p));
  const output = {};
  const render = (name, vars) => {
    const nodes = templates.get(name);
    if (nodes === undefined) return null;
    const out = [];
    renderNodes(nodes, [{ site, tags: allTags, recent, ...vars }], ctx, 0, out);
    return out.join('');
  };
  for (const s of kept) {
    const page = {
      ...cardOf(s),
      slug: s.slug,
      content: s.html,
      toc: s.toc.map((h) => ({ level: h.level, id: h.id, html: h.html })),
      newer: linkOf(s.newer ?? null),
      older: linkOf(s.older ?? null),
      is_post: s.post,
    };
    output[`${s.outDir}/index.html`] = render(s.layout, { page });
  }
  const per = input.site.per_page;
  const pages = Math.max(1, Math.ceil(posts.length / per));
  const indexUrl = (k) => (k === 1 ? `${base}/` : `${base}/page/${k}/`);
  for (let k = 1; k <= pages; k++) {
    const html = render('index', {
      posts: posts.slice((k - 1) * per, k * per).map((p) => cards.get(p)),
      pager: { number: k, total: pages, url: indexUrl(k), newer_url: k === 1 ? '' : indexUrl(k - 1), older_url: k === pages ? '' : indexUrl(k + 1) },
    });
    if (html !== null) output[k === 1 ? 'index.html' : `page/${k}/index.html`] = html;
  }
  for (const t of tags) {
    const html = render('tag', { tag: { name: t.name, slug: t.slug, url: t.url, count: t.posts.length, posts: t.posts.map((p) => cards.get(p)) } });
    if (html !== null) output[`tags/${t.slug}/index.html`] = html;
  }
  const tagsHtml = render('tags', {});
  if (tagsHtml !== null) output['tags/index.html'] = tagsHtml;
  for (const f of statics) {
    if (Object.hasOwn(output, f.path)) report.push(`shadowed ${f.path}: a built page has its path`);
    else output[f.path] = f.content;
  }

  // -- 9. report
  const lines = [...report, ...broken].sort(byCodeUnits);
  const pageCount = kept.filter((s) => !s.post).length;
  lines.push(`built ${pageCount} pages, ${posts.length} posts, ${tags.length} tags and ${statics.length} static files`);
  output['build-report.txt'] = `${lines.join('\n')}\n`;
  return output;
}
