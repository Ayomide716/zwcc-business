/**
 * Progress indicators: a bar, and the multi-step indicator used by the
 * application form.
 */
import { Ionicons } from '@expo/vector-icons';
import { useEffect } from 'react';
import { Pressable, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { colors, radius, spacing } from '@/theme';

import { Text } from './Text';

/* -------------------------------------------------------------------------- */
/* Progress bar                                                                */
/* -------------------------------------------------------------------------- */

export interface ProgressBarProps {
  /** 0..1 */
  value: number;
  label?: string;
  showPercentage?: boolean;
  tone?: 'brand' | 'success' | 'warning';
  style?: StyleProp<ViewStyle>;
}

export function ProgressBar({
  value,
  label,
  showPercentage,
  tone = 'brand',
  style,
}: ProgressBarProps) {
  const clamped = Math.min(1, Math.max(0, value));
  const width = useSharedValue(clamped);

  useEffect(() => {
    width.value = withTiming(clamped, { duration: 400 });
  }, [clamped, width]);

  const animatedStyle = useAnimatedStyle(() => ({
    width: `${width.value * 100}%`,
  }));

  const fill =
    tone === 'success' ? colors.success : tone === 'warning' ? colors.warning : colors.brand;

  return (
    <View style={style}>
      {label || showPercentage ? (
        <View style={styles.barHeader}>
          {label ? (
            <Text variant="label" muted>
              {label}
            </Text>
          ) : null}
          {showPercentage ? (
            <Text variant="label" color="brand">
              {Math.round(clamped * 100)}%
            </Text>
          ) : null}
        </View>
      ) : null}

      <View
        style={styles.barTrack}
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped * 100) }}
        accessibilityLabel={label ?? 'Progress'}
      >
        <Animated.View style={[styles.barFill, { backgroundColor: fill }, animatedStyle]} />
      </View>
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/* Step indicator                                                              */
/* -------------------------------------------------------------------------- */

export interface Step {
  id: string;
  shortTitle: string;
}

export interface StepIndicatorProps {
  steps: Step[];
  currentStepId: string;
  completedStepIds: string[];
  /** Tapping a completed step navigates back to it. */
  onStepPress?: (stepId: string) => void;
}

/**
 * Horizontally scrollable so a seven-step form still shows readable labels on a
 * small phone rather than shrinking to unreadable dots.
 */
export function StepIndicator({
  steps,
  currentStepId,
  completedStepIds,
  onStepPress,
}: StepIndicatorProps) {
  const currentIndex = steps.findIndex((step) => step.id === currentStepId);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.stepsRow}
      accessibilityLabel={`Step ${currentIndex + 1} of ${steps.length}`}
    >
      {steps.map((step, index) => {
        const done = completedStepIds.includes(step.id);
        const current = step.id === currentStepId;
        const reachable = done || current;

        return (
          <View key={step.id} style={styles.stepItem}>
            <Pressable
              disabled={!reachable || !onStepPress}
              onPress={() => onStepPress?.(step.id)}
              accessibilityRole="button"
              accessibilityLabel={`${step.shortTitle}, step ${index + 1} of ${steps.length}`}
              accessibilityState={{ selected: current, disabled: !reachable }}
              style={styles.stepPressable}
            >
              <View
                style={[
                  styles.stepDot,
                  done && styles.stepDotDone,
                  current && styles.stepDotCurrent,
                ]}
              >
                {done ? (
                  <Ionicons name="checkmark" size={14} color={colors.onBrand} />
                ) : (
                  <Text
                    variant="caption"
                    color={current ? colors.onBrand : colors.textMuted}
                    weight="700"
                  >
                    {index + 1}
                  </Text>
                )}
              </View>

              <Text
                variant="caption"
                color={current ? 'brand' : done ? 'textSecondary' : 'textMuted'}
                weight={current ? '700' : '400'}
                numberOfLines={1}
              >
                {step.shortTitle}
              </Text>
            </Pressable>

            {index < steps.length - 1 ? (
              <View style={[styles.stepConnector, done && styles.stepConnectorDone]} />
            ) : null}
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  barHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  barTrack: {
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: radius.pill,
  },
  stepsRow: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  stepItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stepPressable: {
    alignItems: 'center',
    gap: spacing.xs,
    minWidth: 62,
    paddingHorizontal: spacing.xs,
  },
  stepDot: {
    width: 26,
    height: 26,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  stepDotDone: {
    backgroundColor: colors.success,
    borderColor: colors.success,
  },
  stepDotCurrent: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  stepConnector: {
    width: 18,
    height: 2,
    backgroundColor: colors.border,
    marginBottom: 18,
  },
  stepConnectorDone: {
    backgroundColor: colors.success,
  },
});
