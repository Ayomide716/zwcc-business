/**
 * Screen scaffold: safe areas, keyboard avoidance, scrolling and
 * pull-to-refresh, so no screen has to re-solve them.
 *
 * Keyboard handling is the reason this exists. The application form has long
 * text areas, and without `KeyboardAvoidingView` plus
 * `keyboardShouldPersistTaps="handled"` the keyboard covers the field being
 * typed into and the first tap on a button only dismisses the keyboard.
 */
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
  onRefresh?: () => void;
  refreshing?: boolean;
  background?: keyof typeof colors;
  contentContainerStyle?: StyleProp<ViewStyle>;
  style?: StyleProp<ViewStyle>;
  /** Rendered outside the scroll area, pinned to the bottom (e.g. Next/Back). */
  footer?: React.ReactNode;
  testID?: string;
}

export function Screen({
  children,
  scrollable = true,
  padded = true,
  edgeToEdgeBottom = false,
  onRefresh,
  refreshing = false,
  background = 'background',
  contentContainerStyle,
  style,
  footer,
  testID,
}: ScreenProps) {
  const insets = useSafeAreaInsets();

  const paddingBottom = edgeToEdgeBottom ? 0 : Math.max(insets.bottom, spacing.base);

  const content = scrollable ? (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[
        padded && styles.padded,
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
          />
        ) : undefined
      }
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.flex, padded && styles.padded, contentContainerStyle]}>{children}</View>
  );

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: colors[background] }, style]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      testID={testID}
    >
      {content}
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
    paddingTop: spacing.base,
  },
  footer: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
});
