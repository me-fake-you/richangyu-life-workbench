package com.richangyu.lifeworkbench;
import org.junit.Test;
import java.util.Arrays;
import java.util.List;
import java.util.TimeZone;
import static org.junit.Assert.*;
public class WorkbenchTaskPolicyTest {
    private WorkbenchTaskPolicy.Entry task(String title, String status, String due, int rank) {
        return new WorkbenchTaskPolicy.Entry("fixture", title, "说明", status, "P1", due, "研究", 25, 5, rank);
    }
    @Test public void replyRequiresExactOriginEndpointAndJson() {
        String origin = "https://example.com", url = origin + "/api/mobile-tasks";
        assertTrue(WorkbenchTaskPolicy.validResponse(200, "application/json; charset=utf-8", url, origin));
        for (String bad : new String[] {url+"?ownerId=x", url+"/", url+"#x",
            "https://other.test/api/mobile-tasks", "http://example.com/api/mobile-tasks",
            "https://example.com:8443/api/mobile-tasks", "https://u@example.com/api/mobile-tasks"})
            assertFalse(WorkbenchTaskPolicy.validResponse(200, "application/json", bad, origin));
        assertFalse(WorkbenchTaskPolicy.validResponse(401, "application/json", url, origin));
        assertFalse(WorkbenchTaskPolicy.validResponse(200, "text/html", url, origin));
    }
    @Test public void scopeRequiresConnectedMatchingNonemptyIdentity() {
        assertTrue(WorkbenchTaskPolicy.readAllowed("a", "a", true));
        assertFalse(WorkbenchTaskPolicy.readAllowed("a", "b", true));
        assertFalse(WorkbenchTaskPolicy.readAllowed("a", "a", false));
        assertFalse(WorkbenchTaskPolicy.readAllowed("", "", true));
    }
    @Test public void explicitUtcAndSqlUtcHaveTheSameInstant() {
        long time = WorkbenchTaskPolicy.timestamp("2026-10-12T10:00:00.000Z");
        assertEquals(time, WorkbenchTaskPolicy.timestamp("2026-10-12 10:00:00"));
        assertEquals(time, WorkbenchTaskPolicy.timestamp("2026-10-12T18:00:00+08:00"));
        assertEquals(0, WorkbenchTaskPolicy.timestamp("2026-02-30T10:00:00Z"));
        assertEquals(0, WorkbenchTaskPolicy.timestamp("2026-10-12T10:00:00"));
    }
    @Test public void displayIsBeijingTimeIndependentOfDeviceZone() {
        TimeZone previous = TimeZone.getDefault();
        try {
            TimeZone.setDefault(TimeZone.getTimeZone("America/Los_Angeles"));
            assertTrue(WorkbenchTaskPolicy.dueLabel("2026-10-12T10:00:00.000Z").contains("18:00"));
        } finally { TimeZone.setDefault(previous); }
    }
    @Test public void overdueExcludesCompletedCancelledAndUnknownDates() {
        long now = WorkbenchTaskPolicy.timestamp("2026-10-12T11:00:00Z");
        assertTrue(WorkbenchTaskPolicy.overdue(task("a", "下一步", "2026-10-12T10:00:00Z", 0), now));
        for (String status : new String[] {"已完成", "已取消"})
            assertFalse(WorkbenchTaskPolicy.overdue(task("a", status, "2026-10-12T10:00:00Z", 0), now));
        assertFalse(WorkbenchTaskPolicy.overdue(task("a", "下一步", "", 0), now));
        assertFalse(WorkbenchTaskPolicy.overdue(task("a", "下一步", "2026-10-12T11:00:00Z", 0), now));
    }
    @Test public void filtersSeparatePendingTodayAndCompletedWithoutMutation() {
        List<WorkbenchTaskPolicy.Entry> entries = Arrays.asList(task("a", "下一步", "", 1),
            task("b", "已完成", "", 2), task("c", "已取消", "", 0));
        assertEquals(1, WorkbenchTaskPolicy.filter(entries, "", WorkbenchTaskPolicy.PENDING, 0).size());
        assertEquals(1, WorkbenchTaskPolicy.filter(entries, "", WorkbenchTaskPolicy.TODAY, 0).size());
        assertEquals(1, WorkbenchTaskPolicy.filter(entries, "", WorkbenchTaskPolicy.DONE, 0).size());
        assertEquals(3, entries.size());
    }
    @Test public void searchMatchesAllTermsAcrossTitleAndProject() {
        List<WorkbenchTaskPolicy.Entry> entries = Arrays.asList(task("学习 Java", "下一步", "", 0));
        assertEquals(1, WorkbenchTaskPolicy.filter(entries, "JAVA　研究", WorkbenchTaskPolicy.ALL, 0).size());
        assertTrue(WorkbenchTaskPolicy.filter(entries, "Java 不存在", WorkbenchTaskPolicy.ALL, 0).isEmpty());
    }
}
