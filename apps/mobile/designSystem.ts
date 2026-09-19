// Tracker Mobile Design System Tokens
// Arabic-First, Operational, Calm, Information-Dense

export const colors = {
  // Backgrounds & Surfaces
  background: '#f8fafc',
  surface: '#ffffff',
  surfaceSubtle: '#f1f5f9',
  surfaceHover: '#e2e8f0',
  surfaceDark: '#0f172a',

  // Primary Brand (Emerald / Teal)
  primary: '#0f766e',
  primaryDark: '#115e59',
  primaryLight: '#ccfbf1',
  primaryText: '#0d9488',

  // Accent / Operations
  accent: '#0284c7',
  accentLight: '#e0f2fe',

  // Status & Telemetry Colors
  status: {
    online: '#16a34a',
    onlineBg: '#f0fdf4',
    onlineBorder: '#bbf7d0',

    moving: '#059669',
    movingBg: '#ecfdf5',
    movingBorder: '#a7f3d0',

    stopped: '#d97706',
    stoppedBg: '#fffbeb',
    stoppedBorder: '#fde68a',

    atRestaurant: '#0284c7',
    atRestaurantBg: '#f0f9ff',
    atRestaurantBorder: '#bae6fd',

    offline: '#64748b',
    offlineBg: '#f1f5f9',
    offlineBorder: '#cbd5e1',

    warning: '#ea580c',
    warningBg: '#fff7ed',
    warningBorder: '#ffedd5',

    critical: '#dc2626',
    criticalBg: '#fef2f2',
    criticalBorder: '#fecaca',
  },

  // Borders
  border: '#e2e8f0',
  borderStrong: '#cbd5e1',

  // Typography Colors
  text: {
    primary: '#0f172a',
    secondary: '#334155',
    muted: '#64748b',
    light: '#94a3b8',
    inverse: '#ffffff',
  },
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
};

export const radius = {
  xs: 4,
  sm: 6,
  md: 10,
  lg: 14,
  xl: 18,
  full: 9999,
};

export const fonts = {
  regular: 'Cairo-Regular',
  medium: 'Cairo-Medium',
  semiBold: 'Cairo-SemiBold',
  bold: 'Cairo-Bold',
  base: 'Cairo',
};

export const typography = {
  screenTitle: {
    fontFamily: fonts.bold,
    fontSize: 18,
    fontWeight: '700' as const,
    color: colors.text.primary,
  },
  sectionTitle: {
    fontFamily: fonts.bold,
    fontSize: 14,
    fontWeight: '700' as const,
    color: colors.text.primary,
  },
  cardTitle: {
    fontFamily: fonts.semiBold,
    fontSize: 13,
    fontWeight: '600' as const,
    color: colors.text.secondary,
  },
  body: {
    fontFamily: fonts.regular,
    fontSize: 13,
    fontWeight: '400' as const,
    color: colors.text.primary,
  },
  bodyStrong: {
    fontFamily: fonts.semiBold,
    fontSize: 13,
    fontWeight: '600' as const,
    color: colors.text.primary,
  },
  meta: {
    fontFamily: fonts.regular,
    fontSize: 11,
    fontWeight: '400' as const,
    color: colors.text.muted,
  },
  metaStrong: {
    fontFamily: fonts.semiBold,
    fontSize: 11,
    fontWeight: '600' as const,
    color: colors.text.secondary,
  },
  kpiNumber: {
    fontFamily: fonts.bold,
    fontSize: 22,
    fontWeight: '800' as const,
    color: colors.text.primary,
  },
};

export const shadows = {
  card: {
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  float: {
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
  },
};


