import AsyncStorage from '@react-native-async-storage/async-storage';

export const LOCALE_STORAGE_KEY = 'tracker_mobile_locale';

export type Locale = 'ar' | 'en';

let currentLocale: Locale = 'ar';

export const translations = {
  ar: {
    app: {
      title: 'تطبيق السائق',
      subtitle: 'سجل الدخول لبدء وردية العمل',
      operatorTitle: 'لوحة التشغيل والمراقبة',
      operatorSubtitle: 'مراقبة حالة السائقين والأسطول الميداني',
      logout: 'تسجيل الخروج',
      sync: 'مزامنة البيانات الآن',
      synced: 'تمت المزامنة بنجاح',
      syncError: 'تعذر الاتصال بالخادم، سيتم المحاولة لاحقاً',
      returnToLogin: 'العودة لتسجيل الدخول',
      notice: 'تنبيه',
      warning: 'تحذير',
      error: 'خطأ',
    },
    login: {
      emailOrPhone: 'البريد الإلكتروني أو الهاتف',
      password: 'كلمة المرور',
      signIn: 'تسجيل الدخول',
      signingIn: 'جاري تسجيل الدخول...',
      enterCredentials: 'يرجى إدخال اسم المستخدم وكلمة المرور',
      invalidSession: 'جلسة تسجيل الدخول غير صالحة.',
      roleNotAllowed: 'الدور غير مسموح به في هذا التطبيق.',
      failed: 'فشل تسجيل الدخول',
    },
    shift: {
      title: 'حالة الوردية والتتبع',
      onDuty: 'على رأس العمل',
      offDuty: 'خارج الوردية',
      startShift: 'بدء الوردية (تفعيل التتبع)',
      endShift: 'إنهاء الوردية (إيقاف التتبع)',
      started: 'تم بدء الوردية',
      ended: 'تم إنهاء الوردية',
      activeTrackingNotice: 'نظام التتبع يرسل موقعك تلقائياً للوحة التحكم لضمان سلامة العمليات.',
      inactiveNotice: 'اضغط أدناه لبدء الوردية وتفعيل تتبع الموقع الجغرافي.',
      endShiftFirst: 'يرجى إنهاء الوردية أولاً قبل تسجيل الخروج.',
      bgPermissionRequiredTitle: 'إذن الموقع في الخلفية مطلوب',
      bgPermissionRequiredMessage: 'يتطلب تتبع السائق السماح بالوصول للموقع الجغرافي "طوال الوقت" (Allow all the time) ليعمل أثناء استخدام تطبيقات أخرى أو قفل الشاشة.',
    },
    diagnostics: {
      title: 'بيانات الاتصال والمزامنة',
      trackingStatus: 'حالة التتبع:',
      queuedLocations: 'نقاط الموقع المخزنة بالهاتف:',
      active: 'نشط',
      inactive: 'معطل',
      employeeId: 'الرقم الوظيفي:',
      driver: 'سائق',
    },
    operator: {
      activeShifts: 'الورديات النشطة',
      online: 'متصل',
      moving: 'متحرك',
      stopped: 'متوقف',
      atRestaurant: 'بالمطعم',
      offline: 'غير متصل',
      battery: 'البطارية',
      lastSeen: 'آخر ظهور',
      refresh: 'تحديث البيانات',
      noDrivers: 'لا يوجد سائقون مسجلون حالياً',
    },
  },
  en: {
    app: {
      title: 'Driver Tracker',
      subtitle: 'Sign in to start your shift',
      operatorTitle: 'Operations & Fleet Console',
      operatorSubtitle: 'Real-time monitoring of active drivers and fleet',
      logout: 'Log Out',
      sync: 'Sync Now',
      synced: 'Queued locations sent successfully',
      syncError: 'Could not connect to server, will retry later',
      returnToLogin: 'Return to Login',
      notice: 'Notice',
      warning: 'Warning',
      error: 'Error',
    },
    login: {
      emailOrPhone: 'Email or Phone',
      password: 'Password',
      signIn: 'Sign In',
      signingIn: 'Signing in...',
      enterCredentials: 'Please enter credentials',
      invalidSession: 'Invalid login session payload.',
      roleNotAllowed: 'This role is not allowed in this app.',
      failed: 'Login Failed',
    },
    shift: {
      title: 'Shift & Tracking',
      onDuty: 'ON DUTY',
      offDuty: 'OFF DUTY',
      startShift: 'Start Shift (Start Tracking)',
      endShift: 'End Shift (Stop Tracking)',
      started: 'Shift Started',
      ended: 'Shift Ended',
      activeTrackingNotice: 'Background GPS tracking is actively transmitting your location.',
      inactiveNotice: 'Press below to start your operational shift and GPS tracking.',
      endShiftFirst: 'Please end your active shift before logging out.',
      bgPermissionRequiredTitle: 'Background Location Required',
      bgPermissionRequiredMessage: 'Driver tracking requires "Allow all the time" location access to keep recording when the app is minimized or screen is locked.',
    },
    diagnostics: {
      title: 'Sync & Diagnostics',
      trackingStatus: 'Tracking Status:',
      queuedLocations: 'Queued Locations:',
      active: 'Active',
      inactive: 'Inactive',
      employeeId: 'Employee ID:',
      driver: 'Driver',
    },
    operator: {
      activeShifts: 'Active Shifts',
      online: 'Online',
      moving: 'Moving',
      stopped: 'Stopped',
      atRestaurant: 'At Restaurant',
      offline: 'Offline',
      battery: 'Battery',
      lastSeen: 'Last Seen',
      refresh: 'Refresh',
      noDrivers: 'No drivers registered currently',
    },
  },
};

export async function initLocale(): Promise<Locale> {
  try {
    const saved = await AsyncStorage.getItem(LOCALE_STORAGE_KEY);
    if (saved === 'ar' || saved === 'en') {
      currentLocale = saved;
    } else {
      currentLocale = 'ar';
    }
  } catch {
    currentLocale = 'ar';
  }
  return currentLocale;
}

export function getLocale(): Locale {
  return currentLocale;
}

export async function setStoredLocale(locale: Locale): Promise<void> {
  currentLocale = locale;
  try {
    await AsyncStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // ignore
  }
}

export function isRtl(): boolean {
  return currentLocale === 'ar';
}

export function t(path: string): string {
  const parts = path.split('.');
  let current: any = translations[currentLocale] ?? translations.ar;

  for (const part of parts) {
    current = current?.[part];
    if (current == null) {
      // fallback to Arabic
      let fallback: any = translations.ar;
      for (const fPart of parts) {
        fallback = fallback?.[fPart];
      }
      return fallback != null ? String(fallback) : path;
    }
  }

  return String(current);
}

/**
 * Western Digits Formatter (0 1 2 3 4 5 6 7 8 9)
 * Replaces Eastern Arabic numerals (٠-٩) with ASCII Western digits
 */
export function formatWesternNumber(value: number | string | null | undefined): string {
  if (value == null) return '';
  if (typeof value === 'number') {
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value);
  }
  const str = String(value).replace(/[٠-٩]/g, (d) => '0123456789'['٠١٢٣٤٥٦٧٨٩'.indexOf(d)] ?? d);
  const num = Number(str);
  if (!isNaN(num)) {
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(num);
  }
  return str;
}

