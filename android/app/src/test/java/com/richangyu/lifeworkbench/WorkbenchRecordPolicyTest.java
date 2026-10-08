package com.richangyu.lifeworkbench;

import org.junit.Test;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import static org.junit.Assert.*;

public class WorkbenchRecordPolicyTest {
    private static final long NOW = 1791432000000L; // 2026-10-08T04:00:00Z.
    private static WorkbenchRecordPolicy.Entry entry(int index, String date) {
        return new WorkbenchRecordPolicy.Entry(index, "Task", "Details", "note", date);
    }

    @Test public void beijingMidnightUsesCalendarDay() {
        assertEquals("2026-10-08", WorkbenchRecordPolicy.dayKey("2026-10-07T16:00:00Z"));
        assertEquals("2026-10-07", WorkbenchRecordPolicy.dayKey("2026-10-07T15:59:59.999Z"));
        assertEquals("2026-10-08", WorkbenchRecordPolicy.dayKey("2026-10-08T00:00:00+08:00"));
    }

    @Test public void todayHasInclusiveStartExclusiveEnd() {
        List<WorkbenchRecordPolicy.Entry> source = Arrays.asList(
            entry(0,"2026-10-07T15:59:59Z"), entry(1,"2026-10-07T16:00:00Z"),
            entry(2,"2026-10-08T15:59:59Z"), entry(3,"2026-10-08T16:00:00Z"));
        List<WorkbenchRecordPolicy.Entry> result = WorkbenchRecordPolicy.select(source, "today", "", NOW);
        assertEquals(2, result.size());
        assertEquals(2, result.get(0).sourceIndex);
        assertEquals(1, result.get(1).sourceIndex);
    }

    @Test public void weekIncludesTodayAndSixPrecedingDaysNotTomorrow() {
        List<WorkbenchRecordPolicy.Entry> result = WorkbenchRecordPolicy.select(Arrays.asList(
            entry(0,"2026-10-01T15:59:59Z"), entry(1,"2026-10-01T16:00:00Z"),
            entry(2,"2026-10-08T15:59:59Z"), entry(3,"2026-10-08T16:00:00Z")), "week", "", NOW);
        assertEquals(2, result.size());
        assertEquals(2, result.get(0).sourceIndex);
        assertEquals(1, result.get(1).sourceIndex);
    }

    @Test public void invalidDatesStayInAllButNotDatedResults() {
        for (String date : new String[]{"bad", "2026-02-30T00:00:00Z", "2026-10-08T24:00:00Z", "2026-10-08T04:00:00Z trailing"}) {
            WorkbenchRecordPolicy.Entry item = entry(0, date);
            assertEquals("", WorkbenchRecordPolicy.dayKey(date));
            assertEquals(1, WorkbenchRecordPolicy.select(Collections.singletonList(item), "all", "", NOW).size());
            assertTrue(WorkbenchRecordPolicy.select(Collections.singletonList(item), "today", "", NOW).isEmpty());
        }
    }

    @Test public void queriesRequireAllTermsAcrossTitleAndBodyIgnoringCase() {
        WorkbenchRecordPolicy.Entry item = new WorkbenchRecordPolicy.Entry(0, "Part Time", "Cafe SHIFT", "note", "2026-10-08T04:00:00Z");
        List<WorkbenchRecordPolicy.Entry> source = Collections.singletonList(item);
        assertEquals(1, WorkbenchRecordPolicy.select(source, "all", "  PART\u3000shift  ", NOW).size());
        assertTrue(WorkbenchRecordPolicy.select(source, "all", "part absent", NOW).isEmpty());
    }

    @Test public void chineseKindAliasesAreSearchable() {
        String[][] kinds = {{"checkin","\u6253\u5361"},{"income","\u6536\u5165"},{"event","\u751f\u6d3b"},{"note","\u968f\u8bb0"}};
        for (String[] kind : kinds) {
            WorkbenchRecordPolicy.Entry item = new WorkbenchRecordPolicy.Entry(0, "", "", kind[0], "2026-10-08T04:00:00Z");
            assertEquals(1, WorkbenchRecordPolicy.select(Collections.singletonList(item), "all", kind[1], NOW).size());
        }
    }

    @Test public void sortingIsNewestFirstStableForEqualTimesWithInvalidLast() {
        List<WorkbenchRecordPolicy.Entry> source = Arrays.asList(entry(3,"bad"),entry(2,"2026-10-08T04:00:00Z"),
            entry(1,"2026-10-08T04:00:00Z"),entry(0,"2026-10-07T04:00:00Z"));
        List<WorkbenchRecordPolicy.Entry> result = WorkbenchRecordPolicy.select(source, "all", "", NOW);
        assertEquals(1, result.get(0).sourceIndex);
        assertEquals(2, result.get(1).sourceIndex);
        assertEquals(0, result.get(2).sourceIndex);
        assertEquals(3, result.get(3).sourceIndex);
        assertEquals(3, source.get(0).sourceIndex);
    }

    @Test public void resultCannotMutateSourceSnapshot() {
        List<WorkbenchRecordPolicy.Entry> source = new ArrayList<>();
        source.add(entry(0,"2026-10-08T04:00:00Z"));
        List<WorkbenchRecordPolicy.Entry> result = WorkbenchRecordPolicy.select(source, "all", null, NOW);
        try { result.clear(); fail("Result must be immutable"); } catch (UnsupportedOperationException expected) { }
        assertEquals(1, source.size());
    }

    @Test public void nullInputsAndEmptySnapshotsAreSafe() {
        assertTrue(WorkbenchRecordPolicy.select(null, "all", null, NOW).isEmpty());
        assertTrue(WorkbenchRecordPolicy.select(Collections.<WorkbenchRecordPolicy.Entry>emptyList(), "today", "", NOW).isEmpty());
        assertTrue(WorkbenchRecordPolicy.select(Collections.<WorkbenchRecordPolicy.Entry>singletonList(null), "all", "", NOW).isEmpty());
        assertEquals("", WorkbenchRecordPolicy.dayKey((String)null));
    }

    @Test public void supportedTimestampFormatsReferToSameInstant() {
        long expected = entry(0,"2026-10-08T04:00:00.000Z").timestamp;
        assertNotEquals(Long.MIN_VALUE, expected);
        for (String date : new String[]{"2026-10-08T04:00:00Z", "2026-10-08T12:00:00+08:00", "2026-10-08T04:00+0000", "2026-10-08 04:00:00"})
            assertEquals(date, expected, entry(0,date).timestamp);
    }
}
