// Real Geographic Fleet Map for Tracker Mobile
// Powered by Leaflet + OpenStreetMap via WebView with Native Touch Gestures

import React, { useRef, useMemo, useEffect, useCallback } from 'react';
import { StyleSheet, Text, TouchableOpacity, View, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';
import { colors, radius, shadows, spacing } from '../designSystem';
import { AppIcon } from './AppIcon';
import { formatTimeAgo, formatWesternNumber, isRtl, t } from '../i18n';

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
    accuracy?: number | null;
    recordedAt?: string | null;
  } | null;
  device?: {
    batteryPercentage?: number | null;
    isCharging?: boolean | null;
  } | null;
  distanceToRestaurantMeters?: number | null;
  isInsideGeofence?: boolean | null;
}

export interface MapRestaurantPoint {
  name: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
  enabled?: boolean;
}

interface RealGeographicMapViewProps {
  restaurant: MapRestaurantPoint;
  drivers: MapDriverPoint[];
  selectedDriverId?: string | null;
  driverFocusTrigger?: number;
  onSelectDriver?: (driver: MapDriverPoint) => void;
  onViewDriverDetail?: (driver: MapDriverPoint) => void;
  height?: number | string;
  isCompactPreview?: boolean;
}

export function RealGeographicMapView({
  restaurant,
  drivers,
  selectedDriverId,
  driverFocusTrigger,
  onSelectDriver,
  onViewDriverDetail,
  height = '100%',
  isCompactPreview = false,
}: RealGeographicMapViewProps): React.JSX.Element {
  const webViewRef = useRef<WebView>(null);
  const rtl = isRtl();
  const isWebViewReadyRef = useRef(false);

  // Find selected driver object
  const selectedDriver = useMemo(() => {
    if (!selectedDriverId) return null;
    return drivers.find((d) => d.driverId === selectedDriverId) ?? null;
  }, [drivers, selectedDriverId]);

  const serializedDrivers = useMemo(() => {
    return drivers.map((d) => ({
      driverId: d.driverId,
      driverName: d.driverName,
      employeeId: d.employeeId,
      status: d.operationalStatus,
      isOffline: d.operationalStatus === 'OFFLINE',
      lat: d.location?.latitude,
      lng: d.location?.longitude,
      speed: d.location?.speed,
      heading: d.location?.heading,
      battery: d.device?.batteryPercentage,
      isSelected: d.driverId === selectedDriverId,
    }));
  }, [drivers, selectedDriverId]);

  // Generate static base HTML for Leaflet Map (does not reload on driver updates)
  const mapHtml = useMemo(() => {
    const restaurantJson = JSON.stringify(restaurant);
    const isRtlLang = rtl;

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body, #map { width: 100%; height: 100%; background: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    .driver-pin {
      display: flex;
      flex-direction: column;
      align-items: center;
      cursor: pointer;
    }
    .pin-circle {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 2px 6px rgba(0,0,0,0.3);
      border: 2px solid #ffffff;
      color: #ffffff;
      font-size: 11px;
      font-weight: 800;
    }
    .pin-circle.offline {
      background: #64748b !important;
      border: 2px dashed #cbd5e1 !important;
      opacity: 0.75;
      box-shadow: 0 1px 3px rgba(0,0,0,0.2);
    }
    .pin-label {
      background: rgba(15, 23, 42, 0.85);
      color: #ffffff;
      font-size: 10px;
      font-weight: 700;
      padding: 1px 6px;
      border-radius: 4px;
      margin-top: 2px;
      white-space: nowrap;
      box-shadow: 0 1px 3px rgba(0,0,0,0.2);
      text-align: center;
    }
    .pin-label.offline {
      background: rgba(51, 65, 85, 0.85);
      opacity: 0.85;
      font-size: 9px;
    }
    .pin-sublabel-offline {
      font-size: 8px;
      font-weight: 500;
      color: #cbd5e1;
      display: block;
      margin-top: 1px;
    }
    .restaurant-pin {
      background: #0f766e;
      border: 2px solid #ffffff;
      border-radius: 6px;
      padding: 3px 6px;
      color: #ffffff;
      font-size: 11px;
      font-weight: bold;
      box-shadow: 0 2px 6px rgba(0,0,0,0.3);
      display: flex;
      align-items: center;
      gap: 4px;
      white-space: nowrap;
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    const restaurant = ${restaurantJson};
    const isRtlLang = ${isRtlLang};

    const map = L.map('map', {
      zoomControl: false,
      attributionControl: false
    }).setView([restaurant.latitude, restaurant.longitude], 14);

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19
    }).addTo(map);

    // Geofence circle
    const geofenceCircle = L.circle([restaurant.latitude, restaurant.longitude], {
      color: '#0f766e',
      fillColor: '#0f766e',
      fillOpacity: 0.12,
      weight: 2,
      dashArray: '6, 6',
      radius: restaurant.radiusMeters || 500
    }).addTo(map);

    // Restaurant marker
    const restIcon = L.divIcon({
      className: '',
      html: '<div class="restaurant-pin">⌂ ' + (restaurant.name || 'Base') + '</div>',
      iconSize: [80, 26],
      iconAnchor: [40, 13]
    });
    L.marker([restaurant.latitude, restaurant.longitude], { icon: restIcon }).addTo(map);

    // Color helper
    function getStatusColor(status) {
      switch (status) {
        case 'MOVING': return '#059669';
        case 'STOPPED': return '#d97706';
        case 'AT_RESTAURANT': return '#0284c7';
        case 'OFFLINE': default: return '#64748b';
      }
    }

    function buildDriverIcon(d) {
      const isOffline = d.isOffline || d.status === 'OFFLINE';
      const color = getStatusColor(d.status);

      let borderStyle = 'border: 2px solid #ffffff;';
      if (d.isSelected) {
        borderStyle = isOffline
          ? 'border: 3px dashed #0f172a; transform: scale(1.15);'
          : 'border: 3px solid #0f172a; transform: scale(1.15);';
      } else if (isOffline) {
        borderStyle = 'border: 2px dashed #cbd5e1;';
      }

      const circleContent = isOffline
        ? '⊘'
        : (d.speed != null && d.speed > 0 ? Math.round(d.speed * 3.6) : '●');

      const circleClass = isOffline ? 'pin-circle offline' : 'pin-circle';
      const labelClass = isOffline ? 'pin-label offline' : 'pin-label';
      const staleLabel = isOffline
        ? '<span class="pin-sublabel-offline">' + (isRtlLang ? 'آخر موقع معروف' : 'Last Known') + '</span>'
        : '';

      return L.divIcon({
        className: '',
        html: '<div class="driver-pin' + (isOffline ? ' offline-pin' : '') + '" onclick="selectDriver(\\'' + d.driverId + '\\')">' +
                '<div class="' + circleClass + '" style="background:' + color + ';' + borderStyle + '">' +
                  circleContent +
                '</div>' +
                '<div class="' + labelClass + '">' +
                  d.driverName + staleLabel +
                '</div>' +
              '</div>',
        iconSize: isOffline ? [72, 54] : [60, 48],
        iconAnchor: isOffline ? [36, 27] : [30, 24]
      });
    }

    const driverMarkers = {};
    let currentBounds = L.latLngBounds([[restaurant.latitude, restaurant.longitude]]);

    window.updateFleetDrivers = function(driverList) {
      if (!Array.isArray(driverList)) return;
      const incomingIds = new Set();
      currentBounds = L.latLngBounds([[restaurant.latitude, restaurant.longitude]]);

      driverList.forEach(function(d) {
        if (d.lat && d.lng) {
          incomingIds.add(d.driverId);
          currentBounds.extend([d.lat, d.lng]);

          const icon = buildDriverIcon(d);
          const existingMarker = driverMarkers[d.driverId];

          if (existingMarker) {
            existingMarker.setLatLng([d.lat, d.lng]);
            existingMarker.setIcon(icon);
          } else {
            const marker = L.marker([d.lat, d.lng], { icon: icon }).addTo(map);
            marker.on('click', function() { selectDriver(d.driverId); });
            driverMarkers[d.driverId] = marker;
          }
        }
      });

      // Clean up removed drivers
      Object.keys(driverMarkers).forEach(function(id) {
        if (!incomingIds.has(id)) {
          map.removeLayer(driverMarkers[id]);
          delete driverMarkers[id];
        }
      });
    };

    function selectDriver(driverId) {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'SELECT_DRIVER',
          driverId: driverId
        }));
      }
    }

    // Methods accessible via postMessage from React Native
    window.mapZoomIn = () => map.zoomIn();
    window.mapZoomOut = () => map.zoomOut();
    window.mapRecenter = () => map.setView([restaurant.latitude, restaurant.longitude], 14);
    window.mapFitFleet = () => {
      if (currentBounds.isValid()) {
        map.fitBounds(currentBounds.pad(0.15));
      }
    };
    window.mapFocusDriver = (lat, lng) => map.setView([lat, lng], 16);

    // Notify React Native that Leaflet DOM is fully loaded and ready for initial driver stream
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'MAP_READY' }));
    }
  </script>
</body>
</html>`;
  }, [restaurant.latitude, restaurant.longitude, restaurant.radiusMeters, restaurant.name, rtl]);

  // Memoize WebView source object to prevent native Android reloads on fleet polling re-renders
  const webViewSource = useMemo(() => ({ html: mapHtml }), [mapHtml]);
  const lastHandledDriverFocusTriggerRef = useRef(0);

  const sendDriversUpdate = useCallback(() => {
    if (webViewRef.current && isWebViewReadyRef.current) {
      const payload = JSON.stringify(serializedDrivers);
      webViewRef.current.injectJavaScript(
        `if (window.updateFleetDrivers) { window.updateFleetDrivers(${payload}); } true;`
      );
    }
  }, [serializedDrivers]);

  useEffect(() => {
    sendDriversUpdate();
  }, [sendDriversUpdate]);

  // Handle messages from WebView
  const handleMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'MAP_READY') {
        isWebViewReadyRef.current = true;
        sendDriversUpdate();
        return;
      }
      if (data.type === 'SELECT_DRIVER') {
        const found = drivers.find((d) => d.driverId === data.driverId);
        if (found && onSelectDriver) {
          onSelectDriver(found);
        }
      }
    } catch {
      // ignore
    }
  };

  // Trigger webview methods
  const runWebViewJs = (jsCode: string) => {
    webViewRef.current?.injectJavaScript(`${jsCode}; true;`);
  };

  const handleZoomIn = () => runWebViewJs('window.mapZoomIn()');
  const handleZoomOut = () => runWebViewJs('window.mapZoomOut()');
  const handleRecenter = () => runWebViewJs('window.mapRecenter()');
  const handleFitFleet = () => runWebViewJs('window.mapFitFleet()');

  // Focus driver camera ONLY when driverFocusTrigger explicitly increments
  useEffect(() => {
    if (
      driverFocusTrigger != null &&
      driverFocusTrigger > lastHandledDriverFocusTriggerRef.current &&
      selectedDriver?.location?.latitude &&
      selectedDriver?.location?.longitude
    ) {
      lastHandledDriverFocusTriggerRef.current = driverFocusTrigger;
      runWebViewJs(
        `window.mapFocusDriver(${selectedDriver.location.latitude}, ${selectedDriver.location.longitude})`
      );
    }
  }, [driverFocusTrigger, selectedDriver]);

  const connectedDriverCount = drivers.filter(
    (d) => d.operationalStatus !== 'OFFLINE' && d.location?.latitude && d.location?.longitude
  ).length;

  return (
    <View style={[styles.container, { height: height as any }]}>
      {/* WebView Map Container */}
      <WebView
        ref={webViewRef}
        originWhitelist={['*']}
        source={webViewSource}
        style={styles.webView}
        onMessage={handleMessage}
        javaScriptEnabled
        domStorageEnabled
        startInLoadingState
        renderLoading={() => (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={styles.loadingText}>
              {rtl ? 'جاري تحميل الخريطة الميدانية...' : 'Loading GIS Fleet Map...'}
            </Text>
          </View>
        )}
      />

      {/* Floating Compact Controls (Zoom & Recenter) */}
      {!isCompactPreview && (
        <View style={[styles.controlsColumn, rtl ? { left: spacing.md } : { right: spacing.md }]}>
          <TouchableOpacity style={styles.controlButton} onPress={handleZoomIn} accessibilityLabel="Zoom In">
            <AppIcon name="plus" size={14} color={colors.text.primary} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.controlButton} onPress={handleZoomOut} accessibilityLabel="Zoom Out">
            <AppIcon name="minus" size={14} color={colors.text.primary} />
          </TouchableOpacity>

          <View style={styles.controlDivider} />

          <TouchableOpacity
            style={styles.controlButton}
            onPress={handleRecenter}
            accessibilityLabel="Recenter on Restaurant"
          >
            <AppIcon name="target" size={16} color={colors.primary} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.controlButton}
            onPress={handleFitFleet}
            accessibilityLabel="Fit Fleet"
          >
            <AppIcon name="driver" size={16} color={colors.text.secondary} />
          </TouchableOpacity>
        </View>
      )}

      {/* Floating Status Pill (Top overlay) */}
      <View style={[styles.statusOverlay, rtl ? { right: spacing.md } : { left: spacing.md }]}>
        <View
          style={[
            styles.statusDot,
            { backgroundColor: connectedDriverCount > 0 ? colors.status.online : colors.text.muted },
          ]}
        />
        <Text style={styles.statusOverlayText}>
          {rtl
            ? `${formatWesternNumber(connectedDriverCount)} ${connectedDriverCount === 1 ? 'سائق متصل بالخريطة' : 'سائقين متصلين بالخريطة'}`
            : `${formatWesternNumber(connectedDriverCount)} ${connectedDriverCount === 1 ? 'Driver Connected on Map' : 'Drivers Connected on Map'}`}
        </Text>
      </View>

      {/* Selected Driver Inspection Card (Bottom overlay) */}
      {selectedDriver && !isCompactPreview && (
        <View style={styles.selectedDriverCard}>
          <View style={[styles.driverCardHeader, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
            <View style={[styles.driverNameRow, { alignItems: rtl ? 'flex-end' : 'flex-start' }]}>
              <View style={{ flexDirection: rtl ? 'row-reverse' : 'row', alignItems: 'center', gap: spacing.xs }}>
                <Text style={styles.driverNameText}>{selectedDriver.driverName}</Text>
                {selectedDriver.operationalStatus === 'OFFLINE' ? (
                  <View style={styles.staleStatusBadge}>
                    <Text style={styles.staleStatusBadgeText}>
                      {rtl ? 'آخر موقع معروف' : 'Last Known'}
                    </Text>
                  </View>
                ) : (
                  <View style={styles.liveStatusBadge}>
                    <Text style={styles.liveStatusBadgeText}>
                      {rtl ? 'متصل الآن' : 'Live'}
                    </Text>
                  </View>
                )}
              </View>
              <Text style={styles.driverMetaText}>
                {t('diagnostics.employeeId')} {formatWesternNumber(selectedDriver.employeeId)}
                {selectedDriver.operationalStatus === 'OFFLINE' && selectedDriver.location?.recordedAt && (
                  ` • ${formatTimeAgo(selectedDriver.location.recordedAt, rtl)}`
                )}
              </Text>
            </View>

            <TouchableOpacity
              style={styles.detailLinkButton}
              onPress={() => onViewDriverDetail?.(selectedDriver)}
            >
              <Text style={styles.detailLinkText}>
                {rtl ? 'عرض التفاصيل ←' : 'Details →'}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={[styles.driverMetricsRow, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
            {selectedDriver.operationalStatus !== 'OFFLINE' && selectedDriver.location?.speed != null && (
              <Text style={styles.metricItem}>
                {formatWesternNumber(Math.round(Number(selectedDriver.location.speed) * 3.6))} {t('driverDetail.speedUnit')}
              </Text>
            )}

            {selectedDriver.operationalStatus === 'OFFLINE' && (
              <Text style={[styles.metricItem, { color: colors.text.muted }]}>
                {rtl ? 'غير متصل (متوقف)' : 'Offline (Stopped)'}
              </Text>
            )}

            {selectedDriver.device?.batteryPercentage != null && (
              <Text style={styles.metricItem}>
                {formatWesternNumber(selectedDriver.device.batteryPercentage)}%
              </Text>
            )}

            {selectedDriver.distanceToRestaurantMeters != null && (
              <Text style={styles.metricItem}>
                ~{formatWesternNumber(Math.round(selectedDriver.distanceToRestaurantMeters))} {t('driverDetail.meters')}
              </Text>
            )}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    backgroundColor: colors.surfaceSubtle,
    overflow: 'hidden',
  },
  webView: {
    flex: 1,
    backgroundColor: colors.surfaceSubtle,
  },
  loadingContainer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  loadingText: {
    fontSize: 12,
    color: colors.text.muted,
  },
  controlsColumn: {
    position: 'absolute',
    top: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 3,
    gap: 3,
    ...shadows.float,
  },
  controlButton: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  controlDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 1,
  },
  statusOverlay: {
    position: 'absolute',
    top: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    borderRadius: radius.full,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#22c55e',
  },
  statusOverlayText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
  },
  selectedDriverCard: {
    position: 'absolute',
    bottom: spacing.md,
    left: spacing.md,
    right: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    ...shadows.float,
  },
  driverCardHeader: {
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  driverNameRow: {
    flex: 1,
  },
  driverNameText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text.primary,
  },
  driverMetaText: {
    fontSize: 11,
    color: colors.text.muted,
  },
  detailLinkButton: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.xs,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.border,
  },
  detailLinkText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.primary,
  },
  driverMetricsRow: {
    gap: spacing.md,
    alignItems: 'center',
    marginTop: 4,
  },
  metricItem: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.text.secondary,
  },
  staleStatusBadge: {
    backgroundColor: colors.status.offlineBg,
    borderColor: colors.status.offlineBorder,
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radius.sm,
  },
  staleStatusBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.status.offline,
  },
  liveStatusBadge: {
    backgroundColor: colors.status.onlineBg,
    borderColor: colors.status.onlineBorder,
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radius.sm,
  },
  liveStatusBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.status.online,
  },
});

