// Mobile-Native Bottom Tab Bar for Tracker
// Fits screen perfectly without horizontal overflow, 100% vector icons, badge support

import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, radius, spacing } from '../designSystem';
import { AppIcon, type IconName } from './AppIcon';
import { isRtl, getRowDirection } from '../i18n';

export interface TabItem {
  id: string;
  label: string;
  icon: IconName;
  badgeCount?: number;
}

interface BottomTabBarProps {
  tabs: TabItem[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
}

export function BottomTabBar({
  tabs,
  activeTab,
  onTabChange,
}: BottomTabBarProps): React.JSX.Element {
  const rowDir = getRowDirection();

  return (
    <View style={styles.container}>
      <View style={[styles.tabBar, { flexDirection: rowDir }]}>
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab;
          return (
            <TouchableOpacity
              key={tab.id}
              style={[styles.tabButton, isActive && styles.tabButtonActive]}
              onPress={() => onTabChange(tab.id)}
              activeOpacity={0.7}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
            >
              <View style={styles.iconWrapper}>
                <AppIcon
                  name={tab.icon}
                  size={20}
                  color={isActive ? colors.primary : colors.text.muted}
                  focused={isActive}
                />
                {tab.badgeCount != null && tab.badgeCount > 0 && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>
                      {tab.badgeCount > 99 ? '99+' : tab.badgeCount}
                    </Text>
                  </View>
                )}
              </View>

              <Text
                style={[
                  styles.tabLabel,
                  isActive ? styles.tabLabelActive : styles.tabLabelInactive,
                ]}
                numberOfLines={1}
              >
                {tab.label}
              </Text>

              {isActive && <View style={styles.activeIndicator} />}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  tabBar: {
    flexDirection: 'row',
    height: 56,
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: spacing.xs,
  },
  tabButton: {
    flex: 1,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
  },
  tabButtonActive: {
    // optional active background tint if desired
  },
  iconWrapper: {
    width: 26,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabLabel: {
    fontSize: 10,
    marginTop: 2,
    textAlign: 'center',
  },
  tabLabelActive: {
    fontWeight: '700',
    color: colors.primary,
  },
  tabLabelInactive: {
    fontWeight: '500',
    color: colors.text.muted,
  },
  activeIndicator: {
    position: 'absolute',
    top: 0,
    width: '40%',
    height: 2.5,
    backgroundColor: colors.primary,
    borderBottomLeftRadius: radius.full,
    borderBottomRightRadius: radius.full,
  },
  badge: {
    position: 'absolute',
    top: -3,
    right: -6,
    backgroundColor: colors.status.critical,
    borderRadius: radius.full,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '800',
  },
});

