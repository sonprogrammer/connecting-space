import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { NextRequest } from "next/server";
import { registerPathAlias } from "./helpers/register-path-alias";
import { jsonError } from "../src/shared/api/response";
registerPathAlias();
// eslint-disable-next-line @typescript-eslint/no-require-imports
const authApi=require("../src/shared/lib/auth/admin-api") as typeof import("../src/shared/lib/auth/admin-api");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const generation=require("../src/entities/document/server/generation") as typeof import("../src/entities/document/server/generation");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const route=require("../src/app/api/admin/projects/[id]/documents/route") as typeof import("../src/app/api/admin/projects/[id]/documents/route");
const id="11111111-1111-4111-8111-111111111111", key="22222222-2222-4222-8222-222222222222";
const context={params:Promise.resolve({id})};
const request=(method:string,body?:unknown,query="")=>new NextRequest(`http://localhost/api/admin/projects/${id}/documents${query}`,{method,headers:{"content-type":"application/json"},...(body===undefined?{}:{body:JSON.stringify(body)})});

test("document handlers authenticate before body/id validation",async()=>{
  const auth=mock.method(authApi,"getVerifiedAdminSupabase",async()=>({ok:false as const,response:jsonError("ADMIN_AUTH_REQUIRED","Denied",401)}));
  try{for(const handler of [route.GET,route.POST,route.PATCH]) assert.equal((await handler(request("POST","invalid"),{params:Promise.resolve({id:"bad"})})).status,401);}
  finally{auth.mock.restore();}
});

test("document validation blocks malformed/oversized requests before RPC",async()=>{
  let calls=0;
  const auth=mock.method(authApi,"getVerifiedAdminSupabase",async()=>({ok:true as const,supabase:{rpc:async()=>{calls++;return {data:null,error:null};}} as never}));
  try{
    assert.equal((await route.GET(request("GET",undefined,"?type=unknown"),context)).status,400);
    assert.equal((await route.GET(request("GET",undefined,"?type=proposal&type=contract"),context)).status,400);
    assert.equal((await route.POST(request("POST",{type:"proposal"}),context)).status,400);
    assert.equal((await route.POST(new NextRequest(`http://localhost/${id}`,{method:"POST",body:"{}"}),context)).status,415);
    assert.equal((await route.POST(request("POST","x".repeat(32769)),context)).status,413);
    assert.equal(calls,0);
  }finally{auth.mock.restore();}
});

test("idempotent completed generation does not invoke AI and GET stays private",async()=>{
  const calls:string[]=[];
  const auth=mock.method(authApi,"getVerifiedAdminSupabase",async()=>({ok:true as const,supabase:{rpc:async(name:string)=>{
    calls.push(name);
    return {data:name==="claim_project_document"?{execute:false,job:{id,status:"completed",version:1}}:name==="read_project_document"?{document:null,versions:[]} : [],error:null};
  }} as never}));
  const generate=mock.method(generation,"generateAndFinishDocument",async()=>{throw new Error("must not call AI");});
  try{
    assert.equal((await route.POST(request("POST",{type:"contract",requestKey:key}),context)).status,200);
    assert.equal(generate.mock.callCount(),0);
    const read=await route.GET(request("GET",undefined,"?type=contract"),context);
    assert.equal(read.headers.get("Cache-Control"),"private, no-store");
    assert.deepEqual(calls,["claim_project_document","read_project_document","read_project_document_jobs"]);
  }finally{auth.mock.restore();generate.mock.restore();}
});

test("document DB failure is mapped without exposing provider details",async()=>{
  const auth=mock.method(authApi,"getVerifiedAdminSupabase",async()=>({ok:true as const,supabase:{rpc:async()=>({data:null,error:{code:"P0390",message:"private error"}})} as never}));
  try{
    const response=await route.PATCH(request("PATCH",{type:"proposal",requestKey:key,expectedRevision:0,content:{title:"검토",summary:"기술 범위",scopeItems:["화면 구성"]}}),context);
    assert.equal(response.status,409);assert.doesNotMatch(JSON.stringify(await response.json()),/private error/);
  }finally{auth.mock.restore();}
});

test("generation failure audit uses only fixed codes and preserves context confidentiality",async()=>{
  let args:Record<string,unknown>|undefined;
  const result=await generation.generateAndFinishDocument({rpc:async(_name:string,value:Record<string,unknown>)=>{args=value;return {data:{status:"failed"},error:null};}} as never,"contract",{
    job:{id},leaseToken:key,context:{project:{name:"private project"}},
  },{config:()=>({provider:"groq",apiKey:"private-token",model:"existing-model",baseUrl:"https://api.groq.com/openai/v1"}),generate:async()=>{throw new Error("private-token private@example.test");}});
  assert.equal(result.failure,"AI_PROVIDER_FAILED");
  assert.equal(args?.p_error,"AI_PROVIDER_FAILED");
  assert.doesNotMatch(JSON.stringify(args),/private-token|private@example.test|private project/);
});
