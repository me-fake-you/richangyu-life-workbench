import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import { readMobileInput, MobileActionError } from "../lib/mobile-actions.mjs";
import { managementOptions } from "../lib/mobile-management.mjs";
const require=createRequire(import.meta.url),ts=require("typescript");
const compile=p=>ts.transpileModule(readFileSync(new URL(p,import.meta.url),"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
const getCode=compile("../app/api/mobile-management/route.ts"),postCode=compile("../app/api/mobile-management-actions/route.ts");
function route(email="fixture@example.com",fault=false){
  const calls=[],getExports={},postExports={};
  const dependency=name=>{
    if(name.includes("chatgpt-auth"))return {getChatGPTUser:async()=>email?{email}:null};
    if(name.includes("life-store"))return {getLifeBindings:()=>({DB:{}})};
    if(name.includes("finance-store"))return {ensureFinanceSchema:async()=>calls.push("schema")};
    if(name.includes("mobile-actions"))return {readMobileInput,MobileActionError};
    if(name.includes("mobile-management"))return {managementOptions,readManagement:async(...args)=>{
      calls.push(["read",...args]);if(fault)throw new Error("private details");return {section:args[1].section};},
      applyManagement:async(...args)=>{calls.push(["write",...args]);if(fault)throw new Error("private details");return {state:"applied"};}};
    throw new Error("Unknown dependency");
  };
  vm.runInNewContext(getCode,{exports:getExports,Response,URL,Date,require:dependency});
  vm.runInNewContext(postCode,{exports:postExports,Response,URL,Date,require:dependency});
  return {get:getExports.GET,post:postExports.POST,calls};
}
const input={requestId:"a1111111-1111-4111-8111-111111111111",action:"manage.create",expectedAccount:"fixture@example.com",payload:{section:"goal",values:{}}};
const get=(path="/api/mobile-management?section=goal&page=0",headers={})=>new Request("https://example.com"+path,{headers});
const post=(body=input,headers={},path="/api/mobile-management-actions")=>new Request("https://example.com"+path,{method:"POST",
  headers:{origin:"https://example.com","content-type":"application/json",...headers},body:JSON.stringify(body)});
test("Management read requires identity and exact same-origin selectors before touching storage",async()=>{
  const anon=route("");assert.equal((await anon.get(get())).status,401);assert.equal(anon.calls.length,0);
  for(const [path,headers,status] of [
    ["/api/mobile-management?section=goal&owner=x",{},422],
    ["/api/mobile-management?section=goal",{"sec-fetch-site":"cross-site"},403],
    ["/api/mobile-management?section=goal",{origin:"https://other.test"},403],
    ["/api/mobile-management/?section=goal",{},403],
  ]){const r=route();assert.equal((await r.get(get(path,headers))).status,status);assert.equal(r.calls.length,0);}
});
test("Management writes reject wrong origin, account, unknown root fields and oversized bodies",async()=>{
  const anon=route("");assert.equal((await anon.post(post())).status,401);assert.equal(anon.calls.length,0);
  for(const [body,headers,path,status] of [
    [input,{origin:"https://other.test"},undefined,403],
    [input,{"sec-fetch-site":"cross-site"},undefined,403],
    [input,{},"/api/mobile-management-actions?owner=x",403],
    [{...input,expectedAccount:"other@example.com"},{},undefined,409],
    [{...input,ownerId:"other"},{},undefined,422],
    [{...input,payload:{values:{note:"x".repeat(33000)}}},{},undefined,413],
  ]){const r=route();assert.equal((await r.post(post(body,headers,path))).status,status);assert.equal(r.calls.length,0);}
});
test("Management strips expectedAccount before business commands and uses authenticated server identity",async()=>{
  const r=route(),response=await r.post(post());assert.equal(response.status,200);
  const call=r.calls.find(x=>Array.isArray(x)&&x[0]==="write");assert.equal(call[2],"fixture@example.com");assert.equal("expectedAccount" in call[3],false);
  assert.equal(response.headers.get("cache-control"),"private, no-store");assert.equal(response.headers.get("x-content-type-options"),"nosniff");
  assert.equal((await response.json()).user.email,input.expectedAccount);
  const read=await r.get(get());assert.equal(read.headers.get("cache-control"),"private, no-store");
});
test("Unexpected errors preserve uncertainty and do not leak implementation data",async()=>{
  const r=route(undefined,true),a=await r.get(get()),b=await r.post(post());
  assert.equal(a.status,503);assert.equal(b.status,503);assert.doesNotMatch(await a.text(),/private details/);assert.doesNotMatch(await b.text(),/private details/);
});
