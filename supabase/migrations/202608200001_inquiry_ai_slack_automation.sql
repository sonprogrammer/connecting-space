create type public.inquiry_reply_draft_status as enum ('generating', 'ready', 'failed');
create type public.automation_job_type as enum ('generate_inquiry_reply', 'send_slack_notification');
create type public.automation_job_status as enum ('pending', 'processing', 'retry', 'completed', 'failed');
create type public.notification_channel as enum ('slack');
create type public.notification_delivery_status as enum ('pending', 'processing', 'retry', 'sent', 'failed');

create table public.service_offerings (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text not null,
  description text not null,
  price_label text not null,
  price_min integer check (price_min is null or price_min >= 0),
  price_max integer check (price_max is null or price_max >= 0),
  duration_label text not null,
  included_items jsonb not null default '[]'::jsonb check (jsonb_typeof(included_items) = 'array'),
  excluded_items jsonb not null default '[]'::jsonb check (jsonb_typeof(excluded_items) = 'array'),
  ai_guidance text,
  is_published boolean not null default false,
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (price_min is null or price_max is null or price_min <= price_max)
);

create table public.faq_items (
  id uuid primary key default gen_random_uuid(),
  question text not null,
  answer text not null,
  ai_guidance text,
  is_published boolean not null default false,
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.inquiry_reply_drafts (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid not null unique references public.inquiries(id) on delete cascade,
  generation_record_id uuid references public.ai_generation_records(id) on delete set null,
  summary text not null default '',
  draft_text text not null default '',
  needs_confirmation jsonb not null default '[]'::jsonb check (jsonb_typeof(needs_confirmation) = 'array'),
  status public.inquiry_reply_draft_status not null default 'generating',
  last_error text,
  updated_by uuid references public.admins(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.automation_jobs (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid not null references public.inquiries(id) on delete cascade,
  job_type public.automation_job_type not null,
  status public.automation_job_status not null default 'pending',
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  max_attempts integer not null default 3 check (max_attempts between 1 and 10),
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  last_error text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid not null references public.inquiries(id) on delete cascade,
  draft_id uuid not null references public.inquiry_reply_drafts(id) on delete cascade,
  channel public.notification_channel not null default 'slack',
  status public.notification_delivery_status not null default 'pending',
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (draft_id, channel)
);

create index service_offerings_public_order_idx on public.service_offerings(is_published, sort_order, created_at);
create index faq_items_public_order_idx on public.faq_items(is_published, sort_order, created_at);
create index inquiry_reply_drafts_inquiry_id_idx on public.inquiry_reply_drafts(inquiry_id);
create index automation_jobs_claim_idx on public.automation_jobs(status, available_at, created_at);
create index automation_jobs_inquiry_id_idx on public.automation_jobs(inquiry_id, created_at desc);
create unique index automation_jobs_active_unique
  on public.automation_jobs(inquiry_id, job_type)
  where status in ('pending', 'processing', 'retry');
create index notification_deliveries_inquiry_id_idx on public.notification_deliveries(inquiry_id, created_at desc);

create trigger service_offerings_set_updated_at before update on public.service_offerings
for each row execute function public.set_updated_at();
create trigger faq_items_set_updated_at before update on public.faq_items
for each row execute function public.set_updated_at();
create trigger inquiry_reply_drafts_set_updated_at before update on public.inquiry_reply_drafts
for each row execute function public.set_updated_at();
create trigger automation_jobs_set_updated_at before update on public.automation_jobs
for each row execute function public.set_updated_at();
create trigger notification_deliveries_set_updated_at before update on public.notification_deliveries
for each row execute function public.set_updated_at();

alter table public.service_offerings enable row level security;
alter table public.faq_items enable row level security;
alter table public.inquiry_reply_drafts enable row level security;
alter table public.automation_jobs enable row level security;
alter table public.notification_deliveries enable row level security;

create policy "admins can manage service offerings" on public.service_offerings for all to authenticated
using (public.is_admin()) with check (public.is_admin());
create policy "admins can manage faq items" on public.faq_items for all to authenticated
using (public.is_admin()) with check (public.is_admin());
create policy "admins can manage inquiry reply drafts" on public.inquiry_reply_drafts for all to authenticated
using (public.is_admin()) with check (public.is_admin());
create policy "admins can manage notification deliveries" on public.notification_deliveries for all to authenticated
using (public.is_admin()) with check (public.is_admin());

create or replace function public.enqueue_automation_job(
  p_inquiry_id uuid,
  p_job_type public.automation_job_type,
  p_payload jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job_id uuid;
begin
  select id into v_job_id
  from public.automation_jobs
  where inquiry_id = p_inquiry_id
    and job_type = p_job_type
    and status in ('pending', 'processing', 'retry')
  order by created_at desc
  limit 1;

  if v_job_id is not null then
    return v_job_id;
  end if;

  begin
    insert into public.automation_jobs (inquiry_id, job_type, payload)
    values (p_inquiry_id, p_job_type, coalesce(p_payload, '{}'::jsonb))
    returning id into v_job_id;
  exception when unique_violation then
    select id into v_job_id
    from public.automation_jobs
    where inquiry_id = p_inquiry_id
      and job_type = p_job_type
      and status in ('pending', 'processing', 'retry')
    limit 1;
  end;

  return v_job_id;
end;
$$;

create or replace function public.create_inquiry_with_automation(p_inquiry jsonb)
returns table (id uuid, status public.inquiry_status)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inquiry public.inquiries%rowtype;
begin
  insert into public.inquiries (
    customer_name, email, phone, company_name, website_url, service_type,
    budget_min, budget_max, desired_launch_date, message, source
  ) values (
    p_inquiry->>'customer_name', nullif(p_inquiry->>'email', ''), nullif(p_inquiry->>'phone', ''),
    nullif(p_inquiry->>'company_name', ''), nullif(p_inquiry->>'website_url', ''), p_inquiry->>'service_type',
    nullif(p_inquiry->>'budget_min', '')::integer, nullif(p_inquiry->>'budget_max', '')::integer,
    nullif(p_inquiry->>'desired_launch_date', '')::date, p_inquiry->>'message', nullif(p_inquiry->>'source', '')
  ) returning * into v_inquiry;

  perform public.enqueue_automation_job(v_inquiry.id, 'generate_inquiry_reply', jsonb_build_object('inquiry_id', v_inquiry.id));
  return query select v_inquiry.id, v_inquiry.status;
end;
$$;

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
  with claimable as (
    select id
    from public.automation_jobs
    where attempt_count < max_attempts
      and (
        (status in ('pending', 'retry') and available_at <= p_now)
        or (status = 'processing' and locked_at < p_now - interval '5 minutes')
      )
    order by available_at, created_at
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

revoke all on function public.enqueue_automation_job(uuid, public.automation_job_type, jsonb) from public, anon, authenticated;
revoke all on function public.create_inquiry_with_automation(jsonb) from public, anon, authenticated;
revoke all on function public.claim_automation_jobs(text, integer, timestamptz) from public, anon, authenticated;
grant execute on function public.enqueue_automation_job(uuid, public.automation_job_type, jsonb) to service_role;
grant execute on function public.create_inquiry_with_automation(jsonb) to service_role;
grant execute on function public.claim_automation_jobs(text, integer, timestamptz) to service_role;
