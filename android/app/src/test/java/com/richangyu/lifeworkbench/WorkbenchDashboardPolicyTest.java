package com.richangyu.lifeworkbench;
import org.junit.Test;
import static org.junit.Assert.*;
public class WorkbenchDashboardPolicyTest {
    private final String id = "a1111111-1111-4111-8111-111111111111";
    @Test public void exactReadEndpointsOnly() {
        for (String path : new String[] {"/api/mobile-dashboard?kind=finance&month=2026-10&page=0",
            "/api/mobile-dashboard?kind=goals", "/api/mobile-dashboard?kind=review&days=7",
            "/api/mobile-dashboard?kind=review&days=30", "/api/mobile-dashboard?kind=review&days=90"})
            assertTrue(WorkbenchDashboardPolicy.endpoint(path));
        for (String path : new String[] {"/api/mobile-dashboard", "/api/mobile-dashboard?kind=goals&owner=x",
            "/api/mobile-dashboard?kind=finance&month=2026-13&page=0",
            "/api/mobile-dashboard?kind=finance&month=2026-10&page=00",
            "/api/mobile-dashboard?kind=review&days=1", "/api/mobile-dashboard?kind=goals#x"})
            assertFalse(WorkbenchDashboardPolicy.endpoint(path));
    }
    @Test public void bridgeSeparatesReadAndWritePaths() {
        assertTrue(WorkbenchClientPolicy.allowsEndpoint("/api/mobile-ledger-actions", true));
        assertFalse(WorkbenchClientPolicy.allowsEndpoint("/api/mobile-ledger-actions", false));
        assertFalse(WorkbenchClientPolicy.allowsEndpoint("/api/mobile-ledger-actions?owner=x", true));
        assertTrue(WorkbenchClientPolicy.allowsEndpoint("/api/mobile-dashboard?kind=goals", false));
        assertFalse(WorkbenchClientPolicy.allowsEndpoint("/api/mobile-dashboard?kind=goals", true));
    }
    @Test public void responseRejectsRedirectsQueriesFragmentsAndWrongMedia() {
        String path = "/api/mobile-dashboard?kind=goals", origin = "https://example.com";
        assertTrue(WorkbenchDashboardPolicy.response(200, "application/json; charset=utf-8", origin + path, origin, path));
        for (String url : new String[] {"https://other.com" + path, origin + path + "&owner=x", origin + path + "#x",
            "https://user@example.com" + path, origin + "/api/mobile-dashboard?kind=review&days=7"})
            assertFalse(WorkbenchDashboardPolicy.response(200, "application/json", url, origin, path));
        assertFalse(WorkbenchDashboardPolicy.response(200, "application/jsonx", origin + path, origin, path));
        assertFalse(WorkbenchDashboardPolicy.response(302, "application/json", origin + path, origin, path));
    }
    @Test public void amountUsesExactCents() {
        assertEquals(1, WorkbenchDashboardPolicy.cents("0.01"));
        assertEquals(29, WorkbenchDashboardPolicy.cents("0.29"));
        assertEquals(100, WorkbenchDashboardPolicy.cents("1"));
        assertEquals(999999999, WorkbenchDashboardPolicy.cents("9999999.99"));
        assertEquals("1.09", WorkbenchDashboardPolicy.money(109));
        for (String value : new String[] {"0", "-1", "1.001", "1e3", "01", ".5", "1.", "10000000", "NaN", "1,000"})
            assertEquals(value, -1, WorkbenchDashboardPolicy.cents(value));
    }
    @Test public void monthIsBeijingEvenAtUtcBoundary() {
        assertEquals("2026-11", WorkbenchDashboardPolicy.month(1793462400000L));
    }
    @Test public void receiptMustMatchTheOriginalIdAndAction() {
        String target = "ledger-" + id + "-abcdef0123456789";
        assertTrue(WorkbenchDashboardPolicy.receipt(target, id, "ledger.create", "applied", false));
        assertTrue(WorkbenchDashboardPolicy.receipt(target, id, "ledger.create", "cancelled", false));
        assertTrue(WorkbenchDashboardPolicy.receipt(target, id, "ledger.create", "not-confirmed", true));
        assertFalse(WorkbenchDashboardPolicy.receipt(target, id, "ledger.create", "not-confirmed", false));
        assertFalse(WorkbenchDashboardPolicy.receipt(target, id.toUpperCase(), "ledger.create", "applied", false));
        assertFalse(WorkbenchDashboardPolicy.receipt(target, id, "task.create", "applied", false));
    }
}
