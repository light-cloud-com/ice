/** @type {import('tailwindcss').Config} */

/* Spacing that responds to A-/A+ via --ice-space-scale (see globals.css).
 * Only applied to padding, margin, gap, and space — NOT width/height. */
const _sp = (px) => `calc(${px}px * var(--ice-space-scale, 1))`;
const scaledSpacing = {
  '0.5': _sp(2), '1': _sp(4), '1.5': _sp(6), '2': _sp(8), '2.5': _sp(10),
  '3': _sp(12), '3.5': _sp(14), '4': _sp(16), '5': _sp(20), '6': _sp(24),
  '7': _sp(28), '8': _sp(32), '9': _sp(36), '10': _sp(40), '12': _sp(48),
};

export default {
  darkMode: ['class'],
  content: ['./src/renderer/**/*.{ts,tsx}', '../../packages/ui/src/**/*.{ts,tsx}', './src/renderer/index.html'],
  theme: {
    extend: {
      padding: scaledSpacing,
      margin: scaledSpacing,
      gap: scaledSpacing,
      space: scaledSpacing,
      colors: {
        /* ICE design tokens — use these instead of hardcoded hex */
        ice: {
          base: 'var(--ice-bg-base)',
          surface: 'var(--ice-bg-surface)',
          raised: 'var(--ice-bg-raised)',
          overlay: 'var(--ice-bg-overlay)',
          hover: 'var(--ice-bg-hover)',
          active: 'var(--ice-bg-active)',
          toolbar: 'var(--ice-bg-toolbar)',
          border: 'var(--ice-border)',
          'border-strong': 'var(--ice-border-strong)',
          'text-1': 'var(--ice-text-primary)',
          'text-2': 'var(--ice-text-secondary)',
          'text-3': 'var(--ice-text-tertiary)',
          accent: 'var(--ice-accent)',
          'accent-hover': 'var(--ice-accent-hover)',
          'accent-muted': 'var(--ice-accent-muted)',
          green: 'var(--ice-green)',
          'green-muted': 'var(--ice-green-muted)',
          red: 'var(--ice-red)',
          'red-muted': 'var(--ice-red-muted)',
          yellow: 'var(--ice-yellow)',
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        network: {
          DEFAULT: '#3b82f6',
          light: '#93c5fd',
          dark: '#1d4ed8',
        },
        compute: {
          DEFAULT: '#f97316',
          light: '#fdba74',
          dark: '#c2410c',
        },
        data: {
          DEFAULT: '#8b5cf6',
          light: '#c4b5fd',
          dark: '#6d28d9',
        },
        storage: {
          DEFAULT: '#22c55e',
          light: '#86efac',
          dark: '#15803d',
        },
        iam: {
          DEFAULT: '#ef4444',
          light: '#fca5a5',
          dark: '#b91c1c',
        },
        monitoring: {
          DEFAULT: '#eab308',
          light: '#fde047',
          dark: '#a16207',
        },
      },
      fontSize: {
        /* ICE scale — driven by CSS custom properties (see globals.css)
         * so every size responds to the A-/A+ accessibility buttons. */
        'ice-2xs': ['var(--ice-fs-2xs)', { lineHeight: '1.5' }],
        'ice-xs':  ['var(--ice-fs-xs)',  { lineHeight: '1.5' }],
        'ice-sm':  ['var(--ice-fs-sm)',  { lineHeight: '1.5' }],
        'ice-base':['var(--ice-fs-sm)',  { lineHeight: '1.5' }],
        'ice-md':  ['var(--ice-fs-md)',  { lineHeight: '1.5' }],
        'ice-lg':  ['var(--ice-fs-lg)',  { lineHeight: '1.5' }],
        'ice-xl':  ['var(--ice-fs-xl)',  { lineHeight: '1.4' }],
        'ice-2xl': ['var(--ice-fs-3xl)', { lineHeight: '1.3' }],
        'ice-3xl': ['var(--ice-fs-4xl)', { lineHeight: '1.2' }],
        /* Override Tailwind built-in sizes so they also scale with A-/A+. */
        'xs':   ['var(--ice-fs-sm)',  { lineHeight: '1.5' }],
        'sm':   ['var(--ice-fs-lg)',  { lineHeight: '1.5' }],
        'base': ['var(--ice-fs-xl)',  { lineHeight: '1.5' }],
        'lg':   ['var(--ice-fs-2xl)', { lineHeight: '1.5' }],
        'xl':   ['var(--ice-fs-3xl)', { lineHeight: '1.4' }],
        '2xl':  ['var(--ice-fs-4xl)', { lineHeight: '1.3' }],
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
        'pulse-border': {
          '0%, 100%': { borderColor: 'transparent' },
          '50%': { borderColor: 'hsl(var(--primary))' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'pulse-border': 'pulse-border 2s ease-in-out infinite',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};
