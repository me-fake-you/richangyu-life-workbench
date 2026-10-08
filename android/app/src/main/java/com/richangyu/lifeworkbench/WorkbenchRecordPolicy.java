package com.richangyu.lifeworkbench;

import java.text.ParsePosition;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.Collections;
import java.util.Comparator;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.TimeZone;

/** Read-only filters for one loaded snapshot, independent of Android and network requests. */
final class WorkbenchRecordPolicy {
    static final String ALL = "all";
    static final String TODAY = "today";
    static final String WEEK = "week";
    private static final TimeZone ZONE = TimeZone.getTimeZone("Asia/Shanghai");
    private WorkbenchRecordPolicy() { }

    static final class Entry {
        final int sourceIndex;
        final String title;
        final String content;
        final String kind;
        final String happenedAt;
        final long timestamp;
        Entry(int sourceIndex, String title, String content, String kind, String happenedAt) {
            this.sourceIndex = sourceIndex;
            this.title = safe(title);
            this.content = safe(content);
            this.kind = safe(kind);
            this.happenedAt = safe(happenedAt);
            this.timestamp = parse(this.happenedAt);
        }
    }

    private static String safe(String value) { return value == null ? "" : value; }

    private static long parse(String raw) {
        if (raw == null || raw.isEmpty() || raw.length() > 64) return Long.MIN_VALUE;
        String normalized = raw.endsWith("Z") ? raw.substring(0, raw.length() - 1) + "+0000"
            : raw.replaceAll("([+-]\\d\\d):(\\d\\d)$", "$1$2");
        for (String pattern : new String[] {"yyyy-MM-dd'T'HH:mm:ss.SSSZ", "yyyy-MM-dd'T'HH:mm:ssZ",
                "yyyy-MM-dd'T'HH:mmZ", "yyyy-MM-dd HH:mm:ss"}) {
            SimpleDateFormat format = new SimpleDateFormat(pattern, Locale.ROOT);
            format.setLenient(false);
            format.setTimeZone(TimeZone.getTimeZone("UTC"));
            ParsePosition position = new ParsePosition(0);
            Date value = format.parse(normalized, position);
            if (value != null && position.getIndex() == normalized.length()) return value.getTime();
        }
        return Long.MIN_VALUE;
    }

    static String dayKey(long timestamp) {
        if (timestamp == Long.MIN_VALUE) return "";
        SimpleDateFormat format = new SimpleDateFormat("yyyy-MM-dd", Locale.ROOT);
        format.setTimeZone(ZONE);
        return format.format(new Date(timestamp));
    }

    static String dayKey(String raw) { return dayKey(parse(raw)); }

    private static String typeTerms(String kind) {
        if ("checkin".equals(kind)) return kind + " \u4e13\u6ce8 \u6253\u5361";
        if ("income".equals(kind)) return kind + " \u6536\u5165";
        if ("life".equals(kind) || "event".equals(kind)) return kind + " \u751f\u6d3b";
        if ("note".equals(kind)) return kind + " \u968f\u8bb0";
        return kind;
    }

    static List<Entry> select(List<Entry> entries, String scope, String query, long now) {
        if (entries == null || entries.isEmpty()) return Collections.emptyList();
        Calendar start = Calendar.getInstance(ZONE, Locale.ROOT);
        start.setTimeInMillis(now);
        start.set(Calendar.HOUR_OF_DAY, 0);
        start.set(Calendar.MINUTE, 0);
        start.set(Calendar.SECOND, 0);
        start.set(Calendar.MILLISECOND, 0);
        Calendar end = (Calendar) start.clone();
        end.add(Calendar.DAY_OF_MONTH, 1);
        if (WEEK.equals(scope)) start.add(Calendar.DAY_OF_MONTH, -6);
        boolean dated = TODAY.equals(scope) || WEEK.equals(scope);
        long lower = start.getTimeInMillis(), upper = end.getTimeInMillis();
        String normalized = safe(query).replace('\u3000', ' ').trim().toLowerCase(Locale.ROOT);
        String[] terms = normalized.isEmpty() ? new String[0] : normalized.split("\\s+");
        List<Entry> result = new ArrayList<>();
        for (Entry entry : entries) {
            if (entry == null) continue;
            if (dated && (entry.timestamp == Long.MIN_VALUE || entry.timestamp < lower || entry.timestamp >= upper))
                continue;
            String searchable = (entry.title + " " + entry.content + " " + typeTerms(entry.kind)).toLowerCase(Locale.ROOT);
            boolean matches = true;
            for (String term : terms) if (!searchable.contains(term)) { matches = false; break; }
            if (matches) result.add(entry);
        }
        Collections.sort(result, new Comparator<Entry>() {
            @Override public int compare(Entry a, Entry b) {
                int time = Long.compare(b.timestamp, a.timestamp);
                return time == 0 ? Integer.compare(a.sourceIndex, b.sourceIndex) : time;
            }
        });
        return Collections.unmodifiableList(result);
    }
}
