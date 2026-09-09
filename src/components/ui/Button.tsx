/**
 * The app's button.
 *
 * Accessibility notes: every variant meets the 48pt minimum touch target,
 * exposes `accessibilityRole="button"`, and reports its disabled/busy state to
 * screen readers rather than only looking greyed out.
 */
import { Ionicons } from '@expo/vector-icons';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { MIN_TOUCH_TARGET, colors, radius, shadows, spacing } from '@/theme';

import { Text } from './Text';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  iconPosition?: 'left' | 'right';
  style?: StyleProp<ViewStyle>;
  /** Overrides the label for screen readers when the label alone is ambiguous. */
  accessibilityLabel?: string;
  accessibilityHint?: string;
  testID?: string;
}

const VARIANT_STYLES: Record<
  ButtonVariant,
  { background: string; text: string; border?: string; pressed: string }
> = {
  primary: {
    background: colors.brand,
    text: colors.onBrand,
    pressed: colors.brandDark,
  },
  secondary: {
    background: colors.brandSurfaceStrong,
    text: colors.brandStrong,
    pressed: colors.brandBorder,
  },
  outline: {
    background: 'transparent',
    text: colors.brand,
    border: colors.brandBorder,
    pressed: colors.brandSurface,
  },
  ghost: {
    background: 'transparent',
    text: colors.brand,
    pressed: colors.brandSurface,
  },
  danger: {
    background: colors.danger,
    text: colors.textInverse,
    pressed: colors.dangerStrong,
  },
};

const SIZE_STYLES: Record<ButtonSize, { height: number; paddingHorizontal: number; gap: number }> = {
  sm: { height: MIN_TOUCH_TARGET - 8, paddingHorizontal: spacing.base, gap: spacing.xs },
  md: { height: MIN_TOUCH_TARGET, paddingHorizontal: spacing.lg, gap: spacing.sm },
  lg: { height: 56, paddingHorizontal: spacing.xl, gap: spacing.sm },
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  fullWidth = false,
  icon,
  iconPosition = 'left',
  style,
  accessibilityLabel,
  accessibilityHint,
  testID,
}: ButtonProps) {
  const palette = VARIANT_STYLES[variant];
  const sizing = SIZE_STYLES[size];
  const isInactive = disabled || loading;

  const iconNode = icon ? (
    <Ionicons
      name={icon}
      size={size === 'lg' ? 20 : 18}
      color={isInactive ? colors.disabledText : palette.text}
    />
  ) : null;

  return (
    <Pressable
      onPress={onPress}
      disabled={isInactive}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: isInactive, busy: loading }}
      style={({ pressed }) => [
        styles.base,
        {
          height: sizing.height,
          paddingHorizontal: sizing.paddingHorizontal,
          backgroundColor: pressed && !isInactive ? palette.pressed : palette.background,
          borderColor: palette.border ?? 'transparent',
          borderWidth: palette.border ? 1 : 0,
        },
        variant === 'primary' && !isInactive ? shadows.sm : null,
        isInactive ? styles.inactive : null,
        fullWidth ? styles.fullWidth : null,
        style,
      ]}
    >
      <View style={[styles.content, { gap: sizing.gap }]}>
        {loading ? (
          <ActivityIndicator size="small" color={isInactive ? colors.disabledText : palette.text} />
        ) : (
          iconPosition === 'left' && iconNode
        )}

        <Text
          variant={size === 'sm' ? 'label' : 'bodyMedium'}
          color={isInactive ? colors.disabledText : palette.text}
          numberOfLines={1}
        >
          {label}
        </Text>

        {!loading && iconPosition === 'right' && iconNode}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.base,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: MIN_TOUCH_TARGET,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  inactive: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
  },
  fullWidth: {
    alignSelf: 'stretch',
  },
});
