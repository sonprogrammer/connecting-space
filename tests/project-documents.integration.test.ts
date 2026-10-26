import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { createClient } from "@supabase/supabase-js";

const enabled = process.env.RUN_DOCUMENT_INTEGRATION_TESTS === "1";
test("local document lifecycle, versions, recovery, atomicity, concurrency and RLS", { skip: !enabled }, async (t) => {
  const url = process.env.API_URL, anonKey = process.env.ANON_KEY, serviceKey = process.env.SERVICE_ROLE_KEY;
  assert.ok(url && anonKey && serviceKey);
  assert.ok(["localhost", "127.0.0.1"].includes(new URL(url).hostname));
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  const service = createClient(url, serviceKey, options);
  const anon = createClient(url, anonKey, options);
  const users: string[] = [];
  const customerId=randomUUID(), projectId=randomUUID(), serviceId=randomUUID(), faqId=randomUUID();
  const content = { title: "웹 제작 방향", summary: "요청 내용을 바탕으로 기술 범위를 제안합니다", scopeItems: ["반응형 화면 구성"] };
  const edited = { ...content, summary: "관리자가 편집한 기술 범위" };
  async function login(admin: boolean) {
    const email=`doc-${randomUUID()}@local.test`, password=`Local-${randomUUID()}!`;
    const user=await service.auth.admin.createUser({ email, password, email_confirm: true }); assert.equal(user.error,null);
    users.push(user.data.user.id);
    if(admin) assert.equal((await service.from("admins").insert({ id:user.data.user.id,email })).error,null);
    const client=createClient(url!,anonKey!,options);
    assert.equal((await client.auth.signInWithPassword({email,password})).error,null);
    return client;
  }
  try {
    const admin=await login(true), member=await login(false);
    assert.equal((await service.from("customers").insert({id:customerId,name:"문서 로컬 고객",email:"never-send@example.test",phone:"private-phone"})).error,null);
    assert.equal((await service.from("projects").insert({id:projectId,customer_id:customerId,name:"웹 제작",contract_amount:1000})).error,null);
    assert.equal((await service.from("service_offerings").insert({id:serviceId,slug:`doc-${serviceId}`,name:"서비스 근거",description:"공개 기술 설명",price_label:"협의",duration_label:"협의",is_published:true})).error,null);
    assert.equal((await service.from("faq_items").insert({id:faqId,question:"작업 범위",answer:"범위는 담당자와 협의",is_published:true})).error,null);
    const claim=(key:string,retry=false,kind="proposal")=>admin.rpc("claim_project_document",{p_project_id:projectId,p_kind:kind,p_request_key:key,p_retry:retry});
    const finish=(job:Record<string,unknown>, failure:string|null=null, value:unknown=content)=>admin.rpc("finish_project_document",{
      p_job_id:(job.job as {id:string}).id,p_lease_token:job.leaseToken,p_content:failure?null:value,p_error:failure,
      p_provider:"groq",p_model:"existing-model",p_input_tokens:10,p_output_tokens:20,
    });
    const read=(version?:number)=>admin.rpc("read_project_document",{p_project_id:projectId,p_kind:"proposal",p_version:version});
    const save=(key:string,revision:number,value=edited)=>admin.rpc("save_project_document",{p_project_id:projectId,p_kind:"proposal",p_request_key:key,p_expected_revision:revision,p_content:value});
    await t.test("empty reads and authorization",async()=>{
      assert.equal((await read()).data.document,null);
      for(const client of [anon,member]) assert.equal((await client.rpc("claim_project_document",{p_project_id:projectId,p_kind:"proposal",p_request_key:randomUUID()})).error?.code,"42501");
    });
    const key=randomUUID(); let first:Record<string,unknown>;
    await t.test("failure recovery, stable context and idempotent generation",async()=>{
      const result=await claim(key); assert.equal(result.error,null); first=result.data;
      assert.equal(first.execute,true);
      assert.doesNotMatch(JSON.stringify(first.context),/never-send@example.test|private-phone/);
      assert.equal((await finish(first,"AI_PROVIDER_FAILED")).data.status,"failed");
      assert.equal((await claim(key)).data.execute,false);
      const retry=await claim(key,true); assert.equal(retry.error,null);
      assert.deepEqual(retry.data.context,first.context);
      const done=await finish(retry.data); assert.equal(done.error,null);
      assert.equal(done.data.applied,true); assert.equal(done.data.history.length,2);
      assert.equal(done.data.history[1].model,"existing-model");
      assert.equal((await claim(key)).data.execute,false);
      const current=await read(); assert.equal(current.data.document.revision,1);
      assert.equal(current.data.document.content.reviewOnly,true);
      assert.deepEqual(current.data.document.content.needsConfirmation.map((x:{category:string})=>x.category),["price","schedule","legal"]);
    });
    await t.test("manual saves are idempotent and stale edits roll back",async()=>{
      const key=randomUUID(); assert.equal((await save(key,1)).data.version,2);
      assert.equal((await save(key,1)).data.version,2);
      assert.equal((await save(key,2,content)).error?.code,"23505");
      assert.equal((await save(randomUUID(),1)).error?.code,"P0390");
      assert.equal((await read()).data.document.version_count,2);
    });
    await t.test("regeneration preserves a concurrently saved current edit",async()=>{
      const job=await claim(randomUUID()); assert.equal(job.error,null);
      assert.equal((await save(randomUUID(),2)).data.version,3);
      const result=await finish(job.data); assert.equal(result.error,null); assert.equal(result.data.version,4); assert.equal(result.data.applied,false);
      assert.equal((await read()).data.document.revision,3);
      assert.equal((await read()).data.document.content.summary,edited.summary);
      assert.equal((await read(1)).data.content.summary,content.summary);
    });
    await t.test("concurrent duplicate requests get one lease; invalid finalize is atomic",async()=>{
      const key=randomUUID(); const pair=await Promise.all([claim(key),claim(key)]);
      assert.ok(pair.every(x=>x.error===null)); assert.equal(pair.filter(x=>x.data.execute).length,1);
      const job=pair.find(x=>x.data.execute)!.data;
      assert.equal((await admin.rpc("finish_project_document",{p_job_id:job.job.id,p_lease_token:null,p_content:content,p_provider:"groq",p_model:"existing-model"})).error?.code,"42501");
      assert.equal((await claim(randomUUID())).error?.code,"55P03");
      assert.equal((await finish(job,null,{...content,summary:"비용 500만원"})).error?.code,"22023");
      assert.equal((await read()).data.document.version_count,4);
      assert.equal((await finish(job)).data.version,5);
      assert.equal((await finish(job)).data.version,5);
    });
    await t.test("bounded retries and stale lease recovery",async()=>{
      const key=randomUUID();
      for(let n=0;n<3;n++){const job=await claim(key,n>0);assert.equal(job.error,null);assert.equal((await finish(job.data,"AI_OUTPUT_INVALID")).data.status,"failed");}
      assert.equal((await claim(key,true)).error?.code,"P0001");
      const staleKey=randomUUID(), stale=await claim(staleKey); assert.equal(stale.error,null);
      assert.equal((await service.from("project_document_jobs").update({lease_until:"2000-01-01T00:00:00Z"}).eq("id",stale.data.job.id)).error,null);
      assert.equal((await finish(stale.data)).error?.code,"P0390");
      const recovered=await claim(staleKey,true);assert.equal(recovered.error,null);
      assert.equal((await finish(stale.data)).error?.code,"42501");
      assert.equal((await finish(recovered.data)).data.version,6);
    });
    await t.test("type isolation, append-only versions and sanitized audit",async()=>{
      const contract=await claim(randomUUID(),false,"contract"); assert.equal(contract.error,null);
      assert.equal((await finish(contract.data)).data.version,1);
      assert.match((await admin.rpc("read_project_document",{p_project_id:projectId,p_kind:"contract"})).data.document.content.reviewNotice,/검토용 초안/);
      assert.equal((await admin.from("project_document_versions").update({source:"manual"}).eq("version",1)).error?.code,"42501");
      for(const table of ["project_documents","project_document_versions"]){assert.deepEqual((await member.from(table).select("*")).data,[]);}
      assert.equal((await member.from("project_document_jobs").select("*")).error?.code,"42501");
      const audit=await admin.rpc("read_project_document_jobs",{p_project_id:projectId,p_kind:"proposal"}); assert.equal(audit.error,null);
      for(const job of audit.data){assert.equal("context" in job,false);assert.equal("lease_token" in job,false);assert.equal("lease_until" in job,false);}
      assert.equal((await read(999)).error?.code,"P0002");
    });
    await t.test("parallel saves keep one current version and preserve the other edit",async()=>{
      const results=await Promise.all([save(randomUUID(),6),save(randomUUID(),6,content)]);
      assert.equal(results.filter(x=>x.error===null).length,1);
      assert.equal(results.filter(x=>x.error?.code==="P0390").length,1);
      assert.equal((await read()).data.document.version_count,7);
    });
    await t.test("per-admin cost/concurrency limit is enforced across documents",async()=>{
      const otherId=randomUUID();
      assert.equal((await service.from("projects").insert({id:otherId,customer_id:customerId,name:"추가 검증"})).error,null);
      const proposal=await claim(randomUUID()), contract=await claim(randomUUID(),false,"contract");
      assert.equal(proposal.error,null);assert.equal(contract.error,null);
      assert.equal((await admin.rpc("claim_project_document",{p_project_id:otherId,p_kind:"proposal",p_request_key:randomUUID()})).error?.code,"53300");
      assert.equal((await finish(proposal.data,"AI_PROVIDER_FAILED")).error,null);
      assert.equal((await finish(contract.data,"AI_PROVIDER_FAILED")).error,null);
    });
  } finally {
    assert.equal((await service.from("projects").delete().eq("customer_id",customerId)).error,null);
    assert.equal((await service.from("customers").delete().eq("id",customerId)).error,null);
    await service.from("service_offerings").delete().eq("id",serviceId); await service.from("faq_items").delete().eq("id",faqId);
    for(const id of users){await service.from("admins").delete().eq("id",id);assert.equal((await service.auth.admin.deleteUser(id)).error,null);}
  }
});
