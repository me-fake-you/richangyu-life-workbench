import test from "node:test";
import assert from "node:assert/strict";
import { database, count } from "./helpers/mobile-db.mjs";
import { applyManagement, managementOptions, managementValues, managementRevision, readManagement } from "../lib/mobile-management.mjs";
const NOW = Date.parse("2026-10-15T10:00:00Z");
export function managementDatabase() {
  const db = database();
  db.sqlite.exec("CREATE TABLE projects(id TEXT PRIMARY KEY,title TEXT NOT NULL,kind TEXT NOT NULL DEFAULT '个人目标',status TEXT NOT NULL DEFAULT '进行中',progress INTEGER NOT NULL DEFAULT 0,description TEXT NOT NULL DEFAULT '',color TEXT NOT NULL DEFAULT '#477c6a',start_at TEXT,target_at TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
  db.sqlite.exec("CREATE TABLE milestones(id TEXT PRIMARY KEY,project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,title TEXT NOT NULL,happened_at TEXT NOT NULL,note TEXT NOT NULL DEFAULT '',completed INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
  db.sqlite.exec("CREATE TABLE tasks(id TEXT PRIMARY KEY,project_id TEXT,title TEXT,status TEXT)");
  db.sqlite.exec("CREATE TABLE finance_budgets(id TEXT PRIMARY KEY,month TEXT NOT NULL,category TEXT NOT NULL,amount REAL NOT NULL DEFAULT 0,note TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(month,category))");
  db.sqlite.exec("CREATE TABLE savings_goals(id TEXT PRIMARY KEY,title TEXT NOT NULL,target_amount REAL NOT NULL DEFAULT 0,saved_amount REAL NOT NULL DEFAULT 0,target_at TEXT,color TEXT NOT NULL DEFAULT '#477c6a',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
  db.sqlite.exec("INSERT INTO financial_accounts(id,name,initial_balance) VALUES('cash','fixture cash',100),('bank','fixture bank',0)");
  return db;
}
const values = {
  goal:()=>({title:"fixture goal",kind:"个人目标",status:"进行中",progress:25,description:"fixture note",startAt:null,targetAt:null}),
  milestone:()=>({title:"fixture milestone",projectId:null,happenedAt:"2026-10-15T00:00:00.000Z",note:"fixture",completed:false}),
  account:()=>({name:"fixture account",type:"现金",initialBalance:"0.00",isArchived:false}),
  budget:()=>({month:"2026-10",category:"餐饮",amount:"100.00",note:"fixture"}),
  savings:()=>({title:"fixture savings",targetAmount:"500.00",savedAmount:"12.29",targetAt:null}),
  transfer:()=>({amount:"0.29",accountId:"cash",transferAccountId:"bank",occurredAt:"2026-10-15T00:00:00.000Z",note:"fixture transfer"}),
};
const create = (section="goal", patch={}, requestId=crypto.randomUUID())=>({requestId,action:"manage.create",payload:{section,values:{...values[section](),...patch}}});
const apply = (db,input,subject="fixture@example.com")=>applyManagement(db,subject,input,NOW);
const control = (input,action)=>({requestId:input.requestId,action,payload:{action:input.action,payload:input.payload}});
const read = (db,section,page=0)=>readManagement(db,{section,page},NOW);
async function edit(db,section,id,patch={},action="manage.update"){
  const table={goal:"projects",milestone:"milestones",account:"financial_accounts",budget:"finance_budgets",savings:"savings_goals",transaction:"finance_transactions"}[section];
  const row=db.sqlite.prepare("SELECT * FROM "+table+" WHERE id=?").get(id);
  const item=(await read(db,section)).items.find(item=>item.id===id);
  return {requestId:crypto.randomUUID(),action,payload:{section,id,expectedRevision:await managementRevision(row),values:action==="manage.remove"?{}:{...item.values,...patch}}};
}
function tx(db,id="t",patch={}){
  const v={type:"支出",amount:10,category:"餐饮",account:"cash",transfer:null,related:null,recurring:null,...patch};
  db.sqlite.prepare("INSERT INTO finance_transactions(id,type,amount,category,account_id,transfer_account_id,related_transaction_id,recurring_transaction_id,occurred_at,note) VALUES(?,?,?,?,?,?,?,?,?,?)")
    .run(id,v.type,v.amount,v.category,v.account,v.transfer,v.related,v.recurring,"2026-10-15T00:00:00.000Z","fixture");
}
test("Management selectors reject owner injection, duplicate keys, unknown sections and large pages",()=>{
  assert.deepEqual(managementOptions(new URLSearchParams("section=goal&page=0")),{section:"goal",page:0});
  for(const query of ["section=__proto__","section=goal&section=budget","section=goal&ownerId=other","section=account&page=-1","section=goal&page=1000","section=goal&page=00"])
    assert.throws(()=>managementOptions(new URLSearchParams(query)));
});
test("Strict management values reject coercion, invalid calendar dates, unknown fields and excessive money",()=>{
  assert.equal(managementValues("account",values.account()).initialBalance,"0.00");
  assert.equal(managementValues("account",{...values.account(),initialBalance:"-12.29"}).initialBalance,"-12.29");
  for(const [section,patch] of [
    ["goal",{progress:101}],["goal",{progress:"25"}],["goal",{status:"custom unsupported"}],["goal",{title:" "}],
    ["goal",{targetAt:"2026-02-30T00:00:00.000Z"}],["goal",{startAt:"2026-11-01T00:00:00.000Z",targetAt:"2026-10-01T00:00:00.000Z"}],
    ["milestone",{completed:"false"}],["account",{initialBalance:0}],["account",{initialBalance:"1.001"}],
    ["budget",{month:"2026-13"}],["savings",{targetAmount:"0"}],["savings",{savedAmount:"-1"}],
    ["transfer",{transferAccountId:"cash"}],["transfer",{amount:"10000000"}],["goal",{ownerId:"other"}],
  ])assert.throws(()=>managementValues(section,{...values[section](),...patch}));
});
test("Native goals and milestones can be created, edited and completed without completing tasks or schedules",async()=>{
  const db=managementDatabase(),goal=await apply(db,create());
  db.sqlite.prepare("INSERT INTO tasks VALUES('task',?,'fixture task','进行中')").run(goal.id);
  const milestone=await apply(db,create("milestone",{projectId:goal.id}));
  await apply(db,await edit(db,"goal",goal.id,{status:"已完成",progress:100,description:"changed"}));
  await apply(db,await edit(db,"milestone",milestone.id,{completed:true,note:"done"}));
  assert.equal(db.sqlite.prepare("SELECT progress FROM projects").get().progress,100);
  assert.equal(db.sqlite.prepare("SELECT completed FROM milestones").get().completed,1);
  assert.equal(db.sqlite.prepare("SELECT status FROM tasks").get().status,"进行中");
  assert.equal(count(db,"schedule_events"),0);assert.equal(count(db,"finance_transactions"),0);
});
test("Updates preserve fields outside native forms including custom color and creation history",async()=>{
  const db=managementDatabase(),saved=await apply(db,create());
  db.sqlite.prepare("UPDATE projects SET color='#abcdef',created_at='2020-01-01 00:00:00' WHERE id=?").run(saved.id);
  await apply(db,await edit(db,"goal",saved.id,{title:"changed"}));
  const row=db.sqlite.prepare("SELECT * FROM projects").get();
  assert.equal(row.color,"#abcdef");assert.equal(row.created_at,"2020-01-01 00:00:00");
});
test("All-content revisions protect same-timestamp web changes and atomic races after reads",async()=>{
  const db=managementDatabase(),saved=await apply(db,create()),before=await edit(db,"goal",saved.id,{title:"mobile"});
  db.sqlite.prepare("UPDATE projects SET description='web' WHERE id=?").run(saved.id);
  await assert.rejects(()=>apply(db,before),error=>error.status===409);
  const race=await edit(db,"goal",saved.id,{title:"race"});
  db.beforeBatch=sqlite=>sqlite.prepare("UPDATE projects SET color='#123456' WHERE id=?").run(saved.id);
  await assert.rejects(()=>apply(db,race),error=>error.status===409);
  assert.equal(db.sqlite.prepare("SELECT title FROM projects").get().title,"fixture goal");
  assert.equal(count(db,"mobile_management_receipts_v1"),1);
});
test("Two operation identifiers cannot overwrite the same goal revision",async()=>{
  const db=managementDatabase(),saved=await apply(db,create()),a=await edit(db,"goal",saved.id,{title:"first"}),b=await edit(db,"goal",saved.id,{title:"second"});
  await apply(db,a);await assert.rejects(()=>apply(db,b),error=>error.status===409);
  assert.equal(db.sqlite.prepare("SELECT title FROM projects").get().title,"first");
});
test("Exact replay is once-only, altered reuse is rejected and actors are isolated",async()=>{
  const db=managementDatabase(),input=create(),first=await apply(db,input);
  assert.deepEqual(await apply(db,input),first);assert.equal(count(db,"projects"),1);
  await assert.rejects(()=>apply(db,{...input,payload:{...input.payload,values:{...input.payload.values,title:"another"}}}),error=>error.status===409);
  const other=await apply(db,input,"other-fixture@example.com");assert.notEqual(other.id,first.id);
  assert.equal(count(db,"projects"),2);assert.equal(count(db,"audit_logs"),2);
});
test("Unknown status is not failure; discard reserves the original and never undoes a saved entity",async()=>{
  const db=managementDatabase(),input=create();
  assert.equal((await apply(db,control(input,"manage.status"))).state,"not-confirmed");
  assert.equal((await apply(db,control(input,"manage.discard"))).state,"cancelled");
  assert.equal((await apply(db,input)).state,"cancelled");assert.equal(count(db,"projects"),0);
  const saved=create();await apply(db,saved);
  assert.equal((await apply(db,control(saved,"manage.discard"))).state,"applied");assert.equal(count(db,"projects"),1);
});
test("A discard committed just before the original atomic claim prevents a late save",async()=>{
  const db=managementDatabase(),input=create();
  await apply(db,control(input,"manage.discard"));
  assert.equal((await apply(db,input)).state,"cancelled");assert.equal(count(db,"projects"),0);
});
test("Accounts support explicit initial balance and archive while preserving all transaction history",async()=>{
  const db=managementDatabase(),saved=await apply(db,create("account",{initialBalance:"-12.29"}));
  tx(db,"history",{account:saved.id});
  await apply(db,await edit(db,"account",saved.id,{isArchived:true,name:"archived fixture"}));
  const row=db.sqlite.prepare("SELECT * FROM financial_accounts WHERE id=?").get(saved.id);
  assert.equal(row.is_archived,1);assert.equal(row.initial_balance,-12.29);assert.equal(count(db,"finance_transactions"),1);
});
test("Category budgets are uniquely guarded and do not overwrite a web budget",async()=>{
  const db=managementDatabase(),saved=await apply(db,create("budget"));
  await apply(db,await edit(db,"budget",saved.id,{amount:"0.00",note:"pause"}));
  await assert.rejects(()=>apply(db,create("budget")),error=>error.status===409);
  assert.equal(count(db,"finance_budgets"),1);assert.equal(db.sqlite.prepare("SELECT amount FROM finance_budgets").get().amount,0);
  const race=create("budget",{category:"交通"});
  db.beforeBatch=sqlite=>sqlite.exec("INSERT INTO finance_budgets(id,month,category,amount) VALUES('web','2026-10','交通',30)");
  await assert.rejects(()=>apply(db,race),error=>error.status===409);
  assert.equal(count(db,"finance_budgets"),2);
});
test("Savings edits only manual savings progress and never move account money",async()=>{
  const db=managementDatabase(),saved=await apply(db,create("savings"));
  await apply(db,await edit(db,"savings",saved.id,{savedAmount:"599.29"}));
  assert.equal(db.sqlite.prepare("SELECT saved_amount FROM savings_goals").get().saved_amount,599.29);
  assert.equal(count(db,"finance_transactions"),0);
});
test("Transfers are a single replay-protected transaction, not double income/expense entries",async()=>{
  const db=managementDatabase(),input=create("transfer"),saved=await apply(db,input);
  await apply(db,input);const row=db.sqlite.prepare("SELECT * FROM finance_transactions").get();
  assert.equal(row.id,saved.id);assert.equal(row.type,"转账");assert.equal(row.account_id,"cash");assert.equal(row.transfer_account_id,"bank");
  assert.equal(row.amount,0.29);assert.equal(row.is_private,1);assert.equal(count(db,"finance_transactions"),1);
});
test("Archived account and deleted goal reference races fail before consuming a receipt",async()=>{
  const db=managementDatabase(),transfer=create("transfer");
  db.beforeBatch=sqlite=>sqlite.exec("UPDATE financial_accounts SET is_archived=1 WHERE id='bank'");
  await assert.rejects(()=>apply(db,transfer),error=>error.status===409);assert.equal(count(db,"finance_transactions"),0);
  const goal=await apply(db,create()),milestone=create("milestone",{projectId:goal.id});
  db.beforeBatch=sqlite=>sqlite.prepare("DELETE FROM projects WHERE id=?").run(goal.id);
  await assert.rejects(()=>apply(db,milestone),error=>error.status===409);assert.equal(count(db,"milestones"),0);
});
test("Ordinary unlinked transactions can be edited or soft-deleted without converting type",async()=>{
  const db=managementDatabase();tx(db);
  await apply(db,await edit(db,"transaction","t",{amount:"12.29",note:"corrected"}));
  await assert.rejects(async()=>apply(db,await edit(db,"transaction","t",{type:"收入"})),error=>error.status===409);
  const remove=await edit(db,"transaction","t",{},"manage.remove");await apply(db,remove);await apply(db,remove);
  assert.equal(count(db,"finance_transactions"),1);assert.ok(db.sqlite.prepare("SELECT deleted_at FROM finance_transactions").get().deleted_at);
  assert.equal((await read(db,"transaction")).items.length,0);
});
test("Incoming refunds and settlement references protect original transactions too",async()=>{
  const db=managementDatabase();tx(db,"original");tx(db,"refund",{type:"退款",related:"original"});
  const item=(await read(db,"transaction")).items.find(x=>x.id==="original");assert.equal(item.editable,false);assert.equal(item.removable,false);
  const remove=await edit(db,"transaction","original",{},"manage.remove");
  await assert.rejects(()=>apply(db,remove),error=>error.status===409);
  tx(db,"settled");
  db.sqlite.exec("INSERT INTO side_hustle_projects(id,title) VALUES('side','fixture side');INSERT INTO receivables(id,project_id) VALUES('r','side')");
  db.sqlite.exec("INSERT INTO settlements(id,receivable_id,transaction_id,amount,received_at) VALUES('settlement','r','settled',10,'2026-10-15')");
  assert.equal((await read(db,"transaction")).items.find(x=>x.id==="settled").editable,false);
});
test("A refund inserted after preflight blocks the original transaction CAS atomically",async()=>{
  const db=managementDatabase();tx(db,"original");const update=await edit(db,"transaction","original",{amount:"30.00"});
  db.beforeBatch=sqlite=>sqlite.exec("INSERT INTO finance_transactions(id,type,amount,related_transaction_id,occurred_at) VALUES('late-refund','退款',3,'original','2026-10-15')");
  await assert.rejects(()=>apply(db,update),error=>error.status===409);
  assert.equal(db.sqlite.prepare("SELECT amount FROM finance_transactions WHERE id='original'").get().amount,10);
});
test("Linked, split and recurring transactions cannot be mutated through a generic ledger editor",async()=>{
  const db=managementDatabase();tx(db,"recurring",{recurring:"rule"});
  const item=(await read(db,"transaction")).items[0];assert.equal(item.editable,false);assert.equal(item.removable,false);
  await assert.rejects(async()=>apply(db,await edit(db,"transaction","recurring",{},"manage.remove")),error=>error.status===409);
});
test("New ordinary cashflow uses its existing receipt route; unknown owner fields and destructive goal delete are rejected",async()=>{
  const db=managementDatabase();
  await assert.rejects(()=>apply(db,{...create(),ownerId:"other"}),error=>error.status===422);
  await assert.rejects(()=>apply(db,{requestId:crypto.randomUUID(),action:"manage.remove",payload:{section:"goal",id:"x",expectedRevision:"a".repeat(64),values:{}}}),error=>error.status===422);
  await assert.rejects(()=>apply(db,{requestId:crypto.randomUUID(),action:"manage.create",payload:{section:"transaction",values:{}}}),error=>error.status===422);
});
test("Management read is paginated and read-only, and only returns needed reference choices",async()=>{
  const db=managementDatabase();
  for(let i=0;i<55;i++)db.sqlite.prepare("INSERT INTO projects(id,title) VALUES(?,?)").run("p"+String(i).padStart(3,"0"),"fixture"+i);
  const first=await read(db,"goal"),second=await read(db,"goal",1);
  assert.equal(first.items.length,50);assert.equal(second.items.length,5);assert.equal(first.nextPage,1);assert.equal(second.nextPage,null);
  assert.equal(new Set([...first.items,...second.items].map(x=>x.id)).size,55);
  assert.equal(count(db,"audit_logs"),0);assert.doesNotMatch(JSON.stringify(first),/fixture cash/);
});
test("Invalid legacy values are visible read-only, never silently normalized into an edit",async()=>{
  const db=managementDatabase();
  db.sqlite.exec("INSERT INTO projects(id,title,status) VALUES('legacy','fixture','legacy unknown')");
  db.sqlite.exec("INSERT INTO milestones(id,title,happened_at) VALUES('bad','fixture date','2026-02-30T00:00:00.000Z')");
  assert.equal((await read(db,"goal")).items[0].editable,false);
  assert.equal((await read(db,"milestone")).items[0].editable,false);
});
test("Unexpected database read failure is not a successful empty result",async()=>{
  await assert.rejects(()=>readManagement({batch:async()=>[{success:false}]},{section:"goal",page:0},NOW));
});
test("Downstream audit failure rolls back receipt and business mutation; original request may retry",async()=>{
  const db=managementDatabase(),input=create();
  db.sqlite.exec("CREATE TRIGGER fail_audit BEFORE INSERT ON audit_logs BEGIN SELECT RAISE(ABORT,'fixture failure'); END");
  await assert.rejects(()=>apply(db,input));assert.equal(count(db,"projects"),0);assert.equal(count(db,"mobile_management_receipts_v1"),0);
  db.sqlite.exec("DROP TRIGGER fail_audit");assert.equal((await apply(db,input)).state,"applied");assert.equal(count(db,"projects"),1);
});
