package com.richangyu.lifeworkbench;

import android.annotation.SuppressLint;
import android.content.Context;
import android.content.SharedPreferences;
import org.json.JSONObject;

/** One explicitly submitted operation per account/origin. App sandbox, not encrypted storage. */
final class NativeManagementStore {
    private final SharedPreferences preferences;
    private final String key;
    NativeManagementStore(Context context, String scope) {
        preferences = context.getSharedPreferences("management_submissions_v1", Context.MODE_PRIVATE);
        if (scope == null || !scope.matches("[0-9a-f]{64}")) throw new IllegalArgumentException("Invalid management scope");
        key = scope;
    }
    boolean hasPending() { return preferences.contains(key); }
    JSONObject read() {
        try {
            String raw = preferences.getString(key, "");
            if (raw == null || raw.length() > 60000) return null;
            JSONObject item = new JSONObject(raw);
            if (!WorkbenchTaskWritePolicy.requestId(item.optString("requestId")) ||
                !WorkbenchManagementPolicy.mutation(item.optString("action")) ||
                item.optJSONObject("payload") == null || item.optString("expectedAccount").isEmpty()) return null;
            return item;
        } catch (Exception ignored) { return null; }
    }
    // Durable commit must succeed before a network write; asynchronous apply is insufficient here.
    @SuppressLint("ApplySharedPref")
    boolean save(JSONObject item) {
        if (hasPending() || item == null) return false;
        return preferences.edit().putString(key, item.toString()).commit();
    }
    @SuppressLint("ApplySharedPref")
    boolean clear(String requestId) {
        JSONObject current = read();
        return current != null && requestId.equals(current.optString("requestId")) &&
            preferences.edit().remove(key).commit();
    }
}
