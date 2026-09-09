/**
 * Surface container. Two flavours: a plain card, and a pressable card used for
 * list rows that open a detail screen.
 */
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, radius, shadows, spacing } from '@/theme';

export interface CardProps {
  children: React.ReactNode;
  /** `flat` removes the shadow, for cards inside an already-elevated sheet. */
  variant?: 'elevated' | 'flat' | 'outlined' | 'brand';
  padding?: keyof typeof spacing;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  testID?: string;
}

export function Card({
  children,
  variant = 'elevated',
  padding = 'base',
  style,
  onPress,
  accessibilityLabel,
  accessibilityHint,
  testID,
}: CardProps) {
  const base: StyleProp<ViewStyle> = [
    styles.card,
    { padding: spacing[padding] },
    variant === 'elevated' && [styles.elevated, shadows.sm],
    variant === 'outlined' && styles.outlined,
    variant === 'flat' && styles.flat,
    variant === 'brand' && styles.brand,
    style,
  ];

  if (!onPress) {
    return (
      <View style={base} testID={testID}>
        {children}
      </View>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      style={({ pressed }) => [base, pressed && styles.pressed]}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.base,
    backgroundColor: colors.surface,
  },
  elevated: {
    backgroundColor: colors.surface,
  },
  outlined: {
    borderWidth: 1,
    borderColor: colors.border,
  },
  flat: {
    backgroundColor: colors.surfaceMuted,
  },
  brand: {
    backgroundColor: colors.brand,
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.995 }],
  },
});
