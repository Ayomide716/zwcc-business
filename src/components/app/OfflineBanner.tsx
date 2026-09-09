/**
 * The strip that says the phone has no connection.
 *
 * Sits directly under the status bar band on every screen, above all content,
 * so the reason a save is not going through is never a mystery. It animates in
 * and out rather than snapping, because a bar that appears instantly during a
 * brief signal dip reads as an error.
 *
 * It says work is safe, not just that the connection is gone — that is the part
 * that stops someone abandoning a half-finished application.
 */
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useNetwork } from '@/providers/NetworkProvider';
import { colors, spacing } from '@/theme';

import { Text } from '../ui/Text';

export function OfflineBanner() {
  const { isOnline } = useNetwork();
  const insets = useSafeAreaInsets();
  const slide = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(slide, {
      toValue: isOnline ? 0 : 1,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [isOnline, slide]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.container,
        {
          // Clears the navy status-bar band that every screen carries.
          top: insets.top,
          opacity: slide,
          transform: [{ translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [-40, 0] }) }],
        },
      ]}
      accessibilityLiveRegion="polite"
    >
      <View style={styles.row}>
        <Ionicons name="cloud-offline-outline" size={15} color={colors.warningStrong} />
        <Text variant="caption" color="warningStrong" style={styles.text}>
          No internet connection. Your work is saved on this phone and will sync
          when you are back online.
        </Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    // Above page content and the status-bar band, below nothing.
    zIndex: 20,
    elevation: 20,
    backgroundColor: colors.warningSurface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.warning,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
  },
  text: {
    flex: 1,
  },
});
