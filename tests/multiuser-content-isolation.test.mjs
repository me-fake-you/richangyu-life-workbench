import test from "node:test";
import assert from "node:assert/strict";
import { database, count } from "./helpers/mobile-db.mjs";
import { createOwnWorkspace, ensureWorkspaceSchema } from "../multiuser/workspace-service.mjs";
import { changeOwnContent, listOwnContent } from "../multiuser/content-service.mjs";
import { handleFoundationRequest } from "../multiuser/worker.mjs";
const data={title:"Note",content:"Personal",happenedAt:"2026-10-08T00:00:00Z"};
const create=()=>({requestId:crypto.randomUUID(),action:"create",kind:"record",data});
async function setup() {
 const DB=database(false);await ensureWorkspaceSchema(DB);
 await createOwnWorkspace(DB,"alice","Alice");await createOwnWorkspace(DB,"bob","Bob");return DB;
}
test("each account reads only its own records even when the other account's ID is known",async()=>{
 const DB=await setup(),alice=await changeOwnContent(DB,"alice",create());
 await changeOwnContent(DB,"bob",{...create(),data:{...data,content:"Bob"}});
 assert.equal((await listOwnContent(DB,"alice")).items[0].id,alice.id);
 const bob=(await listOwnContent(DB,"bob")).items;
 assert.equal(bob.length,1);assert.equal(bob[0].data.content,"Bob");
 await assert.rejects(changeOwnContent(DB,"bob",{requestId:crypto.randomUUID(),action:"update",kind:"record",id:alice.id,expectedRevision:1,data}),{status:409});
 await assert.rejects(changeOwnContent(DB,"bob",{requestId:crypto.randomUUID(),action:"delete",kind:"record",id:alice.id,expectedRevision:1}),{status:409});
 assert.equal((await listOwnContent(DB,"alice")).items.length,1);DB.sqlite.close();
});
test("create retry is idempotent, while a reused key with changed data is rejected",async()=>{
 const DB=await setup(),input=create(),first=await changeOwnContent(DB,"alice",input);
 assert.equal((await changeOwnContent(DB,"alice",input)).id,first.id);
 assert.equal(count(DB,"multiuser_content"),1);
 await assert.rejects(changeOwnContent(DB,"alice",{...input,data:{...data,content:"Changed"}}),{status:409});
 DB.sqlite.close();
});
test("revision guards prevent stale edits and soft delete preserves history",async()=>{
 const DB=await setup(),item=await changeOwnContent(DB,"alice",create());
 const edit={requestId:crypto.randomUUID(),action:"update",kind:"record",id:item.id,expectedRevision:1,data:{...data,content:"Edited"}};
 assert.equal((await changeOwnContent(DB,"alice",edit)).revision,2);
 await assert.rejects(changeOwnContent(DB,"alice",{...edit,requestId:crypto.randomUUID()}),{status:409});
 await changeOwnContent(DB,"alice",{requestId:crypto.randomUUID(),action:"delete",kind:"record",id:item.id,expectedRevision:2});
 assert.equal((await listOwnContent(DB,"alice")).items.length,0);assert.equal(count(DB,"multiuser_content"),1);DB.sqlite.close();
});
test("ownership selectors, client IDs and invalid schedule ranges cannot bypass validation",async()=>{
 const DB=await setup();
 for(const extra of [{workspaceId:"other"},{ownerUserId:"bob"},{id:"item_"+crypto.randomUUID()}]){
  await assert.rejects(changeOwnContent(DB,"alice",{...create(),...extra}),{status:422});
 }
 await assert.rejects(changeOwnContent(DB,"alice",{requestId:crypto.randomUUID(),action:"create",kind:"schedule",data:{title:"Bad",startAt:"2026-10-08T02:00:00Z",endAt:"2026-10-08T01:00:00Z"}}),{status:422});DB.sqlite.close();
});
test("a concurrent revision change aborts the write and leaves no receipt",async()=>{
 const DB=await setup(),item=await changeOwnContent(DB,"alice",create()),requestId=crypto.randomUUID();
 DB.beforeBatch=sqlite=>sqlite.prepare("UPDATE multiuser_content SET revision=revision+1 WHERE id=?").run(item.id);
 await assert.rejects(changeOwnContent(DB,"alice",{requestId,action:"update",kind:"record",id:item.id,expectedRevision:1,data:{...data,content:"Overwrite"}}),{status:409});
 assert.equal(DB.sqlite.prepare("SELECT content FROM (SELECT json_extract(data_json,'$.content') AS content FROM multiuser_content)").get().content,"Personal");
 assert.equal(DB.sqlite.prepare("SELECT request_id FROM multiuser_content_receipts WHERE request_id=?").get(requestId),undefined);DB.sqlite.close();
});
test("content is disabled by default and requires independent storage, gateway auth and same-origin writes",async()=>{
 const DB=await setup(),base={MULTIUSER_FOUNDATION_ENABLED:"true",MULTIUSER_AUTH_MODE:"sites-dispatch",MULTIUSER_DB:DB};
 const request=(input=create(),origin="https://example.com",subject="alice")=>new Request("https://example.com/api/content",{method:"POST",headers:{"content-type":"application/json","origin":origin,"oai-authenticated-user-id":subject},body:JSON.stringify(input)});
 assert.equal((await handleFoundationRequest(request(),base)).status,503);
 const env={...base,MULTIUSER_CONTENT_ENABLED:"true"};
 assert.equal((await handleFoundationRequest(request(create(),"https://attacker.test"),env)).status,403);
 assert.equal((await handleFoundationRequest(new Request("https://example.com/api/content"),env)).status,401);
 assert.equal((await handleFoundationRequest(request(),{...env,MULTIUSER_DB:undefined})).status,503);
 assert.equal((await handleFoundationRequest(request(),env)).status,200);
 const health=await handleFoundationRequest(new Request("https://example.com/health"),env);
 assert.equal((await health.json()).fullWorkbenchReady,false);DB.sqlite.close();
});
test("one-off schedules have their own isolated content kind",async()=>{
 const DB=await setup(),item=await changeOwnContent(DB,"alice",{requestId:crypto.randomUUID(),action:"create",kind:"schedule",data:{title:"Study",startAt:"2026-10-08T01:00:00Z",endAt:"2026-10-08T02:00:00Z"}});
 assert.equal((await listOwnContent(DB,"alice")).items[0].kind,"schedule");
 await assert.rejects(changeOwnContent(DB,"alice",{requestId:crypto.randomUUID(),action:"delete",kind:"record",id:item.id,expectedRevision:1}),{status:409});DB.sqlite.close();
});
