import { useState, useCallback, createContext, useContext, ReactNode, useEffect } from 'react';
import React from 'react';
import { MedicalDocument } from '../types/document.ts';
import { documentService } from '../services/documentService.ts';

interface DocumentState {
  documents: MedicalDocument[];
  selectedDocument: MedicalDocument | null;
  currentPage: number;
  zoomLevel: number;
  rotation: number;
  isLoading: boolean;
  isUploadModalOpen: boolean;
  filterSearchQuery: string;
  selectDocument: (doc: MedicalDocument | string) => void;
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
      if (!selectedDocument && docs.length > 0) {
        setSelectedDocument(docs[0]);
        setCurrentPageState(1);
      }
    } catch (err) {
      // Keep the workspace usable even if the document API is unreachable.
      console.error('Could not refresh documents:', err);
    } finally {
      setIsLoading(false);
    }
  }, [selectedDocument]);

  useEffect(() => {
    refreshDocuments();
  }, [refreshDocuments]);

  const selectDocument = useCallback(
    (docOrId: MedicalDocument | string) => {
      if (typeof docOrId === 'string') {
        const found = documents.find((d) => d.id === docOrId || d.fileName === docOrId);
        if (found) {
          setSelectedDocument(found);
          setCurrentPageState(1);
        }
      } else {
        setSelectedDocument(docOrId);
        setCurrentPageState(1);
      }
    },
    [documents]
  );

  const selectDocumentAndPage = useCallback(
    (docId: string, pageNumber: number) => {
      const found = documents.find((d) => d.id === docId || d.fileName === docId);
      if (found) {
        setSelectedDocument(found);
        setCurrentPageState(Math.max(1, Math.min(pageNumber, found.pageCount || 1)));
      }
    },
    [documents]
  );

  const setCurrentPage = useCallback((page: number) => {
    setCurrentPageState(page);
  }, []);

  const deleteDocument = useCallback(
    async (id: string) => {
      const success = await documentService.deleteDocument(id);
      if (success) {
        setDocuments((prev) => {
          const next = prev.filter((d) => d.id !== id);
          if (selectedDocument?.id === id) {
            setSelectedDocument(next[0] || null);
            setCurrentPageState(1);
          }
          return next;
        });
      }
      return success;
    },
    [selectedDocument]
  );

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
        currentPage,
        zoomLevel,
        rotation,
        isLoading,
        isUploadModalOpen,
        filterSearchQuery,
        selectDocument,
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
