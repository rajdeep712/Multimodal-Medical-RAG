import React, { useCallback, useState, useRef } from 'react';
import { X, UploadCloud, FileText, CheckCircle2, Loader2, Trash2, FileCheck, AlertCircle } from 'lucide-react';
import { useDocumentStore } from '../../stores/useDocumentStore.ts';
import { documentService } from '../../services/documentService.ts';

type UploadStage =
  | 'queued'
  | 'uploading'
  | 'uploaded'
  | 'encrypting'
  | 'preparing'
  | 'ready'
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
  ready: 'Encrypted, stored & indexed — ready',
};

export const UploadModal: React.FC = () => {
  const { isUploadModalOpen, setUploadModalOpen, refreshDocuments, selectDocument } =
    useDocumentStore();

  const [queue, setQueue] = useState<UploadQueueItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const startedIds = useRef<Set<string>>(new Set());

  const updateItem = useCallback((id: string, patch: Partial<UploadQueueItem>) => {
    setQueue((prev) => prev.map((q) => (q.id === id ? { ...q, ...patch } : q)));
  }, []);

  const startUpload = useCallback(
    async (item: UploadQueueItem) => {
      if (startedIds.current.has(item.id)) return;
      startedIds.current.add(item.id);

      updateItem(item.id, { stage: 'uploading', progress: 0 });
      try {
        // Each file uploads concurrently — no waiting between drops.
        const uploadedDoc = await documentService.uploadDocument(item.file, (stage, progress, detail) => {
          updateItem(item.id, { stage, progress, detail });
        });
        await refreshDocuments();
        selectDocument(uploadedDoc);
        updateItem(item.id, { stage: 'ready', progress: 100 });
      } catch (err: any) {
        updateItem(item.id, {
          stage: 'failed',
          progress: 0,
          detail: err?.message || 'Upload failed',
        });
      }
    },
    [refreshDocuments, selectDocument, updateItem]
  );

  if (!isUploadModalOpen) return null;

  const handleFilesAdded = (files: FileList | File[]) => {
    const newItems: UploadQueueItem[] = Array.from(files).map((f) => ({
      file: f,
      id: `queue_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      stage: 'queued',
      progress: 0,
    }));
    setQueue((prev) => [...prev, ...newItems]);
    // Dropped files start uploading immediately and in parallel.
    newItems.forEach((item) => {
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

  const getStageLabel = (item: UploadQueueItem) => {
    if (item.stage === 'failed') return item.detail || 'Processing failed';
    return STAGE_LABELS[item.stage];
  };

  const allReady = queue.length > 0 && queue.every((q) => q.stage === 'ready');
  const hasFailure = queue.some((q) => q.stage === 'failed');
  const activeCount = queue.filter(
    (q) => q.stage !== 'ready' && q.stage !== 'failed' && q.stage !== 'queued'
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
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${
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
          {queue.length > 0 && (
            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {queue.map((item) => {
                const isItemReady = item.stage === 'ready';
                const isFailed = item.stage === 'failed';
                const isWorking = !isItemReady && !isFailed && item.stage !== 'queued';

                return (
                  <div
                    key={item.id}
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
                            Secured
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
                            onClick={() => handleRemove(item.id)}
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
                  </div>
                );
              })}
            </div>
          )}
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
              Done — View in Workspace
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
