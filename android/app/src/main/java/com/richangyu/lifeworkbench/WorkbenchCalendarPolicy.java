package com.richangyu.lifeworkbench;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.TimeZone;

/** Strict, account-scoped accumulation of manually requested calendar pages. */
final class WorkbenchCalendarPolicy {
    static final int PAGE_SIZE = 50, MAX_ROWS = 2000;
    static final long DAY = 86400000L, FRESH_MS = 300000L;
    private WorkbenchCalendarPolicy() { }
    static long start(String value) {
        if (value == null || !value.matches("[0-9]{4}-[0-9]{2}-[0-9]{2}")) throw new IllegalArgumentException("date");
        try {
            SimpleDateFormat format = new SimpleDateFormat("yyyy-MM-dd", Locale.ROOT);
            format.setTimeZone(TimeZone.getTimeZone("Asia/Shanghai")); format.setLenient(false);
            return format.parse(value).getTime();
        } catch (Exception ignored) { throw new IllegalArgumentException("date"); }
    }
    static String day(long value) {
        SimpleDateFormat format = new SimpleDateFormat("yyyy-MM-dd", Locale.ROOT);
        format.setTimeZone(TimeZone.getTimeZone("Asia/Shanghai"));
        return format.format(new java.util.Date(value));
    }
    static boolean allowedDate(String value, long now) {
        try { long difference = start(value) - WorkbenchWeekPolicy.dayStart(now);
            return difference >= -365 * DAY && difference <= 365 * DAY;
        } catch (IllegalArgumentException ignored) { return false; }
    }
    static boolean allowsEndpoint(String value) {
        if (value == null || !value.matches("/api/mobile-calendar\\?from=[0-9]{4}-[0-9]{2}-[0-9]{2}(?:&cursor=[a-f0-9]{64}\\.[1-9][0-9]{0,3})?")) return false;
        try { start(value.substring(value.indexOf("from=") + 5, value.indexOf("from=") + 15)); return true; }
        catch (IllegalArgumentException ignored) { return false; }
    }
    static final class Entry {
        final String id, title, category, place, note, status, reflection, interruption;
        final long start, end;
        final int actualMinutes;
        final boolean stored;
        Entry(String id, String title, String category, String startAt, String endAt,
                String place, String note, String status, int actualMinutes,
                String reflection, String interruption, boolean stored) {
            Long a = WorkbenchSchedulePolicy.instant(startAt), b = WorkbenchSchedulePolicy.instant(endAt);
            if (id == null || id.isEmpty() || id.length() > 120 || title == null || title.trim().isEmpty()
                || title.length() > 200 || category == null || category.length() > 40
                || place == null || place.length() > 200 || note == null || note.length() > 5000
                || status == null || status.length() > 80 || reflection == null || reflection.length() > 5000
                || interruption == null || interruption.length() > 2000
                || a == null || b == null || b <= a || actualMinutes < 0 || actualMinutes > 10000000)
                throw new IllegalArgumentException("entry");
            this.id=id; this.title=title; this.category=category; this.start=a; this.end=b;
            this.place=place; this.note=note; this.status=status; this.actualMinutes=actualMinutes;
            this.reflection=reflection; this.interruption=interruption; this.stored=stored;
        }
    }
    static final class Snapshot {
        final String from, to;
        final long start, end;
        final List<Entry> entries = new ArrayList<>();
        String token = "", cursor = "";
        int total = -1, repeating, invalidTemplates;
        long readElapsed;
        Snapshot(String from) { this.from=from; start=start(from); end=start+7*DAY; to=WorkbenchCalendarPolicy.day(end); }
        void append(String token, String cursor, int offset, int total, int repeating,
                int invalidTemplates, List<Entry> rows, long elapsed) {
            if (token == null || !token.matches("[a-f0-9]{64}") || cursor == null
                || offset != entries.size() || total < 0 || total > MAX_ROWS || total < offset
                || repeating < 0 || invalidTemplates < 0 || rows == null
                || rows.size() != Math.min(PAGE_SIZE, total-offset)
                || (!this.token.isEmpty() && (!this.token.equals(token) || this.total != total
                    || this.repeating != repeating || this.invalidTemplates != invalidTemplates)))
                throw new IllegalArgumentException("page");
            int loaded=offset+rows.size();
            String expected=loaded<total ? token+"."+loaded : "";
            if (!cursor.equals(expected)) throw new IllegalArgumentException("cursor");
            Set<String> seen=new HashSet<>();
            for (Entry entry : entries) seen.add(entry.id);
            Entry previous=entries.isEmpty() ? null : entries.get(entries.size()-1);
            for (Entry entry : rows) {
                if (entry == null || entry.start >= end || entry.end <= start || !seen.add(entry.id)
                    || (previous != null && entry.start < previous.start))
                    throw new IllegalArgumentException("order");
                previous=entry;
            }
            entries.addAll(rows); this.token=token; this.cursor=cursor; this.total=total;
            this.repeating=repeating; this.invalidTemplates=invalidTemplates; readElapsed=elapsed;
        }
        boolean complete() { return total >= 0 && entries.size()==total && cursor.isEmpty(); }
        boolean fresh(long elapsed) { return readElapsed>0 && elapsed>=readElapsed && elapsed-readElapsed<=FRESH_MS; }
        List<Entry> day(int offset) {
            if(offset<0 || offset>=7) return Collections.emptyList();
            long a=start+offset*DAY, b=a+DAY;
            List<Entry> selected=new ArrayList<>();
            for(Entry entry:entries) if(entry.start<b && entry.end>a) selected.add(entry);
            return selected;
        }
    }
}
