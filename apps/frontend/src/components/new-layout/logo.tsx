'use client';

// Sanad Marketing Hub — constellation-S mark (white-label of Postiz)
export const Logo = () => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="60"
      height="60"
      viewBox="0 0 72 72"
      fill="none"
      className="mt-[8px] min-w-[60px] min-h-[60px] text-white"
    >
      {/* Bold S */}
      <text
        x="34"
        y="50"
        textAnchor="middle"
        fontFamily="system-ui,-apple-system,sans-serif"
        fontWeight="900"
        fontSize="48"
        fill="currentColor"
      >
        S
      </text>
      {/* Constellation dots */}
      <circle cx="56" cy="10" r="3.5" fill="currentColor" opacity="0.85" />
      <circle cx="65" cy="24" r="2.5" fill="currentColor" opacity="0.6" />
      <circle cx="50" cy="3" r="2" fill="currentColor" opacity="0.5" />
      <circle cx="64" cy="14" r="1.5" fill="currentColor" opacity="0.4" />
      {/* Connection lines */}
      <line x1="56" y1="10" x2="65" y2="24" stroke="currentColor" strokeWidth="1" opacity="0.25" />
      <line x1="56" y1="10" x2="50" y2="3" stroke="currentColor" strokeWidth="1" opacity="0.25" />
      <line x1="65" y1="24" x2="64" y2="14" stroke="currentColor" strokeWidth="0.8" opacity="0.2" />
      {/* Sparkle */}
      <path
        d="M58 6 L59 9 L62 10 L59 11 L58 14 L57 11 L54 10 L57 9Z"
        fill="currentColor"
        opacity="0.55"
      />
    </svg>
  );
};
