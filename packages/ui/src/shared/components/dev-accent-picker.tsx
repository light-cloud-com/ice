/**
 * Theme Picker — live theme switching panel.
 *
 * Each theme defines a complete light + dark palette.
 * Overrides CSS custom properties on :root so the entire app updates instantly.
 * Toggle with Ctrl+Shift+A or the Palette button in the app bar.
 */

import { X, Sun, Moon, Palette } from 'lucide-react';
import React, { useState, useEffect, useCallback, createContext, useContext } from 'react';

// Shared toggle context so app bar can open the picker
const ThemePickerContext = createContext<{ toggle: () => void }>({ toggle: () => {} });
export const useThemePicker = () => useContext(ThemePickerContext);

interface ThemePalette {
  base: string;
  surface: string;
  raised: string;
  overlay: string;
  hover: string;
  active: string;
  toolbar: string;
  border: string;
  borderStrong: string;
  text1: string;
  text2: string;
  text3: string;
  accent: string;
  accentHover: string;
  accentMuted: string;
  green: string;
  red: string;
  yellow: string;
}

interface ColorTheme {
  id: string;
  name: string;
  description: string;
  light: ThemePalette;
  dark: ThemePalette;
  preview: [string, string, string]; // [accent, dark-surface, light-surface]
}

// ═══════════════════════════════════════════════════════════════════════════════
// THEMES — built from real, proven palettes (daisyUI, Catppuccin, Nord, etc.)
// Each theme has BOLD, visually distinct surface colors — not tints of gray.
// ═══════════════════════════════════════════════════════════════════════════════

const T: ColorTheme[] = [
  {
    id: 'default',
    name: 'Default',
    description: 'Clean white and navy',
    preview: ['#3b82f6', '#0c1118', '#ffffff'],
    light: {
      base: '#ffffff',
      surface: '#f0f1f4',
      raised: '#ffffff',
      overlay: '#ffffff',
      hover: 'rgba(0,0,0,0.04)',
      active: 'rgba(0,0,0,0.08)',
      toolbar: '#e4e6eb',
      border: '#d5d8de',
      borderStrong: '#b8bcc5',
      text1: '#11181c',
      text2: '#3d4551',
      text3: '#636c76',
      accent: '#2563eb',
      accentHover: '#1d4ed8',
      accentMuted: 'rgba(37,99,235,0.12)',
      green: '#16a34a',
      red: '#dc2626',
      yellow: '#b45309',
    },
    dark: {
      base: '#0c1118',
      surface: '#151d2a',
      raised: '#1e2838',
      overlay: '#222e40',
      hover: 'rgba(255,255,255,0.06)',
      active: 'rgba(255,255,255,0.09)',
      toolbar: '#111923',
      border: '#1f2c3e',
      borderStrong: '#2e3f55',
      text1: '#e1e7ef',
      text2: '#8b9ab5',
      text3: '#576579',
      accent: '#4c9aff',
      accentHover: '#6bb0ff',
      accentMuted: 'rgba(76,154,255,0.15)',
      green: '#34d399',
      red: '#f87171',
      yellow: '#fbbf24',
    },
  },
  // ── daisyUI Retro: tan parchment base, pink + sage ──
  {
    id: 'retro',
    name: 'Retro',
    description: 'Tan parchment, pink and sage',
    preview: ['#ef9995', '#2E282A', '#ece3ca'],
    light: {
      base: '#ece3ca',
      surface: '#e4d8b4',
      raised: '#EDE6D4',
      overlay: '#f5efe0',
      hover: 'rgba(40,36,37,0.07)',
      active: 'rgba(40,36,37,0.14)',
      toolbar: '#DBCA9A',
      border: '#c8b888',
      borderStrong: '#a89868',
      text1: '#282425',
      text2: '#4a4540',
      text3: '#706860',
      accent: '#ef9995',
      accentHover: '#e07a76',
      accentMuted: 'rgba(239,153,149,0.22)',
      green: '#a4cbb4',
      red: '#ef9995',
      yellow: '#DC8850',
    },
    dark: {
      base: '#1C1918',
      surface: '#2E282A',
      raised: '#443C3E',
      overlay: '#584E50',
      hover: 'rgba(237,230,212,0.08)',
      active: 'rgba(237,230,212,0.15)',
      toolbar: '#252122',
      border: '#584E50',
      borderStrong: '#706260',
      text1: '#EDE6D4',
      text2: '#c8b888',
      text3: '#907860',
      accent: '#ef9995',
      accentHover: '#f5b5b2',
      accentMuted: 'rgba(239,153,149,0.22)',
      green: '#a4cbb4',
      red: '#ef9995',
      yellow: '#DC8850',
    },
  },
  // ── daisyUI Cupcake: warm blush base, teal + pink ──
  {
    id: 'cupcake',
    name: 'Cupcake',
    description: 'Soft blush, teal and rose',
    preview: ['#65c3c8', '#291334', '#faf7f5'],
    light: {
      base: '#faf7f5',
      surface: '#efeae6',
      raised: '#f5f0ec',
      overlay: '#faf7f5',
      hover: 'rgba(41,19,52,0.05)',
      active: 'rgba(41,19,52,0.10)',
      toolbar: '#e7e2df',
      border: '#d8d0ca',
      borderStrong: '#b8aea5',
      text1: '#291334',
      text2: '#4a3858',
      text3: '#706078',
      accent: '#65c3c8',
      accentHover: '#4aacb2',
      accentMuted: 'rgba(101,195,200,0.20)',
      green: '#65c3c8',
      red: '#ef9fbc',
      yellow: '#eeaf3a',
    },
    dark: {
      base: '#1a1020',
      surface: '#291334',
      raised: '#3E2050',
      overlay: '#503068',
      hover: 'rgba(250,247,245,0.07)',
      active: 'rgba(250,247,245,0.14)',
      toolbar: '#201028',
      border: '#503068',
      borderStrong: '#684880',
      text1: '#faf7f5',
      text2: '#d0c0d8',
      text3: '#a090b0',
      accent: '#65c3c8',
      accentHover: '#80d5d8',
      accentMuted: 'rgba(101,195,200,0.22)',
      green: '#65c3c8',
      red: '#ef9fbc',
      yellow: '#eeaf3a',
    },
  },
  // ── daisyUI Valentine: hot pink base ──
  {
    id: 'valentine',
    name: 'Valentine',
    description: 'Pink base, purple and rose',
    preview: ['#e96d7b', '#af4670', '#fae7f4'],
    light: {
      base: '#fae7f4',
      surface: '#f0c8e0',
      raised: '#fce8f0',
      overlay: '#fdf0f8',
      hover: 'rgba(99,44,59,0.07)',
      active: 'rgba(99,44,59,0.14)',
      toolbar: '#e0a0c0',
      border: '#d0a0b8',
      borderStrong: '#b07898',
      text1: '#632c3b',
      text2: '#804058',
      text3: '#a06078',
      accent: '#e96d7b',
      accentHover: '#d05060',
      accentMuted: 'rgba(233,109,123,0.22)',
      green: '#66b1b3',
      red: '#e96d7b',
      yellow: '#d97706',
    },
    dark: {
      base: '#2a1020',
      surface: '#af4670',
      raised: '#c05880',
      overlay: '#d06890',
      hover: 'rgba(250,231,244,0.08)',
      active: 'rgba(250,231,244,0.15)',
      toolbar: '#882050',
      border: '#c05880',
      borderStrong: '#d880a0',
      text1: '#fae7f4',
      text2: '#f0c8e0',
      text3: '#d0a0c0',
      accent: '#a991f7',
      accentHover: '#bfacf8',
      accentMuted: 'rgba(169,145,247,0.25)',
      green: '#66b1b3',
      red: '#e96d7b',
      yellow: '#d97706',
    },
  },
  // ── daisyUI Synthwave: deep purple, neon pink + cyan ──
  {
    id: 'synthwave',
    name: 'Synthwave',
    description: 'Deep purple, neon pink and cyan',
    preview: ['#e779c1', '#1a103d', '#f9f7fd'],
    light: {
      base: '#f9f7fd',
      surface: '#e8e0f8',
      raised: '#f0eafa',
      overlay: '#f9f7fd',
      hover: 'rgba(26,16,61,0.06)',
      active: 'rgba(26,16,61,0.12)',
      toolbar: '#d0c0f0',
      border: '#c0b0e0',
      borderStrong: '#9888c8',
      text1: '#1a103d',
      text2: '#382870',
      text3: '#604898',
      accent: '#e779c1',
      accentHover: '#d060a8',
      accentMuted: 'rgba(231,121,193,0.20)',
      green: '#71ead2',
      red: '#ec8c78',
      yellow: '#eace6c',
    },
    dark: {
      base: '#1a103d',
      surface: '#221551',
      raised: '#2d1a68',
      overlay: '#382080',
      hover: 'rgba(249,247,253,0.06)',
      active: 'rgba(249,247,253,0.12)',
      toolbar: '#1e1248',
      border: '#382080',
      borderStrong: '#503098',
      text1: '#f9f7fd',
      text2: '#d0c0f0',
      text3: '#9080c0',
      accent: '#e779c1',
      accentHover: '#f090d0',
      accentMuted: 'rgba(231,121,193,0.25)',
      green: '#71ead2',
      red: '#ec8c78',
      yellow: '#eace6c',
    },
  },
  // ── daisyUI Coffee: dark wine-brown, golden amber ──
  {
    id: 'coffee',
    name: 'Coffee',
    description: 'Espresso brown, golden amber',
    preview: ['#DB924B', '#20161F', '#f5e8d8'],
    light: {
      base: '#f5e8d8',
      surface: '#e0ccb0',
      raised: '#f0dcc8',
      overlay: '#f8eed8',
      hover: 'rgba(32,22,31,0.06)',
      active: 'rgba(32,22,31,0.12)',
      toolbar: '#c8a878',
      border: '#b89868',
      borderStrong: '#987848',
      text1: '#20161F',
      text2: '#483830',
      text3: '#706050',
      accent: '#DB924B',
      accentHover: '#c07830',
      accentMuted: 'rgba(219,146,75,0.22)',
      green: '#9DB787',
      red: '#FC9581',
      yellow: '#FFD25F',
    },
    dark: {
      base: '#120C12',
      surface: '#20161F',
      raised: '#342830',
      overlay: '#483840',
      hover: 'rgba(197,159,96,0.08)',
      active: 'rgba(197,159,96,0.15)',
      toolbar: '#1a1018',
      border: '#483840',
      borderStrong: '#605048',
      text1: '#c59f60',
      text2: '#a08050',
      text3: '#786040',
      accent: '#DB924B',
      accentHover: '#f0a860',
      accentMuted: 'rgba(219,146,75,0.25)',
      green: '#9DB787',
      red: '#FC9581',
      yellow: '#FFD25F',
    },
  },
  // ── daisyUI Luxury: true black + gold ──
  {
    id: 'luxury',
    name: 'Luxury',
    description: 'True black, gold accents',
    preview: ['#dca54c', '#09090b', '#f8f0e0'],
    light: {
      base: '#f8f0e0',
      surface: '#e8d8c0',
      raised: '#f0e4d0',
      overlay: '#f8f0e0',
      hover: 'rgba(9,9,11,0.05)',
      active: 'rgba(9,9,11,0.10)',
      toolbar: '#d0b890',
      border: '#c0a878',
      borderStrong: '#a08858',
      text1: '#1a1810',
      text2: '#484030',
      text3: '#706050',
      accent: '#dca54c',
      accentHover: '#c09040',
      accentMuted: 'rgba(220,165,76,0.22)',
      green: '#87d039',
      red: '#ff6f6f',
      yellow: '#e2d562',
    },
    dark: {
      base: '#09090b',
      surface: '#171618',
      raised: '#2e2d2f',
      overlay: '#403e40',
      hover: 'rgba(220,165,76,0.08)',
      active: 'rgba(220,165,76,0.15)',
      toolbar: '#101010',
      border: '#2e2d2f',
      borderStrong: '#484648',
      text1: '#dca54c',
      text2: '#b08838',
      text3: '#806828',
      accent: '#dca54c',
      accentHover: '#f0c070',
      accentMuted: 'rgba(220,165,76,0.22)',
      green: '#87d039',
      red: '#ff6f6f',
      yellow: '#e2d562',
    },
  },
  // ── daisyUI Aqua: bold blue base ──
  {
    id: 'aqua',
    name: 'Aqua',
    description: 'Bold blue base, cyan accents',
    preview: ['#09ecf3', '#345da7', '#e0f0ff'],
    light: {
      base: '#e0f0ff',
      surface: '#b0d0f0',
      raised: '#d0e8ff',
      overlay: '#e8f4ff',
      hover: 'rgba(52,93,167,0.06)',
      active: 'rgba(52,93,167,0.12)',
      toolbar: '#80a8d8',
      border: '#80a0d0',
      borderStrong: '#5880b0',
      text1: '#1a2840',
      text2: '#2a4068',
      text3: '#506088',
      accent: '#09ecf3',
      accentHover: '#00d0d8',
      accentMuted: 'rgba(9,236,243,0.20)',
      green: '#16a34a',
      red: '#dc2626',
      yellow: '#d97706',
    },
    dark: {
      base: '#1a3060',
      surface: '#345da7',
      raised: '#4070c0',
      overlay: '#5080d0',
      hover: 'rgba(255,255,255,0.08)',
      active: 'rgba(255,255,255,0.14)',
      toolbar: '#284888',
      border: '#4070c0',
      borderStrong: '#6090d8',
      text1: '#e8f4ff',
      text2: '#b0d0f0',
      text3: '#80a8d0',
      accent: '#09ecf3',
      accentHover: '#40f0f8',
      accentMuted: 'rgba(9,236,243,0.25)',
      green: '#34d399',
      red: '#f87171',
      yellow: '#fbbf24',
    },
  },
  // ── daisyUI Forest: dark wood, vivid green ──
  {
    id: 'forest',
    name: 'Forest',
    description: 'Dark wood, vivid green',
    preview: ['#1eb854', '#171212', '#f0ebe8'],
    light: {
      base: '#f0ebe8',
      surface: '#d8ccc4',
      raised: '#e8e0d8',
      overlay: '#f0ebe8',
      hover: 'rgba(23,18,18,0.06)',
      active: 'rgba(23,18,18,0.12)',
      toolbar: '#c0b0a0',
      border: '#b0a090',
      borderStrong: '#908070',
      text1: '#171212',
      text2: '#3a3030',
      text3: '#605050',
      accent: '#1eb854',
      accentHover: '#18a048',
      accentMuted: 'rgba(30,184,84,0.20)',
      green: '#1eb854',
      red: '#dc2626',
      yellow: '#d97706',
    },
    dark: {
      base: '#0e0a0a',
      surface: '#171212',
      raised: '#2a2020',
      overlay: '#3a2e2e',
      hover: 'rgba(240,235,232,0.07)',
      active: 'rgba(240,235,232,0.14)',
      toolbar: '#120e0e',
      border: '#3a2e2e',
      borderStrong: '#504040',
      text1: '#f0ebe8',
      text2: '#c0b0a0',
      text3: '#908070',
      accent: '#1eb854',
      accentHover: '#28d060',
      accentMuted: 'rgba(30,184,84,0.25)',
      green: '#1eb854',
      red: '#f87171',
      yellow: '#fbbf24',
    },
  },
  // ── User's screenshot palette: sage + terracotta ──
  {
    id: 'sage',
    name: 'Sage & Terracotta',
    description: 'Green sage, warm cream, terracotta',
    preview: ['#E38150', '#276359', '#F2DDCC'],
    light: {
      base: '#F2DDCC',
      surface: '#B9CDCB',
      raised: '#F7E8DC',
      overlay: '#FFF5ED',
      hover: 'rgba(39,99,89,0.08)',
      active: 'rgba(39,99,89,0.15)',
      toolbar: '#8EBBA7',
      border: '#9DB8A8',
      borderStrong: '#7CA090',
      text1: '#1a3330',
      text2: '#3d5c4a',
      text3: '#6a8878',
      accent: '#E38150',
      accentHover: '#c96a3c',
      accentMuted: 'rgba(227,129,80,0.20)',
      green: '#5a9e3e',
      red: '#c44030',
      yellow: '#b87d20',
    },
    dark: {
      base: '#1a2e2a',
      surface: '#276359',
      raised: '#356e60',
      overlay: '#3d7a6a',
      hover: 'rgba(185,205,203,0.08)',
      active: 'rgba(185,205,203,0.15)',
      toolbar: '#213d38',
      border: '#3d7a6a',
      borderStrong: '#5a9a88',
      text1: '#F2DDCC',
      text2: '#B9CDCB',
      text3: '#8EBBA7',
      accent: '#FCAC89',
      accentHover: '#E38150',
      accentMuted: 'rgba(252,172,137,0.22)',
      green: '#8EBBA7',
      red: '#e67060',
      yellow: '#FCAC89',
    },
  },
  // ── daisyUI Dracula: official Dracula colors ──
  {
    id: 'dracula',
    name: 'Dracula',
    description: 'Purple-charcoal, pastel neon',
    preview: ['#bd93f9', '#282a36', '#f8f8f2'],
    light: {
      base: '#f8f8f2',
      surface: '#e8e8e0',
      raised: '#f2f2ea',
      overlay: '#f8f8f2',
      hover: 'rgba(40,42,54,0.07)',
      active: 'rgba(40,42,54,0.13)',
      toolbar: '#ddddd4',
      border: '#c8c8be',
      borderStrong: '#a8a8a0',
      text1: '#282a36',
      text2: '#44475a',
      text3: '#6272a4',
      accent: '#bd93f9',
      accentHover: '#a070e0',
      accentMuted: 'rgba(189,147,249,0.18)',
      green: '#50fa7b',
      red: '#ff5555',
      yellow: '#f1fa8c',
    },
    dark: {
      base: '#282a36',
      surface: '#343746',
      raised: '#44475a',
      overlay: '#4d5068',
      hover: 'rgba(248,248,242,0.08)',
      active: 'rgba(248,248,242,0.14)',
      toolbar: '#2e3042',
      border: '#44475a',
      borderStrong: '#6272a4',
      text1: '#f8f8f2',
      text2: '#bfbfda',
      text3: '#6272a4',
      accent: '#bd93f9',
      accentHover: '#d4b4fc',
      accentMuted: 'rgba(189,147,249,0.20)',
      green: '#50fa7b',
      red: '#ff5555',
      yellow: '#f1fa8c',
    },
  },
  // ── daisyUI Night: slate-navy, sky-blue accent ──
  {
    id: 'night',
    name: 'Night',
    description: 'Slate navy, sky-blue and pink',
    preview: ['#38bdf8', '#0F172A', '#e8f0ff'],
    light: {
      base: '#e8f0ff',
      surface: '#c8d8f0',
      raised: '#dce8fa',
      overlay: '#f0f6ff',
      hover: 'rgba(15,23,42,0.05)',
      active: 'rgba(15,23,42,0.10)',
      toolbar: '#a0b8e0',
      border: '#90a8d0',
      borderStrong: '#6888b8',
      text1: '#0F172A',
      text2: '#1E293B',
      text3: '#475870',
      accent: '#38bdf8',
      accentHover: '#0ea5e9',
      accentMuted: 'rgba(56,189,248,0.18)',
      green: '#2DD4BF',
      red: '#FB7085',
      yellow: '#F4BF50',
    },
    dark: {
      base: '#0F172A',
      surface: '#1E293B',
      raised: '#2d3a50',
      overlay: '#3a4868',
      hover: 'rgba(255,255,255,0.06)',
      active: 'rgba(255,255,255,0.12)',
      toolbar: '#141e30',
      border: '#2d3a50',
      borderStrong: '#3a4868',
      text1: '#e8f0ff',
      text2: '#94a3b8',
      text3: '#475870',
      accent: '#38bdf8',
      accentHover: '#60d0ff',
      accentMuted: 'rgba(56,189,248,0.20)',
      green: '#2DD4BF',
      red: '#FB7085',
      yellow: '#F4BF50',
    },
  },
];

// Apply / clear overrides on :root

function applyPalette(p: ThemePalette) {
  const s = document.documentElement.style;
  s.setProperty('--ice-bg-base', p.base);
  s.setProperty('--ice-bg-surface', p.surface);
  s.setProperty('--ice-bg-raised', p.raised);
  s.setProperty('--ice-bg-overlay', p.overlay);
  s.setProperty('--ice-bg-hover', p.hover);
  s.setProperty('--ice-bg-active', p.active);
  s.setProperty('--ice-bg-toolbar', p.toolbar);
  s.setProperty('--ice-border', p.border);
  s.setProperty('--ice-border-strong', p.borderStrong);
  s.setProperty('--ice-text-primary', p.text1);
  s.setProperty('--ice-text-secondary', p.text2);
  s.setProperty('--ice-text-tertiary', p.text3);
  s.setProperty('--ice-accent', p.accent);
  s.setProperty('--ice-accent-hover', p.accentHover);
  s.setProperty('--ice-accent-muted', p.accentMuted);
  s.setProperty('--ice-green', p.green);
  s.setProperty('--ice-red', p.red);
  s.setProperty('--ice-yellow', p.yellow);
}

const ALL_PROPS = [
  '--ice-bg-base',
  '--ice-bg-surface',
  '--ice-bg-raised',
  '--ice-bg-overlay',
  '--ice-bg-hover',
  '--ice-bg-active',
  '--ice-bg-toolbar',
  '--ice-border',
  '--ice-border-strong',
  '--ice-text-primary',
  '--ice-text-secondary',
  '--ice-text-tertiary',
  '--ice-accent',
  '--ice-accent-hover',
  '--ice-accent-muted',
  '--ice-green',
  '--ice-red',
  '--ice-yellow',
];

function clearOverrides() {
  const s = document.documentElement.style;
  for (const p of ALL_PROPS) s.removeProperty(p);
  localStorage.removeItem('ice-theme-id');
}

// Component

export const DevAccentPicker: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  const [open, setOpen] = useState(false);
  const toggle = useCallback(() => setOpen((v) => !v), []);
  const [activeId, setActiveId] = useState<string | null>(null);

  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains('dark'));
  useEffect(() => {
    const obs = new MutationObserver(() => setIsDark(document.documentElement.classList.contains('dark')));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem('ice-theme-id');
    if (saved) {
      const theme = T.find((t) => t.id === saved);
      if (theme) {
        applyPalette(isDark ? theme.dark : theme.light);
        setActiveId(saved);
      }
    }
  }, []); // eslint-disable-line

  useEffect(() => {
    if (!activeId) return;
    const theme = T.find((t) => t.id === activeId);
    if (theme) applyPalette(isDark ? theme.dark : theme.light);
  }, [isDark, activeId]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'A') {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const handleSelect = useCallback((theme: ColorTheme) => {
    applyPalette(document.documentElement.classList.contains('dark') ? theme.dark : theme.light);
    setActiveId(theme.id);
    localStorage.setItem('ice-theme-id', theme.id);
  }, []);

  const handleReset = useCallback(() => {
    clearOverrides();
    setActiveId(null);
  }, []);

  const panel = !open ? null : (
    <div
      className="fixed bottom-4 right-4 z-[99999] w-[360px] max-h-[80vh] rounded-lg border shadow-2xl flex flex-col overflow-hidden"
      style={{ borderColor: 'var(--ice-border)', background: 'var(--ice-bg-surface)' }}
    >
      <div
        className="flex items-center gap-2 px-3 py-2 shrink-0"
        style={{ borderBottom: '1px solid var(--ice-border)' }}
      >
        <Palette className="w-3.5 h-3.5" style={{ color: 'var(--ice-accent)' }} />
        <span className="text-xs font-medium" style={{ color: 'var(--ice-text-primary)' }}>
          Color Themes
        </span>
        <span className="flex items-center gap-1 ml-1 text-ice-2xs" style={{ color: 'var(--ice-text-tertiary)' }}>
          {isDark ? <Moon className="w-2.5 h-2.5" /> : <Sun className="w-2.5 h-2.5" />}
          {isDark ? 'Dark' : 'Light'}
        </span>
        <span className="flex-1" />
        <button
          onClick={handleReset}
          className="text-ice-2xs hover:opacity-100 opacity-50 transition-opacity"
          style={{ color: 'var(--ice-text-primary)' }}
        >
          Reset
        </button>
        <button
          onClick={() => setOpen(false)}
          className="p-0.5 hover:opacity-100 opacity-50 transition-opacity"
          style={{ color: 'var(--ice-text-primary)' }}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {T.map((theme) => {
          const isActive = activeId === theme.id;
          const palette = isDark ? theme.dark : theme.light;
          return (
            <button
              key={theme.id}
              onClick={() => handleSelect(theme)}
              className="w-full text-left rounded-md px-3 py-2.5 transition-colors outline-none focus-visible:ring-1"
              style={{ background: isActive ? 'var(--ice-bg-active)' : 'transparent' }}
              onMouseEnter={(e) => {
                if (!isActive) e.currentTarget.style.background = 'var(--ice-bg-hover)';
              }}
              onMouseLeave={(e) => {
                if (!isActive) e.currentTarget.style.background = 'transparent';
              }}
            >
              <div className="flex items-center gap-3">
                <div className="flex gap-0.5 shrink-0">
                  <div className="w-4 h-4 rounded-full" style={{ background: theme.preview[0] }} />
                  <div
                    className="w-4 h-4 rounded-full"
                    style={{ background: isDark ? theme.preview[1] : theme.preview[2] }}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium" style={{ color: 'var(--ice-text-primary)' }}>
                      {theme.name}
                    </span>
                    {isActive && (
                      <span
                        className="text-ice-2xs px-1.5 py-px rounded-full"
                        style={{ background: palette.accentMuted, color: palette.accent }}
                      >
                        Active
                      </span>
                    )}
                  </div>
                  <span className="text-ice-2xs leading-tight" style={{ color: 'var(--ice-text-tertiary)' }}>
                    {theme.description}
                  </span>
                </div>
              </div>
              <div className="flex gap-px mt-2 h-3 rounded-sm overflow-hidden">
                <div className="flex-1" style={{ background: palette.base }} />
                <div className="flex-1" style={{ background: palette.surface }} />
                <div className="flex-1" style={{ background: palette.toolbar }} />
                <div className="flex-1" style={{ background: palette.raised }} />
                <div className="flex-1" style={{ background: palette.border }} />
                <div className="flex-[0.5]" style={{ background: palette.accent }} />
              </div>
            </button>
          );
        })}
      </div>
      <div className="px-3 py-1.5 text-center shrink-0" style={{ borderTop: '1px solid var(--ice-border)' }}>
        <span className="text-ice-2xs" style={{ color: 'var(--ice-text-tertiary)', opacity: 0.5 }}>
          {T.length} themes
        </span>
      </div>
    </div>
  );

  return (
    <ThemePickerContext.Provider value={{ toggle }}>
      {children}
      {panel}
    </ThemePickerContext.Provider>
  );
};
