package com.richangyu.lifeworkbench;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Locale;

/** Pure reminder identity, timing, and delivery guards; no Android or network access. */
final class WorkbenchReminderPolicy {
    static final int MAX_REMINDERS = 64;
    static final class Candidate {
        final String id, status;
        final Long start, end;
        Candidate(String id, String startAt, String endAt, String status) {
            this.id = id == null ? "" : id;
            this.status = status == null ? "" : status.trim().toLowerCase(Locale.ROOT);
            this.start = WorkbenchSchedulePolicy.instant(startAt);
            this.end = WorkbenchSchedulePolicy.instant(endAt);
        }
    }
    static boolean validScope(String scope) {
        return scope != null && scope.matches("[0-9a-f]{64}");
    }
    static boolean validKey(String key) { return validScope(key); }
    static String key(String scope, String id) {
        if (!validScope(scope) || id == null || !id.matches("[A-Za-z0-9_-]{1,128}")) return "";
        try {
            byte[] bytes = MessageDigest.getInstance("SHA-256")
                .digest((scope + "\n" + id).getBytes(StandardCharsets.UTF_8));
            StringBuilder out = new StringBuilder();
            for (byte b : bytes) out.append(String.format(Locale.ROOT, "%02x", b & 255));
            return out.toString();
        } catch (Exception error) { return ""; }
    }
    static boolean active(Candidate item) {
        if (item == null || item.start == null || item.end == null || item.end <= item.start) return false;
        return "planned".equals(item.status) || "pending".equals(item.status) || "active".equals(item.status)
            || "\u8ba1\u5212\u4e2d".equals(item.status) || "\u8fdb\u884c\u4e2d".equals(item.status);
    }
    static boolean offsetAllowed(int minutes) {
        return minutes == 0 || minutes == 10 || minutes == 30 || minutes == 60;
    }
    static Long trigger(Candidate item, int minutes, long now) {
        if (!active(item) || !offsetAllowed(minutes) || item.start <= now) return null;
        long value = item.start - minutes * 60000L;
        return value > now ? value : null;
    }
    static boolean sameTime(Candidate item, long start, long end) {
        return active(item) && item.start == start && item.end == end;
    }
    static boolean mayDeliver(String scope, String currentScope, String state,
                              String expectedToken, String receivedToken, long when, long end, long now) {
        return validScope(scope) && scope.equals(currentScope) && "armed".equals(state)
            && expectedToken != null && !expectedToken.isEmpty() && expectedToken.equals(receivedToken)
            && when > 0 && end > when && now >= when && now < end;
    }
    static boolean mayRestore(long when, long end, long now, boolean armed, boolean allowed) {
        return armed && allowed && when > now && end > when;
    }
    private WorkbenchReminderPolicy() { }
}
