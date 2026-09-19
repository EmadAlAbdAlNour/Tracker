'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient } from '@/lib/api';
import { useAuth } from '@/components/auth-provider';
import { Eye, EyeOff, Globe } from 'lucide-react';
import { t, getLocale, setStoredLocale } from '@/lib/i18n';

export default function LoginPage() {
  const router = useRouter();
  const { setTokens, isAuthenticated, isLoading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentLocale, setCurrentLocale] = useState(getLocale());

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.replace('/dashboard');
    }
  }, [isLoading, isAuthenticated, router]);

  useEffect(() => {
    const handleLocaleChange = () => {
      setCurrentLocale(getLocale());
    };
    window.addEventListener('tracker_locale_change', handleLocaleChange);
    document.documentElement.dir = currentLocale === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = currentLocale;
    return () => {
      window.removeEventListener('tracker_locale_change', handleLocaleChange);
    };
  }, [currentLocale]);

  const toggleLanguage = () => {
    const next = currentLocale === 'ar' ? 'en' : 'ar';
    setStoredLocale(next);
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const result = await apiClient.login(email.trim(), password);
      setTokens(result);
      router.push('/dashboard');
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : currentLocale === 'ar'
          ? 'فشل تسجيل الدخول. يرجى التحقق من البيانات.'
          : 'Login failed. Please verify credentials.'
      );
    } finally {
      setLoading(false);
    }
  }

  const isAr = currentLocale === 'ar';

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-xl">
        {/* Language switch button */}
        <div className="flex justify-end mb-4">
          <button
            type="button"
            onClick={toggleLanguage}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
          >
            <Globe className="h-3.5 w-3.5" />
            <span>{isAr ? 'English' : 'العربية'}</span>
          </button>
        </div>

        <div className="mb-8 text-center">
          <img
            src="/logo.svg"
            alt="Tracker"
            className="mx-auto mb-3 h-14 w-14 rounded-2xl shadow-md"
          />
          <p className="text-xs font-semibold uppercase tracking-wider text-emerald-600">
            Tracker
          </p>
          <h1 className="mt-2 text-2xl font-bold text-slate-900">
            {isAr ? 'تسجيل الدخول' : 'Sign In'}
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            {isAr ? 'منظومة المراقبة والعمليات الميدانية' : 'Fleet Operations & Monitoring'}
          </p>
        </div>

        <form className="space-y-5" onSubmit={handleSubmit}>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700">
              {isAr ? 'البريد الإلكتروني أو الهاتف' : 'Email or Phone'}
            </label>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              dir="ltr"
              className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 outline-none transition focus:border-emerald-500 focus:bg-white text-left font-mono"
              type="text"
              autoComplete="username"
              placeholder="admin@example.com"
              required
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700">
              {isAr ? 'كلمة المرور' : 'Password'}
            </label>
            <div className="relative">
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                dir="ltr"
                className="w-full rounded-xl border border-slate-300 bg-slate-50 ps-3.5 pe-11 py-2.5 text-sm text-slate-900 outline-none transition focus:border-emerald-500 focus:bg-white text-left font-mono"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="••••••••"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute end-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 transition"
                title={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {error ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
              {error}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300"
          >
            {loading
              ? isAr
                ? 'جاري التحقق...'
                : 'Signing in...'
              : isAr
              ? 'تسجيل الدخول'
              : 'Sign In'}
          </button>
        </form>

        {/* Subtle Developer Attribution Footer */}
        <div className="mt-6 pt-4 border-t border-slate-100 text-center text-xs text-slate-400 font-medium">
          {isAr ? 'تم التطوير بواسطة عماد عبد النور ❤️' : 'Developed by Emad Abd Alnour ❤️'}
        </div>
      </div>
    </main>
  );
}
