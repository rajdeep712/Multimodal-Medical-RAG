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
import { IngestionStatus, MedicalDocument } from '../types/document.ts';
import { API_CONFIG } from '../services/api.ts';
import { documentService } from '../services/documentService.ts';
import { evictDocumentContent } from '../services/documentContentCache.ts';

interface DocumentState {
  documents: MedicalDocument[];
  selectedDocument: MedicalDocument | null;
  pendingDocument: MedicalDocument | null;
  currentPage: number;
  zoomLevel: number;
  rotation: number;
  isLoading: boolean;
  isUploadModalOpen: boolean;
  filterSearchQuery: string;
  selectDocument: (doc: MedicalDocument | string) => void;
  setPendingDocument: (doc: MedicalDocument | null) => void;
  loadPendingDocument: () => void;
  setDocumentPageCount: (id: string, pageCount: number) => void;
  setCurrentPage: (page: number) => void;
  setZoomLevel: (zoom: number) => void;
  setRotation: (rotation: number) => void;
  setUploadModalOpen: (open: boolean) => void;
  setFilterSearchQuery: (query: string) => void;
  selectDocumentAndPage: (docId: string, pageNumber: number) => void;
  refreshDocuments: () => Promise<void>;
  deleteDocument: (id: string) => Promise<boolean>;
  updateDocumentStatus: (
    id: string,
    status: Exclude<IngestionStatus, null>,
    error?: string
  ) => void;
  fitWidth: () => void;
  fitPage: () => void;
}

const DocumentContext = createContext<DocumentState | null>(null);

export function DocumentProvider({ children }: { children: ReactNode }) {
  const [documents, setDocuments] = useState<MedicalDocument[]>([]);
  const [selectedDocument, setSelectedDocument] = useState<MedicalDocument | null>(null);
  const selectedDocumentIdRef = useRef<string | null>(null);
  const [pendingDocument, setPendingDocumentState] = useState<MedicalDocument | null>(null);
  const [currentPage, setCurrentPageState] = useState<number>(1);
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const [rotation, setRotation] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isUploadModalOpen, setUploadModalOpen] = useState<boolean>(false);
  const [filterSearchQuery, setFilterSearchQuery] = useState<string>('');

  useEffect(() => {
    selectedDocumentIdRef.current = selectedDocument?.id ?? null;
  }, [selectedDocument?.id]);

  // Coalesced refresh: requests arriving while a fetch is in flight trigger
  // a single trailing re-run instead of stacking parallel list fetches (the
  // global SSE stream would otherwise fire several GETs per upload).
  const refreshInFlight = useRef(false);
  const refreshRerunNeeded = useRef(false);

  const refreshDocuments = useCallback(async () => {
    if (refreshInFlight.current) {
      refreshRerunNeeded.current = true;
      return;
    }
    refreshInFlight.current = true;
    setIsLoading(true);
    try {
      const docs = await documentService.listDocuments();
      setDocuments(docs);
    } catch (err) {
      console.error('Could not refresh documents:', err);
    } finally {
      refreshInFlight.current = false;
      setIsLoading(false);
      if (refreshRerunNeeded.current) {
        refreshRerunNeeded.current = false;
        void refreshDocuments();
      }
    }
  }, []);

  useEffect(() => {
    refreshDocuments();
  }, [refreshDocuments]);

  const updateDocumentStatus = useCallback(
    (
      id: string,
      status: Exclude<IngestionStatus, null>,
      error?: string
    ) => {
      const patch = (doc: MedicalDocument): MedicalDocument => ({
        ...doc,
        isReady: status === 'INDEXED',
        ingestionStatus: status,
        ingestionError: status === 'ERROR' ? error ?? null : null,
      });
      setDocuments((prev) => prev.map((doc) => (doc.id === id ? patch(doc) : doc)));
      setSelectedDocument((prev) => (prev?.id === id ? patch(prev) : prev));
      setPendingDocumentState((prev) => (prev?.id === id ? patch(prev) : prev));
    },
    []
  );

  // Global status stream: the backend publishes SECURED/PROCESSING/INDEXED/
  // ERROR/DELETED events for every document of this user over one SSE
  // connection. Status updates apply in place; DELETED removes the document;
  // unknown documents trigger a debounced (trailing) list refresh so a burst
  // of events for a brand-new document collapses into a single GET.
  const documentsRef = useRef<MedicalDocument[]>([]);
  useEffect(() => {
    documentsRef.current = documents;
  }, [documents]);

  const seenDocumentIdsRef = useRef<Set<string>>(new Set());

  const removeDocumentEverywhere = useCallback((id: string) => {
    seenDocumentIdsRef.current.delete(id);
    setDocuments((prev) => prev.filter((doc) => doc.id !== id));
    setSelectedDocument((prev) => (prev?.id === id ? null : prev));
    setPendingDocumentState((prev) => (prev?.id === id ? null : prev));
    evictDocumentContent(id);
  }, []);

  useEffect(() => {
    const source = new EventSource(
      `${API_CONFIG.baseURL}${API_CONFIG.endpoints.documents.userEvents}`,
      { withCredentials: true }
    );

    let unknownRefreshTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleUnknownRefresh = () => {
      if (unknownRefreshTimer) return; // one trailing refresh per burst
      unknownRefreshTimer = setTimeout(() => {
        unknownRefreshTimer = null;
        void refreshDocuments();
      }, 600);
    };

    const handle = (event: MessageEvent<string>) => {
      try {
        const data = JSON.parse(event.data || '{}') as {
          document_id?: string;
          status?: string;
          error?: string;
        };
        if (!data.document_id || !data.status) return;
        const id = data.document_id;
        const status = data.status as Exclude<IngestionStatus, null>;

        if (status === 'DELETED') {
          removeDocumentEverywhere(id);
          return;
        }

        // Remember every id we've seen an event for, so later events for the
        // same document never look "unknown" (refs can lag a render).
        const known =
          documentsRef.current.some((doc) => doc.id === id) ||
          seenDocumentIdsRef.current.has(id);
        seenDocumentIdsRef.current.add(id);

        if (!known) {
          scheduleUnknownRefresh();
          return;
        }
        updateDocumentStatus(id, status, data.error);
        if (status === 'ERROR') {
          evictDocumentContent(id);
        }
      } catch {
        // Ignore malformed event payloads.
      }
    };

    for (const status of ['SECURED', 'PROCESSING', 'INDEXED', 'ERROR', 'DELETED']) {
      source.addEventListener(status, handle as EventListener);
    }

    return () => {
      if (unknownRefreshTimer) clearTimeout(unknownRefreshTimer);
      source.close();
    };
  }, [refreshDocuments, updateDocumentStatus, removeDocumentEverywhere]);

  const selectDocument = useCallback(
    (docOrId: MedicalDocument | string) => {
      if (typeof docOrId === 'string') {
        const found = documents.find((d) => d.id === docOrId || d.fileName === docOrId);
        if (found) {
          setSelectedDocument(found);
          setPendingDocumentState(null);
          setCurrentPageState(1);
        }
      } else {
        setSelectedDocument(docOrId);
        setPendingDocumentState(null);
        setCurrentPageState(1);
      }
    },
    [documents]
  );

  const setPendingDocument = useCallback((doc: MedicalDocument | null) => {
    setPendingDocumentState(doc);
    setSelectedDocument(null);
    setCurrentPageState(1);
  }, []);

  const loadPendingDocument = useCallback(() => {
    if (!pendingDocument) return;
    setSelectedDocument(pendingDocument);
    setPendingDocumentState(null);
    setCurrentPageState(1);
  }, [pendingDocument]);

  const setDocumentPageCount = useCallback((id: string, pageCount: number) => {
    setDocuments((prev) =>
      prev.map((doc) => (doc.id === id ? { ...doc, pageCount } : doc))
    );
    setSelectedDocument((prev) => (prev?.id === id ? { ...prev, pageCount } : prev));
    setPendingDocumentState((prev) =>
      prev?.id === id ? { ...prev, pageCount } : prev
    );
  }, []);

  const selectDocumentAndPage = useCallback(
    (docId: string, pageNumber: number) => {
      const found = documents.find((d) => d.id === docId || d.fileName === docId);
      if (found) {
        setSelectedDocument({ ...found, pageCount: found.pageCount || 0 });
        setPendingDocumentState(null);
        setCurrentPageState(found.pageCount > 0
          ? Math.max(1, Math.min(pageNumber, found.pageCount))
          : Math.max(1, pageNumber));
      }
    },
    [documents]
  );

  const setCurrentPage = useCallback((page: number) => {
    setCurrentPageState(page);
  }, []);

  const deleteDocument = useCallback(async (id: string) => {
    const success = await documentService.deleteDocument(id);
    if (success) {
      const wasSelected = selectedDocumentIdRef.current === id;
      evictDocumentContent(id);
      setDocuments((prev) => prev.filter((d) => d.id !== id));
      setSelectedDocument((prev) => (prev?.id === id ? null : prev));
      setPendingDocumentState((prev) => (prev?.id === id ? null : prev));
      if (wasSelected) setCurrentPageState(1);
    }
    return success;
  }, []);

  const fitWidth = useCallback(() => {
    setZoomLevel(115);
  }, []);

  const fitPage = useCallback(() => {
    setZoomLevel(90);
  }, []);

  return React.createElement(
    DocumentContext.Provider,
    {
      value: {
        documents,
        selectedDocument,
        pendingDocument,
        currentPage,
        zoomLevel,
        rotation,
        isLoading,
        isUploadModalOpen,
        filterSearchQuery,
        selectDocument,
        setPendingDocument,
        loadPendingDocument,
        setDocumentPageCount,
        setCurrentPage,
        setZoomLevel,
        setRotation,
        setUploadModalOpen,
        setFilterSearchQuery,
        selectDocumentAndPage,
        refreshDocuments,
        deleteDocument,
        updateDocumentStatus,
        fitWidth,
        fitPage,
      },
    },
    children
  );
}

export function useDocumentStore() {
  const ctx = useContext(DocumentContext);
  if (!ctx) {
    throw new Error('useDocumentStore must be used within DocumentProvider');
  }
  return ctx;
}
