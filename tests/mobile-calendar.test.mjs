import test from "node:test";
import assert from "node:assert/strict";
import { calendarRange, calendarQuery, readMobileCalendar } from "../lib/mobile-calendar.mjs";
import { database, count } from "./helpers/mobile-db.mjs";
const NOW=Date.parse("2026-10-10T10:00:00Z");
const url="https://example.com/api/mobile-calendar?from=2026-10-10";
const query=value=>calendarQuery(value??url,NOW);
const read=(DB,value=query(),subject="owner")=>readMobileCalendar(DB,subject,value,NOW);
function event(DB,id="event",start="2026-10-10T01:00:00Z",end="2026-10-10T02:00:00Z",repeat="\u4e0d\u91cd\u590d") {
 DB.sqlite.prepare("INSERT INTO schedule_events(id,title,start_at,end_at,repeat_rule) VALUES(?,?,?,?,?)").run(id,"Title "+id,start,end,repeat);
}
function instance(DB,id="instance",schedule="event",start="2026-10-10T01:00:00Z",end="2026-10-10T02:00:00Z") {
 DB.sqlite.prepare("INSERT INTO schedule_instances(id,schedule_id,occurrence_start,occurrence_end) VALUES(?,?,?,?)").run(id,schedule,start,end);
}
test("range is seven Beijing natural days, independent of UTC midnight",()=>{
 const range=calendarRange("2026-10-10",NOW);
 assert.equal(new Date(range.start).toISOString(),"2026-10-09T16:00:00.000Z");
 assert.equal(range.to,"2026-10-17");assert.equal(range.end-range.start,7*86400000);
 for(const value of ["2026-02-30","2026-13-10","2026-2-10","",null,"2024-10-10"]) assert.throws(()=>calendarRange(value,NOW),{status:422});
 assert.equal(calendarRange("2025-10-10",NOW).from,"2025-10-10");
 assert.equal(calendarRange("2027-10-10",NOW).from,"2027-10-10");
});
test("query rejects owner selectors, repeated keys, unknown fields and malformed cursors",()=>{
 for(const suffix of ["&owner=other","&from=2026-10-11","&limit=999","&cursor=","&cursor=bad","&cursor="+"a".repeat(64)+".0"]) assert.throws(()=>query(url+suffix),{status:422});
});
test("today's ended event and a long cross-boundary event remain visible",async()=>{
 const DB=database();event(DB);event(DB,"long","2026-09-01T00:00:00Z","2026-10-11T00:00:00Z");
 const page=await read(DB);assert.equal(page.total,2);assert.equal(page.rows[0].id,"event:long");
 assert.equal(page.rows[1].id,"event:event");assert.equal(page.nextCursor,"");
 assert.equal(page.coverage,"stored-occurrences-and-single-events");
 assert.equal(count(DB,"schedule_instances"),0);DB.sqlite.close();
});
test("exclusive upper and lower boundaries do not invent an extra day's entry",async()=>{
 const DB=database();event(DB,"before","2026-10-09T15:00:00Z","2026-10-09T16:00:00Z");
 event(DB,"after","2026-10-16T16:00:00Z","2026-10-16T17:00:00Z");
 assert.equal((await read(DB)).total,0);DB.sqlite.close();
});
test("stored occurrences override source events and retain actual execution details",async()=>{
 const DB=database();event(DB);instance(DB);
 DB.sqlite.prepare("UPDATE schedule_instances SET status=?,actual_minutes=35,reflection=? WHERE id='instance'").run("\u5df2\u5b8c\u6210","Reviewed");
 const page=await read(DB);assert.equal(page.total,1);assert.equal(page.rows[0].actualMinutes,35);
 assert.equal(page.rows[0].reflection,"Reviewed");assert.equal(page.rows[0].source,"stored");DB.sqlite.close();
});
test("recurring occurrences are independent; uncovered repetition is disclosed",async()=>{
 const DB=database();event(DB,"repeat","2026-01-01T00:00:00Z","2026-01-01T01:00:00Z","\u6bcf\u5929");
 instance(DB,"one","repeat");instance(DB,"two","repeat","2026-10-11T01:00:00Z","2026-10-11T02:00:00Z");
 const page=await read(DB);assert.equal(page.repeating,1);assert.equal(page.total,2);
 assert.equal(count(DB,"schedule_instances"),2);DB.sqlite.close();
});
test("exceptions suppress unmaterialized single events; canceled stored history is retained",async()=>{
 const DB=database();event(DB);
 DB.sqlite.prepare("INSERT INTO schedule_exceptions(id,schedule_id,occurrence_start) VALUES('skip','event','2026-10-10T01:00:00Z')").run();
 assert.equal((await read(DB)).total,0);instance(DB);
 DB.sqlite.prepare("UPDATE schedule_instances SET status=?").run("\u5df2\u53d6\u6d88");
 assert.equal((await read(DB)).rows[0].status,"\u5df2\u53d6\u6d88");DB.sqlite.close();
});
test("more than 40 rows can be paginated without duplicates or automatic writes",async()=>{
 const DB=database();for(let i=0;i<121;i++) event(DB,String(i).padStart(3,"0"));
 const ids=[];let q=query();let page;
 do { page=await read(DB,q);ids.push(...page.rows.map(row=>row.id));if(page.nextCursor) q=query(url+"&cursor="+page.nextCursor); } while(page.nextCursor);
 assert.equal(page.total,121);assert.equal(ids.length,121);assert.equal(new Set(ids).size,121);
 assert.equal(count(DB,"life_events"),0);assert.equal(count(DB,"schedule_instances"),0);DB.sqlite.close();
});
test("changed content invalidates pagination rather than mixing old and new results",async()=>{
 const DB=database();for(let i=0;i<51;i++) event(DB,String(i));
 const first=await read(DB);DB.sqlite.prepare("UPDATE schedule_events SET title='Changed' WHERE id='50'").run();
 await assert.rejects(read(DB,query(url+"&cursor="+first.nextCursor)),{status:409});DB.sqlite.close();
});
test("cursors cannot be reused in another account or date range",async()=>{
 const DB=database();for(let i=0;i<51;i++) event(DB,String(i));
 const first=await read(DB),q=query(url+"&cursor="+first.nextCursor);
 await assert.rejects(read(DB,q,"other"),{status:409});
 await assert.rejects(read(DB,query(url.replace("2026-10-10","2026-10-09")+"&cursor="+first.nextCursor)),{status:409});
 await assert.rejects(read(DB,query(),""),{status:401});DB.sqlite.close();
});
test("invalid source dates are disclosed and a valid empty read is not an authentication failure",async()=>{
 const DB=database();event(DB,"bad","bad","also-bad");
 const page=await read(DB);assert.equal(page.total,0);assert.equal(page.invalidTemplates,1);DB.sqlite.close();
});
test("legacy SQLite UTC timestamps are normalized without device-local interpretation",async()=>{
 const DB=database();event(DB,"legacy","2026-10-10 01:00:00","2026-10-10 02:00:00");
 const page=await read(DB);assert.equal(page.rows[0].startAt,"2026-10-10T01:00:00.000Z");DB.sqlite.close();
});
test("capacity failure is explicit and cannot masquerade as an empty calendar",async()=>{
 const DB=database();DB.sqlite.exec("BEGIN");
 for(let i=0;i<2001;i++) event(DB,String(i));DB.sqlite.exec("COMMIT");
 await assert.rejects(read(DB),{status:413});DB.sqlite.close();
});
