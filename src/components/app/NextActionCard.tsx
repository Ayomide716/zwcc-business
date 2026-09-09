/**
 * "What do I need to do next?" — the question the brief says the applicant
 * dashboard must answer first.
 *
 * The answer comes from the workflow config's `nextAction` hint for the current
 * status, filtered to the viewing role. When the ball is in someone else's
 * court the card says so plainly rather than disappearing, because "nothing to
 * do, we are working on it" is itself the answer.
 */
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { STAGE_EXPECTATIONS } from '@/config/program.config';
import { colors, radius, spacing } from '@/theme';
import type { Role } from '@/types/roles';
import { describeStatus, getNextActionFor, getStatusDefinition } from '@/workflow/engine';

export interface NextActionCardProps {
  status: string;
  role: Role;
  /** Overrides the configured route, e.g. to pass an id. */
  onAction?: () => void;
  /** Replaces the configured label, e.g. "Reapply" vs "Continue". */
  actionLabel?: string;
}

export function NextActionCard({ status, role, onAction, actionLabel }: NextActionCardProps) {
  const router = useRouter();
  const hint = getNextActionFor(status, role);
  const definition = getStatusDefinition(status);

  /* Waiting on someone else — reassure rather than show an empty card. */
  if (!hint) {
    // Saying roughly how long the wait is stops people refreshing for news.
    const expectation = role === 'applicant' ? STAGE_EXPECTATIONS[status] : null;

    return (
      <Card variant="outlined" style={styles.waitingCard}>
        <View style={styles.row}>
          <View style={styles.waitingIcon}>
            <Ionicons name="time-outline" size={20} color={colors.brandMuted} />
          </View>
          <View style={styles.body}>
            <Text variant="title3">Nothing needed from you</Text>
            <Text variant="callout" muted>
              {describeStatus(status, role)}
            </Text>
            {expectation ? (
              <View style={styles.expectation}>
                <Ionicons name="calendar-outline" size={14} color={colors.brand} />
                <Text variant="caption" color="brand" style={styles.expectationText}>
                  {expectation}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
      </Card>
    );
  }

  const handlePress = () => {
    if (onAction) {
      onAction();
      return;
    }
    if (hint.route) router.push(hint.route as never);
  };

  return (
    <Card variant="brand" padding="lg" style={styles.actionCard}>
      <View style={styles.row}>
        <View style={styles.actionIcon}>
          <Ionicons name="arrow-forward" size={18} color={colors.brand} />
        </View>
        <View style={styles.body}>
          <Text variant="overline" color="textOnBrandMuted">
            NEXT STEP
          </Text>
          <Text variant="title3" color="onBrand">
            {hint.label}
          </Text>
          <Text variant="callout" color="textOnBrandMuted">
            {hint.description}
          </Text>
        </View>
      </View>

      <Button
        label={actionLabel ?? hint.cta ?? 'Continue'}
        onPress={handlePress}
        variant="secondary"
        fullWidth
        icon="chevron-forward"
        iconPosition="right"
        accessibilityHint={`${hint.label}. Current status: ${definition.label}`}
        style={styles.actionButton}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  expectation: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  expectationText: {
    flex: 1,
  },
  actionCard: {
    gap: spacing.base,
  },
  waitingCard: {
    backgroundColor: colors.surface,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'flex-start',
  },
  body: {
    flex: 1,
    gap: spacing.xxs,
  },
  actionIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.onBrand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  waitingIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.brandSurfaceStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButton: {
    marginTop: spacing.xs,
  },
});
