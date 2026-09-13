-- Issue #61: confirm a signed quote and atomically create the project payment plan.

create table public.quote_contract_confirmations (
  id uuid primary key,
  quote_id uuid not null references public.quotes(id) on delete restrict,
  quote_version_id uuid not null unique references public.quote_versions(id) on delete restrict,
  idempotency_key_hash text not null check (idempotency_key_hash ~ '^[0-9a-f]{64}$'),
  confirmed_at timestamptz not null,
  confirmed_by uuid not null references public.admins(id) on delete restrict,
  customer_id uuid not null references public.customers(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete restrict,
  deposit_payment_id uuid not null references public.payments(id) on delete restrict,
  balance_payment_id uuid not null references public.payments(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (quote_version_id, idempotency_key_hash)
);

create unique index payments_project_deposit_balance_idx
  on public.payments(project_id, kind)
  where kind in ('deposit', 'balance');

alter table public.quote_contract_confirmations enable row level security;
create policy "admins can read quote contract confirmations"
on public.quote_contract_confirmations for select to authenticated
using (public.is_admin());
revoke all on table public.quote_contract_confirmations from public, anon, authenticated;
grant select on table public.quote_contract_confirmations to authenticated;
grant all on table public.quote_contract_confirmations to service_role;

create or replace function public.confirm_quote_contract(
  p_confirmation_id uuid,
  p_quote_version_id uuid,
  p_idempotency_key_hash text,
  p_confirmed_at timestamptz,
  p_customer_name text default null,
  p_customer_memo text default null,
  p_project_name text default null,
  p_project_memo text default null,
  p_deposit_percentage integer default 30,
  p_balance_percentage integer default 70,
  p_deposit_amount integer default null,
  p_balance_amount integer default null,
  p_deposit_due_date date default null,
  p_balance_due_date date default null
)
returns table (
  result text,
  confirmation public.quote_contract_confirmations
)
language plpgsql
security definer
set search_path = public
as $$
declare
  quote_row public.quotes%rowtype;
  version_row public.quote_versions%rowtype;
  inquiry_row public.inquiries%rowtype;
  existing public.quote_contract_confirmations%rowtype;
  conversion record;
  deposit public.payments%rowtype;
  balance public.payments%rowtype;
  confirmation_row public.quote_contract_confirmations%rowtype;
  deposit_value integer;
  balance_value integer;
  deposit_date date;
  balance_date date;
begin
  if not public.is_admin() then
    raise exception using errcode = '42501', message = 'admin access required';
  end if;
  if p_idempotency_key_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'invalid idempotency key hash';
  end if;
  if p_confirmed_at is null then
    raise exception using errcode = '22023', message = 'confirmation time required';
  end if;

  select * into version_row from public.quote_versions where id = p_quote_version_id;
  if not found then raise exception using errcode = 'P0002', message = 'quote version not found'; end if;
  select * into quote_row from public.quotes where id = version_row.quote_id for update;
  select * into inquiry_row from public.inquiries where id = quote_row.inquiry_id;

  select * into existing from public.quote_contract_confirmations
  where quote_version_id = p_quote_version_id for update;
  if found then
    if existing.idempotency_key_hash = p_idempotency_key_hash then
      return query select 'existing'::text, existing;
      return;
    end if;
    raise exception using errcode = 'P0001', message = 'quote contract already confirmed';
  end if;

  if quote_row.status <> 'approved' or quote_row.approved_version_id <> p_quote_version_id then
    raise exception using errcode = 'P0001', message = 'quote is not approved';
  end if;
  if not exists (select 1 from public.quote_approvals where quote_version_id = p_quote_version_id) then
    raise exception using errcode = 'P0001', message = 'quote approval is not recorded';
  end if;
  if not exists (
    select 1 from public.quote_email_deliveries
    where quote_version_id = p_quote_version_id and status = 'sent'
  ) and not exists (
    select 1 from public.quote_manual_deliveries
    where quote_version_id = p_quote_version_id
  ) then
    raise exception using errcode = 'P0001', message = 'signed contract delivery is not confirmed';
  end if;

  if p_deposit_percentage < 0 or p_deposit_percentage > 100
     or p_balance_percentage < 0 or p_balance_percentage > 100
     or p_deposit_percentage + p_balance_percentage <> 100 then
    raise exception using errcode = '22023', message = 'invalid payment percentages';
  end if;
  deposit_value := coalesce(p_deposit_amount, floor(version_row.total_amount * p_deposit_percentage / 100.0)::integer);
  balance_value := coalesce(p_balance_amount, version_row.total_amount - deposit_value);
  if deposit_value < 0 or balance_value < 0 or deposit_value + balance_value <> version_row.total_amount then
    raise exception using errcode = '22023', message = 'invalid payment amounts';
  end if;
  if p_deposit_amount is not null and deposit_value <> floor(version_row.total_amount * p_deposit_percentage / 100.0)::integer then
    raise exception using errcode = '22023', message = 'payment amount does not match percentage';
  end if;
  deposit_date := coalesce(p_deposit_due_date, (p_confirmed_at at time zone 'Asia/Seoul')::date);
  balance_date := coalesce(p_balance_due_date, version_row.estimated_end_date);

  select * into conversion from public.convert_inquiry_to_project(
    quote_row.inquiry_id,
    coalesce(nullif(trim(p_customer_name), ''), inquiry_row.customer_name),
    nullif(trim(p_customer_memo), ''),
    coalesce(nullif(trim(p_project_name), ''), version_row.title),
    version_row.total_amount,
    balance_date,
    nullif(trim(p_project_memo), '')
  );
  update public.projects set contract_amount = version_row.total_amount where id = conversion.project_id;

  select * into deposit from public.payments where project_id = conversion.project_id and kind = 'deposit' for update;
  if found then
    if deposit.amount <> deposit_value or deposit.due_date is distinct from deposit_date then
      raise exception using errcode = 'P0001', message = 'deposit payment already exists';
    end if;
  else
    insert into public.payments(project_id, kind, amount, due_date)
    values (conversion.project_id, 'deposit', deposit_value, deposit_date)
    returning * into deposit;
  end if;
  select * into balance from public.payments where project_id = conversion.project_id and kind = 'balance' for update;
  if found then
    if balance.amount <> balance_value or balance.due_date is distinct from balance_date then
      raise exception using errcode = 'P0001', message = 'balance payment already exists';
    end if;
  else
    insert into public.payments(project_id, kind, amount, due_date)
    values (conversion.project_id, 'balance', balance_value, balance_date)
    returning * into balance;
  end if;

  insert into public.quote_contract_confirmations(
    id, quote_id, quote_version_id, idempotency_key_hash, confirmed_at, confirmed_by,
    customer_id, project_id, deposit_payment_id, balance_payment_id
  ) values (
    p_confirmation_id, quote_row.id, p_quote_version_id, p_idempotency_key_hash, p_confirmed_at, auth.uid(),
    conversion.customer_id, conversion.project_id, deposit.id, balance.id
  ) returning * into confirmation_row;
  return query select 'created'::text, confirmation_row;
end;
$$;

revoke all on function public.confirm_quote_contract(uuid, uuid, text, timestamptz, text, text, text, text, integer, integer, integer, integer, date, date) from public;
grant execute on function public.confirm_quote_contract(uuid, uuid, text, timestamptz, text, text, text, text, integer, integer, integer, integer, date, date) to authenticated, service_role;
