import { useState, useCallback, createContext, useContext, ReactNode } from 'react';
import React from 'react';
import { Citation, SourceCoordinates } from '../types/document.ts';

interface CitationState {
  activeCitation: Citation | null;
  activeCoordinates: SourceCoordinates[];
  highlightPulseTimestamp: number;
  hoveredCitation: Citation | null;
  hoverPosition: { x: number; y: number } | null;
  setActiveCitation: (citation: Citation | null) => void;
  setHoveredCitation: (citation: Citation | null, pos?: { x: number; y: number } | null) => void;
  clearHighlight: () => void;
}

const CitationContext = createContext<CitationState | null>(null);

export function CitationProvider({ children }: { children: ReactNode }) {
  const [activeCitation, setActiveCitationState] = useState<Citation | null>(null);
  const [activeCoordinates, setActiveCoordinates] = useState<SourceCoordinates[]>([]);
  const [highlightPulseTimestamp, setHighlightPulseTimestamp] = useState<number>(0);
  const [hoveredCitation, setHoveredCitationState] = useState<Citation | null>(null);
  const [hoverPosition, setHoverPosition] = useState<{ x: number; y: number } | null>(null);

  const setActiveCitation = useCallback((citation: Citation | null) => {
    setActiveCitationState(citation);
    if (citation) {
      setActiveCoordinates(citation.coordinates || []);
      setHighlightPulseTimestamp(Date.now());
    } else {
      setActiveCoordinates([]);
    }
  }, []);

  const setHoveredCitation = useCallback(
    (citation: Citation | null, pos?: { x: number; y: number } | null) => {
      setHoveredCitationState(citation);
      setHoverPosition(pos || null);
    },
    []
  );

  const clearHighlight = useCallback(() => {
    setActiveCitationState(null);
    setActiveCoordinates([]);
  }, []);

  return React.createElement(
    CitationContext.Provider,
    {
      value: {
        activeCitation,
        activeCoordinates,
        highlightPulseTimestamp,
        hoveredCitation,
        hoverPosition,
        setActiveCitation,
        setHoveredCitation,
        clearHighlight,
      },
    },
    children
  );
}

export function useCitationStore() {
  const ctx = useContext(CitationContext);
  if (!ctx) {
    throw new Error('useCitationStore must be used within CitationProvider');
  }
  return ctx;
}
