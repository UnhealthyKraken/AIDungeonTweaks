const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../ai-dungeon-tweaks.user.js'), 'utf8');

// Small DOM fixture: preserve node identities and implement the selectors used by
// the formatter. Execute the production functions, not copies of their logic.
class Element {
  constructor(tag = 'div', attrs = {}, children = []) {
    this.tagName = tag.toUpperCase(); this.attrs = attrs; this.id = attrs.id || '';
    this.childNodes = []; this.classList = { add: () => {} };
    children.forEach(n => this.appendChild(typeof n === 'string' ? new Text(n) : n));
  }
  get children() { return this.childNodes.filter(n => n instanceof Element); }
  get textContent() { return this.childNodes.map(n => n.textContent).join(''); }
  get innerHTML() { return this.html ?? this.textContent; }
  set innerHTML(html) {
    this.childNodes.forEach(n => n.parentNode = null); this.childNodes = []; this.html = html;
    // Production emits a generated span. Keep its rendered text in the tree so
    // overlapping roots really see the output and can expose duplicate work.
    this.appendChild(new Text(html.replace(/<[^>]+>/g, '')));
  }
  get className() { return this.attrs.class || ''; }
  set className(value) { this.attrs.class = value; }
  getAttribute(k) { return this.attrs[k] ?? null; }
  setAttribute(k, v) { this.attrs[k] = v; }
  matches(selector) {
    return selector.split(',').some(raw => {
      const s = raw.trim();
      if (s === '.aidt') return (this.attrs.class || '').split(' ').includes('aidt');
      if (s.startsWith('#')) return this.id === s.slice(1);
      if (s.startsWith('[')) { const m = s.match(/^\[([^=\]]+)(?:="?([^"\]]+)"?)?\]$/); return m && (m[2] ? this.attrs[m[1]] === m[2] : m[1] in this.attrs); }
      return this.tagName.toLowerCase() === s;
    });
  }
  closest(s) { return this.matches(s) ? this : this.parentNode?.closest(s) || null; }
  querySelectorAll(s) { return this.children.flatMap(n => [...(n.matches(s) ? [n] : []), ...n.querySelectorAll(s)]); }
  querySelector(s) { return this.querySelectorAll(s)[0] || null; }
  appendChild(n) { n.parentNode = this; this.childNodes.push(n); return n; }
  removeChild(n) { const i = this.childNodes.indexOf(n); if (i < 0) throw Error('not a child'); this.childNodes.splice(i, 1); n.parentNode = null; return n; }
  insertBefore(n, ref) { if (!ref) return this.appendChild(n); const i = this.childNodes.indexOf(ref); if (i < 0) throw Error('not a child'); n.parentNode = this; this.childNodes.splice(i, 0, n); return n; }
}
class Text {
  constructor(s) { this.nodeValue = s; }
  get textContent() { return this.nodeValue; }
  replaceWith(n) { const p = this.parentNode; const i = p.childNodes.indexOf(this); p.childNodes[i] = n; n.parentNode = p; this.parentNode = null; }
}
function extract(start, end) {
  const a = source.indexOf(start), b = source.indexOf(end, a);
  assert.ok(a >= 0 && b > a, `production function boundaries: ${start}`);
  return source.slice(a, b);
}
function fixture(roots) {
  const context = {
    roots, transformed: [], settings: { enabled: true, textFormatting: { keywords: [] }, allCapsEffect: 'None' },
    window: {}, __aidt_isDebugEnabled: () => false, getRoots: () => roots,
    isDanger: n => ['BODY', 'HTML', 'SCRIPT', 'STYLE'].includes(n.tagName),
    txt: n => n.textContent, hasScript: n => !!n.querySelector('script,style,template'),
    MARKER_RE: /\*/, CAPS_MARKER_RE: /[A-Z]{2}/,
    NodeFilter: { SHOW_TEXT: 4, FILTER_ACCEPT: 1, FILTER_REJECT: 2 },
    getBaselineTextFor: (_, text) => text,
    transformString: text => { context.transformed.push(text); return text.replace(/\*([^*]+)\*/g, '<span class="aidt">$1</span>'); },
    document: {
      createElement: tag => new Element(tag),
      createTreeWalker(root, _, filter) {
        const nodes = [];
        function visit(n) { if (n instanceof Text) { if (filter.acceptNode(n) === 1) nodes.push(n); } else n.childNodes.forEach(visit); }
        visit(root); let i = 0; return { nextNode: () => nodes[i++] || null };
      }
    }
  };
  vm.createContext(context);
  vm.runInContext(extract('  function __aidt_guardElement', '  // AIDT: Safely track'), context);
  vm.runInContext(extract('  function AIDT_replaceHTML', '  let profiles'), context);
  vm.runInContext(extract('  // ---------------- Parser (deep text walker)', '  const reparse    =') + '\nthis.parse = parseRootsDeep;', context);
  return context;
}
test('deep formatting preserves story paragraphs, action controls and overlapping roots', () => {
  const first = new Element('span', { id: 'transition-opacity' }, ['*first*']);
  const second = new Element('span', { id: 'transition-opacity' }, ['*second*']);
  const button = new Element('button', {}, ['*edit*']);
  const action = new Element('div', { id: 'transition-opacity' }, [new Element('span', { id: 'action-icon' }, ['w_comment']), '*say*']);
  const story = new Element('div', { id: 'gameplay-output' }, [first, second, action, button]);
  const context = fixture([first, story, second]); context.parse();
  assert.deepEqual(story.children, [first, second, action, button]);
  assert.equal(first.children.length, 1); assert.equal(second.children.length, 1);
  assert.equal(first.children[0].html, '<span class="aidt">first</span>');
  assert.equal(button.textContent, '*edit*'); assert.equal(action.textContent, 'w_comment*say*');
  assert.equal(first.__aidt_guarded, true);
  assert.deepEqual(context.transformed, ['*first*', '*second*']);
  context.parse();
  assert.deepEqual(context.transformed, ['*first*', '*second*'], 'repeated sweeps skip generated spans');
});
test('deep formatting leaves editable, ignored and interactive nodes untouched', () => {
  const excluded = ['input','textarea','script','style','template','code','pre','button','a','select','option'].map(tag => new Element(tag, {}, ['*keep*']));
  excluded.push(new Element('span', { contenteditable: 'true' }, ['*typing*']));
  excluded.push(new Element('span', { role: 'button' }, ['*click*']));
  const story = new Element('div', { id: 'gameplay-output' }, excluded);
  fixture([story]).parse();
  for (const node of excluded) assert.equal(node.children.length, 0, node.tagName);
  assert.equal(story.children.length, excluded.length);
});
test('latest replacement refuses containers or editing nodes and guards safe leaves', () => {
  const leaf = new Element('span', {}, ['*story*']);
  const button = new Element('button', {}, ['Edit']);
  const parent = new Element('div', {}, [leaf, button]);
  const context = fixture([]);
  context.AIDT_replaceHTML(parent, 'flattened');
  assert.deepEqual(parent.children, [leaf, button]);
  const editing = new Element('span', { contenteditable: 'true' }, ['typing']);
  context.AIDT_replaceHTML(editing, 'changed'); assert.equal(editing.textContent, 'typing');
  context.AIDT_replaceHTML(leaf, '<span class="aidt">story</span>');
  assert.equal(leaf.__aidt_guarded, true); assert.equal(leaf.html, '<span class="aidt">story</span>');
});

test('overlapping roots transform an unchanged text node only once per sweep', () => {
  const leaf = new Element('span', {}, ['ordinary text']);
  const parent = new Element('div', {}, [leaf]);
  const context = fixture([leaf, parent]); context.parse();
  assert.deepEqual(context.transformed, ['ordinary text']);
});
test('forced latest parsing and retrofit use the same editable-safe text walker', () => {
  const editor = new Element('span', { contenteditable: 'true' }, ['*typing*']);
  const first = new Element('span', {}, ['*story*']);
  const root = new Element('div', {}, [first, editor]);
  const context = fixture([root]);
  vm.runInContext(extract('  const parseWithinRoot =', '  // Prefer visible gameplay text elements') +
    extract('  const retrofitAllCapsAndKeywords =', '  function disableTweaks()') +
    '\nthis.latest = parseWithinRoot; this.retrofit = retrofitAllCapsAndKeywords;', context);
  context.latest(root, true); context.retrofit();
  assert.deepEqual(root.children, [first, editor]);
  assert.equal(editor.textContent, '*typing*');
  assert.deepEqual(context.transformed, ['*story*']);
});
