import React from 'react';

// Sanad Marketing Hub wordmark — constellation-S badge + brand text (white-label of Postiz).
// Badge is self-contained (purple bg, white S) so it shows on light AND dark; the text
// uses currentColor so it adapts to the surrounding theme.
export const LogoTextComponent = () => {
  return (
    <div className="flex items-center gap-[10px] text-current">
      <svg
        width="33"
        height="33"
        viewBox="0 0 72 72"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="shrink-0"
      >
        <rect x="6" y="8" width="56" height="56" rx="15" fill="#612BD3" />
        <text
          x="30"
          y="52"
          textAnchor="middle"
          fontFamily="system-ui,-apple-system,sans-serif"
          fontWeight="900"
          fontSize="42"
          fill="#ffffff"
        >
          S
        </text>
        <circle cx="48" cy="20" r="3" fill="#ffffff" opacity="0.95" />
        <circle cx="54" cy="30" r="2" fill="#ffffff" opacity="0.7" />
        <circle cx="43" cy="15" r="1.6" fill="#ffffff" opacity="0.6" />
        <line x1="48" y1="20" x2="54" y2="30" stroke="#ffffff" strokeWidth="1" opacity="0.4" />
        <line x1="48" y1="20" x2="43" y2="15" stroke="#ffffff" strokeWidth="1" opacity="0.4" />
        <path d="M50 16 L51 19 L54 20 L51 21 L50 24 L49 21 L46 20 L49 19Z" fill="#ffffff" opacity="0.85" />
      </svg>
      <span className="text-[18px] font-[700] leading-none tracking-tight whitespace-nowrap">
        Sanad Marketing Hub
      </span>
    </div>
  );
};
