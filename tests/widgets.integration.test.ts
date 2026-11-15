import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { createClient } from "@supabase/supabase-js";

test("local widget generation lifecycle, concurrency, rollback and RLS", { skip: process.env.RUN_WIDGET_INTEGRATION_TESTS !== "1" }, async t => {
  const url=process.env.API_URL!, anonKey=process.env.ANON_KEY!, serviceKey=process.env.SERVICE_ROLE_KEY!;
  assert.ok(url && anonKey && serviceKey); assert.ok(["127.0.0.1","localhost"].includes(new URL(url).hostname));
  const options={auth:{persistSession:false,autoRefreshToken:false}};
  const service=createClient(url,serviceKey,options), anon=createClient(url,anonKey,options);
  const users:string[]=[], customerId=randomUUID(), projectId=randomUUID();
  const req={industry:"카페",purpose:"소개",targetAudience:"방문자",mood:"차분",colors:["#123456"],sections:["소개"],interactions:[]};
  const content={elements:[{id:"intro",parentId:null,tag:"h2",text:"소개"}],styles:[],interactions:[]};
  async function login(isAdmin:boolean){
    const email=`widget-${randomUUID()}@local.test`, password=`Local-${randomUUID()}!`;
    const user=await service.auth.admin.createUser({email,password,email_confirm:true});assert.equal(user.error,null);users.push(user.data.user.id);
    if(isAdmin)assert.equal((await service.from("admins").insert({id:user.data.user.id,email})).error,null);
    const client=createClient(url,anonKey,options);assert.equal((await client.auth.signInWithPassword({email,password})).error,null);return client;
  }
  try{
    const admin=await login(true), member=await login(false), otherAdmin=await login(true);
    assert.equal((await service.from("customers").insert({id:customerId,name:"위젯 로컬",email:"do-not-send@example.test"})).error,null);
    assert.equal((await service.from("projects").insert({id:projectId,customer_id:customerId,name:"위젯 테스트"})).error,null);
    const claim=(key:string,retry=false,requirements:unknown=req,pid=projectId)=>admin.rpc("claim_project_widget",{p_project_id:pid,p_kind:"widget",p_request_key:key,p_retry:retry,p_requirements:requirements});
    const finish=(j:Record<string,unknown>,error:string|null=null,value:unknown=content)=>admin.rpc("finish_project_widget",{p_job_id:(j.job as {id:string}).id,p_lease_token:j.leaseToken,p_content:error?null:value,p_error:error,p_provider:"groq",p_model:"existing-model",p_input_tokens:10,p_output_tokens:20});
    const read=(version?:number,page=1)=>admin.rpc("read_project_widget",{p_project_id:projectId,p_kind:"widget",p_version:version,p_page:page,p_page_size:1});
    await t.test("authentication, input bounds and empty state",async()=>{
      assert.equal((await read()).data.widget,null);
      for(const c of [anon,member])assert.equal((await c.rpc("claim_project_widget",{p_project_id:projectId,p_kind:"widget",p_request_key:randomUUID(),p_requirements:req})).error?.code,"42501");
      assert.equal((await claim(randomUUID(),false,{...req,sections:[]})).error?.code,"22023");
      assert.equal((await claim(randomUUID(),false,{...req,extra:"x"})).error?.code,"22023");
    });
    await t.test("failed retry keeps input, rejects mismatched key and completes once",async()=>{
      const key=randomUUID(), first=await claim(key);assert.equal(first.error,null);assert.equal(first.data.execute,true);
      assert.doesNotMatch(JSON.stringify(first.data.context),/do-not-send|customer/);
      assert.equal((await finish(first.data,"AI_PROVIDER_FAILED")).data.status,"failed");
      assert.equal((await claim(key)).data.execute,false);
      assert.equal((await claim(key,true,{...req,mood:"변경"})).error?.code,"23505");
      const next=await claim(key,true);assert.equal(next.error,null);assert.deepEqual(next.data.context,first.data.context);
      const complete=await finish(next.data);assert.equal(complete.error,null);assert.equal(complete.data.version,1);
      assert.equal(complete.data.history.length,2);assert.equal(complete.data.history[1].outputTokens,20);
      assert.equal((await finish(next.data)).data.version,1);assert.equal((await claim(key)).data.execute,false);
    });
    await t.test("concurrent claims get one lease; invalid code rolls back",async()=>{
      const key=randomUUID(), pair=await Promise.all([claim(key),claim(key)]);assert.ok(pair.every(x=>x.error===null));assert.equal(pair.filter(x=>x.data.execute).length,1);
      const job=pair.find(x=>x.data.execute)!.data;
      assert.equal((await claim(randomUUID())).error?.code,"55P03");
      assert.equal((await admin.rpc("finish_project_widget",{p_job_id:job.job.id,p_lease_token:null})).error?.code,"42501");
      assert.equal((await otherAdmin.rpc("finish_project_widget",{p_job_id:job.job.id,p_lease_token:job.leaseToken})).error?.code,"42501");
      const invalid=[{...content,html:"<script>x</script>"},{...content,elements:[{...content.elements[0],tag:"script"}]},{...content,elements:[{...content.elements[0],onclick:"alert(1)"}]},{...content,styles:[{targetId:"intro",property:"color",value:"url(https://evil)"}]},{...content,interactions:[{triggerId:"intro",targetId:"intro",action:"toggle"}]},{...content,elements:Array.from({length:81},(_,n)=>({...content.elements[0],id:`x${n}`}))}];
      for(const v of invalid)assert.equal((await finish(job,null,v)).error?.code,"22023");
      assert.equal((await read()).data.widget.version_count,1);
      assert.equal((await finish(job)).data.version,2);
      const current=await read();assert.equal(current.data.widget.revision,2);assert.equal(current.data.versions.length,1);
      assert.equal((await read(undefined,2)).data.versions[0].version,1);
      assert.equal((await read(1)).data.content.elements[0].text,"소개");
      assert.equal((await read(999)).error?.code,"P0002");
    });
    await t.test("bounded attempts, stale lease recovery and sanitized history",async()=>{
      const key=randomUUID();for(let n=0;n<3;n++){const j=await claim(key,n>0);assert.equal(j.error,null);assert.equal((await finish(j.data,"AI_OUTPUT_INVALID")).data.status,"failed");}
      assert.equal((await claim(key,true)).error?.code,"P0001");
      const staleKey=randomUUID(), stale=await claim(staleKey);assert.equal(stale.error,null);
      assert.equal((await service.from("project_widget_jobs").update({lease_until:"2000-01-01T00:00:00Z"}).eq("id",stale.data.job.id)).error,null);
      assert.equal((await finish(stale.data)).error?.code,"P0390");
      const recovered=await claim(staleKey,true);assert.equal(recovered.error,null);
      assert.equal((await finish(stale.data)).error?.code,"42501");assert.equal((await finish(recovered.data)).data.version,3);
      const audit=await admin.rpc("read_project_widget_jobs",{p_project_id:projectId,p_kind:"widget"});assert.equal(audit.error,null);
      for(const j of audit.data){assert.equal("context" in j,false);assert.equal("lease_token" in j,false);assert.equal("lease_until" in j,false);}
    });
    await t.test("append-only version grants and non-admin RLS",async()=>{
      for(const table of ["project_widgets","project_widget_versions"]){
        assert.deepEqual((await member.from(table).select("*")).data,[]);
        assert.equal((await anon.from(table).select("*")).error?.code,"42501");
        const filter=table==="project_widgets"?"project_id":"version", value=table==="project_widgets"?projectId:1;
        assert.equal((await admin.from(table).update({content:{html:"bad"}}).eq(filter,value)).error?.code,"42501");
        assert.equal((await admin.from(table).delete().eq(filter,value)).error?.code,"42501");
      }
      assert.equal((await admin.from("project_widget_jobs").select("*")).error?.code,"42501");
      assert.equal((await member.rpc("read_project_widget",{p_project_id:projectId,p_kind:"widget"})).error?.code,"42501");
    });
    await t.test("cost concurrency and per-hour new job limits",async()=>{
      const ids=[projectId,randomUUID(),randomUUID(),randomUUID()];
      for(const id of ids.slice(1))assert.equal((await service.from("projects").insert({id,customer_id:customerId,name:"동시성"})).error,null);
      const a=await claim(randomUUID()), b=await claim(randomUUID(),false,req,ids[1]);assert.equal(a.error,null);assert.equal(b.error,null);
      assert.equal((await claim(randomUUID(),false,req,ids[2])).error?.code,"53300");
      const c=await otherAdmin.rpc("claim_project_widget",{p_project_id:ids[2],p_kind:"widget",p_request_key:randomUUID(),p_requirements:req});assert.equal(c.error,null);
      assert.equal((await otherAdmin.rpc("claim_project_widget",{p_project_id:ids[3],p_kind:"widget",p_request_key:randomUUID(),p_requirements:req})).error?.code,"53300");
      assert.equal((await otherAdmin.rpc("finish_project_widget",{p_job_id:c.data.job.id,p_lease_token:c.data.leaseToken,p_error:"AI_PROVIDER_FAILED"})).error,null);
      await finish(a.data,"AI_PROVIDER_FAILED");await finish(b.data,"AI_PROVIDER_FAILED");
      const rows=await service.from("project_widgets").select("id").eq("project_id",projectId);assert.equal(rows.error,null);
      for(let i=0;i<10;i++)assert.equal((await service.from("project_widget_jobs").insert({widget_id:rows.data![0].id,request_key:randomUUID(),status:"failed",base_revision:3,context:{requirements:req},created_by:users[0]})).error,null);
      assert.equal((await claim(randomUUID())).error?.code,"53300");
    });
  }finally{
    assert.equal((await service.from("projects").delete().eq("customer_id",customerId)).error,null);
    assert.equal((await service.from("customers").delete().eq("id",customerId)).error,null);
    for(const id of users){await service.from("admins").delete().eq("id",id);assert.equal((await service.auth.admin.deleteUser(id)).error,null);}
  }
});
