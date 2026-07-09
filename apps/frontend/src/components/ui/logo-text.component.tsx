import React from 'react';

// Sanad Marketing Hub wordmark — constellation-S icon + brand text (white-label of Postiz)
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
        <circle cx="56" cy="10" r="3.5" fill="currentColor" opacity="0.85" />
        <circle cx="65" cy="24" r="2.5" fill="currentColor" opacity="0.6" />
        <circle cx="50" cy="3" r="2" fill="currentColor" opacity="0.5" />
        <circle cx="64" cy="14" r="1.5" fill="currentColor" opacity="0.4" />
        <line x1="56" y1="10" x2="65" y2="24" stroke="currentColor" strokeWidth="1" opacity="0.25" />
        <line x1="56" y1="10" x2="50" y2="3" stroke="currentColor" strokeWidth="1" opacity="0.25" />
        <path d="M58 6 L59 9 L62 10 L59 11 L58 14 L57 11 L54 10 L57 9Z" fill="currentColor" opacity="0.55" />
      </svg>
      <span className="text-[18px] font-[700] leading-none tracking-tight whitespace-nowrap">
        Sanad Marketing Hub
      </span>
    </div>
  );
};
