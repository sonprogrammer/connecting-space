create or replace function public.requeue_automation_job(
  p_inquiry_id uuid,
  p_job_type public.automation_job_type,
  p_payload jsonb default '{}'::jsonb,
  p_now timestamptz default now()
)
returns public.automation_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.automation_jobs%rowtype;
begin
  select jobs.* into v_job
  from public.automation_jobs as jobs
  where jobs.inquiry_id = p_inquiry_id
    and jobs.job_type = p_job_type
    and jobs.status in ('pending', 'processing', 'retry')
  order by jobs.created_at desc
  limit 1
  for update;

  if found then
    if v_job.status = 'processing' then
      return v_job;
    end if;

    update public.automation_jobs as jobs
    set status = 'pending',
        payload = jobs.payload || coalesce(p_payload, '{}'::jsonb),
        available_at = p_now,
        locked_at = null,
        locked_by = null,
        last_error = null,
        completed_at = null,
        updated_at = p_now
    where jobs.id = v_job.id
    returning jobs.* into v_job;

    return v_job;
  end if;

  begin
    insert into public.automation_jobs (
      inquiry_id,
      job_type,
      status,
      payload,
      available_at
    ) values (
      p_inquiry_id,
      p_job_type,
      'pending',
      coalesce(p_payload, '{}'::jsonb),
      p_now
    )
    returning * into v_job;
  exception when unique_violation then
    select jobs.* into v_job
    from public.automation_jobs as jobs
    where jobs.inquiry_id = p_inquiry_id
      and jobs.job_type = p_job_type
      and jobs.status in ('pending', 'processing', 'retry')
    order by jobs.created_at desc
    limit 1
    for update;

    if not found then
      raise;
    end if;

    if v_job.status <> 'processing' then
      update public.automation_jobs as jobs
      set status = 'pending',
          payload = jobs.payload || coalesce(p_payload, '{}'::jsonb),
          available_at = p_now,
          locked_at = null,
          locked_by = null,
          last_error = null,
          completed_at = null,
          updated_at = p_now
      where jobs.id = v_job.id
      returning jobs.* into v_job;
    end if;
  end;

  return v_job;
end;
$$;

create or replace function public.claim_automation_job_by_id(
  p_job_id uuid,
  p_worker_id text,
  p_now timestamptz default now()
)
returns setof public.automation_jobs
language sql
security definer
set search_path = public
as $$
  with claimable as (
    select jobs.id
    from public.automation_jobs as jobs
    where jobs.id = p_job_id
      and jobs.attempt_count < jobs.max_attempts
      and jobs.status in ('pending', 'retry')
      and jobs.available_at <= p_now
    for update skip locked
  )
  update public.automation_jobs as jobs
  set status = 'processing',
      attempt_count = jobs.attempt_count + 1,
      locked_at = p_now,
      locked_by = p_worker_id,
      last_error = null,
      updated_at = p_now
  from claimable
  where jobs.id = claimable.id
  returning jobs.*;
$$;

revoke all on function public.requeue_automation_job(uuid, public.automation_job_type, jsonb, timestamptz) from public, anon, authenticated;
revoke all on function public.claim_automation_job_by_id(uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function public.requeue_automation_job(uuid, public.automation_job_type, jsonb, timestamptz) to service_role;
grant execute on function public.claim_automation_job_by_id(uuid, text, timestamptz) to service_role;
