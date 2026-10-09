package com.richangyu.lifeworkbench;
import org.junit.Test;
import static org.junit.Assert.*;
import java.util.Arrays;
import java.util.Collections;

public class WorkbenchSyncPolicyTest {
    @Test public void unboundAlwaysNeedsBinding(){
        assertEquals(WorkbenchSyncPolicy.ReadState.UNBOUND,WorkbenchSyncPolicy.readState(false,true,true,true,true));
    }
    @Test public void refreshIsNotSuccessfulRead(){
        assertEquals(WorkbenchSyncPolicy.ReadState.READING,WorkbenchSyncPolicy.readState(true,true,true,true,true));
    }
    @Test public void oldSnapshotDoesNotProveCurrentAuthorization(){
        assertEquals(WorkbenchSyncPolicy.ReadState.AUTH_REQUIRED,WorkbenchSyncPolicy.readState(true,false,false,true,true));
    }
    @Test public void authorizedButNotLoadedIsUnread(){
        assertEquals(WorkbenchSyncPolicy.ReadState.UNREAD,WorkbenchSyncPolicy.readState(true,false,true,false,true));
    }
    @Test public void failedRefreshKeepsSnapshotStale(){
        assertEquals(WorkbenchSyncPolicy.ReadState.STALE,WorkbenchSyncPolicy.readState(true,false,true,true,false));
    }
    @Test public void currentSuccessfulReadIsReady(){
        assertEquals(WorkbenchSyncPolicy.ReadState.READY,WorkbenchSyncPolicy.readState(true,false,true,true,true));
    }
    @Test public void queuedIsLocalOnly(){
        assertEquals(WorkbenchSyncPolicy.DraftState.LOCAL_ONLY,WorkbenchSyncPolicy.draftState("queued"));
        assertTrue(WorkbenchSyncPolicy.canSubmit("queued"));
    }
    @Test public void rejectionIsNotCloudAbsenceProof(){
        assertEquals(WorkbenchSyncPolicy.DraftState.REJECTED,WorkbenchSyncPolicy.draftState("rejected"));
        assertTrue(WorkbenchSyncPolicy.canSubmit("rejected"));
        assertEquals(1,WorkbenchSyncPolicy.priority("rejected"));
    }
    @Test public void confirmedNeverSubmitsAgain(){
        assertEquals(WorkbenchSyncPolicy.DraftState.CONFIRMED,WorkbenchSyncPolicy.draftState("confirmed"));
        assertFalse(WorkbenchSyncPolicy.canSubmit("confirmed"));
    }
    @Test public void unfamiliarStatesRemainUncertain(){
        for(String state:Arrays.asList("sending","uncertain","bad","",null))
            assertEquals(WorkbenchSyncPolicy.DraftState.UNCERTAIN,WorkbenchSyncPolicy.draftState(state));
    }
    @Test public void summaryKeepsAllFourCategories(){
        WorkbenchSyncPolicy.Summary count=WorkbenchSyncPolicy.summarize(Arrays.asList("queued","rejected","confirmed","uncertain","sending",null));
        assertEquals(1,count.local);assertEquals(1,count.rejected);assertEquals(3,count.uncertain);
        assertEquals(1,count.confirmed);assertEquals(6,count.total);
    }
    @Test public void emptySuccessfullyReadListHasZeroCount(){
        assertEquals(0,WorkbenchSyncPolicy.summarize(Collections.emptyList()).total);
    }
    @Test(expected=IllegalArgumentException.class) public void unreadListCannotMasqueradeAsZero(){
        WorkbenchSyncPolicy.summarize(null);
    }
    @Test public void reviewItemsSortBeforeLocalAndConfirmed(){
        assertTrue(WorkbenchSyncPolicy.priority("uncertain")<WorkbenchSyncPolicy.priority("rejected"));
        assertTrue(WorkbenchSyncPolicy.priority("rejected")<WorkbenchSyncPolicy.priority("queued"));
        assertTrue(WorkbenchSyncPolicy.priority("queued")<WorkbenchSyncPolicy.priority("confirmed"));
    }
    @Test public void receiptTimeRequiresPositiveNonfutureClockValue(){
        assertFalse(WorkbenchSyncPolicy.usableReceiptTime(0,100));
        assertFalse(WorkbenchSyncPolicy.usableReceiptTime(-1,100));
        assertFalse(WorkbenchSyncPolicy.usableReceiptTime(101,100));
        assertTrue(WorkbenchSyncPolicy.usableReceiptTime(100,100));
        assertTrue(WorkbenchSyncPolicy.usableReceiptTime(50,100));
    }
    @Test public void accountScopeIsStrictAndIndependent(){
        assertTrue(WorkbenchSyncPolicy.validScope("a".repeat(64)));
        assertFalse(WorkbenchSyncPolicy.validScope("a".repeat(63)));
        assertFalse(WorkbenchSyncPolicy.validScope("A".repeat(64)));
        assertFalse(WorkbenchSyncPolicy.validScope(""));
        assertFalse(WorkbenchSyncPolicy.validScope(null));
    }
}
