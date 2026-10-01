// Unified Operational AppHeader for Tracker Mobile
// Standard 52dp height, Strict BiDi/RTL alignment, Native Zero-Emoji Icons

import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, radius, spacing } from '../designSystem';
import { AppIcon } from './AppIcon';
import { TrackerLogo } from './TrackerLogo';
import { isRtl, getRowDirection, type Locale } from '../i18n';

export interface AppHeaderProps {
  title: string;
  subtitle?: string;
  role?: 'ADMIN' | 'CALL_CENTER' | 'DRIVER';
  userName?: string;
  locale?: Locale;
  onToggleLanguage?: () => void;
  onLogout?: () => void;
  onBack?: () => void;
  rightAction?: React.ReactNode;
}

export function AppHeader({
  title,
  subtitle,
  role,
  userName,
  locale,
  onToggleLanguage,
  onLogout,
  onBack,
  rightAction,
}: AppHeaderProps): React.JSX.Element {
  const rtl = isRtl();
  const rowDir = getRowDirection();

  const getRoleBadgeStyle = () => {
    switch (role) {
      case 'ADMIN':
        return { bg: '#f0fdf4', text: '#15803d', border: '#bbf7d0', label: 'ADMIN' };
      case 'CALL_CENTER':
        return { bg: '#f0f9ff', text: '#0284c7', border: '#bae6fd', label: rtl ? 'مراقبة فقط' : 'DISPATCH' };
      case 'DRIVER':
      default:
        return { bg: '#f8fafc', text: '#0f766e', border: '#ccfbf1', label: rtl ? 'سائق' : 'DRIVER' };
    }
  };

  const roleStyle = role ? getRoleBadgeStyle() : null;

  return (
    <View style={[styles.header, { flexDirection: rowDir }]}>
      {/* Identity / Navigation section on reading start */}
      <View style={[styles.identityGroup, { flexDirection: rowDir }]}>
        {onBack ? (
          <TouchableOpacity
            style={styles.backButton}
            onPress={onBack}
            accessibilityLabel={rtl ? 'رجوع' : 'Back'}
          >
            <AppIcon name={rtl ? 'arrow-right' : 'arrow-left'} size={18} color={colors.text.primary} />
          </TouchableOpacity>
        ) : (
          <TrackerLogo size={28} />
        )}

        <View style={[styles.titleGroup, { alignItems: rtl ? 'flex-end' : 'flex-start' }]}>
          <View style={[styles.titleRow, { flexDirection: rowDir }]}>
            <Text style={styles.titleText} numberOfLines={1}>
              {title}
            </Text>
            {roleStyle && (
              <View style={[styles.roleBadge, { backgroundColor: roleStyle.bg, borderColor: roleStyle.border }]}>
                <Text style={[styles.roleBadgeText, { color: roleStyle.text }]}>{roleStyle.label}</Text>
              </View>
            )}
          </View>
          {(userName || subtitle) ? (
            <Text style={styles.subtitleText} numberOfLines={1}>
              {userName || subtitle}
            </Text>
          ) : null}
        </View>
      </View>

      {/* Action Controls on reading end */}
      <View style={[styles.actionsGroup, { flexDirection: rowDir }]}>
        {rightAction}

        {onToggleLanguage && (
          <TouchableOpacity
            style={styles.langButton}
            onPress={onToggleLanguage}
            accessibilityLabel="Switch Language"
          >
            <Text style={styles.langButtonText}>{locale === 'ar' ? 'EN' : 'عربي'}</Text>
          </TouchableOpacity>
        )}

        {onLogout && (
          <TouchableOpacity
            style={styles.logoutButton}
            onPress={onLogout}
            accessibilityLabel="Logout"
          >
            <AppIcon name="logout" size={14} color="#dc2626" />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    height: 52,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  identityGroup: {
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  backButton: {
    width: 32,
    height: 32,
    borderRadius: radius.xs,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleGroup: {
    justifyContent: 'center',
    flexShrink: 1,
  },
  titleRow: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  titleText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text.primary,
  },
  roleBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: radius.xs,
    borderWidth: 1,
  },
  roleBadgeText: {
    fontSize: 9,
    fontWeight: '700',
  },
  subtitleText: {
    fontSize: 10,
    color: colors.text.muted,
  },
  actionsGroup: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  langButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.xs,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.border,
  },
  langButtonText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.text.secondary,
  },
  logoutButton: {
    width: 30,
    height: 30,
    borderRadius: radius.xs,
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

