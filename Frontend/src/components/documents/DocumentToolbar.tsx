import React from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Download,
  RotateCw,
  Scaling,
  ScanLine,
} from 'lucide-react';
import { useDocumentStore } from '../../stores/useDocumentStore.ts';

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

  const handleDownload = () => {
    // Generate clean text/json file download of document data for demo
    const blob = new Blob([JSON.stringify(selectedDocument, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedDocument.fileName}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="h-12 bg-white border-b border-[#E2E8F0] px-3 sm:px-4 flex items-center justify-between text-xs text-[#334155] select-none shrink-0">
      {/* Left: Page Navigator */}
      <div className="flex items-center gap-1.5 sm:gap-2">
        <button
          onClick={handlePrevPage}
          disabled={currentPage <= 1}
          className="p-1.5 rounded-lg hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent transition-colors cursor-pointer disabled:cursor-not-allowed"
          title={currentPage <= 1 ? "No previous pages" : "Previous Page"}
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-1 font-medium">
          <span>Page</span>
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
            className="w-10 text-center py-0.5 rounded border border-[#CBD5E1] bg-[#F8FAFC] font-semibold text-[#123047] focus:outline-none focus:border-[#087F8C]"
          />
          <span className="text-[#64748B]">of {totalPages}</span>
        </div>

        <button
          onClick={handleNextPage}
          disabled={currentPage >= totalPages}
          className="p-1.5 rounded-lg hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent transition-colors cursor-pointer disabled:cursor-not-allowed"
          title={currentPage >= totalPages ? "No more pages" : "Next Page"}
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Center: Zoom Controls */}
      <div className="hidden md:flex items-center gap-1 bg-[#F8FAFC] p-1 rounded-xl border border-[#E2E8F0]">
        <button
          onClick={() => setZoomLevel(Math.max(50, zoomLevel - 15))}
          disabled={zoomLevel <= 50}
          className="p-1 rounded-lg hover:bg-white text-slate-600 hover:text-[#123047] transition-all cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
          title="Zoom Out"
        >
          <ZoomOut className="w-3.5 h-3.5" />
        </button>

        <span className="px-2 font-mono text-[11px] font-semibold text-[#123047]">
          {zoomLevel}%
        </span>

        <button
          onClick={() => setZoomLevel(Math.min(200, zoomLevel + 15))}
          disabled={zoomLevel >= 200}
          className="p-1 rounded-lg hover:bg-white text-slate-600 hover:text-[#123047] transition-all cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
          title="Zoom In"
        >
          <ZoomIn className="w-3.5 h-3.5" />
        </button>

        <div className="h-3 w-px bg-slate-300 mx-1" />

        <button
          onClick={fitWidth}
          className="px-2 py-0.5 rounded-lg hover:bg-white text-[11px] font-medium text-slate-600 hover:text-[#087F8C] transition-all cursor-pointer"
          title="Fit to Width"
        >
          Fit Width
        </button>

        <button
          onClick={fitPage}
          className="px-2 py-0.5 rounded-lg hover:bg-white text-[11px] font-medium text-slate-600 hover:text-[#087F8C] transition-all cursor-pointer"
          title="Fit to Page"
        >
          Fit Page
        </button>
      </div>

      {/* Right: Actions (Rotate, Download, Fullscreen) */}
      <div className="flex items-center gap-1 sm:gap-1.5">
        <button
          onClick={handleRotate}
          className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600 hover:text-[#123047] transition-colors cursor-pointer"
          title={`Rotate Page (Currently ${rotation}°)`}
        >
          <RotateCw className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={handleDownload}
          className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600 hover:text-[#087F8C] transition-colors cursor-pointer"
          title="Download Medical Record"
        >
          <Download className="w-3.5 h-3.5" />
        </button>

        <button
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
          className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600 hover:text-[#123047] transition-colors cursor-pointer"
          title="Toggle Fullscreen Mode"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
