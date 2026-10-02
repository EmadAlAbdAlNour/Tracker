# Internationalization & RTL Design System

> Practical Single Source of Truth for Localization, Layout Direction, and Typography Standards.  
> Verified against production i18n modules, design system tokens, and screen layouts (`v1.2.0`).

---

## 1. Core Principles of the Localization System

Tracker is built from the ground up as an **Arabic-First** application tailored for the Saudi Arabian and MENA operational markets, while maintaining complete feature parity in English:

1. **App Language Precedence**: The in-app language preference (`ar` or `en`) strictly determines the layout direction (`RTL` or `LTR`). The host operating system's language setting must **never override** the app's chosen locale.
2. **Western Arabic Numerals**: All numbers (speeds, distances, durations, percentages, battery levels) are formatted using Western Arabic numerals (`0, 1, 2, 3...`) across both Arabic and English to preserve operational clarity.
3. **Selective LTR Preservation**: Technical strings (UUIDs, coordinates, version tags, URLs, email addresses, SHA-256 hashes) intentionally remain LTR within RTL layouts to prevent bidirectional rendering corruption.
4. **Zero-Clipping Guarantee**: Arabic typography requires wider horizontal spacing than Latin text. Layouts enforce dynamic flex wrapping and avoid hardcoded pixel widths on labels to prevent text truncation.

---

## 2. Directional Logic & Typography Tokens

### 2.1 Directional State (`i18n.ts`)

```typescript
export type Locale = 'ar' | 'en';

export function isRtl(): boolean {
  return getLocale() === 'ar';
}

export function getRowDirection(): 'row' | 'row-reverse' {
  return isRtl() ? 'row-reverse' : 'row';
}
```

- In React Native: Dynamic styles apply `flexDirection: getRowDirection()` and logical alignment (`alignItems: isRtl() ? 'flex-end' : 'flex-start'`).
- In Web (Next.js): The root HTML document synchronizes directly with the stored locale:
  ```typescript
  document.documentElement.dir = currentLocale === 'ar' ? 'rtl' : 'ltr';
  document.documentElement.lang = currentLocale;
  ```
  Tailwind logical classes (`start-0`, `end-0`, `ms-auto`, `border-e`) automatically flip layout orientation between RTL and LTR.

### 2.2 Typography Architecture

| Token | Arabic (`ar`) Font | English (`en`) Font | Usage |
| :--- | :--- | :--- | :--- |
| **Header / Bold** | Cairo-Bold (700) | Inter-Bold / System | Section titles, KPI numerals, primary headings. |
| **Subheader / Medium** | Cairo-SemiBold (600) | Inter-SemiBold | Table headers, tab labels, button text. |
| **Body / Regular** | Cairo-Regular (400) | Inter-Regular | Descriptions, metadata values, form inputs. |
| **Technical / Monospace** | RobotoMono / System Monospace | Courier / System Monospace | Coordinates, UUIDs, git commit hashes, SHA-256 fingerprints. |

---

## 3. Strict LTR Isolation Rules for Technical Data

When technical strings are rendered inside an Arabic RTL text container, bidirectional text algorithms (BiDi) can shuffle hyphens, dots, and trailing colons. Tracker isolates these fields using explicit LTR wrapping:

| Technical Data Type | Example Value | Required Text Style |
| :--- | :--- | :--- |
| **Coordinates** | `24.7136, 46.6753` | `{ writingDirection: 'ltr', textAlign: 'left' }` |
| **UUIDs / Entity IDs** | `b2f69904-4e78-4392-a160-c3ecb2daea8d` | `{ writingDirection: 'ltr' }` |
| **Version Strings** | `v1.2.0 (Build 35)` | `{ writingDirection: 'ltr' }` |
| **SHA-256 Hashes** | `915ea97b0d120b47...` | `{ writingDirection: 'ltr' }` |
| **Email Addresses** | `ahmed@tracker.com` | `{ writingDirection: 'ltr' }` |
| **API URLs** | `https://tracker-alpha-puce.vercel.app` | `{ writingDirection: 'ltr' }` |
| **Phone Numbers** | `+966 50 123 4567` | `{ writingDirection: 'ltr' }` |

---

## 4. Number Formatting Standards (`number.ts`)

To avoid confusing drivers with Eastern Arabic numerals (`١, ٢, ٣`), all operational metrics are passed through `formatWesternNumber()`:

```typescript
export function formatWesternNumber(value: number | string): string {
  if (value == null || value === '') return '—';
  const num = Number(value);
  if (isNaN(num)) return String(value);
  return num.toLocaleString('en-US'); // Enforces 1,234.56
}
```

- Speed: `45 كم/س` (Arabic) vs. `45 km/h` (English).
- Distance: `12.4 كم` (Arabic) vs. `12.4 km` (English).
- Battery: `85%` (Both).
