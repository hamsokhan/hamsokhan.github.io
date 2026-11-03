// Display preferences live in localStorage so the theme applies before React
// renders (no flash). They are also included nowhere else; resetting them is harmless.
import { useSyncExternalStore } from 'react';

export type Theme = 'light' | 'dark' | 'system';
export interface Settings { theme: Theme; fontScale: number; lineHeight: number; hintSeen: boolean }

const KEY = 'hamsokhan.settings';
const DEFAULTS: Settings = { theme: 'system', fontScale: 1, lineHeight: 1.625, hintSeen: false };
export const FONT_SCALES = [0.9, 1, 1.12, 1.25, 1.4] as const;
export const LINE_HEIGHTS = [1.45, 1.625, 1.9, 2.2] as const;

function read(): Settings {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    return {
      theme: ['light', 'dark', 'system'].includes(v?.theme) ? v.theme : DEFAULTS.theme,
      fontScale: FONT_SCALES.includes(v?.fontScale) ? v.fontScale : DEFAULTS.fontScale,
      lineHeight: LINE_HEIGHTS.includes(v?.lineHeight) ? v.lineHeight : DEFAULTS.lineHeight,
      hintSeen: v?.hintSeen === true,
    };
  } catch {
    return DEFAULTS;
  }
}

let current = read();
const listeners = new Set<() => void>();
const media = window.matchMedia('(prefers-color-scheme: dark)');

export function applySettings(s = current) {
  const dark = s.theme === 'dark' || (s.theme === 'system' && media.matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.documentElement.style.setProperty('--font-scale', String(s.fontScale));
  document.documentElement.style.setProperty('--reading-leading', String(s.lineHeight));
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#141a17' : '#F8F5EE');
}
media.addEventListener('change', () => applySettings());

export function updateSettings(patch: Partial<Settings>) {
  current = { ...current, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // Storage blocked: the change still applies for this session.
  }
  applySettings();
  listeners.forEach((l) => l());
}

export function useSettings(): Settings {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => current,
  );
}
