package com.richangyu.lifeworkbench;

import org.junit.Test;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import static org.junit.Assert.*;

public class WorkbenchSchedulePolicyTest {
    private static final long NOW = WorkbenchSchedulePolicy.instant("2026-10-04T12:00:00+08:00");
    private WorkbenchSchedulePolicy.Entry entry(int index, String start, String end) {
        return new WorkbenchSchedulePolicy.Entry(index, "\u65e5\u7a0b " + index, "", "", start, end);
    }
    private List<WorkbenchSchedulePolicy.Entry> choose(String scope, WorkbenchSchedulePolicy.Entry... entries) {
        return WorkbenchSchedulePolicy.select(Arrays.asList(entries), scope, "", NOW);
    }

    @Test public void utcSqlOffsetAndMinutePrecisionRepresentSameInstant() {
        Long expected = WorkbenchSchedulePolicy.instant("2026-10-04T04:00:00Z");
        assertNotNull(expected);
        assertEquals(expected, WorkbenchSchedulePolicy.instant("2026-10-04 04:00:00"));
        assertEquals(expected, WorkbenchSchedulePolicy.instant("2026-10-04T12:00+08:00"));
        assertEquals(expected, WorkbenchSchedulePolicy.instant("2026-10-04T12:00:00+0800"));
        assertEquals(Long.valueOf(expected + 100), WorkbenchSchedulePolicy.instant("2026-10-04T04:00:00.1Z"));
        assertEquals(Long.valueOf(expected + 123), WorkbenchSchedulePolicy.instant("2026-10-04T04:00:00.123Z"));
    }
    @Test public void invalidDatesAndPartialTimestampsAreRejected() {
        for (String value : new String[] {null, "", "2026-02-29T12:00:00Z", "2026-10-04T24:00:00Z",
                "2026-10-04T04:00:00", "2026-10-04T04:00:00Zextra", "2026-10-04T04:00:00.1234Z",
                "2026-10-04T04:00:00+24:00", "2026-10-04 04:00:00Z", "0001-10-04T04:00:00Z"})
            assertNull(value, WorkbenchSchedulePolicy.instant(value));
    }
    @Test public void todayUsesBeijingMidnightRatherThanUtcMidnight() {
        WorkbenchSchedulePolicy.Entry previous = entry(0, "2026-10-03T15:59:59Z", "");
        WorkbenchSchedulePolicy.Entry first = entry(1, "2026-10-03T16:00:00Z", "");
        WorkbenchSchedulePolicy.Entry last = entry(2, "2026-10-04T15:59:59Z", "");
        WorkbenchSchedulePolicy.Entry next = entry(3, "2026-10-04T16:00:00Z", "");
        List<WorkbenchSchedulePolicy.Entry> selected = choose(WorkbenchSchedulePolicy.TODAY, previous, first, last, next);
        assertEquals(Arrays.asList(first, last), selected);
    }
    @Test public void tomorrowExcludesItsFollowingMidnight() {
        WorkbenchSchedulePolicy.Entry start = entry(0, "2026-10-05T00:00:00+08:00", "");
        WorkbenchSchedulePolicy.Entry later = entry(1, "2026-10-05T23:59:59+08:00", "");
        WorkbenchSchedulePolicy.Entry next = entry(2, "2026-10-06T00:00:00+08:00", "");
        assertEquals(Arrays.asList(start, later), choose(WorkbenchSchedulePolicy.TOMORROW, next, later, start));
    }
    @Test public void weekContainsTodayAndSixMoreCalendarDays() {
        WorkbenchSchedulePolicy.Entry today = entry(0, "2026-10-04T00:00:00+08:00", "");
        WorkbenchSchedulePolicy.Entry seventh = entry(1, "2026-10-10T23:59:59+08:00", "");
        WorkbenchSchedulePolicy.Entry outside = entry(2, "2026-10-11T00:00:00+08:00", "");
        assertEquals(Arrays.asList(today, seventh), choose(WorkbenchSchedulePolicy.WEEK, outside, seventh, today));
    }
    @Test public void overnightSchedulesOverlapBothCalendarDays() {
        WorkbenchSchedulePolicy.Entry overnight = entry(0, "2026-10-03T23:00:00+08:00", "2026-10-04T01:00:00+08:00");
        WorkbenchSchedulePolicy.Entry ended = entry(1, "2026-10-03T23:00:00+08:00", "2026-10-04T00:00:00+08:00");
        assertEquals(Arrays.asList(overnight), choose(WorkbenchSchedulePolicy.TODAY, ended, overnight));
    }
    @Test public void missingOrReversedEndsAreTreatedAsStartPoints() {
        WorkbenchSchedulePolicy.Entry missing = entry(0, "2026-10-04T12:00:00+08:00", "");
        WorkbenchSchedulePolicy.Entry reversed = entry(1, "2026-10-03T23:00:00+08:00", "2026-10-03T22:00:00+08:00");
        assertEquals(Arrays.asList(missing), choose(WorkbenchSchedulePolicy.TODAY, reversed, missing));
    }
    @Test public void searchMatchesTitlePlaceAndNoteWithoutCaseSensitivity() {
        WorkbenchSchedulePolicy.Entry first = new WorkbenchSchedulePolicy.Entry(0, "\u517c\u804c Shift", "\u5496\u5561\u5e97", "\u5e26\u5b66\u751f\u8bc1", "", "");
        assertEquals(1, WorkbenchSchedulePolicy.select(Arrays.asList(first), WorkbenchSchedulePolicy.ALL, "shift", NOW).size());
        assertEquals(1, WorkbenchSchedulePolicy.select(Arrays.asList(first), WorkbenchSchedulePolicy.ALL, "\u5496\u5561", NOW).size());
        assertEquals(1, WorkbenchSchedulePolicy.select(Arrays.asList(first), WorkbenchSchedulePolicy.ALL, "\u5b66\u751f\u8bc1", NOW).size());
        assertTrue(WorkbenchSchedulePolicy.select(Arrays.asList(first), WorkbenchSchedulePolicy.ALL, "\u4f1a\u8bae", NOW).isEmpty());
    }
    @Test public void whitespaceSearchDoesNotHideSchedules() {
        WorkbenchSchedulePolicy.Entry one = entry(0, "", "");
        assertEquals(1, WorkbenchSchedulePolicy.select(Arrays.asList(one), WorkbenchSchedulePolicy.ALL, "   ", NOW).size());
    }
    @Test public void chronologicalSortIsStableAndUnknownDatesAreLast() {
        WorkbenchSchedulePolicy.Entry unknown = entry(0, "invalid", "");
        WorkbenchSchedulePolicy.Entry later = entry(1, "2026-10-04T14:00:00+08:00", "");
        WorkbenchSchedulePolicy.Entry tieB = entry(4, "2026-10-04T12:00:00+08:00", "");
        WorkbenchSchedulePolicy.Entry tieA = entry(3, "2026-10-04T12:00:00+08:00", "");
        assertEquals(Arrays.asList(tieA, tieB, later, unknown), choose(WorkbenchSchedulePolicy.ALL, unknown, later, tieB, tieA));
    }
    @Test public void unknownDatesRemainVisibleInAllButNotDatedFilters() {
        WorkbenchSchedulePolicy.Entry unknown = entry(0, "", "");
        assertEquals(1, choose(WorkbenchSchedulePolicy.ALL, unknown).size());
        assertTrue(choose(WorkbenchSchedulePolicy.TODAY, unknown).isEmpty());
        assertTrue(choose(WorkbenchSchedulePolicy.TOMORROW, unknown).isEmpty());
        assertTrue(choose(WorkbenchSchedulePolicy.WEEK, unknown).isEmpty());
    }
    @Test public void selectionDoesNotMutateInputAndUnknownScopeFallsBackToAll() {
        WorkbenchSchedulePolicy.Entry later = entry(0, "2026-10-04T14:00:00+08:00", "");
        WorkbenchSchedulePolicy.Entry earlier = entry(1, "2026-10-04T12:00:00+08:00", "");
        List<WorkbenchSchedulePolicy.Entry> input = new ArrayList<>(Arrays.asList(later, null, earlier));
        assertEquals(Arrays.asList(earlier, later), WorkbenchSchedulePolicy.select(input, "unexpected", "", NOW));
        assertEquals(Arrays.asList(later, null, earlier), input);
        assertTrue(WorkbenchSchedulePolicy.select(null, WorkbenchSchedulePolicy.ALL, "", NOW).isEmpty());
    }
}
