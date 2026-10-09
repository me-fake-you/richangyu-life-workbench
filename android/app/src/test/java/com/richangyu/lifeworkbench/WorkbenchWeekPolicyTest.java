package com.richangyu.lifeworkbench;

import org.junit.Test;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.TimeZone;
import static org.junit.Assert.*;

public class WorkbenchWeekPolicyTest {
    private static final long NOW = time("2026-10-09T08:00:00+08:00");
    private static long time(String value) { return WorkbenchSchedulePolicy.instant(value); }
    private static WorkbenchWeekPolicy.Entry row(int index, String id, String start, String end) {
        return new WorkbenchWeekPolicy.Entry(index, id, "Schedule", "Study", start, end);
    }
    private static WorkbenchWeekPolicy.Window window(WorkbenchWeekPolicy.Entry... entries) {
        return new WorkbenchWeekPolicy.Window(Arrays.asList(entries), NOW, 1000);
    }

    @Test public void beijingMidnightDoesNotUseUtcDate() {
        assertEquals(time("2026-10-09T00:00:00+08:00"),
            WorkbenchWeekPolicy.dayStart(time("2026-10-08T16:00:00Z")));
    }
    @Test public void sevenNaturalDaysEndAtTheEighthMidnight() {
        WorkbenchWeekPolicy.Window w=window();
        assertEquals(time("2026-10-09T00:00:00+08:00"),w.from);
        assertEquals(time("2026-10-16T00:00:00+08:00"),w.until);
        assertEquals(7,WorkbenchWeekPolicy.DAYS);
    }
    @Test public void deviceTimezoneDoesNotChangeBoundaries() {
        TimeZone original=TimeZone.getDefault();
        try {
            TimeZone.setDefault(TimeZone.getTimeZone("America/New_York"));
            assertEquals(time("2026-10-10T00:00:00+08:00"),WorkbenchWeekPolicy.dayAt(window().from,1));
        } finally { TimeZone.setDefault(original); }
    }
    @Test public void freshnessUsesElapsedTimeAndSameCalendarDay() {
        WorkbenchWeekPolicy.Window w=window();
        assertTrue(WorkbenchWeekPolicy.fresh(w,NOW,301000));
        assertFalse(WorkbenchWeekPolicy.fresh(w,NOW,301001));
        assertFalse(WorkbenchWeekPolicy.fresh(w,NOW,999));
        assertFalse(WorkbenchWeekPolicy.fresh(w,time("2026-10-10T00:00:00+08:00"),1001));
    }
    @Test public void missingMonotonicReceiptIsNotFresh() {
        WorkbenchWeekPolicy.Window w=new WorkbenchWeekPolicy.Window(Collections.emptyList(),NOW,0);
        assertFalse(WorkbenchWeekPolicy.fresh(w,NOW,1));
        assertFalse(WorkbenchWeekPolicy.fresh(null,NOW,1));
    }
    @Test public void calendarScopeRequiresExactConfirmedHash() {
        String scope=String.join("",Collections.nCopies(64,"a"));
        assertTrue(WorkbenchWeekPolicy.scopeMatches(scope,scope));
        assertFalse(WorkbenchWeekPolicy.scopeMatches(scope,scope.replace('a','b')));
        assertFalse(WorkbenchWeekPolicy.scopeMatches("",""));
        assertFalse(WorkbenchWeekPolicy.scopeMatches(null,scope));
        assertFalse(WorkbenchWeekPolicy.scopeMatches(scope.toUpperCase(),scope.toUpperCase()));
    }
    @Test public void ongoingPreviousDayIsClippedToToday() {
        WorkbenchWeekPolicy.Window w=window(row(0,"a","2026-10-08T23:00:00+08:00","2026-10-09T10:00:00+08:00"));
        assertEquals(1,w.day(0).size());assertTrue(w.day(0).get(0).carryIn);
        assertEquals(w.from,w.day(0).get(0).start);assertEquals(600,w.minutes(0));
    }
    @Test public void crossingMidnightAppearsOnBothDays() {
        WorkbenchWeekPolicy.Window w=window(row(0,"a","2026-10-09T23:00:00+08:00","2026-10-10T01:00:00+08:00"));
        assertEquals(1,w.day(0).size());assertEquals(1,w.day(1).size());
        assertTrue(w.day(0).get(0).carryOut);assertTrue(w.day(1).get(0).carryIn);
        assertEquals(60,w.minutes(0));assertEquals(60,w.minutes(1));
    }
    @Test public void endingAtMidnightDoesNotSpillIntoNextDay() {
        WorkbenchWeekPolicy.Window w=window(row(0,"a","2026-10-09T23:00:00+08:00","2026-10-10T00:00:00+08:00"));
        assertEquals(1,w.day(0).size());assertEquals(0,w.day(1).size());
        assertFalse(w.day(0).get(0).carryOut);
    }
    @Test public void startingAtMidnightBelongsToNextDay() {
        WorkbenchWeekPolicy.Window w=window(row(0,"a","2026-10-10T00:00:00+08:00","2026-10-10T01:00:00+08:00"));
        assertEquals(0,w.day(0).size());assertEquals(1,w.day(1).size());
    }
    @Test public void rollingApiExtraDayIsNotPartOfSevenDayWindow() {
        WorkbenchWeekPolicy.Window w=window(row(0,"a","2026-10-16T00:00:00+08:00","2026-10-16T01:00:00+08:00"));
        assertEquals(0,w.entries.size());
    }
    @Test public void endedSchedulesAreNotPresentedAsFuture() {
        WorkbenchWeekPolicy.Window w=window(row(0,"a","2026-10-09T07:00:00+08:00","2026-10-09T08:00:00+08:00"),
            row(1,"b","2026-10-09T07:00:00+08:00","2026-10-09T08:01:00+08:00"));
        assertEquals(1,w.entries.size());assertEquals("b",w.entries.get(0).id);
    }
    @Test public void recurringIdWithDifferentTimesKeepsBothOccurrences() {
        WorkbenchWeekPolicy.Window w=window(row(0,"a","2026-10-09T09:00:00+08:00","2026-10-09T10:00:00+08:00"),
            row(1,"a","2026-10-10T09:00:00+08:00","2026-10-10T10:00:00+08:00"));
        assertEquals(2,w.entries.size());assertEquals(1,w.day(0).size());assertEquals(1,w.day(1).size());
    }
    @Test public void equivalentTimestampsMergeExactDuplicateOccurrences() {
        WorkbenchWeekPolicy.Window w=window(row(0,"a","2026-10-09T09:00:00+08:00","2026-10-09T10:00:00+08:00"),
            row(1,"a","2026-10-09T01:00:00Z","2026-10-09T02:00:00Z"));
        assertEquals(1,w.entries.size());assertEquals(1,w.duplicateCount);
    }
    @Test public void conflictingDuplicateDetailsAreExcludedNotGuessed() {
        WorkbenchWeekPolicy.Entry a=row(0,"a","2026-10-09T09:00:00+08:00","2026-10-09T10:00:00+08:00");
        WorkbenchWeekPolicy.Entry b=new WorkbenchWeekPolicy.Entry(1,"a","Different","Study","2026-10-09T09:00:00+08:00","2026-10-09T10:00:00+08:00");
        WorkbenchWeekPolicy.Window w=window(a,b,a);
        assertEquals(0,w.entries.size());assertEquals(1,w.ambiguousCount);
    }
    @Test public void entriesAreChronological() {
        WorkbenchWeekPolicy.Window w=window(row(0,"b","2026-10-09T11:00:00+08:00","2026-10-09T12:00:00+08:00"),
            row(1,"a","2026-10-09T09:00:00+08:00","2026-10-09T10:00:00+08:00"));
        assertEquals("a",w.entries.get(0).id);assertEquals("b",w.entries.get(1).id);
    }
    @Test public void invalidEntriesAreCountedNotShown() {
        WorkbenchWeekPolicy.Window w=window(null,
            row(1,"","2026-10-09T09:00:00+08:00","2026-10-09T10:00:00+08:00"),
            row(2,"a","2026-02-30T09:00:00+08:00","2026-10-09T10:00:00+08:00"),
            row(3,"b","2026-10-09T09:00:00+08:00","2026-10-09T09:00:00+08:00"),
            new WorkbenchWeekPolicy.Entry(4,"c","","Study","2026-10-09T09:00:00+08:00","2026-10-09T10:00:00+08:00"));
        assertEquals(5,w.invalidCount);assertEquals(0,w.entries.size());
    }
    @Test public void isoWithoutTimezoneIsNotGuessed() {
        WorkbenchWeekPolicy.Window w=window(row(0,"a","2026-10-09T09:00:00","2026-10-09T10:00:00"));
        assertEquals(1,w.invalidCount);
    }
    @Test public void sqlUtcIsDisplayedInTheCorrectBeijingDay() {
        WorkbenchWeekPolicy.Window w=window(row(0,"a","2026-10-09 01:00:00","2026-10-09 02:00:00"));
        assertEquals(time("2026-10-09T09:00:00+08:00"),w.day(0).get(0).start);
        assertEquals(60,w.minutes(0));
    }
    @Test public void overlapCountsAreOnlyAmongLoadedSlices() {
        WorkbenchWeekPolicy.Window w=window(row(0,"a","2026-10-09T09:00:00+08:00","2026-10-09T11:00:00+08:00"),
            row(1,"b","2026-10-09T10:00:00+08:00","2026-10-09T12:00:00+08:00"));
        assertEquals(2,w.overlaps(0).size());assertEquals(240,w.minutes(0));
    }
    @Test public void adjacentIntervalsAreNotOverlapping() {
        WorkbenchWeekPolicy.Window w=window(row(0,"a","2026-10-09T09:00:00+08:00","2026-10-09T10:00:00+08:00"),
            row(1,"b","2026-10-09T10:00:00+08:00","2026-10-09T11:00:00+08:00"));
        assertTrue(w.overlaps(0).isEmpty());assertEquals(120,w.minutes(0));
    }
    @Test public void multiDayIntervalsAreClippedPerNaturalDay() {
        WorkbenchWeekPolicy.Window w=window(row(0,"a","2026-10-09T23:00:00+08:00","2026-10-12T01:00:00+08:00"));
        assertEquals(60,w.minutes(0));assertEquals(1440,w.minutes(1));
        assertEquals(1440,w.minutes(2));assertEquals(60,w.minutes(3));
        assertTrue(w.day(-1).isEmpty());assertTrue(w.day(7).isEmpty());assertEquals(0,w.minutes(7));
    }
    @Test(expected=IllegalArgumentException.class) public void oversizedSnapshotsAreRejected() {
        List<WorkbenchWeekPolicy.Entry> input=new ArrayList<>(Collections.nCopies(41,null));
        new WorkbenchWeekPolicy.Window(input,NOW,1000);
    }
    @Test(expected=UnsupportedOperationException.class) public void acceptedEntriesAreImmutable() {
        window().entries.add(row(0,"a","2026-10-09T09:00:00+08:00","2026-10-09T10:00:00+08:00"));
    }
}
