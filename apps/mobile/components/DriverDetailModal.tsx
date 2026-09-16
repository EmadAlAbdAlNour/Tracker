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

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'MOVING':
        return '#059669';
      case 'STOPPED':
        return '#d97706';
      case 'AT_RESTAURANT':
        return '#0284c7';
      case 'OFFLINE':
      default:
        return '#64748b';
    }
  };

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

  const speedKmh =
    driver.location?.speed != null
      ? Math.round(Number(driver.location.speed) * 3.6)
      : null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.modalContainer}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Text style={styles.closeButtonText}>✕</Text>
          </TouchableOpacity>
          <View style={styles.headerTitleGroup}>
            <Text style={styles.headerTitle}>{driver.driverName}</Text>
            <Text style={styles.headerSub}>
              {t('diagnostics.employeeId')} {formatWesternNumber(driver.employeeId)}
            </Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent}>
          {/* Status Badge Card */}
          <View style={styles.card}>
            <View style={styles.statusRow}>
              <Text style={styles.sectionTitle}>{t('driverDetail.status')}</Text>
              <View
                style={[
                  styles.statusBadge,
                  { backgroundColor: getStatusColor(driver.operationalStatus) + '20' },
                ]}
              >
                <Text
                  style={[
                    styles.statusBadgeText,
                    { color: getStatusColor(driver.operationalStatus) },
                  ]}
                >
                  {t(`operator.${driver.operationalStatus.toLowerCase()}`) ||
                    driver.operationalStatus}
                </Text>
              </View>
            </View>

            {driver.isInsideGeofence != null && (
              <View style={styles.infoRow}>
                <Text style={styles.label}>{t('map.geofenceBoundary')}:</Text>
                <Text
                  style={[
                    styles.value,
                    driver.isInsideGeofence ? styles.textGreen : styles.textOrange,
                  ]}
                >
                  {driver.isInsideGeofence
                    ? t('driverDetail.insideGeofence')
                    : t('driverDetail.outsideGeofence')}
                </Text>
              </View>
            )}

            {driver.distanceToRestaurantMeters != null && (
              <View style={styles.infoRow}>
                <Text style={styles.label}>{t('driverDetail.distanceToRestaurant')}:</Text>
                <Text style={styles.value}>
                  {formatWesternNumber(Math.round(driver.distanceToRestaurantMeters))}{' '}
                  {t('driverDetail.meters')}
                </Text>
              </View>
            )}
          </View>

          {/* Telemetry Card */}
          <View style={styles.card}>
            <Text style={[styles.sectionTitle, { textAlign: rtl ? 'right' : 'left' }]}>
              {t('driverDetail.telemetry')}
            </Text>

            <View style={styles.infoRow}>
              <Text style={styles.label}>{t('driverDetail.speed')}:</Text>
              <Text style={styles.value}>
                {speedKmh != null
                  ? `${formatWesternNumber(speedKmh)} ${t('driverDetail.speedUnit')}`
                  : '—'}
              </Text>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.label}>{t('driverDetail.heading')}:</Text>
              <Text style={styles.value}>
                {driver.location?.heading != null
                  ? `${formatWesternNumber(Math.round(driver.location.heading))}°`
                  : '—'}
              </Text>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.label}>{t('driverDetail.accuracy')}:</Text>
              <Text style={styles.value}>
                {driver.location?.accuracy != null
                  ? `±${formatWesternNumber(Math.round(driver.location.accuracy))} ${t('driverDetail.meters')}`
                  : '—'}
              </Text>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.label}>{t('admin.lastLocationAt')}:</Text>
              <Text style={styles.value}>
                {driver.location?.recordedAt
                  ? new Date(driver.location.recordedAt).toLocaleTimeString()
                  : t('admin.never')}
              </Text>
            </View>
          </View>

          {/* Shift Details Card */}
          <View style={styles.card}>
            <Text style={[styles.sectionTitle, { textAlign: rtl ? 'right' : 'left' }]}>
              {t('shift.title')}
            </Text>
            {driver.shift ? (
              <>
                <View style={styles.infoRow}>
                  <Text style={styles.label}>{t('driverDetail.status')}:</Text>
                  <Text style={[styles.value, styles.textGreen]}>{t('shift.onDuty')}</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.label}>{t('driverDetail.shiftDuration')}:</Text>
                  <Text style={styles.value}>
                    {formatWesternNumber(driver.shift.durationMinutes ?? 0)} دقيقة / min
                  </Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.label}>بدء الوردية:</Text>
                  <Text style={styles.value}>
                    {new Date(driver.shift.startedAt).toLocaleTimeString()}
                  </Text>
                </View>
              </>
            ) : (
              <Text style={styles.emptyText}>{t('driverDetail.noShift')}</Text>
            )}
          </View>

          {/* Device & Hardware Card */}
          <View style={styles.card}>
            <Text style={[styles.sectionTitle, { textAlign: rtl ? 'right' : 'left' }]}>
              {t('driverDetail.deviceInfo')}
            </Text>

            <View style={styles.infoRow}>
              <Text style={styles.label}>{t('driverDetail.battery')}:</Text>
              <Text
                style={[
                  styles.value,
                  driver.device?.batteryPercentage != null &&
                  driver.device.batteryPercentage <= 20
                    ? styles.textRed
                    : undefined,
                ]}
              >
                {driver.device?.batteryPercentage != null
                  ? `${formatWesternNumber(driver.device.batteryPercentage)}% ${
                      driver.device.isCharging
                        ? `(⚡ ${t('driverDetail.charging')})`
                        : `(${t('driverDetail.notCharging')})`
                    }`
                  : '—'}
              </Text>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.label}>{t('driverDetail.network')}:</Text>
              <Text style={styles.value}>
                {driver.device?.networkStatus
                  ? driver.device.networkStatus.toUpperCase()
                  : '—'}
              </Text>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.label}>{t('admin.platform')}:</Text>
              <Text style={styles.value}>{driver.device?.platform ?? '—'}</Text>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.label}>{t('admin.appVersion')}:</Text>
              <Text style={styles.value}>{driver.device?.appVersion ?? '—'}</Text>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.label}>{t('admin.activeStatus')}:</Text>
              <Text
                style={[
                  styles.value,
                  driver.device?.authorized !== false ? styles.textGreen : styles.textRed,
                ]}
              >
                {driver.device?.authorized !== false
                  ? t('admin.authorized')
                  : t('admin.unauthorized')}
              </Text>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.label}>{t('operator.lastSeen')}:</Text>
              <Text style={styles.value}>
                {driver.device?.lastSeen
                  ? new Date(driver.device.lastSeen).toLocaleTimeString()
                  : t('admin.never')}
              </Text>
            </View>

            {/* ADMIN ONLY: Device Reset Button */}
            {isAdmin && (
              <TouchableOpacity
                style={[styles.resetButton, resetting && styles.disabledButton]}
                onPress={handleResetPress}
                disabled={resetting}
              >
                {resetting ? (
                  <ActivityIndicator color="#ffffff" size="small" />
                ) : (
                  <Text style={styles.resetButtonText}>
                    {t('driverDetail.resetDeviceAction')}
                  </Text>
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
    backgroundColor: '#f8fafc',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  closeButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#475569',
  },
  headerTitleGroup: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#0f172a',
  },
  headerSub: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
    gap: 12,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#0f172a',
    marginBottom: 10,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#f8fafc',
  },
  label: {
    fontSize: 13,
    color: '#64748b',
  },
  value: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0f172a',
  },
  textGreen: {
    color: '#059669',
  },
  textOrange: {
    color: '#d97706',
  },
  textRed: {
    color: '#e11d48',
  },
  emptyText: {
    fontSize: 13,
    color: '#94a3b8',
    paddingVertical: 8,
  },
  resetButton: {
    marginTop: 16,
    backgroundColor: '#dc2626',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  resetButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: 'bold',
  },
  disabledButton: {
    opacity: 0.6,
  },
});

