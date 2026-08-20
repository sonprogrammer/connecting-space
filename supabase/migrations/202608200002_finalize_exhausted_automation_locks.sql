create or replace function public.claim_automation_jobs(
  p_worker_id text,
  p_limit integer default 5,
  p_now timestamptz default now()
)
returns setof public.automation_jobs
language sql
security definer
set search_path = public
as $$
  with exhausted as (
    update public.automation_jobs
    set status = 'failed',
        locked_at = null,
        locked_by = null,
        last_error = 'Worker lock expired after maximum attempts',
        updated_at = p_now
    where status = 'processing'
      and attempt_count >= max_attempts
      and locked_at < p_now - interval '5 minutes'
    returning inquiry_id, job_type
  ),
  failed_drafts as (
    update public.inquiry_reply_drafts as drafts
    set status = 'failed',
        last_error = 'Worker lock expired after maximum attempts',
        updated_at = p_now
    from exhausted
    where exhausted.job_type = 'generate_inquiry_reply'
      and drafts.inquiry_id = exhausted.inquiry_id
    returning drafts.inquiry_id
  ),
  failed_deliveries as (
    update public.notification_deliveries as deliveries
    set status = 'failed',
        last_error = 'Worker lock expired after maximum attempts',
        updated_at = p_now
    from exhausted
    where exhausted.job_type = 'send_slack_notification'
      and deliveries.inquiry_id = exhausted.inquiry_id
      and deliveries.channel = 'slack'
    returning deliveries.inquiry_id
  ),
  claimable as (
    select jobs.id
    from public.automation_jobs as jobs
    where jobs.attempt_count < jobs.max_attempts
      and (
        (jobs.status in ('pending', 'retry') and jobs.available_at <= p_now)
        or (jobs.status = 'processing' and jobs.locked_at < p_now - interval '5 minutes')
      )
      and (select count(*) from failed_drafts) >= 0
      and (select count(*) from failed_deliveries) >= 0
    order by jobs.available_at, jobs.created_at
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 5), 20))
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
