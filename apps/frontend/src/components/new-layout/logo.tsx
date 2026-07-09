'use client';

// Sanad Marketing Hub — constellation-S badge (white-label of Postiz).
// Self-contained purple badge so it stays visible on light AND dark backgrounds.
export const Logo = () => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="60"
      height="60"
      viewBox="0 0 72 72"
      fill="none"
      className="mt-[8px] min-w-[60px] min-h-[60px]"
    >
      {/* Brand badge */}
      <rect x="6" y="8" width="56" height="56" rx="15" fill="#612BD3" />
      {/* Bold S */}
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
      {/* Constellation dots + sparkle (white on badge) */}
      <circle cx="48" cy="20" r="3" fill="#ffffff" opacity="0.95" />
      <circle cx="54" cy="30" r="2" fill="#ffffff" opacity="0.7" />
      <circle cx="43" cy="15" r="1.6" fill="#ffffff" opacity="0.6" />
      <line x1="48" y1="20" x2="54" y2="30" stroke="#ffffff" strokeWidth="1" opacity="0.4" />
      <line x1="48" y1="20" x2="43" y2="15" stroke="#ffffff" strokeWidth="1" opacity="0.4" />
      <path d="M50 16 L51 19 L54 20 L51 21 L50 24 L49 21 L46 20 L49 19Z" fill="#ffffff" opacity="0.85" />
    </svg>
  );
};
