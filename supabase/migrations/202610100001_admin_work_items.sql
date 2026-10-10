-- Issue #81: 관리자 오늘 할 일 집계와 qualified_at 기록.

alter table public.inquiries
  add column qualified_at timestamptz;

create index inquiries_qualified_work_idx
  on public.inquiries(status, qualified_at, created_at)
  where status = 'qualified';

create or replace function public.set_inquiry_qualified_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- 기존 qualified 행은 backfill하지 않는다. 상태에 진입할 때만 기록한다.
  if new.status = 'qualified' and (tg_op = 'INSERT' or old.status is distinct from 'qualified') then
    new.qualified_at := now();
  end if;
  return new;
end;
$$;

create trigger inquiries_set_qualified_at
before insert or update of status on public.inquiries
for each row execute function public.set_inquiry_qualified_at();

create or replace function public.get_admin_work_items(
  p_page integer default 1,
  p_page_size integer default 25,
  p_group text default 'all',
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  if not public.is_admin() then
    raise exception using errcode = '42501', message = 'admin access required';
  end if;
  if p_page < 1 or p_page_size < 1 or p_page_size > 100 then
    raise exception using errcode = '22023', message = 'invalid pagination';
  end if;
  if p_group not in ('all', 'newInquiry', 'quote', 'projectConversion', 'overduePayment') then
    raise exception using errcode = '22023', message = 'invalid work item group';
  end if;

  with payment_tasks as (
    select
      'payment:' || payment.id::text as item_id,
      'overduePayment'::text as group_name,
      'payment'::text as kind,
      10 as priority,
      (payment.due_date::timestamp at time zone 'Asia/Seoul') as waiting_since,
      payment.id as entity_id,
      payment.project_id,
      project.inquiry_id,
      coalesce(inquiry.customer_name, customer.name, '고객 미상') as customer_name,
      case payment.kind when 'deposit' then '계약금' when 'balance' then '잔금' else '추가 결제' end as title,
      payment.status::text as item_status,
      payment.due_date,
      'record_payment'::text as action,
      ('/admin/projects/' || payment.project_id::text || '/payments') as deep_link,
      false as waiting_since_fallback,
      null::text as delivery_status,
      null::integer as attempt_count,
      null::integer as max_attempts
    from public.payments payment
    join public.projects project on project.id = payment.project_id
    left join public.inquiries inquiry on inquiry.id = project.inquiry_id
    left join public.customers customer on customer.id = project.customer_id
    left join lateral (
      select coalesce(sum(receipt.amount), 0)::integer as total
      from public.payment_receipts receipt
      where receipt.payment_id = payment.id
    ) receipts on true
    where payment.status not in ('paid', 'cancelled')
      and payment.due_date is not null
      and payment.due_date < (p_now at time zone 'Asia/Seoul')::date
      and receipts.total < payment.amount
  ),
  inquiry_tasks as (
    select
      'inquiry:' || inquiry.id::text as item_id,
      'newInquiry'::text as group_name,
      'inquiry'::text as kind,
      20 as priority,
      inquiry.created_at as waiting_since,
      inquiry.id as entity_id,
      null::uuid as project_id,
      inquiry.id as inquiry_id,
      inquiry.customer_name,
      inquiry.service_type as title,
      inquiry.status::text as item_status,
      null::date as due_date,
      'review_inquiry'::text as action,
      ('/admin/inquiries/' || inquiry.id::text) as deep_link,
      false as waiting_since_fallback,
      null::text as delivery_status,
      null::integer as attempt_count,
      null::integer as max_attempts
    from public.inquiries inquiry
    where inquiry.status = 'new'
  ),
  conversion_tasks as (
    select
      'conversion:' || quote.id::text as item_id,
      'projectConversion'::text as group_name,
      'convertApprovedQuote'::text as kind,
      30 as priority,
      approval.approved_at as waiting_since,
      quote.id as entity_id,
      null::uuid as project_id,
      quote.inquiry_id,
      inquiry.customer_name,
      version.title,
      quote.status::text as item_status,
      null::date as due_date,
      'convert_quote'::text as action,
      ('/admin/quotes/' || quote.id::text) as deep_link,
      false as waiting_since_fallback,
      null::text as delivery_status,
      null::integer as attempt_count,
      null::integer as max_attempts
    from public.quotes quote
    join public.quote_versions version on version.id = quote.approved_version_id
    join public.quote_approvals approval on approval.quote_version_id = quote.approved_version_id
      and approval.quote_id = quote.id
    join public.inquiries inquiry on inquiry.id = quote.inquiry_id
    where quote.status = 'approved'
      and quote.approved_version_id is not null
      and inquiry.converted_project_id is null
  ),
  draft_tasks as (
    select
      'quote-draft:' || inquiry.id::text as item_id,
      'quote'::text as group_name,
      'quoteDraft'::text as kind,
      40 as priority,
      coalesce(inquiry.qualified_at, inquiry.created_at) as waiting_since,
      inquiry.id as entity_id,
      null::uuid as project_id,
      inquiry.id as inquiry_id,
      inquiry.customer_name,
      '견적 작성'::text as title,
      inquiry.status::text as item_status,
      null::date as due_date,
      'create_quote'::text as action,
      ('/admin/inquiries/' || inquiry.id::text || '/quotes/new') as deep_link,
      inquiry.qualified_at is null as waiting_since_fallback,
      null::text as delivery_status,
      null::integer as attempt_count,
      null::integer as max_attempts
    from public.inquiries inquiry
    where inquiry.status = 'qualified'
      and not exists (
        select 1 from public.quotes quote
        where quote.inquiry_id = inquiry.id
          and quote.latest_version_id is not null
      )
  ),
  send_tasks as (
    select
      'quote-send:' || quote.id::text as item_id,
      'quote'::text as group_name,
      'quoteSend'::text as kind,
      41 as priority,
      version.created_at as waiting_since,
      quote.id as entity_id,
      null::uuid as project_id,
      quote.inquiry_id,
      inquiry.customer_name,
      version.title,
      coalesce(email.status::text, quote.status::text) as item_status,
      null::date as due_date,
      case when email.status = 'failed' then 'retry_quote' else 'send_quote' end as action,
      ('/admin/quotes/' || quote.id::text) as deep_link,
      false as waiting_since_fallback,
      email.status::text as delivery_status,
      email.attempt_count,
      email.max_attempts
    from public.quotes quote
    join public.quote_versions version on version.id = quote.latest_version_id
    join public.inquiries inquiry on inquiry.id = quote.inquiry_id
    left join lateral (
      select delivery.*
      from public.quote_email_deliveries delivery
      where delivery.quote_version_id = version.id
        and delivery.superseded_at is null
      order by delivery.generation desc
      limit 1
    ) email on true
    left join lateral (
      select manual.*
      from public.quote_manual_deliveries manual
      where manual.quote_version_id = version.id
        and manual.superseded_at is null
      order by manual.generation desc
      limit 1
    ) manual on true
    where quote.status = 'draft'
      and (email.id is null or email.status <> 'sent')
      and not (email.status in ('queued', 'processing', 'retry'))
      and not (manual.id is not null and manual.expires_at > p_now)
  ),
  work_items as (
    select * from payment_tasks
    union all select * from inquiry_tasks
    union all select * from conversion_tasks
    union all select * from draft_tasks
    union all select * from send_tasks
  ),
  visible_items as (
    select * from work_items
    where p_group = 'all' or group_name = p_group
  )
  select jsonb_build_object(
    'asOf', p_now,
    'counts', jsonb_build_object(
      'total', (select count(*) from work_items),
      'newInquiry', (select count(*) from work_items where group_name = 'newInquiry'),
      'quote', (select count(*) from work_items where group_name = 'quote'),
      'projectConversion', (select count(*) from work_items where group_name = 'projectConversion'),
      'overduePayment', (select count(*) from work_items where group_name = 'overduePayment')
    ),
    'pagination', jsonb_build_object(
      'page', p_page,
      'pageSize', p_page_size,
      'total', (select count(*) from visible_items),
      'hasNextPage', (select count(*) > p_page * p_page_size from visible_items)
    ),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', item.item_id,
        'group', item.group_name,
        'kind', item.kind,
        'priority', item.priority,
        'waitingSince', item.waiting_since,
        'ageSeconds', greatest(0, floor(extract(epoch from (p_now - item.waiting_since)))::integer),
        'waitingSinceFallback', item.waiting_since_fallback,
        'entityId', item.entity_id,
        'inquiryId', item.inquiry_id,
        'projectId', item.project_id,
        'customerName', item.customer_name,
        'title', item.title,
        'status', item.item_status,
        'deliveryStatus', item.delivery_status,
        'attemptCount', item.attempt_count,
        'maxAttempts', item.max_attempts,
        'dueDate', item.due_date,
        'action', item.action,
        'deepLink', item.deep_link
      ) order by item.priority, item.waiting_since, item.item_id)
      from (
        select * from visible_items
        order by priority, waiting_since, item_id
        offset (p_page - 1) * p_page_size
        limit p_page_size
      ) item
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

revoke all on function public.get_admin_work_items(integer, integer, text, timestamptz) from public;
grant execute on function public.get_admin_work_items(integer, integer, text, timestamptz) to authenticated, service_role;
