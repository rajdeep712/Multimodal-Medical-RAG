import React, { useEffect, useRef } from 'react';
import { useCitationStore } from '../../stores/useCitationStore.ts';
import { calculateRenderedBox, RenderedBox } from '../../utils/coordinates.ts';
import { Sparkles, X, BookmarkCheck } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip.tsx';

interface CitationHighlightOverlayProps {
  pageNumber: number;
  containerWidth: number;
  containerHeight: number;
}

export const CitationHighlightOverlay: React.FC<CitationHighlightOverlayProps> = ({
  pageNumber,
  containerWidth,
  containerHeight,
}) => {
  const { activeCitation, activeCoordinates, highlightPulseTimestamp, clearHighlight } =
    useCitationStore();
  const highlightRef = useRef<HTMLDivElement>(null);

  const shouldRender =
    activeCitation &&
    activeCitation.pageNumber === pageNumber &&
    activeCoordinates &&
    activeCoordinates.length > 0;

  // Auto-scroll the active highlight into view when pulse timestamp changes
  useEffect(() => {
    if (shouldRender && highlightRef.current) {
      highlightRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
        inline: 'nearest',
      });
    }
  }, [shouldRender, highlightPulseTimestamp, pageNumber]);

  if (!shouldRender || containerWidth <= 0 || containerHeight <= 0) {
    return null;
  }

  const boxes: RenderedBox[] = activeCoordinates.map((coord) =>
    calculateRenderedBox(coord, containerWidth, containerHeight)
  );

  return (
    <div className="absolute inset-0 pointer-events-none z-20 overflow-hidden">
      {boxes.map((box, idx) => {
        return (
          <div
            key={idx}
            ref={idx === 0 ? highlightRef : undefined}
            style={{
              top: `${box.topPercent}%`,
              left: `${box.leftPercent}%`,
              width: `${box.widthPercent}%`,
              height: `${box.heightPercent}%`,
            }}
            className="absolute rounded-md pointer-events-auto transition-all duration-300"
          >
            {/* Highlight background fill & glowing border */}
            <div className="w-full h-full bg-[#087F8C]/15 border-2 border-[#087F8C] rounded-md shadow-lg shadow-[#087F8C]/20 ring-4 ring-[#087F8C]/20 animate-citation-pulse" />

            {/* Floating Source Tag */}
            <div className="absolute -top-7 left-0 flex items-center gap-1.5 px-2 py-0.5 rounded-t-md bg-[#087F8C] text-white text-[10px] font-bold shadow-md tracking-wide">
              <BookmarkCheck className="w-3 h-3 text-[#BDEFE7]" />
              <span className="truncate max-w-[200px]">
                {box.label || activeCitation.excerpt?.slice(0, 32) || 'Evidence Source'}
              </span>
              <Tooltip>
                <TooltipTrigger
                  onClick={(e) => {
                    e.stopPropagation();
                    clearHighlight();
                  }}
                  className="ml-1 p-0.5 rounded hover:bg-white/20 transition-colors cursor-pointer"
                  aria-label="Dismiss highlight"
                >
                  <X className="w-2.5 h-2.5 text-white" />
                </TooltipTrigger>
                <TooltipContent side="bottom">Dismiss highlight</TooltipContent>
              </Tooltip>
            </div>
          </div>
        );
      })}
    </div>
  );
};
