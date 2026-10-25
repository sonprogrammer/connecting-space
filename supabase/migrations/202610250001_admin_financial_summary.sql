-- Read-only, single-statement snapshot; keep caller RLS and require administrator.
create function public.get_admin_financial_summary(p_status text default 'active')
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  result jsonb;
begin
  if not public.is_admin() then
    raise exception using errcode = '42501', message = 'admin access required';
  end if;
  if p_status is null or p_status not in ('active', 'all', 'planning', 'in_progress', 'review', 'paused', 'completed', 'cancelled') then
    raise exception using errcode = '22023', message = 'invalid project status';
  end if;

  with selected_projects as (
    select id, contract_amount from public.projects
    where p_status = 'all'
      or (p_status = 'active' and status in ('planning', 'in_progress', 'review', 'paused'))
      or status::text = p_status
  ), payment_totals as (
    select p.project_id,
      sum(p.amount::bigint) filter (where p.status <> 'cancelled') as confirmed,
      sum(p.amount::bigint) filter (where p.status <> 'cancelled' and p.kind = 'extra') as extras
    from public.payments p join selected_projects s on s.id = p.project_id
    group by p.project_id
  ), receipt_totals as (
    -- Existing project summary counts receipts even for cancelled payments.
    select p.project_id, sum(r.amount::bigint) as received
    from public.payment_receipts r
    join public.payments p on p.id = r.payment_id
    join selected_projects s on s.id = p.project_id
    group by p.project_id
  ), summaries as (
    select s.contract_amount::bigint + coalesce(p.extras, 0) as expected,
      coalesce(p.confirmed, 0) as confirmed,
      coalesce(r.received, 0) as received,
      greatest(coalesce(p.confirmed, 0) - coalesce(r.received, 0), 0) as outstanding
    from selected_projects s
    left join payment_totals p on p.project_id = s.id
    left join receipt_totals r on r.project_id = s.id
  )
  select jsonb_build_object(
    'asOf', statement_timestamp(),
    'status', p_status,
    'includedStatuses', case
      when p_status = 'active' then '["planning","in_progress","review","paused"]'::jsonb
      when p_status = 'all' then '["planning","in_progress","review","completed","paused","cancelled"]'::jsonb
      else jsonb_build_array(p_status) end,
    'projectCount', count(*),
    'expectedRevenue', coalesce(sum(expected), 0),
    'confirmedRevenue', coalesce(sum(confirmed), 0),
    'receivedTotal', coalesce(sum(received), 0),
    'outstanding', coalesce(sum(outstanding), 0)
  ) into result from summaries;
  return result;
end;
$$;

revoke all on function public.get_admin_financial_summary(text) from public, anon;
grant execute on function public.get_admin_financial_summary(text) to authenticated;
