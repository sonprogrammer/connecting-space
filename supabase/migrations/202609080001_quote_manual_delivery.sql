-- 이슈 #67: 견적 PDF 수동 발급, 멱등 재다운로드 및 감사 이력.
create type public.quote_delivery_method as enum ('email', 'manual');

alter table public.quotes
  add column delivery_method public.quote_delivery_method;

create table public.quote_manual_deliveries (
  id uuid primary key,
  quote_id uuid not null references public.quotes(id) on delete restrict,
  quote_version_id uuid not null references public.quote_versions(id) on delete restrict,
  approval_token_id uuid not null unique references public.quote_approval_tokens(id) on delete restrict,
  generation integer not null check (generation > 0),
  idempotency_key_hash text not null check (idempotency_key_hash ~ '^[0-9a-f]{64}$'),
  issued_at timestamptz not null,
  expires_at timestamptz not null,
  superseded_at timestamptz,
  created_by uuid not null references public.admins(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (quote_version_id, generation),
  unique (quote_version_id, idempotency_key_hash),
  check (expires_at = issued_at + interval '7 days')
);

create unique index quote_manual_deliveries_current_version_idx
  on public.quote_manual_deliveries(quote_version_id)
  where superseded_at is null;
create index quote_manual_deliveries_quote_created_idx
  on public.quote_manual_deliveries(quote_id, created_at desc);

create or replace function public.supersede_quote_manual_delivery_on_token_close()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (new.revoked_at is not null and old.revoked_at is null)
     or (new.used_at is not null and old.used_at is null) then
    update public.quote_manual_deliveries
    set superseded_at = coalesce(
      superseded_at,
      coalesce(new.used_at, new.revoked_at, now())
    )
    where approval_token_id = new.id
      and superseded_at is null;
  end if;
  return new;
end;
$$;

create trigger supersede_quote_manual_delivery_on_token_close
after update of revoked_at, used_at on public.quote_approval_tokens
for each row execute function public.supersede_quote_manual_delivery_on_token_close();

create or replace function public.clear_quote_delivery_method_for_draft()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'draft' then
    new.delivery_method := null;
  end if;
  return new;
end;
$$;

create trigger clear_quote_delivery_method_for_draft
before update of status on public.quotes
for each row execute function public.clear_quote_delivery_method_for_draft();

alter table public.quote_manual_deliveries enable row level security;
create policy "admins can read quote manual deliveries"
on public.quote_manual_deliveries for select to authenticated
using (public.is_admin());

revoke all on table public.quote_manual_deliveries from public, anon, authenticated;
grant select on table public.quote_manual_deliveries to authenticated;
grant all on table public.quote_manual_deliveries to service_role;

create or replace function public.issue_quote_manual_delivery(
  p_delivery_id uuid,
  p_quote_version_id uuid,
  p_token_id uuid,
  p_token_hash text,
  p_idempotency_key_hash text,
  p_reissue boolean default false,
  p_issued_at timestamptz default now()
)
returns table (result text, delivery public.quote_manual_deliveries)
language plpgsql
security definer
set search_path = public
as $$
declare
  quote_row public.quotes%rowtype;
  existing_delivery public.quote_manual_deliveries%rowtype;
  active_token public.quote_approval_tokens%rowtype;
  created_delivery public.quote_manual_deliveries%rowtype;
  next_generation integer;
  expires_at timestamptz;
begin
  if not public.is_admin() then
    raise exception using errcode = '42501', message = 'admin access required';
  end if;
  if p_token_hash !~ '^[0-9a-f]{64}$'
     or p_idempotency_key_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'invalid hash';
  end if;
  if p_issued_at is null
     or p_issued_at < now() - interval '5 minutes'
     or p_issued_at > now() + interval '5 minutes' then
    raise exception using errcode = '22023', message = 'invalid issued time';
  end if;
  expires_at := p_issued_at + interval '7 days';

  select quote.* into quote_row
  from public.quote_versions version
  join public.quotes quote on quote.id = version.quote_id
  where version.id = p_quote_version_id
  for update of quote;
  if not found then
    raise exception using errcode = 'P0002', message = 'quote version not found';
  end if;

  select * into existing_delivery
  from public.quote_manual_deliveries
  where quote_version_id = p_quote_version_id
    and idempotency_key_hash = p_idempotency_key_hash;
  if found then
    select * into active_token
    from public.quote_approval_tokens
    where id = existing_delivery.approval_token_id;
    if existing_delivery.superseded_at is null
       and active_token.revoked_at is null
       and active_token.used_at is null
       and active_token.expires_at > now()
       and quote_row.latest_version_id = p_quote_version_id
       and quote_row.status = 'sent'
       and quote_row.delivery_method = 'manual' then
      return query select 'existing'::text, existing_delivery;
      return;
    end if;
    raise exception using errcode = 'P0001', message = 'idempotency key is no longer active';
  end if;

  if quote_row.latest_version_id <> p_quote_version_id
     or quote_row.status in ('approved', 'cancelled') then
    raise exception using errcode = 'P0001', message = 'quote unavailable';
  end if;

  select * into active_token
  from public.quote_approval_tokens
  where quote_version_id = p_quote_version_id
    and revoked_at is null
    and used_at is null
  for update;
  if found and not p_reissue then
    raise exception using errcode = 'P0001', message = 'active delivery requires reissue';
  end if;

  select coalesce(max(generation), 0) + 1 into next_generation
  from public.quote_manual_deliveries
  where quote_version_id = p_quote_version_id;

  if active_token.id is not null then
    update public.quote_approval_tokens
    set revoked_at = p_issued_at
    where id = active_token.id;
  end if;

  insert into public.quote_approval_tokens (
    id, quote_version_id, token_hash, expires_at, created_by, created_at
  ) values (
    p_token_id, p_quote_version_id, p_token_hash, expires_at, auth.uid(), p_issued_at
  );

  if active_token.id is not null then
    update public.quote_approval_tokens
    set replaced_by_id = p_token_id
    where id = active_token.id;
  end if;

  insert into public.quote_manual_deliveries (
    id, quote_id, quote_version_id, approval_token_id, generation,
    idempotency_key_hash, issued_at, expires_at, created_by, created_at
  ) values (
    p_delivery_id, quote_row.id, p_quote_version_id, p_token_id, next_generation,
    p_idempotency_key_hash, p_issued_at, expires_at, auth.uid(), p_issued_at
  ) returning * into created_delivery;

  update public.quotes
  set status = 'sent', delivery_method = 'manual'
  where id = quote_row.id;

  return query select 'created'::text, created_delivery;
end;
$$;

-- 자동 이메일 경로는 Resend 성공 뒤에만 email 발송 방식으로 기록한다.
create or replace function public.finalize_quote_email_delivery(
  p_job_id uuid,
  p_provider_message_id text,
  p_sent_at timestamptz default now()
)
returns public.quote_email_deliveries
language plpgsql
security definer
set search_path = public
as $$
declare
  delivery public.quote_email_deliveries%rowtype;
begin
  select * into delivery
  from public.quote_email_deliveries
  where id = p_job_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'delivery not found';
  end if;
  if delivery.status = 'sent' then
    return delivery;
  end if;
  if delivery.superseded_at is not null then
    raise exception using errcode = 'P0001', message = 'delivery unavailable';
  end if;

  update public.quote_approval_tokens
  set expires_at = p_sent_at + interval '7 days'
  where id = delivery.approval_token_id
    and revoked_at is null
    and used_at is null;
  if not found then
    raise exception using errcode = 'P0001', message = 'token unavailable';
  end if;

  update public.quotes
  set status = 'sent', delivery_method = 'email'
  where id = delivery.quote_id
    and status not in ('approved', 'cancelled');
  if not found then
    raise exception using errcode = 'P0001', message = 'quote unavailable';
  end if;

  update public.quote_email_deliveries
  set status = 'sent',
      provider_message_id = p_provider_message_id,
      sent_at = p_sent_at,
      completed_at = p_sent_at,
      locked_at = null,
      locked_by = null,
      error_code = null
  where id = p_job_id
  returning * into delivery;
  return delivery;
end;
$$;

revoke all on function public.issue_quote_manual_delivery(uuid, uuid, uuid, text, text, boolean, timestamptz) from public;
grant execute on function public.issue_quote_manual_delivery(uuid, uuid, uuid, text, text, boolean, timestamptz) to authenticated, service_role;
