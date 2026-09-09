/**
 * Beneficiary monitoring.
 *
 * The client's current rule: twelve monthly reports over one year. Both the
 * duration and the cadence are values here, so a change to (say) quarterly
 * reporting over two years is a two-line edit.
 */

export type ReportStatus =
  | 'upcoming'
  | 'due'
  | 'overdue'
  | 'submitted'
  | 'under_review'
  | 'reviewed'
  | 'missed';

export interface MonitoringSchedule {
  /** How long the beneficiary is monitored, in months. */
  durationMonths: number;
  /** Months between reports. 1 = monthly. */
  intervalMonths: number;
  /** Days after a period opens before the report is considered overdue. */
  graceDays: number;
  /** How many days before the due date the report becomes submittable. */
  windowOpensDaysBefore: number;
}

export const MONITORING_SCHEDULE: MonitoringSchedule = {
  durationMonths: 12,
  intervalMonths: 1,
  graceDays: 7,
  windowOpensDaysBefore: 7,
};

/** Total number of reporting periods implied by the schedule. */
export const TOTAL_REPORTING_PERIODS = Math.ceil(
  MONITORING_SCHEDULE.durationMonths / MONITORING_SCHEDULE.intervalMonths,
);

export const REPORT_STATUS_LABELS: Record<ReportStatus, string> = {
  upcoming: 'Upcoming',
  due: 'Due now',
  overdue: 'Overdue',
  submitted: 'Submitted',
  under_review: 'Under review',
  reviewed: 'Reviewed',
  missed: 'Missed',
};

/* -------------------------------------------------------------------------- */
/* Report form                                                                 */
/* -------------------------------------------------------------------------- */

export interface ReportFieldDefinition {
  id: string;
  label: string;
  type: 'textarea' | 'currency' | 'number' | 'select';
  required: boolean;
  rows?: number;
  minLength?: number;
  maxLength?: number;
  min?: number;
  helpText?: string;
  placeholder?: string;
  options?: { value: string; label: string }[];
}

/**
 * The monthly report. The client will expand this; it is declared as data for
 * the same reason the application form is.
 */
export const REPORT_FIELDS: ReportFieldDefinition[] = [
  {
    id: 'progress_summary',
    label: 'How has the business gone this month?',
    type: 'textarea',
    rows: 4,
    required: true,
    minLength: 30,
    maxLength: 1000,
    placeholder: 'Tell us what happened in your business this month.',
  },
  {
    id: 'achievements',
    label: 'What went well?',
    type: 'textarea',
    rows: 3,
    required: true,
    minLength: 15,
    maxLength: 800,
    placeholder: 'New customers, new stock, a bigger order, a new skill…',
  },
  {
    id: 'challenges',
    label: 'What was difficult?',
    type: 'textarea',
    rows: 3,
    required: true,
    minLength: 15,
    maxLength: 800,
    helpText: 'Be honest — this helps us support you properly.',
  },
  {
    id: 'monthly_revenue',
    label: 'Revenue this month (₦)',
    type: 'currency',
    required: false,
    min: 0,
    helpText: 'An estimate is fine.',
  },
  {
    id: 'monthly_expenses',
    label: 'Expenses this month (₦)',
    type: 'currency',
    required: false,
    min: 0,
  },
  {
    id: 'employees_count',
    label: 'People the business currently supports',
    type: 'number',
    required: false,
    min: 0,
  },
  {
    id: 'next_month_focus',
    label: 'What will you focus on next month?',
    type: 'textarea',
    rows: 3,
    required: false,
    maxLength: 600,
  },
  {
    id: 'support_needed',
    label: 'Do you need any support from us?',
    type: 'textarea',
    rows: 3,
    required: false,
    maxLength: 600,
  },
];

/* -------------------------------------------------------------------------- */
/* Outcome evaluation                                                          */
/* -------------------------------------------------------------------------- */

/**
 * §19 — "a successful grant is determined by a good business report showing
 * positive results", with no threshold agreed. So: no hardcoded number. Staff
 * score a set of named dimensions and record an overall judgement. The
 * dimensions, the scale and the verdicts are all configuration.
 */
export interface EvaluationDimension {
  id: string;
  label: string;
  description: string;
}

export const EVALUATION_DIMENSIONS: EvaluationDimension[] = [
  {
    id: 'business_progress',
    label: 'Business progress',
    description: 'Has the business moved forward against its stated plan?',
  },
  {
    id: 'growth',
    label: 'Growth',
    description: 'Evidence of growth in customers, revenue, stock or capacity.',
  },
  {
    id: 'sustainability',
    label: 'Sustainability',
    description: 'How likely is the business to keep trading without further grants?',
  },
  {
    id: 'fund_utilisation',
    label: 'Use of funds',
    description: 'Was the grant used as described in the proposal?',
  },
  {
    id: 'report_quality',
    label: 'Reporting quality',
    description: 'Timeliness, completeness and honesty of the monthly reports.',
  },
];

/** 1–5 scale. Labels rather than bare numbers, so scoring stays consistent. */
export const EVALUATION_SCALE = [
  { value: 1, label: 'Poor' },
  { value: 2, label: 'Below expectations' },
  { value: 3, label: 'Meeting expectations' },
  { value: 4, label: 'Strong' },
  { value: 5, label: 'Excellent' },
] as const;

export const OUTCOME_VERDICTS = [
  { id: 'successful', label: 'Successful', tone: 'success' as const },
  { id: 'partially_successful', label: 'Partially successful', tone: 'warning' as const },
  { id: 'unsuccessful', label: 'Unsuccessful', tone: 'danger' as const },
  { id: 'inconclusive', label: 'Inconclusive', tone: 'neutral' as const },
];

/* -------------------------------------------------------------------------- */
/* Schedule helpers                                                            */
/* -------------------------------------------------------------------------- */

export interface ReportingPeriod {
  /** 1-based period number, e.g. month 1..12. */
  periodNumber: number;
  label: string;
  /** Start of the period. */
  periodStart: Date;
  /** Date the report is due. */
  dueDate: Date;
  /** Report may be submitted from this date. */
  opensAt: Date;
  /** After this date an unsubmitted report is overdue. */
  overdueAfter: Date;
}

function addMonths(date: Date, months: number): Date {
  const next = new Date(date.getTime());
  const targetDay = next.getDate();
  next.setMonth(next.getMonth() + months);
  // Guard against 31 Jan + 1 month rolling into March.
  if (next.getDate() < targetDay) next.setDate(0);
  return next;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date.getTime());
  next.setDate(next.getDate() + days);
  return next;
}

/**
 * Build the full reporting calendar from the date monitoring began. Pure, so
 * the same function drives the applicant timeline and committee "reports due"
 * counts without them being able to disagree.
 */
export function buildReportingSchedule(monitoringStartedAt: Date): ReportingPeriod[] {
  const { intervalMonths, graceDays, windowOpensDaysBefore } = MONITORING_SCHEDULE;

  return Array.from({ length: TOTAL_REPORTING_PERIODS }, (_, index) => {
    const periodNumber = index + 1;
    const periodStart = addMonths(monitoringStartedAt, index * intervalMonths);
    const dueDate = addMonths(monitoringStartedAt, periodNumber * intervalMonths);

    return {
      periodNumber,
      label: intervalMonths === 1 ? `Month ${periodNumber}` : `Period ${periodNumber}`,
      periodStart,
      dueDate,
      opensAt: addDays(dueDate, -windowOpensDaysBefore),
      overdueAfter: addDays(dueDate, graceDays),
    };
  });
}

/**
 * Status of a period given "now" and whether a report row exists for it.
 * `submittedStatus` comes from the database; everything else is derived.
 */
export function resolveReportStatus(
  period: ReportingPeriod,
  now: Date,
  submittedStatus?: 'submitted' | 'under_review' | 'reviewed',
): ReportStatus {
  if (submittedStatus) return submittedStatus;
  if (now < period.opensAt) return 'upcoming';
  if (now <= period.dueDate) return 'due';
  if (now <= period.overdueAfter) return 'overdue';
  return 'missed';
}

/** A report may only be submitted once its window has opened. */
export function isPeriodSubmittable(period: ReportingPeriod, now: Date): boolean {
  return now >= period.opensAt;
}
