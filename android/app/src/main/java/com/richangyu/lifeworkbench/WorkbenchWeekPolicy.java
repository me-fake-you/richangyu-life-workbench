package com.richangyu.lifeworkbench;

import java.util.ArrayList;
import java.util.Calendar;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TimeZone;

/** Read-only, partial calendar projection. It never infers availability or executes changes. */
final class WorkbenchWeekPolicy {
    static final int DAYS = 7, MAX_ROWS = 40;
    static final long FRESH_MS = 5 * 60 * 1000L;
    private WorkbenchWeekPolicy() { }

    static final class Entry {
        final int sourceIndex;
        final String id, title, category;
        final Long start, end;
        Entry(int sourceIndex, String id, String title, String category, String startAt, String endAt) {
            this.sourceIndex = sourceIndex;
            this.id = clean(id); this.title = clean(title); this.category = clean(category);
            this.start = WorkbenchSchedulePolicy.instant(startAt);
            this.end = WorkbenchSchedulePolicy.instant(endAt);
        }
        boolean valid() {
            return !id.isEmpty() && id.length() <= 80 && !title.isEmpty()
                && title.length() <= 120 && category.length() <= 40
                && start != null && end != null && end > start;
        }
        String occurrenceKey() { return id + "\n" + start + "\n" + end; }
    }

    static final class Slice {
        final Entry entry;
        final long start, end;
        final boolean carryIn, carryOut;
        Slice(Entry entry, long from, long until) {
            this.entry = entry;
            this.start = Math.max(entry.start, from);
            this.end = Math.min(entry.end, until);
            this.carryIn = entry.start < from;
            this.carryOut = entry.end > until;
        }
    }

    static final class Window {
        final long readAt, readElapsed, from, until;
        final List<Entry> entries;
        final int invalidCount, duplicateCount, ambiguousCount;
        Window(List<Entry> input, long readAt, long readElapsed) {
            if (input == null || input.size() > MAX_ROWS) throw new IllegalArgumentException("unbounded calendar");
            this.readAt = readAt; this.readElapsed = readElapsed;
            this.from = dayStart(readAt); this.until = dayAt(from, DAYS);
            int invalid = 0, duplicates = 0;
            Map<String, Entry> unique = new LinkedHashMap<>();
            Set<String> ambiguous = new HashSet<>();
            for (Entry entry : input) {
                if (entry == null || !entry.valid()) { invalid++; continue; }
                if (entry.end <= readAt || entry.start >= until) continue;
                String key = entry.occurrenceKey();
                if (ambiguous.contains(key)) continue;
                Entry previous = unique.get(key);
                if (previous == null) unique.put(key, entry);
                else if (previous.title.equals(entry.title) && previous.category.equals(entry.category)) duplicates++;
                else { unique.remove(key); ambiguous.add(key); }
            }
            List<Entry> ordered = new ArrayList<>(unique.values());
            Collections.sort(ordered, new Comparator<Entry>() {
                @Override public int compare(Entry a, Entry b) {
                    int order = Long.compare(a.start, b.start);
                    if (order == 0) order = Long.compare(a.end, b.end);
                    if (order == 0) order = a.id.compareTo(b.id);
                    return order == 0 ? Integer.compare(a.sourceIndex, b.sourceIndex) : order;
                }
            });
            entries = Collections.unmodifiableList(ordered);
            invalidCount = invalid; duplicateCount = duplicates; ambiguousCount = ambiguous.size();
        }
        List<Slice> day(int offset) {
            if (offset < 0 || offset >= DAYS) return Collections.emptyList();
            long start = dayAt(from, offset), end = dayAt(from, offset + 1);
            List<Slice> selected = new ArrayList<>();
            for (Entry entry : entries) if (entry.start < end && entry.end > start)
                selected.add(new Slice(entry, start, end));
            return selected;
        }
        long minutes(int offset) {
            long total = 0;
            for (Slice slice : day(offset)) total += slice.end - slice.start;
            return (total + 59999L) / 60000L;
        }
        Set<Integer> overlaps(int offset) {
            List<Slice> slices = day(offset);
            Set<Integer> indexes = new HashSet<>();
            for (int i = 0; i < slices.size(); i++) for (int j = i + 1; j < slices.size(); j++) {
                Slice a = slices.get(i), b = slices.get(j);
                if (a.start < b.end && b.start < a.end) {
                    indexes.add(a.entry.sourceIndex); indexes.add(b.entry.sourceIndex);
                }
            }
            return indexes;
        }
    }

    static long dayStart(long now) {
        Calendar day = Calendar.getInstance(TimeZone.getTimeZone("Asia/Shanghai"), Locale.ROOT);
        day.setTimeInMillis(now);
        day.set(Calendar.HOUR_OF_DAY, 0); day.set(Calendar.MINUTE, 0);
        day.set(Calendar.SECOND, 0); day.set(Calendar.MILLISECOND, 0);
        return day.getTimeInMillis();
    }
    static long dayAt(long start, int offset) {
        Calendar day = Calendar.getInstance(TimeZone.getTimeZone("Asia/Shanghai"), Locale.ROOT);
        day.setTimeInMillis(start); day.add(Calendar.DAY_OF_MONTH, offset);
        return day.getTimeInMillis();
    }
    static boolean fresh(Window window, long now, long elapsed) {
        return window != null && window.readElapsed > 0 && elapsed >= window.readElapsed
            && elapsed - window.readElapsed <= FRESH_MS && dayStart(now) == window.from;
    }
    static boolean scopeMatches(String expected, String actual) {
        return expected != null && expected.matches("[a-f0-9]{64}") && expected.equals(actual);
    }
    private static String clean(String value) { return value == null ? "" : value.trim(); }
}
