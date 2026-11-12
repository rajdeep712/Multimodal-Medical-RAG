import {
  useState,
  useCallback,
  createContext,
  useContext,
  ReactNode,
  useEffect,
  useRef,
} from 'react';
import React from 'react';
import { useLocation, useNavigate, matchPath } from 'react-router-dom';
import { ChatConversation, ChatMessage } from '../types/chat.ts';
import { Citation } from '../types/document.ts';
import { chatService, DateRangeFilter } from '../services/chatService.ts';

interface ChatStoreState {
  conversation: ChatConversation | null;
  conversations: ChatConversation[];
  isStreaming: boolean;
  isThinking: boolean;
  isLoadingChat: boolean;
  selectedDocumentFilters: string[];
  dateRangeFilter: DateRangeFilter;
  sendMessage: (query: string) => void;
  toggleDocumentFilter: (docId: string) => void;
  clearDocumentFilters: () => void;
  setDateRangeFilter: (filter: DateRangeFilter) => void;
  startNewChat: () => void;
  selectConversation: (id: string) => void;
  deleteConversation: (id: string) => Promise<boolean>;
  renameConversation: (id: string, title: string) => Promise<boolean>;
}

const ChatContext = createContext<ChatStoreState | null>(null);

export function ChatProvider({ children }: { children: ReactNode }) {
  const [conversation, setConversation] = useState<ChatConversation | null>(null);
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [isThinking, setIsThinking] = useState<boolean>(false);
  const [isLoadingChat, setIsLoadingChat] = useState<boolean>(false);
  const [selectedDocumentFilters, setSelectedDocumentFilters] = useState<string[]>([]);
  const [dateRangeFilter, setDateRangeFilter] = useState<DateRangeFilter>({});

  const navigate = useNavigate();
  const location = useLocation();

  // The active chat id comes from the URL (/c/:chatId); /workspace means a
  // brand-new blank chat whose record is only created on the first query.
  const chatMatch = matchPath('/c/:chatId', location.pathname);
  const routeChatId = chatMatch?.params.chatId ?? null;

  // The provider lives above <Routes> so an in-flight stream survives the
  // /workspace -> /c/:chatId replace-navigation; these refs let the route
  // effect distinguish "already handling it" from "deep-linked".
  const conversationRef = useRef<ChatConversation | null>(null);
  useEffect(() => {
    conversationRef.current = conversation;
  }, [conversation]);
  const isStreamingRef = useRef<boolean>(false);
  useEffect(() => {
    isStreamingRef.current = isStreaming;
  }, [isStreaming]);
  const streamCloseRef = useRef<(() => void) | null>(null);

  const refreshConversations = useCallback(async () => {
    try {
      const chats = await chatService.listChats();
      setConversations(chats);
    } catch (err) {
      console.error('Could not load chat histories:', err);
    }
  }, []);

  useEffect(() => {
    void refreshConversations();
  }, [refreshConversations]);

  const loadChatById = useCallback(async (id: string) => {
    try {
      const chat = await chatService.getChat(id);
      if (chat) {
        setConversation(chat);
        setSelectedDocumentFilters([]);
        setDateRangeFilter({});
        return true;
      }
    } catch (err) {
      console.error('Could not load the chat:', err);
    }
    return false;
  }, []);

  // Deep-links and in-app navigation: /c/:chatId loads that chat, /workspace
  // shows a blank chat. During an active stream the navigation is caused by
  // this provider itself, so the in-memory conversation is kept as-is.
  useEffect(() => {
    if (routeChatId) {
      if (isStreamingRef.current || conversationRef.current?.id === routeChatId) {
        return;
      }
      setIsLoadingChat(true);
      void loadChatById(routeChatId).finally(() => setIsLoadingChat(false));
    } else if (!isStreamingRef.current) {
      setConversation(null);
    }
  }, [routeChatId, loadChatById]);

  const toggleDocumentFilter = useCallback((docId: string) => {
    setSelectedDocumentFilters((prev) =>
      prev.includes(docId) ? prev.filter((id) => id !== docId) : [...prev, docId]
    );
  }, []);

  const clearDocumentFilters = useCallback(() => {
    setSelectedDocumentFilters([]);
  }, []);

  const updateMessage = useCallback(
    (messageId: string, patch: Partial<ChatMessage>) => {
      setConversation((prev) =>
        prev
          ? {
              ...prev,
              messages: prev.messages.map((m) =>
                m.id === messageId ? { ...m, ...patch } : m
              ),
            }
          : prev
      );
    },
    []
  );

  const sendMessage = useCallback(
    (query: string) => {
      const trimmed = query.trim();
      if (!trimmed || isStreamingRef.current) return;

      const now = new Date().toISOString();
      const userMessage: ChatMessage = {
        id: `msg_u_${Date.now()}`,
        role: 'user',
        content: trimmed,
        createdAt: now,
        status: 'complete',
      };
      const assistantPlaceholderId = `msg_a_${Date.now()}`;

      // Blank chat (/workspace): build a local shell so the optimistic UI
      // renders; the real id arrives with the chat_id SSE event.
      setConversation((prev) => {
        const assistantPlaceholder: ChatMessage = {
          id: assistantPlaceholderId,
          role: 'assistant',
          content: '',
          createdAt: now,
          status: 'streaming',
        };
        const base: ChatConversation = prev
          ? {
              ...prev,
              messages: [...prev.messages, userMessage, assistantPlaceholder],
            }
          : {
              id: 'pending',
              title: trimmed.slice(0, 60),
              createdAt: now,
              updatedAt: now,
              messages: [userMessage, assistantPlaceholder],
              selectedDocumentIds: [],
            };
        return base;
      });

      setIsStreaming(true);
      setIsThinking(true);

      (async () => {
        try {
          const pending = await chatService.sendQuery({
            query: trimmed,
            chatId: conversationRef.current?.id.startsWith('ch-')
              ? conversationRef.current.id
              : null,
            docIds: selectedDocumentFilters,
            dateFilter:
              dateRangeFilter.startDate || dateRangeFilter.endDate
                ? dateRangeFilter
                : undefined,
          });

          streamCloseRef.current = chatService.streamAnswer(
            pending.chatId,
            pending.streamToken,
            {
              onChatId: (chatId) => {
                // New chat: adopt the server-generated id and update the
                // URL without a reload.
                setConversation((prev) => (prev ? { ...prev, id: chatId } : prev));
                navigate(`/c/${chatId}`, { replace: true });
              },
              onCitations: (citations: Citation[]) => {
                // The backend emits the used citations after the full answer
                // stream; attaching them reveals the sources panel.
                updateMessage(assistantPlaceholderId, { citations });
              },
              onDelta: (chunk) => {
                // The first streamed token ends the thinking phase.
                setIsThinking(false);
                setConversation((prev) =>
                  prev
                    ? {
                        ...prev,
                        messages: prev.messages.map((m) =>
                          m.id === assistantPlaceholderId
                            ? { ...m, content: m.content + chunk, status: 'streaming' }
                            : m
                        ),
                      }
                    : prev
                );
              },
              onDone: () => {
                updateMessage(assistantPlaceholderId, { status: 'complete' });
                setIsStreaming(false);
                setIsThinking(false);
                void refreshConversations();
              },
              onError: (message) => {
                updateMessage(assistantPlaceholderId, {
                  content: message,
                  status: 'error',
                });
                setIsStreaming(false);
                setIsThinking(false);
              },
            }
          );
        } catch (err: any) {
          updateMessage(assistantPlaceholderId, {
            content: err?.message || 'Could not send the message',
            status: 'error',
          });
          setIsStreaming(false);
          setIsThinking(false);
        }
      })();
    },
    [navigate, refreshConversations, selectedDocumentFilters, dateRangeFilter, updateMessage]
  );

  // Close any open stream when the provider unmounts.
  useEffect(() => {
    return () => {
      streamCloseRef.current?.();
    };
  }, []);

  const startNewChat = useCallback(() => {
    streamCloseRef.current?.();
    setIsStreaming(false);
    setIsThinking(false);
    setConversation(null);
    navigate('/workspace', { replace: true });
  }, [navigate]);

  const selectConversation = useCallback(
    (id: string) => {
      navigate(`/c/${id}`);
    },
    [navigate]
  );

  const deleteConversation = useCallback(
    async (id: string) => {
      try {
        const success = await chatService.deleteChat(id);
        if (success) {
          setConversations((prev) => prev.filter((conv) => conv.id !== id));
          if (conversationRef.current?.id === id) {
            setConversation(null);
            navigate('/workspace', { replace: true });
          }
        }
        return success;
      } catch (err) {
        console.error('Could not delete the chat:', err);
        return false;
      }
    },
    [navigate]
  );

  const renameConversation = useCallback(async (id: string, title: string) => {
    try {
      const success = await chatService.renameChat(id, title);
      if (success) {
        setConversations((prev) =>
          prev.map((conv) => (conv.id === id ? { ...conv, title } : conv))
        );
        setConversation((prev) => (prev?.id === id ? { ...prev, title } : prev));
      }
      return success;
    } catch (err) {
      console.error('Could not rename the chat:', err);
      return false;
    }
  }, []);

  return React.createElement(
    ChatContext.Provider,
    {
      value: {
        conversation,
        conversations,
        isStreaming,
        isThinking,
        isLoadingChat,
        selectedDocumentFilters,
        dateRangeFilter,
        sendMessage,
        toggleDocumentFilter,
        clearDocumentFilters,
        setDateRangeFilter,
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
