-- ZWCC setup: part 5 of 7
create policy history_select on public.application_status_history
  for select using (
    public.is_staff() or public.owns_application(application_id)
  );

drop policy if exists businesses_select on public.businesses;

create policy businesses_select on public.businesses
  for select using (applicant_id = auth.uid() or public.is_staff());

drop policy if exists businesses_write_own on public.businesses;

create policy businesses_write_own on public.businesses
  for insert with check (applicant_id = auth.uid());

drop policy if exists businesses_update_own on public.businesses;

create policy businesses_update_own on public.businesses
  for update using (applicant_id = auth.uid()) with check (applicant_id = auth.uid());

drop policy if exists businesses_staff on public.businesses;

create policy businesses_staff on public.businesses
  for all using (public.is_staff()) with check (public.is_staff());

drop policy if exists documents_select_own on public.documents;

create policy documents_select_own on public.documents
  for select using (applicant_id = auth.uid());

drop policy if exists documents_select_staff on public.documents;

create policy documents_select_staff on public.documents
  for select using (public.is_staff());

drop policy if exists documents_insert_own on public.documents;

create policy documents_insert_own on public.documents
  for insert with check (
    applicant_id = auth.uid()
    and public.owns_application(application_id)
    and public.application_documents_editable(application_id)
    and status = 'uploaded'
  );

drop policy if exists documents_update_own on public.documents;

create policy documents_update_own on public.documents
  for update
  using (
    applicant_id = auth.uid()
    and public.application_documents_editable(application_id)
  )
  with check (applicant_id = auth.uid());

create or replace function public.guard_document_verification()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Only staff may move a document into a verification outcome.
  if new.status is distinct from old.status
     and new.status in ('verified', 'rejected', 'under_review')
     and not public.is_staff() then
    raise exception 'Only a reviewer can verify or reject a document.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists documents_guard_verification on public.documents;

create trigger documents_guard_verification
  before update on public.documents
  for each row execute function public.guard_document_verification();

drop policy if exists documents_update_staff on public.documents;

create policy documents_update_staff on public.documents
  for update using (public.is_staff()) with check (public.is_staff());

drop policy if exists documents_admin_all on public.documents;

create policy documents_admin_all on public.documents
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists reviews_select_applicant on public.application_reviews;

create policy reviews_select_applicant on public.application_reviews
  for select using (
    is_internal = false and public.owns_application(application_id)
  );

drop policy if exists reviews_select_staff on public.application_reviews;

create policy reviews_select_staff on public.application_reviews
  for select using (public.is_staff());

drop policy if exists reviews_insert_staff on public.application_reviews;

create policy reviews_insert_staff on public.application_reviews
  for insert with check (public.is_staff() and reviewer_id = auth.uid());

drop policy if exists reviews_update_own on public.application_reviews;

create policy reviews_update_own on public.application_reviews
  for update using (public.is_staff() and reviewer_id = auth.uid())
  with check (public.is_staff() and reviewer_id = auth.uid());

drop policy if exists reviews_admin on public.application_reviews;

create policy reviews_admin on public.application_reviews
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists agreements_select on public.agreements;

create policy agreements_select on public.agreements
  for select using (applicant_id = auth.uid() or public.is_staff());

drop policy if exists agreements_insert_staff on public.agreements;

create policy agreements_insert_staff on public.agreements
  for insert with check (public.is_staff());

drop policy if exists agreements_sign_own on public.agreements;

create policy agreements_sign_own on public.agreements
  for update using (applicant_id = auth.uid() and status = 'issued')
  with check (applicant_id = auth.uid() and status = 'signed');

create or replace function public.guard_agreement_signature()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_staff() then
    -- An applicant signing may not rewrite the document they are agreeing to.
    if new.content_snapshot is distinct from old.content_snapshot
       or new.template_version is distinct from old.template_version
       or new.application_id is distinct from old.application_id then
      raise exception 'The agreement terms cannot be modified.'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists agreements_guard_signature on public.agreements;

create trigger agreements_guard_signature
  before update on public.agreements
  for each row execute function public.guard_agreement_signature();

drop policy if exists agreements_staff_update on public.agreements;

create policy agreements_staff_update on public.agreements
  for update using (public.is_staff()) with check (public.is_staff());

drop policy if exists beneficiaries_select on public.beneficiaries;

create policy beneficiaries_select on public.beneficiaries
  for select using (applicant_id = auth.uid() or public.is_staff());

drop policy if exists beneficiaries_staff on public.beneficiaries;

create policy beneficiaries_staff on public.beneficiaries
  for all using (public.is_staff()) with check (public.is_staff());

drop policy if exists reports_select_own on public.progress_reports;

create policy reports_select_own on public.progress_reports
  for select using (applicant_id = auth.uid());

drop policy if exists reports_select_staff on public.progress_reports;

create policy reports_select_staff on public.progress_reports
  for select using (public.is_staff());

drop policy if exists reports_insert_own on public.progress_reports;

create policy reports_insert_own on public.progress_reports
  for insert with check (
    applicant_id = auth.uid()
    and status = 'submitted'
    and exists (
      select 1 from public.beneficiaries b
       where b.id = beneficiary_id
         and b.applicant_id = auth.uid()
         and b.status = 'active'
    )
  );

drop policy if exists reports_update_own on public.progress_reports;
