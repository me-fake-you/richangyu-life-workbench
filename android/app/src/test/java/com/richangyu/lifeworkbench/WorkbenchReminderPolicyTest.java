package com.richangyu.lifeworkbench;
import org.junit.Test;
import static org.junit.Assert.*;

public class WorkbenchReminderPolicyTest {
    private static final String SCOPE = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    private static final String OTHER = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    private static final long NOW = 1791504000000L;
    private WorkbenchReminderPolicy.Candidate candidate(String status) {
        return new WorkbenchReminderPolicy.Candidate("event-1", "2026-10-09T02:00:00Z", "2026-10-09T03:00:00Z", status);
    }
    @Test public void reminderIdentityIsStableAndScoped() {
        String key = WorkbenchReminderPolicy.key(SCOPE, "event-1");
        assertTrue(key.matches("[0-9a-f]{64}"));
        assertEquals(key, WorkbenchReminderPolicy.key(SCOPE, "event-1"));
        assertNotEquals(key, WorkbenchReminderPolicy.key(OTHER, "event-1"));
        assertNotEquals(key, WorkbenchReminderPolicy.key(SCOPE, "event-2"));
    }
    @Test public void missingOrMalformedScopesCannotCreateIdentity() {
        for (String scope : new String[] {null, "", "owner@example.org", "https://example.org", SCOPE.toUpperCase()})
            assertEquals("", WorkbenchReminderPolicy.key(scope, "event-1"));
    }
    @Test public void malformedIdentifiersAreRejected() {
        for (String id : new String[] {null, "", "../event", "event/1", "event 1", "x".repeat(129)})
            assertEquals("", WorkbenchReminderPolicy.key(SCOPE, id));
        assertFalse(WorkbenchReminderPolicy.key(SCOPE, "x".repeat(128)).isEmpty());
    }
    @Test public void knownActiveStatusesAreEligible() {
        for (String status : new String[] {"planned", "pending", "active", "\u8ba1\u5212\u4e2d", "\u8fdb\u884c\u4e2d", " PLANNED "})
            assertTrue(WorkbenchReminderPolicy.active(candidate(status)));
    }
    @Test public void completedCancelledMissingAndUnknownStatusesAreNotEligible() {
        for (String status : new String[] {"completed", "done", "cancelled", "canceled", "\u5df2\u5b8c\u6210", "\u5df2\u53d6\u6d88", "", null, "unknown"})
            assertFalse(WorkbenchReminderPolicy.active(candidate(status)));
    }
    @Test public void supportedOffsetsUseAbsoluteInstants() {
        WorkbenchReminderPolicy.Candidate item = candidate("planned");
        long before = item.start - 7200000L;
        for (int minutes : new int[] {0, 10, 30, 60})
            assertEquals(Long.valueOf(item.start - minutes * 60000L), WorkbenchReminderPolicy.trigger(item, minutes, before));
    }
    @Test public void unsupportedOffsetsAreRejected() {
        for (int minutes : new int[] {-1, 1, 11, 1440, Integer.MAX_VALUE})
            assertNull(WorkbenchReminderPolicy.trigger(candidate("planned"), minutes, NOW - 86400000L));
    }
    @Test public void elapsedOrExactlyDueChoicesCannotBeArmedAsNewReminders() {
        WorkbenchReminderPolicy.Candidate item = candidate("planned");
        assertNull(WorkbenchReminderPolicy.trigger(item, 0, item.start));
        assertNull(WorkbenchReminderPolicy.trigger(item, 10, item.start - 600000L));
        assertNull(WorkbenchReminderPolicy.trigger(item, 0, item.end));
    }
    @Test public void malformedOrReversedDatesAreRejected() {
        assertFalse(WorkbenchReminderPolicy.active(new WorkbenchReminderPolicy.Candidate("e", "not-a-date", "2026-10-09T03:00:00Z", "planned")));
        assertFalse(WorkbenchReminderPolicy.active(new WorkbenchReminderPolicy.Candidate("e", "2026-10-09T02:00:00Z", "2026-10-09T01:00:00Z", "planned")));
        assertFalse(WorkbenchReminderPolicy.active(new WorkbenchReminderPolicy.Candidate("e", "2026-10-09T02:00:00", "2026-10-09T03:00:00", "planned")));
    }
    @Test public void isoAndSqlUtcAndExplicitOffsetsReferToTheSameTime() {
        WorkbenchReminderPolicy.Candidate item = new WorkbenchReminderPolicy.Candidate("e", "2026-10-09 02:00:00", "2026-10-09T11:00:00+08:00", "planned");
        assertEquals(candidate("planned").start, item.start);
        assertEquals(candidate("planned").end, item.end);
        assertTrue(WorkbenchReminderPolicy.sameTime(item, candidate("planned").start, candidate("planned").end));
    }
    @Test public void matchingPendingGenerationCanDeliverWithinTheEventWindow() {
        assertTrue(WorkbenchReminderPolicy.mayDeliver(SCOPE, SCOPE, "armed", "token-a", "token-a", 1000, 4000, 1000));
        assertTrue(WorkbenchReminderPolicy.mayDeliver(SCOPE, SCOPE, "armed", "token-a", "token-a", 1000, 4000, 3999));
    }
    @Test public void staleGenerationAndScopeCannotDeliver() {
        assertFalse(WorkbenchReminderPolicy.mayDeliver(SCOPE, SCOPE, "armed", "new", "old", 1000, 4000, 2000));
        assertFalse(WorkbenchReminderPolicy.mayDeliver(SCOPE, OTHER, "armed", "a", "a", 1000, 4000, 2000));
        assertFalse(WorkbenchReminderPolicy.mayDeliver("", "", "armed", "a", "a", 1000, 4000, 2000));
        assertFalse(WorkbenchReminderPolicy.mayDeliver(SCOPE, SCOPE, "armed", "", "", 1000, 4000, 2000));
    }
    @Test public void earlyExpiredOrAlreadyHandledDeliveryIsRejected() {
        assertFalse(WorkbenchReminderPolicy.mayDeliver(SCOPE, SCOPE, "armed", "a", "a", 1000, 4000, 999));
        assertFalse(WorkbenchReminderPolicy.mayDeliver(SCOPE, SCOPE, "armed", "a", "a", 1000, 4000, 4000));
        for (String state : new String[] {"handled", "paused", "missed", "blocked", ""})
            assertFalse(WorkbenchReminderPolicy.mayDeliver(SCOPE, SCOPE, state, "a", "a", 1000, 4000, 2000));
    }
    @Test public void restartDoesNotReplayOverdueOrUnpermittedAlarms() {
        assertTrue(WorkbenchReminderPolicy.mayRestore(3000, 4000, 2000, true, true));
        assertFalse(WorkbenchReminderPolicy.mayRestore(2000, 4000, 2000, true, true));
        assertFalse(WorkbenchReminderPolicy.mayRestore(3000, 4000, 2000, true, false));
        assertFalse(WorkbenchReminderPolicy.mayRestore(3000, 4000, 2000, false, true));
        assertFalse(WorkbenchReminderPolicy.mayRestore(3000, 3000, 2000, true, true));
    }
}
