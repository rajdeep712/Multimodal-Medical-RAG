import React, { useMemo } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';

interface MathSpanProps {
  tex: string;
  displayMode?: boolean;
}

/** Renders a LaTeX formula with KaTeX; falls back to literal text on failure. */
export const MathSpan: React.FC<MathSpanProps> = ({ tex, displayMode = false }) => {
  const html = useMemo(() => {
    try {
      return katex.renderToString(tex, {
        throwOnError: false,
        strict: false,
        displayMode,
      });
    } catch {
      return null;
    }
  }, [tex, displayMode]);

  if (html === null) {
    return (
      <code className="font-mono text-[11px] bg-slate-100 text-slate-800 px-1.5 py-0.5 rounded border border-slate-200">
        {tex}
      </code>
    );
  }

  // Keep formulas slightly closer to the surrounding chat text size.
  const className = '[&_.katex]:text-[1.05em]';

  if (displayMode) {
    return (
      <div
        className={`overflow-x-auto py-0.5 ${className}`}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }
  return (
    <span className={`inline-block ${className}`} dangerouslySetInnerHTML={{ __html: html }} />
  );
};
