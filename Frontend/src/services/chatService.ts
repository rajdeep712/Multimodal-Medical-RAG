import { ChatConversation, ChatMessage } from '../types/chat.ts';
import { Citation } from '../types/document.ts';
import { API_CONFIG, ApiError, apiRequest } from './api.ts';

/**
 * Real chat service wired to the FastAPI backend.
 *
 * sendQuery stores the user message (creating the chat record on the first
 * query of a conversation) and returns a one-time stream token; streamAnswer
 * then opens the per-chat SSE stream and forwards its events:
 *   chat_id (new chats only) -> citations -> delta* -> done / error.
 */

export interface DateRangeFilter {
  startDate?: string;
  endDate?: string;
}

export interface SendQueryOptions {
  query: string;
  chatId?: string | null;
  docIds?: string[];
  dateFilter?: DateRangeFilter;
}

export interface SendQueryResult {
  chatId: string;
  messageId: string;
  streamToken: string;
  isNewChat: boolean;
}

export interface StreamHandlers {
  onChatId?: (chatId: string) => void;
  onCitations?: (citations: Citation[]) => void;
  onDelta?: (chunk: string, accumulated: string) => void;
  onDone?: (messageId: string) => void;
  onError?: (message: string) => void;
}

interface ChatSummaryResponse {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

interface MessageResponse {
  id: string;
  role: string;
  content: string;
  createdAt: string;
  citations: {
    id: string;
    documentId: string | null;
    documentName: string | null;
    pageNumber: number | null;
    contentType: string | null;
    excerpt: string | null;
    coordinates: Citation['coordinates'] | null;
    score: number;
  }[];
}

interface ChatDetailResponse extends ChatSummaryResponse {
  messages: MessageResponse[];
}

function citationsFromMessage(message: MessageResponse): Citation[] {
  return (message.citations || []).map((citation) => ({
    id: citation.id,
    documentId: citation.documentId || '',
    documentName: citation.documentName || 'Unknown document',
    pageNumber: citation.pageNumber,
    contentType: (citation.contentType as Citation['contentType']) || 'text',
    coordinates: Array.isArray(citation.coordinates)
      ? (citation.coordinates as Citation['coordinates'])
      : [],
    excerpt: citation.excerpt || undefined,
  }));
}

function messageFromResponse(message: MessageResponse): ChatMessage {
  return {
    id: message.id,
    role: message.role === 'user' ? 'user' : 'assistant',
    content: message.content,
    createdAt: message.createdAt,
    status: 'complete',
    citations: citationsFromMessage(message),
  };
}

export const chatService = {
  async listChats(): Promise<ChatConversation[]> {
    const rows = await apiRequest<ChatSummaryResponse[]>(API_CONFIG.endpoints.chat.list);
    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      messages: [],
      selectedDocumentIds: [],
    }));
  },

  async getChat(id: string): Promise<ChatConversation | null> {
    try {
      const detail = await apiRequest<ChatDetailResponse>(
        API_CONFIG.endpoints.chat.detail(id),
      );
      return {
        id: detail.id,
        title: detail.title,
        createdAt: detail.createdAt,
        updatedAt: detail.updatedAt,
        messages: detail.messages.map(messageFromResponse),
        selectedDocumentIds: [],
      };
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) return null;
      throw err;
    }
  },

  async sendQuery(options: SendQueryOptions): Promise<SendQueryResult> {
    const raw = await apiRequest<{
      chat_id: string;
      message_id: string;
      stream_token: string;
      is_new_chat: boolean;
    }>(API_CONFIG.endpoints.chat.create, {
      method: 'POST',
      body: JSON.stringify({
        query: options.query,
        chat_id: options.chatId || undefined,
        doc_ids:
          options.docIds && options.docIds.length > 0 ? options.docIds : undefined,
        ingestion_from: options.dateFilter?.startDate || undefined,
        ingestion_to: options.dateFilter?.endDate || undefined,
      }),
    });
    // Backend returns snake_case keys.
    return {
      chatId: raw.chat_id,
      messageId: raw.message_id,
      streamToken: raw.stream_token,
      isNewChat: raw.is_new_chat,
    };
  },

  /**
   * Open the per-chat SSE stream for a pending query. Returns a close
   * function; handlers fire in order: chat_id -> citations -> delta* -> done.
   */
  streamAnswer(
    chatId: string,
    streamToken: string,
    handlers: StreamHandlers,
  ): () => void {
    const source = new EventSource(
      `${API_CONFIG.baseURL}${API_CONFIG.endpoints.chat.stream(chatId, streamToken)}`,
      { withCredentials: true },
    );

    let closedByServer = false;
    const close = () => {
      closedByServer = true;
      source.close();
    };

    source.addEventListener('chat_id', (event: MessageEvent<string>) => {
      try {
        const data = JSON.parse(event.data || '{}') as { chat_id?: string };
        if (data.chat_id) handlers.onChatId?.(data.chat_id);
      } catch {
        // Ignore malformed payloads.
      }
    });

    source.addEventListener('citations', (event: MessageEvent<string>) => {
      try {
        const data = JSON.parse(event.data || '{}') as { citations?: Citation[] };
        if (data.citations) handlers.onCitations?.(data.citations);
      } catch {
        // Ignore malformed payloads.
      }
    });

    source.addEventListener('delta', (event: MessageEvent<string>) => {
      try {
        const data = JSON.parse(event.data || '{}') as { delta?: string };
        if (typeof data.delta === 'string') handlers.onDelta?.(data.delta, data.delta);
      } catch {
        // Ignore malformed payloads.
      }
    });

    source.addEventListener('done', (event: MessageEvent<string>) => {
      try {
        const data = JSON.parse(event.data || '{}') as { message_id?: string };
        handlers.onDone?.(data.message_id || '');
      } catch {
        handlers.onDone?.('');
      } finally {
        close();
      }
    });

    source.addEventListener('error', (event: MessageEvent<string>) => {
      let message = 'The answer stream failed on the server';
      try {
        const data = JSON.parse(event.data || '{}') as { error?: string };
        if (typeof data.error === 'string') message = data.error;
      } catch {
        // keep default message
      }
      handlers.onError?.(message);
      close();
    });

    source.onerror = () => {
      // A dropped connection without a terminal event: surface it, unless the
      // stream already finished (done/error close the source first).
      setTimeout(() => {
        if (!closedByServer && source.readyState === EventSource.CLOSED) {
          handlers.onError?.('The answer stream was interrupted');
        }
      }, 300);
    };

    return close;
  },

  async deleteChat(id: string): Promise<boolean> {
    const response = await fetch(
      `${API_CONFIG.baseURL}${API_CONFIG.endpoints.chat.delete(id)}`,
      { method: 'DELETE', credentials: 'include' },
    );
    if (response.status === 404) return true;
    if (!response.ok) {
      let detail = `Could not delete the chat (${response.status})`;
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

  async renameChat(id: string, title: string): Promise<boolean> {
    try {
      await apiRequest(API_CONFIG.endpoints.chat.update(id), {
        method: 'PATCH',
        body: JSON.stringify({ title }),
      });
      return true;
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) return true;
      throw err;
    }
  },

  resetDefaults() {
    // No-op: chats live in the backend database.
  },
};
