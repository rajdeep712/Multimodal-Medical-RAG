import { useState, useCallback, createContext, useContext, ReactNode, useEffect } from 'react';
import React from 'react';
import { MedicalDocument } from '../types/document.ts';
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
  fitWidth: () => void;
  fitPage: () => void;
}

const DocumentContext = createContext<DocumentState | null>(null);

export function DocumentProvider({ children }: { children: ReactNode }) {
  const [documents, setDocuments] = useState<MedicalDocument[]>([]);
  const [selectedDocument, setSelectedDocument] = useState<MedicalDocument | null>(null);
  const [pendingDocument, setPendingDocumentState] = useState<MedicalDocument | null>(null);
  const [currentPage, setCurrentPageState] = useState<number>(1);
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const [rotation, setRotation] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isUploadModalOpen, setUploadModalOpen] = useState<boolean>(false);
  const [filterSearchQuery, setFilterSearchQuery] = useState<string>('');

  const refreshDocuments = useCallback(async () => {
    setIsLoading(true);
    try {
      const docs = await documentService.listDocuments();
      setDocuments(docs);
    } catch (err) {
      console.error('Could not refresh documents:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshDocuments();
  }, [refreshDocuments]);

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
      evictDocumentContent(id);
      setDocuments((prev) => prev.filter((d) => d.id !== id));
      setSelectedDocument((prev) => (prev?.id === id ? null : prev));
      setPendingDocumentState((prev) => (prev?.id === id ? null : prev));
      setCurrentPageState(1);
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
