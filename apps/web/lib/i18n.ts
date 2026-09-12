// Internationalization helper for Tracker Web Admin
// Primary Language: Arabic (ar), default RTL
// Secondary Language: English (en), LTR
// Rule 3: Western digits only (0-9) everywhere

import ar from '../locales/ar/common.json';
import en from '../locales/en/common.json';

const resources: Record<string, any> = {
  ar,
  en,
};

const STORAGE_KEY = 'tracker_locale';

export function getStoredLocale(): string {
  if (typeof window === 'undefined') return 'ar';
  try {
    return window.localStorage.getItem(STORAGE_KEY) || 'ar';
  } catch {
    return 'ar';
  }
}

export function setStoredLocale(locale: 'ar' | 'en'): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, locale);
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr';
    window.dispatchEvent(new Event('tracker_locale_change'));
  } catch (e) {
    console.error('Failed to set locale:', e);
  }
}

export function getLocale(): string {
  return getStoredLocale();
}

export function isRtl(): boolean {
  return getLocale() === 'ar';
}

export function t(key: string): string {
  const locale = getLocale();
  const dict = resources[locale] ?? resources['ar'];
  const parts = key.split('.');
  let current: any = dict;

  for (const part of parts) {
    current = current?.[part];
    if (current == null) {
      // Fallback to Arabic if not found in English
      let fallback: any = resources['ar'];
      for (const fPart of parts) {
        fallback = fallback?.[fPart];
      }
      return fallback != null ? String(fallback) : key;
    }
  }

  return String(current);
}

/**
 * Strict Western Digits Formatter (0 1 2 3 4 5 6 7 8 9)
 * Guarantees no Eastern Arabic numerals (٠-٩) appear in any UI metric, timestamp, ID, or counter.
 */
export function formatWesternNumber(value: number | string | null | undefined, options?: Intl.NumberFormatOptions): string {
  if (value == null) return '';
  if (typeof value === 'string') {
    const converted = value.replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d).toString());
    if (options) {
      const num = Number(converted);
      if (!isNaN(num)) {
        return new Intl.NumberFormat('en-US', options).format(num);
      }
    }
    return converted;
  }
  return new Intl.NumberFormat('en-US', options ?? { maximumFractionDigits: 2 }).format(value);
}

export function formatTimeAgo(dateString: string | null | undefined): string {
  if (!dateString) return '-';
  const diffMs = Date.now() - new Date(dateString).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return isRtl() ? 'الآن' : 'Just now';
  if (mins < 60) return isRtl() ? `منذ ${formatWesternNumber(mins)} دقيقة` : `${formatWesternNumber(mins)}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return isRtl() ? `منذ ${formatWesternNumber(hours)} ساعة` : `${formatWesternNumber(hours)}h ago`;
  const days = Math.floor(hours / 24);
  return isRtl() ? `منذ ${formatWesternNumber(days)} يوم` : `${formatWesternNumber(days)}d ago`;
}
