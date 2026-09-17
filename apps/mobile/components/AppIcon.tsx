// Pure Vector Icon Component for Tracker Mobile
// 100% Native, Zero-Emoji, Lightweight, Pixel-Perfect

import React from 'react';
import { View, StyleSheet, Text } from 'react-native';

export type IconName =
  | 'dashboard'
  | 'map'
  | 'driver'
  | 'device'
  | 'settings'
  | 'users'
  | 'bell'
  | 'battery'
  | 'wifi'
  | 'gps'
  | 'warning'
  | 'check'
  | 'arrow-left'
  | 'arrow-right'
  | 'arrow-up'
  | 'arrow-down'
  | 'sync'
  | 'logout'
  | 'search'
  | 'close'
  | 'plus'
  | 'minus'
  | 'target'
  | 'filter'
  | 'more'
  | 'restaurant'
  | 'pause'
  | 'play';

interface AppIconProps {
  name: IconName;
  size?: number;
  color?: string;
  focused?: boolean;
}

export function AppIcon({
  name,
  size = 18,
  color = '#475569',
  focused = false,
}: AppIconProps): React.JSX.Element {
  const iconColor = focused ? '#0f766e' : color;
  const stroke = Math.max(1.5, Math.round(size / 10));

  switch (name) {
    case 'dashboard':
      return (
        <View style={{ width: size, height: size, justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', height: size * 0.44 }}>
            <View style={{ width: size * 0.44, backgroundColor: iconColor, borderRadius: 2 }} />
            <View style={{ width: size * 0.44, borderWidth: stroke, borderColor: iconColor, borderRadius: 2 }} />
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', height: size * 0.44 }}>
            <View style={{ width: size * 0.44, borderWidth: stroke, borderColor: iconColor, borderRadius: 2 }} />
            <View style={{ width: size * 0.44, backgroundColor: iconColor, borderRadius: 2 }} />
          </View>
        </View>
      );

    case 'map':
      return (
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
          <View
            style={{
              width: size * 0.8,
              height: size * 0.8,
              borderWidth: stroke,
              borderColor: iconColor,
              borderRadius: 3,
              transform: [{ rotate: '45deg' }],
            }}
          />
          <View
            style={{
              position: 'absolute',
              width: size * 0.25,
              height: size * 0.25,
              backgroundColor: iconColor,
              borderRadius: size * 0.15,
            }}
          />
        </View>
      );

    case 'driver':
      return (
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
          {/* Steering wheel / vehicle shape */}
          <View
            style={{
              width: size * 0.9,
              height: size * 0.9,
              borderRadius: (size * 0.9) / 2,
              borderWidth: stroke,
              borderColor: iconColor,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <View
              style={{
                width: size * 0.35,
                height: size * 0.35,
                borderRadius: (size * 0.35) / 2,
                backgroundColor: iconColor,
              }}
            />
            <View
              style={{
                position: 'absolute',
                width: size * 0.7,
                height: stroke,
                backgroundColor: iconColor,
              }}
            />
          </View>
        </View>
      );

    case 'device':
      return (
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
          <View
            style={{
              width: size * 0.65,
              height: size * 0.95,
              borderWidth: stroke,
              borderColor: iconColor,
              borderRadius: 3,
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingVertical: 2,
            }}
          >
            <View style={{ width: size * 0.25, height: stroke, backgroundColor: iconColor, borderRadius: 1 }} />
            <View style={{ width: size * 0.15, height: size * 0.15, borderRadius: (size * 0.15) / 2, backgroundColor: iconColor }} />
          </View>
        </View>
      );

    case 'settings':
      return (
        <View style={{ width: size, height: size, justifyContent: 'space-around', paddingVertical: 2 }}>
          {/* Sliders */}
          <View style={{ height: stroke, backgroundColor: iconColor, width: '100%', borderRadius: 1 }}>
            <View style={{ position: 'absolute', left: '25%', top: -size * 0.12, width: size * 0.25, height: size * 0.35, backgroundColor: iconColor, borderRadius: 2 }} />
          </View>
          <View style={{ height: stroke, backgroundColor: iconColor, width: '100%', borderRadius: 1 }}>
            <View style={{ position: 'absolute', right: '25%', top: -size * 0.12, width: size * 0.25, height: size * 0.35, backgroundColor: iconColor, borderRadius: 2 }} />
          </View>
          <View style={{ height: stroke, backgroundColor: iconColor, width: '100%', borderRadius: 1 }}>
            <View style={{ position: 'absolute', left: '55%', top: -size * 0.12, width: size * 0.25, height: size * 0.35, backgroundColor: iconColor, borderRadius: 2 }} />
          </View>
        </View>
      );

    case 'users':
      return (
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
          <View
            style={{
              width: size * 0.4,
              height: size * 0.4,
              borderRadius: (size * 0.4) / 2,
              borderWidth: stroke,
              borderColor: iconColor,
              marginBottom: 1,
            }}
          />
          <View
            style={{
              width: size * 0.75,
              height: size * 0.35,
              borderTopLeftRadius: size * 0.2,
              borderTopRightRadius: size * 0.2,
              borderWidth: stroke,
              borderColor: iconColor,
              borderBottomWidth: 0,
            }}
          />
        </View>
      );

    case 'bell':
      return (
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
          <View
            style={{
              width: size * 0.65,
              height: size * 0.55,
              borderTopLeftRadius: size * 0.35,
              borderTopRightRadius: size * 0.35,
              borderWidth: stroke,
              borderColor: iconColor,
            }}
          />
          <View style={{ width: size * 0.85, height: stroke, backgroundColor: iconColor }} />
          <View style={{ width: size * 0.2, height: size * 0.15, backgroundColor: iconColor, borderRadius: 1, marginTop: 1 }} />
        </View>
      );

    case 'battery':
      return (
        <View style={{ width: size, height: size, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
          <View
            style={{
              width: size * 0.75,
              height: size * 0.45,
              borderWidth: stroke,
              borderColor: iconColor,
              borderRadius: 2,
              padding: 1,
              justifyContent: 'center',
            }}
          >
            <View style={{ width: '65%', height: '100%', backgroundColor: iconColor, borderRadius: 1 }} />
          </View>
          <View style={{ width: size * 0.08, height: size * 0.2, backgroundColor: iconColor, borderTopRightRadius: 1, borderBottomRightRadius: 1 }} />
        </View>
      );

    case 'wifi':
      return (
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 2 }}>
          <View style={{ width: size * 0.9, height: size * 0.3, borderTopWidth: stroke, borderColor: iconColor, borderTopLeftRadius: size * 0.45, borderTopRightRadius: size * 0.45 }} />
          <View style={{ width: size * 0.55, height: size * 0.25, borderTopWidth: stroke, borderColor: iconColor, borderTopLeftRadius: size * 0.3, borderTopRightRadius: size * 0.3 }} />
          <View style={{ width: size * 0.2, height: size * 0.2, borderRadius: size * 0.1, backgroundColor: iconColor }} />
        </View>
      );

    case 'gps':
      return (
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
          <View
            style={{
              width: size * 0.8,
              height: size * 0.8,
              borderRadius: (size * 0.8) / 2,
              borderWidth: stroke,
              borderColor: iconColor,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <View style={{ width: size * 0.3, height: size * 0.3, borderRadius: (size * 0.3) / 2, backgroundColor: iconColor }} />
          </View>
        </View>
      );

    case 'warning':
      return (
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
          <View
            style={{
              width: 0,
              height: 0,
              borderLeftWidth: size * 0.45,
              borderRightWidth: size * 0.45,
              borderBottomWidth: size * 0.8,
              borderLeftColor: 'transparent',
              borderRightColor: 'transparent',
              borderBottomColor: iconColor,
              alignItems: 'center',
            }}
          />
          <View style={{ position: 'absolute', top: size * 0.35, width: 2, height: size * 0.25, backgroundColor: '#ffffff', borderRadius: 1 }} />
          <View style={{ position: 'absolute', bottom: size * 0.2, width: 2.5, height: 2.5, borderRadius: 1.5, backgroundColor: '#ffffff' }} />
        </View>
      );

    case 'check':
      return (
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
          <View
            style={{
              width: size * 0.6,
              height: size * 0.35,
              borderLeftWidth: stroke * 1.3,
              borderBottomWidth: stroke * 1.3,
              borderColor: iconColor,
              transform: [{ rotate: '-45deg' }, { translateY: -2 }],
            }}
          />
        </View>
      );

    case 'arrow-left':
      return (
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
          <View
            style={{
              width: size * 0.4,
              height: size * 0.4,
              borderLeftWidth: stroke * 1.2,
              borderTopWidth: stroke * 1.2,
              borderColor: iconColor,
              transform: [{ rotate: '-45deg' }],
            }}
          />
        </View>
      );

    case 'arrow-right':
      return (
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
          <View
            style={{
              width: size * 0.4,
              height: size * 0.4,
              borderRightWidth: stroke * 1.2,
              borderTopWidth: stroke * 1.2,
              borderColor: iconColor,
              transform: [{ rotate: '45deg' }],
            }}
          />
        </View>
      );

    case 'sync':
      return (
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
          <View
            style={{
              width: size * 0.75,
              height: size * 0.75,
              borderRadius: (size * 0.75) / 2,
              borderWidth: stroke,
              borderColor: iconColor,
              borderTopColor: 'transparent',
            }}
          />
          <View
            style={{
              position: 'absolute',
              top: size * 0.1,
              right: size * 0.15,
              width: size * 0.25,
              height: size * 0.25,
              borderRightWidth: stroke,
              borderBottomWidth: stroke,
              borderColor: iconColor,
              transform: [{ rotate: '-45deg' }],
            }}
          />
        </View>
      );

    case 'logout':
      return (
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
          <View
            style={{
              width: size * 0.5,
              height: size * 0.75,
              borderWidth: stroke,
              borderColor: iconColor,
              borderLeftWidth: 0,
              alignSelf: 'flex-start',
              marginLeft: size * 0.15,
            }}
          />
          <View
            style={{
              position: 'absolute',
              right: size * 0.1,
              width: size * 0.5,
              height: stroke,
              backgroundColor: iconColor,
            }}
          />
        </View>
      );

    case 'search':
      return (
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
          <View
            style={{
              width: size * 0.6,
              height: size * 0.6,
              borderRadius: (size * 0.6) / 2,
              borderWidth: stroke,
              borderColor: iconColor,
              transform: [{ translateX: -1 }, { translateY: -1 }],
            }}
          />
          <View
            style={{
              position: 'absolute',
              right: size * 0.15,
              bottom: size * 0.15,
              width: size * 0.35,
              height: stroke * 1.2,
              backgroundColor: iconColor,
              transform: [{ rotate: '45deg' }],
              borderRadius: 1,
            }}
          />
        </View>
      );

    case 'close':
      return (
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ position: 'absolute', width: size * 0.75, height: stroke, backgroundColor: iconColor, transform: [{ rotate: '45deg' }], borderRadius: 1 }} />
          <View style={{ position: 'absolute', width: size * 0.75, height: stroke, backgroundColor: iconColor, transform: [{ rotate: '-45deg' }], borderRadius: 1 }} />
        </View>
      );

    case 'plus':
      return (
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ position: 'absolute', width: size * 0.75, height: stroke, backgroundColor: iconColor, borderRadius: 1 }} />
          <View style={{ position: 'absolute', height: size * 0.75, width: stroke, backgroundColor: iconColor, borderRadius: 1 }} />
        </View>
      );

    case 'minus':
      return (
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: size * 0.75, height: stroke, backgroundColor: iconColor, borderRadius: 1 }} />
        </View>
      );

    case 'target':
      return (
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: size * 0.8, height: size * 0.8, borderRadius: (size * 0.8) / 2, borderWidth: stroke, borderColor: iconColor, alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ width: size * 0.3, height: size * 0.3, borderRadius: (size * 0.3) / 2, backgroundColor: iconColor }} />
          </View>
        </View>
      );

    case 'more':
      return (
        <View style={{ width: size, height: size, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 2 }}>
          <View style={{ width: stroke * 2, height: stroke * 2, borderRadius: stroke, backgroundColor: iconColor }} />
          <View style={{ width: stroke * 2, height: stroke * 2, borderRadius: stroke, backgroundColor: iconColor }} />
          <View style={{ width: stroke * 2, height: stroke * 2, borderRadius: stroke, backgroundColor: iconColor }} />
        </View>
      );

    case 'restaurant':
      return (
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
          {/* Base / restaurant house shape */}
          <View
            style={{
              width: 0,
              height: 0,
              borderLeftWidth: size * 0.45,
              borderRightWidth: size * 0.45,
              borderBottomWidth: size * 0.4,
              borderLeftColor: 'transparent',
              borderRightColor: 'transparent',
              borderBottomColor: iconColor,
            }}
          />
          <View
            style={{
              width: size * 0.7,
              height: size * 0.45,
              backgroundColor: iconColor,
              borderBottomLeftRadius: 2,
              borderBottomRightRadius: 2,
              alignItems: 'center',
              justifyContent: 'flex-end',
            }}
          >
            <View style={{ width: size * 0.25, height: size * 0.25, backgroundColor: '#ffffff', borderTopLeftRadius: 2, borderTopRightRadius: 2 }} />
          </View>
        </View>
      );

    default:
      return (
        <View style={{ width: size, height: size, backgroundColor: iconColor, borderRadius: size / 2 }} />
      );
  }
}
