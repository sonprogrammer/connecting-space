create or replace function public.enqueue_quote_email_delivery(
  p_job_id uuid, p_quote_version_id uuid, p_token_id uuid, p_token_hash text,
  p_encrypted_payload text, p_payload_nonce text, p_payload_auth_tag text,
  p_now timestamptz default now()
)
returns table (result text, delivery public.quote_email_deliveries)
language plpgsql security definer set search_path = public as $$
declare quote_row public.quotes%rowtype; current_delivery public.quote_email_deliveries%rowtype; current_token public.quote_approval_tokens%rowtype; next_generation integer; created_delivery public.quote_email_deliveries%rowtype;
begin
  if p_token_hash !~ '^[0-9a-f]{64}$' then raise exception using errcode = '22023', message = 'invalid token hash'; end if;
  if not public.is_admin() then raise exception using errcode = '42501', message = 'admin access required'; end if;
  select quote.* into quote_row from public.quote_versions version join public.quotes quote on quote.id = version.quote_id where version.id = p_quote_version_id for update of quote;
  if not found then raise exception using errcode = 'P0002', message = 'quote version not found'; end if;
  if quote_row.latest_version_id <> p_quote_version_id or quote_row.status in ('approved', 'cancelled') then raise exception using errcode = 'P0001', message = 'quote unavailable'; end if;
  select * into current_delivery from public.quote_email_deliveries where quote_version_id = p_quote_version_id and superseded_at is null for update;
  if found then
    select * into current_token from public.quote_approval_tokens where id = current_delivery.approval_token_id;
    if current_token.revoked_at is null and current_token.used_at is null and (current_token.expires_at is null or current_token.expires_at > p_now) then
      if current_delivery.status <> 'sent' and current_delivery.dispatch_started_at is not null and current_delivery.dispatch_started_at <= p_now - interval '24 hours' then
        update public.quote_email_deliveries set superseded_at = p_now where id = current_delivery.id;
        update public.quote_approval_tokens set revoked_at = p_now where id = current_delivery.approval_token_id and revoked_at is null and used_at is null;
      elsif current_delivery.status = 'failed' then return query select 'retry_required'::text, current_delivery; return;
      else return query select 'existing'::text, current_delivery; return;
      end if;
    else
      update public.quote_email_deliveries set superseded_at = p_now where id = current_delivery.id;
      update public.quote_approval_tokens set revoked_at = coalesce(revoked_at, p_now) where id = current_delivery.approval_token_id and used_at is null;
    end if;
  end if;
  select coalesce(max(generation), 0) + 1 into next_generation from public.quote_email_deliveries where quote_version_id = p_quote_version_id;
  insert into public.quote_approval_tokens(id, quote_version_id, token_hash, expires_at, created_by, created_at)
    values (p_token_id, p_quote_version_id, p_token_hash, p_now + interval '7 days', auth.uid(), p_now);
  insert into public.quote_email_deliveries(id, quote_id, quote_version_id, approval_token_id, generation, encrypted_payload, payload_nonce, payload_auth_tag, available_at)
    values (p_job_id, quote_row.id, p_quote_version_id, p_token_id, next_generation, p_encrypted_payload, p_payload_nonce, p_payload_auth_tag, p_now)
    returning * into created_delivery;
  return query select 'created'::text, created_delivery;
end; $$;
