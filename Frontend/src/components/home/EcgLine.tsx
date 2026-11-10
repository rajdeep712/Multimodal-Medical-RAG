import React from 'react';

/**
 * Animated electrocardiogram strip — the instant "medical" visual cue.
 * A faint baseline with a bright pulse drawn on loop (pure SVG + CSS).
 */

const ECG_PATH =
  'M0 30 L40 30 L52 30 L58 12 L64 46 L70 8 L76 44 L82 26 L88 30 L130 30 ' +
  'L142 30 L148 12 L154 46 L160 8 L166 44 L172 26 L178 30 L220 30 ' +
  'L232 30 L238 12 L244 46 L250 8 L256 44 L262 26 L268 30 L310 30 ' +
  'L322 30 L328 12 L334 46 L340 8 L346 44 L352 26 L358 30 L400 30';

export const EcgLine: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`relative overflow-hidden ${className}`} aria-hidden>
    <svg viewBox="0 0 400 60" preserveAspectRatio="none" className="w-full h-full">
      {/* faint baseline */}
      <path d={ECG_PATH} fill="none" stroke="#2FD8E6" strokeOpacity={0.18} strokeWidth={1.5} />
      {/* bright pulse drawn on loop */}
      <path
        d={ECG_PATH}
        fill="none"
        stroke="#2FD8E6"
        strokeWidth={2}
        strokeLinecap="round"
        className="ecg-pulse"
      />
    </svg>
  </div>
);
