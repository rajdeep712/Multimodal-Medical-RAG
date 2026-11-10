import test from 'node:test';
import assert from 'node:assert/strict';
import { tokenizeInline, parseMarkdownBlocks } from './markdownParser.ts';

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
