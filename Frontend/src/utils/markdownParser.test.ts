import test from 'node:test';
import assert from 'node:assert/strict';
import {
  tokenizeInline,
  parseMarkdownBlocks,
  beautifyOutsideMath,
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
