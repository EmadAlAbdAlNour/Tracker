// Forwarding wrapper around unified AppHeader
import React from 'react';
import { AppHeader } from './AppHeader';
import type { Locale } from '../i18n';

export interface CompactHeaderProps {
  title: string;
  subtitle?: string;
  role: 'ADMIN' | 'CALL_CENTER' | 'DRIVER';
  userName?: string;
  locale: Locale;
  onToggleLanguage: () => void;
  onLogout: () => void;
}

export function CompactHeader(props: CompactHeaderProps): React.JSX.Element {
  return <AppHeader {...props} />;
}
