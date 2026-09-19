import './globals.css';
import 'leaflet/dist/leaflet.css';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Cairo } from 'next/font/google';
import { AuthProvider } from '@/components/auth-provider';

const cairo = Cairo({
  subsets: ['arabic', 'latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-cairo',
});

export const metadata: Metadata = {
  title: 'Tracker',
  description: 'منصة تتبع وإدارة الأسطول الميداني — Tracker Fleet Management',
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/favicon.ico', sizes: '32x32' },
    ],
    shortcut: '/favicon.ico',
    apple: '/icon.svg',
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ar" dir="rtl" className={cairo.variable} suppressHydrationWarning>
      <body className="font-sans antialiased">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
