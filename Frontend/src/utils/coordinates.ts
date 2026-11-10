import { SourceCoordinates } from '../types/document.ts';

export interface RenderedBox {
  x: number;
  y: number;
  width: number;
  height: number;
  topPercent: number;
  leftPercent: number;
  widthPercent: number;
  heightPercent: number;
  label?: string;
}

/**
 * Calculates rendered pixel and percentage coordinates from original source coordinate points.
 * Points are typically a 4-vertex polygon [[x1,y1], [x2,y1], [x2,y2], [x1,y2]].
 */
export function calculateRenderedBox(
  source: SourceCoordinates,
  renderedWidth: number,
  renderedHeight: number
): RenderedBox {
  const { points, layout_width, layout_height } = source;
  if (!points || points.length === 0) {
    return {
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      topPercent: 0,
      leftPercent: 0,
      widthPercent: 0,
      heightPercent: 0,
    };
  }

  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);

  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const rawWidth = Math.max(maxX - minX, 0.0001);
  const rawHeight = Math.max(maxY - minY, 0.0001);

  // If coordinates are in Normalized space (0..1), base is 1
  const origW = source.system === 'Normalized' ? 1 : layout_width || 1000;
  const origH = source.system === 'Normalized' ? 1 : layout_height || 1000;

  const leftPercent = Math.max(0, Math.min(100, (minX / origW) * 100));
  const topPercent = Math.max(0, Math.min(100, (minY / origH) * 100));
  const widthPercent = Math.max(0, Math.min(100 - leftPercent, (rawWidth / origW) * 100));
  const heightPercent = Math.max(0, Math.min(100 - topPercent, (rawHeight / origH) * 100));

  const scaleX = renderedWidth / origW;
  const scaleY = renderedHeight / origH;

  return {
    x: Math.round(minX * scaleX),
    y: Math.round(minY * scaleY),
    width: Math.round(rawWidth * scaleX),
    height: Math.round(rawHeight * scaleY),
    topPercent,
    leftPercent,
    widthPercent,
    heightPercent,
    label: source.label,
  };
}

/**
 * Transforms an array of coordinates into RenderedBoxes for a given rendered page size.
 */
export function calculateMultipleRenderedBoxes(
  coordsList: SourceCoordinates[],
  renderedWidth: number,
  renderedHeight: number
): RenderedBox[] {
  return coordsList.map((coord) => calculateRenderedBox(coord, renderedWidth, renderedHeight));
}
