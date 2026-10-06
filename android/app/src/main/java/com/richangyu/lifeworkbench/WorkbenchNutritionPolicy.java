package com.richangyu.lifeworkbench;

import java.net.URI;
import java.text.ParsePosition;
import java.text.SimpleDateFormat;
import java.util.Arrays;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;

/** Pure Java nutrition input and response boundaries, independent of Android widgets. */
final class WorkbenchNutritionPolicy {
    private WorkbenchNutritionPolicy() {}
    static boolean allowsMealField(String key) {
        return Arrays.asList("mealType", "eatenAt", "note", "calories", "proteinG", "carbsG", "fatG").contains(key);
    }
    static boolean expectedResponse(String value, String origin) {
        try {
            URI url = new URI(value);
            String normalized = WorkbenchClientPolicy.normalizeOrigin(origin);
            return !normalized.isEmpty() && normalized.equals(WorkbenchClientPolicy.normalizeOrigin(
                url.getScheme() + "://" + url.getRawAuthority()))
                && "/api/nutrition".equals(url.getRawPath())
                && url.getRawQuery() == null && url.getRawFragment() == null && url.getRawUserInfo() == null;
        } catch (Exception ignored) { return false; }
    }
    static boolean jsonType(String type) {
        return type != null && "application/json".equals(type.split(";", 2)[0].trim().toLowerCase(Locale.ROOT));
    }
    static double number(String value, double minimum, double maximum, boolean emptyIsZero) {
        String text = value == null ? "" : value.trim();
        if (text.isEmpty() && emptyIsZero && minimum == 0) return 0;
        if (!text.matches("[0-9]+(?:\\.[0-9]+)?")) throw new IllegalArgumentException("invalid number");
        double parsed = Double.parseDouble(text);
        if (!Double.isFinite(parsed) || parsed < minimum || parsed > maximum) {
            throw new IllegalArgumentException("number out of range");
        }
        return parsed;
    }
    static boolean validMetric(double value) {
        return Double.isFinite(value) && value >= 0 && value <= 1000000;
    }
    static Date instant(String value) {
        if (value == null || value.length() > 64) return null;
        for (String pattern : new String[] {"yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", "yyyy-MM-dd'T'HH:mm:ss'Z'",
                "yyyy-MM-dd'T'HH:mm:ss.SSSXXX", "yyyy-MM-dd'T'HH:mm:ssXXX", "yyyy-MM-dd HH:mm:ss"}) {
            SimpleDateFormat format = new SimpleDateFormat(pattern, Locale.ROOT);
            format.setLenient(false);
            format.setTimeZone(TimeZone.getTimeZone("UTC"));
            ParsePosition position = new ParsePosition(0);
            Date parsed = format.parse(value, position);
            if (parsed != null && position.getIndex() == value.length()) return parsed;
        }
        return null;
    }
    static String dayKey(Date date, TimeZone zone) {
        SimpleDateFormat format = new SimpleDateFormat("yyyy-MM-dd", Locale.ROOT);
        format.setTimeZone(zone);
        return format.format(date);
    }
    static String dayKey(String value, TimeZone zone) {
        Date parsed = instant(value);
        return parsed == null ? "" : dayKey(parsed, zone);
    }
    static String iso(Date date) {
        SimpleDateFormat format = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.ROOT);
        format.setTimeZone(TimeZone.getTimeZone("UTC"));
        return format.format(date);
    }
}
