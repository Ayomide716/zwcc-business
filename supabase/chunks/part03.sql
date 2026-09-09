-- ZWCC setup: part 3 of 7
create table if not exists public.agreements (
  id                uuid primary key default gen_random_uuid(),
  application_id    uuid not null unique references public.applications(id) on delete cascade,
  applicant_id      uuid not null references public.profiles(id) on delete cascade,
  template_version  text not null,
  content_snapshot  jsonb not null default '{}'::jsonb,
  status            text not null default 'issued' check (status in ('issued', 'signed', 'void')),
  issued_at         timestamptz not null default now(),
  issued_by         uuid references public.profiles(id) on delete set null,
  signed_at         timestamptz,
  signature_method  text,
  signature_data    text,
  signer_name       text,
  document_path     text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists agreements_applicant_idx on public.agreements (applicant_id);

drop trigger if exists agreements_set_updated_at on public.agreements;

create trigger agreements_set_updated_at
  before update on public.agreements
  for each row execute function public.set_updated_at();

create table if not exists public.beneficiaries (
  id                    uuid primary key default gen_random_uuid(),
  application_id        uuid not null unique references public.applications(id) on delete cascade,
  applicant_id          uuid not null references public.profiles(id) on delete cascade,
  business_id           uuid references public.businesses(id) on delete set null,
  monitoring_started_at timestamptz not null default now(),
  monitoring_ends_at    timestamptz not null,
  status                text not null default 'active'
                          check (status in ('active', 'completed', 'paused')),
  outcome_verdict       text,
  outcome_scores        jsonb not null default '{}'::jsonb,
  outcome_notes         text,
  evaluated_by          uuid references public.profiles(id) on delete set null,
  evaluated_at          timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists beneficiaries_status_idx on public.beneficiaries (status);

create index if not exists beneficiaries_applicant_idx on public.beneficiaries (applicant_id);

drop trigger if exists beneficiaries_set_updated_at on public.beneficiaries;

create trigger beneficiaries_set_updated_at
  before update on public.beneficiaries
  for each row execute function public.set_updated_at();

create table if not exists public.progress_reports (
  id              uuid primary key default gen_random_uuid(),
  beneficiary_id  uuid not null references public.beneficiaries(id) on delete cascade,
  application_id  uuid not null references public.applications(id) on delete cascade,
  applicant_id    uuid not null references public.profiles(id) on delete cascade,
  period_number   integer not null check (period_number > 0),
  period_start    timestamptz not null,
  due_date        timestamptz not null,
  status          text not null default 'submitted'
                    check (status in ('submitted', 'under_review', 'reviewed')),
  data            jsonb not null default '{}'::jsonb,
  submitted_at    timestamptz not null default now(),
  reviewed_by     uuid references public.profiles(id) on delete set null,
  reviewed_at     timestamptz,
  review_notes    text,
  review_score    integer check (review_score is null or review_score between 1 and 5),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (beneficiary_id, period_number)
);

create index if not exists reports_beneficiary_idx
  on public.progress_reports (beneficiary_id, period_number);

create index if not exists reports_status_idx on public.progress_reports (status);

create index if not exists reports_submitted_idx on public.progress_reports (submitted_at desc);

drop trigger if exists reports_set_updated_at on public.progress_reports;

create trigger reports_set_updated_at
  before update on public.progress_reports
  for each row execute function public.set_updated_at();

create table if not exists public.progress_media (
  id               uuid primary key default gen_random_uuid(),
  report_id        uuid not null references public.progress_reports(id) on delete cascade,
  applicant_id     uuid not null references public.profiles(id) on delete cascade,
  storage_path     text not null,
  media_type       text not null check (media_type in ('image', 'video')),
  mime_type        text not null,
  size_bytes       bigint not null check (size_bytes > 0),
  caption          text,
  duration_seconds integer,
  created_at       timestamptz not null default now()
);

create index if not exists progress_media_report_idx on public.progress_media (report_id);

create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  event_id   text not null,
  category   text not null default 'application',
  title      text not null,
  body       text not null,
  route      text,
  payload    jsonb not null default '{}'::jsonb,
  important  boolean not null default false,
  is_read    boolean not null default false,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_idx
  on public.notifications (user_id, created_at desc);

create index if not exists notifications_unread_idx
  on public.notifications (user_id) where is_read = false;

create table if not exists public.notification_deliveries (
  id              uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications(id) on delete cascade,
  channel         text not null check (channel in ('in_app', 'email', 'sms', 'whatsapp')),
  status          text not null default 'pending'
                    check (status in ('pending', 'sent', 'failed', 'skipped')),
  provider        text,
  error           text,
  attempted_at    timestamptz,
  created_at      timestamptz not null default now()
);

create index if not exists deliveries_pending_idx
  on public.notification_deliveries (status) where status = 'pending';

create table if not exists public.audit_logs (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid references public.profiles(id) on delete set null,
  actor_role  text,
  action      text not null,
  entity_type text not null,
  entity_id   uuid,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists audit_created_idx on public.audit_logs (created_at desc);

create index if not exists audit_entity_idx on public.audit_logs (entity_type, entity_id);

create index if not exists audit_actor_idx on public.audit_logs (actor_id);
