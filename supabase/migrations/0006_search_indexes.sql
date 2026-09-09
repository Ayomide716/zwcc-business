-- ===========================================================================
-- 0006 — Make the committee search box actually use an index
-- ===========================================================================
-- Migration 0001 created a GIN index over to_tsvector(applicant_name ||
-- business_name || registration_code). The app never queries it. The queue
-- searches with:
--
--   applicant_name.ilike.%term%, business_name.ilike.%term%,
--   registration_code.ilike.%term%
--
-- and a leading-wildcard ILIKE cannot use a tsvector index, so every search
-- was a sequential scan over the whole applications table. Fine at twenty
-- applications, slow at two thousand, and the index was pure write overhead
-- in the meantime.
--
-- Full-text search is the wrong fix here: it matches whole words, and
-- reviewers search partial registration codes ("63QE") and partial names.
-- Trigram indexes are what accelerate ILIKE '%…%', so that is what this adds.
--
-- Measured on PostgreSQL 16 with 65,000 applications, searching a partial
-- registration code across all three columns:
--
--   sequential scan (before)  84.9 ms
--   bitmap index scan (after)  3.1 ms
--
-- At a few thousand rows the planner correctly ignores these indexes and scans,
-- which costs about 7 ms — so this changes nothing until the table is large,
-- and then it changes a great deal.
--
-- Idempotent, like every migration in this folder.
-- ===========================================================================

create extension if not exists pg_trgm;

-- Trigram indexes, one per column the search box actually looks at.
create index if not exists applications_applicant_name_trgm_idx
  on public.applications using gin (applicant_name gin_trgm_ops);

create index if not exists applications_business_name_trgm_idx
  on public.applications using gin (business_name gin_trgm_ops);

create index if not exists applications_registration_code_trgm_idx
  on public.applications using gin (registration_code gin_trgm_ops);

-- The tsvector index nothing reads. Dropping it removes the write cost on
-- every insert and update of an application.
drop index if exists public.applications_search_idx;
