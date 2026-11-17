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
import { useDocumentStore } from './useDocumentStore.ts';

interface ChatStoreState {
  conversation: ChatConversation | null;
  conversations: ChatConversation[];
  isStreaming: boolean;
  isThinking: boolean;
  isLoadingChat: boolean;
  selectedDocumentFilters: string[];
  dateRangeFilter: DateRangeFilter;
  sendMessage: (query: string) => void;
  stopGeneration: () => void;
  toggleDocumentFilter: (docId: string) => void;
  selectAllDocumentFilters: (docIds: string[]) => void;
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
  const deletingChatIdsRef = useRef<Set<string>>(new Set());

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
        // The selected-document scope is the user's persistent choice
        // (mirrored to localStorage) — opening an old chat keeps it.
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

  const selectAllDocumentFilters = useCallback((docIds: string[]) => {
    setSelectedDocumentFilters(docIds);
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

  // Stop button: abort the in-flight answer. Loading phase (nothing streamed
  // yet) -> remove the assistant placeholder; streaming phase -> keep the
  // partial content as a complete message. The backend is asked to cancel the
  // retrieval / abort the LLM request; its generator persists the partial
  // answer + citations either way.
  const stopGeneration = useCallback(() => {
    if (!isStreamingRef.current) return;
    const convId = conversationRef.current?.id;
    if (convId && convId.startsWith('ch-')) {
      void chatService.stopStream(convId);
    }
    streamCloseRef.current?.();
    streamCloseRef.current = null;
    setConversation((prev) => {
      if (!prev) return prev;
      const msgs = [...prev.messages];
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].role === 'assistant' && msgs[i].status === 'streaming') {
          if (msgs[i].content.trim()) {
            msgs[i] = { ...msgs[i], status: 'complete' };
          } else {
            msgs.splice(i, 1);
          }
          break;
        }
      }
      return { ...prev, messages: msgs };
    });
    setIsStreaming(false);
    setIsThinking(false);
    void refreshConversations();
  }, [refreshConversations]);

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

  // Optimistic delete: the sidebar's AnimatePresence slides the row out
  // immediately; the API runs in the background and the list is re-synced
  // from the server if the delete fails.
  const deleteConversation = useCallback(
    async (id: string) => {
      if (deletingChatIdsRef.current.has(id)) return false;
      deletingChatIdsRef.current.add(id);
      const wasSelected = conversationRef.current?.id === id;
      setConversations((prev) => prev.filter((conv) => conv.id !== id));
      if (conversationRef.current?.id === id) {
        setConversation(null);
        navigate('/workspace', { replace: true });
      }
      try {
        const success = await chatService.deleteChat(id);
        if (!success) throw new Error('delete failed');
        return true;
      } catch (err) {
        console.error('Could not delete the chat:', err);
        await refreshConversations();
        return false;
      } finally {
        deletingChatIdsRef.current.delete(id);
      }
    },
    [navigate, refreshConversations]
  );

  // Optimistic rename: the new title shows immediately; the old title is
  // restored if the request fails.
  const renameConversation = useCallback(async (id: string, title: string) => {
    const oldTitle = conversations.find((c) => c.id === id)?.title;
    setConversations((prev) =>
      prev.map((conv) => (conv.id === id ? { ...conv, title } : conv))
    );
    setConversation((prev) => (prev?.id === id ? { ...prev, title } : prev));
    try {
      await chatService.renameChat(id, title);
      return true;
    } catch (err) {
      console.error('Could not rename the chat:', err);
      if (oldTitle !== undefined) {
        setConversations((prev) =>
          prev.map((conv) => (conv.id === id ? { ...conv, title: oldTitle } : conv))
        );
        setConversation((prev) => (prev?.id === id ? { ...prev, title: oldTitle } : prev));
      }
      return false;
    }
  }, [conversations]);

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
        stopGeneration,
        toggleDocumentFilter,
        selectAllDocumentFilters,
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

// ---------------------------------------------------------------------------
// Selected-document-filter persistence (localStorage)
//
// The RAG scope picked in the composer must survive refreshes: it is mirrored
// to localStorage on every change and restored once the document list loads.
// `known` records which documents existed at the last write, so documents
// ingested afterwards (this session or after a refresh) are auto-selected;
// with no stored state at all, every document starts selected.
const DOC_FILTERS_STORAGE_KEY = 'medilens_selected_doc_filters';

interface StoredDocFilters {
  selected: string[];
  known: string[];
}

function readStoredDocFilters(): StoredDocFilters | null {
  try {
    const raw = localStorage.getItem(DOC_FILTERS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredDocFilters> | null;
    if (!parsed || !Array.isArray(parsed.selected) || !Array.isArray(parsed.known)) {
      return null;
    }
    const asIds = (ids: unknown[]) =>
      ids.filter((id): id is string => typeof id === 'string');
    return { selected: asIds(parsed.selected), known: asIds(parsed.known) };
  } catch {
    return null; // corrupted/unreadable entry behaves like "not found"
  }
}

function writeStoredDocFilters(state: StoredDocFilters): void {
  try {
    localStorage.setItem(DOC_FILTERS_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage unavailable/blocked: the selection just won't persist.
  }
}

// Keep the persisted RAG document scope in sync with the document library.
// Call once from a component mounted under both providers (ChatComposer).
export function useDocumentFilterSync(): void {
  const { selectedDocumentFilters, selectAllDocumentFilters } = useChatStore();
  const { documents, isLoading: isLoadingDocuments } = useDocumentStore();

  const initializedRef = useRef(false);
  const knownIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    // Skip while a list fetch is in flight (the list is stale/empty then).
    if (isLoadingDocuments) return;
    const currentIds = documents.map((doc) => doc.id);
    const currentIdSet = new Set(currentIds);

    if (!initializedRef.current) {
      // First sync after load: restore the stored selection (dropping ids of
      // documents deleted meanwhile) and add anything ingested since the last
      // write. Without stored state every document starts selected.
      initializedRef.current = true;
      const stored = readStoredDocFilters();
      const restored = stored
        ? stored.selected.filter((id) => currentIdSet.has(id))
        : [];
      const added = stored
        ? currentIds.filter((id) => !new Set(stored.known).has(id))
        : currentIds;
      const next = [...new Set([...restored, ...added])];
      knownIdsRef.current = new Set(currentIds);
      selectAllDocumentFilters(next);
      writeStoredDocFilters({ selected: next, known: currentIds });
      return;
    }

    // Later syncs: newly ingested documents join the selection, deleted ones
    // are pruned, and every change (including user toggles) is persisted.
    const added = currentIds.filter((id) => !knownIdsRef.current.has(id));
    const pruned = selectedDocumentFilters.filter((id) => currentIdSet.has(id));
    knownIdsRef.current = new Set(currentIds);
    const next = [...new Set([...pruned, ...added])];
    const changed =
      added.length > 0 || next.length !== selectedDocumentFilters.length;
    if (changed) {
      selectAllDocumentFilters(next);
    }
    writeStoredDocFilters({ selected: next, known: currentIds });
  }, [
    documents,
    isLoadingDocuments,
    selectedDocumentFilters,
    selectAllDocumentFilters,
  ]);
}
