-- 이슈 #60: 견적 버전, 승인 토큰, 공개 승인 API의 데이터 무결성.
create type public.quote_status as enum (
  'draft',
  'sent',
  'approved',
  'expired',
  'cancelled'
);

create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid not null references public.inquiries(id) on delete restrict,
  status public.quote_status not null default 'draft',
  latest_version_id uuid,
  approved_version_id uuid,
  created_by uuid not null references public.admins(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.quote_versions (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  title text not null check (char_length(title) between 1 and 200),
  body text not null check (char_length(body) between 1 and 10000),
  scope_items jsonb not null,
  total_amount integer not null check (total_amount > 0),
  estimated_start_date date,
  estimated_end_date date,
  deposit_amount integer not null check (deposit_amount >= 0),
  balance_amount integer not null check (balance_amount >= 0),
  deposit_terms text not null check (char_length(deposit_terms) between 1 and 1000),
  balance_terms text not null check (char_length(balance_terms) between 1 and 1000),
  created_by uuid not null references public.admins(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (quote_id, version_number),
  check (deposit_amount + balance_amount = total_amount),
  check (
    estimated_start_date is null
    or estimated_end_date is null
    or estimated_end_date >= estimated_start_date
  )
);

create or replace function public.is_nonempty_text_array(value jsonb)
returns boolean
language sql
immutable
set search_path = public
as $$
  select jsonb_typeof(value) = 'array'
    and jsonb_array_length(value) between 1 and 100
    and not exists (
      select 1
      from jsonb_array_elements(value) as item
      where jsonb_typeof(item) <> 'string'
        or char_length(trim(both '"' from item::text)) not between 1 and 500
    );
$$;

alter table public.quote_versions
  add constraint quote_versions_scope_items_check
  check (jsonb_typeof(scope_items) = 'array' and public.is_nonempty_text_array(scope_items));

alter table public.quotes
  add constraint quotes_latest_version_id_fkey
  foreign key (latest_version_id) references public.quote_versions(id) on delete restrict,
  add constraint quotes_approved_version_id_fkey
  foreign key (approved_version_id) references public.quote_versions(id) on delete restrict;

create table public.quote_approval_tokens (
  id uuid primary key default gen_random_uuid(),
  quote_version_id uuid not null references public.quote_versions(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  used_at timestamptz,
  replaced_by_id uuid references public.quote_approval_tokens(id) on delete restrict,
  created_by uuid not null references public.admins(id) on delete restrict,
  created_at timestamptz not null default now(),
  check (expires_at > created_at),
  check (replaced_by_id is null or revoked_at is not null)
);

create unique index quote_approval_tokens_active_version_idx
  on public.quote_approval_tokens(quote_version_id)
  where revoked_at is null and used_at is null;

create table public.quote_approvals (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes(id) on delete restrict,
  quote_version_id uuid not null unique references public.quote_versions(id) on delete restrict,
  approval_token_id uuid not null unique references public.quote_approval_tokens(id) on delete restrict,
  approved_at timestamptz not null default now(),
  client_ip inet,
  user_agent text check (user_agent is null or char_length(user_agent) <= 500)
);

create index quotes_inquiry_id_created_at_idx
  on public.quotes(inquiry_id, created_at desc);
create index quote_versions_quote_id_version_idx
  on public.quote_versions(quote_id, version_number desc);
create index quote_approval_tokens_version_created_idx
  on public.quote_approval_tokens(quote_version_id, created_at desc);
create index quote_approvals_quote_id_approved_idx
  on public.quote_approvals(quote_id, approved_at desc);

create trigger quotes_set_updated_at
before update on public.quotes
for each row execute function public.set_updated_at();

create or replace function public.prevent_quote_version_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception using errcode = '55000', message = 'quote versions are immutable';
end;
$$;

create trigger prevent_quote_version_mutation
before update or delete on public.quote_versions
for each row execute function public.prevent_quote_version_mutation();

create or replace function public.prevent_quote_approval_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception using errcode = '55000', message = 'quote approvals are append-only';
end;
$$;

create trigger prevent_quote_approval_mutation
before update or delete on public.quote_approvals
for each row execute function public.prevent_quote_approval_mutation();

alter table public.quotes enable row level security;
alter table public.quote_versions enable row level security;
alter table public.quote_approval_tokens enable row level security;
alter table public.quote_approvals enable row level security;

create policy "admins can read quotes"
on public.quotes for select to authenticated
using (public.is_admin());

create policy "admins can read quote versions"
on public.quote_versions for select to authenticated
using (public.is_admin());

create policy "admins can read quote approval tokens"
on public.quote_approval_tokens for select to authenticated
using (public.is_admin());

create policy "admins can read quote approvals"
on public.quote_approvals for select to authenticated
using (public.is_admin());

revoke all on table public.quotes from anon, authenticated;
revoke all on table public.quote_versions from anon, authenticated;
revoke all on table public.quote_approval_tokens from anon, authenticated;
revoke all on table public.quote_approvals from anon, authenticated;
grant select on table public.quotes to authenticated;
grant select on table public.quote_versions to authenticated;
grant select on table public.quote_approval_tokens to authenticated;
grant select on table public.quote_approvals to authenticated;
grant all on table public.quotes to service_role;
grant all on table public.quote_versions to service_role;
grant all on table public.quote_approval_tokens to service_role;
grant all on table public.quote_approvals to service_role;

create or replace function public.create_quote_with_version(
  p_inquiry_id uuid,
  p_title text,
  p_body text,
  p_scope_items jsonb,
  p_total_amount integer,
  p_estimated_start_date date,
  p_estimated_end_date date,
  p_deposit_amount integer,
  p_balance_amount integer,
  p_deposit_terms text,
  p_balance_terms text
)
returns table (
  created_quote_id uuid,
  created_quote_version_id uuid,
  created_version_number integer,
  created_status public.quote_status
)
language plpgsql
security definer
set search_path = public
as $$
declare
  new_quote_id uuid;
  new_version_id uuid;
begin
  if not public.is_admin() then
    raise exception using errcode = '42501', message = 'admin access required';
  end if;

  perform 1 from public.inquiries where id = p_inquiry_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'inquiry not found';
  end if;

  insert into public.quotes (inquiry_id, created_by)
  values (p_inquiry_id, auth.uid())
  returning id into new_quote_id;

  insert into public.quote_versions (
    quote_id, version_number, title, body, scope_items, total_amount,
    estimated_start_date, estimated_end_date, deposit_amount, balance_amount,
    deposit_terms, balance_terms, created_by
  ) values (
    new_quote_id, 1, p_title, p_body, p_scope_items, p_total_amount,
    p_estimated_start_date, p_estimated_end_date, p_deposit_amount, p_balance_amount,
    p_deposit_terms, p_balance_terms, auth.uid()
  ) returning id into new_version_id;

  update public.quotes set latest_version_id = new_version_id where id = new_quote_id;

  return query select new_quote_id, new_version_id, 1, 'draft'::public.quote_status;
end;
$$;

create or replace function public.create_quote_version(
  p_quote_id uuid,
  p_title text,
  p_body text,
  p_scope_items jsonb,
  p_total_amount integer,
  p_estimated_start_date date,
  p_estimated_end_date date,
  p_deposit_amount integer,
  p_balance_amount integer,
  p_deposit_terms text,
  p_balance_terms text
)
returns table (
  created_quote_id uuid,
  created_quote_version_id uuid,
  created_version_number integer,
  created_status public.quote_status
)
language plpgsql
security definer
set search_path = public
as $$
declare
  quote_row public.quotes%rowtype;
  next_version integer;
  new_version_id uuid;
begin
  if not public.is_admin() then
    raise exception using errcode = '42501', message = 'admin access required';
  end if;

  select * into quote_row from public.quotes where id = p_quote_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'quote not found';
  end if;
  if quote_row.status = 'cancelled' then
    raise exception using errcode = 'P0001', message = 'quote is cancelled';
  end if;

  select coalesce(max(version_number), 0) + 1
  into next_version
  from public.quote_versions
  where quote_id = p_quote_id;

  insert into public.quote_versions (
    quote_id, version_number, title, body, scope_items, total_amount,
    estimated_start_date, estimated_end_date, deposit_amount, balance_amount,
    deposit_terms, balance_terms, created_by
  ) values (
    p_quote_id, next_version, p_title, p_body, p_scope_items, p_total_amount,
    p_estimated_start_date, p_estimated_end_date, p_deposit_amount, p_balance_amount,
    p_deposit_terms, p_balance_terms, auth.uid()
  ) returning id into new_version_id;

  update public.quote_approval_tokens as token
  set revoked_at = now()
  from public.quote_versions as version
  where token.quote_version_id = version.id
    and version.quote_id = p_quote_id
    and token.revoked_at is null
    and token.used_at is null;

  update public.quotes
  set latest_version_id = new_version_id,
      approved_version_id = null,
      status = 'draft'
  where id = p_quote_id;

  return query select p_quote_id, new_version_id, next_version, 'draft'::public.quote_status;
end;
$$;

create or replace function public.issue_quote_approval_token(
  p_quote_version_id uuid,
  p_token_hash text
)
returns table (
  issued_token_id uuid,
  issued_expires_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  quote_row public.quotes%rowtype;
  previous_token_id uuid;
  new_token_id uuid;
  new_expires_at timestamptz := now() + interval '7 days';
begin
  if not public.is_admin() then
    raise exception using errcode = '42501', message = 'admin access required';
  end if;
  if p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'invalid token hash';
  end if;

  select quote.* into quote_row
  from public.quote_versions as version
  join public.quotes as quote on quote.id = version.quote_id
  where version.id = p_quote_version_id
  for update of quote;

  if not found then
    raise exception using errcode = 'P0002', message = 'quote version not found';
  end if;
  if quote_row.status in ('approved', 'cancelled') then
    raise exception using errcode = 'P0001', message = 'quote cannot issue token';
  end if;
  if quote_row.latest_version_id <> p_quote_version_id then
    raise exception using errcode = 'P0001', message = 'quote version is not latest';
  end if;

  select id into previous_token_id
  from public.quote_approval_tokens
  where quote_version_id = p_quote_version_id
    and revoked_at is null
    and used_at is null
  for update;

  if previous_token_id is not null then
    update public.quote_approval_tokens
    set revoked_at = now()
    where id = previous_token_id;
  end if;

  insert into public.quote_approval_tokens (
    quote_version_id, token_hash, expires_at, created_by
  ) values (
    p_quote_version_id, p_token_hash, new_expires_at, auth.uid()
  ) returning id into new_token_id;

  if previous_token_id is not null then
    update public.quote_approval_tokens
    set replaced_by_id = new_token_id
    where id = previous_token_id;
  end if;

  update public.quotes set status = 'sent' where id = quote_row.id;

  return query select new_token_id, new_expires_at;
end;
$$;

create or replace function public.revoke_quote_approval_token(
  p_quote_version_id uuid
)
returns table (was_revoked boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  affected integer;
begin
  if not public.is_admin() then
    raise exception using errcode = '42501', message = 'admin access required';
  end if;

  perform 1 from public.quote_versions where id = p_quote_version_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'quote version not found';
  end if;

  update public.quote_approval_tokens
  set revoked_at = now()
  where quote_version_id = p_quote_version_id
    and revoked_at is null
    and used_at is null;
  get diagnostics affected = row_count;

  return query select affected > 0;
end;
$$;

create or replace function public.cancel_quote(p_quote_id uuid)
returns table (cancelled_quote_id uuid, cancelled_status public.quote_status)
language plpgsql
security definer
set search_path = public
as $$
declare
  quote_row public.quotes%rowtype;
begin
  if not public.is_admin() then
    raise exception using errcode = '42501', message = 'admin access required';
  end if;

  select * into quote_row from public.quotes where id = p_quote_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'quote not found';
  end if;

  update public.quote_approval_tokens as token
  set revoked_at = coalesce(token.revoked_at, now())
  from public.quote_versions as version
  where token.quote_version_id = version.id
    and version.quote_id = p_quote_id
    and token.revoked_at is null
    and token.used_at is null;

  update public.quotes set status = 'cancelled' where id = p_quote_id;
  return query select p_quote_id, 'cancelled'::public.quote_status;
end;
$$;

create or replace function public.get_public_quote_by_token(p_token_hash text)
returns table (
  availability text,
  quote_id uuid,
  quote_version_id uuid,
  version_number integer,
  customer_name text,
  title text,
  body text,
  scope_items jsonb,
  total_amount integer,
  estimated_start_date date,
  estimated_end_date date,
  deposit_amount integer,
  balance_amount integer,
  deposit_terms text,
  balance_terms text,
  expires_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result_row record;
  result_availability text;
begin
  select
    quote.id as quote_id,
    version.id as quote_version_id,
    version.version_number,
    inquiry.customer_name,
    version.title,
    version.body,
    version.scope_items,
    version.total_amount,
    version.estimated_start_date,
    version.estimated_end_date,
    version.deposit_amount,
    version.balance_amount,
    version.deposit_terms,
    version.balance_terms,
    token.expires_at,
    token.revoked_at,
    token.used_at,
    token.replaced_by_id,
    quote.status,
    quote.latest_version_id
  into result_row
  from public.quote_approval_tokens as token
  join public.quote_versions as version on version.id = token.quote_version_id
  join public.quotes as quote on quote.id = version.quote_id
  join public.inquiries as inquiry on inquiry.id = quote.inquiry_id
  where token.token_hash = p_token_hash;

  if not found then
    return query select 'unavailable'::text, null::uuid, null::uuid, null::integer,
      null::text, null::text, null::text, null::jsonb, null::integer,
      null::date, null::date, null::integer, null::integer, null::text,
      null::text, null::timestamptz;
    return;
  end if;

  result_availability := case
    when result_row.expires_at <= now() then 'expired'
    when result_row.revoked_at is not null
      or result_row.used_at is not null
      or result_row.replaced_by_id is not null
      or result_row.status in ('approved', 'cancelled')
      or result_row.latest_version_id <> result_row.quote_version_id
      then 'unavailable'
    else 'available'
  end;

  if result_availability <> 'available' then
    return query select result_availability, null::uuid, null::uuid, null::integer,
      null::text, null::text, null::text, null::jsonb, null::integer,
      null::date, null::date, null::integer, null::integer, null::text,
      null::text, result_row.expires_at;
    return;
  end if;

  return query select result_availability, result_row.quote_id,
    result_row.quote_version_id, result_row.version_number,
    result_row.customer_name, result_row.title, result_row.body,
    result_row.scope_items, result_row.total_amount,
    result_row.estimated_start_date, result_row.estimated_end_date,
    result_row.deposit_amount, result_row.balance_amount,
    result_row.deposit_terms, result_row.balance_terms, result_row.expires_at;
end;
$$;

create or replace function public.approve_quote_by_token(
  p_token_hash text,
  p_client_ip text default null,
  p_user_agent text default null
)
returns table (
  result text,
  approved_quote_id uuid,
  approved_quote_version_id uuid,
  approved_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  token_row public.quote_approval_tokens%rowtype;
  version_row public.quote_versions%rowtype;
  quote_row public.quotes%rowtype;
  approval_time timestamptz := now();
begin
  select token.* into token_row
  from public.quote_approval_tokens as token
  where token.token_hash = p_token_hash
  for update;

  if not found then
    return query select 'unavailable'::text, null::uuid, null::uuid, null::timestamptz;
    return;
  end if;

  select * into version_row
  from public.quote_versions
  where id = token_row.quote_version_id;

  select * into quote_row
  from public.quotes
  where id = version_row.quote_id
  for update;

  if token_row.expires_at <= approval_time then
    return query select 'expired'::text, null::uuid, null::uuid, null::timestamptz;
    return;
  end if;

  if token_row.revoked_at is not null
    or token_row.used_at is not null
    or token_row.replaced_by_id is not null
    or quote_row.status in ('approved', 'cancelled')
    or quote_row.latest_version_id <> version_row.id then
    return query select 'unavailable'::text, null::uuid, null::uuid, null::timestamptz;
    return;
  end if;

  insert into public.quote_approvals (
    quote_id, quote_version_id, approval_token_id, approved_at, client_ip, user_agent
  ) values (
    quote_row.id, version_row.id, token_row.id, approval_time,
    nullif(p_client_ip, '')::inet,
    left(nullif(p_user_agent, ''), 500)
  );

  update public.quote_approval_tokens
  set used_at = approval_time
  where id = token_row.id;

  update public.quotes
  set status = 'approved', approved_version_id = version_row.id
  where id = quote_row.id;

  return query select 'approved'::text, quote_row.id, version_row.id, approval_time;
end;
$$;

revoke all on function public.create_quote_with_version(uuid, text, text, jsonb, integer, date, date, integer, integer, text, text) from public;
revoke all on function public.create_quote_version(uuid, text, text, jsonb, integer, date, date, integer, integer, text, text) from public;
revoke all on function public.issue_quote_approval_token(uuid, text) from public;
revoke all on function public.revoke_quote_approval_token(uuid) from public;
revoke all on function public.cancel_quote(uuid) from public;
revoke all on function public.get_public_quote_by_token(text) from public;
revoke all on function public.approve_quote_by_token(text, text, text) from public;

grant execute on function public.create_quote_with_version(uuid, text, text, jsonb, integer, date, date, integer, integer, text, text) to authenticated, service_role;
grant execute on function public.create_quote_version(uuid, text, text, jsonb, integer, date, date, integer, integer, text, text) to authenticated, service_role;
grant execute on function public.issue_quote_approval_token(uuid, text) to authenticated, service_role;
grant execute on function public.revoke_quote_approval_token(uuid) to authenticated, service_role;
grant execute on function public.cancel_quote(uuid) to authenticated, service_role;
grant execute on function public.get_public_quote_by_token(text) to anon, authenticated, service_role;
grant execute on function public.approve_quote_by_token(text, text, text) to anon, authenticated, service_role;
