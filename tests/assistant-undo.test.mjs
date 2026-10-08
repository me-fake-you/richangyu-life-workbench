import test from "node:test";
import assert from "node:assert/strict";
import { issueAssistantUndo, undoAssistantChange } from "../lib/assistant-undo.mjs";
import { database, count } from "./helpers/mobile-db.mjs";
const NOW=Date.parse("2026-10-08T00:00:00Z"), sign=async payload=>"test:"+payload, verify=async(payload,signature)=>signature==="test:"+payload;
function audit(DB,id,subject="owner"){
 DB.sqlite.prepare("INSERT INTO audit_logs(id,action,entity_type,detail_json) VALUES(?,?,'schedule',?)").run(id,id.startsWith("assistant-capture:")?"assistant.capture.apply":"assistant.plan.apply",JSON.stringify({subject}));
}
async function plan(DB,operations) {
 const nonce=crypto.randomUUID();audit(DB,"assistant-plan:"+nonce);
 for(const op of operations) {
  DB.sqlite.prepare("INSERT INTO schedule_events(id,title,category,start_at,end_at,note,planned_minutes) VALUES(?,?,?,?,?,?,?)").run(op.id,op.title,op.category,op.startAt,op.endAt,op.note,Math.round((Date.parse(op.endAt)-Date.parse(op.startAt))/60000));
  DB.sqlite.prepare("INSERT INTO schedule_instances(id,schedule_id,occurrence_start,occurrence_end) VALUES(?,?,?,?)").run("instance-"+op.id,op.id,op.startAt,op.endAt);
 }
 return issueAssistantUndo(DB,JSON.stringify({nonce,operations}),"owner",false,sign,NOW);
}
const op=id=>({action:"create",id,title:"Study",category:"\u5b66\u4e60",startAt:"2026-10-09T01:00:00Z",endAt:"2026-10-09T02:00:00Z",note:""});
const undo=(DB,receipt,subject="owner",now=NOW)=>undoAssistantChange(DB,receipt.payload,receipt.signature,subject,verify,now);
test("eight-operation undo fits D1 limits and preserves cancelled schedule history",async()=>{
 const DB=database(),receipt=await plan(DB,Array.from({length:8},(_,i)=>({...op("p"+i),startAt:new Date(NOW+86400000+i*7200000).toISOString(),endAt:new Date(NOW+86400000+i*7200000+3600000).toISOString()})));
 assert.equal((await undo(DB,receipt)).undone,8);assert.equal(count(DB,"schedule_events"),8);
 assert.equal(DB.sqlite.prepare("SELECT count(*) AS n FROM schedule_events WHERE status='\u5df2\u53d6\u6d88'").get().n,8);
 assert.equal((await undo(DB,receipt)).alreadyUndone,true);DB.sqlite.close();
});
test("manual edits and concurrent activity prevent undo without partial cancellation",async()=>{
 const DB=database(),receipt=await plan(DB,[op("p1"),op("p2")]);
 DB.beforeBatch=sqlite=>sqlite.prepare("UPDATE schedule_instances SET actual_minutes=2 WHERE schedule_id='p2'").run();
 await assert.rejects(undo(DB,receipt),{status:409});
 assert.equal(DB.sqlite.prepare("SELECT count(*) AS n FROM schedule_events WHERE status='\u8ba1\u5212\u4e2d'").get().n,2);
 assert.equal(count(DB,"audit_logs"),1);DB.sqlite.close();
});
test("linked work sessions prevent schedule undo",async()=>{
 const DB=database(),receipt=await plan(DB,[op("p")]);
 DB.sqlite.exec("INSERT INTO side_hustle_projects(id,title) VALUES('project','Test'); INSERT INTO work_sessions(id,project_id,schedule_id,started_at) VALUES('work','project','p','2026-10-09T01:00:00Z')");
 await assert.rejects(undo(DB,receipt),{status:409});DB.sqlite.close();
});
test("expired, cross-account and forged receipts cannot change a schedule",async()=>{
 const DB=database(),receipt=await plan(DB,[op("p")]);
 await assert.rejects(undo(DB,receipt,"other"),{status:409});
 await assert.rejects(undo(DB,receipt,"owner",NOW+31*60000),{status:409});
 await assert.rejects(undo(DB,{...receipt,signature:"forged"}),{status:400});
 assert.equal(DB.sqlite.prepare("SELECT status FROM schedule_events").get().status,"\u8ba1\u5212\u4e2d");DB.sqlite.close();
});
test("unchanged AI life capture can be soft-deleted once; financial capture requires manual review",async()=>{
 const DB=database(),nonce=crypto.randomUUID(),data={id:"record",title:"Note",content:"Text",kind:"\u751f\u6d3b",mood:"\u5e73\u9759",happenedAt:"2026-10-08T00:00:00Z"};
 DB.sqlite.prepare("INSERT INTO life_events(id,title,content,kind,mood,happened_at) VALUES(?,?,?,?,?,?)").run(data.id,data.title,data.content,data.kind,data.mood,data.happenedAt);
 audit(DB,"assistant-capture:"+nonce);
 const receipt=await issueAssistantUndo(DB,JSON.stringify({nonce,kind:"life",data}),"owner",true,sign,NOW);
 await undo(DB,receipt);assert.notEqual(DB.sqlite.prepare("SELECT deleted_at FROM life_events").get().deleted_at,null);
 assert.equal((await undo(DB,receipt)).alreadyUndone,true);
 assert.deepEqual(await issueAssistantUndo(DB,JSON.stringify({kind:"income"}),"owner",true,sign,NOW),{unavailable:"financial_records_require_manual_review"});DB.sqlite.close();
});
test("updated life capture is protected from undo",async()=>{
 const DB=database(),nonce=crypto.randomUUID(),data={id:"record",title:"Note",content:"Text",kind:"\u751f\u6d3b",mood:"\u5e73\u9759",happenedAt:"2026-10-08T00:00:00Z"};
 DB.sqlite.prepare("INSERT INTO life_events(id,title,content,kind,mood,happened_at,revision) VALUES(?,?,?,?,?,?,2)").run(data.id,data.title,data.content,data.kind,data.mood,data.happenedAt);audit(DB,"assistant-capture:"+nonce);
 const receipt=await issueAssistantUndo(DB,JSON.stringify({nonce,kind:"life",data}),"owner",true,sign,NOW);
 await assert.rejects(undo(DB,receipt),{status:409});assert.equal(DB.sqlite.prepare("SELECT deleted_at FROM life_events").get().deleted_at,null);DB.sqlite.close();
});

test("undo restores an untouched future schedule update but refuses new overlap",async()=>{
 for(const conflict of [false,true]) {
  const DB=database(), before={title:"Old",category:"\u5b66\u4e60",start_at:"2026-10-09T01:00:00Z",end_at:"2026-10-09T02:00:00Z",place:"",person:"",project:"",note:"",repeat_rule:"\u4e0d\u91cd\u590d",status:"\u8ba1\u5212\u4e2d",planned_minutes:60,actual_minutes:0};
  const operation={...op("p"),action:"update",title:"New",startAt:"2026-10-09T03:00:00Z",endAt:"2026-10-09T04:00:00Z",before};
  const receipt=await plan(DB,[operation]);
  if(conflict) DB.sqlite.prepare("INSERT INTO schedule_events(id,title,start_at,end_at) VALUES('other','Conflict',?,?)").run(before.start_at,before.end_at);
  if(conflict) await assert.rejects(undo(DB,receipt),{status:409});
  else {await undo(DB,receipt);assert.equal(DB.sqlite.prepare("SELECT title FROM schedule_events WHERE id='p'").get().title,"Old");assert.equal(DB.sqlite.prepare("SELECT occurrence_start FROM schedule_instances WHERE schedule_id='p'").get().occurrence_start,before.start_at);}
  DB.sqlite.close();
 }
});
