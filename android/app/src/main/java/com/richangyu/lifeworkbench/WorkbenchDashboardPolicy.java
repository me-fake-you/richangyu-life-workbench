package com.richangyu.lifeworkbench;

import java.net.URI;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;

/** Exact bridge admission and display/input rules. No storage or network. */
final class WorkbenchDashboardPolicy {
    private WorkbenchDashboardPolicy() {}
    static boolean endpoint(String path) {
        return path != null && (path.matches("/api/mobile-dashboard\\?kind=finance&month=(20[0-9]{2}|2100)-(0[1-9]|1[0-2])&page=(0|[1-9][0-9]{0,2})")
            || path.equals("/api/mobile-dashboard?kind=goals")
            || path.matches("/api/mobile-dashboard\\?kind=review&days=(7|30|90)"));
    }
    static boolean response(int status, String type, String url, String origin, String endpoint) {
        if (status != 200 || type == null || !type.split(";", 2)[0].trim().equalsIgnoreCase("application/json")) return false;
        if (!endpoint(endpoint) && !"/api/mobile-ledger-actions".equals(endpoint)) return false;
        try {
            URI value = new URI(url), expected = new URI(origin + endpoint);
            return "https".equalsIgnoreCase(value.getScheme()) && value.getHost() != null
                && value.getHost().equalsIgnoreCase(expected.getHost()) && (value.getPort() == -1 || value.getPort() == 443)
                && value.getRawUserInfo() == null && value.getRawFragment() == null
                && expected.getRawPath().equals(value.getRawPath())
                && java.util.Objects.equals(expected.getRawQuery(), value.getRawQuery());
        } catch (Exception ignored) { return false; }
    }
    static long cents(String value) {
        if (value == null || !value.matches("(0|[1-9][0-9]{0,6})(\\.[0-9]{1,2})?")) return -1;
        try {
            String[] parts = value.split("\\.");
            long result = Long.parseLong(parts[0]) * 100;
            if (parts.length == 2) result += Long.parseLong(parts[1].length() == 1 ? parts[1] + "0" : parts[1]);
            return result > 0 && result <= 999999999 ? result : -1;
        } catch (Exception ignored) { return -1; }
    }
    static String money(long cents) {
        return String.format(Locale.US, "%d.%02d", cents / 100, cents % 100);
    }
    static String month(long now) {
        SimpleDateFormat format = new SimpleDateFormat("yyyy-MM", Locale.US);
        format.setTimeZone(TimeZone.getTimeZone("Asia/Shanghai")); return format.format(new Date(now));
    }
    static String time(String value) {
        long parsed = WorkbenchTaskPolicy.timestamp(value);
        if (parsed <= 0) return value == null || value.isEmpty() ? "未设置" : value;
        SimpleDateFormat format = new SimpleDateFormat("yyyy-MM-dd HH:mm", Locale.US);
        format.setTimeZone(TimeZone.getTimeZone("Asia/Shanghai")); return format.format(new Date(parsed)) + " 北京时间";
    }
    static boolean receipt(String id, String requestId, String action, String state, boolean probe) {
        return WorkbenchTaskWritePolicy.requestId(requestId) && "ledger.create".equals(action)
            && id != null && id.matches("ledger-" + requestId + "-[0-9a-f]{16}")
            && ("applied".equals(state) || "cancelled".equals(state) || (probe && "not-confirmed".equals(state)));
    }
}
