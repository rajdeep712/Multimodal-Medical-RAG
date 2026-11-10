import React from 'react';
import { Citation } from '../../types/document.ts';
import { parseMarkdownBlocks, tokenizeInline, MarkdownBlock, InlineToken } from '../../utils/markdownParser.ts';
import { CitationBadge } from './CitationBadge.tsx';
import { Info, AlertCircle, FileText, CheckCircle2 } from 'lucide-react';

interface MarkdownRendererProps {
  content: string;
  citations?: Citation[];
  isStreaming?: boolean;
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({
  content,
  citations,
  isStreaming,
}) => {
  if (!content.trim() && isStreaming) {
    return (
      <div className="flex items-center gap-2 text-xs text-[#64748B] py-2">
        <span className="w-2 h-2 rounded-full bg-[#087F8C] animate-ping" />
        <span>Synthesizing evidence from uploaded medical documents...</span>
      </div>
    );
  }

  const blocks = parseMarkdownBlocks(content);

  const renderInline = (text: string) => {
    const tokens = tokenizeInline(text, citations);
    return tokens.map((token, idx) => {
      switch (token.type) {
        case 'bold':
          return (
            <strong key={idx} className="font-bold text-[#123047]">
              {token.text}
            </strong>
          );
        case 'italic':
          return (
            <em key={idx} className="italic text-[#475569]">
              {token.text}
            </em>
          );
        case 'code':
          return (
            <code
              key={idx}
              className="font-mono text-[11px] bg-slate-100 text-slate-800 px-1.5 py-0.5 rounded border border-slate-200"
            >
              {token.text}
            </code>
          );
        case 'citation':
          return (
            <CitationBadge
              key={idx}
              citationNumber={token.citationIndex}
              citation={token.citation}
            />
          );
        case 'text':
        default:
          return <span key={idx}>{token.text}</span>;
      }
    });
  };

  return (
    <div className="space-y-3 text-sm text-[#334155] leading-relaxed">
      {blocks.map((block, bIdx) => {
        switch (block.type) {
          case 'heading': {
            if (block.level === 1) {
              return (
                <h1
                  key={bIdx}
                  className="text-lg font-black text-[#123047] tracking-tight mt-3 mb-1"
                >
                  {renderInline(block.content || '')}
                </h1>
              );
            }
            if (block.level === 2) {
              return (
                <h2
                  key={bIdx}
                  className="text-base font-extrabold text-[#123047] tracking-tight mt-3 mb-1"
                >
                  {renderInline(block.content || '')}
                </h2>
              );
            }
            // Level 3 or higher
            return (
              <h3
                key={bIdx}
                className="text-xs font-bold uppercase tracking-wider text-[#087F8C] flex items-center gap-1.5 border-b border-slate-100 pb-1 mt-3 mb-1"
              >
                {renderInline(block.content || '')}
              </h3>
            );
          }

          case 'blockquote': {
            return (
              <div
                key={bIdx}
                className="my-3 p-3.5 rounded-xl bg-[#DDF4F5]/40 border-l-4 border-[#087F8C] text-xs text-[#123047] flex items-start gap-2.5 shadow-2xs"
              >
                <Info className="w-4 h-4 text-[#087F8C] shrink-0 mt-0.5" />
                <div className="flex-1 leading-relaxed">
                  {renderInline(block.content || '')}
                </div>
              </div>
            );
          }

          case 'bullet-list': {
            return (
              <ul key={bIdx} className="space-y-1.5 my-2 pl-1">
                {block.items?.map((item, itemIdx) => (
                  <li key={itemIdx} className="flex items-start gap-2 text-xs sm:text-sm">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#087F8C] shrink-0 mt-2" />
                    <span className="flex-1 leading-relaxed">{renderInline(item)}</span>
                  </li>
                ))}
              </ul>
            );
          }

          case 'ordered-list': {
            return (
              <ol key={bIdx} className="space-y-2 my-2 pl-1">
                {block.items?.map((item, itemIdx) => (
                  <li key={itemIdx} className="flex items-start gap-2 text-xs sm:text-sm">
                    <span className="w-5 h-5 rounded-md bg-[#DDF4F5] text-[#087F8C] text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                      {itemIdx + 1}
                    </span>
                    <span className="flex-1 leading-relaxed">{renderInline(item)}</span>
                  </li>
                ))}
              </ol>
            );
          }

          case 'table': {
            if (!block.tableData) return null;
            const { headers, rows } = block.tableData;
            return (
              <div key={bIdx} className="my-3 overflow-x-auto border border-[#E2E8F0] rounded-xl shadow-2xs">
                <table className="w-full text-left text-xs border-collapse">
                  {headers.length > 0 && (
                    <thead>
                      <tr className="bg-[#F1F5F9] text-[#123047] font-bold border-b border-[#E2E8F0]">
                        {headers.map((h, hIdx) => (
                          <th key={hIdx} className="py-2 px-3">
                            {renderInline(h)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                  )}
                  <tbody className="divide-y divide-[#E2E8F0] bg-white">
                    {rows.map((row, rIdx) => (
                      <tr key={rIdx} className="hover:bg-[#F8FAFC]">
                        {row.map((cell, cIdx) => (
                          <td key={cIdx} className="py-2 px-3 text-[#334155]">
                            {renderInline(cell)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          }

          case 'paragraph':
          default: {
            return (
              <p key={bIdx} className="my-1.5 leading-relaxed">
                {renderInline(block.content || '')}
              </p>
            );
          }
        }
      })}
    </div>
  );
};
