-- ===========================================================================
-- 0007 — Committee scoring rubric
-- ===========================================================================
-- `application_reviews` recorded a decision and a free-text note. That is hard
-- to defend and hard to compare between applications: two reviewers reading the
-- same proposal could reach unrelated conclusions with nothing to show why.
--
-- This adds a scored sheet alongside the note. Scores live in JSONB keyed by
-- criterion id, mirroring how form answers are stored, so the church can change
-- the rubric in `src/config/scoring.config.ts` without a migration. Only the
-- rubric version is a real column, because it is the one thing queries need in
-- order to avoid comparing scores from different rubrics.
--
-- Idempotent, like every migration in this folder.
-- ===========================================================================

alter table public.application_reviews
  add column if not exists scores jsonb not null default '{}'::jsonb;

alter table public.application_reviews
  add column if not exists rubric_version integer;

-- Reviewers score once per application per stage. A second look should revise
-- the first rather than quietly adding a duplicate that skews the average.
create unique index if not exists reviews_one_score_per_reviewer_idx
  on public.application_reviews (application_id, reviewer_id, stage)
  where decision = 'score';

comment on column public.application_reviews.scores is
  'Criterion id to a 1-5 value. Keys are defined by src/config/scoring.config.ts.';
comment on column public.application_reviews.rubric_version is
  'RUBRIC_VERSION at the time of scoring. Scores from different versions are not comparable.';

-- ---------------------------------------------------------------------------
-- The decision check constraint predates scoring and rejects the new value.
-- ---------------------------------------------------------------------------
do $$
begin
  alter table public.application_reviews
    drop constraint if exists application_reviews_decision_check;

  alter table public.application_reviews
    add constraint application_reviews_decision_check
    check (decision in ('approve', 'reject', 'request_changes', 'note', 'score'));
end $$;
