'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  BarChart3,
  Bell,
  BriefcaseBusiness,
  CheckCheck,
  Globe,
  LayoutDashboard,
  LogOut,
  MapPinned,
  Settings,
  ShieldCheck,
  Users,
  X,
  AlertTriangle,
  Info,
  AlertCircle,
} from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { logoutAdmin, listNotifications, markNotificationRead, markAllNotificationsRead, type NotificationItem } from '@/lib/api';
import { useAuth } from '@/components/auth-provider';
import { t, getLocale, setStoredLocale, formatWesternNumber, formatTimeAgo } from '@/lib/i18n';

export function DashboardShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { session, isAuthenticated, logout } = useAuth();
  const [currentLocale, setCurrentLocale] = useState(getLocale());
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!isAuthenticated) {
      router.replace('/login');
    }
  }, [isAuthenticated, router]);

  // Synchronize document dir and lang
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

  // Load notifications periodically
  useEffect(() => {
    if (!isAuthenticated) return;
    let isMounted = true;

    async function fetchNotifs() {
      try {
        const res = await listNotifications({ page: 1, limit: 15 });
        if (isMounted) {
          setNotifications(res.items);
          setUnreadCount(res.unreadCount);
        }
      } catch (err) {
        // ignore background poll errors
      }
    }

    fetchNotifs();
    const interval = setInterval(fetchNotifs, 15000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [isAuthenticated]);

  const toggleLanguage = () => {
    const next = currentLocale === 'ar' ? 'en' : 'ar';
    setStoredLocale(next);
  };

  const handleLogout = async () => {
    await logoutAdmin();
    logout();
    router.replace('/login');
  };

  const handleMarkAllRead = async () => {
    try {
      await markAllNotificationsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch (e) {
      console.error(e);
    }
  };

  const handleNotificationClick = async (notif: NotificationItem) => {
    if (!notif.read) {
      try {
        await markNotificationRead(notif.id);
        setNotifications((prev) =>
          prev.map((n) => (n.id === notif.id ? { ...n, read: true } : n))
        );
        setUnreadCount((prev) => Math.max(0, prev - 1));
      } catch (e) {
        console.error(e);
      }
    }
  };

  if (!isAuthenticated || !session) {
    return null;
  }

  const navItems = [
    { href: '/dashboard', label: t('nav.overview'), icon: LayoutDashboard },
    { href: '/dashboard/drivers', label: t('nav.drivers'), icon: BriefcaseBusiness },
    { href: '/dashboard/devices', label: t('nav.devices'), icon: ShieldCheck },
    { href: '/dashboard/users', label: t('nav.users'), icon: Users },
    { href: '/dashboard/map', label: t('nav.map'), icon: MapPinned },
    { href: '/dashboard/settings', label: t('nav.settings'), icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      {/* Sidebar with logical start-0 and border-e */}
      <aside className="fixed inset-y-0 start-0 z-20 w-72 border-e border-slate-800 bg-slate-950 text-slate-100 flex flex-col justify-between">
        <div>
          {/* App Header */}
          <div className="flex h-16 items-center justify-between border-b border-slate-800 px-6">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-lg bg-emerald-600 flex items-center justify-center font-bold text-white shadow">
                T
              </div>
              <span className="font-semibold text-lg text-white">{t('app.title')}</span>
            </div>
          </div>

          {/* Navigation */}
          <nav className="space-y-1.5 p-4">
            {navItems.map(({ href, label, icon: Icon }) => {
              const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href));
              return (
                <Link
                  key={href}
                  href={href}
                  className={`flex items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-medium transition ${
                    active ? 'bg-emerald-600 text-white font-semibold shadow-sm' : 'text-slate-300 hover:bg-slate-900 hover:text-white'
                  }`}
                >
                  <Icon className="h-4.5 w-4.5 shrink-0" />
                  <span>{label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* User Card & Language toggle */}
        <div className="p-4 border-t border-slate-800 space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-400 px-1">
            <button
              type="button"
              onClick={toggleLanguage}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1 text-slate-300 hover:bg-slate-800"
            >
              <Globe className="h-3.5 w-3.5" />
              <span>{currentLocale === 'ar' ? 'English' : 'العربية'}</span>
            </button>
            <span className="text-slate-500">{session.user.role}</span>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900 p-3 flex items-center justify-between gap-2">
            <div className="truncate">
              <div className="text-sm font-medium text-white truncate">{session.user.name}</div>
              <div className="text-xs text-slate-400 truncate">{session.user.email}</div>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              title={t('app.logout')}
              className="inline-flex items-center justify-center h-8 w-8 rounded-lg border border-slate-700 bg-slate-800 text-slate-300 hover:bg-rose-950 hover:text-rose-300 transition shrink-0"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content with logical ms-72 */}
      <div className="ms-72 min-h-screen flex flex-col">
        {/* Top Navbar */}
        <header className="sticky top-0 z-10 h-16 border-b border-slate-200 bg-white/90 backdrop-blur px-6 flex items-center justify-between">
          <div className="text-sm text-slate-500 font-medium">
            {t('app.subtitle')}
          </div>

          <div className="flex items-center gap-3">
            {/* Quick Language Toggle */}
            <button
              type="button"
              onClick={toggleLanguage}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition"
            >
              <Globe className="h-3.5 w-3.5 text-slate-500" />
              <span>{currentLocale === 'ar' ? 'EN' : 'عربي'}</span>
            </button>

            {/* Notification Bell */}
            <button
              type="button"
              onClick={() => setNotificationsOpen(!notificationsOpen)}
              className="relative inline-flex items-center justify-center h-10 w-10 rounded-xl border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 transition"
              title={t('app.notifications')}
            >
              <Bell className="h-4.5 w-4.5 text-slate-600" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -end-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white shadow">
                  {formatWesternNumber(unreadCount)}
                </span>
              )}
            </button>
          </div>
        </header>

        {/* Notifications Slideover / Dropdown */}
        {notificationsOpen && (
          <div className="fixed inset-y-0 end-0 z-30 w-96 border-s border-slate-200 bg-white shadow-2xl flex flex-col">
            <div className="flex h-16 items-center justify-between border-b border-slate-100 px-5">
              <div className="flex items-center gap-2">
                <Bell className="h-4 w-4 text-emerald-600" />
                <span className="font-semibold text-slate-900">{t('app.notifications')}</span>
                {unreadCount > 0 && (
                  <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-bold text-rose-700">
                    {formatWesternNumber(unreadCount)}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={handleMarkAllRead}
                    title={t('app.markAllRead')}
                    className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                  >
                    <CheckCheck className="h-3.5 w-3.5" />
                    <span>{t('app.markAllRead')}</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setNotificationsOpen(false)}
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
              {notifications.length === 0 ? (
                <div className="p-8 text-center text-sm text-slate-400">
                  {t('app.noNotifications')}
                </div>
              ) : (
                notifications.map((notif) => {
                  const isCritical = notif.severity === 'CRITICAL';
                  const isWarning = notif.severity === 'WARNING';
                  const Icon = isCritical ? AlertCircle : isWarning ? AlertTriangle : Info;

                  return (
                    <div
                      key={notif.id}
                      onClick={() => handleNotificationClick(notif)}
                      className={`p-4 transition cursor-pointer hover:bg-slate-50 ${
                        !notif.read ? 'bg-emerald-50/40' : ''
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={`mt-0.5 rounded-lg p-1.5 shrink-0 ${
                            isCritical
                              ? 'bg-rose-100 text-rose-600'
                              : isWarning
                              ? 'bg-amber-100 text-amber-600'
                              : 'bg-sky-100 text-sky-600'
                          }`}
                        >
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-xs font-semibold text-slate-900 truncate">
                              {currentLocale === 'ar' ? notif.titleAr : notif.titleEn}
                            </span>
                            <span className="text-[10px] text-slate-400 shrink-0">
                              {formatTimeAgo(notif.createdAt)}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                            {currentLocale === 'ar' ? notif.messageAr : notif.messageEn}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* Page Content */}
        <main className="flex-1 p-6 lg:p-8">
          <div className="mx-auto max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div>
        <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-emerald-600">
          {t('app.title')}
        </p>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-slate-500">{subtitle}</p> : null}
      </div>
      {action ? <div>{action}</div> : null}
    </div>
  );
}

export function StatCard({
  label,
  value,
  detail,
  icon: Icon,
  variant = 'default',
}: {
  label: string;
  value: string | number;
  detail?: string;
  icon: any;
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info';
}) {
  const variantStyles = {
    default: 'bg-slate-50 text-slate-600 border-slate-200',
    success: 'bg-emerald-50 text-emerald-600 border-emerald-200',
    warning: 'bg-amber-50 text-amber-600 border-amber-200',
    danger: 'bg-rose-50 text-rose-600 border-rose-200',
    info: 'bg-sky-50 text-sky-600 border-sky-200',
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <span className="text-sm font-medium text-slate-500">{label}</span>
        <div className={`rounded-xl border p-2 ${variantStyles[variant]}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className="text-3xl font-bold tracking-tight text-slate-900">
        {formatWesternNumber(value)}
      </div>
      {detail ? <p className="mt-2 text-xs text-slate-500">{detail}</p> : null}
    </div>
  );
}
