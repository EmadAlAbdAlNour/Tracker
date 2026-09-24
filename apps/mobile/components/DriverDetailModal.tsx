// Rebuilt Driver Operational Profile Modal
// Explicit Freshness Semantics, Connection vs Movement Separation, Zero-Emoji

import React, { useState } from 'react';
import {
  ActivityIndicator,
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
import { TrackerDialog } from './TrackerDialog';
import { formatWesternNumber, isRtl, t } from '../i18n';

interface DriverDetailModalProps {
  visible: boolean;
  driver: any | null;
  isAdmin: boolean;
  onClose: () => void;
  onDeviceReset?: (driverId: string) => Promise<void>;
  onForceEndShift?: (driverId: string) => Promise<void>;
}

export function DriverDetailModal({
  visible,
  driver,
  isAdmin,
  onClose,
  onDeviceReset,
  onForceEndShift,
}: DriverDetailModalProps): React.JSX.Element {
  const [resetting, setResetting] = useState(false);
  const [forceEnding, setForceEnding] = useState(false);
  const [dialogConfig, setDialogConfig] = useState<{
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
  }>({
    visible: false,
    title: '',
    message: '',
  });

  if (!driver) return <></>;

  const rtl = isRtl();

  // Freshness & Connection vs Movement Logic
  const hasActiveShift = Boolean(driver.shift && (driver.shift.status === 'ACTIVE' || !driver.shift.status));
  const hasLocation = Boolean(driver.location && (driver.location.latitude != null || driver.location.longitude != null));
  const isAwaitingTelemetry = hasActiveShift && !hasLocation;

  const isOnline = driver.operationalStatus !== 'OFFLINE';
  const recordedAtMs = driver.location?.recordedAt ? new Date(driver.location.recordedAt).getTime() : 0;
  const elapsedMinutes = recordedAtMs > 0 ? Math.max(0, Math.round((Date.now() - recordedAtMs) / 60000)) : null;

  // Connection State: Online / Delayed / Offline / Awaiting
  const connectionState = isAwaitingTelemetry
    ? 'awaiting'
    : !isOnline
    ? 'offline'
    : elapsedMinutes != null && elapsedMinutes > 5
    ? 'delayed'
    : 'online';

  // Movement State: Moving / Stopped / Unknown
  const speedKmh =
    driver.location?.speed != null ? Math.round(Number(driver.location.speed) * 3.6) : null;
  const movementState = isAwaitingTelemetry || !isOnline
    ? 'unknown'
    : speedKmh != null && speedKmh > 3
    ? 'moving'
    : 'stopped';

  const getConnectionBadge = () => {
    switch (connectionState) {
      case 'awaiting':
        return {
          label: rtl ? 'في الوردية — بانتظار بيانات الموقع' : 'On shift — awaiting location data',
          bg: colors.status.warningBg,
          text: colors.status.warning,
          border: colors.status.warningBorder,
        };
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
    setDialogConfig({
      visible: true,
      title: t('admin.confirmResetTitle'),
      message: t('admin.confirmResetMessage'),
      type: 'warning',
      isDestructive: true,
      primaryButtonText: t('admin.resetDevice'),
      secondaryButtonText: t('app.cancel'),
      onSecondaryPress: () => setDialogConfig((prev) => ({ ...prev, visible: false })),
      onPrimaryPress: async () => {
        if (!onDeviceReset) return;
        setResetting(true);
        setDialogConfig((prev) => ({ ...prev, loading: true }));
        try {
          await onDeviceReset(driver.driverId);
          setDialogConfig({
            visible: true,
            title: t('app.notice'),
            message: t('admin.resetSuccess'),
            type: 'success',
            primaryButtonText: t('app.ok'),
            onPrimaryPress: () => setDialogConfig((prev) => ({ ...prev, visible: false })),
          });
        } catch (err: any) {
          setDialogConfig({
            visible: true,
            title: t('app.error'),
            message: err?.message || t('admin.resetFailed'),
            type: 'error',
            primaryButtonText: t('app.ok'),
            onPrimaryPress: () => setDialogConfig((prev) => ({ ...prev, visible: false })),
          });
        } finally {
          setResetting(false);
        }
      },
    });
  };

  const handleForceEndPress = () => {
    setDialogConfig({
      visible: true,
      title: rtl ? 'إنهاء وردية السائق إجبارياً' : 'Force End Driver Shift',
      message: rtl
        ? 'هل أنت متأكد من إنهاء وردية هذا السائق قسراً؟ سيتم إيقاف تتبع الوردية وحل كافة التنبيهات المرتبطة به.'
        : "Are you sure you want to force end this driver's shift? Active tracking will stop and any ongoing alerts will be resolved.",
      type: 'warning',
      isDestructive: true,
      primaryButtonText: rtl ? 'إنهاء الوردية' : 'Force End Shift',
      secondaryButtonText: t('app.cancel'),
      onSecondaryPress: () => setDialogConfig((prev) => ({ ...prev, visible: false })),
      onPrimaryPress: async () => {
        if (!onForceEndShift) return;
        setForceEnding(true);
        setDialogConfig((prev) => ({ ...prev, loading: true }));
        try {
          await onForceEndShift(driver.driverId);
          setDialogConfig({
            visible: true,
            title: t('app.notice'),
            message: rtl ? 'تم إنهاء وردية السائق بنجاح' : 'Driver shift ended successfully',
            type: 'success',
            primaryButtonText: t('app.ok'),
            onPrimaryPress: () => {
              setDialogConfig((prev) => ({ ...prev, visible: false }));
              onClose();
            },
          });
        } catch (err: any) {
          setDialogConfig({
            visible: true,
            title: t('app.error'),
            message: err?.message || (rtl ? 'تعذر إنهاء الوردية' : 'Failed to end shift'),
            type: 'error',
            primaryButtonText: t('app.ok'),
            onPrimaryPress: () => setDialogConfig((prev) => ({ ...prev, visible: false })),
          });
        } finally {
          setForceEnding(false);
        }
      },
    });
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
                {isAwaitingTelemetry
                  ? rtl ? 'لا توجد بيانات موقع مسجلة' : 'No telemetry recorded'
                  : elapsedMinutes != null
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
                {isAwaitingTelemetry
                  ? rtl ? 'في انتظار أول إشارة موقع' : 'Awaiting Initial Location Signal'
                  : isOnline
                  ? rtl ? 'بيانات التتبع المباشرة' : 'Live Telemetry'
                  : rtl ? 'آخر بيانات معروفة (تاريخية)' : 'Last Known Telemetry'}
              </Text>
              {isAwaitingTelemetry ? (
                <View style={styles.staleNoticePill}>
                  <Text style={styles.staleNoticeText}>{rtl ? 'قيد الانتظار' : 'Pending'}</Text>
                </View>
              ) : !isOnline ? (
                <View style={styles.staleNoticePill}>
                  <Text style={styles.staleNoticeText}>{rtl ? 'غير مباشر' : 'Stale'}</Text>
                </View>
              ) : null}
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
                    {
                      color: isAwaitingTelemetry
                        ? colors.text.muted
                        : driver.isInsideGeofence
                        ? colors.status.online
                        : colors.status.warning,
                    },
                  ]}
                >
                  {isAwaitingTelemetry
                    ? rtl ? 'بانتظار تحديد الموقع' : 'Awaiting location'
                    : driver.isInsideGeofence
                    ? t('driverDetail.insideGeofence')
                    : t('driverDetail.outsideGeofence')}
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

            {/* Admin Destructive Action: Force End Active Shift */}
            {isAdmin && driver.shift && (driver.shift.status === 'ACTIVE' || !driver.shift.status) && (
              <TouchableOpacity
                style={[styles.destructiveForceEndButton, (forceEnding || resetting) && styles.disabledButton]}
                onPress={handleForceEndPress}
                disabled={forceEnding || resetting}
              >
                {forceEnding ? (
                  <ActivityIndicator color="#ffffff" size="small" />
                ) : (
                  <Text style={styles.destructiveForceEndText}>
                    {rtl ? 'إنهاء وردية السائق إجبارياً' : 'Force End Driver Shift'}
                  </Text>
                )}
              </TouchableOpacity>
            )}

            {/* Admin Destructive Action: Reset Device */}
            {isAdmin && (
              <TouchableOpacity
                style={[styles.destructiveResetButton, (resetting || forceEnding) && styles.disabledButton]}
                onPress={handleResetPress}
                disabled={resetting || forceEnding}
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

        <TrackerDialog
          visible={dialogConfig.visible}
          title={dialogConfig.title}
          message={dialogConfig.message}
          type={dialogConfig.type}
          primaryButtonText={dialogConfig.primaryButtonText}
          secondaryButtonText={dialogConfig.secondaryButtonText}
          onPrimaryPress={dialogConfig.onPrimaryPress}
          onSecondaryPress={dialogConfig.onSecondaryPress}
          isDestructive={dialogConfig.isDestructive}
          loading={dialogConfig.loading}
          onClose={() => setDialogConfig((prev) => ({ ...prev, visible: false }))}
        />
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
  destructiveForceEndButton: {
    backgroundColor: '#d97706',
    borderRadius: radius.sm,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  destructiveForceEndText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
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
