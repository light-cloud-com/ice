import React from 'react';

interface LogoProps {
  className?: string;
  height?: number;
}

/**
 * ICE Logo — isometric "LC" cube mark as inline SVG.
 * Uses currentColor so it adapts to light/dark themes automatically.
 */
export const Logo: React.FC<LogoProps> = ({ className, height = 18 }) => (
  <svg
    viewBox="0 0 160.5 181.5"
    height={height}
    className={className}
    fill="currentColor"
    aria-label="ICE"
    role="img"
  >
    <defs>
      <clipPath id="lc5"><path d="M108,121H209V222H108Z" /></clipPath>
      <clipPath id="lc6"><path d="m108.27,142.92 21.4-21.4 78.59,78.59-21.4,21.4z" /></clipPath>
      <clipPath id="lc7"><path d="M108,64H209V165H108Z" /></clipPath>
      <clipPath id="lc8"><path d="m186.86,64.4 21.4,21.4-78.59,78.59-21.4-21.4z" /></clipPath>
      <clipPath id="lc9"><path d="M165,121H266V222H165Z" /></clipPath>
      <clipPath id="lc10"><path d="m244.05,121.53 21.4,21.4-78.59,78.59-21.4-21.4z" /></clipPath>
      <clipPath id="lc11"><path d="M214,113h38v37h-38z" /></clipPath>
      <clipPath id="lc12"><path d="m236.34,113.83 14.68,14.68-21.48,21.48-14.68-14.68z" /></clipPath>
      <clipPath id="lc13"><path d="M179,78h37v37h-37z" /></clipPath>
      <clipPath id="lc14"><path d="m200.77,78.33 14.68,14.68-21.38,21.38-14.68-14.68z" /></clipPath>
    </defs>
    <g clipPath="url(#lc5)" transform="matrix(1,0,0,0.8008,-106.45,-49.85)">
      <g clipPath="url(#lc6)"><path d="m108.27,142.92 21.4-21.4 78.57,78.57-21.4,21.4z" /></g>
    </g>
    <g clipPath="url(#lc7)" transform="matrix(1,0,0,0.8008,-106.45,-49.85)">
      <g clipPath="url(#lc8)"><path d="m186.86,64.4 21.4,21.4-78.57,78.57-21.4-21.4z" /></g>
    </g>
    <g clipPath="url(#lc9)" transform="matrix(1,0,0,0.8008,-106.45,-49.85)">
      <g clipPath="url(#lc10)"><path d="m244.05,121.53 21.4,21.4-78.57,78.57-21.4-21.4z" /></g>
    </g>
    <g clipPath="url(#lc11)" transform="matrix(1,0,0,0.8008,-106.45,-49.85)">
      <g clipPath="url(#lc12)"><path d="m233.75,109.09 17.27,19.42-21.45,21.45-14.68-14.68z" /></g>
    </g>
    <g clipPath="url(#lc13)" transform="matrix(1,0,0,0.8008,-106.45,-49.85)">
      <g clipPath="url(#lc14)"><path d="m200.77,78.33 14.68,14.68-21.4,21.4-14.68-14.68z" /></g>
    </g>
    <rect width="136.27" height="34.07" x="56.64" y="58.62" transform="matrix(0.7823,0.6229,-0.7821,0.6231,0,0)" />
    <rect width="138.31" height="34.07" x="-45.56" y="161.46" transform="matrix(-0.7823,0.6229,0.7821,0.6231,0,0)" />
  </svg>
);

Logo.displayName = 'Logo';
