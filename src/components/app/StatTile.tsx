/**
 * Dashboard statistic tile. Used in a two-column grid on the committee and
 * admin dashboards.
 */
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Feedback';
import { Text } from '@/components/ui/Text';
import { colors, radius, spacing, toneColors, type Tone } from '@/theme';

export interface StatTileProps {
  label: string;
  value: number | string | undefined;
  icon?: keyof typeof Ionicons.glyphMap;
  tone?: Tone;
  loading?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

export function StatTile({
  label,
  value,
  icon,
  tone = 'progress',
  loading,
  onPress,
  style,
}: StatTileProps) {
  const palette = toneColors[tone];

  return (
    <Card
      variant="outlined"
      onPress={onPress}
      accessibilityLabel={`${label}: ${value ?? 'loading'}`}
      style={[styles.tile, style]}
      padding="base"
    >
      {icon ? (
        <View style={[styles.icon, { backgroundColor: palette.bg }]}>
          <Ionicons name={icon} size={16} color={palette.fg} />
        </View>
      ) : null}

      {loading ? (
        <Skeleton width={44} height={26} />
      ) : (
        <Text variant="title1">{value ?? '—'}</Text>
      )}

      <Text variant="caption" muted numberOfLines={2}>
        {label}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    minWidth: 140,
    gap: spacing.xs,
  },
  icon: {
    width: 30,
    height: 30,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xxs,
  },
});
