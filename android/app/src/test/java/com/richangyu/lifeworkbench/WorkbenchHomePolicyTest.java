package com.richangyu.lifeworkbench;

import org.junit.Test;
import static org.junit.Assert.*;

public class WorkbenchHomePolicyTest {
    @Test public void missingSnapshotNeverBecomesKnownCloudData() {
        for (boolean ready : new boolean[] {false, true})
            for (boolean refreshing : new boolean[] {false, true})
                for (boolean succeeded : new boolean[] {false, true})
                    assertEquals(WorkbenchHomePolicy.SnapshotState.UNAVAILABLE,
                        WorkbenchHomePolicy.snapshotState(false, ready, refreshing, succeeded));
    }
    @Test public void refreshingKeepsAnExistingSnapshotDistinctFromFreshData() {
        assertEquals(WorkbenchHomePolicy.SnapshotState.REFRESHING,
            WorkbenchHomePolicy.snapshotState(true, true, true, true));
        assertEquals(WorkbenchHomePolicy.SnapshotState.REFRESHING,
            WorkbenchHomePolicy.snapshotState(true, false, true, false));
    }
    @Test public void freshRequiresASuccessfulReadAndReadyBridge() {
        assertEquals(WorkbenchHomePolicy.SnapshotState.FRESH,
            WorkbenchHomePolicy.snapshotState(true, true, false, true));
    }
    @Test public void failedReadMustNotLookFreshEvenWithReadyBridge() {
        assertEquals(WorkbenchHomePolicy.SnapshotState.STALE,
            WorkbenchHomePolicy.snapshotState(true, true, false, false));
    }
    @Test public void lostAuthorizationDoesNotLookFresh() {
        assertEquals(WorkbenchHomePolicy.SnapshotState.STALE,
            WorkbenchHomePolicy.snapshotState(true, false, false, true));
    }
    @Test public void narrowScreensStackActions() {
        assertTrue(WorkbenchHomePolicy.stackedActions(359, 1.0f));
        assertFalse(WorkbenchHomePolicy.stackedActions(360, 1.0f));
        assertFalse(WorkbenchHomePolicy.stackedActions(412, 1.0f));
    }
    @Test public void largeTextStacksActionsWithoutChangingTheNormalThreshold() {
        assertFalse(WorkbenchHomePolicy.stackedActions(412, 1.2f));
        assertTrue(WorkbenchHomePolicy.stackedActions(412, 1.21f));
        assertTrue(WorkbenchHomePolicy.stackedActions(720, 2.0f));
    }
    @Test public void invalidLayoutInputsChooseTheSaferStackedLayout() {
        assertTrue(WorkbenchHomePolicy.stackedActions(0, 1.0f));
        assertTrue(WorkbenchHomePolicy.stackedActions(-1, 1.0f));
        for (float scale : new float[] {0, -1, Float.NaN, Float.POSITIVE_INFINITY, Float.NEGATIVE_INFINITY})
            assertTrue(WorkbenchHomePolicy.stackedActions(412, scale));
    }
}
