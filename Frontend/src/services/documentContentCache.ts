import { API_CONFIG, ApiError } from './api.ts';

const contentCache = new Map<string, Blob>();

export function getCachedDocumentContent(documentId: string): Blob | null {
  return contentCache.get(documentId) ?? null;
}

export function evictDocumentContent(documentId: string): void {
  contentCache.delete(documentId);
}

export function clearDocumentContentCache(): void {
  contentCache.clear();
}

export async function fetchDocumentContent(
  documentId: string,
  signal?: AbortSignal,
): Promise<Blob> {
  const cached = contentCache.get(documentId);
  if (cached) return cached;

  const response = await fetch(
    `${API_CONFIG.baseURL}${API_CONFIG.endpoints.documents.content(documentId)}`,
    {
      credentials: 'include',
      cache: 'no-store',
      signal,
      headers: { Accept: 'application/pdf' },
    },
  );

  if (!response.ok) {
    let detail = `Could not load the document (${response.status})`;
    try {
      const body = await response.json();
      if (typeof body?.detail === 'string') detail = body.detail;
    } catch {
      detail = `Could not load the document (${response.status})`;
    }
    throw new ApiError(response.status, detail);
  }

  const blob = await response.blob();
  if (blob.size === 0) {
    throw new ApiError(response.status, 'Secure storage returned an empty document');
  }

  contentCache.set(documentId, blob);
  return blob;
}
