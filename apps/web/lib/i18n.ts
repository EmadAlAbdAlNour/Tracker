// Simple i18n helper: loads JSON locale files on the client and provides t(key)
// Default locale: ar (Arabic, RTL)

import ar from '../locales/ar/common.json';
import en from '../locales/en/common.json';

type Translations = typeof ar;

const resources: Record<string, Translations> = {
  ar,
  en,
};

export function getStoredLocale(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem('tracker_locale');
  } catch {
    return null;
  }
}

export function setStoredLocale(locale: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem('tracker_locale', locale);
  } catch (e) {}
}

export function getLocale(): string {
  return getStoredLocale() ?? 'ar';
}

export function t(key: string): string {
  const locale = getLocale();
  const res = resources[locale] ?? resources['ar'];
  const parts = key.split('.');
  let out: any = res as any;
  for (const p of parts) {
    out = out?.[p];
    if (out == null) return key;
  }
  return out as string;
}

export function isRtl(): boolean {
  return getLocale() === 'ar';
}
