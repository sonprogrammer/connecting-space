import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { NextRequest } from "next/server";
import { registerPathAlias } from "./helpers/register-path-alias";
import { jsonError } from "../src/shared/api/response";
registerPathAlias();
// eslint-disable-next-line @typescript-eslint/no-require-imports
const auth=require("../src/shared/lib/auth/admin-api") as typeof import("../src/shared/lib/auth/admin-api");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const generation=require("../src/entities/widget/server/generation") as typeof import("../src/entities/widget/server/generation");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const route=require("../src/app/api/admin/projects/[id]/widgets/route") as typeof import("../src/app/api/admin/projects/[id]/widgets/route");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const provider=require("../src/entities/widget/server/ai") as typeof import("../src/entities/widget/server/ai");
const id="11111111-1111-4111-8111-111111111111", key="22222222-2222-4222-8222-222222222222";
const context={params:Promise.resolve({id})};
const requirements={industry:"카페",purpose:"소개",targetAudience:"방문자",mood:"차분",colors:["#123456"],sections:["소개"],interactions:[]};
const input={requestKey:key,requirements};
const spec={elements:[{id:"intro",parentId:null,tag:"h2",text:"소개"}],styles:[],interactions:[]};
const config={provider:"groq" as const,apiKey:"never-log",model:"existing-model",baseUrl:"https://api.groq.com/openai/v1"};
const request=(method:string,body?:unknown,query="")=>new NextRequest(`http://localhost/api/admin/projects/${id}/widgets${query}`,{method,headers:{"content-type":"application/json"},...(body===undefined?{}:{body:JSON.stringify(body)})});
test("widget authorization precedes all parsing",async()=>{
  const a=mock.method(auth,"getVerifiedAdminSupabase",async()=>({ok:false as const,response:jsonError("ADMIN_AUTH_REQUIRED","Denied",401)}));
  try{for(const handler of [route.GET,route.POST]){const r=await handler(request("POST","bad"),{params:Promise.resolve({id:"bad"})});assert.equal(r.status,401);assert.equal(r.headers.get("Cache-Control"),"no-store");}}finally{a.mock.restore();}
});
test("widget bounded JSON and strict queries block RPC",async()=>{
  let calls=0;const a=mock.method(auth,"getVerifiedAdminSupabase",async()=>({ok:true as const,supabase:{rpc:async()=>{calls++;return {data:null,error:null};}} as never}));
  try{
    for(const query of ["?version=0","?page=1&page=2","?unknown=x"])assert.equal((await route.GET(request("GET",undefined,query),context)).status,400);
    assert.equal((await route.POST(request("POST",{...input,html:"bad"}),context)).status,400);
    assert.equal((await route.POST(request("POST","x".repeat(16385)),context)).status,413);
    assert.equal((await route.POST(new NextRequest("http://localhost",{method:"POST",body:"{}"}),context)).status,415);
    assert.equal(calls,0);
  }finally{a.mock.restore();}
});
test("completed/processing/failed duplicate never calls provider",async()=>{
  let status="completed";const a=mock.method(auth,"getVerifiedAdminSupabase",async()=>({ok:true as const,supabase:{rpc:async()=>({data:{execute:false,job:{id,status,version:1}},error:null})} as never}));
  const g=mock.method(generation,"generateAndFinishWidget",async()=>{throw Error("must not call");});
  try{for(const [state,http] of [["completed",200],["processing",202],["failed",409]] as const){status=state;assert.equal((await route.POST(request("POST",input),context)).status,http);}assert.equal(g.mock.callCount(),0);}finally{a.mock.restore();g.mock.restore();}
});
test("GET compiles stored spec with private cache and paginated summaries",async()=>{
  const a=mock.method(auth,"getVerifiedAdminSupabase",async()=>({ok:true as const,supabase:{rpc:async(name:string)=>({data:name==="read_project_widget_jobs"?[]:{widget:{content:spec},versions:[{version:1}],pagination:{total:1}},error:null})} as never}));
  try{const r=await route.GET(request("GET"),context);assert.equal(r.status,200);assert.equal(r.headers.get("Cache-Control"),"private, no-store");const body=await r.json();assert.match(body.data.widget.code.html,/<h2/);assert.equal(body.data.versions[0].version,1);}finally{a.mock.restore();}
});
test("fixed error and 429 retry contracts hide raw messages",async()=>{
  let code="23505";const a=mock.method(auth,"getVerifiedAdminSupabase",async()=>({ok:true as const,supabase:{rpc:async()=>({data:null,error:{code,message:"secret@local.test token"}})} as never}));
  try{for(const [db,http] of [["23505",409],["53300",429],["P0002",404],["unknown",500]] as const){code=db;const r=await route.POST(request("POST",input),context);assert.equal(r.status,http);if(http===429)assert.equal(r.headers.get("Retry-After"),"60");assert.doesNotMatch(JSON.stringify(await r.json()),/secret@|token/);}}finally{a.mock.restore();}
});
test("provider reuses configured model and accepts structured safe spec only",async()=>{
  const result=await provider.generateWidget({requirements},{...config,fetch:async(_url,init)=>{
    const body=JSON.parse(String(init?.body));assert.equal(body.model,"existing-model");assert.equal(init?.redirect,"error");assert.equal(body.response_format.type,"json_schema");
    return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(spec)}}],usage:{prompt_tokens:10,completion_tokens:20}}));
  }});assert.deepEqual(result.content,spec);assert.equal(result.inputTokens,10);
  for(const response of [new Response("private secret",{status:429}),new Response("bad-json"),new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({...spec,javascript:"alert(1)"})}}]})),new Response("x".repeat(131073))])await assert.rejects(provider.generateWidget({}, {...config,fetch:async()=>response}),/^Error: AI_(PROVIDER_FAILED|OUTPUT_INVALID)$/);
  await assert.rejects(provider.generateWidget({}, {...config,baseUrl:"http://localhost"}),/AI_CONFIGURATION_INVALID/);
});
test("generation failure audits fixed codes without key, input or raw exceptions",async()=>{
  let args:Record<string,unknown>|undefined;
  const r=await generation.generateAndFinishWidget({rpc:async(_n:string,a:Record<string,unknown>)=>{args=a;return {data:{status:"failed"},error:null};}} as never,{job:{id},leaseToken:key,context:{private:"private-input"}},{config:()=>config,generate:async()=>{throw Error("never-log private-input private@example.test");}});
  assert.equal(r.failure,"AI_PROVIDER_FAILED");assert.equal(args?.p_error,"AI_PROVIDER_FAILED");assert.doesNotMatch(JSON.stringify(args),/never-log|private-input|private@example/);
});
test("fresh generation maps success and bounded provider failures",async()=>{
  let failure:string|null=null;
  const a=mock.method(auth,"getVerifiedAdminSupabase",async()=>({ok:true as const,supabase:{rpc:async()=>({data:{execute:true,job:{id,status:"processing"},context:{requirements},leaseToken:key},error:null})} as never}));
  const g=mock.method(generation,"generateAndFinishWidget",async()=>({data:{id,status:failure?"failed":"completed",version:failure?null:1},error:null,failure} as never));
  try{for(const [error,http] of [[null,201],["AI_NOT_CONFIGURED",503],["AI_CONFIGURATION_INVALID",503],["AI_OUTPUT_INVALID",502],["AI_PROVIDER_FAILED",502]] as const){failure=error;assert.equal((await route.POST(request("POST",input),context)).status,http);}}finally{a.mock.restore();g.mock.restore();}
});
test("historical code reads compile safely and corrupted stored payload fails closed",async()=>{
  let content:unknown=spec;
  const a=mock.method(auth,"getVerifiedAdminSupabase",async()=>({ok:true as const,supabase:{rpc:async()=>({data:{version:1,content},error:null})} as never}));
  try{const r=await route.GET(request("GET",undefined,"?version=1"),context);assert.equal(r.status,200);assert.match((await r.json()).data.code.html,/<h2/);content={html:"<script>secret</script>"};const invalid=await route.GET(request("GET",undefined,"?version=1"),context);assert.equal(invalid.status,500);assert.doesNotMatch(JSON.stringify(await invalid.json()),/script|secret/);}finally{a.mock.restore();}
});
