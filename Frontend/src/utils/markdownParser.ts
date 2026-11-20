import { Citation } from '../types/document.ts';

export type InlineToken =
  | { type: 'text'; text: string }
  | { type: 'bold'; text: string }
  | { type: 'italic'; text: string }
  | { type: 'code'; text: string }
  | { type: 'highlight'; text: string; closed: boolean }
  | { type: 'math'; tex: string; displayMode: boolean }
  | { type: 'citation'; citationIndex: number; citation?: Citation }
  | { type: 'evidence-citation'; evidenceIds: string[] };


export interface MarkdownBlock {
  type:
    | 'heading'
    | 'blockquote'
    | 'bullet-list'
    | 'ordered-list'
    | 'table'
    | 'math-block'
    | 'paragraph';
  level?: number;
  content?: string;
  items?: string[];
  tableData?: { headers: string[]; rows: string[][] };
}

const SUPERSCRIPT_DIGITS: Record<string, string> = {
  '0': '⁰',
  '1': '¹',
  '2': '²',
  '3': '³',
  '4': '⁴',
  '5': '⁵',
  '6': '⁶',
  '7': '⁷',
  '8': '⁸',
  '9': '⁹',
  '-': '⁻',
};

function toSuperscript(digits: string): string {
  return digits
    .split('')
    .map((d) => SUPERSCRIPT_DIGITS[d] ?? d)
    .join('');
}

/**
 * Beautifies scientific notation in LLM output:
 * "240 x10^9/L" -> "240 × 10⁹/L", "10^3" -> "10³".
 */
export function beautifyScientificNotation(text: string): string {
  return text
    .replace(
      /(\d+(?:\.\d+)?)\s*[x×]\s*10\^(-?\d+)/g,
      (_match, coefficient: string, exponent: string) =>
        `${coefficient} × 10${toSuperscript(exponent)}`
    )
    .replace(/\b10\^(-?\d+)/g, (_match, exponent: string) => `10${toSuperscript(exponent)}`);
}

/** Matches [[cite:E1]], [[cite E1]], [[cite:E1, E4]], [[cite E1, E4]] */
const CITE_MARKER_PATTERN = /\[\[cite:?\s*([^\]]+)\]\]/i;

/**
 * A single-$ span only counts as math when it carries a LaTeX-ish hint
 * character (\, ^, _, {}) and is space-delimited on neither side — so
 * currency like "$5 and $10" stays plain text while "$10^9/\mu\text{l}$"
 * renders as a formula.
 */
const INLINE_MATH_HINT = /[\\^_{}]/;

function isInlineMathContent(content: string): boolean {
  if (!content) return false;
  if (/\s$/.test(content)) return false; // "$5 and $" — space before closing $
  if (/\\$/.test(content)) return false; // trailing "\" means an escaped $
  return INLINE_MATH_HINT.test(content);
}

/** Math delimiters only — used to protect formulas from other transforms. */
const MATH_SPAN_PATTERN =
  /(\$\$[^$]+\$\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\)|\$(?!\s)(?:[^$\n]+?)\$)/g;

export interface InlineOptions {
  /** True only for the inline text at the current streaming boundary. */
  isStreaming?: boolean;
  allowHighlights?: boolean;
}

function isEscaped(text: string, index: number): boolean {
  let slashes = 0;
  while (index > 0 && text[--index] === '\\') slashes++;
  return slashes % 2 === 1;
}

/** Keep delimiter-like text inside code and formulas literal. */
function protectedInlineEnd(text: string, index: number): number {
  const pattern = /(`[^`]*`|\$\$[^$]+\$\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\)|\$(?!\s)(?:[^$\n]+?)\$)/y;
  pattern.lastIndex = index;
  const match = pattern.exec(text);
  if (!match) return index;
  const raw = match[0];
  if (raw.startsWith('$') && !raw.startsWith('$$') && !isInlineMathContent(raw.slice(1, -1))) return index;
  return pattern.lastIndex;
}

function readHighlight(text: string, start: number, isStreaming: boolean) {
  if (isEscaped(text, start) || /[=\w]/.test(text[start - 1] ?? '')) return null;
  const bodyStart = start + 2;
  // Whitespace-delimited equality operators (x == y) are not emphasis.
  if (text[bodyStart] && /\s|=/.test(text[bodyStart])) return null;
  let end = bodyStart;
  while (end < text.length && text[end] !== '\n' && text[end] !== '\r') {
    const protectedEnd = protectedInlineEnd(text, end);
    if (protectedEnd > end) {
      end = protectedEnd;
      continue;
    }
    if (text.startsWith('==', end) && !isEscaped(text, end)
        && text[end - 1] !== '=' && text[end + 2] !== '='
        && !/\s/.test(text[end - 1] ?? ' ')) {
      return { text: text.slice(bodyStart, end), end: end + 2, closed: true };
    }
    end++;
  }
  let body = text.slice(bodyStart, end);
  if (isStreaming && end === text.length && body.endsWith('=') && !isEscaped(body, body.length - 1)) {
    body = body.slice(0, -1); // First half of a closing marker is still arriving.
  }
  return { text: body, end, closed: false };
}

/** Preserve Markdown/citations and literal code/math while removing highlight syntax. */
export function stripHighlightMarkers(text: string, isStreaming = false): string {
  let result = '';
  for (let index = 0; index < text.length;) {
    const protectedEnd = protectedInlineEnd(text, index);
    if (protectedEnd > index) {
      result += text.slice(index, protectedEnd);
      index = protectedEnd;
      continue;
    }
    const equals = /^={2,}/.exec(text.slice(index))?.[0];
    if (equals) {
      if (equals.length === 4 && !isEscaped(text, index)) {
        index += 4; // Empty highlight.
        continue;
      }
      const highlight = equals.length === 2 ? readHighlight(text, index, isStreaming) : null;
      if (highlight) {
        result += highlight.text;
        index = highlight.end;
        continue;
      }
      result += equals;
      index += equals.length;
      continue;
    }
    if (isStreaming && index === text.length - 1 && text[index] === '='
        && !/[\w=]/.test(text[index - 1] ?? '') && !isEscaped(text, index)) break;
    result += text[index++];
  }
  return result;
}

/**
 * Applies `transform` to the text outside math spans, leaving the math
 * content itself untouched (KaTeX renders it — e.g. beautifying "10^9"
 * to unicode superscripts inside a formula would corrupt it).
 */
export function beautifyOutsideMath(text: string): string {
  const pattern = new RegExp(MATH_SPAN_PATTERN.source, 'g');
  let result = '';
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    const isMath =
      match[0].startsWith('$$') ||
      match[0].startsWith('\\[') ||
      match[0].startsWith('\\(') ||
      isInlineMathContent(match[0].slice(1, -1));
    if (!isMath) continue; // false-positive span stays in the plain chunk
    result += beautifyScientificNotation(text.slice(lastIndex, match.index));
    result += match[0];
    lastIndex = pattern.lastIndex;
  }
  result += beautifyScientificNotation(text.slice(lastIndex));
  return result;
}

/**
 * Tokenizes inline text containing math ($...$ / $$...$$ / \(...\) / \[...\]),
 * bold, italic, code, evidence citations ([[cite:E1]] / [[cite E1, E4]]) and
 * legacy numeric citations [1], [2].
 */
export function tokenizeInline(text: string, citations?: Citation[], options: InlineOptions = {}): InlineToken[] {
  if (!text) return [];

  // Math first so formulas win over bold/italic/code scanning; a code span
  // still protects its content since `` ` `` alternative starts earlier.
  const pattern = new RegExp(
    String.raw`(\$\$[^$]+\$\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\)|\$(?!\s)(?:[^$\n]+?)\$|\*\*[^*]+\*\*|\x60[^\x60]+\x60|\[\[cite:?[^\]]*\]\]|\[\d+\]|\*[^*]+\*)`
      + (options.allowHighlights === false ? '' : '|={2,}'), 'gi',
  );
  const tokens: InlineToken[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    const start = match.index;
    const matchedStr = match[0];

    // Preceding text
    if (start > lastIndex) {
      tokens.push({
        type: 'text',
        text: text.slice(lastIndex, start),
      });
    }

    if (matchedStr.startsWith('==')) {
      const highlight = matchedStr.length === 2 ? readHighlight(text, start, Boolean(options.isStreaming)) : null;
      if (highlight) {
        if (highlight.text) {
          if (highlight.closed || (options.isStreaming && highlight.end === text.length)) {
            tokens.push({ type: 'highlight', text: highlight.text, closed: highlight.closed });
          } else {
            tokens.push(...tokenizeInline(highlight.text, citations, { allowHighlights: false }));
          }
        }
        pattern.lastIndex = highlight.end;
      } else if (matchedStr !== '====' || isEscaped(text, start)) {
        tokens.push({ type: 'text', text: matchedStr });
      }
    } else if (matchedStr.startsWith('$$') && matchedStr.endsWith('$$')) {
      tokens.push({
        type: 'math',
        tex: matchedStr.slice(2, -2).trim(),
        displayMode: true,
      });
    } else if (matchedStr.startsWith('\\[') && matchedStr.endsWith('\\]')) {
      tokens.push({
        type: 'math',
        tex: matchedStr.slice(2, -2).trim(),
        displayMode: true,
      });
    } else if (matchedStr.startsWith('\\(') && matchedStr.endsWith('\\)')) {
      tokens.push({
        type: 'math',
        tex: matchedStr.slice(2, -2).trim(),
        displayMode: false,
      });
    } else if (
      matchedStr.startsWith('$') &&
      matchedStr.endsWith('$') &&
      isInlineMathContent(matchedStr.slice(1, -1))
    ) {
      tokens.push({
        type: 'math',
        tex: matchedStr.slice(1, -1).trim(),
        displayMode: false,
      });
    } else if (matchedStr.toLowerCase().startsWith('[[cite')) {
      // Evidence ids: [[cite:E1]] / [[cite E1, E4]] -> E1, E4
      const evidenceIds = CITE_MARKER_PATTERN.exec(matchedStr)?.[1]
        .split(',')
        .map((id) => id.trim().toUpperCase())
        .filter((id) => /^E\d+$/.test(id));
      if (evidenceIds && evidenceIds.length > 0) {
        tokens.push({ type: 'evidence-citation', evidenceIds });
      } else {
        tokens.push({ type: 'text', text: matchedStr });
      }
    } else if (matchedStr.startsWith('**') && matchedStr.endsWith('**')) {
      tokens.push({
        type: 'bold',
        text: matchedStr.slice(2, -2),
      });
    } else if (matchedStr.startsWith('`') && matchedStr.endsWith('`')) {
      tokens.push({
        type: 'code',
        text: matchedStr.slice(1, -1),
      });
    } else if (matchedStr.startsWith('[') && matchedStr.endsWith(']')) {
      const num = parseInt(matchedStr.slice(1, -1), 10);
      const cit = citations ? citations[num - 1] : undefined;
      tokens.push({
        type: 'citation',
        citationIndex: num,
        citation: cit,
      });
    } else if (matchedStr.startsWith('*') && matchedStr.endsWith('*')) {
      tokens.push({
        type: 'italic',
        text: matchedStr.slice(1, -1),
      });
    } else {
      tokens.push({ type: 'text', text: matchedStr });
    }

    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) {
    let tail = text.slice(lastIndex);
    if (options.isStreaming && options.allowHighlights !== false && tail.endsWith('=')
        && !/[\w=]/.test(text[text.length - 2] ?? '') && !isEscaped(text, text.length - 1)) {
      tail = tail.slice(0, -1);
    }
    if (tail) tokens.push({
      type: 'text',
      text: tail,
    });
  }

  return tokens;
}

/**
 * Parses markdown blocks (headings, blockquotes, lists, tables, paragraphs)
 */
export function parseMarkdownBlocks(raw: string): MarkdownBlock[] {
  if (!raw) return [];

  const lines = raw.split(/\r?\n/);
  const blocks: MarkdownBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Empty line
    if (!line.trim()) {
      i++;
      continue;
    }

    // Heading (e.g. #, ##, ###)
    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      blocks.push({
        type: 'heading',
        level: headingMatch[1].length,
        content: headingMatch[2].trim(),
      });
      i++;
      continue;
    }

    // Display math ($$...$$) — single-line or spanning multiple lines
    if (line.trim().startsWith('$$')) {
      const trimmedLine = line.trim();
      const inner = trimmedLine.slice(2);
      const firstClose = inner.indexOf('$$');
      if (firstClose >= 0) {
        blocks.push({ type: 'math-block', content: inner.slice(0, firstClose).trim() });
        i++;
        continue;
      }
      const mathLines: string[] = [inner];
      i++;
      let closed = false;
      while (i < lines.length) {
        const closeIdx = lines[i].indexOf('$$');
        if (closeIdx >= 0) {
          mathLines.push(lines[i].slice(0, closeIdx));
          i++;
          closed = true;
          break;
        }
        mathLines.push(lines[i]);
        i++;
      }
      const tex = mathLines.join('\n').trim();
      if (closed && tex) {
        blocks.push({ type: 'math-block', content: tex });
      } else {
        // Unterminated (mid-stream) — keep the raw lines as a paragraph.
        blocks.push({
          type: 'paragraph',
          content: [trimmedLine, ...mathLines.slice(1)].join('\n').trim(),
        });
      }
      continue;
    }

    // Blockquote (e.g. > text)
    if (line.trim().startsWith('>')) {
      const quoteLines: string[] = [];
      while (i < lines.length && (lines[i].trim().startsWith('>') || (lines[i].trim() && quoteLines.length > 0 && !lines[i].trim().startsWith('#') && !lines[i].trim().startsWith('* ') && !lines[i].trim().startsWith('- ')))) {
        quoteLines.push(lines[i].replace(/^>\s?/, ''));
        i++;
      }
      blocks.push({
        type: 'blockquote',
        content: quoteLines.join(' ').trim(),
      });
      continue;
    }

    // Markdown Table (e.g. | col 1 | col 2 |)
    if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        tableLines.push(lines[i].trim());
        i++;
      }

      if (tableLines.length >= 2) {
        const parseRow = (r: string) =>
          r
            .split('|')
            .slice(1, -1)
            .map((c) => c.trim());
        const headers = parseRow(tableLines[0]);
        // line 1 is usually separator |---|---|
        const dataRows = tableLines
          .slice(1)
          .filter((r) => !r.includes('---'))
          .map(parseRow);

        blocks.push({
          type: 'table',
          tableData: {
            headers,
            rows: dataRows,
          },
        });
        continue;
      }
    }

    // Bullet list (e.g. * item, - item)
    if (/^[\*\-]\s+/.test(line.trim())) {
      const items: string[] = [];
      while (i < lines.length && /^[\*\-]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[\*\-]\s+/, ''));
        i++;
      }
      blocks.push({
        type: 'bullet-list',
        items,
      });
      continue;
    }

    // Ordered list (e.g. 1. item)
    if (/^\d+\.\s+/.test(line.trim())) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+\.\s+/, ''));
        i++;
      }
      blocks.push({
        type: 'ordered-list',
        items,
      });
      continue;
    }

    // Regular paragraph
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !lines[i].trim().startsWith('#') &&
      !lines[i].trim().startsWith('>') &&
      !/^[\*\-]\s+/.test(lines[i].trim()) &&
      !/^\d+\.\s+/.test(lines[i].trim()) &&
      !(lines[i].trim().startsWith('|') && lines[i].trim().endsWith('|'))
    ) {
      paraLines.push(lines[i]);
      i++;
    }

    blocks.push({
      type: 'paragraph',
      content: paraLines.join('\n').trim(),
    });
  }

  return blocks;
}
