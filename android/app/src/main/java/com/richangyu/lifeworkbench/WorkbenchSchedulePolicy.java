package com.richangyu.lifeworkbench;

import java.util.ArrayList;
import java.util.Calendar;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.TimeZone;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Read-only filtering of the currently synchronized schedules, using Beijing calendar days. */
final class WorkbenchSchedulePolicy {
    static final String ALL = "all", TODAY = "today", TOMORROW = "tomorrow", WEEK = "week";
    private static final Pattern TIMESTAMP = Pattern.compile(
        "^([0-9]{4})-([0-9]{2})-([0-9]{2})([T ])([0-9]{2}):([0-9]{2})(?::([0-9]{2})(?:[.]([0-9]{1,3}))?)?(Z|[+-][0-9]{2}:?[0-9]{2})?$");

    static final class Entry {
        final int sourceIndex;
        final String title, place, note;
        final Long start, end;
        Entry(int sourceIndex, String title, String place, String note, String startAt, String endAt) {
            this.sourceIndex = sourceIndex;
            this.title = safe(title); this.place = safe(place); this.note = safe(note);
            this.start = instant(startAt); this.end = instant(endAt);
        }
    }

    static Long instant(String value) {
        if (value == null || value.length() < 16 || value.length() > 35) return null;
        Matcher match = TIMESTAMP.matcher(value);
        if (!match.matches()) return null;
        boolean sqlUtc = " ".equals(match.group(4));
        if (sqlUtc ? value.length() != 19 || match.group(9) != null : match.group(9) == null) return null;
        try {
            int year = Integer.parseInt(match.group(1));
            if (year < 1900) return null;
            Calendar utc = Calendar.getInstance(TimeZone.getTimeZone("UTC"), Locale.ROOT);
            utc.clear(); utc.setLenient(false);
            utc.set(year, Integer.parseInt(match.group(2)) - 1, Integer.parseInt(match.group(3)),
                Integer.parseInt(match.group(5)), Integer.parseInt(match.group(6)),
                match.group(7) == null ? 0 : Integer.parseInt(match.group(7)));
            String fraction = match.group(8);
            if (fraction != null) {
                while (fraction.length() < 3) fraction += "0";
                utc.set(Calendar.MILLISECOND, Integer.parseInt(fraction));
            }
            int offsetMinutes = 0;
            String zone = match.group(9);
            if (zone != null && !"Z".equals(zone)) {
                zone = zone.replace(":", "");
                int hours = Integer.parseInt(zone.substring(1, 3));
                int minutes = Integer.parseInt(zone.substring(3, 5));
                if (hours > 23 || minutes > 59) return null;
                offsetMinutes = (hours * 60 + minutes) * (zone.charAt(0) == '-' ? -1 : 1);
            }
            return utc.getTimeInMillis() - offsetMinutes * 60000L;
        } catch (IllegalArgumentException error) { return null; }
    }

    static List<Entry> select(List<Entry> input, String scope, String query, long now) {
        List<Entry> selected = new ArrayList<>();
        String needle = safe(query).trim().toLowerCase(Locale.ROOT);
        boolean dated = TODAY.equals(scope) || TOMORROW.equals(scope) || WEEK.equals(scope);
        long from = 0, until = 0;
        if (dated) {
            Calendar boundary = Calendar.getInstance(TimeZone.getTimeZone("Asia/Shanghai"), Locale.ROOT);
            boundary.setTimeInMillis(now);
            boundary.set(Calendar.HOUR_OF_DAY, 0); boundary.set(Calendar.MINUTE, 0);
            boundary.set(Calendar.SECOND, 0); boundary.set(Calendar.MILLISECOND, 0);
            if (TOMORROW.equals(scope)) boundary.add(Calendar.DAY_OF_MONTH, 1);
            from = boundary.getTimeInMillis();
            boundary.add(Calendar.DAY_OF_MONTH, WEEK.equals(scope) ? 7 : 1);
            until = boundary.getTimeInMillis();
        }
        if (input != null) for (Entry entry : input) {
            if (entry == null) continue;
            if (!needle.isEmpty() && !(entry.title + "\n" + entry.place + "\n" + entry.note)
                    .toLowerCase(Locale.ROOT).contains(needle)) continue;
            if (dated) {
                if (entry.start == null) continue;
                boolean interval = entry.end != null && entry.end > entry.start;
                boolean overlaps = entry.start < until && (interval ? entry.end > from : entry.start >= from);
                if (!overlaps) continue;
            }
            selected.add(entry);
        }
        Collections.sort(selected, new Comparator<Entry>() {
            @Override public int compare(Entry a, Entry b) {
                if (a.start == null && b.start != null) return 1;
                if (a.start != null && b.start == null) return -1;
                int order = a.start == null ? 0 : Long.compare(a.start, b.start);
                return order != 0 ? order : Integer.compare(a.sourceIndex, b.sourceIndex);
            }
        });
        return selected;
    }
    private static String safe(String value) { return value == null ? "" : value; }
    private WorkbenchSchedulePolicy() {}
}
