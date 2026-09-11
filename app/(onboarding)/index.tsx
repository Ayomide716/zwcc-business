/**
 * Onboarding carousel (brief §7).
 *
 * Explains the grant, who can apply, how it works, what documents are needed
 * and what monthly monitoring means — before the applicant starts typing.
 */
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import {
  Dimensions,
  FlatList,
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Logo } from '@/components/brand/Logo';
import { OnboardingArt } from '@/components/brand/OnboardingArt';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { ONBOARDING_SLIDES, type OnboardingSlide } from '@/config/program.config';
import { useAuth } from '@/providers/AuthProvider';
import { profileService } from '@/services/profile.service';
import { colors, radius, rhythm, spacing } from '@/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function OnboardingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, refreshProfile } = useAuth();

  const [index, setIndex] = useState(0);
  const listRef = useRef<FlatList<OnboardingSlide>>(null);

  const isLast = index === ONBOARDING_SLIDES.length - 1;

  function handleScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const next = Math.round(event.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    if (next !== index) setIndex(next);
  }

  function goNext() {
    if (isLast) {
      void finish();
      return;
    }
    listRef.current?.scrollToIndex({ index: index + 1, animated: true });
  }

  async function finish() {
    // Recorded so returning users skip straight to their dashboard. A failure
    // here is harmless — they would simply see onboarding once more.
    if (user) {
      await profileService.markOnboardingComplete(user.id).catch(() => undefined);
      await refreshProfile();
    }
    router.replace('/(onboarding)/eligibility');
  }

  return (
    <View style={[styles.container, { paddingTop: Math.max(insets.top, rhythm.headerTop) }]}>
      <View style={styles.topBar}>
        <Logo size={32} showWordmark={false} />
        {!isLast ? (
          <Button label="Skip" variant="ghost" size="sm" onPress={finish} />
        ) : (
          <View style={styles.skipPlaceholder} />
        )}
      </View>

      <FlatList
        ref={listRef}
        data={ONBOARDING_SLIDES}
        keyExtractor={(slide) => slide.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleScroll}
        getItemLayout={(_data, itemIndex) => ({
          length: SCREEN_WIDTH,
          offset: SCREEN_WIDTH * itemIndex,
          index: itemIndex,
        })}
        renderItem={({ item }) => (
          <View style={styles.slide}>
            <OnboardingArt name={item.art} size={Math.min(SCREEN_WIDTH * 0.6, 240)} />

            <View style={styles.slideText}>
              <Text variant="title1" align="center" accessibilityRole="header">
                {item.title}
              </Text>
              <Text variant="body" muted align="center">
                {item.body}
              </Text>
            </View>
          </View>
        )}
      />

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
        <View
          style={styles.dots}
          accessibilityLabel={`Step ${index + 1} of ${ONBOARDING_SLIDES.length}`}
        >
          {ONBOARDING_SLIDES.map((slide, dotIndex) => (
            <View
              key={slide.id}
              style={[styles.dot, dotIndex === index && styles.dotActive]}
            />
          ))}
        </View>

        <Button
          label={isLast ? 'Check if I can apply' : 'Next'}
          onPress={goNext}
          fullWidth
          size="lg"
          icon="arrow-forward"
          iconPosition="right"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    height: 48,
  },
  skipPlaceholder: {
    width: 60,
  },
  slide: {
    width: SCREEN_WIDTH,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.xxl,
  },
  slideText: {
    gap: spacing.md,
    maxWidth: 360,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    gap: spacing.lg,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.border,
  },
  dotActive: {
    width: 24,
    backgroundColor: colors.brand,
  },
});
