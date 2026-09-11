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
 * Top spacing is the second. The status bar is hidden app-wide, so there is no
 * clock to collide with — but content still must not sit flush against the top
 * edge of the glass, and most phones then report no top inset at all.
 * `rhythm.screenTop` is the floor; a camera cutout reporting more wins.
 *
 * That padding is applied to the scroll container and the children are wrapped
 * separately, so a screen passing its own `paddingTop` adds to it rather than
 * silently replacing it. Getting that wrong is what put the create-account form
 * too close to the top edge.
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

import { colors, rhythm, spacing } from '@/theme';

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
  const paddingTop = stickyHeader
    ? headerHeight
    : Math.max(insets.top, rhythm.screenTop);

  const content = scrollable ? (
    <ScrollView
      ref={scrollRef}
      style={styles.flex}
      // Only the safe area lives here. Anything a screen wants goes on the
      // wrapper below, so the two cannot overwrite each other.
      contentContainerStyle={[
        padded && styles.padded,
        { paddingTop },
        { paddingBottom: paddingBottom + spacing.xxl },
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
      <View style={contentContainerStyle}>{children}</View>
    </ScrollView>
  ) : (
    <View style={[styles.flex, padded && styles.padded, { paddingTop }]}>
      <View style={[styles.flex, contentContainerStyle]}>{children}</View>
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
      ) : null}

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
