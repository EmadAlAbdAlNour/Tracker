import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  TouchableWithoutFeedback,
  ScrollView,
} from 'react-native';
import { colors, radius, fonts, shadows } from '../designSystem';
import { TrackerLogo } from './TrackerLogo';
import { AppIcon } from './AppIcon';
import { isRtl, formatWesternNumber, getRowDirection } from '../i18n';

export interface TrackerUpdateModalProps {
  visible: boolean;
  currentVersion: string;
  newVersion: string;
  releaseNotes?: { ar?: string; en?: string } | null;
  onUpdatePress: () => void;
  onLaterPress: () => void;
  downloadProgress: number; // 0.0 to 1.0
  downloading: boolean;
  errorMessage: string | null;
  onRetry: () => void;
}

export function TrackerUpdateModal({
  visible,
  currentVersion,
  newVersion,
  releaseNotes,
  onUpdatePress,
  onLaterPress,
  downloadProgress,
  downloading,
  errorMessage,
  onRetry,
}: TrackerUpdateModalProps): React.JSX.Element {
  const rtl = isRtl();
  const rowDir = getRowDirection();

  const notes = rtl
    ? releaseNotes?.ar || releaseNotes?.en
    : releaseNotes?.en || releaseNotes?.ar;

  const percent = Math.round(downloadProgress * 100);

  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      onRequestClose={downloading ? undefined : onLaterPress}
    >
      <TouchableWithoutFeedback onPress={downloading ? undefined : onLaterPress}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <View style={styles.card}>
              {/* Header Logo */}
              <View style={styles.logoRow}>
                <TrackerLogo size={52} />
              </View>

              {/* Title & Subtitle */}
              <Text style={[styles.title, { textAlign: rtl ? 'right' : 'left' }]}>
                {rtl ? 'تحديث جديد متوفر' : 'New Update Available'}
              </Text>
              <Text style={[styles.subtitle, { textAlign: rtl ? 'right' : 'left' }]}>
                {rtl ? 'يتوفر إصدار جديد من Tracker.' : 'A new version of Tracker is available.'}
              </Text>

              {/* Version Comparison Box (Always LTR text for version strings) */}
              <View style={[styles.versionBox, { flexDirection: rowDir }]}>
                <View style={styles.versionChip}>
                  <Text style={styles.versionLabel}>
                    {rtl ? 'الإصدار الحالي' : 'Current'}
                  </Text>
                  <Text style={styles.versionValue}>{currentVersion}</Text>
                </View>

                <View style={styles.arrowIcon}>
                  <AppIcon
                    name={rtl ? 'arrow-left' : 'arrow-right'}
                    size={16}
                    color={colors.primary}
                  />
                </View>

                <View style={[styles.versionChip, styles.newVersionChip]}>
                  <Text style={[styles.versionLabel, styles.newVersionLabel]}>
                    {rtl ? 'الإصدار الجديد' : 'New'}
                  </Text>
                  <Text style={[styles.versionValue, styles.newVersionValue]}>{newVersion}</Text>
                </View>
              </View>

              {/* Release Notes if available */}
              {notes && (
                <View style={styles.notesContainer}>
                  <Text style={[styles.notesHeader, { textAlign: rtl ? 'right' : 'left' }]}>
                    {rtl ? 'ملاحظات الإصدار:' : 'Release Notes:'}
                  </Text>
                  <ScrollView style={styles.notesScroll} nestedScrollEnabled>
                    <Text style={[styles.notesText, { textAlign: rtl ? 'right' : 'left' }]}>
                      {notes}
                    </Text>
                  </ScrollView>
                </View>
              )}

              {/* Downloading Progress Bar */}
              {downloading && (
                <View style={styles.progressContainer}>
                  <View style={[styles.progressHeader, { flexDirection: rowDir }]}>
                    <Text style={styles.progressStatusText}>
                      {rtl ? 'جاري تحميل التحديث...' : 'Downloading update...'}
                    </Text>
                    <Text style={styles.progressPercentText}>
                      {formatWesternNumber(percent)}%
                    </Text>
                  </View>
                  <View style={styles.progressBarTrack}>
                    <View
                      style={[
                        styles.progressBarFill,
                        { width: `${Math.min(100, Math.max(5, percent))}%` },
                      ]}
                    />
                  </View>
                </View>
              )}

              {/* Error Message Box */}
              {errorMessage && (
                <View style={styles.errorBox}>
                  <View style={styles.errorIcon}>
                    <AppIcon name="warning" size={16} color={colors.status.critical} />
                  </View>
                  <Text style={[styles.errorText, { textAlign: rtl ? 'right' : 'left' }]}>
                    {errorMessage}
                  </Text>
                </View>
              )}

              {/* Action Buttons */}
              <View
                style={[
                  styles.actionsRow,
                  { flexDirection: rowDir },
                ]}
              >
                {!downloading && (
                  <TouchableOpacity
                    style={styles.laterBtn}
                    onPress={onLaterPress}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.laterBtnText}>{rtl ? 'لاحقاً' : 'Later'}</Text>
                  </TouchableOpacity>
                )}

                {errorMessage ? (
                  <TouchableOpacity
                    style={styles.retryBtn}
                    onPress={onRetry}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.updateBtnText}>{rtl ? 'إعادة المحاولة' : 'Retry'}</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={[styles.updateBtn, downloading && styles.disabledBtn]}
                    onPress={onUpdatePress}
                    disabled={downloading}
                    activeOpacity={0.8}
                  >
                    {downloading ? (
                      <ActivityIndicator color="#ffffff" size="small" />
                    ) : (
                      <Text style={styles.updateBtnText}>
                        {rtl ? 'تحديث الآن' : 'Update Now'}
                      </Text>
                    )}
                  </TouchableOpacity>
                )}
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
    backgroundColor: 'rgba(15, 23, 42, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: 22,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.float,
  },
  logoRow: {
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontFamily: fonts.bold,
    fontSize: 18,
    fontWeight: '700',
    color: colors.text.primary,
    marginBottom: 4,
  },
  subtitle: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.text.muted,
    marginBottom: 16,
  },
  versionBox: {
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.md,
    padding: 12,
    marginBottom: 16,
  },
  versionChip: {
    flex: 1,
    alignItems: 'center',
  },
  newVersionChip: {
    backgroundColor: colors.primaryLight,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: radius.sm,
  },
  versionLabel: {
    fontFamily: fonts.medium,
    fontSize: 11,
    color: colors.text.muted,
    marginBottom: 2,
  },
  newVersionLabel: {
    color: colors.primaryDark,
    fontWeight: '600',
  },
  versionValue: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: colors.text.secondary,
  },
  newVersionValue: {
    color: colors.primary,
    fontWeight: '700',
  },
  arrowIcon: {
    paddingHorizontal: 8,
  },
  notesContainer: {
    backgroundColor: '#fafafa',
    borderRadius: radius.md,
    padding: 10,
    marginBottom: 16,
    maxHeight: 90,
  },
  notesHeader: {
    fontFamily: fonts.semiBold,
    fontSize: 11,
    color: colors.text.muted,
    marginBottom: 4,
  },
  notesScroll: {
    maxHeight: 60,
  },
  notesText: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.text.secondary,
    lineHeight: 18,
  },
  progressContainer: {
    marginBottom: 16,
  },
  progressHeader: {
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  progressStatusText: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.text.secondary,
  },
  progressPercentText: {
    fontFamily: fonts.bold,
    fontSize: 12,
    color: colors.primary,
  },
  progressBarTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.surfaceHover,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 4,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.status.criticalBg,
    borderColor: colors.status.criticalBorder,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: 10,
    marginBottom: 16,
    gap: 8,
  },
  errorIcon: {
    width: 20,
    alignItems: 'center',
  },
  errorText: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.status.critical,
    lineHeight: 16,
  },
  actionsRow: {
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 12,
    marginTop: 4,
  },
  laterBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  laterBtnText: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.text.secondary,
  },
  updateBtn: {
    paddingVertical: 11,
    paddingHorizontal: 20,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 110,
  },
  retryBtn: {
    paddingVertical: 11,
    paddingHorizontal: 20,
    borderRadius: radius.md,
    backgroundColor: colors.status.warning,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 110,
  },
  updateBtnText: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: '#ffffff',
  },
  disabledBtn: {
    opacity: 0.6,
  },
});

