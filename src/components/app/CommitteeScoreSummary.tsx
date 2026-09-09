/**
 * What the committee thinks, taken together.
 *
 * One reviewer's sheet is an opinion; the spread across reviewers is the useful
 * signal. This shows the averaged score per criterion and, deliberately, how
 * many people have scored — an 82% from one reviewer is not the same claim as
 * an 82% from five, and a summary that hid the difference would be misleading.
 *
 * Disagreement is surfaced rather than smoothed away. Where reviewers are more
 * than one point apart on a criterion, it is flagged, because that is exactly
 * the point the committee should be discussing.
 */
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import {
  MAX_SCORE,
  averageSheets,
  getActiveCriteria,
  scoreBand,
  scorePercentage,
  type ScoreSheet,
} from '@/config/scoring.config';
import { colors, radius, spacing } from '@/theme';

import { Badge } from '../ui/Badge';
import { Card } from '../ui/Card';
import { Text } from '../ui/Text';

export interface CommitteeScoreSummaryProps {
  /** One sheet per reviewer who has scored. */
  sheets: ScoreSheet[];
}

/** Reviewers this far apart on one criterion are worth talking about. */
const DISAGREEMENT_THRESHOLD = 2;

export function CommitteeScoreSummary({ sheets }: CommitteeScoreSummaryProps) {
  if (sheets.length === 0) {
    return (
      <Card variant="outlined" style={styles.card}>
        <Text variant="title3">Committee scores</Text>
        <Text variant="callout" muted>
          Nobody has scored this application yet.
        </Text>
      </Card>
    );
  }

  const average = averageSheets(sheets);
  const fraction = scorePercentage(average);
  const criteria = getActiveCriteria();

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text variant="title3">Committee scores</Text>
          <Text variant="caption" muted>
            Averaged across {sheets.length}{' '}
            {sheets.length === 1 ? 'reviewer' : 'reviewers'}.
          </Text>
        </View>

        {fraction !== null ? (
          <Badge
            label={`${Math.round(fraction * 100)}%`}
            tone={scoreBand(fraction).tone}
          />
        ) : null}
      </View>

      <View style={styles.rows}>
        {criteria.map((criterion) => {
          const values = sheets
            .map((sheet) => sheet[criterion.id])
            .filter((value): value is number => typeof value === 'number');

          const mean = average[criterion.id];
          const spread = values.length > 1 ? Math.max(...values) - Math.min(...values) : 0;
          const contested = spread >= DISAGREEMENT_THRESHOLD;

          return (
            <View key={criterion.id} style={styles.row}>
              <View style={styles.rowText}>
                <Text variant="callout" numberOfLines={1}>
                  {criterion.label}
                </Text>
                {contested ? (
                  <View style={styles.contested}>
                    <Ionicons name="git-compare-outline" size={12} color={colors.warningStrong} />
                    <Text variant="caption" color="warningStrong">
                      Reviewers disagree
                    </Text>
                  </View>
                ) : null}
              </View>

              <View style={styles.bar}>
                <View
                  style={[
                    styles.barFill,
                    {
                      width: `${((mean ?? 0) / MAX_SCORE) * 100}%`,
                      backgroundColor: contested ? colors.warning : colors.brand,
                    },
                  ]}
                />
              </View>

              <Text variant="label" style={styles.value}>
                {mean === undefined ? '—' : mean.toFixed(1)}
              </Text>
            </View>
          );
        })}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.md,
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
  rows: {
    gap: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  rowText: {
    width: '42%',
    gap: 1,
  },
  contested: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
  },
  bar: {
    flex: 1,
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: radius.pill,
  },
  value: {
    width: 30,
    textAlign: 'right',
  },
});
