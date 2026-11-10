import { useState, useCallback, createContext, useContext, ReactNode, useEffect } from 'react';
import React from 'react';
import { ChatConversation, ChatMessage } from '../types/chat.ts';
import { chatService } from '../services/chatService.ts';

interface ChatStoreState {
  conversation: ChatConversation | null;
  conversations: ChatConversation[];
  isStreaming: boolean;
  selectedDocumentFilters: string[];
  dateRangeFilter: { startDate?: string; endDate?: string };
  toggleDocumentFilter: (docId: string) => void;
  clearDocumentFilters: () => void;
  setDateRangeFilter: (range: { startDate?: string; endDate?: string }) => void;
  sendMessage: (query: string) => Promise<void>;
  startNewChat: () => Promise<void>;
  selectConversation: (id: string) => Promise<void>;
  deleteConversation: (id: string) => Promise<boolean>;
  renameConversation: (id: string, newTitle: string) => Promise<boolean>;
}

const ChatContext = createContext<ChatStoreState | null>(null);

export function ChatProvider({ children }: { children: ReactNode }) {
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [conversation, setConversation] = useState<ChatConversation | null>(null);
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [selectedDocumentFilters, setSelectedDocumentFilters] = useState<string[]>([]);
  const [dateRangeFilter, setDateRangeFilter] = useState<{ startDate?: string; endDate?: string }>({});

  useEffect(() => {
    let mounted = true;
    chatService.getConversations().then((convs) => {
      if (mounted) {
        setConversations(convs);
        if (convs.length > 0) {
          setConversation(convs[0]);
          setSelectedDocumentFilters(convs[0].selectedDocumentIds || []);
        }
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  const toggleDocumentFilter = useCallback((docId: string) => {
    setSelectedDocumentFilters((prev) =>
      prev.includes(docId) ? prev.filter((id) => id !== docId) : [...prev, docId]
    );
  }, []);

  const clearDocumentFilters = useCallback(() => {
    setSelectedDocumentFilters([]);
  }, []);

  const sendMessage = useCallback(
    async (query: string) => {
      if (!conversation || !query.trim() || isStreaming) return;

      const userMsg: ChatMessage = {
        id: `msg_u_${Date.now()}`,
        role: 'user',
        content: query.trim(),
        createdAt: new Date().toISOString(),
        status: 'complete',
      };

      // Append user message immediately
      setConversation((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          messages: [...prev.messages, userMsg],
        };
      });

      setIsStreaming(true);

      // Create streaming placeholder for assistant
      const tempId = `msg_a_${Date.now()}`;
      setConversation((prev) => {
        if (!prev) return prev;
        const placeholder: ChatMessage = {
          id: tempId,
          role: 'assistant',
          content: '',
          createdAt: new Date().toISOString(),
          status: 'streaming',
        };
        return {
          ...prev,
          messages: [...prev.messages, placeholder],
        };
      });

      try {
        const assistantResult = await chatService.queryMedicalRAG({
          conversationId: conversation.id,
          query,
          selectedDocIds: selectedDocumentFilters.length > 0 ? selectedDocumentFilters : undefined,
          dateFilter: dateRangeFilter.startDate || dateRangeFilter.endDate ? dateRangeFilter : undefined,
          onChunk: (_chunk, accumulated) => {
            setConversation((prev) => {
              if (!prev) return prev;
              return {
                ...prev,
                messages: prev.messages.map((m) =>
                  m.id === tempId ? { ...m, content: accumulated, status: 'streaming' } : m
                ),
              };
            });
          },
        });

        // Finalize message with citations and complete status
        setConversation((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            messages: prev.messages.map((m) => (m.id === tempId ? assistantResult : m)),
          };
        });
      } catch (err) {
        console.error('Chat error:', err);
        setConversation((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            messages: prev.messages.map((m) =>
              m.id === tempId
                ? {
                    ...m,
                    content: 'An error occurred while synthesizing evidence from your medical documents. Please retry.',
                    status: 'error',
                  }
                : m
            ),
          };
        });
      } finally {
        setIsStreaming(false);
      }
    },
    [conversation, isStreaming, selectedDocumentFilters, dateRangeFilter]
  );

  const startNewChat = useCallback(async () => {
    const newConv = await chatService.createConversation('New Medical Consultation');
    setConversations((prev) => [newConv, ...prev]);
    setConversation(newConv);
    setSelectedDocumentFilters(['doc_cbc_2026', 'doc_rx_2026', 'doc_xray_2026']);
  }, []);

  const selectConversation = useCallback(async (id: string) => {
    const conv = await chatService.getConversation(id);
    if (conv) {
      setConversation(conv);
      setSelectedDocumentFilters(conv.selectedDocumentIds || []);
    }
  }, []);

  const deleteConversation = useCallback(
    async (id: string) => {
      const success = await chatService.deleteConversation(id);
      if (success) {
        setConversations((prev) => {
          const next = prev.filter((c) => c.id !== id);
          if (conversation?.id === id) {
            if (next.length > 0) {
              setConversation(next[0]);
              setSelectedDocumentFilters(next[0].selectedDocumentIds || []);
            } else {
              setConversation(null);
            }
          }
          return next;
        });
      }
      return success;
    },
    [conversation]
  );

  const renameConversation = useCallback(async (id: string, newTitle: string) => {
    const success = await chatService.renameConversation(id, newTitle);
    if (success) {
      setConversations((prev) =>
        prev.map((c) => (c.id === id ? { ...c, title: newTitle } : c))
      );
      setConversation((prev) => (prev?.id === id ? { ...prev, title: newTitle } : prev));
    }
    return success;
  }, []);

  return React.createElement(
    ChatContext.Provider,
    {
      value: {
        conversation,
        conversations,
        isStreaming,
        selectedDocumentFilters,
        dateRangeFilter,
        toggleDocumentFilter,
        clearDocumentFilters,
        setDateRangeFilter,
        sendMessage,
        startNewChat,
        selectConversation,
        deleteConversation,
        renameConversation,
      },
    },
    children
  );
}

export function useChatStore() {
  const ctx = useContext(ChatContext);
  if (!ctx) {
    throw new Error('useChatStore must be used within ChatProvider');
  }
  return ctx;
}
