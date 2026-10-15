package com.richangyu.lifeworkbench;

import java.net.URI;
import java.util.Locale;

/** Pure admission policy; no account storage or automatic replay. */
final class WorkbenchTaskWritePolicy {
    private WorkbenchTaskWritePolicy() {}
    static boolean mutation(String action) {
        return "task.create".equals(action) || "task.update".equals(action) || "task.complete".equals(action);
    }
    static boolean requestId(String value) {
        return value != null && value.matches("[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}");
    }
    static boolean revision(String value) { return value != null && value.matches("[0-9a-f]{64}"); }
    static boolean validResponse(int status, String type, String url, String origin) {
        if (status != 200 || type == null || !type.toLowerCase(Locale.ROOT).contains("application/json")) return false;
        try {
            URI result = new URI(url), expected = new URI(origin);
            return "https".equalsIgnoreCase(result.getScheme()) && result.getHost() != null &&
                result.getHost().equalsIgnoreCase(expected.getHost()) &&
                (result.getPort() == -1 || result.getPort() == 443) && result.getRawUserInfo() == null &&
                result.getRawQuery() == null && result.getRawFragment() == null &&
                "/api/mobile-task-actions".equals(result.getRawPath());
        } catch (Exception ignored) { return false; }
    }
    static boolean resultMatches(String id, String action, String target, String state,
                                 String expectedId, String expectedAction, String expectedTarget, boolean statusProbe) {
        return requestId(id) && id.equals(expectedId) && mutation(action) && action.equals(expectedAction) &&
            target != null && !target.isEmpty() && target.equals(expectedTarget) &&
            ("applied".equals(state) || "cancelled".equals(state) || (statusProbe && "not-confirmed".equals(state)));
    }
}
