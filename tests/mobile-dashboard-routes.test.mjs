import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import { readMobileInput, MobileActionError } from "../lib/mobile-actions.mjs";
import { dashboardOptions, DashboardError } from "../lib/mobile-dashboard.mjs";
const require = createRequire(import.meta.url), ts = require("typescript");
const compile = path => ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"),
  {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
const getCode = compile("../app/api/mobile-dashboard/route.ts"), postCode = compile("../app/api/mobile-ledger-actions/route.ts");
function route(email = "fixture@example.com", fault = false) {
  const calls = [], exports = {}, getExports = {};
  const dependencies = name => {
    if (name.includes("chatgpt-auth")) return {getChatGPTUser:async()=>email?{email}:null};
    if (name.includes("life-store")) return {getLifeBindings:()=>({DB:{}})};
    if (name.includes("finance-store")) return {ensureFinanceSchema:async()=>{calls.push(["schema"]);}};
    if (name.includes("mobile-dashboard")) return {dashboardOptions,DashboardError,readMobileDashboard:async(...args)=>{
      calls.push(["read",...args]);if(fault)throw new Error("private fixture");return {kind:args[1].kind};}};
    if (name.includes("mobile-ledger-actions")) return {applyLedgerAction:async(...args)=>{
      calls.push(["write",...args]);if(fault)throw new Error("private fixture");return {state:"applied"};}};
    if (name.includes("mobile-actions")) return {readMobileInput,MobileActionError};
    throw new Error("Unexpected dependency");
  };
  vm.runInNewContext(getCode,{exports:getExports,Response,URL,Date,require:dependencies});
  vm.runInNewContext(postCode,{exports,Response,URL,Date,require:dependencies});
  return {get:getExports.GET,post:exports.POST,calls};
}
const body = {requestId:"a1111111-1111-4111-8111-111111111111",action:"ledger.create",expectedAccount:"fixture@example.com",payload:{}};
const get = (path="/api/mobile-dashboard?kind=goals",headers={}) => new Request("https://example.com"+path,{headers});
const post = (input=body,headers={},path="/api/mobile-ledger-actions") => new Request("https://example.com"+path,{
  method:"POST",headers:{origin:"https://example.com","content-type":"application/json",...headers},body:JSON.stringify(input)});
test("Dashboard authenticates and validates selectors before storage, with private noncached responses",async()=>{
  const anonymous=route("");assert.equal((await anonymous.get(get())).status,401);assert.equal(anonymous.calls.length,0);
  for(const [path,headers,status] of [
    ["/api/mobile-dashboard?kind=goals&owner=x",{},422],
    ["/api/mobile-dashboard?kind=goals",{"sec-fetch-site":"cross-site"},403],
    ["/api/mobile-dashboard?kind=goals",{origin:"https://other.test"},403],
    ["/api/mobile-dashboard/?kind=goals",{},403],
  ]){const r=route();assert.equal((await r.get(get(path,headers))).status,status);assert.equal(r.calls.length,0);}
  const r=route(),response=await r.get(get());assert.equal(response.status,200);
  assert.equal(response.headers.get("cache-control"),"private, no-store");assert.equal(response.headers.get("x-content-type-options"),"nosniff");
  assert.equal((await response.json()).user.email,body.expectedAccount);
});
test("Ledger rejects cross-origin, altered accounts, unknown root fields and oversized JSON before writes",async()=>{
  const anon=route("");assert.equal((await anon.post(post())).status,401);assert.equal(anon.calls.length,0);
  for(const [input,headers,path,status] of [
    [body,{origin:"https://other.test"},undefined,403],
    [body,{"sec-fetch-site":"cross-site"},undefined,403],
    [body,{},"/api/mobile-ledger-actions?owner=x",403],
    [{...body,expectedAccount:"other@example.com"},{},undefined,409],
    [{...body,ownerId:"other"},{},undefined,422],
    [{...body,payload:{note:"x".repeat(33000)}},{},undefined,413],
  ]){const r=route();assert.equal((await r.post(post(input,headers,path))).status,status);assert.equal(r.calls.length,0);}
});
test("Ledger binds actor to authenticated identity, never accepts body account as owner selector",async()=>{
  const r=route(),response=await r.post(post());assert.equal(response.status,200);
  const write=r.calls.find(x=>x[0]==="write");assert.equal(write[2],"fixture@example.com");
  assert.equal("expectedAccount" in write[3],false);assert.equal(response.headers.get("cache-control"),"private, no-store");
  assert.equal((await response.json()).user.email,body.expectedAccount);
});
test("Unexpected failures remain uncertain and never leak internal messages or return empty success",async()=>{
  const r=route(undefined,true),a=await r.get(get()),b=await r.post(post());
  assert.equal(a.status,503);assert.equal(b.status,503);
  assert.doesNotMatch(await a.text(),/private fixture/);assert.doesNotMatch(await b.text(),/private fixture/);
});
