'use client';

import React, { useCallback, useLayoutEffect, useState, useRef } from 'react';
import { X, UploadCloud, FileText, CheckCircle2, Loader2, Trash2, FileCheck, AlertCircle, ListX } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { ReducedMotionConfig, spring, transition, useTempoTransition } from '@animate-ui/react/utils/motion';
import { useDocumentStore } from '../../stores/useDocumentStore.ts';
import { documentService } from '../../services/documentService.ts';

type UploadStage =
  | 'queued'
  | 'uploading'
  | 'uploaded'
  | 'encrypting'
  | 'preparing'
  | 'secured'
  | 'processing'
  | 'indexed'
  | 'failed';

interface UploadQueueItem {
  file: File;
  id: string;
  stage: UploadStage;
  progress: number;
  detail?: string;
}

const STAGE_LABELS: Record<Exclude<UploadStage, 'failed'>, string> = {
  queued: 'Ready to ingest',
  uploading: 'Uploading to secure server...',
  uploaded: 'Upload complete — queued for encryption',
  encrypting: 'Encrypting (AES-256-GCM, KMS-wrapped key)...',
  preparing: 'Signing & uploading encrypted package to S3...',
  secured: 'Secured — PROCESSING AND INDEXING...',
  processing: 'PROCESSING AND INDEXING...',
  indexed: 'INDEXED AND READY',
};

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const ALLOWED_UPLOAD_EXTENSIONS = new Set(['.pdf', '.png', '.jpg', '.jpeg']);
const ALLOWED_UPLOAD_MIME_TYPES = new Set(['application/pdf', 'image/png', 'image/jpeg']);

function validateUpload(file: File): string | null {
  const name = file.name.toLowerCase();
  const extension = name.slice(name.lastIndexOf('.'));
  if (
    !ALLOWED_UPLOAD_EXTENSIONS.has(extension) ||
    !ALLOWED_UPLOAD_MIME_TYPES.has(file.type)
  ) {
    return 'Only PDF, PNG and JPEG documents can be uploaded';
  }
  if (file.size === 0) return 'The selected file is empty';
  if (file.size > MAX_UPLOAD_BYTES) return 'File exceeds the 10 MB limit';
  return null;
}

const UploadModalContent: React.FC = () => {
  const { isUploadModalOpen, setUploadModalOpen, refreshDocuments, setPendingDocument } =
    useDocumentStore();

  const [queue, setQueue] = useState<UploadQueueItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);
  const queueRef = useRef<HTMLDivElement>(null);
  const startedIds = useRef<Set<string>>(new Set());
  const move = useTempoTransition(spring.reflow);
  const fade = useTempoTransition(transition.fade);
  // Multi-file batches: pendingDocument is a single slot and setPendingDocument
  // yanks the document viewer — auto-open only when this is the ONLY upload.
  const activeUploadsRef = useRef(0);

  const newestId = queue[0]?.id;
  useLayoutEffect(() => {
    if (isUploadModalOpen && queueRef.current) queueRef.current.scrollTop = 0;
  }, [newestId, isUploadModalOpen]);

  const updateItem = useCallback((id: string, patch: Partial<UploadQueueItem>) => {
    setQueue((prev) => prev.map((q) => (q.id === id ? { ...q, ...patch } : q)));
  }, []);

  const startUpload = useCallback(
    async (item: UploadQueueItem) => {
      if (startedIds.current.has(item.id)) return;
      startedIds.current.add(item.id);
      activeUploadsRef.current += 1;

      updateItem(item.id, { stage: 'uploading', progress: 0 });
      try {
        // Each file uploads concurrently — no waiting between drops. The
        // promise resolves only after the backend reports INDEXED. No refresh
        // is needed here: the list was refreshed on SECURED and the global
        // SSE stream applies the INDEXED status in place.
        const indexedDoc = await documentService.uploadDocument(
          item.file,
          (stage, progress, detail) => {
            updateItem(item.id, { stage, progress, detail });
          },
          (securedDoc) => {
            // The document is now in the workspace while indexing continues.
            void refreshDocuments();
            if (activeUploadsRef.current <= 1) setPendingDocument(securedDoc);
          }
        );
        if (activeUploadsRef.current <= 1) setPendingDocument(indexedDoc);
        updateItem(item.id, { stage: 'indexed', progress: 100 });
      } catch (err: any) {
        updateItem(item.id, {
          stage: 'failed',
          progress: 0,
          detail: err?.message || 'Upload failed',
        });
      } finally {
        activeUploadsRef.current = Math.max(0, activeUploadsRef.current - 1);
        startedIds.current.delete(item.id);
      }
    },
    [refreshDocuments, setPendingDocument, updateItem]
  );

  if (!isUploadModalOpen) return null;

  const handleFilesAdded = (files: FileList | File[]) => {
    const newItems: UploadQueueItem[] = Array.from(files).map((f) => {
      const error = validateUpload(f);
      return {
        file: f,
        id: `queue_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        stage: error ? 'failed' : 'queued',
        progress: 0,
        detail: error ?? undefined,
      } satisfies UploadQueueItem;
    });
    setQueue((prev) => [...newItems, ...prev]);
    // Only valid files start uploading immediately; invalid ones are shown
    // with a clear message instead of being sent and reset by the proxy.
    newItems.filter((item) => item.stage === 'queued').forEach((item) => {
      void startUpload(item);
    });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFilesAdded(e.dataTransfer.files);
    }
  };

  const handleRemove = (id: string) => {
    startedIds.current.delete(id);
    setQueue((prev) => prev.filter((item) => item.id !== id));
  };

  const handleClear = () => {
    // This is display history, not the upload jobs or stored documents.
    // Late progress callbacks update existing rows only, so cleared cards stay gone.
    queueRef.current?.querySelectorAll<HTMLElement>('[data-upload-card]').forEach((card) => {
      card.inert = true;
    });
    setQueue([]);
    dropZoneRef.current?.focus();
  };

  const getStageLabel = (item: UploadQueueItem) => {
    if (item.stage === 'failed') return item.detail || 'Processing failed';
    return STAGE_LABELS[item.stage];
  };

  const allReady = queue.length > 0 && queue.every((q) => q.stage === 'indexed');
  const hasFailure = queue.some((q) => q.stage === 'failed');
  const activeCount = queue.filter(
    (q) =>
      q.stage !== 'indexed' && q.stage !== 'failed' && q.stage !== 'queued'
  ).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-3xl shadow-2xl border border-[#CBD5E1] w-full max-w-xl overflow-hidden animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-5 border-b border-[#F1F5F9] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#DDF4F5] text-[#087F8C] flex items-center justify-center">
              <UploadCloud className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[#123047]">Upload Medical Documents</h3>
              <p className="text-xs text-[#64748B]">
                Files start uploading the moment you drop them — in parallel, encrypted end-to-end.
              </p>
            </div>
          </div>

          <button
            onClick={() => setUploadModalOpen(false)}
            className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Drag and Drop Box */}
        <div className="p-6 space-y-4">
          <div
            ref={dropZoneRef}
            role="button"
            tabIndex={0}
            aria-label="Choose medical documents to upload"
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                fileInputRef.current?.click();
              }
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#087F8C] ${
              isDragging
                ? 'border-[#087F8C] bg-[#DDF4F5]/40 scale-[0.99]'
                : 'border-[#CBD5E1] hover:border-[#087F8C] bg-[#F8FAFC]'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.png,.jpg,.jpeg"
              onChange={(e) => {
                if (e.target.files) handleFilesAdded(e.target.files);
                e.target.value = '';
              }}
              className="hidden"
            />
            <div className="w-12 h-12 rounded-2xl bg-white shadow-xs border border-[#CBD5E1] text-[#087F8C] flex items-center justify-center mx-auto mb-3">
              <FileCheck className="w-6 h-6" />
            </div>
            <p className="text-sm font-bold text-[#123047]">
              Click to browse or drop medical files here
            </p>
            <p className="text-xs text-[#64748B] mt-1">
              Supports PDF, Clinical Scans, and Imaging Reports (up to 10MB)
            </p>
          </div>

          {/* Upload Queue */}
          <div className="space-y-2">
            {queue.length > 0 && (
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-[#64748B]">Recent uploads</p>
                <button
                  type="button"
                  onClick={handleClear}
                  title="Clear status cards. Active uploads continue in the background."
                  className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold text-[#64748B] transition-colors hover:bg-slate-100 hover:text-[#123047] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#087F8C] cursor-pointer"
                >
                  <ListX className="h-3.5 w-3.5" aria-hidden="true" />
                  Clear
                </button>
              </div>
            )}
            <motion.div layoutScroll ref={queueRef} className="relative flex max-h-56 flex-col gap-2 overflow-y-auto pr-1">
              <AnimatePresence initial={false} mode="popLayout">
              {queue.map((item) => {
                const isItemReady = item.stage === 'indexed';
                const isFailed = item.stage === 'failed';
                const isWorking = !isItemReady && !isFailed && item.stage !== 'queued';

                return (
                  <motion.div
                    key={item.id}
                    data-upload-card
                    layout="position"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0, transition: { ...move, opacity: fade } }}
                    exit={{ opacity: 0, scale: 0.96, transition: fade }}
                    transition={move}
                    className={`p-3 rounded-xl border bg-white flex flex-col gap-2 ${
                      isFailed ? 'border-red-200 bg-red-50/40' : 'border-[#CBD5E1]'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2 truncate">
                        <FileText className="w-4 h-4 text-[#087F8C] shrink-0" />
                        <span className="font-semibold text-[#123047] truncate">
                          {item.file.name}
                        </span>
                        <span className="text-[#64748B] text-[10px]">
                          ({(item.file.size / (1024 * 1024)).toFixed(2)} MB)
                        </span>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {isItemReady ? (
                          <span className="flex items-center gap-1 text-[11px] font-bold text-[#16A34A]">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Indexed
                          </span>
                        ) : isFailed ? (
                          <span className="flex items-center gap-1 text-[11px] font-bold text-red-600">
                            <AlertCircle className="w-3.5 h-3.5" />
                            Failed
                          </span>
                        ) : isWorking ? (
                          <span className="flex items-center gap-1 text-[11px] font-medium text-[#087F8C]">
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            {item.progress}%
                          </span>
                        ) : (
                          <button
                            type="button"
                            aria-label={`Remove ${item.file.name} from the upload list`}
                            onClick={(event) => {
                              const card = event.currentTarget.closest<HTMLElement>('[data-upload-card]');
                              if (card) card.inert = true;
                              dropZoneRef.current?.focus();
                              handleRemove(item.id);
                            }}
                            className="p-1 hover:text-red-600 text-slate-400 transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Progress stage description */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px]">
                        <span className={isFailed ? 'text-red-600' : 'text-[#64748B]'}>
                          {getStageLabel(item)}
                        </span>
                      </div>
                      <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all duration-300 ${
                            isItemReady ? 'bg-[#16A34A]' : isFailed ? 'bg-red-500' : 'bg-[#087F8C]'
                          }`}
                          style={{ width: `${item.progress}%` }}
                        />
                      </div>
                    </div>
                  </motion.div>
                );
              })}
              </AnimatePresence>
            </motion.div>
          </div>
        </div>

        {/* Modal Actions */}
        <div className="px-6 py-4 bg-[#F8FAFC] border-t border-[#F1F5F9] flex items-center justify-between">
          <button
            onClick={() => setUploadModalOpen(false)}
            className="px-4 py-2 text-xs font-semibold text-[#64748B] hover:text-[#123047] transition-colors cursor-pointer"
          >
            {allReady ? 'Close Window' : 'Keep in background'}
          </button>

          {allReady ? (
            <button
              onClick={() => setUploadModalOpen(false)}
              className="px-6 py-2.5 rounded-xl text-xs font-bold bg-[#16A34A] text-white hover:bg-[#15803D] transition-all shadow-sm cursor-pointer"
            >
              Done
            </button>
          ) : (
            <div className="px-6 py-2.5 rounded-xl text-xs font-bold bg-[#087F8C]/10 text-[#087F8C] flex items-center gap-2">
              {activeCount > 0 ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>
                    {activeCount} file{activeCount === 1 ? '' : 's'} uploading in parallel
                    {hasFailure ? ' — some failed' : ''}
                  </span>
                </>
              ) : (
                <>
                  <UploadCloud className="w-4 h-4" />
                  <span>{hasFailure ? 'Some uploads failed' : 'Drop files to start'}</span>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export const UploadModal: React.FC = () => (
  <ReducedMotionConfig>
    <UploadModalContent />
  </ReducedMotionConfig>
);
