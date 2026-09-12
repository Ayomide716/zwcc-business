/**
 * A one-time explanation, shown on the screen it explains.
 *
 * The alternative considered was a walkthrough carousel at sign-up. People skip
 * those, and even when they do not, the advice arrives minutes before the
 * screen it describes and is forgotten by the time it matters. A hint that
 * appears the first time someone actually lands on Documents, next to the
 * thing it is talking about, is read.
 *
 * Dismissal is remembered per key on the device, not per account: it is a
 * courtesy, not a record. Storage failing, or the app being reinstalled, shows
 * the hint again, which is a far better failure than hiding it forever.
 */
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { MIN_TOUCH_TARGET, colors, radius, spacing } from '@/theme';

import { Text } from '../ui/Text';

const KEY_PREFIX = 'zwcc.hint.';

export interface FirstRunHintProps {
  /** Stable id. Changing it shows the hint again to everyone. */
  id: string;
  title: string;
  body: string;
  icon?: keyof typeof Ionicons.glyphMap;
}

export function FirstRunHint({ id, title, body, icon = 'bulb-outline' }: FirstRunHintProps) {
  // Undefined while unknown, so the hint never flashes in and out on a screen
  // where it has already been dismissed.
  const [visible, setVisible] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(KEY_PREFIX + id)
      .then((seen) => {
        if (!cancelled) setVisible(seen !== '1');
      })
      .catch(() => {
        // Showing a hint we have shown before is a small cost; hiding one we
        // have not is a person stuck on a screen they do not understand.
        if (!cancelled) setVisible(true);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const dismiss = useCallback(() => {
    setVisible(false);
    void AsyncStorage.setItem(KEY_PREFIX + id, '1').catch(() => {
      // Nothing to do: it reappears next time, which is harmless.
    });
  }, [id]);

  if (!visible) return null;

  return (
    <View style={styles.hint} accessibilityRole="summary">
      <Ionicons name={icon} size={18} color={colors.infoStrong} style={styles.icon} />

      <View style={styles.body}>
        <Text variant="label" color="infoStrong">
          {title}
        </Text>
        <Text variant="callout" color="infoStrong">
          {body}
        </Text>
      </View>

      <Pressable
        onPress={dismiss}
        accessibilityRole="button"
        accessibilityLabel="Dismiss"
        hitSlop={10}
        style={styles.close}
      >
        <Ionicons name="close" size={18} color={colors.infoStrong} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  hint: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    padding: spacing.base,
    borderRadius: radius.md,
    backgroundColor: colors.infoSurface,
  },
  icon: {
    marginTop: 1,
  },
  body: {
    flex: 1,
    gap: spacing.xxs,
  },
  close: {
    width: MIN_TOUCH_TARGET / 2,
    height: MIN_TOUCH_TARGET / 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -spacing.xs,
    marginRight: -spacing.xs,
  },
});
