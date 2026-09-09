/**
 * Status pill. Colour comes from a `Tone`, which the workflow config assigns to
 * each status — so a new status gets sensible colours with no change here.
 */
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { radius, spacing, toneColors, type Tone } from '@/theme';

import { Text } from './Text';

export interface BadgeProps {
  label: string;
  tone?: Tone;
  size?: 'sm' | 'md';
  style?: StyleProp<ViewStyle>;
}

export function Badge({ label, tone = 'neutral', size = 'md', style }: BadgeProps) {
  const palette = toneColors[tone];

  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: palette.bg,
          borderColor: palette.border,
          paddingVertical: size === 'sm' ? spacing.xxs : spacing.xs,
          paddingHorizontal: size === 'sm' ? spacing.sm : spacing.md,
        },
        style,
      ]}
      // The pill's colour carries meaning; the label alone must convey it to a
      // screen reader, so the text is exposed as a single readable element.
      accessible
      accessibilityLabel={`Status: ${label}`}
    >
      <Text variant={size === 'sm' ? 'caption' : 'label'} color={palette.fg} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    borderWidth: 1,
  },
});
