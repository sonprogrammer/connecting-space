-- Issue #35: actual receipt records for project payment schedules.
create table public.payment_receipts (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments(id) on delete cascade,
  amount integer not null check (amount > 0),
  received_at timestamptz not null default now(),
  idempotency_key uuid not null,
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (payment_id, idempotency_key)
);

create index payment_receipts_payment_id_idx
  on public.payment_receipts(payment_id, received_at desc);

create trigger payment_receipts_set_updated_at
before update on public.payment_receipts
for each row execute function public.set_updated_at();

alter table public.payment_receipts enable row level security;

create policy "admins can manage payment receipts"
on public.payment_receipts
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

revoke all on table public.payment_receipts from anon;
grant select, insert, update, delete on table public.payment_receipts to authenticated;
grant all on table public.payment_receipts to service_role;
