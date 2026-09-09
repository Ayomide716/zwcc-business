/**
 * Bottom sheet.
 *
 * Built on React Native's `Modal` rather than a gesture library: the sheets
 * here are simple action lists and confirmations, and Modal handles the Android
 * back button and screen-reader focus correctly for free.
 */
import { Ionicons } from '@expo/vector-icons';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MIN_TOUCH_TARGET, colors, radius, shadows, spacing } from '@/theme';

import { Text } from './Text';

export interface SheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  /** Scrolls the body. Turn off when the child is itself a list. */
  scrollable?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Sheet({
  visible,
  onClose,
  title,
  subtitle,
  children,
  scrollable = true,
  style,
}: SheetProps) {
  const insets = useSafeAreaInsets();

  const body = scrollable ? (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.body}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={styles.body}>{children}</View>
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        style={styles.backdrop}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close"
      />

      <View
        style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.base) }, style]}
      >
        <View style={styles.handle} />

        {title ? (
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text variant="title3">{title}</Text>
              {subtitle ? (
                <Text variant="callout" muted>
                  {subtitle}
                </Text>
              ) : null}
            </View>

            <Pressable
              onPress={onClose}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Close"
              style={styles.closeButton}
            >
              <Ionicons name="close" size={20} color={colors.textSecondary} />
            </Pressable>
          </View>
        ) : null}

        {body}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingTop: spacing.md,
    maxHeight: '85%',
    ...shadows.lg,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.borderStrong,
    marginBottom: spacing.base,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.md,
  },
  headerText: {
    flex: 1,
    gap: spacing.xxs,
  },
  closeButton: {
    width: MIN_TOUCH_TARGET - 12,
    height: MIN_TOUCH_TARGET - 12,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    paddingHorizontal: spacing.base,
    gap: spacing.md,
  },
});
