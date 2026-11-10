import { MedicalDocument, MedicalDocumentPageData } from '../types/document.ts';
import { API_CONFIG, ApiError } from './api.ts';

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
    stage: 'queued' | 'uploading' | 'uploaded' | 'encrypting' | 'preparing' | 'ready',
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
  created_at: string;
}

function categoryForMime(mime: string): MedicalDocument['category'] {
  if (mime.startsWith('image/')) return 'Radiology / Imaging';
  if (mime === 'application/pdf') return 'Clinical Summary';
  return 'Laboratory';
}

function buildMetadataPage(upload: UploadApiResponse): MedicalDocumentPageData {
  const uploadedAt = new Date().toLocaleString();
  return {
    pageNumber: 1,
    header: {
      hospitalOrClinic: 'MEDILENS MEDICAL INTELLIGENCE SYSTEM',
      department: 'Secure Encrypted Document Vault',
      patientName: 'Document Owner',
      patientId: upload.document_id.slice(0, 12).toUpperCase(),
      dob: '—',
      gender: '—',
      collectedDate: uploadedAt,
      reportedDate: uploadedAt,
    },
    contentSections: [
      {
        type: 'keyValue',
        heading: 'INGESTION & METADATA OVERVIEW',
        pairs: [
          { key: 'File Name', value: upload.original_filename },
          { key: 'MIME Type', value: upload.mime_type },
          { key: 'Original Size', value: `${(upload.size / (1024 * 1024)).toFixed(2)} MB` },
          { key: 'SHA-256 (plaintext)', value: upload.sha256 },
        ],
      },
      {
        type: 'paragraph',
        heading: 'SECURE STORAGE',
        paragraphs: [
          `This document is encrypted at rest with AES-256-GCM using a per-document key wrapped by AWS KMS (RSA-OAEP), and the package is signed and stored in S3 under "${upload.document_id}". Extracted page content will appear here once the multimodal ingestion pipeline runs.`,
        ],
      },
    ],
    footerNotes: 'MediLens AI — encrypted document record. Content extraction coming soon.',
  };
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
    pageCount: 1,
    category: categoryForMime(upload.mime_type),
    pages: [buildMetadataPage(upload)],
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
    pageCount: 1,
    category: categoryForMime(row.mime_type),
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

  /**
   * Upload one file and follow its server pipeline over SSE. Upload bytes
   * progress comes from the browser XHR; pipeline stages come from the
   * backend's UPLOADED -> ENCRYPTING -> PREPARING -> READY/ERROR events.
   */
  uploadDocument(file: File, onProgress?: UploadProgressCallback): Promise<MedicalDocument> {
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
          onProgress?.('uploading', Math.round(fraction * 60));
        }
      };

      const fail = (message: string) => {
        reject(new ApiError(0, message));
      };

      const followPipeline = (upload: UploadApiResponse) => {
        onProgress?.('uploading', 60);
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
              const data = JSON.parse(event.data || '{}');
              if (stage === 'ready') {
                finish(() => {
                  onProgress?.('ready', 100, data.s3_prefix);
                  resolve(documentFromUpload(upload));
                });
              } else {
                onProgress?.(stage, progress);
              }
            } catch {
              // Ignore malformed event payloads.
            }
          };

        source.addEventListener('UPLOADED', handle('uploaded', 65));
        source.addEventListener('ENCRYPTING', handle('encrypting', 75));
        source.addEventListener('PREPARING', handle('preparing', 85));
        source.addEventListener('READY', handle('ready', 100));
        source.addEventListener('ERROR', (event: MessageEvent<string>) => {
          let message = 'Processing failed on the server';
          try {
            const data = JSON.parse(event.data || '{}');
            if (typeof data.error === 'string') message = data.error;
          } catch {
            // keep default message
          }
          finish(() => reject(new ApiError(0, message)));
        });
        source.onerror = () => {
          // The stream closes after READY/ERROR, which already settled the
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
    if (response.status === 404) return false;
    if (!response.ok) {
      throw new ApiError(response.status, 'Could not delete the document');
    }
    return true;
  },

  resetDefaults() {
    // No-op: the source of truth lives in the backend database now.
  },
};
