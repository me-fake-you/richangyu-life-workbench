import test from "node:test";
import { assertPreviewMetadata } from "./android-preview-metadata.mjs";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const java="android/app/src/main/java/com/richangyu/lifeworkbench/";
const source=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
test("new calendar uses only allowlisted authenticated reads and no provider or background fetch",()=>{
 const sheet=source(java+"NativeWeekSheet.java"),route=source("app/api/mobile-calendar/route.ts");
 assert.match(sheet,/bridge.request\(endpoint,null,envelope/);
 assert.match(sheet,/\/api\/mobile-calendar\?from=/);
 assert.match(sheet,/bridge.matchesOrigin\(uri\)/);
 assert.match(sheet,/endpoint.equals\(uri.getEncodedPath\(\)\+"\?"\+uri.getEncodedQuery\(\)\)/);
 assert.doesNotMatch(sheet,/new WebView|SharedPreferences|generateGroq|\.put\(/);
 assert.match(route,/const user = await getChatGPTUser\(\)/);
 assert.match(route,/if \(!user\) return response/);
 assert.match(route,/private, no-store/);assert.doesNotMatch(route,/export async function POST/);
});
test("pagination is manual, bounded and invalidated on concurrent calendar edits",()=>{
 const sheet=source(java+"NativeWeekSheet.java"),policy=source(java+"WorkbenchCalendarPolicy.java");
 assert.match(sheet,/more.setOnClickListener\(v -> load\(true\)\)/);
 assert.match(sheet,/code==409/);assert.match(sheet,/snapshot=null; problem=/);
 assert.match(sheet,/requestRevision != revision/);
 assert.match(policy,/PAGE_SIZE = 50, MAX_ROWS = 2000/);
 assert.match(policy,/offset != entries.size\(\)/);
 assert.match(policy,/entries.addAll\(rows\)/);
 assert.match(sheet,/Math.min\(visibleCount,entries.size\(\)\)/);
 const timerStart=sheet.indexOf("private final Runnable staleTick"),timerEnd=sheet.indexOf("NativeWeekSheet(Activity",timerStart);
 assert.ok(timerStart>=0 && timerEnd>timerStart);
 const timer=sheet.slice(timerStart,timerEnd);
 assert.doesNotMatch(timer,/\bload\s*\(|bridge\.request\s*\(/);
 assert.match(timer,/handler\.postDelayed\(this,\s*30000\)/);
});
test("coverage limits, actual execution and old-server fallback remain visible",()=>{
 const sheet=source(java+"NativeWeekSheet.java"),server=source("lib/mobile-calendar.mjs");
 assert.match(sheet,/code==404 \|\| code==405/);
 assert.match(sheet,/new NativeLegacyWeekSheet/);
 assert.match(sheet,/actualMinutes>0/);
 assert.match(sheet,/stored-occurrences-and-single-events/);
 assert.match(server,/CALENDAR_MAX_ROWS \+ 1/);
 assert.match(server,/previous !== snapshot/);
 assert.doesNotMatch(server,/INSERT INTO|UPDATE schedule|DELETE FROM|generateGroq/);
});
test("boundaries clear native data and preserve existing signing configuration",()=>{
 const sheet=source(java+"NativeWeekSheet.java"),main=source(java+"MainActivity.java");
 assert.match(sheet,/handler.removeCallbacks\(staleTick\); snapshot = null/);
 assert.match(sheet,/timeline.removeAllViews\(\)/);
 assert.match(main,/if \(weekSheet != null\) weekSheet.close\(\)/);
 assertPreviewMetadata(source);
});
