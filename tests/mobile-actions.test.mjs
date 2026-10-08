import test from "node:test";
import assert from "node:assert/strict";
import { applyMobileAction, readMobileInput, readWorkDashboard } from "../lib/mobile-actions.mjs";
import { database, count } from "./helpers/mobile-db.mjs";
const NOW=Date.parse("2026-10-08T10:30:00.000Z");
const operation=(action,payload)=>({ requestId:crypto.randomUUID(),action,payload });
const apply=(DB,input,subject="owner")=>applyMobileAction(DB,subject,input,NOW);
async function work(DB) {
 const project=await apply(DB,operation("project.create",{title:"Delivery",billingMode:"\u6309\u5c0f\u65f6",unitRate:"60"}));
 const started=await apply(DB,operation("work.start",{projectId:project.id,startedAt:"2026-10-08T09:30:00.000Z"}));
 return {project,started};
}
test("stable operation receipts prevent duplicate records and reject changed payload or account",async()=>{
 const DB=database(), op=operation("event.create",{content:"A note"});
 const first=await apply(DB,op), second=await apply(DB,op);
 assert.equal(first.alreadyApplied,false);assert.equal(second.alreadyApplied,true);
 assert.equal(first.id,second.id);assert.equal(count(DB,"life_events"),1);
 await assert.rejects(apply(DB,{...op,payload:{content:"Changed"}}),{status:409});
 await assert.rejects(apply(DB,op,"other-owner"),{status:409});
 DB.sqlite.close();
});
test("work completion creates receivable only; partial receipts record only actual payments",async()=>{
 const DB=database(),{started}=await work(DB);
 const finish=operation("work.finish",{id:started.id,endedAt:"2026-10-08T10:30:00.000Z",expectedIncome:"60"});
 const done=await apply(DB,finish);assert.equal(done.minutes,60);
 assert.equal(count(DB,"receivables"),1);assert.equal(count(DB,"finance_transactions"),0);
 assert.equal((await apply(DB,finish)).alreadyApplied,true);
 await assert.rejects(apply(DB,operation("work.finish",finish.payload)),{status:409});
 DB.sqlite.exec("INSERT INTO financial_accounts(id,name) VALUES('cash','Cash')");
 const receipt=operation("receivable.receive",{receivableId:done.receivableId,accountId:"cash",expectedReceived:"0",amount:"20"});
 assert.equal((await apply(DB,receipt)).status,"\u90e8\u5206\u5230\u8d26");
 await apply(DB,receipt);
 assert.equal(count(DB,"settlements"),1);assert.equal(count(DB,"finance_transactions"),1);
 await assert.rejects(apply(DB,operation("receivable.receive",{...receipt.payload,amount:"10"})),{status:409});
 assert.equal((await apply(DB,operation("receivable.receive",{...receipt.payload,expectedReceived:"20",amount:"40"}))).status,"\u5df2\u5230\u8d26");
 assert.equal(DB.sqlite.prepare("SELECT sum(amount) AS n FROM finance_transactions").get().n,60);
 const dashboard=await readWorkDashboard(DB);
 assert.equal(dashboard.receivables[0].amountReceived,60);assert.equal(dashboard.operationReceipts,true);
 DB.sqlite.close();
});
test("active work cannot be started twice with different request IDs",async()=>{
 const DB=database(),{project}=await work(DB);
 await assert.rejects(apply(DB,operation("work.start",{projectId:project.id})),{status:409});
 assert.equal(count(DB,"work_sessions"),1);DB.sqlite.close();
});
test("concurrent changed work state rejects completion without partial events or receivables",async()=>{
 const DB=database(),{started}=await work(DB);
 DB.beforeBatch=sqlite=>sqlite.prepare("UPDATE work_sessions SET status='\u5df2\u5b8c\u6210' WHERE id=?").run(started.id);
 await assert.rejects(apply(DB,operation("work.finish",{id:started.id,expectedIncome:"60"})),{status:409});
 assert.equal(count(DB,"receivables"),0);assert.equal(count(DB,"life_events"),0);DB.sqlite.close();
});
test("financial CAS rejects a payment based on a changed received amount",async()=>{
 const DB=database(),{started}=await work(DB);
 const done=await apply(DB,operation("work.finish",{id:started.id,expectedIncome:"60"}));
 DB.sqlite.exec("INSERT INTO financial_accounts(id,name) VALUES('cash','Cash')");
 DB.beforeBatch=sqlite=>sqlite.prepare("UPDATE receivables SET amount_received=5 WHERE id=?").run(done.receivableId);
 await assert.rejects(apply(DB,operation("receivable.receive",{receivableId:done.receivableId,accountId:"cash",amount:"20",expectedReceived:"0"})),{status:409});
 assert.equal(count(DB,"settlements"),0);assert.equal(count(DB,"finance_transactions"),0);DB.sqlite.close();
});
test("failed downstream write rolls back receipt and all preceding writes",async()=>{
 const DB=database(),{started}=await work(DB);
 DB.sqlite.exec("CREATE TRIGGER reject_receivable BEFORE INSERT ON receivables BEGIN SELECT RAISE(ABORT,'test failure'); END");
 const op=operation("work.finish",{id:started.id,expectedIncome:"60"});
 await assert.rejects(apply(DB,op));
 assert.equal(count(DB,"life_events"),0);
 assert.equal(DB.sqlite.prepare("SELECT status FROM work_sessions WHERE id=?").get(started.id).status,"\u8fdb\u884c\u4e2d");
 assert.equal(DB.sqlite.prepare("SELECT id FROM mobile_action_receipts WHERE id=?").get(op.requestId),undefined);DB.sqlite.close();
});
test("draft schedules and inbox items use the same idempotent receipt protection",async()=>{
 const DB=database();
 for(const op of [operation("schedule.create",{title:"Study",startAt:"2026-10-09T01:00:00Z",endAt:"2026-10-09T02:00:00Z"}),operation("inbox.create",{content:"Idea"})]){
  await apply(DB,op);assert.equal((await apply(DB,op)).alreadyApplied,true);
 }
 assert.equal(count(DB,"schedule_events"),1);assert.equal(count(DB,"schedule_rule_settings"),1);assert.equal(count(DB,"inbox_items"),1);DB.sqlite.close();
});
test("invalid money, ranges and owner selectors are rejected",async()=>{
 const DB=database();
 for(const unitRate of ["NaN","-1","1e3","1.234","100000001"]){
  await assert.rejects(apply(DB,operation("project.create",{title:"Test",billingMode:"\u6309\u6b21",unitRate})),{status:422});
 }
 await assert.rejects(apply(DB,{...operation("event.create",{content:"note"}),owner:"attacker"}),{status:422});
 await assert.rejects(apply(DB,operation("schedule.create",{title:"bad",startAt:"2026-10-09T02:00:00Z",endAt:"2026-10-09T01:00:00Z"})),{status:422});DB.sqlite.close();
});
test("streamed request input enforces JSON and a byte limit",async()=>{
 await assert.rejects(readMobileInput(new Request("https://example.com",{method:"POST",body:"{}",headers:{"content-type":"text/plain"}})),{status:415});
 await assert.rejects(readMobileInput(new Request("https://example.com",{method:"POST",body:JSON.stringify({content:"x".repeat(33000)}),headers:{"content-type":"application/json"}})),{status:413});
 assert.deepEqual(await readMobileInput(new Request("https://example.com",{method:"POST",body:"{}",headers:{"content-type":"application/json; charset=utf-8"}})),{});
});
