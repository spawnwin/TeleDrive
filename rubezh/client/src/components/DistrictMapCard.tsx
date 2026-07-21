import React from 'react';
import { ImageBackground, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme';

const DISTRICT_MAP = require('../../assets/training-district-map.jpg');

export const NODE_PINS: Record<string, { top: string; left: string }> = {
  camp: { top: '58%', left: '22%' },
  depot: { top: '42%', left: '68%' },
  bridge: { top: '48%', left: '48%' },
  comms_node: { top: '28%', left: '34%' },
  med: { top: '70%', left: '72%' },
};

type Node = { id: string; name: string; status: string };

type Props = {
  name: string;
  stability: number;
  nodes: Node[];
  lastEvent?: string | null;
  compact?: boolean;
};

export function DistrictMapCard({ name, stability, nodes, lastEvent, compact }: Props) {
  return (
    <View style={[styles.mapCard, compact && styles.mapCardCompact]}>
      <ImageBackground
        source={DISTRICT_MAP}
        style={[styles.mapImage, compact && styles.mapImageCompact]}
        imageStyle={styles.mapImageInner}
      >
        <View style={styles.mapFog} />
        {nodes?.map((n) => {
          const pin = NODE_PINS[n.id] || { top: '50%', left: '50%' };
          return (
            <View key={n.id} style={[styles.pin, { top: pin.top as any, left: pin.left as any }]}>
              <View style={[styles.pinDot, statusColor(n.status)]} />
              {!compact ? (
                <Text style={styles.pinLabel} numberOfLines={1}>
                  {n.name}
                </Text>
              ) : null}
            </View>
          );
        })}
        <View style={[styles.mapFooter, compact && styles.mapFooterCompact]}>
          <Text style={styles.mapTitle} numberOfLines={1}>
            {name}
          </Text>
          <Text style={styles.mapMeta}>Устойчивость {stability}%</Text>
          {lastEvent && !compact ? <Text style={styles.mapMeta}>{lastEvent}</Text> : null}
          <View style={styles.barBg}>
            <View style={[styles.barFill, { width: `${Math.min(100, stability)}%` }]} />
          </View>
        </View>
      </ImageBackground>
    </View>
  );
}

function statusColor(status: string) {
  if (status === 'secured') return { backgroundColor: colors.accent };
  if (status === 'active') return { backgroundColor: colors.gold };
  if (status === 'watch') return { backgroundColor: colors.info };
  return { backgroundColor: colors.textDim };
}

const styles = StyleSheet.create({
  mapCard: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panel,
  },
  mapCardCompact: {
    marginHorizontal: 12,
    marginBottom: 10,
  },
  mapImage: { width: '100%', aspectRatio: 16 / 10, justifyContent: 'flex-end' },
  mapImageCompact: { aspectRatio: 16 / 9 },
  mapImageInner: { resizeMode: 'cover' },
  mapFog: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(18,24,18,0.12)',
  },
  pin: {
    position: 'absolute',
    transform: [{ translateX: -40 }, { translateY: -18 }],
    width: 120,
    alignItems: 'center',
  },
  pinDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: '#f2ebe0',
    marginBottom: 4,
  },
  pinLabel: {
    color: '#f4efe4',
    fontSize: 10,
    fontWeight: '800',
    textShadowColor: 'rgba(0,0,0,0.85)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
    textAlign: 'center',
  },
  mapFooter: { padding: 14, paddingTop: 28 },
  mapFooterCompact: { padding: 12, paddingTop: 20 },
  mapTitle: { color: '#f4efe4', fontSize: 16, fontWeight: '800' },
  mapMeta: { color: '#d8cfb8', marginTop: 4, fontWeight: '600', fontSize: 12 },
  barBg: { height: 8, backgroundColor: 'rgba(0,0,0,0.35)', borderRadius: 4, marginTop: 10, overflow: 'hidden' },
  barFill: { height: 8, backgroundColor: colors.info },
});
