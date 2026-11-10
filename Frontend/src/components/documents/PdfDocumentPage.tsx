import React, { useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import { CitationHighlightOverlay } from './CitationHighlightOverlay.tsx';

interface PdfDocumentPageProps {
  pdfDocument: PDFDocumentProxy;
  pageNumber: number;
  zoomLevel: number;
  rotation: number;
}

export const PdfDocumentPage: React.FC<PdfDocumentPageProps> = ({
  pdfDocument,
  pageNumber,
  zoomLevel,
  rotation,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [isRendering, setIsRendering] = useState(true);

  useEffect(() => {
    const element = pageRef.current;
    if (!element) return;

    const updateDimensions = () => {
      setDimensions({
        width: element.offsetWidth,
        height: element.offsetHeight,
      });
    };

    updateDimensions();
    const observer = new ResizeObserver(updateDimensions);
    observer.observe(element);
    return () => observer.disconnect();
  }, [pageNumber, zoomLevel, rotation]);

  useEffect(() => {
    let cancelled = false;
    let renderTask: RenderTask | null = null;

    const renderPage = async () => {
      setIsRendering(true);
      const page = await pdfDocument.getPage(pageNumber);
      if (cancelled) {
        page.cleanup();
        return;
      }

      const canvas = canvasRef.current;
      const context = canvas?.getContext('2d');
      if (!canvas || !context) {
        page.cleanup();
        return;
      }

      const viewport = page.getViewport({ scale: zoomLevel / 100 });
      const devicePixelRatio = window.devicePixelRatio || 1;
      const cssWidth = Math.max(1, Math.floor(viewport.width));
      const cssHeight = Math.max(1, Math.floor(viewport.height));

      canvas.width = Math.max(1, Math.floor(viewport.width * devicePixelRatio));
      canvas.height = Math.max(1, Math.floor(viewport.height * devicePixelRatio));
      canvas.style.width = `${cssWidth}px`;
      canvas.style.height = `${cssHeight}px`;

      renderTask = page.render({
        canvas,
        canvasContext: context,
        viewport,
        transform:
          devicePixelRatio !== 1
            ? [devicePixelRatio, 0, 0, devicePixelRatio, 0, 0]
            : undefined,
      });

      await renderTask.promise;
      page.cleanup();
      if (!cancelled) setIsRendering(false);
    };

    void renderPage().catch((error: unknown) => {
      if (!cancelled && (error as { name?: string })?.name !== 'RenderingCancelledException') {
        console.error('PDF page render failed:', error);
      }
    });

    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [pdfDocument, pageNumber, zoomLevel]);

  return (
    <div
      className="flex justify-center py-4 transition-transform duration-150 origin-top"
      style={{ transform: `rotate(${rotation}deg)` }}
    >
      <div
        ref={pageRef}
        id={`pdf-page-${pageNumber}`}
        className="relative bg-white shadow-xl border border-[#CBD5E1] rounded-lg overflow-hidden"
      >
        <canvas ref={canvasRef} className="block" />
        <CitationHighlightOverlay
          pageNumber={pageNumber}
          containerWidth={dimensions.width}
          containerHeight={dimensions.height}
        />
        {isRendering && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/70">
            <span className="text-xs font-semibold text-[#64748B]">Rendering page...</span>
          </div>
        )}
      </div>
    </div>
  );
};
