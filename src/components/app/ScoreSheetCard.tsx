/**
 * The committee's scoring sheet.
 *
 * Every criterion, and the scale it is scored on, comes from
 * `scoring.config.ts`. Editing that file changes this screen — there is no list
 * of criteria written out here, and there must never be one.
 *
 * The scale is rendered as five labelled buttons rather than a slider or a star
 * row. A reviewer is making a judgement they may have to defend, and a slider
 * invites a vague drag; buttons carrying the words "Adequate" and "Strong" make
 * them choose a meaning rather than a position.
 */
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import {
  MAX_SCORE,
  SCORE_SCALE,
  getActiveCriteria,
  isComplete,
  scoreBand,
  scorePercentage,
  unscoredCriteria,
  type ScoreSheet,
} from '@/config/scoring.config';
import { colors, radius, spacing } from '@/theme';

import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { ProgressBar } from '../ui/Progress';
import { Text } from '../ui/Text';

export interface ScoreSheetCardProps {
  /** This reviewer's existing scores, if they have scored before. */
  value: ScoreSheet;
  onSave: (scores: ScoreSheet) => Promise<void> | void;
  saving?: boolean;
  /** Locks the sheet once a decision has been made. */
  readOnly?: boolean;
}

export function ScoreSheetCard({ value, onSave, saving, readOnly }: ScoreSheetCardProps) {
  const [sheet, setSheet] = useState<ScoreSheet>(value);
  const [dirty, setDirty] = useState(false);

  const criteria = getActiveCriteria();
  const fraction = scorePercentage(sheet);
  const remaining = unscoredCriteria(sheet);

  function setScore(criterionId: string, score: number) {
    if (readOnly) return;
    setSheet((current) => ({ ...current, [criterionId]: score }));
    setDirty(true);
  }

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text variant="title3">Your assessment</Text>
          <Text variant="caption" muted>
            {readOnly
              ? 'This application has been decided. Scores are kept for the record.'
              : 'Score each point. Your sheet is private to the committee.'}
          </Text>
        </View>

        {fraction !== null ? (
          <Badge
            label={`${Math.round(fraction * 100)}% · ${scoreBand(fraction).label}`}
            tone={scoreBand(fraction).tone}
            size="sm"
          />
        ) : null}
      </View>

      {fraction !== null ? <ProgressBar value={fraction} tone="brand" /> : null}

      <View style={styles.criteria}>
        {criteria.map((criterion) => (
          <View key={criterion.id} style={styles.criterion}>
            <View style={styles.criterionHeader}>
              <Text variant="bodyMedium" style={styles.criterionLabel}>
                {criterion.label}
              </Text>
              {criterion.weight > 1 ? (
                <Text variant="caption" color="brand">
                  ×{criterion.weight}
                </Text>
              ) : null}
            </View>

            <Text variant="caption" muted>
              {criterion.description}
            </Text>

            <View style={styles.scale}>
              {SCORE_SCALE.map((step) => {
                const selected = sheet[criterion.id] === step.value;
                return (
                  <Pressable
                    key={step.value}
                    onPress={() => setScore(criterion.id, step.value)}
                    disabled={readOnly}
                    accessibilityRole="radio"
                    accessibilityState={{ selected, disabled: readOnly }}
                    accessibilityLabel={`${criterion.label}: ${step.label}, ${step.value} out of ${MAX_SCORE}`}
                    accessibilityHint={step.description}
                    style={({ pressed }) => [
                      styles.step,
                      selected && styles.stepSelected,
                      pressed && !readOnly && !selected && styles.stepPressed,
                    ]}
                  >
                    <Text
                      variant="label"
                      color={selected ? 'onBrand' : 'textSecondary'}
                    >
                      {step.value}
                    </Text>
                    <Text
                      variant="caption"
                      color={selected ? 'textOnBrandMuted' : 'textMuted'}
                      numberOfLines={1}
                    >
                      {step.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ))}
      </View>

      {!readOnly ? (
        <>
          {remaining.length > 0 ? (
            <View style={styles.remaining}>
              <Ionicons name="ellipse-outline" size={13} color={colors.textMuted} />
              <Text variant="caption" muted style={styles.remainingText}>
                {remaining.length} of {criteria.length} still to score. You can save a
                partial sheet and come back.
              </Text>
            </View>
          ) : null}

          <Button
            label={isComplete(sheet) ? 'Save my scores' : 'Save what I have'}
            onPress={() => {
              void Promise.resolve(onSave(sheet)).then(() => setDirty(false));
            }}
            disabled={!dirty}
            loading={saving}
            variant={isComplete(sheet) ? 'primary' : 'outline'}
            icon="checkmark-circle-outline"
            fullWidth
          />
        </>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.base,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  headerText: {
    flex: 1,
    gap: spacing.xxs,
  },
  criteria: {
    gap: spacing.lg,
  },
  criterion: {
    gap: spacing.xs,
  },
  criterionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  criterionLabel: {
    flex: 1,
  },
  scale: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  step: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
    paddingVertical: spacing.sm,
    paddingHorizontal: 2,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  stepSelected: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  stepPressed: {
    backgroundColor: colors.brandSurface,
  },
  remaining: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
  },
  remainingText: {
    flex: 1,
  },
});
