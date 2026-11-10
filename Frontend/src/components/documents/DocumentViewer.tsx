import React, { useEffect, useState } from 'react';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { useDocumentStore } from '../../stores/useDocumentStore.ts';
import { documentService } from '../../services/documentService.ts';
import { evictDocumentContent } from '../../services/documentContentCache.ts';
import { ApiError } from '../../services/api.ts';
import { DocumentToolbar } from './DocumentToolbar.tsx';
import { PdfDocumentPage } from './PdfDocumentPage.tsx';
import {
  AlertCircle,
  CloudDownload,
  FileSearch,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Upload,
} from 'lucide-react';

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const DocumentSkeleton: React.FC = () => (
  <div id="document-viewport-container" className="relative h-full flex flex-col bg-[#E2E8F0] overflow-hidden">
    <div className="h-12 bg-white border-b border-[#E2E8F0] px-4 flex items-center justify-between animate-pulse">
      <div className="flex items-center gap-3">
        <div className="h-6 w-20 rounded-lg bg-slate-200" />
        <div className="h-6 w-28 rounded-lg bg-slate-100" />
      </div>
      <div className="flex items-center gap-2">
        <div className="h-6 w-16 rounded-lg bg-slate-100" />
        <div className="h-6 w-6 rounded-lg bg-slate-100" />
      </div>
    </div>
    <div className="flex-1 overflow-hidden p-4 sm:p-6 flex justify-center items-start">
      <div className="w-full max-w-[820px] min-h-[920px] rounded-xl border border-[#CBD5E1] bg-white p-8 sm:p-12 shadow-sm animate-pulse">
        <div className="flex items-center justify-between mb-10">
          <div className="h-7 w-2/5 rounded bg-slate-200" />
          <div className="h-7 w-20 rounded bg-slate-100" />
        </div>
        <div className="space-y-4">
          <div className="h-4 w-full rounded bg-slate-100" />
          <div className="h-4 w-11/12 rounded bg-slate-100" />
          <div className="h-4 w-4/5 rounded bg-slate-100" />
          <div className="h-4 w-full rounded bg-slate-100" />
          <div className="h-4 w-3/4 rounded bg-slate-100" />
        </div>
        <div className="mt-10 rounded-xl border border-slate-100 bg-slate-50 h-44" />
        <div className="mt-10 space-y-4">
          <div className="h-4 w-1/3 rounded bg-slate-200" />
          <div className="h-4 w-full rounded bg-slate-100" />
          <div className="h-4 w-10/12 rounded bg-slate-100" />
          <div className="h-4 w-5/6 rounded bg-slate-100" />
        </div>
        <div className="mt-10 grid grid-cols-2 gap-4">
          <div className="h-24 rounded-xl bg-slate-100" />
          <div className="h-24 rounded-xl bg-slate-100" />
        </div>
      </div>
    </div>
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
      <div className="rounded-2xl border border-[#CBD5E1] bg-white/95 px-6 py-5 shadow-xl text-center">
        <Loader2 className="w-6 h-6 animate-spin text-[#087F8C] mx-auto mb-2" />
        <p className="text-sm font-bold text-[#123047]">Verifying signature & decrypting document</p>
        <p className="text-xs text-[#64748B] mt-1">Streaming the secure PDF from private storage</p>
      </div>
    </div>
  </div>
);

function describeLoadError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 404) return 'This document is no longer available in secure storage.';
    if (error.status === 502) {
      return 'The encrypted document could not be verified or decrypted. It may have been tampered with.';
    }
    return error.message;
  }
  if (error instanceof Error) return error.message;
  return 'Could not load this document from secure storage.';
}

export const DocumentViewer: React.FC = () => {
  const {
    documents,
    selectedDocument,
    pendingDocument,
    currentPage,
    zoomLevel,
    rotation,
    isLoading,
    setUploadModalOpen,
    loadPendingDocument,
    setDocumentPageCount,
    setCurrentPage,
  } = useDocumentStore();

  const [pdfDocument, setPdfDocument] = useState<PDFDocumentProxy | null>(null);
  const [loadState, setLoadState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [loadError, setLoadError] = useState('');
  const [retryKey, setRetryKey] = useState(0);
  const selectedDocumentId = selectedDocument?.id;

  useEffect(() => {
    if (!selectedDocumentId) {
      setPdfDocument(null);
      setLoadState('idle');
      setLoadError('');
      return;
    }

    const documentId = selectedDocumentId;
    const controller = new AbortController();
    let cancelled = false;
    let loadingTask: PDFDocumentLoadingTask | null = null;

    setPdfDocument(null);
    setLoadState('loading');
    setLoadError('');

    const loadDocument = async () => {
      try {
        const blob = await documentService.getDocumentContent(documentId, controller.signal);
        if (cancelled) return;

        const data = new Uint8Array(await blob.arrayBuffer());
        if (cancelled) return;

        loadingTask = getDocument({ data });
        const document = await loadingTask.promise;
        if (cancelled) {
          void loadingTask.destroy().catch(() => undefined);
          return;
        }

        setPdfDocument(document);
        setDocumentPageCount(documentId, document.numPages);
        setLoadState('ready');
      } catch (error: unknown) {
        if (cancelled || controller.signal.aborted) return;
        evictDocumentContent(documentId);
        setLoadError(describeLoadError(error));
        setLoadState('error');
      }
    };

    void loadDocument();

    return () => {
      cancelled = true;
      controller.abort();
      if (loadingTask) void loadingTask.destroy().catch(() => undefined);
    };
  }, [selectedDocumentId, retryKey, setDocumentPageCount]);

  useEffect(() => {
    if (pdfDocument && currentPage > pdfDocument.numPages) {
      setCurrentPage(pdfDocument.numPages);
    }
  }, [pdfDocument, currentPage, setCurrentPage]);

  if (pendingDocument) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 bg-[#F1F5F9] text-center">
        <div className="w-16 h-16 rounded-2xl bg-white border border-[#CBD5E1] shadow-sm flex items-center justify-center text-[#16A34A] mb-4">
          <ShieldCheck className="w-8 h-8" />
        </div>
        <h3 className="text-lg font-bold text-[#123047] mb-2">Document uploaded securely</h3>
        <p className="text-xs sm:text-sm text-[#64748B] max-w-md mb-2 leading-relaxed">
          <span className="font-semibold text-[#334155]">{pendingDocument.fileName}</span> was
          encrypted, signed, and stored in private S3 storage. It has not been opened automatically.
        </p>
        <p className="text-xs text-[#64748B] max-w-md mb-6 leading-relaxed">
          Load it from S3 to verify its signature and render the decrypted PDF.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <button
            onClick={loadPendingDocument}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-[#087F8C] text-white hover:bg-[#066570] transition-all shadow-sm cursor-pointer"
          >
            <CloudDownload className="w-4 h-4" />
            <span>Load from S3</span>
          </button>
          <button
            onClick={() => setUploadModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold border border-[#CBD5E1] bg-white text-[#475569] hover:bg-slate-50 transition-all cursor-pointer"
          >
            <Upload className="w-4 h-4" />
            <span>Upload Another</span>
          </button>
        </div>
      </div>
    );
  }

  if (!selectedDocument) {
    if (isLoading) {
      return (
        <div className="h-full flex flex-col items-center justify-center p-8 bg-[#F1F5F9] text-[#64748B]">
          <Loader2 className="w-8 h-8 animate-spin text-[#087F8C] mb-3" />
          <p className="text-sm font-semibold text-[#123047]">Loading document library...</p>
        </div>
      );
    }

    return (
      <div className="h-full flex flex-col items-center justify-center p-8 bg-[#F1F5F9] text-center">
        <div className="w-16 h-16 rounded-2xl bg-white border border-[#CBD5E1] shadow-sm flex items-center justify-center text-[#087F8C] mb-4">
          <FileSearch className="w-8 h-8" />
        </div>
        <h3 className="text-lg font-bold text-[#123047] mb-2">No document selected</h3>
        <p className="text-xs sm:text-sm text-[#64748B] max-w-sm mb-6 leading-relaxed">
          {documents.length > 0
            ? 'Choose a document from the dropdown above to verify, decrypt, and load its PDF from S3.'
            : 'Upload a PDF, PNG, or JPEG medical report to encrypt it and load it from S3.'}
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

  if (loadState === 'loading') return <DocumentSkeleton />;

  if (loadState === 'error') {
    return (
      <div id="document-viewport-container" className="h-full flex flex-col items-center justify-center p-8 bg-[#F1F5F9] text-center">
        <div className="w-16 h-16 rounded-2xl bg-white border border-red-200 shadow-sm flex items-center justify-center text-red-600 mb-4">
          <AlertCircle className="w-8 h-8" />
        </div>
        <h3 className="text-lg font-bold text-[#123047] mb-2">Could not open document</h3>
        <p className="text-xs sm:text-sm text-[#64748B] max-w-md mb-6 leading-relaxed">{loadError}</p>
        <button
          onClick={() => {
            evictDocumentContent(selectedDocument.id);
            setRetryKey((key) => key + 1);
          }}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-[#087F8C] text-white hover:bg-[#066570] transition-all shadow-sm cursor-pointer"
        >
          <RefreshCw className="w-4 h-4" />
          <span>Retry from S3</span>
        </button>
      </div>
    );
  }

  if (!pdfDocument) return <DocumentSkeleton />;

  const pageNumber = Math.max(1, Math.min(currentPage, pdfDocument.numPages));

  return (
    <div id="document-viewport-container" className="relative h-full flex flex-col bg-[#E2E8F0] overflow-hidden">
      <DocumentToolbar />
      <div className="flex-1 overflow-auto p-4 sm:p-6 flex justify-center items-start">
        <PdfDocumentPage
          pdfDocument={pdfDocument}
          pageNumber={pageNumber}
          zoomLevel={zoomLevel}
          rotation={rotation}
        />
      </div>
    </div>
  );
};
