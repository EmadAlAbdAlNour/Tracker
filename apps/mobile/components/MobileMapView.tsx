import React, { useState, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { formatWesternNumber, isRtl, t } from '../i18n';

export interface MapDriverPoint {
  driverId: string;
  driverName: string;
  employeeId: string;
  operationalStatus: string;
  location?: {
    latitude: number;
    longitude: number;
    speed?: number | null;
    heading?: number | null;
  } | null;
  device?: {
    batteryPercentage?: number | null;
    isCharging?: boolean | null;
  } | null;
  distanceToRestaurantMeters?: number | null;
}

export interface MapRestaurantPoint {
  name: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
  enabled?: boolean;
}

interface MobileMapViewProps {
  restaurant: MapRestaurantPoint;
  drivers: MapDriverPoint[];
  selectedDriverId?: string | null;
  onSelectDriver?: (driver: MapDriverPoint) => void;
  onViewDriverDetail?: (driver: MapDriverPoint) => void;
}

const METERS_PER_DEGREE_LAT = 111320;

export function MobileMapView({
  restaurant,
  drivers,
  selectedDriverId,
  onSelectDriver,
  onViewDriverDetail,
}: MobileMapViewProps): React.JSX.Element {
  const [dimensions, setDimensions] = useState<{ width: number; height: number }>({
    width: 340,
    height: 300,
  });
  const [spanMeters, setSpanMeters] = useState<number>(() =>
    Math.max(1500, (restaurant.radiusMeters || 500) * 3)
  );
  const [centerOffset, setCenterOffset] = useState<{ latOffset: number; lngOffset: number }>({
    latOffset: 0,
    lngOffset: 0,
  });

  const centerLat = restaurant.latitude + centerOffset.latOffset;
  const centerLng = restaurant.longitude + centerOffset.lngOffset;

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width > 0 && height > 0) {
      setDimensions({ width, height });
    }
  };

  const pixelsPerMeter = useMemo(() => {
    const minDim = Math.min(dimensions.width, dimensions.height);
    return minDim / Math.max(200, spanMeters);
  }, [dimensions, spanMeters]);

  const latCos = useMemo(() => {
    return Math.cos((centerLat * Math.PI) / 180);
  }, [centerLat]);

  const projectCoord = (lat: number, lng: number) => {
    const dyMeters = (lat - centerLat) * METERS_PER_DEGREE_LAT;
    const dxMeters = (lng - centerLng) * METERS_PER_DEGREE_LAT * latCos;
    const x = dimensions.width / 2 + dxMeters * pixelsPerMeter;
    const y = dimensions.height / 2 - dyMeters * pixelsPerMeter;
    return { x, y };
  };

  // Zoom controls
  const handleZoomIn = () => {
    setSpanMeters((prev) => Math.max(300, prev * 0.7));
  };

  const handleZoomOut = () => {
    setSpanMeters((prev) => Math.min(50000, prev * 1.4));
  };

  const handleRecenter = () => {
    setCenterOffset({ latOffset: 0, lngOffset: 0 });
    setSpanMeters(Math.max(1500, (restaurant.radiusMeters || 500) * 3));
  };

  // Restaurant projection
  const restPos = projectCoord(restaurant.latitude, restaurant.longitude);
  const geofenceRadiusPx = (restaurant.radiusMeters || 500) * pixelsPerMeter;

  // Selected driver lookup
  const selectedDriver = useMemo(() => {
    if (!selectedDriverId) return null;
    return drivers.find((d) => d.driverId === selectedDriverId) ?? null;
  }, [selectedDriverId, drivers]);

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

  const driversWithLocation = drivers.filter(
    (d) =>
      d.location &&
      typeof d.location.latitude === 'number' &&
      typeof d.location.longitude === 'number'
  );

  return (
    <View style={styles.container}>
      <View style={styles.mapArea} onLayout={onLayout}>
        {/* Radar grid lines */}
        <View
          style={[
            styles.radarCrossH,
            { top: dimensions.height / 2, width: dimensions.width },
          ]}
        />
        <View
          style={[
            styles.radarCrossV,
            { left: dimensions.width / 2, height: dimensions.height },
          ]}
        />

        {/* Geofence Circle */}
        {geofenceRadiusPx > 4 && (
          <View
            style={[
              styles.geofenceCircle,
              {
                left: restPos.x - geofenceRadiusPx,
                top: restPos.y - geofenceRadiusPx,
                width: geofenceRadiusPx * 2,
                height: geofenceRadiusPx * 2,
                borderRadius: geofenceRadiusPx,
              },
            ]}
          />
        )}

        {/* Restaurant Base Pin */}
        <View
          style={[
            styles.restaurantPin,
            {
              left: restPos.x - 16,
              top: restPos.y - 16,
            },
          ]}
        >
          <Text style={styles.restaurantIcon}>🏠</Text>
        </View>

        {/* Driver Markers */}
        {driversWithLocation.map((driver) => {
          const pos = projectCoord(driver.location!.latitude, driver.location!.longitude);
          const isSelected = driver.driverId === selectedDriverId;
          const statusColor = getStatusColor(driver.operationalStatus);
          const heading = driver.location?.heading ?? 0;

          // Only render if in or near visible bounds
          if (
            pos.x < -30 ||
            pos.x > dimensions.width + 30 ||
            pos.y < -30 ||
            pos.y > dimensions.height + 30
          ) {
            return null;
          }

          return (
            <TouchableOpacity
              key={driver.driverId}
              activeOpacity={0.7}
              onPress={() => onSelectDriver?.(driver)}
              style={[
                styles.driverMarkerContainer,
                {
                  left: pos.x - 14,
                  top: pos.y - 14,
                  transform: [{ scale: isSelected ? 1.25 : 1.0 }],
                  zIndex: isSelected ? 50 : 20,
                },
              ]}
            >
              <View
                style={[
                  styles.driverDot,
                  {
                    backgroundColor: statusColor,
                    borderColor: isSelected ? '#ffffff' : '#f8fafc',
                  },
                ]}
              >
                {driver.operationalStatus === 'MOVING' && heading != null ? (
                  <Text
                    style={[
                      styles.headingArrow,
                      { transform: [{ rotate: `${heading}deg` }] },
                    ]}
                  >
                    ▲
                  </Text>
                ) : (
                  <View style={styles.innerDot} />
                )}
              </View>
              <Text style={styles.markerLabel} numberOfLines={1}>
                {driver.driverName.split(' ')[0]}
              </Text>
            </TouchableOpacity>
          );
        })}

        {/* Map Controls */}
        <View style={[styles.controls, rtl ? { left: 12 } : { right: 12 }]}>
          <TouchableOpacity style={styles.controlButton} onPress={handleZoomIn}>
            <Text style={styles.controlButtonText}>+</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.controlButton} onPress={handleZoomOut}>
            <Text style={styles.controlButtonText}>−</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.controlButton} onPress={handleRecenter}>
            <Text style={styles.controlIconText}>🎯</Text>
          </TouchableOpacity>
        </View>

        {/* Legend / Range overlay */}
        <View style={[styles.rangeBadge, rtl ? { right: 12 } : { left: 12 }]}>
          <Text style={styles.rangeText}>
            ~{formatWesternNumber(Math.round(spanMeters / 2))} {t('driverDetail.meters')}
          </Text>
        </View>
      </View>

      {/* Selected Driver Drawer */}
      {selectedDriver ? (
        <View style={styles.driverInfoCard}>
          <View style={styles.driverInfoHeader}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.driverInfoName, { textAlign: rtl ? 'right' : 'left' }]}>
                {selectedDriver.driverName}
              </Text>
              <Text style={[styles.driverInfoSub, { textAlign: rtl ? 'right' : 'left' }]}>
                {t('diagnostics.employeeId')} {formatWesternNumber(selectedDriver.employeeId)}
              </Text>
            </View>
            <View
              style={[
                styles.statusBadge,
                { backgroundColor: getStatusColor(selectedDriver.operationalStatus) + '20' },
              ]}
            >
              <Text
                style={[
                  styles.statusBadgeText,
                  { color: getStatusColor(selectedDriver.operationalStatus) },
                ]}
              >
                {t(`operator.${selectedDriver.operationalStatus.toLowerCase()}`) ||
                  selectedDriver.operationalStatus}
              </Text>
            </View>
          </View>

          <View style={styles.driverInfoRow}>
            {selectedDriver.location?.speed != null && (
              <Text style={styles.driverMetric}>
                🚀 {formatWesternNumber(Math.round(selectedDriver.location.speed * 3.6))}{' '}
                {t('driverDetail.speedUnit')}
              </Text>
            )}
            {selectedDriver.device?.batteryPercentage != null && (
              <Text style={styles.driverMetric}>
                🔋 {formatWesternNumber(selectedDriver.device.batteryPercentage)}%
                {selectedDriver.device.isCharging ? ' ⚡' : ''}
              </Text>
            )}
            {selectedDriver.distanceToRestaurantMeters != null && (
              <Text style={styles.driverMetric}>
                📍 {formatWesternNumber(Math.round(selectedDriver.distanceToRestaurantMeters))}{' '}
                {t('driverDetail.meters')}
              </Text>
            )}
          </View>

          {onViewDriverDetail && (
            <TouchableOpacity
              style={styles.detailButton}
              onPress={() => onViewDriverDetail(selectedDriver)}
            >
              <Text style={styles.detailButtonText}>{t('map.viewDetails')}</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <View style={styles.hintContainer}>
          <Text style={styles.hintText}>{t('map.selectDriverPrompt')}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#334155',
    marginVertical: 10,
  },
  mapArea: {
    height: 320,
    width: '100%',
    backgroundColor: '#090d16',
    position: 'relative',
    overflow: 'hidden',
  },
  radarCrossH: {
    position: 'absolute',
    height: 1,
    backgroundColor: 'rgba(51, 65, 85, 0.4)',
  },
  radarCrossV: {
    position: 'absolute',
    width: 1,
    backgroundColor: 'rgba(51, 65, 85, 0.4)',
  },
  geofenceCircle: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: 'rgba(2, 132, 199, 0.6)',
    backgroundColor: 'rgba(2, 132, 199, 0.1)',
    borderStyle: 'dashed',
  },
  restaurantPin: {
    position: 'absolute',
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#0284c7',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#ffffff',
    shadowColor: '#0284c7',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
    elevation: 4,
    zIndex: 10,
  },
  restaurantIcon: {
    fontSize: 16,
  },
  driverMarkerContainer: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    width: 28,
    height: 28,
  },
  driverDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 3,
    elevation: 5,
  },
  innerDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ffffff',
  },
  headingArrow: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  markerLabel: {
    fontSize: 9,
    color: '#cbd5e1',
    fontWeight: 'bold',
    backgroundColor: 'rgba(15, 23, 42, 0.8)',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
    marginTop: 2,
  },
  controls: {
    position: 'absolute',
    top: 12,
    gap: 8,
    zIndex: 40,
  },
  controlButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(30, 41, 59, 0.9)',
    borderWidth: 1,
    borderColor: '#475569',
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlButtonText: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: 'bold',
    lineHeight: 22,
  },
  controlIconText: {
    fontSize: 16,
  },
  rangeBadge: {
    position: 'absolute',
    bottom: 12,
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#334155',
  },
  rangeText: {
    fontSize: 11,
    color: '#94a3b8',
    fontWeight: '600',
  },
  driverInfoCard: {
    padding: 16,
    backgroundColor: '#1e293b',
    borderTopWidth: 1,
    borderTopColor: '#334155',
  },
  driverInfoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  driverInfoName: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  driverInfoSub: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: 'bold',
  },
  driverInfoRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginVertical: 8,
  },
  driverMetric: {
    fontSize: 12,
    color: '#e2e8f0',
  },
  detailButton: {
    marginTop: 8,
    backgroundColor: '#059669',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  detailButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  hintContainer: {
    padding: 12,
    backgroundColor: '#1e293b',
    alignItems: 'center',
  },
  hintText: {
    fontSize: 12,
    color: '#94a3b8',
  },
});

