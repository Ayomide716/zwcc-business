/**
 * Where the application stands, as the largest thing on the home screen.
 *
 * Status was a small pill beside a heading, which had it exactly backwards: it
 * is the single thing an applicant opens the app to find out. It now gets the
 * weight — a phase ring, the status in full, what it means, and the next step
 * underneath.
 *
 * The ring shows position in the journey rather than a percentage of work done.
 * A percentage invites the question "percent of what?", and the honest answer
 * on a grant application is "of a process you do not control".
 *
 * The count is of phases, not statuses. Counting every status made a freshly
 * submitted application read "2 of 10", which looks barely begun to someone who
 * has in fact finished their part — and four of the stages left are paperwork
 * that only happens if the answer is yes. Phases are the same journey at the
 * grain an applicant thinks in.
 */
import { StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { STAGE_EXPECTATIONS } from '@/config/program.config';
import { colors, density, radius, spacing } from '@/theme';
import { describeStatus, getProgress, getStatusDefinition } from '@/workflow/engine';
import { APPLICANT_PHASES, PHASE_LABELS } from '@/config/workflow.config';

import { BrandIcon } from '../brand/Icon';
import { Text } from '../ui/Text';

const RING_SIZE = 74;
const RING_STROKE = 6;

export interface StatusHeroProps {
  status: string;
  /** Shown under the status, e.g. the requested amount. */
  meta?: { label: string; value: string }[];
  /**
   * Why a decision went the way it did.
   *
   * The committee is required to pick a reason before declining or returning an
   * application, and it was recorded and then shown to nobody — the applicant
   * saw "Not approved" and no more. Being told why is the difference between a
   * decision and a rebuff, and it is the only way someone knows what to change
   * before applying again.
   */
  reason?: { label: string; explanation?: string | null; note?: string | null } | null;
}

/** Tone to the colour the ring and the status word take. */
const TONE_COLOUR: Record<string, string> = {
  success: colors.success,
  danger: colors.danger,
  warning: colors.warning,
  info: colors.info,
  progress: colors.brand,
  neutral: colors.brandMuted,
};

export function StatusHero({ status, meta = [], reason }: StatusHeroProps) {
  const definition = getStatusDefinition(status);
  const accent = TONE_COLOUR[definition.tone] ?? colors.brand;

  // Position in the journey, not a percentage of effort.
  const phaseIndex = APPLICANT_PHASES.indexOf(definition.phase);
  const stage = phaseIndex >= 0 ? phaseIndex + 1 : null;
  const totalStages = APPLICANT_PHASES.length;

  const fraction = getProgress(status);
  const radiusInner = (RING_SIZE - RING_STROKE) / 2;
  const circumference = 2 * Math.PI * radiusInner;

  const expectation = STAGE_EXPECTATIONS[status];

  return (
    <View style={styles.hero}>
      <View style={styles.top}>
        <View style={styles.ringWrap}>
          <Svg width={RING_SIZE} height={RING_SIZE}>
            <Circle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={radiusInner}
              stroke={colors.brandSurfaceStrong}
              strokeWidth={RING_STROKE}
              fill="none"
            />
            <Circle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={radiusInner}
              stroke={accent}
              strokeWidth={RING_STROKE}
              strokeLinecap="round"
              fill="none"
              strokeDasharray={`${circumference * fraction} ${circumference}`}
              // Start the arc at twelve o'clock rather than three.
              transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
            />
          </Svg>

          <View style={styles.ringCentre}>
            {stage ? (
              <>
                <Text variant="title3" numeric>
                  {stage}
                </Text>
                <Text variant="caption" muted numeric>
                  of {totalStages}
                </Text>
              </>
            ) : (
              <BrandIcon name="clock" size={22} color={colors.textMuted} />
            )}
          </View>
        </View>

        <View style={styles.headline}>
          <Text variant="overline" muted>
            {(stage ? PHASE_LABELS[definition.phase] : 'YOUR APPLICATION').toUpperCase()}
          </Text>
          <Text variant="title1" style={{ color: accent }}>
            {definition.label}
          </Text>
        </View>
      </View>

      <Text variant="body" muted>
        {describeStatus(status, 'applicant')}
      </Text>

      {reason ? (
        <View style={styles.reason}>
          <Text variant="label">{reason.label}</Text>
          {reason.explanation ? (
            <Text variant="callout" muted>
              {reason.explanation}
            </Text>
          ) : null}
          {reason.note ? (
            <Text variant="callout" muted>
              {reason.note}
            </Text>
          ) : null}
        </View>
      ) : null}

      {expectation ? (
        <View style={styles.expectation}>
          <BrandIcon name="clock" size={15} color={colors.brand} />
          <Text variant="caption" color="brand" style={styles.expectationText}>
            {expectation}
          </Text>
        </View>
      ) : null}

      {meta.length > 0 ? (
        <View style={styles.meta}>
          {meta.map((item) => (
            <View key={item.label} style={styles.metaItem}>
              <Text variant="caption" muted>
                {item.label}
              </Text>
              <Text variant="bodyMedium" numeric numberOfLines={1}>
                {item.value}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: density.feature,
    gap: spacing.md,
  },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.base,
  },
  ringWrap: {
    width: RING_SIZE,
    height: RING_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringCentre: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headline: {
    flex: 1,
    gap: spacing.xxs,
  },
  reason: {
    gap: spacing.xxs,
    padding: density.card,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
  },
  expectation: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
  },
  expectationText: {
    flex: 1,
  },
  meta: {
    flexDirection: 'row',
    gap: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.divider,
  },
  metaItem: {
    flex: 1,
    gap: spacing.xxs,
  },
});
