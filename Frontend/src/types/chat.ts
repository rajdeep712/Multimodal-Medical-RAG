import { Citation } from './document.ts';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations?: Citation[];
  createdAt: string;
  status?: 'streaming' | 'complete' | 'error';
  suggestedFollowUps?: string[];
  retrievalMetadata?: {
    searchedDocuments: string[];
    dateRange?: { start?: string; end?: string };
    latencyMs?: number;
  };
}

export interface ChatConversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
  selectedDocumentIds: string[];
  dateFilter?: {
    startDate?: string;
    endDate?: string;
  };
}
