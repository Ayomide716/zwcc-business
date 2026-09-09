/**
 * Loading, empty and error states.
 *
 * Grouped because they are three answers to the same question — "there is
 * nothing to show yet" — and screens usually need all three together.
 */
import { Ionicons } from '@expo/vector-icons';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { colors, radius, spacing } from '@/theme';

import { Button } from './Button';
import { Text } from './Text';

/* -------------------------------------------------------------------------- */
/* Skeleton                                                                    */
/* -------------------------------------------------------------------------- */

export interface SkeletonProps {
  width?: number | `${number}%`;
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * A shimmering placeholder. Preferred over a spinner for content that has a
 * known shape — it makes a slow connection feel like loading rather than
 * hanging.
 */
export function Skeleton({ width = '100%', height = 16, radius: r, style }: SkeletonProps) {
  const opacity = useSharedValue(0.5);

  useEffect(() => {
    opacity.value = withRepeat(
      withTiming(1, { duration: 850, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [opacity]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        { width, height, borderRadius: r ?? radius.sm, backgroundColor: colors.skeleton },
        animatedStyle,
        style,
      ]}
    />
  );
}

/** A few stacked skeleton rows, shaped like a card list. */
export function SkeletonList({ count = 3 }: { count?: number }) {
  return (
    <View style={{ gap: spacing.md }}>
      {Array.from({ length: count }, (_unused, index) => (
        <View key={index} style={styles.skeletonCard}>
          <Skeleton width="55%" height={18} />
          <Skeleton width="85%" height={13} />
          <Skeleton width="35%" height={13} />
        </View>
      ))}
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/* Loading                                                                     */
/* -------------------------------------------------------------------------- */

export function LoadingState({ message = 'Loading…' }: { message?: string }) {
  return (
    <View style={styles.centered} accessibilityLiveRegion="polite">
      <ActivityIndicator size="large" color={colors.brand} />
      <Text variant="callout" muted align="center">
        {message}
      </Text>
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/* Empty                                                                       */
/* -------------------------------------------------------------------------- */

export interface EmptyStateProps {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  style?: StyleProp<ViewStyle>;
}

export function EmptyState({
  icon = 'document-text-outline',
  title,
  message,
  actionLabel,
  onAction,
  style,
}: EmptyStateProps) {
  return (
    <View style={[styles.centered, style]}>
      <View style={styles.emptyIcon}>
        <Ionicons name={icon} size={30} color={colors.brandMuted} />
      </View>
      <Text variant="title3" align="center">
        {title}
      </Text>
      {message ? (
        <Text variant="callout" muted align="center" style={styles.emptyMessage}>
          {message}
        </Text>
      ) : null}
      {actionLabel && onAction ? (
        <Button label={actionLabel} onPress={onAction} variant="secondary" />
      ) : null}
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/* Error                                                                       */
/* -------------------------------------------------------------------------- */

export interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  retryable?: boolean;
}

/**
 * Shown when a screen cannot load. The message is always a `UserError` sentence
 * — raw technical errors never reach here.
 */
export function ErrorState({
  title = 'Something went wrong',
  message = 'We could not load this right now. Please try again.',
  onRetry,
  retryable = true,
}: ErrorStateProps) {
  return (
    <View style={styles.centered} accessibilityLiveRegion="assertive">
      <View style={[styles.emptyIcon, styles.errorIcon]}>
        <Ionicons name="cloud-offline-outline" size={30} color={colors.dangerStrong} />
      </View>
      <Text variant="title3" align="center">
        {title}
      </Text>
      <Text variant="callout" muted align="center" style={styles.emptyMessage}>
        {message}
      </Text>
      {onRetry && retryable ? (
        <Button label="Try again" onPress={onRetry} variant="secondary" icon="refresh" />
      ) : null}
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/* Inline banner                                                               */
/* -------------------------------------------------------------------------- */

export interface BannerProps {
  tone?: 'info' | 'success' | 'warning' | 'danger';
  title?: string;
  message: string;
  icon?: keyof typeof Ionicons.glyphMap;
  action?: { label: string; onPress: () => void };
  style?: StyleProp<ViewStyle>;
}

const BANNER_TONES = {
  info: { bg: colors.infoSurface, fg: colors.infoStrong, icon: 'information-circle' as const },
  success: { bg: colors.successSurface, fg: colors.successStrong, icon: 'checkmark-circle' as const },
  warning: { bg: colors.warningSurface, fg: colors.warningStrong, icon: 'alert-circle' as const },
  danger: { bg: colors.dangerSurface, fg: colors.dangerStrong, icon: 'close-circle' as const },
};

export function Banner({ tone = 'info', title, message, icon, action, style }: BannerProps) {
  const palette = BANNER_TONES[tone];

  return (
    <View
      style={[styles.banner, { backgroundColor: palette.bg }, style]}
      accessibilityLiveRegion={tone === 'danger' ? 'assertive' : 'polite'}
    >
      <Ionicons name={icon ?? palette.icon} size={20} color={palette.fg} />
      <View style={styles.bannerBody}>
        {title ? (
          <Text variant="label" color={palette.fg}>
            {title}
          </Text>
        ) : null}
        <Text variant="callout" color={palette.fg}>
          {message}
        </Text>
        {action ? (
          <Button
            label={action.label}
            onPress={action.onPress}
            variant="ghost"
            size="sm"
            style={styles.bannerAction}
          />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxxl,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: radius.pill,
    backgroundColor: colors.brandSurfaceStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorIcon: {
    backgroundColor: colors.dangerSurface,
  },
  emptyMessage: {
    maxWidth: 320,
  },
  skeletonCard: {
    padding: spacing.base,
    borderRadius: radius.base,
    backgroundColor: colors.surface,
    gap: spacing.sm,
  },
  banner: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.base,
    borderRadius: radius.md,
    alignItems: 'flex-start',
  },
  bannerBody: {
    flex: 1,
    gap: spacing.xxs,
  },
  bannerAction: {
    alignSelf: 'flex-start',
    marginTop: spacing.xs,
    paddingHorizontal: 0,
  },
});
