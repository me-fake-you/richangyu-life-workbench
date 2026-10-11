package com.richangyu.lifeworkbench;
import org.junit.Test;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import static org.junit.Assert.*;
public class WorkbenchCalendarPolicyTest {
    private final String token=new String(new char[64]).replace('\0','a');
    private final long now=java.time.Instant.parse("2026-10-10T10:00:00Z").toEpochMilli();
    private WorkbenchCalendarPolicy.Entry entry(String id,String start,String end) {
        return new WorkbenchCalendarPolicy.Entry(id,"Title","Study",start,end,"","","Planned",0,"","",false);
    }
    private WorkbenchCalendarPolicy.Entry entry(String id) { return entry(id,"2026-10-10T01:00:00Z","2026-10-10T02:00:00Z"); }
    @Test public void dateUsesBeijingBoundaries() {
        assertEquals(java.time.Instant.parse("2026-10-09T16:00:00Z").toEpochMilli(),WorkbenchCalendarPolicy.start("2026-10-10"));
        assertEquals("2026-10-17",new WorkbenchCalendarPolicy.Snapshot("2026-10-10").to);
        assertTrue(WorkbenchCalendarPolicy.allowedDate("2025-10-10",now));
        assertTrue(WorkbenchCalendarPolicy.allowedDate("2027-10-10",now));
        assertFalse(WorkbenchCalendarPolicy.allowedDate("2025-10-09",now));
        assertFalse(WorkbenchCalendarPolicy.allowedDate("2026-02-30",now));
    }
    @Test public void endpointIsStrictAndReadOnly() {
        assertTrue(WorkbenchClientPolicy.allowsEndpoint("/api/mobile-calendar?from=2026-10-10",false));
        assertTrue(WorkbenchClientPolicy.allowsEndpoint("/api/mobile-calendar?from=2026-10-10&cursor="+token+".50",false));
        for(String path:new String[]{"/api/mobile-calendar","/api/mobile-calendar?from=2026-02-30","/api/mobile-calendar?from=2026-10-10&owner=x","/api/mobile-calendar?from=2026-10-10&cursor="+token+".0","https://example.com/api/mobile-calendar?from=2026-10-10"})
            assertFalse(path,WorkbenchClientPolicy.allowsEndpoint(path,false));
        assertFalse(WorkbenchClientPolicy.allowsEndpoint("/api/mobile-calendar?from=2026-10-10",true));
    }
    @Test public void endedTodayAndCarryInRemainVisible() {
        WorkbenchCalendarPolicy.Snapshot view=new WorkbenchCalendarPolicy.Snapshot("2026-10-10");
        view.append(token,"",0,2,0,0,Arrays.asList(entry("long","2026-09-01T00:00:00Z","2026-10-11T00:00:00Z"),entry("today")),100);
        assertTrue(view.complete());assertEquals(2,view.day(0).size());assertEquals(1,view.day(1).size());
    }
    @Test public void successivePagesRetainDistinctOccurrences() {
        WorkbenchCalendarPolicy.Snapshot view=new WorkbenchCalendarPolicy.Snapshot("2026-10-10");
        List<WorkbenchCalendarPolicy.Entry> first=new ArrayList<>();for(int i=0;i<50;i++) first.add(entry("entry"+i));
        view.append(token,token+".50",0,51,1,0,first,100);
        assertFalse(view.complete());view.append(token,"",50,51,1,0,Collections.singletonList(entry("last")),200);
        assertTrue(view.complete());assertEquals(51,view.day(0).size());
    }
    @Test public void changedSnapshotDoesNotAppendPartialResults() {
        WorkbenchCalendarPolicy.Snapshot view=new WorkbenchCalendarPolicy.Snapshot("2026-10-10");
        List<WorkbenchCalendarPolicy.Entry> first=new ArrayList<>();for(int i=0;i<50;i++) first.add(entry("entry"+i));
        view.append(token,token+".50",0,51,0,0,first,100);
        try { view.append(token.replace('a','b'),"",50,51,0,0,Collections.singletonList(entry("last")),200);fail(); }
        catch(IllegalArgumentException expected) { assertEquals(50,view.entries.size()); }
    }
    @Test public void duplicateIdsAndOutOfRangeRowsAreRejectedAtomically() {
        for(List<WorkbenchCalendarPolicy.Entry> rows:Arrays.asList(Arrays.asList(entry("same"),entry("same")),
            Arrays.asList(entry("good"),entry("outside","2026-11-10T01:00:00Z","2026-11-10T02:00:00Z")))) {
            WorkbenchCalendarPolicy.Snapshot view=new WorkbenchCalendarPolicy.Snapshot("2026-10-10");
            try{view.append(token,"",0,2,0,0,rows,100);fail();}catch(IllegalArgumentException expected){assertEquals(0,view.entries.size());}
        }
    }
    @Test public void countsAndCursorCannotClaimFalseCompleteness() {
        WorkbenchCalendarPolicy.Snapshot view=new WorkbenchCalendarPolicy.Snapshot("2026-10-10");
        for(int total:new int[]{-1,2001,2}) {
            try{view.append(token,"",0,total,0,0,Collections.singletonList(entry("one")),100);fail();}
            catch(IllegalArgumentException expected){assertEquals(0,view.entries.size());}
        }
        view.append(token,"",0,0,0,0,Collections.emptyList(),100);assertTrue(view.complete());
    }
    @Test public void actualTimeMustBeRecordedNotInferredFromPlan() {
        WorkbenchCalendarPolicy.Entry item=entry("one");assertEquals(0,item.actualMinutes);
        try{new WorkbenchCalendarPolicy.Entry("one","Title","","2026-10-10T01:00:00Z","2026-10-10T02:00:00Z","","","",-1,"","",true);fail();}
        catch(IllegalArgumentException expected){assertEquals(0,item.actualMinutes);}
    }
    @Test public void freshnessUsesMonotonicTimeAndNeverAssumesHistoryIsStaleByDateAlone() {
        WorkbenchCalendarPolicy.Snapshot view=new WorkbenchCalendarPolicy.Snapshot("2026-10-09");
        view.append(token,"",0,0,0,0,Collections.emptyList(),100);
        assertTrue(view.fresh(100));assertTrue(view.fresh(300100));assertFalse(view.fresh(300101));assertFalse(view.fresh(99));
    }
}
