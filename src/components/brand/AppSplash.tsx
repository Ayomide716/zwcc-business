/**
 * The screen the app opens on.
 *
 * The native splash is a single static image that cannot animate and cannot
 * know when the app is ready — it is handed off to this the moment JavaScript
 * is running, so there is no visible seam between the two.
 *
 * What it is doing matters more than how it looks. Restoring a session, reading
 * the cached application and loading fonts takes a moment on a cheap phone and
 * a slow connection, and a frozen logo for two seconds reads as a hung app.
 * A mark that settles into place, a wordmark that follows it, and a line that
 * fills say the app is working.
 *
 * It holds for a beat even when everything resolves instantly. A splash that
 * flashes for 80ms is worse than none: it registers as a glitch rather than an
 * opening. `MINIMUM_VISIBLE_MS` is that floor.
 */
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

import { ORGANISATION } from '@/config/program.config';
import { colors, radius, spacing } from '@/theme';

import { Text } from '../ui/Text';
import { LogoMark } from './Logo';

/** Below this, a splash reads as a flicker rather than an opening. */
const MINIMUM_VISIBLE_MS = 900;

/** How long the fade out takes once the app is ready. */
const EXIT_MS = 320;

export interface AppSplashProps {
  /** True once fonts, the session and the restored cache are all settled. */
  ready: boolean;
  /** Called after the exit animation, when the splash may be unmounted. */
  onFinished: () => void;
}

export function AppSplash({ ready, onFinished }: AppSplashProps) {
  const mark = useRef(new Animated.Value(0)).current;
  const wordmark = useRef(new Animated.Value(0)).current;
  const progress = useRef(new Animated.Value(0)).current;
  const exit = useRef(new Animated.Value(1)).current;

  const [minimumElapsed, setMinimumElapsed] = useState(false);

  /* Entrance, once. */
  useEffect(() => {
    const timer = setTimeout(() => setMinimumElapsed(true), MINIMUM_VISIBLE_MS);

    Animated.sequence([
      Animated.spring(mark, { toValue: 1, friction: 7, tension: 60, useNativeDriver: true }),
      Animated.timing(wordmark, {
        toValue: 1,
        duration: 260,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();

    /*
      The bar is honest about being indeterminate: it eases towards nine tenths
      and waits there. Pretending to know the remaining percentage of a network
      call it cannot measure would be a lie told in an animation.
    */
    Animated.timing(progress, {
      toValue: 0.9,
      duration: 1400,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    }).start();

    return () => clearTimeout(timer);
  }, [mark, wordmark, progress]);

  /* Exit, once everything is settled and the floor has passed. */
  useEffect(() => {
    if (!ready || !minimumElapsed) return;

    Animated.parallel([
      Animated.timing(progress, {
        toValue: 1,
        duration: 180,
        easing: Easing.out(Easing.quad),
        useNativeDriver: false,
      }),
      Animated.timing(exit, {
        toValue: 0,
        duration: EXIT_MS,
        delay: 120,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) onFinished();
    });
  }, [ready, minimumElapsed, progress, exit, onFinished]);

  return (
    <Animated.View
      style={[styles.container, { opacity: exit }]}
      accessibilityRole="progressbar"
      accessibilityLabel={`${ORGANISATION.shortName} Business Grant, loading`}
    >
      <View style={styles.centre}>
        <Animated.View
          style={{
            opacity: mark,
            transform: [
              { scale: mark.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) },
            ],
          }}
        >
          <LogoMark size={84} scheme="onDark" />
        </Animated.View>

        <Animated.View
          style={[
            styles.words,
            {
              opacity: wordmark,
              transform: [
                { translateY: wordmark.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) },
              ],
            },
          ]}
        >
          <Text variant="title2" color="onBrand" align="center">
            {ORGANISATION.shortName} Business Grant
          </Text>
          <Text variant="caption" color="textOnBrandMuted" align="center">
            {ORGANISATION.location}
          </Text>
        </Animated.View>
      </View>

      <View style={styles.progressTrack}>
        <Animated.View
          style={[
            styles.progressFill,
            {
              width: progress.interpolate({
                inputRange: [0, 1],
                outputRange: ['0%', '100%'],
              }),
            },
          ]}
        />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
    // Above every screen until it has faded out.
    zIndex: 100,
    elevation: 100,
  },
  centre: {
    alignItems: 'center',
    gap: spacing.lg,
  },
  words: {
    alignItems: 'center',
    gap: spacing.xxs,
  },
  progressTrack: {
    position: 'absolute',
    bottom: spacing.huge,
    width: 132,
    height: 3,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.18)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
  },
});
