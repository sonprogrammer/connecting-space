create table public.project_documents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  kind text not null check (kind in ('proposal','contract')),
  revision integer not null default 0,
  version_count integer not null default 0,
  content jsonb,
  unique(project_id,kind)
);
create table public.project_document_versions (
  document_id uuid not null references public.project_documents(id) on delete cascade,
  version integer not null,
  source text not null check(source in ('generated','manual')),
  request_key uuid not null,
  content jsonb not null,
  created_by uuid references public.admins(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key(document_id,version), unique(document_id,request_key)
);
create table public.project_document_jobs (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.project_documents(id) on delete cascade,
  request_key uuid not null,
  status text not null check(status in ('processing','completed','failed')),
  lease_token uuid not null default gen_random_uuid(),
  lease_until timestamptz not null default (clock_timestamp()+interval '120 seconds'),
  base_revision integer not null,
  attempt_count integer not null default 1 check(attempt_count between 1 and 3),
  context jsonb not null,
  version integer,
  applied boolean not null default false,
  history jsonb not null default '[]',
  created_by uuid references public.admins(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(document_id,request_key)
);
create index project_document_jobs_active_idx on public.project_document_jobs(status,lease_until);
alter table public.project_documents enable row level security;
alter table public.project_document_versions enable row level security;
alter table public.project_document_jobs enable row level security;
create policy "admin document read" on public.project_documents for select to authenticated using(public.is_admin());
create policy "admin document version read" on public.project_document_versions for select to authenticated using(public.is_admin());
-- Jobs contain private provider input/leases; expose only sanitized RPC output.
revoke all on public.project_documents, public.project_document_versions, public.project_document_jobs from anon, authenticated;
grant select on public.project_documents, public.project_document_versions to authenticated;
grant all on public.project_documents, public.project_document_versions, public.project_document_jobs to service_role;

create function public.document_review_content(p_content jsonb) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare text_value text;
begin
  if p_content is null or jsonb_typeof(p_content) <> 'object'
    or not (p_content ?& array['title','summary','scopeItems'])
    or (p_content - array['title','summary','scopeItems']) <> '{}'::jsonb
    or jsonb_typeof(p_content->'title') <> 'string' or length(trim(p_content->>'title')) not between 1 and 160
    or jsonb_typeof(p_content->'summary') <> 'string' or length(trim(p_content->>'summary')) not between 1 and 5000
    or jsonb_typeof(p_content->'scopeItems') <> 'array'
    or octet_length(p_content::text) > 32768 then
    raise exception using errcode='22023',message='invalid document content';
  end if;
  if jsonb_array_length(p_content->'scopeItems') not between 1 and 40 then
    raise exception using errcode='22023',message='invalid document content';
  end if;
  for text_value in select value #>> '{}' from jsonb_array_elements(p_content->'scopeItems') loop
    if length(trim(text_value)) not between 1 and 500 then raise exception using errcode='22023',message='invalid document content'; end if;
  end loop;
  if exists(select 1 from jsonb_array_elements(p_content->'scopeItems') where jsonb_typeof(value)<>'string')
    or p_content::text ~* '(₩|[0-9][0-9,.]*\s*(원|만원|USD|KRW|%|일|주|개월|days|weeks)|[일이삼사오육칠팔구십백천만억]+원|[0-9]{4}[-/.][0-9]{1,2}[-/.][0-9]{1,2}|위약|손해배상|준거법|관할|저작권|소유권|법적|의무|보장|확정|서명|계약기간|가격|비용|금액|요금|무료|무상|할인|일주일|한\s*달|다음\s*달|납기|착수일|완료일)' then
    raise exception using errcode='22023',message='document conditions require confirmation';
  end if;
  return p_content || jsonb_build_object('reviewOnly',true,
    'reviewNotice','검토용 초안입니다. 가격·일정·법적 조건은 확인이 필요하며 확정 계약이나 법률 자문이 아닙니다.',
    'needsConfirmation',jsonb_build_array(
      jsonb_build_object('category','price','question','계약 금액·추가 비용·결제 조건을 담당자와 확인해 주세요.'),
      jsonb_build_object('category','schedule','question','착수·완료 일정과 작업 가능 기간을 담당자와 확인해 주세요.'),
      jsonb_build_object('category','legal','question','권리·책임·해지 등 법적 조건은 별도 검토 후 합의해 주세요.')));
end; $$;

create function public.claim_project_document(p_project_id uuid,p_kind text,p_request_key uuid,p_retry boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare d public.project_documents; j public.project_document_jobs; ctx jsonb;
begin
  if not public.is_admin() then raise exception using errcode='42501',message='admin required'; end if;
  if p_kind is null or p_kind not in ('proposal','contract') or p_request_key is null or p_retry is null then raise exception using errcode='22023',message='invalid document request'; end if;
  if not exists(select 1 from public.projects where id=p_project_id) then raise exception using errcode='P0002',message='project not found'; end if;
  insert into public.project_documents(project_id,kind) values(p_project_id,p_kind) on conflict do nothing;
  select * into d from public.project_documents where project_id=p_project_id and kind=p_kind for update;
  if exists(select 1 from public.project_document_versions where document_id=d.id and request_key=p_request_key and source='manual') then raise exception using errcode='23505',message='document request conflict'; end if;
  select * into j from public.project_document_jobs where document_id=d.id and request_key=p_request_key for update;
  if found then
    if j.status='completed' or not p_retry or (j.status='processing' and j.lease_until>clock_timestamp()) then
      return jsonb_build_object('execute',false,'job',to_jsonb(j)-array['context','lease_token','lease_until']);
    end if;
    if j.created_by is distinct from auth.uid() then raise exception using errcode='42501',message='job owner required'; end if;
    if j.attempt_count>=3 then raise exception using errcode='P0001',message='document attempts exhausted'; end if;
  end if;
  perform pg_advisory_xact_lock(390026);
  if exists(select 1 from public.project_document_jobs where document_id=d.id and status='processing' and lease_until>clock_timestamp()) then
    raise exception using errcode='55P03',message='document busy';
  end if;
  if (select count(*) from public.project_document_jobs where status='processing' and lease_until>clock_timestamp())>=3
    or (select count(*) from public.project_document_jobs where status='processing' and lease_until>clock_timestamp() and created_by=auth.uid())>=2
    or (select count(*) from public.project_document_jobs where created_at>clock_timestamp()-interval '1 hour' and created_by=auth.uid())>=10 and j.id is null then
    raise exception using errcode='53300',message='document generation limit';
  end if;
  if j.id is null then
    select jsonb_build_object(
      'project',jsonb_build_object('name',p.name,'description',p.description),
      'customer',jsonb_build_object('name',c.name,'companyName',c.company_name),
      'references',jsonb_build_object('contractAmount',p.contract_amount,'expectedStartDate',p.expected_start_date,'expectedLaunchDate',p.expected_launch_date,'confirmed',false),
      'services',(select coalesce(jsonb_agg(to_jsonb(s)),'[]') from (select name,description,price_label,price_min,price_max,duration_label,included_items,excluded_items from public.service_offerings where is_published order by sort_order,id limit 30) s),
      'faqs',(select coalesce(jsonb_agg(to_jsonb(f)),'[]') from (select question,answer from public.faq_items where is_published order by sort_order,id limit 30) f)
    ) into ctx from public.projects p join public.customers c on c.id=p.customer_id where p.id=p_project_id;
    if octet_length(ctx::text)>65536 then raise exception using errcode='22023',message='document context too large'; end if;
    insert into public.project_document_jobs(document_id,request_key,status,base_revision,context,created_by)
      values(d.id,p_request_key,'processing',d.revision,ctx,auth.uid()) returning * into j;
  else
    update public.project_document_jobs set status='processing',lease_token=gen_random_uuid(),lease_until=clock_timestamp()+interval '120 seconds',
      attempt_count=attempt_count+1,base_revision=d.revision,
      history=case when status='processing' then history || jsonb_build_array(jsonb_build_object('attempt',attempt_count,'errorCode','AI_GENERATION_INTERRUPTED')) else history end
      where id=j.id returning * into j;
  end if;
  return jsonb_build_object('execute',true,'job',to_jsonb(j)-array['context','lease_token','lease_until'],'leaseToken',j.lease_token,'context',j.context);
end; $$;

create function public.finish_project_document(p_job_id uuid,p_lease_token uuid,p_content jsonb default null,p_error text default null,p_provider text default null,p_model text default null,p_input_tokens integer default null,p_output_tokens integer default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare j public.project_document_jobs; d public.project_documents; normalized jsonb; n integer;
begin
  if not public.is_admin() then raise exception using errcode='42501',message='admin required'; end if;
  select document_id into j.document_id from public.project_document_jobs where id=p_job_id;
  select * into d from public.project_documents where id=j.document_id for update;
  select * into j from public.project_document_jobs where id=p_job_id for update;
  if j.id is null then raise exception using errcode='P0002',message='job not found'; end if;
  if j.created_by is distinct from auth.uid() or j.lease_token is distinct from p_lease_token then raise exception using errcode='42501',message='job lease rejected'; end if;
  if j.status<>'processing' then return to_jsonb(j)-array['context','lease_token','lease_until']; end if;
  if j.lease_until<=clock_timestamp() then raise exception using errcode='P0390',message='job lease expired'; end if;
  if p_error is not null and p_error not in ('AI_NOT_CONFIGURED','AI_CONFIGURATION_INVALID','AI_PROVIDER_FAILED','AI_OUTPUT_INVALID') then raise exception using errcode='22023',message='invalid error code'; end if;
  if p_provider is not null and p_provider not in ('groq','gemini','openai','custom') or length(p_model)>200
    or p_input_tokens<0 or p_output_tokens<0 then raise exception using errcode='22023',message='invalid generation metadata'; end if;
  if p_error is null then
    if p_provider is null or p_model is null or length(trim(p_model))=0 then raise exception using errcode='22023',message='missing generation metadata'; end if;
    normalized=public.document_review_content(p_content) || jsonb_build_object('references',j.context->'references');
    n=d.version_count+1;
    insert into public.project_document_versions(document_id,version,source,request_key,content,created_by)
      values(d.id,n,'generated',j.request_key,normalized,auth.uid());
    update public.project_documents set version_count=n,content=case when revision=j.base_revision then normalized else content end,
      revision=case when revision=j.base_revision then n else revision end where id=d.id;
  end if;
  update public.project_document_jobs set status=case when p_error is null then 'completed' else 'failed' end,
    version=n,applied=p_error is null and d.revision=j.base_revision,
    history=history || jsonb_build_array(jsonb_build_object('attempt',attempt_count,'provider',p_provider,'model',p_model,'inputTokens',p_input_tokens,'outputTokens',p_output_tokens,'errorCode',p_error,'at',clock_timestamp()))
    where id=j.id returning * into j;
  return to_jsonb(j)-array['context','lease_token','lease_until'];
end; $$;

create function public.save_project_document(p_project_id uuid,p_kind text,p_request_key uuid,p_expected_revision integer,p_content jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare d public.project_documents; v public.project_document_versions; normalized jsonb;
begin
  if not public.is_admin() then raise exception using errcode='42501',message='admin required'; end if;
  normalized=public.document_review_content(p_content);
  select * into d from public.project_documents where project_id=p_project_id and kind=p_kind for update;
  if d.id is null then raise exception using errcode='P0002',message='document not found'; end if;
  select * into v from public.project_document_versions where document_id=d.id and request_key=p_request_key;
  if found then
    if (v.content-'references')<>normalized or v.source<>'manual' then raise exception using errcode='23505',message='document request conflict'; end if;
    return to_jsonb(v);
  end if;
  if exists(select 1 from public.project_document_jobs where document_id=d.id and request_key=p_request_key) then raise exception using errcode='23505',message='document request conflict'; end if;
  if p_expected_revision is null or p_expected_revision<>d.revision then raise exception using errcode='P0390',message='document revision conflict'; end if;
  normalized=normalized || jsonb_build_object('references',coalesce(d.content->'references',
    (select jsonb_build_object('contractAmount',contract_amount,'expectedStartDate',expected_start_date,'expectedLaunchDate',expected_launch_date,'confirmed',false) from public.projects where id=p_project_id)));
  insert into public.project_document_versions(document_id,version,source,request_key,content,created_by)
    values(d.id,d.version_count+1,'manual',p_request_key,normalized,auth.uid()) returning * into v;
  update public.project_documents set version_count=v.version,revision=v.version,content=normalized where id=d.id;
  return to_jsonb(v);
end; $$;

create function public.read_project_document(p_project_id uuid,p_kind text,p_version integer default null,p_page integer default 1,p_page_size integer default 20)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare d public.project_documents; result jsonb;
begin
  if not public.is_admin() then raise exception using errcode='42501',message='admin required'; end if;
  if p_kind is null or p_kind not in ('proposal','contract') or p_page is null or p_page<1 or p_page>100000 or p_page_size is null or p_page_size not between 1 and 50 or p_version<1 then raise exception using errcode='22023',message='invalid document query'; end if;
  if not exists(select 1 from public.projects where id=p_project_id) then raise exception using errcode='P0002',message='project not found'; end if;
  select * into d from public.project_documents where project_id=p_project_id and kind=p_kind;
  if p_version is not null then
    select to_jsonb(v) into result from public.project_document_versions v where document_id=d.id and version=p_version;
    if result is null then raise exception using errcode='P0002',message='version not found'; end if;
    return result;
  end if;
  return jsonb_build_object('document',case when d.id is null then null else to_jsonb(d) end,
    'versions',(select coalesce(jsonb_agg(to_jsonb(v)-'content'),'[]') from (select * from public.project_document_versions where document_id=d.id order by version desc limit p_page_size offset (p_page-1)*p_page_size) v),
    'pagination',jsonb_build_object('page',p_page,'pageSize',p_page_size,'total',coalesce(d.version_count,0)));
end; $$;

-- Sanitized job history is read through a checked definer function, never raw leases/context.
create function public.read_project_document_jobs(p_project_id uuid,p_kind text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception using errcode='42501',message='admin required'; end if;
  return (select coalesce(jsonb_agg(to_jsonb(j)-array['context','lease_token','lease_until']),'[]') from
    (select j.* from public.project_document_jobs j join public.project_documents d on d.id=j.document_id where d.project_id=p_project_id and d.kind=p_kind order by j.created_at desc,j.id limit 20) j);
end; $$;

revoke all on function public.document_review_content(jsonb) from public, anon, authenticated;
revoke all on function public.claim_project_document(uuid,text,uuid,boolean) from public, anon;
revoke all on function public.finish_project_document(uuid,uuid,jsonb,text,text,text,integer,integer) from public, anon;
revoke all on function public.save_project_document(uuid,text,uuid,integer,jsonb) from public, anon;
revoke all on function public.read_project_document(uuid,text,integer,integer,integer) from public, anon;
revoke all on function public.read_project_document_jobs(uuid,text) from public, anon;
grant execute on function public.claim_project_document(uuid,text,uuid,boolean),public.finish_project_document(uuid,uuid,jsonb,text,text,text,integer,integer),public.save_project_document(uuid,text,uuid,integer,jsonb),public.read_project_document(uuid,text,integer,integer,integer),public.read_project_document_jobs(uuid,text) to authenticated;
