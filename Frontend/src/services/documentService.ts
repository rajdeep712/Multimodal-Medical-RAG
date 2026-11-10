import { MedicalDocument } from '../types/document.ts';
import { API_CONFIG, ApiError } from './api.ts';
import {
  fetchDocumentContent,
  getCachedDocumentContent,
} from './documentContentCache.ts';

/**
 * Real document service wired to the FastAPI backend.
 *
 * - uploadDocument: XHR multipart POST (upload progress is tracked here in the
 *   browser) followed by a per-document SSE stream that reports the server
 *   pipeline: UPLOADED -> ENCRYPTING -> PREPARING -> READY/ERROR.
 * - listDocuments / deleteDocument: GET / DELETE on the documents API.
 */

export interface UploadProgressCallback {
  (
    stage:
      | 'queued'
      | 'uploading'
      | 'uploaded'
      | 'encrypting'
      | 'preparing'
      | 'secured'
      | 'processing'
      | 'indexed',
    progress: number,
    detail?: string
  ): void;
}

interface UploadApiResponse {
  document_id: string;
  original_filename: string;
  size: number;
  mime_type: string;
  sha256: string;
}

interface DocumentApiResponse {
  document_id: string;
  original_filename: string;
  mime_type: string;
  size: number;
  s3_bucket: string;
  s3_prefix: string;
  is_ready: boolean;
  ingestion_status: 'SECURED' | 'PROCESSING' | 'INDEXED' | 'ERROR' | null;
  ingestion_error: string | null;
  created_at: string;
}

interface DocumentEventPayload {
  document_id?: string;
  status?: string;
  is_ready?: boolean;
  error?: string;
  [key: string]: unknown;
}

function categoryForMime(mime: string): MedicalDocument['category'] {
  if (mime.startsWith('image/')) return 'Radiology / Imaging';
  if (mime === 'application/pdf') return 'Clinical Summary';
  return 'Laboratory';
}

function documentFromUpload(upload: UploadApiResponse): MedicalDocument {
  return {
    id: upload.document_id,
    fileName: upload.original_filename,
    title: upload.original_filename.replace(/\.[^/.]+$/, '').replace(/_/g, ' '),
    mimeType: upload.mime_type,
    uploadedAt: new Date().toISOString(),
    fileSize: `${(upload.size / (1024 * 1024)).toFixed(2)} MB`,
    status: 'ready',
    pageCount: 0,
    category: categoryForMime(upload.mime_type),
    isReady: false,
    ingestionStatus: 'SECURED',
    ingestionError: null,
    pages: [],
  };
}

function documentFromApi(row: DocumentApiResponse): MedicalDocument {
  return {
    id: row.document_id,
    fileName: row.original_filename,
    title: row.original_filename.replace(/\.[^/.]+$/, '').replace(/_/g, ' '),
    mimeType: row.mime_type,
    uploadedAt: row.created_at,
    fileSize: `${(row.size / (1024 * 1024)).toFixed(2)} MB`,
    status: 'ready',
    pageCount: 0,
    category: categoryForMime(row.mime_type),
    isReady: row.is_ready,
    ingestionStatus: row.ingestion_status,
    ingestionError: row.ingestion_error,
    pages: [],
  };
}

export const documentService = {
  async listDocuments(): Promise<MedicalDocument[]> {
    const rows = await fetch(`${API_CONFIG.baseURL}${API_CONFIG.endpoints.documents.list}`, {
      credentials: 'include',
    });
    if (!rows.ok) {
      throw new ApiError(rows.status, 'Could not load your documents');
    }
    const data = (await rows.json()) as DocumentApiResponse[];
    return data.map(documentFromApi);
  },

  async getDocumentById(id: string): Promise<MedicalDocument | null> {
    const documents = await this.listDocuments();
    return documents.find((d) => d.id === id) || null;
  },

  async getDocumentContent(id: string, signal?: AbortSignal): Promise<Blob> {
    return fetchDocumentContent(id, signal);
  },

  async downloadDocument(id: string, originalFilename: string): Promise<void> {
    const blob = getCachedDocumentContent(id) ?? (await fetchDocumentContent(id));
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${originalFilename.replace(/\.[^/.]+$/, '')}.pdf`;
    anchor.click();
    URL.revokeObjectURL(url);
  },

  /**
   * Upload one file and follow its full server pipeline over SSE. Upload
   * bytes progress comes from the browser XHR; pipeline stages come from the
   * backend's UPLOADED -> ENCRYPTING -> PREPARING -> SECURED -> PROCESSING ->
   * INDEXED/ERROR events. The promise resolves only after INDEXED; onSecured
   * fires as soon as the encrypted document is stored so callers can surface
   * it in the workspace immediately.
   */
  uploadDocument(
    file: File,
    onProgress?: UploadProgressCallback,
    onSecured?: (document: MedicalDocument) => void
  ): Promise<MedicalDocument> {
    return new Promise<MedicalDocument>((resolve, reject) => {
      const formData = new FormData();
      formData.append('file', file);

      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${API_CONFIG.baseURL}${API_CONFIG.endpoints.documents.upload}`);
      xhr.withCredentials = true;
      xhr.responseType = 'json';

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const fraction = event.loaded / event.total;
          onProgress?.('uploading', Math.round(fraction * 40));
        }
      };

      const fail = (message: string) => {
        reject(new ApiError(0, message));
      };

      const followPipeline = (upload: UploadApiResponse) => {
        onProgress?.('uploading', 40);
        const source = new EventSource(
          `${API_CONFIG.baseURL}${API_CONFIG.endpoints.documents.events(upload.document_id)}`,
          { withCredentials: true },
        );

        let settled = false;
        const finish = (fn: () => void) => {
          if (settled) return;
          settled = true;
          source.close();
          fn();
        };

        type PipelineStage = Exclude<Parameters<UploadProgressCallback>[0], 'queued'>;

        const handle = (stage: PipelineStage, progress: number) =>
          (event: MessageEvent<string>) => {
            try {
              const data = JSON.parse(event.data || '{}') as DocumentEventPayload;
              if (stage === 'secured' && onSecured) {
                onSecured(documentFromUpload(upload));
              }
              if (stage === 'indexed') {
                finish(() => {
                  onProgress?.('indexed', 100, data.status);
                  resolve({
                    ...documentFromUpload(upload),
                    isReady: true,
                    ingestionStatus: 'INDEXED',
                    ingestionError: null,
                  });
                });
              } else {
                onProgress?.(stage, progress);
              }
            } catch {
              // Ignore malformed event payloads.
            }
          };

        source.addEventListener('UPLOADED', handle('uploaded', 50));
        source.addEventListener('ENCRYPTING', handle('encrypting', 60));
        source.addEventListener('PREPARING', handle('preparing', 70));
        source.addEventListener('SECURED', handle('secured', 75));
        source.addEventListener('PROCESSING', handle('processing', 85));
        source.addEventListener('INDEXED', handle('indexed', 100));
        source.addEventListener('DELETED', (event: MessageEvent<string>) => {
          finish(() => reject(new ApiError(0, 'Document was deleted during processing')));
        });
        source.addEventListener('ERROR', (event: MessageEvent<string>) => {
          let message = 'Processing failed on the server';
          try {
            const data = JSON.parse(event.data || '{}') as DocumentEventPayload;
            if (typeof data.error === 'string') message = data.error;
          } catch {
            // keep default message
          }
          finish(() => reject(new ApiError(0, message)));
        });
        source.onerror = () => {
          // The stream closes after INDEXED/ERROR, which already settled the
          // promise; an error here means the connection dropped early.
          setTimeout(() => {
            if (!settled) {
              fail('Lost the status stream before the document finished processing');
            }
          }, 500);
        };
      };

      xhr.onload = () => {
        if (xhr.status === 201) {
          followPipeline(xhr.response as UploadApiResponse);
        } else {
          let detail = `Upload failed (${xhr.status})`;
          // xhr.responseType is "json", so read the parsed body from .response
          const body = xhr.response as { detail?: string } | null;
          if (body && typeof body.detail === 'string') detail = body.detail;
          reject(new ApiError(xhr.status, detail));
        }
      };
      xhr.onerror = () => fail('Network error while uploading — is the backend running?');

      xhr.send(formData);
    });
  },

  async deleteDocument(id: string): Promise<boolean> {
    const response = await fetch(
      `${API_CONFIG.baseURL}${API_CONFIG.endpoints.documents.delete(id)}`,
      { method: 'DELETE', credentials: 'include' },
    );
    if (response.status === 404) return true;
    if (!response.ok) {
      let detail = `Could not delete the document (${response.status})`;
      try {
        const body = await response.json();
        if (typeof body?.detail === 'string') detail = body.detail;
      } catch {
        // keep the status-based message
      }
      throw new ApiError(response.status, detail);
    }
    return true;
  },

  resetDefaults() {
    // No-op: the source of truth lives in the backend database now.
  },
};
