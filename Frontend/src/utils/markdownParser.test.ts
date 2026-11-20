import test from 'node:test';
import assert from 'node:assert/strict';
import {
  tokenizeInline,
  parseMarkdownBlocks,
  beautifyOutsideMath,
  stripHighlightMarkers,
} from './markdownParser.ts';

test('tokenizeInline parses bold, code, and citations correctly', () => {
  const text = 'Your platelet count is **120 x10^9/L** [1] with `smear verified`.';
  const tokens = tokenizeInline(text);

  assert.equal(tokens.length, 7);
  assert.equal(tokens[0].type, 'text');
  assert.equal(tokens[0].text, 'Your platelet count is ');
  assert.equal(tokens[1].type, 'bold');
  assert.equal(tokens[1].text, '120 x10^9/L');
  assert.equal(tokens[2].type, 'text');
  assert.equal(tokens[2].text, ' ');
  assert.equal(tokens[3].type, 'citation');
  if (tokens[3].type === 'citation') {
    assert.equal(tokens[3].citationIndex, 1);
  }
  assert.equal(tokens[4].type, 'text');
  assert.equal(tokens[4].text, ' with ');
  assert.equal(tokens[5].type, 'code');
  assert.equal(tokens[5].text, 'smear verified');
  assert.equal(tokens[6].type, 'text');
  assert.equal(tokens[6].text, '.');
});

test('parseMarkdownBlocks parses headings, lists, and blockquotes', () => {
  const md = `### 1. Key Laboratory Findings
* Platelet count is low [1]
* Hemoglobin is normal [2]

> **Clinical Guidance:** Follow up in 2 weeks.`;

  const blocks = parseMarkdownBlocks(md);

  assert.equal(blocks.length, 3);
  assert.equal(blocks[0].type, 'heading');
  assert.equal(blocks[0].level, 3);
  assert.equal(blocks[0].content, '1. Key Laboratory Findings');

  assert.equal(blocks[1].type, 'bullet-list');
  assert.equal(blocks[1].items?.length, 2);
  assert.equal(blocks[1].items?.[0], 'Platelet count is low [1]');

  assert.equal(blocks[2].type, 'blockquote');
  assert.equal(blocks[2].content, '**Clinical Guidance:** Follow up in 2 weeks.');
});

test('tokenizeInline extracts inline LaTeX math', () => {
  const text = 'RBC Count: 5.47 $10^9/\\mu\\text{l}$ per litre';
  const tokens = tokenizeInline(text);

  assert.equal(tokens.length, 3);
  assert.equal(tokens[0].type, 'text');
  assert.equal(tokens[0].text, 'RBC Count: 5.47 ');
  assert.equal(tokens[1].type, 'math');
  if (tokens[1].type === 'math') {
    assert.equal(tokens[1].tex, '10^9/\\mu\\text{l}');
    assert.equal(tokens[1].displayMode, false);
  }
  assert.equal(tokens[2].type, 'text');
  assert.equal(tokens[2].text, ' per litre');
});

test('tokenizeInline keeps currency amounts as plain text', () => {
  const tokens = tokenizeInline('The panel costs $5 and $10 extra today');
  assert.ok(tokens.every((t) => t.type !== 'math'));
});

test('tokenizeInline extracts \\(..\\) and display $$..$$ math', () => {
  const inline = tokenizeInline('Value \\(x^2\\) here');
  assert.equal(inline.length, 3);
  assert.equal(inline[1].type, 'math');
  if (inline[1].type === 'math') {
    assert.equal(inline[1].tex, 'x^2');
    assert.equal(inline[1].displayMode, false);
  }

  const display = tokenizeInline('Given $$\\frac{a}{b}$$ follows');
  assert.equal(display[1].type, 'math');
  if (display[1].type === 'math') {
    assert.equal(display[1].tex, '\\frac{a}{b}');
    assert.equal(display[1].displayMode, true);
  }
});

test('tokenizeInline leaves unterminated math as plain text (mid-stream)', () => {
  const tokens = tokenizeInline('Result: $10^9/\\mu');
  assert.ok(tokens.every((t) => t.type !== 'math'));
});

test('parseMarkdownBlocks parses a display math block', () => {
  const md = 'Intro paragraph.\n\n$$\nE = mc^2\n$$\n\nOutro paragraph.';
  const blocks = parseMarkdownBlocks(md);

  assert.equal(blocks.length, 3);
  assert.equal(blocks[1].type, 'math-block');
  assert.equal(blocks[1].content, 'E = mc^2');
});

test('beautifyOutsideMath leaves formulas untouched, beautifies prose', () => {
  const out = beautifyOutsideMath('Count 240 x10^9/L and $10^{9}/\\mu\\text{l}$ done');
  assert.equal(out, 'Count 240 × 10⁹/L and $10^{9}/\\mu\\text{l}$ done');
});

test('highlights preserve exact text and adjacent citation tokens', () => {
  const tokens = tokenizeInline('The report describes ==possible findings==. [[cite:E1, E2]]');
  assert.deepEqual(tokens.find((t) => t.type === 'highlight'), {
    type: 'highlight', text: 'possible findings', closed: true,
  });
  assert.deepEqual(tokens.at(-1), { type: 'evidence-citation', evidenceIds: ['E1', 'E2'] });
  assert.equal(tokenizeInline('==first== and ==second==').filter((t) => t.type === 'highlight').length, 2);
});

test('every streaming prefix hides opening and closing highlight delimiters', () => {
  const text = 'Result: ==requires confirmation==';
  const visibleText = (prefix: string) => tokenizeInline(prefix, undefined, { isStreaming: true })
    .map((token) => 'text' in token ? token.text : '').join('');
  for (let length = 0; length <= text.length; length++) {
    const prefix = text.slice(0, length);
    const visible = visibleText(prefix);
    assert.ok(!visible.includes('='), `raw delimiter at prefix ${JSON.stringify(prefix)}`);
    assert.equal(stripHighlightMarkers(prefix, true), visible);
    if (length > text.indexOf('==') + 2) {
      assert.ok(tokenizeInline(prefix, undefined, { isStreaming: true }).some((t) => t.type === 'highlight'));
    }
  }
});

test('unclosed highlights become ordinary text after streaming ends', () => {
  assert.deepEqual(tokenizeInline('==Incomplete finding'), [{ type: 'text', text: 'Incomplete finding' }]);
  const tokens = tokenizeInline('==Incomplete finding [[cite:E1]]');
  assert.ok(tokens.every((t) => t.type !== 'highlight'));
  assert.deepEqual(tokens.at(-1), { type: 'evidence-citation', evidenceIds: ['E1'] });
  assert.deepEqual(tokenizeInline('===='), []);
  assert.ok(tokenizeInline('==first\nsecond==').every((t) => t.type !== 'highlight'));
});

test('code, formulas, escaped delimiters, and equality operators remain literal', () => {
  for (const text of ['`a == b`', '$x_{a==b}$', '$$x == y$$', '\\(x == y\\)', '\\[x == y\\]',
    'a = b', 'a == b', 'a===b', '\\==literal\\==']) {
    assert.ok(tokenizeInline(text).every((t) => t.type !== 'highlight'), text);
    assert.equal(stripHighlightMarkers(text), text);
  }
  const tokens = tokenizeInline('==Compare `a == b` and $x_{a==b}$==');
  assert.equal(tokens.length, 1);
  assert.equal(tokens[0].type, 'highlight');
  if (tokens[0].type === 'highlight') {
    const inner = tokenizeInline(tokens[0].text, undefined, { allowHighlights: false });
    assert.ok(inner.some((t) => t.type === 'code'));
    assert.ok(inner.some((t) => t.type === 'math'));
    assert.ok(inner.every((t) => t.type !== 'highlight'));
  }
});

test('bold and highlights nest without nested highlight tokens', () => {
  const outerHighlight = tokenizeInline('==**important** finding==')[0];
  assert.equal(outerHighlight.type, 'highlight');
  if (outerHighlight.type === 'highlight') {
    assert.equal(tokenizeInline(outerHighlight.text, undefined, { allowHighlights: false })[0].type, 'bold');
  }
  const outerBold = tokenizeInline('**A ==key finding==**')[0];
  assert.equal(outerBold.type, 'bold');
  if (outerBold.type === 'bold') assert.ok(tokenizeInline(outerBold.text).some((t) => t.type === 'highlight'));
});

test('highlight text survives headings, lists, tables, and saved message reloads', () => {
  const saved = '## ==Findings==\n\n- A ==key caveat==. [[cite:E1]]\n\n| Test | Result |\n|---|---|\n| Value | ==12== |';
  const restored = JSON.parse(JSON.stringify({ content: saved })).content;
  const blocks = parseMarkdownBlocks(restored);
  assert.ok(tokenizeInline(blocks[0].content ?? '').some((t) => t.type === 'highlight'));
  assert.ok(tokenizeInline(blocks[1].items?.[0] ?? '').some((t) => t.type === 'highlight'));
  assert.ok(tokenizeInline(blocks[2].tableData?.rows[0][1] ?? '').some((t) => t.type === 'highlight'));
});

test('copy removes only highlight syntax and preserves Markdown, citations, math, and code', () => {
  const text = '**==Important==**: ==a caveat==. [[cite:E2]]\n`a == b` and $x_{a==b}$';
  assert.equal(stripHighlightMarkers(text), '**Important**: a caveat. [[cite:E2]]\n`a == b` and $x_{a==b}$');
  assert.equal(stripHighlightMarkers('==An incomplete finding'), 'An incomplete finding');
});
