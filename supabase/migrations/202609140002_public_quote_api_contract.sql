create or replace function public.get_public_quote_status(p_token_hash text)
returns table (availability text, quote_id uuid, quote_version_id uuid, version_number integer, customer_name text, title text, body text, scope_items jsonb, total_amount integer, estimated_start_date date, estimated_end_date date, deposit_amount integer, balance_amount integer, deposit_terms text, balance_terms text, expires_at timestamptz)
language plpgsql stable security definer set search_path = public
as $$
declare r record;
begin
  select q.id quote_id, v.id quote_version_id, v.version_number, q.status, a.approved_at, i.customer_name, v.title, v.body, v.scope_items, v.total_amount, v.estimated_start_date, v.estimated_end_date, v.deposit_amount, v.balance_amount, v.deposit_terms, v.balance_terms, t.expires_at
    into r from quote_approval_tokens t join quote_versions v on v.id=t.quote_version_id join quotes q on q.id=v.quote_id join inquiries i on i.id=q.inquiry_id left join quote_approvals a on a.quote_version_id=v.id where t.token_hash=p_token_hash;
  if found and r.status in ('approved','cancelled') then
    return query select r.status::text, case when r.status='approved' then r.quote_id else null end, case when r.status='approved' then r.quote_version_id else null end, case when r.status='approved' then r.version_number else null end, case when r.status='approved' then r.customer_name else null end, null::text, null::text, null::jsonb, null::integer, null::date, null::date, null::integer, null::integer, null::text, null::text, r.expires_at;
    return;
  end if;
  return query select * from public.get_public_quote_by_token(p_token_hash);
end; $$;

revoke all on function public.get_public_quote_status(text) from public;
grant execute on function public.get_public_quote_status(text) to anon, authenticated, service_role;
revoke all on function public.approve_quote_by_token(text, text, text, text, text) from public;
grant execute on function public.approve_quote_by_token(text, text, text, text, text) to anon, authenticated, service_role;

alter function public.approve_quote_by_token(text, text, text) rename to approve_quote_by_token_legacy;
revoke all on function public.approve_quote_by_token_legacy(text, text, text) from public;
create function public.approve_quote_by_token(p_token_hash text, p_client_ip text default null, p_user_agent text default null, p_approver_name text default null, p_consent_version text default null)
returns table (result text, approved_quote_id uuid, approved_quote_version_id uuid, approved_at timestamptz)
language plpgsql security definer set search_path = public
as $$
declare existing record; result_row record;
begin
  select a.quote_id, a.quote_version_id, a.approved_at into existing from quote_approval_tokens t join quote_approvals a on a.approval_token_id=t.id where t.token_hash=p_token_hash;
  if found then return query select 'approved'::text, existing.quote_id, existing.quote_version_id, existing.approved_at; return; end if;
  select * into result_row from public.approve_quote_by_token_legacy(p_token_hash, p_client_ip, p_user_agent);
  if result_row.result = 'approved' and p_approver_name is not null then update quote_approvals set approver_name=p_approver_name, consent_version=p_consent_version where quote_version_id=result_row.approved_quote_version_id; end if;
  return query select result_row.result, result_row.approved_quote_id, result_row.approved_quote_version_id, result_row.approved_at;
end; $$;
