-- ---------------------------------------------------------------------------
-- 0018 — Completing a grant closes the beneficiary too, whichever door is used
--
-- There are two ways to complete a grant and they did different things.
--
-- The beneficiary screen calls a service that marks the beneficiary completed
-- and then moves the application. The committee's application screen builds its
-- actions from the workflow config, so "Complete grant" has always appeared
-- there too — and that path moved the application and left the beneficiary
-- marked active. The result is a grant that is finished according to the
-- application and still running according to the monitoring record: the
-- applicant is never told their year is over, and the beneficiary keeps
-- appearing in the committee's active list.
--
-- Rather than teach the second caller to do both, the database now guarantees
-- it. A third caller, or a hand-written UPDATE in the SQL editor, cannot get
-- this wrong either.
-- ---------------------------------------------------------------------------

create or replace function public.close_beneficiary_with_application()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'completed' and old.status is distinct from 'completed' then
    update public.beneficiaries
       set status = 'completed'
     where application_id = new.id
       and status <> 'completed';
  end if;

  return new;
end;
$$;

drop trigger if exists applications_close_beneficiary on public.applications;
create trigger applications_close_beneficiary
  after update on public.applications
  for each row execute function public.close_beneficiary_with_application();

-- ---------------------------------------------------------------------------
-- Repair anything already split
-- ---------------------------------------------------------------------------

update public.beneficiaries b
   set status = 'completed'
  from public.applications a
 where a.id = b.application_id
   and a.status = 'completed'
   and b.status <> 'completed';
