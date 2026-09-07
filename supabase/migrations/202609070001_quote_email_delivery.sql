-- 이슈 #62: 암호화 견적 이메일 작업, 재시도, 만료 및 Slack 알림.
create type public.quote_delivery_status as enum ('queued', 'processing', 'retry', 'sent', 'failed');

alter table public.quote_approval_tokens alter column expires_at drop not null;

create table public.quote_email_deliveries (
  id uuid primary key,
  quote_id uuid not null references public.quotes(id) on delete restrict,
  quote_version_id uuid not null references public.quote_versions(id) on delete restrict,
  approval_token_id uuid not null unique references public.quote_approval_tokens(id) on delete restrict,
  generation integer not null check (generation > 0),
  status public.quote_delivery_status not null default 'queued',
  encrypted_payload text not null check (char_length(encrypted_payload) > 0),
  payload_nonce text not null check (char_length(payload_nonce) > 0),
  payload_auth_tag text not null check (char_length(payload_auth_tag) > 0),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  max_attempts integer not null default 3 check (max_attempts between 1 and 10),
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  provider_message_id text,
  dispatch_started_at timestamptz,
  error_code text check (error_code is null or char_length(error_code) <= 100),
  sent_at timestamptz,
  completed_at timestamptz,
  superseded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (quote_version_id, generation)
);

create unique index quote_email_deliveries_current_version_idx
  on public.quote_email_deliveries(quote_version_id)
  where superseded_at is null;
create index quote_email_deliveries_claim_idx
  on public.quote_email_deliveries(status, available_at, created_at);

create table public.quote_expiration_alerts (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes(id) on delete restrict,
  quote_version_id uuid not null references public.quote_versions(id) on delete restrict,
  approval_token_id uuid not null references public.quote_approval_tokens(id) on delete restrict,
  status public.quote_delivery_status not null default 'queued',
  attempt_count integer not null default 0 check (attempt_count >= 0),
  max_attempts integer not null default 3 check (max_attempts between 1 and 10),
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  error_code text check (error_code is null or char_length(error_code) <= 100),
  sent_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (approval_token_id)
);

create index quote_expiration_alerts_claim_idx
  on public.quote_expiration_alerts(status, available_at, created_at);

create trigger quote_email_deliveries_set_updated_at before update on public.quote_email_deliveries
for each row execute function public.set_updated_at();
create trigger quote_expiration_alerts_set_updated_at before update on public.quote_expiration_alerts
for each row execute function public.set_updated_at();

create or replace function public.supersede_quote_email_delivery_on_token_close()
returns trigger language plpgsql set search_path = public as $$
begin
  if (new.revoked_at is not null and old.revoked_at is null)
     or (new.used_at is not null and old.used_at is null) then
    update public.quote_email_deliveries
    set superseded_at = coalesce(superseded_at, coalesce(new.used_at, new.revoked_at, now()))
    where approval_token_id = new.id and superseded_at is null;
  end if;
  return new;
end;
$$;
create trigger supersede_quote_email_delivery_on_token_close
after update of revoked_at, used_at on public.quote_approval_tokens
for each row execute function public.supersede_quote_email_delivery_on_token_close();

alter table public.quote_email_deliveries enable row level security;
alter table public.quote_expiration_alerts enable row level security;
create policy "admins can read quote email deliveries" on public.quote_email_deliveries
for select to authenticated using (public.is_admin());
create policy "admins can read quote expiration alerts" on public.quote_expiration_alerts
for select to authenticated using (public.is_admin());
revoke all on table public.quote_email_deliveries from public, anon, authenticated;
revoke all on table public.quote_expiration_alerts from public, anon, authenticated;
grant select on table public.quote_email_deliveries to authenticated;
grant select on table public.quote_expiration_alerts to authenticated;
grant all on table public.quote_email_deliveries to service_role;
grant all on table public.quote_expiration_alerts to service_role;

create or replace function public.enqueue_quote_email_delivery(
  p_job_id uuid, p_quote_version_id uuid, p_token_id uuid, p_token_hash text,
  p_encrypted_payload text, p_payload_nonce text, p_payload_auth_tag text,
  p_now timestamptz default now()
)
returns table (result text, delivery public.quote_email_deliveries)
language plpgsql security definer set search_path = public as $$
declare
  quote_row public.quotes%rowtype;
  current_delivery public.quote_email_deliveries%rowtype;
  current_token public.quote_approval_tokens%rowtype;
  next_generation integer;
  created_delivery public.quote_email_deliveries%rowtype;
begin
  if p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'invalid token hash';
  end if;
  if not public.is_admin() then raise exception using errcode = '42501', message = 'admin access required'; end if;

  select quote.* into quote_row
  from public.quote_versions version
  join public.quotes quote on quote.id = version.quote_id
  where version.id = p_quote_version_id
  for update of quote;
  if not found then raise exception using errcode = 'P0002', message = 'quote version not found'; end if;
  if quote_row.latest_version_id <> p_quote_version_id or quote_row.status in ('approved', 'cancelled') then
    raise exception using errcode = 'P0001', message = 'quote unavailable';
  end if;

  select * into current_delivery from public.quote_email_deliveries
  where quote_version_id = p_quote_version_id and superseded_at is null
  for update;
  if found then
    select * into current_token from public.quote_approval_tokens where id = current_delivery.approval_token_id;
    if current_token.revoked_at is null and current_token.used_at is null
       and (current_token.expires_at is null or current_token.expires_at > p_now) then
      if current_delivery.status = 'failed' then
        return query select 'retry_required'::text, current_delivery;
        return;
      end if;
      return query select 'existing'::text, current_delivery;
      return;
    end if;
    update public.quote_email_deliveries set superseded_at = p_now where id = current_delivery.id;
    update public.quote_approval_tokens set revoked_at = coalesce(revoked_at, p_now)
      where id = current_delivery.approval_token_id and used_at is null;
  end if;

  select coalesce(max(generation), 0) + 1 into next_generation
  from public.quote_email_deliveries where quote_version_id = p_quote_version_id;
  insert into public.quote_approval_tokens(id, quote_version_id, token_hash, expires_at, created_by)
  values (p_token_id, p_quote_version_id, p_token_hash, null, auth.uid());
  insert into public.quote_email_deliveries(
    id, quote_id, quote_version_id, approval_token_id, generation,
    encrypted_payload, payload_nonce, payload_auth_tag, available_at
  ) values (
    p_job_id, quote_row.id, p_quote_version_id, p_token_id, next_generation,
    p_encrypted_payload, p_payload_nonce, p_payload_auth_tag, p_now
  ) returning * into created_delivery;
  return query select 'created'::text, created_delivery;
end;
$$;

create or replace function public.claim_quote_email_deliveries(
  p_worker_id text, p_limit integer default 5, p_now timestamptz default now()
)
returns setof public.quote_email_deliveries
language sql security definer set search_path = public as $$
  with claimable as (
    select delivery.id from public.quote_email_deliveries delivery
    join public.quote_approval_tokens token on token.id = delivery.approval_token_id
    join public.quotes quote on quote.id = delivery.quote_id
    where delivery.superseded_at is null
      and delivery.attempt_count < delivery.max_attempts
      and token.revoked_at is null and token.used_at is null
      and quote.latest_version_id = delivery.quote_version_id
      and quote.status not in ('approved', 'cancelled')
      and ((delivery.status in ('queued', 'retry') and delivery.available_at <= p_now)
        or (delivery.status = 'processing' and delivery.locked_at < p_now - interval '5 minutes'))
    order by delivery.available_at, delivery.created_at
    for update of delivery skip locked
    limit greatest(1, least(coalesce(p_limit, 5), 20))
  )
  update public.quote_email_deliveries delivery set
    status = 'processing', attempt_count = delivery.attempt_count + 1,
    locked_at = p_now, locked_by = p_worker_id, error_code = null,
    dispatch_started_at = coalesce(delivery.dispatch_started_at, p_now)
  from claimable where delivery.id = claimable.id returning delivery.*;
$$;

create or replace function public.finalize_quote_email_delivery(
  p_job_id uuid, p_provider_message_id text, p_sent_at timestamptz default now()
)
returns public.quote_email_deliveries
language plpgsql security definer set search_path = public as $$
declare delivery public.quote_email_deliveries%rowtype;
begin
  select * into delivery from public.quote_email_deliveries where id = p_job_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'delivery not found'; end if;
  if delivery.status = 'sent' then return delivery; end if;
  if delivery.superseded_at is not null then raise exception using errcode = 'P0001', message = 'delivery unavailable'; end if;
  update public.quote_approval_tokens set expires_at = p_sent_at + interval '7 days'
    where id = delivery.approval_token_id and revoked_at is null and used_at is null;
  if not found then raise exception using errcode = 'P0001', message = 'token unavailable'; end if;
  update public.quotes set status = 'sent' where id = delivery.quote_id and status not in ('approved', 'cancelled');
  if not found then raise exception using errcode = 'P0001', message = 'quote unavailable'; end if;
  update public.quote_email_deliveries set status = 'sent', provider_message_id = p_provider_message_id,
    sent_at = p_sent_at, completed_at = p_sent_at, locked_at = null, locked_by = null, error_code = null
    where id = p_job_id returning * into delivery;
  return delivery;
end;
$$;

create or replace function public.fail_quote_email_delivery(
  p_job_id uuid, p_error_code text, p_now timestamptz default now()
)
returns public.quote_email_deliveries
language plpgsql security definer set search_path = public as $$
declare delivery public.quote_email_deliveries%rowtype;
begin
  update public.quote_email_deliveries set
    status = case when attempt_count >= max_attempts then 'failed'::public.quote_delivery_status else 'retry'::public.quote_delivery_status end,
    available_at = p_now + make_interval(mins => (2 ^ greatest(attempt_count - 1, 0))::integer),
    locked_at = null, locked_by = null, error_code = left(p_error_code, 100)
  where id = p_job_id and status = 'processing' returning * into delivery;
  return delivery;
end;
$$;

create or replace function public.retry_quote_email_delivery(p_job_id uuid, p_now timestamptz default now())
returns table (result text, delivery public.quote_email_deliveries)
language plpgsql security definer set search_path = public as $$
declare job public.quote_email_deliveries%rowtype; token public.quote_approval_tokens%rowtype; quote_row public.quotes%rowtype;
begin
  if not public.is_admin() then raise exception using errcode = '42501', message = 'admin access required'; end if;
  select * into job from public.quote_email_deliveries where id = p_job_id for update;
  if not found then return query select 'not_found'::text, job; return; end if;
  if job.status in ('queued', 'processing', 'retry', 'sent') then return query select 'existing'::text, job; return; end if;
  select * into token from public.quote_approval_tokens where id = job.approval_token_id;
  select * into quote_row from public.quotes where id = job.quote_id for update;
  if job.superseded_at is not null or token.revoked_at is not null or token.used_at is not null
    or (token.expires_at is not null and token.expires_at <= p_now) then
    return query select 'reissue_required'::text, job; return;
  end if;
  if quote_row.status in ('approved', 'cancelled') or quote_row.latest_version_id <> job.quote_version_id then
    return query select 'unavailable'::text, job; return;
  end if;
  update public.quote_email_deliveries set status = 'queued', attempt_count = 0,
    available_at = p_now, locked_at = null, locked_by = null, error_code = null
    where id = p_job_id returning * into job;
  return query select 'requeued'::text, job;
end;
$$;

create or replace function public.schedule_quote_lifecycle(p_now timestamptz default now())
returns table (expired_count integer, alert_count integer)
language plpgsql security definer set search_path = public as $$
declare expired_rows integer; alert_rows integer;
begin
  with expired as (
    update public.quote_approval_tokens token set revoked_at = coalesce(token.revoked_at, p_now)
    from public.quote_versions version, public.quotes quote
    where version.id = token.quote_version_id and quote.id = version.quote_id
      and quote.status = 'sent' and token.expires_at is not null and token.expires_at <= p_now
      and token.revoked_at is null and token.used_at is null
    returning quote.id as quote_id, version.id as quote_version_id, token.id as token_id
  ), expired_quotes as (
    update public.quotes quote set status = 'expired'
    from expired where quote.id = expired.quote_id returning quote.id
  )
  update public.quote_email_deliveries delivery set superseded_at = coalesce(delivery.superseded_at, p_now)
  from expired where delivery.approval_token_id = expired.token_id;
  get diagnostics expired_rows = row_count;

  insert into public.quote_expiration_alerts(quote_id, quote_version_id, approval_token_id, available_at)
  select quote.id, version.id, token.id, p_now
  from public.quote_approval_tokens token
  join public.quote_versions version on version.id = token.quote_version_id
  join public.quotes quote on quote.id = version.quote_id
  where quote.status = 'sent' and quote.latest_version_id = version.id
    and token.expires_at > p_now and token.expires_at <= p_now + interval '1 day'
    and token.revoked_at is null and token.used_at is null and token.replaced_by_id is null
  on conflict (approval_token_id) do nothing;
  get diagnostics alert_rows = row_count;
  return query select expired_rows, alert_rows;
end;
$$;

create or replace function public.claim_quote_expiration_alerts(
  p_worker_id text, p_limit integer default 5, p_now timestamptz default now()
)
returns setof public.quote_expiration_alerts
language sql security definer set search_path = public as $$
  with claimable as (
    select alert.id from public.quote_expiration_alerts alert
    join public.quote_approval_tokens token on token.id = alert.approval_token_id
    join public.quotes quote on quote.id = alert.quote_id
    where alert.attempt_count < alert.max_attempts and quote.status = 'sent'
      and token.expires_at > p_now and token.revoked_at is null and token.used_at is null
      and ((alert.status in ('queued', 'retry') and alert.available_at <= p_now)
        or (alert.status = 'processing' and alert.locked_at < p_now - interval '5 minutes'))
    order by alert.available_at, alert.created_at
    for update of alert skip locked limit greatest(1, least(coalesce(p_limit, 5), 20))
  )
  update public.quote_expiration_alerts alert set status = 'processing',
    attempt_count = alert.attempt_count + 1, locked_at = p_now, locked_by = p_worker_id, error_code = null
  from claimable where alert.id = claimable.id returning alert.*;
$$;

create or replace function public.finalize_quote_expiration_alert(p_alert_id uuid, p_sent_at timestamptz default now())
returns public.quote_expiration_alerts language sql security definer set search_path = public as $$
  update public.quote_expiration_alerts set status = 'sent', sent_at = p_sent_at,
    completed_at = p_sent_at, locked_at = null, locked_by = null, error_code = null
  where id = p_alert_id returning *;
$$;

create or replace function public.fail_quote_expiration_alert(p_alert_id uuid, p_error_code text, p_now timestamptz default now())
returns public.quote_expiration_alerts language sql security definer set search_path = public as $$
  update public.quote_expiration_alerts set
    status = case when attempt_count >= max_attempts then 'failed'::public.quote_delivery_status else 'retry'::public.quote_delivery_status end,
    available_at = p_now + make_interval(mins => (2 ^ greatest(attempt_count - 1, 0))::integer),
    locked_at = null, locked_by = null, error_code = left(p_error_code, 100)
  where id = p_alert_id and status = 'processing' returning *;
$$;

-- Token issuance no longer implies successful delivery.
create or replace function public.issue_quote_approval_token(p_quote_version_id uuid, p_token_hash text)
returns table (issued_token_id uuid, issued_expires_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare quote_row public.quotes%rowtype; previous_token_id uuid; new_token_id uuid; new_expires_at timestamptz := now() + interval '7 days';
begin
  if not public.is_admin() then raise exception using errcode = '42501', message = 'admin access required'; end if;
  if p_token_hash !~ '^[0-9a-f]{64}$' then raise exception using errcode = '22023', message = 'invalid token hash'; end if;
  select quote.* into quote_row from public.quote_versions version join public.quotes quote on quote.id = version.quote_id
    where version.id = p_quote_version_id for update of quote;
  if not found then raise exception using errcode = 'P0002', message = 'quote version not found'; end if;
  if quote_row.status in ('approved', 'cancelled') or quote_row.latest_version_id <> p_quote_version_id then
    raise exception using errcode = 'P0001', message = 'quote cannot issue token';
  end if;
  select id into previous_token_id from public.quote_approval_tokens
    where quote_version_id = p_quote_version_id and revoked_at is null and used_at is null for update;
  if previous_token_id is not null then update public.quote_approval_tokens set revoked_at = now() where id = previous_token_id; end if;
  insert into public.quote_approval_tokens(quote_version_id, token_hash, expires_at, created_by)
    values (p_quote_version_id, p_token_hash, new_expires_at, auth.uid()) returning id into new_token_id;
  if previous_token_id is not null then update public.quote_approval_tokens set replaced_by_id = new_token_id where id = previous_token_id; end if;
  return query select new_token_id, new_expires_at;
end;
$$;

-- Public functions are replaced below to require a successfully sent quote.
create or replace function public.get_public_quote_by_token(p_token_hash text)
returns table (availability text, quote_id uuid, quote_version_id uuid, version_number integer,
  customer_name text, title text, body text, scope_items jsonb, total_amount integer,
  estimated_start_date date, estimated_end_date date, deposit_amount integer, balance_amount integer,
  deposit_terms text, balance_terms text, expires_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare result_row record; result_availability text;
begin
  select quote.id quote_id, version.id quote_version_id, version.version_number, inquiry.customer_name,
    version.title, version.body, version.scope_items, version.total_amount, version.estimated_start_date,
    version.estimated_end_date, version.deposit_amount, version.balance_amount, version.deposit_terms,
    version.balance_terms, token.expires_at, token.revoked_at, token.used_at, token.replaced_by_id,
    quote.status, quote.latest_version_id into result_row
  from public.quote_approval_tokens token join public.quote_versions version on version.id = token.quote_version_id
  join public.quotes quote on quote.id = version.quote_id join public.inquiries inquiry on inquiry.id = quote.inquiry_id
  where token.token_hash = p_token_hash;
  if not found then
    return query select 'unavailable'::text, null::uuid, null::uuid, null::integer, null::text, null::text,
      null::text, null::jsonb, null::integer, null::date, null::date, null::integer, null::integer,
      null::text, null::text, null::timestamptz; return;
  end if;
  result_availability := case
    when result_row.expires_at is not null and result_row.expires_at <= now() then 'expired'
    when result_row.status <> 'sent' or result_row.expires_at is null or result_row.revoked_at is not null
      or result_row.used_at is not null or result_row.replaced_by_id is not null
      or result_row.latest_version_id <> result_row.quote_version_id then 'unavailable'
    else 'available' end;
  if result_availability <> 'available' then
    return query select result_availability, null::uuid, null::uuid, null::integer, null::text, null::text,
      null::text, null::jsonb, null::integer, null::date, null::date, null::integer, null::integer,
      null::text, null::text, result_row.expires_at; return;
  end if;
  return query select result_availability, result_row.quote_id, result_row.quote_version_id,
    result_row.version_number, result_row.customer_name, result_row.title, result_row.body,
    result_row.scope_items, result_row.total_amount, result_row.estimated_start_date,
    result_row.estimated_end_date, result_row.deposit_amount, result_row.balance_amount,
    result_row.deposit_terms, result_row.balance_terms, result_row.expires_at;
end;
$$;

create or replace function public.approve_quote_by_token(p_token_hash text, p_client_ip text default null, p_user_agent text default null)
returns table (result text, approved_quote_id uuid, approved_quote_version_id uuid, approved_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare token_row public.quote_approval_tokens%rowtype; version_row public.quote_versions%rowtype;
  quote_row public.quotes%rowtype; approval_time timestamptz := now();
begin
  select * into token_row from public.quote_approval_tokens where token_hash = p_token_hash for update;
  if not found then return query select 'unavailable'::text, null::uuid, null::uuid, null::timestamptz; return; end if;
  select * into version_row from public.quote_versions where id = token_row.quote_version_id;
  select * into quote_row from public.quotes where id = version_row.quote_id for update;
  if token_row.expires_at is not null and token_row.expires_at <= approval_time then
    return query select 'expired'::text, null::uuid, null::uuid, null::timestamptz; return;
  end if;
  if quote_row.status <> 'sent' or token_row.expires_at is null or token_row.revoked_at is not null
    or token_row.used_at is not null or token_row.replaced_by_id is not null
    or quote_row.latest_version_id <> version_row.id then
    return query select 'unavailable'::text, null::uuid, null::uuid, null::timestamptz; return;
  end if;
  insert into public.quote_approvals(quote_id, quote_version_id, approval_token_id, approved_at, client_ip, user_agent)
    values (quote_row.id, version_row.id, token_row.id, approval_time,
      nullif(p_client_ip, '')::inet, left(nullif(p_user_agent, ''), 500));
  update public.quote_approval_tokens set used_at = approval_time where id = token_row.id;
  update public.quote_email_deliveries set superseded_at = approval_time
    where approval_token_id = token_row.id and superseded_at is null;
  update public.quotes set status = 'approved', approved_version_id = version_row.id where id = quote_row.id;
  return query select 'approved'::text, quote_row.id, version_row.id, approval_time;
end;
$$;

revoke all on function public.enqueue_quote_email_delivery(uuid, uuid, uuid, text, text, text, text, timestamptz) from public;
revoke all on function public.claim_quote_email_deliveries(text, integer, timestamptz) from public;
revoke all on function public.finalize_quote_email_delivery(uuid, text, timestamptz) from public;
revoke all on function public.fail_quote_email_delivery(uuid, text, timestamptz) from public;
revoke all on function public.retry_quote_email_delivery(uuid, timestamptz) from public;
revoke all on function public.schedule_quote_lifecycle(timestamptz) from public;
revoke all on function public.claim_quote_expiration_alerts(text, integer, timestamptz) from public;
revoke all on function public.finalize_quote_expiration_alert(uuid, timestamptz) from public;
revoke all on function public.fail_quote_expiration_alert(uuid, text, timestamptz) from public;
grant execute on function public.enqueue_quote_email_delivery(uuid, uuid, uuid, text, text, text, text, timestamptz) to authenticated, service_role;
grant execute on function public.claim_quote_email_deliveries(text, integer, timestamptz) to service_role;
grant execute on function public.finalize_quote_email_delivery(uuid, text, timestamptz) to service_role;
grant execute on function public.fail_quote_email_delivery(uuid, text, timestamptz) to service_role;
grant execute on function public.retry_quote_email_delivery(uuid, timestamptz) to authenticated, service_role;
grant execute on function public.schedule_quote_lifecycle(timestamptz) to service_role;
grant execute on function public.claim_quote_expiration_alerts(text, integer, timestamptz) to service_role;
grant execute on function public.finalize_quote_expiration_alert(uuid, timestamptz) to service_role;
grant execute on function public.fail_quote_expiration_alert(uuid, text, timestamptz) to service_role;
