/**
 * Screen scaffold: safe areas, keyboard avoidance, scrolling and
 * pull-to-refresh, so no screen has to re-solve them.
 *
 * Two things here are not obvious.
 *
 * Keyboard handling is the reason this exists at all. The application form has
 * long text areas, and without `KeyboardAvoidingView` plus
 * `keyboardShouldPersistTaps="handled"` the keyboard covers the field being
 * typed into and the first tap on a button only dismisses the keyboard.
 *
 * The status-bar scrim is the second. The app draws edge to edge, so the status
 * bar is transparent and scrolling content passes straight behind the clock and
 * battery, mixing with them. Padding alone only fixes the resting position. An
 * opaque strip pinned over that area is what actually hides scrolled content.
 */
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, spacing } from '@/theme';

export interface ScreenProps {
  children: React.ReactNode;
  /** Scrolls by default; set false for screens that manage their own list. */
  scrollable?: boolean;
  padded?: boolean;
  /** Honour the bottom safe area. Turn off when a tab bar already does. */
  edgeToEdgeBottom?: boolean;
  /**
   * Pinned above the scroll area, covering the status bar. Content scrolls
   * underneath it rather than being pushed below it, so the header stays put
   * while the page moves. Supplying this replaces the status-bar scrim, since
   * the header itself covers that area.
   */
  stickyHeader?: React.ReactNode;
  onRefresh?: () => void;
  refreshing?: boolean;
  background?: keyof typeof colors;
  contentContainerStyle?: StyleProp<ViewStyle>;
  style?: StyleProp<ViewStyle>;
  /** Rendered outside the scroll area, pinned to the bottom (e.g. Next/Back). */
  footer?: React.ReactNode;
  /** Access to the scroll view, so a screen can scroll to its first error. */
  scrollRef?: React.RefObject<ScrollView | null>;
  testID?: string;
}

export function Screen({
  children,
  scrollable = true,
  padded = true,
  edgeToEdgeBottom = false,
  stickyHeader,
  onRefresh,
  refreshing = false,
  background = 'background',
  contentContainerStyle,
  style,
  footer,
  scrollRef,
  testID,
}: ScreenProps) {
  const insets = useSafeAreaInsets();

  // Measured rather than assumed: the header's height depends on its own
  // content and on the device's status bar, so content has to be pushed down by
  // whatever it actually turns out to be.
  const [headerHeight, setHeaderHeight] = useState(0);

  const paddingBottom = edgeToEdgeBottom ? 0 : Math.max(insets.bottom, spacing.base);
  const paddingTop = stickyHeader ? headerHeight : insets.top;

  const content = scrollable ? (
    <ScrollView
      ref={scrollRef}
      style={styles.flex}
      contentContainerStyle={[
        padded && styles.padded,
        { paddingTop: paddingTop + (padded ? spacing.base : 0) },
        { paddingBottom: paddingBottom + spacing.xxl },
        contentContainerStyle,
      ]}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
      showsVerticalScrollIndicator={false}
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.brand}
            colors={[colors.brand]}
            // Keeps the spinner clear of a pinned header rather than under it.
            progressViewOffset={stickyHeader ? headerHeight : insets.top}
          />
        ) : undefined
      }
    >
      {children}
    </ScrollView>
  ) : (
    <View
      style={[
        styles.flex,
        padded && styles.padded,
        { paddingTop: paddingTop + (padded ? spacing.base : 0) },
        contentContainerStyle,
      ]}
    >
      {children}
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: colors[background] }, style]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      testID={testID}
    >
      {content}

      {stickyHeader ? (
        <View
          style={styles.stickyHeader}
          onLayout={(event) => setHeaderHeight(event.nativeEvent.layout.height)}
        >
          {stickyHeader}
        </View>
      ) : (
        /*
          The strip that stops scrolled text running into the clock and battery.
          It matches the page background, so content simply disappears under it.
        */
        <View
          pointerEvents="none"
          style={[
            styles.statusBarScrim,
            { height: insets.top, backgroundColor: colors[background] },
          ]}
        />
      )}

      {footer ? (
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.base) }]}>
          {footer}
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  padded: {
    paddingHorizontal: spacing.base,
  },
  statusBarScrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    // Android paints by elevation rather than source order, so both are set.
    zIndex: 10,
    elevation: 10,
  },
  stickyHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    elevation: 10,
  },
  footer: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
});
