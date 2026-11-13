import React, { useState, useRef, useEffect } from 'react';
import {
  FileText,
  Search,
  Upload,
  Trash2,
  ChevronDown,
  Check,
  CheckCircle2,
  FileCheck2,
  Calendar,
  Layers,
  Activity,
  Plus,
  AlertTriangle,
  Loader2,
} from 'lucide-react';
import { useDocumentStore } from '../../stores/useDocumentStore.ts';
import { MedicalDocument } from '../../types/document.ts';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip.tsx';

export const DocumentSelector: React.FC = () => {
  const {
    documents,
    selectedDocument,
    selectDocument,
    deleteDocument,
    setUploadModalOpen,
  } = useDocumentStore();

  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setConfirmingDeleteId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredDocs = documents.filter((doc) =>
    doc.fileName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    doc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    doc.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'Laboratory':
        return 'text-[#087F8C] bg-[#DDF4F5] border-[#BDEFE7]';
      case 'Prescription':
        return 'text-[#16A34A] bg-[#DDF5EB] border-[#BBF7D0]';
      case 'Radiology / Imaging':
        return 'text-[#8B5CF6] bg-purple-50 border-purple-200';
      default:
        return 'text-[#334155] bg-slate-100 border-slate-200';
    }
  };

  return (
    <div className="relative" ref={containerRef}>
      {/* Trigger Button */}
      <button
        onClick={() => {
          setIsOpen((open) => !open);
          setDeleteError('');
          if (deletingId) setConfirmingDeleteId(null);
        }}
        className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white border border-[#CBD5E1] hover:border-[#087F8C] hover:bg-[#F8FAFC] transition-all shadow-sm hover:shadow-md group cursor-pointer"
        title="Browse and switch uploaded medical documents"
      >
        <div className="w-5 h-5 rounded-md bg-[#DDF4F5] text-[#087F8C] flex items-center justify-center shrink-0">
          <FileText className="w-3.5 h-3.5" />
        </div>
        <div className="flex flex-col text-left max-w-[150px] sm:max-w-[220px]">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[#64748B]">
              Documents
            </span>
            <span className="text-[9px] px-1 py-0.2 rounded-full bg-slate-100 text-slate-600 font-bold">
              {documents.length}
            </span>
          </div>
          <span className="text-xs font-bold text-[#123047] truncate leading-tight">
            {selectedDocument ? selectedDocument.fileName : 'Select a document...'}
          </span>
        </div>
        <ChevronDown className="w-3.5 h-3.5 text-[#64748B] group-hover:text-[#087F8C] transition-colors shrink-0 ml-1" />
      </button>

      {/* Popover Dropdown */}
      {isOpen && (
        <div className="absolute left-0 mt-2 w-80 sm:w-96 bg-white rounded-2xl shadow-2xl border border-[#CBD5E1] py-3 z-50 animate-in fade-in zoom-in-95 duration-150">
          {/* Header & Search */}
          <div className="px-4 pb-3 border-b border-[#F1F5F9]">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-[#123047] uppercase tracking-wider flex items-center gap-1.5">
                <FileCheck2 className="w-3.5 h-3.5 text-[#087F8C]" />
                Uploaded Documents
              </span>
              <button
                onClick={() => {
                  setIsOpen(false);
                  setUploadModalOpen(true);
                }}
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#087F8C] hover:text-[#066570] transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Upload New
              </button>
            </div>

            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search documents by name or category..."
                className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border border-[#CBD5E1] bg-[#F8FAFC] focus:outline-none focus:border-[#087F8C] focus:bg-white transition-all text-[#123047]"
              />
            </div>
          </div>

          {/* Document List */}
          <div className="max-h-72 overflow-y-auto px-2 py-1 space-y-1">
            {filteredDocs.length === 0 ? (
              <div className="py-6 text-center text-xs text-[#64748B]">
                No documents match "{searchQuery}"
              </div>
            ) : (
              filteredDocs.map((doc) => {
                const isSelected = selectedDocument?.id === doc.id;
                const isConfirming = confirmingDeleteId === doc.id;
                const isDeleting = deletingId === doc.id;
                // Legacy rows (never indexed) show as secured, not as an
                // endless loader.
                const isIngestionActive =
                  doc.ingestionStatus === 'SECURED' || doc.ingestionStatus === 'PROCESSING';
                const isIngestionFailed = doc.ingestionStatus === 'ERROR';
                const isIngestionDone = doc.ingestionStatus === 'INDEXED';

                return (
                  <div
                    key={doc.id}
                    className={`group relative rounded-xl p-2.5 transition-all flex items-start justify-between gap-2 cursor-pointer ${
                      isSelected
                        ? 'bg-[#DDF4F5]/60 border border-[#087F8C]/40 shadow-xs'
                        : 'hover:bg-[#F8FAFC] border border-transparent'
                    }`}
                    onClick={() => {
                      if (deletingId) return;
                      selectDocument(doc);
                      setIsOpen(false);
                    }}
                  >
                    <div className="flex items-start gap-2.5 min-w-0">
                      <div
                        className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                          isSelected ? 'bg-[#087F8C] text-white' : 'bg-slate-100 text-[#64748B]'
                        }`}
                      >
                        <FileText className="w-4 h-4" />
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-xs font-bold text-[#123047] truncate">
                            {doc.fileName}
                          </p>
                          {isSelected && (
                            <Check className="w-3.5 h-3.5 text-[#087F8C] shrink-0" />
                          )}
                        </div>

                        <div className="flex items-center gap-2 mt-1 text-[10px] text-[#64748B]">
                          <span
                            className={`px-1.5 py-0.2 rounded font-semibold border ${getCategoryColor(
                              doc.category
                            )}`}
                          >
                            {doc.category}
                          </span>
                          <span>{doc.fileSize}</span>
                          <span>•</span>
                          <span className="flex items-center gap-1">
                            <Calendar className="w-2.5 h-2.5" />
                            {new Date(doc.uploadedAt).toLocaleDateString()}
                          </span>
                        </div>

                        {isIngestionActive && (
                          <div className="mt-1 flex items-center gap-1 text-[10px] font-semibold text-[#087F8C]">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            <span>PROCESSING AND INDEXING</span>
                          </div>
                        )}
                        {isIngestionDone && (
                          <div className="mt-1 flex items-center gap-1 text-[10px] font-semibold text-[#16A34A]">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>INDEXED AND READY</span>
                          </div>
                        )}
                        {isIngestionFailed && (
                          <div className="mt-1 flex items-center gap-1 text-[10px] font-semibold text-red-600">
                            <AlertTriangle className="w-3 h-3" />
                            <span>INDEXING FAILED</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Delete action with confirmation */}
                    <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
                      {isDeleting ? (
                        <div
                          className="flex items-center gap-1 text-[10px] font-bold text-red-600"
                          role="status"
                        >
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Deleting</span>
                        </div>
                      ) : isConfirming ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={async () => {
                              if (deletingId) return;
                              setDeletingId(doc.id);
                              setConfirmingDeleteId(null);
                              setDeleteError('');
                              try {
                                await deleteDocument(doc.id);
                              } catch (error) {
                                setDeleteError(
                                  error instanceof Error
                                    ? error.message
                                    : 'Could not delete the document'
                                );
                              } finally {
                                setDeletingId(null);
                              }
                            }}
                            className="text-[10px] bg-red-600 text-white font-bold px-2 py-1 rounded-md hover:bg-red-700 transition-colors cursor-pointer"
                          >
                            Confirm
                          </button>
                          <button
                            onClick={() => setConfirmingDeleteId(null)}
                            className="text-[10px] bg-slate-200 text-slate-700 px-1.5 py-1 rounded-md hover:bg-slate-300 transition-colors cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <Tooltip>
                          <TooltipTrigger
                            onClick={() => {
                              setConfirmingDeleteId(doc.id);
                              setDeleteError('');
                            }}
                            disabled={Boolean(deletingId)}
                            className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none"
                            aria-label="Delete document"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </TooltipTrigger>
                          <TooltipContent side="top">Delete document</TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {deleteError && (
            <div
              className="mx-3 mb-1 flex items-start gap-1.5 rounded-lg border border-red-200 bg-red-50 px-2.5 py-2 text-[10px] font-medium text-red-700"
              role="alert"
            >
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
              <span>{deleteError}</span>
            </div>
          )}

          {/* Footer Upload CTA */}
          <div className="pt-2 px-3 border-t border-[#F1F5F9] mt-1">
            <button
              onClick={() => {
                setIsOpen(false);
                setUploadModalOpen(true);
              }}
              className="w-full py-2 rounded-xl text-xs font-semibold bg-[#F8FAFC] border border-[#E2E8F0] hover:bg-[#DDF4F5] hover:text-[#087F8C] hover:border-[#087F8C]/40 text-[#334155] transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Upload More Documents</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
