'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Download,
  Smartphone,
  CheckCircle2,
  Shield,
  FileCheck,
  Calendar,
  HardDrive,
  Cpu,
  ArrowRight,
  Globe,
} from 'lucide-react';

export default function DownloadPage() {
  const [locale, setLocale] = useState<'ar' | 'en'>('ar');

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem('tracker_locale');
      if (stored === 'en' || stored === 'ar') {
        setLocale(stored);
      }
    } catch {
      // fallback
    }
  }, []);

  const toggleLanguage = () => {
    const next = locale === 'ar' ? 'en' : 'ar';
    setLocale(next);
    try {
      window.localStorage.setItem('tracker_locale', next);
      document.documentElement.lang = next;
      document.documentElement.dir = next === 'ar' ? 'rtl' : 'ltr';
    } catch {
      // fallback
    }
  };

  const isAr = locale === 'ar';

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [releaseData, setReleaseData] = useState<{
    version: string;
    versionCode?: number;
    releaseDate: string;
    fileSize: string;
    packageName: string;
    minAndroid: string;
    verifiedOn: string;
    sha256: string;
    downloadUrl: string;
    releaseNotes?: { ar?: string; en?: string };
  } | null>(null);

  useEffect(() => {
    setIsLoading(true);
    fetch('/api/app-version')
      .then((res) => {
        if (!res.ok) {
          throw new Error('Failed to fetch release metadata');
        }
        return res.json();
      })
      .then((data) => {
        if (data && data.version) {
          const publishedDate = data.publishedAt ? new Date(data.publishedAt).toISOString().split('T')[0] : 'Unknown date';
          setReleaseData({
            version: data.version,
            versionCode: data.versionCode,
            releaseDate: publishedDate,
            fileSize: data.fileSize || 'Unknown size',
            packageName: data.packageName || 'com.tracker.driver',
            minAndroid: 'Android 8.0+ (API 26)',
            verifiedOn: 'Samsung Galaxy S25 Ultra (Android 16)',
            sha256: data.sha256 || 'Unknown SHA-256',
            downloadUrl: data.downloadUrl || '/api/download/latest',
            releaseNotes: data.releaseNotes,
          });
        } else {
          throw new Error('Invalid release metadata');
        }
      })
      .catch((err) => {
        console.error(err);
        setError(isAr ? 'لم نتمكن من جلب بيانات التحديث.' : 'Failed to fetch release metadata.');
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [isAr]);

  if (isLoading) {
    return (
      <div className={`min-h-screen bg-slate-50 text-slate-900 flex items-center justify-center ${isAr ? 'rtl' : 'ltr'}`} dir={isAr ? 'rtl' : 'ltr'}>
        <div className="flex flex-col items-center justify-center space-y-4">
          <div className="h-10 w-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-slate-500 font-medium">{isAr ? 'جاري تحميل بيانات التحديث...' : 'Loading release metadata...'}</p>
        </div>
      </div>
    );
  }

  if (error || !releaseData) {
    return (
      <div className={`min-h-screen bg-slate-50 text-slate-900 flex items-center justify-center ${isAr ? 'rtl' : 'ltr'}`} dir={isAr ? 'rtl' : 'ltr'}>
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200 text-center max-w-sm w-full mx-4">
          <Shield className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-lg font-bold text-slate-900 mb-2">{isAr ? 'خطأ في التحديث' : 'Update Error'}</h2>
          <p className="text-sm text-slate-600 mb-6">{error || (isAr ? 'بيانات التحديث غير متوفرة.' : 'Release metadata unavailable.')}</p>
          <button
            onClick={() => window.location.reload()}
            className="w-full inline-flex items-center justify-center rounded-xl bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-200 transition"
          >
            {isAr ? 'إعادة المحاولة' : 'Try Again'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen bg-slate-50 text-slate-900 flex flex-col ${isAr ? 'rtl' : 'ltr'}`} dir={isAr ? 'rtl' : 'ltr'}>
      {/* Top Bar */}
      <header className="border-b border-slate-200 bg-white/90 backdrop-blur sticky top-0 z-20 px-6 py-4">
        <div className="mx-auto max-w-5xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/logo.svg" alt="Tracker" className="h-9 w-9 rounded-xl shadow-sm" />
            <div>
              <span className="font-bold text-lg text-slate-900 tracking-tight">Tracker</span>
              <span className="text-xs text-slate-400 block -mt-1 font-medium">
                {isAr ? 'منصة تتبع الأسطول' : 'Fleet Operations'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={toggleLanguage}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition"
            >
              <Globe className="h-3.5 w-3.5 text-slate-500" />
              <span>{isAr ? 'English' : 'العربية'}</span>
            </button>

            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 transition"
            >
              <span>{isAr ? 'لوحة التحكم' : 'Web Dashboard'}</span>
              <ArrowRight className={`h-3 w-3 ${isAr ? 'rotate-180' : ''}`} />
            </Link>
          </div>
        </div>
      </header>

      {/* Main Download Hero */}
      <main className="flex-1 py-12 px-6">
        <div className="mx-auto max-w-4xl">
          {/* Hero Header */}
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800 mb-4">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
              <span>{isAr ? 'الإصدار الرسمي المستقر جاهز للتحميل' : 'Official Production Release Ready'}</span>
            </div>

            <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
              {isAr ? 'تحميل تطبيق Tracker للأندرويد' : 'Download Tracker for Android'}
            </h1>
            <p className="mt-3 text-base text-slate-600 max-w-xl mx-auto leading-relaxed">
              {isAr
                ? 'تطبيق التتبع الميداني المتكامل لفرق العمليات والسائقين، يوفر تتبعاً دقيقاً في الوقت الفعلي مع تشغيل موثوق في الخلفية.'
                : 'Complete real-time field tracking application for operations and drivers with hardened background service execution.'}
            </p>
          </div>

          {/* Primary Action Card */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-xl p-8 mb-8 text-center sm:text-start">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
              <div className="flex items-center gap-5">
                <div className="h-16 w-16 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center shrink-0 shadow-inner">
                  <Smartphone className="h-8 w-8 text-emerald-600" />
                </div>
                <div>
                  <div className="flex items-center gap-2.5">
                    <h2 className="text-xl font-bold text-slate-900">Tracker for Android</h2>
                    <span className="rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold px-2.5 py-0.5 font-mono">
                      v{releaseData.version}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    {isAr ? 'حزمة التثبيت المباشرة (APK) • بناء مستقل لا يتطلب خدمات إضافية' : 'Direct APK Installer Package • Standalone Build'}
                  </p>
                </div>
              </div>

              <a
                href={releaseData.downloadUrl}
                download={`Tracker-${releaseData.version}.apk`}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 rounded-2xl bg-emerald-600 px-6 py-4 text-base font-bold text-white shadow-lg shadow-emerald-600/25 hover:bg-emerald-700 transition"
              >
                <Download className="h-5 w-5" />
                <span>{isAr ? 'تحميل التطبيق الآن (APK)' : 'Download APK Now'}</span>
              </a>
            </div>

            {/* Quick Specs Grid */}
            <div className="mt-8 grid grid-cols-2 sm:grid-cols-4 gap-4 border-t border-slate-100 pt-6">
              <div className="flex items-center gap-3">
                <HardDrive className="h-4 w-4 text-slate-400 shrink-0" />
                <div>
                  <span className="text-[11px] text-slate-400 block">{isAr ? 'حجم الملف' : 'File Size'}</span>
                  <span className="text-xs font-bold text-slate-800">{releaseData.fileSize}</span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Calendar className="h-4 w-4 text-slate-400 shrink-0" />
                <div>
                  <span className="text-[11px] text-slate-400 block">{isAr ? 'تاريخ الإصدار' : 'Release Date'}</span>
                  <span className="text-xs font-bold text-slate-800">{releaseData.releaseDate}</span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Cpu className="h-4 w-4 text-slate-400 shrink-0" />
                <div>
                  <span className="text-[11px] text-slate-400 block">{isAr ? 'الحد الأدنى للنظام' : 'Min Android'}</span>
                  <span className="text-xs font-bold text-slate-800">{releaseData.minAndroid}</span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Shield className="h-4 w-4 text-slate-400 shrink-0" />
                <div>
                  <span className="text-[11px] text-slate-400 block">{isAr ? 'تم التحقق على' : 'Verified On'}</span>
                  <span className="text-xs font-bold text-slate-800">S25 Ultra (Android 16)</span>
                </div>
              </div>
            </div>
          </div>

          {/* Details & Integrity Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            {/* Release Highlights */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <span>{isAr ? `أبرز مميزات الإصدار ${releaseData.version}` : `Release ${releaseData.version} Highlights`}</span>
              </h3>
              <ul className="space-y-2.5 text-xs text-slate-600">
                <li className="flex items-start gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                  <span>{isAr ? 'تجربة موحدة تشمل كافة الأدوار (ADMIN, CALL_CENTER, DRIVER).' : 'Unified multi-role architecture (ADMIN, CALL_CENTER, DRIVER).'}</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                  <span>{isAr ? 'خدمة تتبع الموقع الجغرافي بالخلفية مع توفير استهلاك البطارية.' : 'Battery-optimized background GPS telemetry engine.'}</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                  <span>{isAr ? 'خريطة تفاعلية جغرافية حية مع نطاق المطعم الجغرافي (Geofence).' : 'Live interactive geographic map with restaurant geofence perimeter.'}</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                  <span>{isAr ? 'حماية أمنية بربط جهاز معتمد واحد لكل حساب سائق.' : 'Hardware security binding with one authorized device per driver.'}</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                  <span>{isAr ? 'دعم كامل للغة العربية (RTL) والأرقام اللاتينية (0-9).' : 'Complete Arabic RTL typography & Western ASCII digits (0-9).'}</span>
                </li>
              </ul>
            </div>

            {/* Verification & Security Integrity */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
                <FileCheck className="h-4 w-4 text-emerald-600" />
                <span>{isAr ? 'بيانات الأمان والتحقق من الحزمة' : 'Package Security & Checksum'}</span>
              </h3>
              <div className="space-y-3 text-xs">
                <div>
                  <span className="text-slate-400 block mb-1">{isAr ? 'اسم الحزمة (Package)' : 'Package Name'}</span>
                  <code className="rounded bg-slate-100 px-2 py-1 text-slate-700 font-mono text-[11px] block overflow-x-auto">
                    {releaseData.packageName}
                  </code>
                </div>

                <div>
                  <span className="text-slate-400 block mb-1">SHA-256 Checksum</span>
                  <code className="rounded bg-slate-100 p-2 text-slate-700 font-mono text-[10px] block break-all leading-relaxed">
                    {releaseData.sha256}
                  </code>
                </div>

                <div className="pt-2 text-[11px] text-slate-500 leading-relaxed">
                  {isAr
                    ? '💡 لتثبيت التطبيق على هاتفك، تأكد من تفعيل خيار "تثبيت التطبيقات من مصادر غير معروفة" في إعدادات الأندرويد.'
                    : '💡 To install on Android, ensure "Install unknown apps" permission is enabled in device settings.'}
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Professional Footer */}
      <footer className="border-t border-slate-200 bg-white py-6 px-6 text-center text-xs text-slate-500">
        <div className="mx-auto max-w-4xl flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2 font-semibold text-slate-700">
            <span>Tracker</span>
            <span className="text-slate-300">•</span>
            <span className="text-slate-400">© 2026</span>
          </div>
          <div className="text-slate-500 font-medium">
            {isAr ? 'تم التطوير بواسطة عماد عبد النور ❤️' : 'Developed by Emad Abd Alnour ❤️'}
          </div>
        </div>
      </footer>
    </div>
  );
}
