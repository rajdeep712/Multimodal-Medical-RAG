import React from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Download,
  RotateCw,
} from 'lucide-react';
import { useDocumentStore } from '../../stores/useDocumentStore.ts';
import { documentService } from '../../services/documentService.ts';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip.tsx';

export const DocumentToolbar: React.FC = () => {
  const {
    selectedDocument,
    currentPage,
    setCurrentPage,
    zoomLevel,
    setZoomLevel,
    rotation,
    setRotation,
    fitWidth,
    fitPage,
  } = useDocumentStore();

  if (!selectedDocument) return null;

  const totalPages = selectedDocument.pageCount || selectedDocument.pages?.length || 1;

  const handlePrevPage = () => {
    if (currentPage > 1) setCurrentPage(currentPage - 1);
  };

  const handleNextPage = () => {
    if (currentPage < totalPages) setCurrentPage(currentPage + 1);
  };

  const handleRotate = () => {
    setRotation((rotation + 90) % 360);
  };

  const handleDownload = async () => {
    try {
      await documentService.downloadDocument(selectedDocument.id, selectedDocument.fileName);
    } catch (error) {
      console.error('Could not download the document:', error);
    }
  };

  return (
    <div className="h-12 bg-white border-b border-[#E2E8F0] px-3 sm:px-4 flex items-center justify-between text-xs text-[#334155] select-none shrink-0">
      {/* Left: Page Navigator (segmented pill) */}
      <div className="flex items-center gap-1 bg-[#F8FAFC] p-1 rounded-xl border border-[#E2E8F0]">
        <Tooltip>
          <TooltipTrigger render={<span className="inline-flex rounded-lg" />}>
            <button
              onClick={handlePrevPage}
              disabled={currentPage <= 1}
              className="p-1 rounded-lg hover:bg-white text-slate-600 hover:text-[#123047] disabled:opacity-40 disabled:hover:bg-transparent disabled:pointer-events-none transition-all cursor-pointer disabled:cursor-not-allowed"
              aria-label="Previous Page"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">{currentPage <= 1 ? 'No previous pages' : 'Previous Page'}</TooltipContent>
        </Tooltip>

        <div className="flex items-center gap-1 font-medium px-0.5">
          <span className="text-[11px] text-[#64748B]">Page</span>
          <input
            type="number"
            min={1}
            max={totalPages}
            value={currentPage}
            onChange={(e) => {
              const val = parseInt(e.target.value, 10);
              if (!isNaN(val) && val >= 1 && val <= totalPages) {
                setCurrentPage(val);
              }
            }}
            className="w-9 text-center h-6 rounded-md border border-[#CBD5E1] bg-white font-semibold text-[#123047] focus:outline-none focus:border-[#087F8C] focus:ring-2 focus:ring-[#087F8C]/15"
          />
          <span className="text-[11px] text-[#64748B]">of {totalPages}</span>
        </div>

        <Tooltip>
          <TooltipTrigger render={<span className="inline-flex rounded-lg" />}>
            <button
              onClick={handleNextPage}
              disabled={currentPage >= totalPages}
              className="p-1 rounded-lg hover:bg-white text-slate-600 hover:text-[#123047] disabled:opacity-40 disabled:hover:bg-transparent disabled:pointer-events-none transition-all cursor-pointer disabled:cursor-not-allowed"
              aria-label="Next Page"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">{currentPage >= totalPages ? 'No more pages' : 'Next Page'}</TooltipContent>
        </Tooltip>
      </div>

      {/* Center: Zoom Controls (segmented pill) */}
      <div className="hidden md:flex items-center gap-1 bg-[#F8FAFC] p-1 rounded-xl border border-[#E2E8F0]">
        <Tooltip>
          <TooltipTrigger render={<span className="inline-flex rounded-lg" />}>
            <button
              onClick={() => setZoomLevel(Math.max(50, zoomLevel - 15))}
              disabled={zoomLevel <= 50}
              className="p-1 rounded-lg hover:bg-white text-slate-600 hover:text-[#123047] transition-all cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 disabled:pointer-events-none"
              aria-label="Zoom Out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">{zoomLevel <= 50 ? 'Minimum zoom reached' : 'Zoom Out'}</TooltipContent>
        </Tooltip>

        <span className="px-2 font-mono text-[11px] font-semibold text-[#123047] tabular-nums">
          {zoomLevel}%
        </span>

        <Tooltip>
          <TooltipTrigger render={<span className="inline-flex rounded-lg" />}>
            <button
              onClick={() => setZoomLevel(Math.min(200, zoomLevel + 15))}
              disabled={zoomLevel >= 200}
              className="p-1 rounded-lg hover:bg-white text-slate-600 hover:text-[#123047] transition-all cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 disabled:pointer-events-none"
              aria-label="Zoom In"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">{zoomLevel >= 200 ? 'Maximum zoom reached' : 'Zoom In'}</TooltipContent>
        </Tooltip>

        <div className="h-3 w-px bg-slate-300 mx-1" />

        <button
          onClick={fitWidth}
          className="px-2 py-0.5 rounded-lg hover:bg-white text-[11px] font-medium text-slate-600 hover:text-[#087F8C] transition-all cursor-pointer"
        >
          Fit Width
        </button>

        <button
          onClick={fitPage}
          className="px-2 py-0.5 rounded-lg hover:bg-white text-[11px] font-medium text-slate-600 hover:text-[#087F8C] transition-all cursor-pointer"
        >
          Fit Page
        </button>
      </div>

      {/* Right: Actions (segmented pill) */}
      <div className="flex items-center gap-1 bg-[#F8FAFC] p-1 rounded-xl border border-[#E2E8F0]">
        <Tooltip>
          <TooltipTrigger
            onClick={handleRotate}
            className="p-1 rounded-lg hover:bg-white text-slate-600 hover:text-[#123047] transition-colors cursor-pointer"
            aria-label="Rotate Page"
          >
            <RotateCw className="w-3.5 h-3.5" />
          </TooltipTrigger>
          <TooltipContent side="bottom">{`Rotate Page (Currently ${rotation}°)`}</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger
            onClick={handleDownload}
            className="p-1 rounded-lg hover:bg-white text-slate-600 hover:text-[#087F8C] transition-colors cursor-pointer"
            aria-label="Download Medical Record"
          >
            <Download className="w-3.5 h-3.5" />
          </TooltipTrigger>
          <TooltipContent side="bottom">Download Medical Record</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger
            onClick={() => {
              const el = document.getElementById('document-viewport-container');
              if (el) {
                if (document.fullscreenElement) {
                  document.exitFullscreen();
                } else {
                  el.requestFullscreen();
                }
              }
            }}
            className="p-1 rounded-lg hover:bg-white text-slate-600 hover:text-[#123047] transition-colors cursor-pointer"
            aria-label="Toggle Fullscreen Mode"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </TooltipTrigger>
          <TooltipContent side="bottom">Toggle Fullscreen Mode</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
};
