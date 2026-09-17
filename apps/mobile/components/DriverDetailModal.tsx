// Rebuilt Driver Operational Profile Modal
// Explicit Freshness Semantics, Connection vs Movement Separation, Zero-Emoji

import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { colors, radius, spacing, typography, shadows } from '../designSystem';
import { AppIcon } from './AppIcon';
import { formatWesternNumber, isRtl, t } from '../i18n';

interface DriverDetailModalProps {
  visible: boolean;
  driver: any | null;
  isAdmin: boolean;
  onClose: () => void;
  onDeviceReset?: (driverId: string) => Promise<void>;
}

export function DriverDetailModal({
  visible,
  driver,
  isAdmin,
  onClose,
  onDeviceReset,
}: DriverDetailModalProps): React.JSX.Element {
  const [resetting, setResetting] = useState(false);

  if (!driver) return <></>;

  const rtl = isRtl();

  // Freshness & Connection vs Movement Logic
  const isOnline = driver.operationalStatus !== 'OFFLINE';
  const recordedAtMs = driver.location?.recordedAt ? new Date(driver.location.recordedAt).getTime() : 0;
  const elapsedMinutes = recordedAtMs > 0 ? Math.max(0, Math.round((Date.now() - recordedAtMs) / 60000)) : null;

  // Connection State: Online / Delayed / Offline
  const connectionState = !isOnline
    ? 'offline'
    : elapsedMinutes != null && elapsedMinutes > 5
    ? 'delayed'
    : 'online';

  // Movement State: Moving / Stopped / Unknown
  const speedKmh =
    driver.location?.speed != null ? Math.round(Number(driver.location.speed) * 3.6) : null;
  const movementState = !isOnline
    ? 'unknown'
    : speedKmh != null && speedKmh > 3
    ? 'moving'
    : 'stopped';

  const getConnectionBadge = () => {
    switch (connectionState) {
      case 'online':
        return { label: rtl ? 'متصل الآن' : 'ONLINE', bg: colors.status.onlineBg, text: colors.status.online, border: colors.status.onlineBorder };
      case 'delayed':
        return { label: rtl ? 'اتصال متأخر' : 'DELAYED', bg: colors.status.warningBg, text: colors.status.warning, border: colors.status.warningBorder };
      case 'offline':
      default:
        return { label: rtl ? 'غير متصل' : 'OFFLINE', bg: colors.status.offlineBg, text: colors.status.offline, border: colors.status.offlineBorder };
    }
  };

  const getMovementBadge = () => {
    switch (movementState) {
      case 'moving':
        return { label: rtl ? 'في حركة' : 'MOVING', color: colors.status.moving };
      case 'stopped':
        return { label: rtl ? 'متوقف' : 'STOPPED', color: colors.status.stopped };
      case 'unknown':
      default:
        return { label: rtl ? 'غير معروف' : 'UNKNOWN', color: colors.text.muted };
    }
  };

  const connBadge = getConnectionBadge();
  const movBadge = getMovementBadge();

  const handleResetPress = () => {
    Alert.alert(
      t('admin.confirmResetTitle'),
      t('admin.confirmResetMessage'),
      [
        { text: t('app.cancel'), style: 'cancel' },
        {
          text: t('admin.resetDevice'),
          style: 'destructive',
          onPress: async () => {
            if (!onDeviceReset) return;
            setResetting(true);
            try {
              await onDeviceReset(driver.driverId);
              Alert.alert(t('app.notice'), t('admin.resetSuccess'));
            } catch (err: any) {
              Alert.alert(t('app.error'), err?.message || t('admin.resetFailed'));
            } finally {
              setResetting(false);
            }
          },
        },
      ]
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.modalContainer}>
        {/* Header */}
        <View style={[styles.header, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
          <TouchableOpacity onPress={onClose} style={styles.closeButton} accessibilityLabel="Close">
            <AppIcon name="close" size={16} color={colors.text.primary} />
          </TouchableOpacity>

          <View style={[styles.headerTitleGroup, { alignItems: rtl ? 'flex-end' : 'flex-start' }]}>
            <Text style={styles.headerTitle}>{driver.driverName}</Text>
            <Text style={styles.headerSub}>
              {t('diagnostics.employeeId')} {formatWesternNumber(driver.employeeId)}
            </Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent}>
          {/* Status & Freshness Header Card */}
          <View style={styles.card}>
            <View style={[styles.rowBetween, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
              <Text style={styles.cardSectionTitle}>{rtl ? 'الحالة والاتصال الميداني' : 'Connection & Status'}</Text>
              <View style={[styles.badgePill, { backgroundColor: connBadge.bg, borderColor: connBadge.border }]}>
                <Text style={[styles.badgePillText, { color: connBadge.text }]}>{connBadge.label}</Text>
              </View>
            </View>

            {/* Freshness Timestamp */}
            <View style={[styles.metaRow, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
              <Text style={styles.metaLabel}>{rtl ? 'آخر اتصال مسجل:' : 'Last Contact:'}</Text>
              <Text style={styles.metaValue}>
                {elapsedMinutes != null
                  ? elapsedMinutes === 0
                    ? rtl ? 'منذ ثوانٍ' : 'seconds ago'
                    : rtl ? `منذ ${formatWesternNumber(elapsedMinutes)} دقيقة` : `${formatWesternNumber(elapsedMinutes)}m ago`
                  : rtl ? 'لا توجد بيانات' : 'No telemetry'}
              </Text>
            </View>

            {/* Movement Status */}
            <View style={[styles.metaRow, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
              <Text style={styles.metaLabel}>{rtl ? 'حالة الحركة الحالية:' : 'Movement State:'}</Text>
              <Text style={[styles.metaValue, { color: movBadge.color, fontWeight: '700' }]}>
                {movBadge.label}
              </Text>
            </View>
          </View>

          {/* Telemetry Card (Explicit Stale vs Live Semantics) */}
          <View style={styles.card}>
            <View style={[styles.telemetryHeaderRow, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
              <Text style={styles.cardSectionTitle}>
                {isOnline
                  ? rtl ? 'بيانات التتبع المباشرة' : 'Live Telemetry'
                  : rtl ? 'آخر بيانات معروفة (تاريخية)' : 'Last Known Telemetry'}
              </Text>
              {!isOnline && (
                <View style={styles.staleNoticePill}>
                  <Text style={styles.staleNoticeText}>{rtl ? 'غير مباشر' : 'Stale'}</Text>
                </View>
              )}
            </View>

            <View style={styles.grid2Col}>
              {/* Speed */}
              <View style={styles.gridCell}>
                <Text style={styles.gridCellLabel}>
                  {isOnline ? rtl ? 'السرعة الحالية' : 'Speed' : rtl ? 'السرعة وقت آخر تحديث' : 'Speed at last update'}
                </Text>
                <Text style={styles.gridCellValue}>
                  {speedKmh != null ? `${formatWesternNumber(speedKmh)} ${t('driverDetail.speedUnit')}` : '—'}
                </Text>
              </View>

              {/* Heading */}
              <View style={styles.gridCell}>
                <Text style={styles.gridCellLabel}>
                  {isOnline ? rtl ? 'الاتجاه' : 'Heading' : rtl ? 'الاتجاه وقت آخر تحديث' : 'Heading at last update'}
                </Text>
                <Text style={styles.gridCellValue}>
                  {driver.location?.heading != null ? `${formatWesternNumber(Math.round(driver.location.heading))}°` : '—'}
                </Text>
              </View>

              {/* Geofence */}
              <View style={styles.gridCell}>
                <Text style={styles.gridCellLabel}>{rtl ? 'نطاق المطعم' : 'Geofence'}</Text>
                <Text
                  style={[
                    styles.gridCellValue,
                    { color: driver.isInsideGeofence ? colors.status.online : colors.status.warning },
                  ]}
                >
                  {driver.isInsideGeofence ? t('driverDetail.insideGeofence') : t('driverDetail.outsideGeofence')}
                </Text>
              </View>

              {/* Distance */}
              <View style={styles.gridCell}>
                <Text style={styles.gridCellLabel}>{rtl ? 'المسافة عن المطعم' : 'Distance'}</Text>
                <Text style={styles.gridCellValue}>
                  {driver.distanceToRestaurantMeters != null
                    ? `~${formatWesternNumber(Math.round(driver.distanceToRestaurantMeters))} ${t('driverDetail.meters')}`
                    : '—'}
                </Text>
              </View>
            </View>
          </View>

          {/* Shift & Device Hardware */}
          <View style={styles.card}>
            <Text style={[styles.cardSectionTitle, { textAlign: rtl ? 'right' : 'left' }]}>
              {rtl ? 'بيانات الوردية والجهاز المعتمد' : 'Shift & Authorized Device'}
            </Text>

            <View style={[styles.metaRow, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
              <Text style={styles.metaLabel}>{rtl ? 'حالة الوردية:' : 'Shift:'}</Text>
              <Text style={[styles.metaValue, { color: driver.shift ? colors.status.online : colors.text.muted, fontWeight: '700' }]}>
                {driver.shift ? t('shift.onDuty') : t('shift.offDuty')}
              </Text>
            </View>

            <View style={[styles.metaRow, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
              <Text style={styles.metaLabel}>{rtl ? 'مستوى البطارية:' : 'Battery:'}</Text>
              <Text style={styles.metaValue}>
                {driver.device?.batteryPercentage != null
                  ? `${formatWesternNumber(driver.device.batteryPercentage)}% ${driver.device.isCharging ? '(شاحن)' : ''}`
                  : '—'}
              </Text>
            </View>

            <View style={[styles.metaRow, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
              <Text style={styles.metaLabel}>{rtl ? 'معرف الجهاز المعتمد:' : 'Device ID:'}</Text>
              <Text style={[styles.metaValue, { fontSize: 10, fontFamily: 'monospace' }]}>
                {driver.device?.deviceIdentifier ? `${driver.device.deviceIdentifier.slice(0, 12)}...` : '—'}
              </Text>
            </View>

            {/* Admin Destructive Action: Reset Device */}
            {isAdmin && (
              <TouchableOpacity
                style={[styles.destructiveResetButton, resetting && styles.disabledButton]}
                onPress={handleResetPress}
                disabled={resetting}
              >
                {resetting ? (
                  <ActivityIndicator color="#ffffff" size="small" />
                ) : (
                  <Text style={styles.destructiveResetText}>{t('admin.resetDevice')}</Text>
                )}
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    alignItems: 'center',
    gap: spacing.md,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  headerTitleGroup: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text.primary,
  },
  headerSub: {
    fontSize: 11,
    color: colors.text.muted,
  },
  scrollContent: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
    ...shadows.card,
  },
  cardSectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text.primary,
  },
  rowBetween: {
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  badgePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.xs,
    borderWidth: 1,
  },
  badgePillText: {
    fontSize: 11,
    fontWeight: '700',
  },
  metaRow: {
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 2,
  },
  metaLabel: {
    fontSize: 12,
    color: colors.text.muted,
  },
  metaValue: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text.primary,
  },
  telemetryHeaderRow: {
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  staleNoticePill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.xs,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  staleNoticeText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.text.muted,
  },
  grid2Col: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: 4,
  },
  gridCell: {
    flexBasis: '48%',
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.sm,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  gridCellLabel: {
    fontSize: 10,
    color: colors.text.muted,
    marginBottom: 2,
  },
  gridCellValue: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text.primary,
  },
  destructiveResetButton: {
    backgroundColor: '#dc2626',
    borderRadius: radius.sm,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  destructiveResetText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  disabledButton: {
    opacity: 0.6,
  },
});
