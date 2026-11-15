create table public.project_widgets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  kind text not null check (kind in ('widget')),
  revision integer not null default 0,
  version_count integer not null default 0,
  content jsonb,
  unique(project_id,kind)
);
create table public.project_widget_versions (
  widget_id uuid not null references public.project_widgets(id) on delete cascade,
  version integer not null,
  source text not null check(source in ('generated')),
  request_key uuid not null,
  content jsonb not null,
  created_by uuid references public.admins(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key(widget_id,version), unique(widget_id,request_key)
);
create table public.project_widget_jobs (
  id uuid primary key default gen_random_uuid(),
  widget_id uuid not null references public.project_widgets(id) on delete cascade,
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
  unique(widget_id,request_key)
);
create index project_widget_jobs_active_idx on public.project_widget_jobs(status,lease_until);
alter table public.project_widgets enable row level security;
alter table public.project_widget_versions enable row level security;
alter table public.project_widget_jobs enable row level security;
create policy "admin widget read" on public.project_widgets for select to authenticated using(public.is_admin());
create policy "admin widget version read" on public.project_widget_versions for select to authenticated using(public.is_admin());
-- Jobs contain private provider input/leases; expose only sanitized RPC output.
revoke all on public.project_widgets, public.project_widget_versions, public.project_widget_jobs from anon, authenticated;
grant select on public.project_widgets, public.project_widget_versions to authenticated;
grant all on public.project_widgets, public.project_widget_versions, public.project_widget_jobs to service_role;

-- A closed data grammar, not raw executable code. Mirrors the application compiler.
create function public.widget_review_content(p_content jsonb) returns jsonb
language plpgsql immutable set search_path='' as $$
declare e jsonb; s jsonb; a jsonb; seen jsonb='{}'; parent jsonb; depth integer;
begin
  if p_content is null or jsonb_typeof(p_content) is distinct from 'object'
    or not(p_content ?& array['elements','styles','interactions'])
    or p_content-array['elements','styles','interactions']<>'{}'::jsonb
    or jsonb_typeof(p_content->'elements') is distinct from 'array'
    or jsonb_typeof(p_content->'styles') is distinct from 'array'
    or jsonb_typeof(p_content->'interactions') is distinct from 'array'
    or octet_length(p_content::text)>32768 then raise exception using errcode='22023',message='invalid widget spec'; end if;
  if jsonb_array_length(p_content->'elements') not between 1 and 80
    or jsonb_array_length(p_content->'styles')>120 or jsonb_array_length(p_content->'interactions')>20
    then raise exception using errcode='22023',message='invalid widget size'; end if;
  for e in select value from jsonb_array_elements(p_content->'elements') loop
    if jsonb_typeof(e) is distinct from 'object' or not(e ?& array['id','parentId','tag','text'])
      or e-array['id','parentId','tag','text']<>'{}'::jsonb
      or jsonb_typeof(e->'id') is distinct from 'string' or (e->>'id')!~'^[a-z][a-z0-9-]{0,39}$'
      or seen ? (e->>'id') or jsonb_typeof(e->'tag') is distinct from 'string'
      or (e->>'tag') not in ('div','section','h2','h3','p','span','button','ul','li','strong','em')
      or jsonb_typeof(e->'text') is distinct from 'string' or length(e->>'text')>2000
      or jsonb_typeof(e->'parentId') not in ('string','null') then raise exception using errcode='22023',message='invalid widget element'; end if;
    parent=seen->(e->>'parentId'); depth=coalesce((parent->>'depth')::integer,0)+1;
    if ((e->>'parentId') is not null and parent is null) or depth>10
      or (parent is not null and parent->>'tag' not in ('div','section','ul','li'))
      or (parent->>'tag'='ul' and e->>'tag'<>'li')
      or (e->>'tag'='li' and (parent->>'tag') is distinct from 'ul')
      then raise exception using errcode='22023',message='invalid widget tree'; end if;
    seen=seen || jsonb_build_object(e->>'id',jsonb_build_object('depth',depth,'tag',e->>'tag'));
  end loop;
  for s in select value from jsonb_array_elements(p_content->'styles') loop
    if jsonb_typeof(s) is distinct from 'object' or not(s ?& array['targetId','property','value'])
      or s-array['targetId','property','value','active']<>'{}'::jsonb
      or jsonb_typeof(s->'targetId') is distinct from 'string' or not(seen ? (s->>'targetId'))
      or jsonb_typeof(s->'property') is distinct from 'string'
      or (s->>'property') not in ('color','background-color','font-size','font-weight','line-height','text-align','padding','margin','gap','display','border-radius','border-color','border-width','border-style','max-width','width','flex-direction','align-items','justify-content','opacity')
      or jsonb_typeof(s->'value') is distinct from 'string' or length(s->>'value') not between 1 and 80
      or (s->>'value')!~'^[a-zA-Z0-9# .,%_-]+$'
      or (s ? 'active' and jsonb_typeof(s->'active') is distinct from 'boolean')
      then raise exception using errcode='22023',message='invalid widget style'; end if;
  end loop;
  for a in select value from jsonb_array_elements(p_content->'interactions') loop
    if jsonb_typeof(a) is distinct from 'object' or not(a ?& array['triggerId','targetId','action'])
      or a-array['triggerId','targetId','action']<>'{}'::jsonb
      or jsonb_typeof(a->'triggerId') is distinct from 'string'
      or (seen->(a->>'triggerId')->>'tag') is distinct from 'button'
      or jsonb_typeof(a->'targetId') is distinct from 'string' or not(seen ? (a->>'targetId'))
      or a->>'action' is distinct from 'toggle'
      then raise exception using errcode='22023',message='invalid widget action'; end if;
  end loop;
  return p_content;
end; $$;

create function public.widget_requirements(p_input jsonb) returns jsonb
language plpgsql immutable set search_path='' as $$
declare k text; item jsonb;
begin
  if p_input is null or jsonb_typeof(p_input) is distinct from 'object'
    or not(p_input ?& array['industry','purpose','targetAudience','mood','colors','sections','interactions'])
    or p_input-array['industry','purpose','targetAudience','mood','colors','sections','interactions']<>'{}'::jsonb
    or octet_length(p_input::text)>12288 then raise exception using errcode='22023',message='invalid widget requirements'; end if;
  foreach k in array array['industry','purpose','targetAudience','mood'] loop
    if jsonb_typeof(p_input->k) is distinct from 'string' or length(trim(p_input->>k)) not between 1 and 500
      then raise exception using errcode='22023',message='invalid widget requirements'; end if;
  end loop;
  foreach k in array array['colors','sections','interactions'] loop
    if jsonb_typeof(p_input->k) is distinct from 'array' then raise exception using errcode='22023',message='invalid widget requirements'; end if;
    if jsonb_array_length(p_input->k)>(case k when 'colors' then 8 when 'sections' then 20 else 10 end)
      or (k<>'interactions' and jsonb_array_length(p_input->k)=0)
      then raise exception using errcode='22023',message='invalid widget requirements'; end if;
    for item in select value from jsonb_array_elements(p_input->k) loop
      if jsonb_typeof(item) is distinct from 'string' or length(trim(item#>>'{}')) not between 1 and 500
        or (k='colors' and (item#>>'{}')!~'^#[0-9a-fA-F]{6}$')
        then raise exception using errcode='22023',message='invalid widget requirements'; end if;
    end loop;
  end loop;
  return p_input;
end; $$;

create function public.claim_project_widget(p_project_id uuid,p_kind text,p_request_key uuid,p_retry boolean default false,p_requirements jsonb default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare d public.project_widgets; j public.project_widget_jobs; ctx jsonb;
begin
  if not public.is_admin() then raise exception using errcode='42501',message='admin required'; end if;
  if p_kind is null or p_kind not in ('widget') or p_request_key is null or p_retry is null then raise exception using errcode='22023',message='invalid widget request'; end if;
  if not exists(select 1 from public.projects where id=p_project_id) then raise exception using errcode='P0002',message='project not found'; end if;
  perform public.widget_requirements(p_requirements);
  insert into public.project_widgets(project_id,kind) values(p_project_id,p_kind) on conflict do nothing;
  select * into d from public.project_widgets where project_id=p_project_id and kind=p_kind for update;
  select * into j from public.project_widget_jobs where widget_id=d.id and request_key=p_request_key for update;
  if found then
    if j.context->'requirements' is distinct from p_requirements then raise exception using errcode='23505',message='widget request conflict'; end if;
    if j.status='completed' or not p_retry or (j.status='processing' and j.lease_until>clock_timestamp()) then
      return jsonb_build_object('execute',false,'job',to_jsonb(j)-array['context','lease_token','lease_until']);
    end if;
    if j.created_by is distinct from auth.uid() then raise exception using errcode='42501',message='job owner required'; end if;
    if j.attempt_count>=3 then raise exception using errcode='P0001',message='widget attempts exhausted'; end if;
  end if;
  perform pg_advisory_xact_lock(420026);
  if exists(select 1 from public.project_widget_jobs where widget_id=d.id and status='processing' and lease_until>clock_timestamp()) then
    raise exception using errcode='55P03',message='widget busy';
  end if;
  if (select count(*) from public.project_widget_jobs where status='processing' and lease_until>clock_timestamp())>=3
    or (select count(*) from public.project_widget_jobs where status='processing' and lease_until>clock_timestamp() and created_by=auth.uid())>=2
    or (select count(*) from public.project_widget_jobs where created_at>clock_timestamp()-interval '1 hour' and created_by=auth.uid())>=10 and j.id is null then
    raise exception using errcode='53300',message='widget generation limit';
  end if;
  if j.id is null then
    ctx=jsonb_build_object('requirements',p_requirements);
    insert into public.project_widget_jobs(widget_id,request_key,status,base_revision,context,created_by)
      values(d.id,p_request_key,'processing',d.revision,ctx,auth.uid()) returning * into j;
  else
    update public.project_widget_jobs set status='processing',lease_token=gen_random_uuid(),lease_until=clock_timestamp()+interval '120 seconds',
      attempt_count=attempt_count+1,base_revision=d.revision,
      history=case when status='processing' then history || jsonb_build_array(jsonb_build_object('attempt',attempt_count,'errorCode','AI_GENERATION_INTERRUPTED')) else history end
      where id=j.id returning * into j;
  end if;
  return jsonb_build_object('execute',true,'job',to_jsonb(j)-array['context','lease_token','lease_until'],'leaseToken',j.lease_token,'context',j.context);
end; $$;

create function public.finish_project_widget(p_job_id uuid,p_lease_token uuid,p_content jsonb default null,p_error text default null,p_provider text default null,p_model text default null,p_input_tokens integer default null,p_output_tokens integer default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare j public.project_widget_jobs; d public.project_widgets; normalized jsonb; n integer;
begin
  if not public.is_admin() then raise exception using errcode='42501',message='admin required'; end if;
  select widget_id into j.widget_id from public.project_widget_jobs where id=p_job_id;
  select * into d from public.project_widgets where id=j.widget_id for update;
  select * into j from public.project_widget_jobs where id=p_job_id for update;
  if j.id is null then raise exception using errcode='P0002',message='job not found'; end if;
  if j.created_by is distinct from auth.uid() or j.lease_token is distinct from p_lease_token then raise exception using errcode='42501',message='job lease rejected'; end if;
  if j.status<>'processing' then return to_jsonb(j)-array['context','lease_token','lease_until']; end if;
  if j.lease_until<=clock_timestamp() then raise exception using errcode='P0390',message='job lease expired'; end if;
  if p_error is not null and p_error not in ('AI_NOT_CONFIGURED','AI_CONFIGURATION_INVALID','AI_PROVIDER_FAILED','AI_OUTPUT_INVALID') then raise exception using errcode='22023',message='invalid error code'; end if;
  if p_provider is not null and p_provider not in ('groq','gemini','openai','custom') or length(p_model)>200
    or p_input_tokens<0 or p_output_tokens<0 then raise exception using errcode='22023',message='invalid generation metadata'; end if;
  if p_error is null then
    if p_provider is null or p_model is null or length(trim(p_model))=0 then raise exception using errcode='22023',message='missing generation metadata'; end if;
    normalized=public.widget_review_content(p_content);
    n=d.version_count+1;
    insert into public.project_widget_versions(widget_id,version,source,request_key,content,created_by)
      values(d.id,n,'generated',j.request_key,normalized,auth.uid());
    update public.project_widgets set version_count=n,content=case when revision=j.base_revision then normalized else content end,
      revision=case when revision=j.base_revision then n else revision end where id=d.id;
  end if;
  update public.project_widget_jobs set status=case when p_error is null then 'completed' else 'failed' end,
    version=n,applied=p_error is null and d.revision=j.base_revision,
    history=history || jsonb_build_array(jsonb_build_object('attempt',attempt_count,'provider',p_provider,'model',p_model,'inputTokens',p_input_tokens,'outputTokens',p_output_tokens,'errorCode',p_error,'at',clock_timestamp()))
    where id=j.id returning * into j;
  return to_jsonb(j)-array['context','lease_token','lease_until'];
end; $$;

create function public.read_project_widget(p_project_id uuid,p_kind text,p_version integer default null,p_page integer default 1,p_page_size integer default 20)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare d public.project_widgets; result jsonb;
begin
  if not public.is_admin() then raise exception using errcode='42501',message='admin required'; end if;
  if p_kind is null or p_kind not in ('widget') or p_page is null or p_page<1 or p_page>100000 or p_page_size is null or p_page_size not between 1 and 50 or p_version<1 then raise exception using errcode='22023',message='invalid widget query'; end if;
  if not exists(select 1 from public.projects where id=p_project_id) then raise exception using errcode='P0002',message='project not found'; end if;
  select * into d from public.project_widgets where project_id=p_project_id and kind=p_kind;
  if p_version is not null then
    select to_jsonb(v) into result from public.project_widget_versions v where widget_id=d.id and version=p_version;
    if result is null then raise exception using errcode='P0002',message='version not found'; end if;
    return result;
  end if;
  return jsonb_build_object('widget',case when d.id is null then null else to_jsonb(d) end,
    'versions',(select coalesce(jsonb_agg(to_jsonb(v)-'content'),'[]') from (select * from public.project_widget_versions where widget_id=d.id order by version desc limit p_page_size offset (p_page-1)*p_page_size) v),
    'pagination',jsonb_build_object('page',p_page,'pageSize',p_page_size,'total',coalesce(d.version_count,0)));
end; $$;

-- Sanitized job history is read through a checked definer function, never raw leases/context.
create function public.read_project_widget_jobs(p_project_id uuid,p_kind text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception using errcode='42501',message='admin required'; end if;
  return (select coalesce(jsonb_agg(to_jsonb(j)-array['context','lease_token','lease_until']),'[]') from
    (select j.* from public.project_widget_jobs j join public.project_widgets d on d.id=j.widget_id where d.project_id=p_project_id and d.kind=p_kind order by j.created_at desc,j.id limit 20) j);
end; $$;

revoke all on function public.widget_requirements(jsonb) from public, anon, authenticated;
revoke all on function public.widget_review_content(jsonb) from public, anon, authenticated;
revoke all on function public.claim_project_widget(uuid,text,uuid,boolean,jsonb) from public, anon;
revoke all on function public.finish_project_widget(uuid,uuid,jsonb,text,text,text,integer,integer) from public, anon;
revoke all on function public.read_project_widget(uuid,text,integer,integer,integer) from public, anon;
revoke all on function public.read_project_widget_jobs(uuid,text) from public, anon;
grant execute on function public.claim_project_widget(uuid,text,uuid,boolean,jsonb),public.finish_project_widget(uuid,uuid,jsonb,text,text,text,integer,integer),public.read_project_widget(uuid,text,integer,integer,integer),public.read_project_widget_jobs(uuid,text) to authenticated;
