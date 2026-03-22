/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: ['./src/**/*.{ts,tsx}', './index.html'],
  theme: {
    extend: {
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
        'ice-2xs': ['9px', { lineHeight: '1.4' }],
        'ice-xs':  ['10px', { lineHeight: '1.4' }],
        'ice-sm':  ['11px', { lineHeight: '1.45' }],
        'ice-base': ['12px', { lineHeight: '1.5' }],
        'ice-md':  ['13px', { lineHeight: '1.5' }],
        'ice-lg':  ['14px', { lineHeight: '1.5' }],
        'ice-xl':  ['16px', { lineHeight: '1.4' }],
        'ice-2xl': ['22px', { lineHeight: '1.3' }],
        'ice-3xl': ['28px', { lineHeight: '1.2' }],
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
