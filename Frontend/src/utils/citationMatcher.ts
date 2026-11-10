import { Citation, MedicalDocument } from '../types/document.ts';

export interface TextToken {
  type: 'text' | 'citation';
  content: string;
  citationIndex?: number;
  citation?: Citation;
}

/**
 * Parses markdown/text content and extracts citation references like [1], [2].
 * Returns structured tokens allowing the UI to render inline interactive CitationBadges.
 */
export function parseCitationsFromText(text: string, citations?: Citation[]): TextToken[] {
  if (!text) return [];

  // Match [1], [2], [1, 2], [1-3]
  const citationRegex = /\[(\d+)\]/g;
  const tokens: TextToken[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = citationRegex.exec(text)) !== null) {
    const matchStart = match.index;
    const matchEnd = citationRegex.lastIndex;

    // Push preceding text token
    if (matchStart > lastIndex) {
      tokens.push({
        type: 'text',
        content: text.slice(lastIndex, matchStart),
      });
    }

    const citationNumber = parseInt(match[1], 10);
    // Find citation by index (1-based index or matching elementId)
    const citation = citations ? citations[citationNumber - 1] : undefined;

    tokens.push({
      type: 'citation',
      content: match[0],
      citationIndex: citationNumber,
      citation,
    });

    lastIndex = matchEnd;
  }

  // Push remaining text
  if (lastIndex < text.length) {
    tokens.push({
      type: 'text',
      content: text.slice(lastIndex),
    });
  }

  return tokens;
}

/**
 * Filters document list based on active document selection chips and optional date range.
 */
export function filterDocuments(
  documents: MedicalDocument[],
  selectedIds?: string[],
  dateRange?: { startDate?: string; endDate?: string }
): MedicalDocument[] {
  let filtered = [...documents];

  if (selectedIds && selectedIds.length > 0) {
    filtered = filtered.filter((doc) => selectedIds.includes(doc.id));
  }

  if (dateRange?.startDate) {
    const start = new Date(dateRange.startDate).getTime();
    filtered = filtered.filter((doc) => new Date(doc.uploadedAt).getTime() >= start);
  }

  if (dateRange?.endDate) {
    const end = new Date(dateRange.endDate).getTime();
    filtered = filtered.filter((doc) => new Date(doc.uploadedAt).getTime() <= end);
  }

  return filtered;
}
