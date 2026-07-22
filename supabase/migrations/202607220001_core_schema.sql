create extension if not exists pgcrypto;

create type public.inquiry_status as enum (
  'new',
  'contacted',
  'qualified',
  'converted',
  'closed'
);

create type public.project_status as enum (
  'planning',
  'in_progress',
  'review',
  'completed',
  'paused',
  'cancelled'
);

create type public.payment_kind as enum (
  'deposit',
  'balance',
  'extra'
);

create type public.payment_status as enum (
  'expected',
  'paid',
  'overdue',
  'cancelled'
);

create type public.ai_generation_kind as enum (
  'inquiry_reply',
  'proposal',
  'contract',
  'imweb_code'
);

create table public.admins (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.inquiries (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null,
  email text,
  phone text,
  company_name text,
  website_url text,
  service_type text not null,
  budget_min integer,
  budget_max integer,
  desired_launch_date date,
  message text not null,
  source text,
  status public.inquiry_status not null default 'new',
  admin_notes text,
  converted_customer_id uuid,
  converted_project_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid references public.inquiries(id) on delete set null,
  name text not null,
  email text,
  phone text,
  company_name text,
  website_url text,
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete restrict,
  inquiry_id uuid references public.inquiries(id) on delete set null,
  name text not null,
  description text,
  status public.project_status not null default 'planning',
  contract_amount integer not null default 0,
  expected_start_date date,
  expected_launch_date date,
  launched_at date,
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.inquiries
  add constraint inquiries_converted_customer_id_fkey
  foreign key (converted_customer_id) references public.customers(id) on delete set null;

alter table public.inquiries
  add constraint inquiries_converted_project_id_fkey
  foreign key (converted_project_id) references public.projects(id) on delete set null;

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  kind public.payment_kind not null,
  status public.payment_status not null default 'expected',
  amount integer not null check (amount >= 0),
  due_date date,
  paid_at date,
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.portfolio_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete set null,
  title text not null,
  slug text not null unique,
  summary text,
  image_url text,
  site_url text,
  industry text,
  is_published boolean not null default false,
  published_at timestamptz,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ai_generation_records (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete set null,
  inquiry_id uuid references public.inquiries(id) on delete set null,
  kind public.ai_generation_kind not null,
  provider text not null,
  model text not null,
  prompt text not null,
  output text,
  input_tokens integer,
  output_tokens integer,
  error_message text,
  created_by uuid references public.admins(id) on delete set null,
  created_at timestamptz not null default now()
);

create index inquiries_status_created_at_idx on public.inquiries(status, created_at desc);
create index customers_created_at_idx on public.customers(created_at desc);
create index projects_customer_id_idx on public.projects(customer_id);
create index projects_status_created_at_idx on public.projects(status, created_at desc);
create index payments_project_id_idx on public.payments(project_id);
create index portfolio_items_published_idx on public.portfolio_items(is_published, sort_order, published_at desc);
create index ai_generation_records_project_id_idx on public.ai_generation_records(project_id);
create index ai_generation_records_inquiry_id_idx on public.ai_generation_records(inquiry_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger admins_set_updated_at
before update on public.admins
for each row execute function public.set_updated_at();

create trigger inquiries_set_updated_at
before update on public.inquiries
for each row execute function public.set_updated_at();

create trigger customers_set_updated_at
before update on public.customers
for each row execute function public.set_updated_at();

create trigger projects_set_updated_at
before update on public.projects
for each row execute function public.set_updated_at();

create trigger payments_set_updated_at
before update on public.payments
for each row execute function public.set_updated_at();

create trigger portfolio_items_set_updated_at
before update on public.portfolio_items
for each row execute function public.set_updated_at();

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admins
    where id = auth.uid()
  );
$$;

alter table public.admins enable row level security;
alter table public.inquiries enable row level security;
alter table public.customers enable row level security;
alter table public.projects enable row level security;
alter table public.payments enable row level security;
alter table public.portfolio_items enable row level security;
alter table public.ai_generation_records enable row level security;

create policy "admins can read own admin profile"
on public.admins
for select
to authenticated
using (id = auth.uid());

create policy "public can create inquiries"
on public.inquiries
for insert
to anon, authenticated
with check (true);

create policy "admins can manage inquiries"
on public.inquiries
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "admins can manage customers"
on public.customers
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "admins can manage projects"
on public.projects
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "admins can manage payments"
on public.payments
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "public can read published portfolio items"
on public.portfolio_items
for select
to anon, authenticated
using (is_published = true);

create policy "admins can manage portfolio items"
on public.portfolio_items
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "admins can manage ai generation records"
on public.ai_generation_records
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());
