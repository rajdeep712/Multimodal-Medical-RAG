import React, { useState } from 'react';
import { Citation } from '../../types/document.ts';
import { useCitationStore } from '../../stores/useCitationStore.ts';
import { useDocumentStore } from '../../stores/useDocumentStore.ts';
import {
  FileText,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Table,
  ImageIcon,
  BookmarkCheck,
  Search,
} from 'lucide-react';

interface SourcesPanelProps {
  citations: Citation[];
}

export const SourcesPanel: React.FC<SourcesPanelProps> = ({ citations }) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const { setActiveCitation, activeCitation } = useCitationStore();
  const { selectDocumentAndPage } = useDocumentStore();

  if (!citations || citations.length === 0) return null;

  const handleSourceClick = (cit: Citation) => {
    selectDocumentAndPage(cit.documentId, cit.pageNumber);
    setActiveCitation(cit);
  };

  return (
    <div className="mt-3 pt-3 border-t border-[#E2E8F0] text-xs">
      {/* Toggle Button */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between text-[#64748B] hover:text-[#123047] font-semibold transition-colors py-1 select-none cursor-pointer"
      >
        <span className="flex items-center gap-1.5 uppercase text-[10px] tracking-wider text-[#087F8C]">
          <Search className="w-3.5 h-3.5" />
          Retrieved Ground-Truth Sources ({citations.length})
        </span>
        <span className="flex items-center gap-1 text-[11px] font-normal">
          {isExpanded ? (
            <>
              <span>Hide</span>
              <ChevronUp className="w-3.5 h-3.5" />
            </>
          ) : (
            <>
              <span>Show</span>
              <ChevronDown className="w-3.5 h-3.5" />
            </>
          )}
        </span>
      </button>

      {/* Source Cards */}
      {isExpanded && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
          {citations.map((cit, idx) => {
            const isActive = activeCitation?.id === cit.id;
            return (
              <div
                key={cit.id || idx}
                onClick={() => handleSourceClick(cit)}
                className={`p-2.5 rounded-xl border text-left cursor-pointer transition-all flex flex-col justify-between ${
                  isActive
                    ? 'bg-[#DDF4F5] border-[#087F8C] shadow-xs ring-1 ring-[#087F8C]'
                    : 'bg-[#F8FAFC] border-[#E2E8F0] hover:border-[#087F8C]/50 hover:bg-white'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <span className="inline-flex items-center gap-1 font-bold text-[#087F8C] text-[11px]">
                      <span className="w-4 h-4 rounded-full bg-[#087F8C] text-white flex items-center justify-center text-[9px]">
                        {idx + 1}
                      </span>
                      <span className="truncate max-w-[130px]">{cit.documentName}</span>
                    </span>

                    <span className="text-[10px] font-medium text-[#64748B] bg-white px-1.5 py-0.2 rounded border border-[#E2E8F0]">
                      Page {cit.pageNumber}
                    </span>
                  </div>

                  <p className="text-[11px] text-[#475569] line-clamp-2 leading-tight">
                    {cit.excerpt || cit.imageSummary || 'Clinical finding region'}
                  </p>
                </div>

                <div className="mt-2 pt-1.5 border-t border-slate-200/60 flex items-center justify-between text-[10px] text-[#087F8C] font-semibold">
                  <span className="flex items-center gap-1 text-slate-500 uppercase">
                    {cit.contentType === 'table' ? (
                      <Table className="w-3 h-3 text-[#087F8C]" />
                    ) : cit.contentType === 'image' ? (
                      <ImageIcon className="w-3 h-3 text-[#8B5CF6]" />
                    ) : (
                      <FileText className="w-3 h-3 text-[#087F8C]" />
                    )}
                    {cit.contentType}
                  </span>
                  <span className="flex items-center gap-0.5 hover:underline">
                    View in PDF
                    <ExternalLink className="w-2.5 h-2.5" />
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
