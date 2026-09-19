import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  TouchableWithoutFeedback,
} from 'react-native';
import { colors, radius, fonts, shadows } from '../designSystem';
import { AppIcon, type IconName } from './AppIcon';
import { isRtl } from '../i18n';

export interface TrackerDialogProps {
  visible: boolean;
  title: string;
  message: string;
  type?: 'error' | 'warning' | 'notice' | 'success';
  primaryButtonText?: string;
  onPrimaryPress?: () => void;
  secondaryButtonText?: string;
  onSecondaryPress?: () => void;
  isDestructive?: boolean;
  loading?: boolean;
  icon?: IconName;
  onClose?: () => void;
}

export function TrackerDialog({
  visible,
  title,
  message,
  type = 'notice',
  primaryButtonText = 'حسناً',
  onPrimaryPress,
  secondaryButtonText,
  onSecondaryPress,
  isDestructive = false,
  loading = false,
  icon,
  onClose,
}: TrackerDialogProps): React.JSX.Element {
  const rtl = isRtl();

  const getTheme = () => {
    switch (type) {
      case 'error':
        return {
          iconName: icon || ('warning' as IconName),
          iconColor: colors.status.critical,
          iconBg: colors.status.criticalBg,
          iconBorder: colors.status.criticalBorder,
          primaryBtnBg: isDestructive ? colors.status.critical : colors.primary,
        };
      case 'warning':
        return {
          iconName: icon || ('warning' as IconName),
          iconColor: colors.status.warning,
          iconBg: colors.status.warningBg,
          iconBorder: colors.status.warningBorder,
          primaryBtnBg: colors.status.warning,
        };
      case 'success':
        return {
          iconName: icon || ('check' as IconName),
          iconColor: colors.status.online,
          iconBg: colors.status.onlineBg,
          iconBorder: colors.status.onlineBorder,
          primaryBtnBg: colors.primary,
        };
      default:
        return {
          iconName: icon || ('target' as IconName),
          iconColor: colors.primary,
          iconBg: colors.primaryLight,
          iconBorder: '#99f6e4',
          primaryBtnBg: colors.primary,
        };
    }
  };

  const theme = getTheme();

  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      onRequestClose={onClose || onPrimaryPress}
    >
      <TouchableWithoutFeedback onPress={onClose || onPrimaryPress}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <View style={styles.card}>
              {/* Header Icon */}
              <View
                style={[
                  styles.iconCircle,
                  {
                    backgroundColor: theme.iconBg,
                    borderColor: theme.iconBorder,
                  },
                ]}
              >
                <AppIcon name={theme.iconName} size={22} color={theme.iconColor} />
              </View>

              {/* Title */}
              <Text style={[styles.title, { textAlign: rtl ? 'right' : 'left' }]}>
                {title}
              </Text>

              {/* Message */}
              <Text style={[styles.message, { textAlign: rtl ? 'right' : 'left' }]}>
                {message}
              </Text>

              {/* Action Buttons */}
              <View
                style={[
                  styles.actionsRow,
                  { flexDirection: rtl ? 'row-reverse' : 'row' },
                ]}
              >
                {secondaryButtonText && onSecondaryPress && (
                  <TouchableOpacity
                    style={styles.secondaryBtn}
                    onPress={onSecondaryPress}
                    disabled={loading}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.secondaryBtnText}>{secondaryButtonText}</Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  style={[
                    styles.primaryBtn,
                    { backgroundColor: theme.primaryBtnBg },
                    loading && styles.disabledBtn,
                  ]}
                  onPress={onPrimaryPress || onClose}
                  disabled={loading}
                  activeOpacity={0.8}
                >
                  {loading ? (
                    <ActivityIndicator color="#ffffff" size="small" />
                  ) : (
                    <Text style={styles.primaryBtnText}>{primaryButtonText}</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.float,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    marginBottom: 14,
    alignSelf: 'flex-start',
  },
  title: {
    fontFamily: fonts.bold,
    fontSize: 16,
    fontWeight: '700',
    color: colors.text.primary,
    marginBottom: 8,
    lineHeight: 24,
  },
  message: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.text.secondary,
    lineHeight: 20,
    marginBottom: 20,
  },
  actionsRow: {
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 10,
  },
  primaryBtn: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 90,
  },
  primaryBtnText: {
    fontFamily: fonts.semiBold,
    fontSize: 13,
    fontWeight: '600',
    color: '#ffffff',
  },
  secondaryBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSubtle,
  },
  secondaryBtnText: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.text.secondary,
  },
  disabledBtn: {
    opacity: 0.6,
  },
});

