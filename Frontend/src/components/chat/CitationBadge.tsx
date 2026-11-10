import React, { useState, useRef } from 'react';
import { Citation } from '../../types/document.ts';
import { useCitationStore } from '../../stores/useCitationStore.ts';
import { useDocumentStore } from '../../stores/useDocumentStore.ts';
import { FileText, ExternalLink, BookmarkCheck, Table, ImageIcon } from 'lucide-react';

interface CitationBadgeProps {
  citationNumber: number;
  citation?: Citation;
}

export const CitationBadge: React.FC<CitationBadgeProps> = ({
  citationNumber,
  citation,
}) => {
  const { setActiveCitation, activeCitation } = useCitationStore();
  const { selectDocumentAndPage } = useDocumentStore();
  const [showPreview, setShowPreview] = useState(false);
  const badgeRef = useRef<HTMLButtonElement>(null);

  const isActive = activeCitation?.id === citation?.id;

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!citation) return;

    // 1. Select document and navigate to page
    selectDocumentAndPage(citation.documentId, citation.pageNumber);
    // 2. Set active citation to trigger bounding box highlight & auto-scroll
    setActiveCitation(citation);
    setShowPreview(false);
  };

  if (!citation) {
    return (
      <span className="inline-flex items-center px-1.5 py-0.2 mx-0.5 rounded text-[11px] font-bold bg-[#DDF4F5] text-[#087F8C]">
        [{citationNumber}]
      </span>
    );
  }

  return (
    <span className="relative inline-block mx-0.5">
      <button
        ref={badgeRef}
        type="button"
        onClick={handleClick}
        onMouseEnter={() => setShowPreview(true)}
        onMouseLeave={() => setShowPreview(false)}
        onFocus={() => setShowPreview(true)}
        onBlur={() => setShowPreview(false)}
        className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[11px] font-bold cursor-pointer transition-all duration-150 select-none ${
          isActive
            ? 'bg-[#087F8C] text-white ring-2 ring-[#087F8C]/30 shadow-xs scale-105'
            : 'bg-[#DDF4F5] text-[#087F8C] hover:bg-[#087F8C] hover:text-white border border-[#BDEFE7]'
        }`}
        title={`View evidence on Page ${citation.pageNumber} of ${citation.documentName}`}
      >
        <span>[{citationNumber}]</span>
      </button>

      {/* Hover Preview Card */}
      {showPreview && (
        <div
          className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-72 bg-white rounded-xl shadow-xl border border-[#CBD5E1] p-3 z-50 text-left pointer-events-auto animate-in fade-in zoom-in-95 duration-150"
          onMouseEnter={() => setShowPreview(true)}
          onMouseLeave={() => setShowPreview(false)}
        >
          <div className="flex items-start justify-between gap-2 pb-2 border-b border-[#F1F5F9]">
            <div className="flex items-center gap-1.5 min-w-0">
              {citation.contentType === 'table' ? (
                <Table className="w-3.5 h-3.5 text-[#087F8C] shrink-0" />
              ) : citation.contentType === 'image' ? (
                <ImageIcon className="w-3.5 h-3.5 text-[#8B5CF6] shrink-0" />
              ) : (
                <FileText className="w-3.5 h-3.5 text-[#087F8C] shrink-0" />
              )}
              <span className="text-xs font-bold text-[#123047] truncate">
                {citation.documentName}
              </span>
            </div>
            <span className="text-[10px] font-semibold text-[#64748B] shrink-0 bg-slate-100 px-1.5 py-0.5 rounded">
              Page {citation.pageNumber}
            </span>
          </div>

          <p className="mt-2 text-xs text-[#334155] leading-relaxed line-clamp-3 bg-[#F8FAFC] p-2 rounded-lg border border-[#E2E8F0] italic">
            "{citation.excerpt || citation.imageSummary || 'Evidence region'}"
          </p>

          <div className="mt-2 pt-2 border-t border-[#F1F5F9] flex items-center justify-between">
            <span className="text-[10px] text-[#64748B] font-medium uppercase">
              {citation.contentType} citation
            </span>
            <button
              onClick={handleClick}
              className="inline-flex items-center gap-1 text-xs font-bold text-[#087F8C] hover:underline cursor-pointer"
            >
              <span>View in Document</span>
              <ExternalLink className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}
    </span>
  );
};
