/**
 * Central API Configuration & HTTP Client wrapper
 * Pointed at the FastAPI backend (Backend/ app.main:app).
 */

export const API_CONFIG = {
  baseURL: import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000/api',
  endpoints: {
    auth: {
      login: '/auth/login',
      signup: '/auth/signup',
      me: '/auth/me',
      logout: '/auth/logout',
    },
    documents: {
      list: '/documents',
      upload: '/documents/upload',
      duplicates: '/documents/duplicates',
      detail: (id: string) => `/documents/${id}`,
      delete: (id: string) => `/documents/${id}`,
      content: (id: string) => `/documents/${id}/content`,
      events: (id: string) => `/documents/${id}/events`,
    },
    chat: {
      query: '/chat/query',
      stream: '/chat/stream',
      conversations: '/chat/conversations',
      citations: (id: string) => `/citations/${id}`,
    },
  },
};

/**
 * Small fetch wrapper. The FastAPI backend authenticates via HttpOnly cookies
 * (set on login/signup), so every request must send credentials and parse the
 * JSON error detail into a readable Error message.
 */
export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${API_CONFIG.baseURL}${path}`, {
    credentials: 'include',
    ...options,
    headers: {
      ...(options.body && !(options.body instanceof FormData)
        ? { 'Content-Type': 'application/json' }
        : {}),
      ...options.headers,
    },
  });

  if (!response.ok) {
    let detail = `Request failed (${response.status})`;
    try {
      const body = await response.json();
      if (typeof body?.detail === 'string') {
        detail = body.detail;
      } else if (Array.isArray(body?.detail)) {
        // FastAPI validation errors
        detail = body.detail.map((d: { msg?: string }) => d?.msg ?? JSON.stringify(d)).join(', ');
      }
    } catch {
      // non-JSON error body
    }
    throw new ApiError(response.status, detail);
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

export const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
