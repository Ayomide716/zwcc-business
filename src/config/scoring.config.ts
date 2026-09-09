/**
 * The committee's scoring rubric, declared as data.
 *
 * Reviewers were deciding on an open judgement with a free-text note. That is
 * hard to defend, hard to compare between applications, and it makes two
 * reviewers reading the same proposal reach unrelated conclusions. A rubric
 * makes each reviewer answer the same questions on the same scale.
 *
 * The church has not settled these criteria. They are a starting point, chosen
 * to match what §17 of the brief says the committee weighs, and they are
 * expected to change. Editing this array is the whole job: the scoring sheet,
 * the totals, the averages across reviewers and the stored record all follow
 * from it. Nothing else needs touching.
 *
 * Rules of the road, the same as the form config:
 *   - `id` is a storage key inside a JSONB column. Never rename one that has
 *     been used in production; add a new criterion and archive the old one.
 *   - Weights need not sum to anything in particular. A score is reported as a
 *     percentage of the maximum achievable, so adding a criterion does not
 *     silently deflate every historical score — but it does make new scores
 *     incomparable with old ones, which is why `RUBRIC_VERSION` exists.
 */

export interface ScoringCriterion {
  /** Storage key. Stable forever once used. */
  id: string;
  label: string;
  /** What the reviewer should be asking themselves. */
  description: string;
  /**
   * Relative importance. A criterion with weight 2 counts twice as much as one
   * with weight 1 towards the total.
   */
  weight: number;
  /** Retired criteria stay here so historical scores still render. */
  archived?: boolean;
}

/** Every criterion is scored on this scale. */
export const SCORE_SCALE = [
  { value: 1, label: 'Weak', description: 'Falls well short on this point.' },
  { value: 2, label: 'Limited', description: 'Some merit, significant gaps.' },
  { value: 3, label: 'Adequate', description: 'Meets a reasonable standard.' },
  { value: 4, label: 'Strong', description: 'Clearly above what is expected.' },
  { value: 5, label: 'Excellent', description: 'Among the best we have seen.' },
] as const;

export const MIN_SCORE = 1;
export const MAX_SCORE = 5;

/**
 * Bumped whenever a criterion is added, removed or reweighted. Stored with each
 * score so a total from an older rubric is never silently compared with a newer
 * one.
 */
export const RUBRIC_VERSION = 1;

export const SCORING_CRITERIA: ScoringCriterion[] = [
  {
    id: 'proposal_clarity',
    label: 'Clarity of the proposal',
    description:
      'Is it clear what the business does, who it serves and what the money is for? Vague plans are the commonest reason a good idea cannot be funded.',
    weight: 2,
  },
  {
    id: 'viability',
    label: 'Commercial viability',
    description:
      'Is there a realistic route to the business sustaining itself? Consider the market, the pricing and the competition described.',
    weight: 3,
  },
  {
    id: 'applicant_capability',
    label: 'Capability of the applicant',
    description:
      'Does the applicant have the skills, experience or determination to run this? A modest plan from a capable person often beats an ambitious one from an unprepared one.',
    weight: 2,
  },
  {
    id: 'budget_realism',
    label: 'Realism of the amount requested',
    description:
      'Does the amount match the plan? Both an inflated request and one too small to achieve the stated goal are problems.',
    weight: 2,
  },
  {
    id: 'community_impact',
    label: 'Impact beyond the applicant',
    description:
      'Will this create work, serve a need, or strengthen the community? Weighted lightly on purpose: the grant funds businesses, not charities.',
    weight: 1,
  },
];

/* -------------------------------------------------------------------------- */
/* Derived helpers — pure, cheap, no state                                     */
/* -------------------------------------------------------------------------- */

/** Scores as stored: criterion id to a value on the scale. */
export type ScoreSheet = Record<string, number>;

export function getActiveCriteria(): ScoringCriterion[] {
  return SCORING_CRITERIA.filter((criterion) => !criterion.archived);
}

export function getCriterion(id: string): ScoringCriterion | undefined {
  return SCORING_CRITERIA.find((criterion) => criterion.id === id);
}

/** The highest weighted total a fully scored sheet can reach. */
export function maximumScore(): number {
  return getActiveCriteria().reduce((total, c) => total + c.weight * MAX_SCORE, 0);
}

/** Weighted total of whatever has been scored so far. */
export function weightedTotal(sheet: ScoreSheet): number {
  return getActiveCriteria().reduce((total, criterion) => {
    const value = sheet[criterion.id];
    return typeof value === 'number' ? total + value * criterion.weight : total;
  }, 0);
}

/**
 * Score as a fraction of the maximum, 0 to 1, or null when nothing is scored.
 * Reported as a percentage so rubrics of different sizes stay comparable at a
 * glance — though `RUBRIC_VERSION` is what actually says whether they are.
 */
export function scorePercentage(sheet: ScoreSheet): number | null {
  if (!isAnythingScored(sheet)) return null;
  const max = maximumScore();
  return max === 0 ? null : weightedTotal(sheet) / max;
}

export function isAnythingScored(sheet: ScoreSheet): boolean {
  return getActiveCriteria().some((criterion) => typeof sheet[criterion.id] === 'number');
}

/** Every active criterion has a value. */
export function isComplete(sheet: ScoreSheet): boolean {
  return getActiveCriteria().every((criterion) => typeof sheet[criterion.id] === 'number');
}

export function unscoredCriteria(sheet: ScoreSheet): ScoringCriterion[] {
  return getActiveCriteria().filter((criterion) => typeof sheet[criterion.id] !== 'number');
}

/**
 * Averages several reviewers' sheets, criterion by criterion.
 *
 * A criterion nobody scored is left out rather than counted as zero, so one
 * reviewer skipping a question does not drag the application's score down.
 */
export function averageSheets(sheets: ScoreSheet[]): ScoreSheet {
  const average: ScoreSheet = {};

  for (const criterion of getActiveCriteria()) {
    const values = sheets
      .map((sheet) => sheet[criterion.id])
      .filter((value): value is number => typeof value === 'number');

    if (values.length > 0) {
      average[criterion.id] = values.reduce((sum, value) => sum + value, 0) / values.length;
    }
  }

  return average;
}

/** A plain-language band for a percentage, for badges and summaries. */
export function scoreBand(fraction: number): {
  label: string;
  tone: 'success' | 'info' | 'warning' | 'danger';
} {
  if (fraction >= 0.8) return { label: 'Excellent', tone: 'success' };
  if (fraction >= 0.6) return { label: 'Strong', tone: 'info' };
  if (fraction >= 0.4) return { label: 'Mixed', tone: 'warning' };
  return { label: 'Weak', tone: 'danger' };
}
