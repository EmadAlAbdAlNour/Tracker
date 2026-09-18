// Pure React Native Vector Logo Component for Tracker
// Zero external native dependencies, scales cleanly at any size

import React from 'react';
import { View, StyleSheet } from 'react-native';

interface TrackerLogoProps {
  size?: number;
  variant?: 'primary' | 'white' | 'dark';
}

export function TrackerLogo({ size = 48, variant = 'primary' }: TrackerLogoProps): React.JSX.Element {
  const bg = variant === 'white' ? '#ffffff' : variant === 'dark' ? '#0f172a' : '#0f766e';
  const ringColor = variant === 'white' ? '#0f766e' : '#ffffff';
  const arrowColor = variant === 'white' ? '#0f766e' : '#ffffff';
  const accentDot = '#34d399';

  const borderRadius = Math.round(size * 0.25);
  const outerRingSize = Math.round(size * 0.72);
  const innerRingSize = Math.round(size * 0.48);
  const dotSize = Math.max(3, Math.round(size * 0.1));
  const arrowWidth = Math.round(size * 0.32);
  const arrowHeight = Math.round(size * 0.36);

  return (
    <View
      style={[
        styles.container,
        {
          width: size,
          height: size,
          borderRadius,
          backgroundColor: bg,
        },
      ]}
    >
      {/* Outer Telemetry Ring */}
      <View
        style={[
          styles.ring,
          {
            width: outerRingSize,
            height: outerRingSize,
            borderRadius: outerRingSize / 2,
            borderColor: ringColor,
            opacity: 0.25,
            borderWidth: Math.max(1, Math.round(size * 0.025)),
          },
        ]}
      />

      {/* Inner Telemetry Ring */}
      <View
        style={[
          styles.ring,
          {
            width: innerRingSize,
            height: innerRingSize,
            borderRadius: innerRingSize / 2,
            borderColor: ringColor,
            opacity: 0.4,
            borderWidth: Math.max(1.5, Math.round(size * 0.035)),
          },
        ]}
      />

      {/* Directional Beacon Arrow */}
      <View
        style={[
          styles.arrow,
          {
            borderLeftWidth: arrowWidth / 2,
            borderRightWidth: arrowWidth / 2,
            borderBottomWidth: arrowHeight,
            borderBottomColor: arrowColor,
            top: Math.round(size * 0.22),
          },
        ]}
      />

      {/* Central Telemetry Core */}
      <View
        style={[
          styles.centerDot,
          {
            width: dotSize,
            height: dotSize,
            borderRadius: dotSize / 2,
            backgroundColor: accentDot,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  ring: {
    position: 'absolute',
  },
  arrow: {
    position: 'absolute',
    width: 0,
    height: 0,
    backgroundColor: 'transparent',
    borderStyle: 'solid',
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  centerDot: {
    position: 'absolute',
  },
});

