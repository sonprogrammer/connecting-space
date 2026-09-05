-- Issue #32 follow-up: qualify table columns to avoid RETURNS TABLE output-variable collisions.
create or replace function public.convert_inquiry_to_project(
  p_inquiry_id uuid,
  p_customer_name text,
  p_customer_memo text,
  p_project_name text,
  p_contract_amount integer,
  p_expected_launch_date date,
  p_project_memo text
)
returns table (
  inquiry_id uuid,
  customer_id uuid,
  project_id uuid,
  reused_customer boolean,
  reused_project boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  inquiry_row public.inquiries%rowtype;
  customer_row public.customers%rowtype;
  project_row public.projects%rowtype;
  customer_was_reused boolean := false;
  project_was_reused boolean := false;
begin
  if not public.is_admin() then
    raise exception using errcode = '42501', message = 'admin access required';
  end if;

  select i.* into inquiry_row from public.inquiries as i where i.id = p_inquiry_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'inquiry not found'; end if;

  if inquiry_row.converted_customer_id is not null then
    select c.* into customer_row from public.customers as c where c.id = inquiry_row.converted_customer_id;
  end if;
  if customer_row.id is null then
    select c.* into customer_row from public.customers as c where c.inquiry_id = p_inquiry_id order by c.created_at asc limit 1;
    customer_was_reused := customer_row.id is not null;
  else
    customer_was_reused := true;
  end if;
  if customer_row.id is null then
    insert into public.customers (inquiry_id, name, email, phone, company_name, website_url, memo)
    values (p_inquiry_id, p_customer_name, inquiry_row.email, inquiry_row.phone, inquiry_row.company_name, inquiry_row.website_url, nullif(p_customer_memo, ''))
    returning * into customer_row;
  end if;

  if inquiry_row.converted_project_id is not null then
    select p.* into project_row from public.projects as p where p.id = inquiry_row.converted_project_id;
  end if;
  if project_row.id is null then
    select p.* into project_row from public.projects as p where p.inquiry_id = p_inquiry_id order by p.created_at asc limit 1;
    project_was_reused := project_row.id is not null;
  else
    project_was_reused := true;
  end if;
  if project_row.id is null then
    insert into public.projects (customer_id, inquiry_id, name, description, contract_amount, expected_launch_date, memo)
    values (customer_row.id, p_inquiry_id, p_project_name, inquiry_row.message, p_contract_amount, p_expected_launch_date, nullif(p_project_memo, ''))
    returning * into project_row;
  end if;

  update public.inquiries as i
  set converted_customer_id = customer_row.id, converted_project_id = project_row.id,
      status = 'converted', updated_at = now()
  where i.id = p_inquiry_id;

  return query select p_inquiry_id, customer_row.id, project_row.id, customer_was_reused, project_was_reused;
end;
$$;

revoke all on function public.convert_inquiry_to_project(uuid, text, text, text, integer, date, text) from public;
grant execute on function public.convert_inquiry_to_project(uuid, text, text, text, integer, date, text) to authenticated, service_role;
