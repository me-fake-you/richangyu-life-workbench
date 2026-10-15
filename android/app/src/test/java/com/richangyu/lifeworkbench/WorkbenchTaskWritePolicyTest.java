package com.richangyu.lifeworkbench;
import org.junit.Test;
import static org.junit.Assert.*;
public class WorkbenchTaskWritePolicyTest {
    private final String id = "a1111111-1111-4111-8111-111111111111";
    @Test public void endpointIsExactAndWriteOnly() {
        assertTrue(WorkbenchClientPolicy.allowsEndpoint("/api/mobile-task-actions", true));
        assertFalse(WorkbenchClientPolicy.allowsEndpoint("/api/mobile-task-actions", false));
        for (String bad : new String[] {"/api/mobile-task-actions?ownerId=x", "/api/mobile-task-actions/",
            "/api/mobile-task-actions#x", "https://example.com/api/mobile-task-actions"})
            assertFalse(WorkbenchClientPolicy.allowsEndpoint(bad, true));
    }
    @Test public void actionRepliesRequireSameOriginPathJsonAndSuccess() {
        String origin = "https://example.com", url = origin + "/api/mobile-task-actions";
        assertTrue(WorkbenchTaskWritePolicy.validResponse(200, "application/json", url, origin));
        for (String bad : new String[] {url+"/",url+"?x=1",url+"#x","https://other.test/api/mobile-task-actions",
            "http://example.com/api/mobile-task-actions","https://user@example.com/api/mobile-task-actions"})
            assertFalse(WorkbenchTaskWritePolicy.validResponse(200, "application/json", bad, origin));
        assertFalse(WorkbenchTaskWritePolicy.validResponse(409, "application/json", url, origin));
        assertFalse(WorkbenchTaskWritePolicy.validResponse(200, "text/html", url, origin));
    }
    @Test public void onlyMatchingReceiptCanClearThePendingSubmission() {
        assertTrue(WorkbenchTaskWritePolicy.resultMatches(id,"task.create","mobile-"+id,"applied",id,"task.create","mobile-"+id,false));
        assertTrue(WorkbenchTaskWritePolicy.resultMatches(id,"task.create","mobile-"+id,"cancelled",id,"task.create","mobile-"+id,false));
        assertFalse(WorkbenchTaskWritePolicy.resultMatches(id,"task.create","mobile-"+id,"not-confirmed",id,"task.create","mobile-"+id,false));
        assertTrue(WorkbenchTaskWritePolicy.resultMatches(id,"task.create","mobile-"+id,"not-confirmed",id,"task.create","mobile-"+id,true));
        assertFalse(WorkbenchTaskWritePolicy.resultMatches(id,"task.update","mobile-"+id,"applied",id,"task.create","mobile-"+id,false));
        assertFalse(WorkbenchTaskWritePolicy.resultMatches(id,"task.create","wrong","applied",id,"task.create","mobile-"+id,false));
        assertFalse(WorkbenchTaskWritePolicy.resultMatches(id,"task.create","mobile-"+id,"applied","22222222-2222-4222-8222-222222222222","task.create","mobile-"+id,false));
    }
    @Test public void revisionsAndRequestIdsRejectMissingOrMalformedValues() {
        assertTrue(WorkbenchTaskWritePolicy.requestId(id));
        assertFalse(WorkbenchTaskWritePolicy.requestId(id.toUpperCase()));
        assertFalse(WorkbenchTaskWritePolicy.requestId("11111111-1111-1111-8111-111111111111"));
        assertTrue(WorkbenchTaskWritePolicy.revision("a".repeat(64)));
        assertFalse(WorkbenchTaskWritePolicy.revision("a".repeat(63)));
        assertFalse(WorkbenchTaskWritePolicy.revision(null));
        assertFalse(WorkbenchTaskWritePolicy.mutation("task.delete"));
    }
}
