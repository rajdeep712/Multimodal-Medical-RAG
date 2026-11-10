import { Citation } from '../types/document.ts';

export type InlineToken =
  | { type: 'text'; text: string }
  | { type: 'bold'; text: string }
  | { type: 'italic'; text: string }
  | { type: 'code'; text: string }
  | { type: 'citation'; citationIndex: number; citation?: Citation };

export interface MarkdownBlock {
  type: 'heading' | 'blockquote' | 'bullet-list' | 'ordered-list' | 'table' | 'paragraph';
  level?: number;
  content?: string;
  items?: string[];
  tableData?: { headers: string[]; rows: string[][] };
}

/**
 * Tokenizes inline text containing bold, italic, code, and citations [1], [2].
 */
export function tokenizeInline(text: string, citations?: Citation[]): InlineToken[] {
  if (!text) return [];

  // Match bold **text**, code `code`, citation [1], italic *text*
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\[\d+\]|\*[^*]+\*)/g;
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

    if (matchedStr.startsWith('**') && matchedStr.endsWith('**')) {
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
    tokens.push({
      type: 'text',
      text: text.slice(lastIndex),
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
