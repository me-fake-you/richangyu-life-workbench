package com.richangyu.lifeworkbench;

import java.net.URI;
import java.text.ParsePosition;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.TimeZone;

/** Read-only task presentation policy. No storage, cookies, or write payloads. */
final class WorkbenchTaskPolicy {
    static final int LIMIT = 100;
    static final String ALL = "全部", PENDING = "待办", TODAY = "今日重点", OVERDUE = "逾期", DONE = "已完成";
    static final class Entry {
        final String id, title, description, status, priority, dueAt, project;
        final int plannedMinutes, actualMinutes, todayRank;
        Entry(String id, String title, String description, String status, String priority,
              String dueAt, String project, int plannedMinutes, int actualMinutes, int todayRank) {
            this.id = safe(id); this.title = safe(title); this.description = safe(description);
            this.status = safe(status); this.priority = safe(priority); this.dueAt = safe(dueAt);
            this.project = safe(project); this.plannedMinutes = plannedMinutes;
            this.actualMinutes = actualMinutes; this.todayRank = todayRank;
        }
    }
    private WorkbenchTaskPolicy() {}
    private static String safe(String value) { return value == null ? "" : value; }
    static boolean readAllowed(String expected, String current, boolean connected) {
        return connected && expected != null && !expected.isEmpty() && expected.equals(current);
    }
    static boolean validResponse(int status, String type, String url, String origin) {
        if (status != 200 || type == null || !type.toLowerCase(Locale.ROOT).contains("application/json")) return false;
        try {
            URI result = new URI(url), expected = new URI(origin);
            return "https".equalsIgnoreCase(result.getScheme()) && result.getHost() != null &&
                result.getHost().equalsIgnoreCase(expected.getHost()) &&
                (result.getPort() == -1 || result.getPort() == 443) &&
                result.getRawUserInfo() == null && result.getRawQuery() == null && result.getRawFragment() == null &&
                "/api/mobile-tasks".equals(result.getRawPath());
        } catch (Exception ignored) { return false; }
    }
    static long timestamp(String raw) {
        if (raw == null || raw.length() > 40) return 0;
        String value = raw.trim();
        if (value.matches("\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}:\\d{2}"))
            value = value.replace(' ', 'T') + "+0000";
        value = value.replaceFirst("Z$", "+0000").replaceFirst("([+-]\\d{2}):(\\d{2})$", "$1$2");
        String format;
        if (value.matches("\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}[+-]\\d{4}"))
            format = "yyyy-MM-dd'T'HH:mm:ss.SSSZ";
        else if (value.matches("\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}[+-]\\d{4}"))
            format = "yyyy-MM-dd'T'HH:mm:ssZ";
        else return 0;
        SimpleDateFormat parser = new SimpleDateFormat(format, Locale.US);
        parser.setLenient(false); parser.setTimeZone(TimeZone.getTimeZone("UTC"));
        ParsePosition position = new ParsePosition(0); Date result = parser.parse(value, position);
        return result != null && position.getIndex() == value.length() ? result.getTime() : 0;
    }
    static boolean overdue(Entry entry, long now) {
        long due = timestamp(entry.dueAt);
        return due > 0 && due < now && !DONE.equals(entry.status) && !"已取消".equals(entry.status);
    }
    static String dueLabel(String raw) {
        if (raw == null || raw.isEmpty()) return "未设置截止时间";
        long time = timestamp(raw);
        if (time == 0) return "截止时间格式未知";
        SimpleDateFormat format = new SimpleDateFormat("MM月dd日 HH:mm", Locale.CHINA);
        format.setTimeZone(TimeZone.getTimeZone("Asia/Shanghai"));
        return "截止 " + format.format(new Date(time)) + "（北京时间）";
    }
    static List<Entry> filter(List<Entry> entries, String query, String scope, long now) {
        String normalized = safe(query).replace('\u3000', ' ').trim().toLowerCase(Locale.ROOT);
        String[] terms = normalized.isEmpty() ? new String[0] : normalized.split("\\s+");
        List<Entry> result = new ArrayList<>();
        for (Entry entry : entries) {
            boolean ended = DONE.equals(entry.status) || "已取消".equals(entry.status);
            if (PENDING.equals(scope) && ended) continue;
            if (TODAY.equals(scope) && (ended || entry.todayRank < 1 || entry.todayRank > 3)) continue;
            if (OVERDUE.equals(scope) && !overdue(entry, now)) continue;
            if (DONE.equals(scope) && !DONE.equals(entry.status)) continue;
            String haystack = (entry.title + " " + entry.description + " " + entry.project + " " +
                entry.status + " " + entry.priority).toLowerCase(Locale.ROOT);
            boolean matches = true;
            for (String term : terms) if (!haystack.contains(term)) { matches = false; break; }
            if (matches) result.add(entry);
        }
        return Collections.unmodifiableList(result);
    }
}
