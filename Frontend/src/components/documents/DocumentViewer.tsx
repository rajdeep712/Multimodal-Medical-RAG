import React from 'react';
import { useDocumentStore } from '../../stores/useDocumentStore.ts';
import { DocumentToolbar } from './DocumentToolbar.tsx';
import { MedicalDocumentRenderer } from './MedicalDocumentRenderer.tsx';
import { FileSearch, Upload, Loader2, AlertCircle, ShieldCheck } from 'lucide-react';

export const DocumentViewer: React.FC = () => {
  const {
    selectedDocument,
    currentPage,
    zoomLevel,
    rotation,
    isLoading,
    setUploadModalOpen,
  } = useDocumentStore();

  if (isLoading) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 bg-[#F1F5F9] text-[#64748B]">
        <Loader2 className="w-8 h-8 animate-spin text-[#087F8C] mb-3" />
        <p className="text-sm font-semibold text-[#123047]">Loading medical document...</p>
        <p className="text-xs text-[#64748B] mt-1">Preparing high-resolution vector layout & coordinates</p>
      </div>
    );
  }

  if (!selectedDocument) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 bg-[#F1F5F9] text-center">
        <div className="w-16 h-16 rounded-2xl bg-white border border-[#CBD5E1] shadow-sm flex items-center justify-center text-[#087F8C] mb-4">
          <FileSearch className="w-8 h-8" />
        </div>
        <h3 className="text-lg font-bold text-[#123047] mb-2">Your documents will appear here</h3>
        <p className="text-xs sm:text-sm text-[#64748B] max-w-sm mb-6 leading-relaxed">
          Select an uploaded medical report from the dropdown above, or upload a new report to explore AI answers with citations.
        </p>
        <button
          onClick={() => setUploadModalOpen(true)}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-[#087F8C] text-white hover:bg-[#066570] transition-all shadow-sm cursor-pointer"
        >
          <Upload className="w-4 h-4" />
          <span>Upload Document</span>
        </button>
      </div>
    );
  }

  // Get active page
  const pageIndex = Math.max(0, Math.min(currentPage - 1, (selectedDocument.pages?.length || 1) - 1));
  const activePageData = selectedDocument.pages?.[pageIndex];

  // Documents uploaded through the encrypted pipeline arrive without extracted
  // page data until the multimodal ingestion step runs — show their status.
  if (!selectedDocument.pages?.length) {
    return (
      <div id="document-viewport-container" className="h-full flex flex-col bg-[#E2E8F0] overflow-hidden">
        <DocumentToolbar />
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
          <div className="w-16 h-16 rounded-2xl bg-white border border-[#CBD5E1] shadow-sm flex items-center justify-center text-[#16A34A] mb-4">
            <ShieldCheck className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-bold text-[#123047] mb-2">
            {selectedDocument.fileName} is secured
          </h3>
          <p className="text-xs sm:text-sm text-[#64748B] max-w-md leading-relaxed">
            Encrypted with AES-256-GCM, signed and stored in S3. Extracted page content will
            appear here once the multimodal ingestion pipeline is connected.
          </p>
          <p className="text-[10px] text-slate-400 mt-3 font-mono">ID: {selectedDocument.id}</p>
        </div>
      </div>
    );
  }

  return (
    <div id="document-viewport-container" className="h-full flex flex-col bg-[#E2E8F0] overflow-hidden">
      {/* Toolbar */}
      <DocumentToolbar />

      {/* Scrollable Document Canvas Viewport */}
      <div className="flex-1 overflow-auto p-4 sm:p-6 flex justify-center items-start">
        {activePageData ? (
          <MedicalDocumentRenderer
            pageData={activePageData}
            zoomLevel={zoomLevel}
            rotation={rotation}
          />
        ) : (
          <div className="p-8 bg-white rounded-xl shadow border border-slate-300 text-center my-auto">
            <AlertCircle className="w-6 h-6 text-amber-500 mx-auto mb-2" />
            <p className="text-sm font-bold text-slate-800">Page {currentPage} not found</p>
            <p className="text-xs text-slate-500 mt-1">
              This document contains {selectedDocument.pageCount || 1} total pages.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
