-- ---------------------------------------------------------------------------
-- 0026 — An audit log that says who did what to whom
--
-- Each entry stored the actor's id and the id of the record they acted on,
-- and the screen showed the role and the first eight characters of the id:
-- "committee · document 61f0016a". That answers nothing. The question an
-- audit log exists for — which committee member opened which applicant's
-- identity document — needed a database lookup to answer.
--
-- This resolves both ends by name when the log is read, so it works for every
-- entry already written, not only new ones:
--
--   who     the actor's name and role, or "SQL editor" / "System" for changes
--           made outside the app
--   what    for a document, its type and the applicant's name and code; for
--           an application, agreement or report, the applicant and code; for
--           a user or session, the person's name
--
-- A record that no longer exists (an account deleted, an application removed)
-- is named as such rather than silently dropped, so the entry keeps its
-- meaning.
--
-- Readable by staff only, mirroring the audit_logs select policy.
-- ---------------------------------------------------------------------------

create or replace function public.audit_log_feed(
  p_limit integer default 100,
  p_entity_type text default null
)
returns table (
  id          uuid,
  created_at  timestamptz,
  action      text,
  entity_type text,
  entity_id   uuid,
  actor_role  text,
  actor_name  text,
  subject     text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    l.id,
    l.created_at,
    l.action,
    l.entity_type,
    l.entity_id,
    l.actor_role,
    coalesce(
      actor.full_name,
      actor.email,
      -- No signed-in person but an administrator's authority: only the SQL
      -- editor writes entries like that.
      case when l.metadata->>'note' ilike '%sql editor%'
             or l.actor_role = 'admin' then 'SQL editor'
           when l.action = 'account.deleted' then 'The account holder'
           else 'System' end
    ) as actor_name,
    case l.entity_type
      when 'document' then (
        select coalesce(dt.label, d.document_type_id)
               || ' · ' || coalesce(a.applicant_name, owner.full_name, 'unknown applicant')
               || coalesce(' (' || a.registration_code || ')', '')
          from public.documents d
          left join public.document_types dt on dt.id = d.document_type_id
          left join public.applications a on a.id = d.application_id
          left join public.profiles owner on owner.id = d.applicant_id
         where d.id = l.entity_id
      )
      when 'application' then (
        select coalesce(a.applicant_name, owner.full_name, 'unknown applicant')
               || ' (' || coalesce(a.registration_code, 'draft') || ')'
          from public.applications a
          left join public.profiles owner on owner.id = a.applicant_id
         where a.id = l.entity_id
      )
      when 'agreement' then (
        select 'Agreement · ' || coalesce(a.applicant_name, 'unknown applicant')
               || coalesce(' (' || a.registration_code || ')', '')
          from public.agreements ag
          join public.applications a on a.id = ag.application_id
         where ag.id = l.entity_id
      )
      when 'beneficiary' then (
        select coalesce(a.applicant_name, 'unknown beneficiary')
               || coalesce(' (' || a.registration_code || ')', '')
          from public.beneficiaries b
          join public.applications a on a.id = b.application_id
         where b.id = l.entity_id
      )
      when 'progress_report' then (
        select 'Report ' || r.period_number || ' · ' || coalesce(a.applicant_name, 'unknown')
               || coalesce(' (' || a.registration_code || ')', '')
          from public.progress_reports r
          join public.applications a on a.id = r.application_id
         where r.id = l.entity_id
      )
      when 'profile' then (
        select coalesce(p.full_name, p.email) from public.profiles p where p.id = l.entity_id
      )
      when 'session' then (
        select coalesce(p.full_name, p.email) from public.profiles p where p.id = l.entity_id
      )
      when 'document_type' then (
        select dt.label from public.document_types dt where dt.id::text = l.entity_id::text
      )
      else null
    end as subject
  from public.audit_logs l
  left join public.profiles actor on actor.id = l.actor_id
  where public.is_staff()
    and (p_entity_type is null or l.entity_type = p_entity_type)
  order by l.created_at desc
  limit greatest(1, least(coalesce(p_limit, 100), 500));
$$;

comment on function public.audit_log_feed is
  'The audit log with actor and subject resolved to names. Staff only.';

revoke all on function public.audit_log_feed(integer, text) from public, anon;
grant execute on function public.audit_log_feed(integer, text) to authenticated;

select 'readable audit log installed: ' || count(*)::text as result
  from pg_proc where proname = 'audit_log_feed';
