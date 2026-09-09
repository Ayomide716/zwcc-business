/**
 * Screen headers.
 *
 * `ScreenHeader` is the plain title block used inside a scroll view.
 * `BrandHeader` is the navy hero used at the top of dashboards.
 */
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MIN_TOUCH_TARGET, colors, radius, shadows, spacing } from '@/theme';

import { Text } from './Text';

/* -------------------------------------------------------------------------- */

export interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  /** Shows a back chevron. Defaults to router.back(). */
  showBack?: boolean;
  onBack?: () => void;
  right?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function ScreenHeader({
  title,
  subtitle,
  showBack,
  onBack,
  right,
  style,
}: ScreenHeaderProps) {
  const router = useRouter();

  return (
    <View style={[styles.header, style]}>
      {showBack ? (
        <Pressable
          onPress={onBack ?? (() => router.back())}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          style={styles.backButton}
        >
          <Ionicons name="chevron-back" size={22} color={colors.brand} />
        </Pressable>
      ) : null}

      <View style={styles.headerText}>
        <Text variant="title1" accessibilityRole="header">
          {title}
        </Text>
        {subtitle ? (
          <Text variant="callout" muted>
            {subtitle}
          </Text>
        ) : null}
      </View>

      {right}
    </View>
  );
}

/* -------------------------------------------------------------------------- */

export interface BrandHeaderProps {
  /** Small line above the title, e.g. "Good morning". */
  eyebrow?: string;
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  children?: React.ReactNode;
  /**
   * Pinned above a scrolling page rather than scrolling with it. Squares off
   * the bottom corners, because content passing underneath would otherwise show
   * through the two rounded notches.
   */
  pinned?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * The navy hero. Extends behind the status bar, which is why it applies the top
 * inset itself rather than sitting inside a SafeAreaView.
 */
export function BrandHeader({
  eyebrow,
  title,
  subtitle,
  right,
  children,
  pinned = false,
  style,
}: BrandHeaderProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.brandHeader,
        pinned && styles.brandHeaderPinned,
        { paddingTop: insets.top + spacing.base },
        style,
      ]}
    >
      <View style={styles.brandRow}>
        <View style={styles.headerText}>
          {eyebrow ? (
            <Text variant="overline" color="textOnBrandMuted">
              {eyebrow.toUpperCase()}
            </Text>
          ) : null}
          <Text variant="title1" color="onBrand" accessibilityRole="header">
            {title}
          </Text>
          {subtitle ? (
            <Text variant="callout" color="textOnBrandMuted">
              {subtitle}
            </Text>
          ) : null}
        </View>

        {right}
      </View>

      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  headerText: {
    flex: 1,
    gap: spacing.xxs,
  },
  backButton: {
    width: MIN_TOUCH_TARGET - 12,
    height: MIN_TOUCH_TARGET - 12,
    borderRadius: radius.pill,
    backgroundColor: colors.brandSurfaceStrong,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  brandHeader: {
    backgroundColor: colors.brand,
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.lg,
    borderBottomLeftRadius: radius.xl,
    borderBottomRightRadius: radius.xl,
    gap: spacing.base,
  },
  brandHeaderPinned: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    ...shadows.md,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
});
