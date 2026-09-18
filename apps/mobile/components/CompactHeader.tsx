// Compact Operational Header for Tracker Mobile
// Sleek, Information-Dense, Non-Wasted Vertical Space (~52dp)

import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, radius, spacing, typography } from '../designSystem';
import { AppIcon } from './AppIcon';
import { TrackerLogo } from './TrackerLogo';
import { isRtl, type Locale } from '../i18n';

interface CompactHeaderProps {
  title: string;
  subtitle?: string;
  role: 'ADMIN' | 'CALL_CENTER' | 'DRIVER';
  userName?: string;
  locale: Locale;
  onToggleLanguage: () => void;
  onLogout: () => void;
}

export function CompactHeader({
  title,
  subtitle,
  role,
  userName,
  locale,
  onToggleLanguage,
  onLogout,
}: CompactHeaderProps): React.JSX.Element {
  const rtl = isRtl();

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

  const roleStyle = getRoleBadgeStyle();

  return (
    <View style={styles.header}>
      {/* Title & Identity on the dominant reading side */}
      <View style={[styles.identityGroup, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
        <TrackerLogo size={30} />

        <View style={[styles.titleGroup, { alignItems: rtl ? 'flex-end' : 'flex-start' }]}>
          <View style={[styles.titleRow, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
            <Text style={styles.titleText} numberOfLines={1}>
              {title}
            </Text>
            <View style={[styles.roleBadge, { backgroundColor: roleStyle.bg, borderColor: roleStyle.border }]}>
              <Text style={[styles.roleBadgeText, { color: roleStyle.text }]}>{roleStyle.label}</Text>
            </View>
          </View>
          {userName ? (
            <Text style={styles.userText} numberOfLines={1}>
              {userName}
            </Text>
          ) : subtitle ? (
            <Text style={styles.userText} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
      </View>

      {/* Action Controls: Language Toggle & Logout */}
      <View style={[styles.actionsGroup, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
        <TouchableOpacity
          style={styles.langButton}
          onPress={onToggleLanguage}
          accessibilityLabel="Switch Language"
        >
          <Text style={styles.langButtonText}>{locale === 'ar' ? 'EN' : 'عربي'}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.logoutButton}
          onPress={onLogout}
          accessibilityLabel="Logout"
        >
          <AppIcon name="logout" size={14} color="#dc2626" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    height: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  identityGroup: {
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  logoMark: {
    width: 28,
    height: 28,
    borderRadius: radius.sm,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
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
  userText: {
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

