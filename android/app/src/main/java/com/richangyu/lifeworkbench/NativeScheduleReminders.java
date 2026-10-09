package com.richangyu.lifeworkbench;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/** Local opt-in reminders. Stores no titles, notes, URL, email, cookies, or credentials. */
final class NativeScheduleReminders {
    static final String ACTION_FIRE = "com.richangyu.lifeworkbench.REMINDER_FIRE";
    static final String ACTION_OPEN = "com.richangyu.lifeworkbench.REMINDER_OPEN";
    static final String EXTRA_KEY = "reminder_key";
    private static final String CHANNEL = "local_schedule_reminders_v1";
    private final Context context;
    private final SharedPreferences prefs;
    private final AlarmManager alarms;

    static final class Request {
        final String scope, id, startAt, endAt, status;
        final int minutes;
        Request(String scope, JSONObject item, int minutes) {
            this.scope = scope; this.id = item.optString("id");
            this.startAt = item.optString("startAt"); this.endAt = item.optString("endAt");
            this.status = item.optString("status"); this.minutes = minutes;
        }
        WorkbenchReminderPolicy.Candidate candidate() {
            return new WorkbenchReminderPolicy.Candidate(id, startAt, endAt, status);
        }
    }

    NativeScheduleReminders(Context context) {
        this.context = context.getApplicationContext();
        this.prefs = this.context.getSharedPreferences("native_schedule_reminders_v1", Context.MODE_PRIVATE);
        this.alarms = (AlarmManager) this.context.getSystemService(Context.ALARM_SERVICE);
    }
    private String scope() { return prefs.getString("scope", ""); }
    private boolean scopeCurrent() {
        SharedPreferences workbench = context.getSharedPreferences("native_workbench", Context.MODE_PRIVATE);
        String origin = WorkbenchClientPolicy.normalizeOrigin(workbench.getString("workbench_url", ""));
        return !origin.isEmpty() && WorkbenchReminderPolicy.validScope(scope())
            && scope().equals(workbench.getString("active_scope:" + origin, ""));
    }
    private static void put(JSONObject target, String name, Object value) {
        try { target.put(name, value); }
        catch (Exception error) { throw new IllegalStateException("\u65e0\u6cd5\u4fdd\u5b58\u672c\u673a\u63d0\u9192\u8bbe\u7f6e"); }
    }
    private List<JSONObject> entries() {
        List<JSONObject> result = new ArrayList<>();
        String raw = prefs.getString("items", "[]");
        if (raw == null || raw.length() > 65536) return result;
        try {
            JSONArray items = new JSONArray(raw);
            for (int i = 0; i < Math.min(items.length(), WorkbenchReminderPolicy.MAX_REMINDERS); i++) {
                JSONObject item = items.optJSONObject(i);
                if (item == null) continue;
                String key = WorkbenchReminderPolicy.key(scope(), item.optString("id"));
                if (!key.isEmpty() && key.equals(item.optString("key"))
                    && WorkbenchReminderPolicy.offsetAllowed(item.optInt("minutes", -1))
                    && item.optLong("start") > 0 && item.optLong("end") > item.optLong("start"))
                    result.add(item);
            }
        } catch (Exception ignored) { }
        return result;
    }
    private void save(List<JSONObject> items) {
        JSONArray list = new JSONArray();
        for (JSONObject item : items) list.put(item);
        if (!prefs.edit().putString("items", list.toString()).commit())
            throw new IllegalStateException("\u672c\u673a\u63d0\u9192\u8bbe\u7f6e\u4fdd\u5b58\u5931\u8d25\uff0c\u8bf7\u91cd\u8bd5");
        updateRestoreReceiver(items);
    }
    private void updateRestoreReceiver(List<JSONObject> items) {
        boolean armed = false;
        for (JSONObject item : items) if ("armed".equals(item.optString("state"))) armed = true;
        context.getPackageManager().setComponentEnabledSetting(
            new ComponentName(context, ScheduleReminderRestoreReceiver.class),
            armed ? PackageManager.COMPONENT_ENABLED_STATE_ENABLED : PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
            PackageManager.DONT_KILL_APP);
    }
    void switchScope(String next) {
        String safe = WorkbenchReminderPolicy.validScope(next) ? next : "";
        if (safe.equals(scope())) return;
        for (JSONObject item : entries()) cancelSystem(item);
        if (!prefs.edit().clear().putString("scope", safe).putString("items", "[]").commit())
            throw new IllegalStateException("\u65e0\u6cd5\u5207\u6362\u672c\u673a\u63d0\u9192\u8303\u56f4");
        updateRestoreReceiver(new ArrayList<>());
    }
    void clear() {
        for (JSONObject item : entries()) cancelSystem(item);
        save(new ArrayList<>());
    }
    void cancel(String id) {
        String key = WorkbenchReminderPolicy.key(scope(), id);
        List<JSONObject> kept = new ArrayList<>();
        for (JSONObject item : entries()) {
            if (key.equals(item.optString("key"))) cancelSystem(item); else kept.add(item);
        }
        save(kept);
    }
    int configuredCount() {
        int count = 0;
        for (JSONObject item : entries()) if ("armed".equals(item.optString("state"))) count++;
        return count;
    }
    int reviewCount() {
        int count = 0;
        for (JSONObject item : entries()) {
            String state = item.optString("state");
            if ("paused".equals(state) || "missed".equals(state) || "blocked".equals(state)) count++;
        }
        return count;
    }
    int offsetFor(String id) {
        String key = WorkbenchReminderPolicy.key(scope(), id);
        for (JSONObject item : entries()) if (key.equals(item.optString("key"))) return item.optInt("minutes", 10);
        return 10;
    }
    String labelFor(String id) {
        String key = WorkbenchReminderPolicy.key(scope(), id);
        for (JSONObject item : entries()) if (key.equals(item.optString("key"))) {
            String state = item.optString("state");
            if ("armed".equals(state)) return notificationsAllowed() ? "\u5df2\u8bbe\u7f6e\uff0c\u7cfb\u7edf\u53ef\u80fd\u5ef6\u8fdf" : "\u5df2\u8bbe\u7f6e\uff0c\u4f46\u901a\u77e5\u6743\u9650\u5173\u95ed";
            if ("handled".equals(state)) return "\u5230\u671f\u5df2\u5904\u7406\uff0c\u4e0d\u4ee3\u8868\u5df2\u67e5\u770b\u901a\u77e5";
            return "\u5df2\u6682\u505c\uff0c\u9700\u8981\u91cd\u65b0\u6838\u5bf9\u8bbe\u7f6e";
        }
        return "\u672a\u8bbe\u7f6e";
    }
    String idForKey(String key, String requestedScope) {
        if (!WorkbenchReminderPolicy.validKey(key) || !scopeCurrent() || !scope().equals(requestedScope)) return "";
        for (JSONObject item : entries()) if (key.equals(item.optString("key"))) return item.optString("id");
        return "";
    }
    boolean notificationsAllowed() {
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(context,
            Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return false;
        if (!NotificationManagerCompat.from(context).areNotificationsEnabled()) return false;
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationManager system = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            NotificationChannel channel = system == null ? null : system.getNotificationChannel(CHANNEL);
            if (channel != null && channel.getImportance() == NotificationManager.IMPORTANCE_NONE) return false;
        }
        return true;
    }
    private void ensureChannel() {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager system = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (system == null) throw new IllegalStateException("\u7cfb\u7edf\u901a\u77e5\u670d\u52a1\u4e0d\u53ef\u7528");
        NotificationChannel channel = new NotificationChannel(CHANNEL, "\u672c\u673a\u65e5\u7a0b\u63d0\u9192", NotificationManager.IMPORTANCE_DEFAULT);
        channel.setDescription("\u4ec5\u7528\u4e8e\u4f60\u4e3b\u52a8\u8bbe\u7f6e\u7684\u666e\u901a\u65e5\u7a0b\u63d0\u9192\uff0c\u7cfb\u7edf\u7701\u7535\u53ef\u80fd\u5bfc\u81f4\u5ef6\u8fdf");
        channel.setLockscreenVisibility(NotificationCompat.VISIBILITY_PRIVATE);
        system.createNotificationChannel(channel);
    }
    private int immutable(int flags) {
        return Build.VERSION.SDK_INT >= 23 ? flags | PendingIntent.FLAG_IMMUTABLE : flags;
    }
    private Intent alarmIntent(JSONObject item) {
        return new Intent(context, ScheduleReminderReceiver.class).setAction(ACTION_FIRE)
            .setData(Uri.parse("workbench-reminder://local/" + item.optString("key")));
    }
    private void cancelSystem(JSONObject item) {
        PendingIntent pending = PendingIntent.getBroadcast(context, 0, alarmIntent(item),
            immutable(PendingIntent.FLAG_NO_CREATE));
        if (pending != null) {
            if (alarms != null) alarms.cancel(pending);
            pending.cancel();
        }
        NotificationManagerCompat.from(context).cancel(item.optString("key"), 0);
    }
    private void arm(JSONObject item) {
        if (alarms == null) throw new IllegalStateException("\u7cfb\u7edf\u63d0\u9192\u670d\u52a1\u4e0d\u53ef\u7528");
        Intent intent = alarmIntent(item).putExtra("token", item.optString("token"));
        PendingIntent pending = PendingIntent.getBroadcast(context, 0, intent,
            immutable(PendingIntent.FLAG_UPDATE_CURRENT));
        if (Build.VERSION.SDK_INT >= 23)
            alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, item.optLong("when"), pending);
        else alarms.set(AlarmManager.RTC_WAKEUP, item.optLong("when"), pending);
    }
    void create(Request request) {
        if (!scopeCurrent() || !scope().equals(request.scope)) throw new IllegalStateException("\u767b\u5f55\u8303\u56f4\u5df2\u6539\u53d8\uff0c\u8bf7\u91cd\u65b0\u8bbe\u7f6e");
        if (!notificationsAllowed()) throw new IllegalStateException("\u901a\u77e5\u6743\u9650\u6216\u65e5\u7a0b\u901a\u77e5\u9891\u9053\u672a\u5f00\u542f");
        WorkbenchReminderPolicy.Candidate candidate = request.candidate();
        Long when = WorkbenchReminderPolicy.trigger(candidate, request.minutes, System.currentTimeMillis());
        String key = WorkbenchReminderPolicy.key(scope(), request.id);
        if (when == null || key.isEmpty()) throw new IllegalStateException("\u8bf7\u9009\u62e9\u672a\u6765\u7684\u6709\u6548\u63d0\u9192\u65f6\u95f4\uff1b\u5df2\u7ed3\u675f\u6216\u672a\u77e5\u72b6\u6001\u7684\u65e5\u7a0b\u4e0d\u80fd\u8bbe\u7f6e");
        ensureChannel();
        List<JSONObject> items = entries();
        boolean replaced = false;
        for (int i = 0; i < items.size(); i++) if (key.equals(items.get(i).optString("key"))) {
            cancelSystem(items.remove(i)); replaced = true; break;
        }
        if (!replaced && items.size() >= WorkbenchReminderPolicy.MAX_REMINDERS)
            throw new IllegalStateException("\u672c\u673a\u6700\u591a\u4fdd\u5b58 64 \u6761\u63d0\u9192\u8bbe\u7f6e\uff0c\u8bf7\u5148\u53d6\u6d88\u4e0d\u518d\u9700\u8981\u7684\u8bbe\u7f6e");
        JSONObject item = new JSONObject();
        put(item, "key", key); put(item, "id", request.id); put(item, "minutes", request.minutes);
        put(item, "start", candidate.start); put(item, "end", candidate.end); put(item, "when", when);
        put(item, "state", "armed"); put(item, "token", UUID.randomUUID().toString());
        items.add(item); save(items);
        try { arm(item); }
        catch (RuntimeException error) {
            cancelSystem(item); put(item, "state", "paused"); save(items);
            throw new IllegalStateException("\u7cfb\u7edf\u672a\u80fd\u5b89\u6392\u63d0\u9192\uff0c\u8bbe\u7f6e\u5df2\u6682\u505c\uff0c\u8bf7\u91cd\u65b0\u6838\u5bf9");
        }
    }
    void reconcile(String confirmedScope, JSONArray schedules) {
        switchScope(confirmedScope);
        if (!scopeCurrent()) { switchScope(""); return; }
        Map<String, WorkbenchReminderPolicy.Candidate> seen = new HashMap<>();
        Set<String> duplicate = new HashSet<>();
        if (schedules != null) for (int i = 0; i < schedules.length(); i++) {
            JSONObject item = schedules.optJSONObject(i); if (item == null) continue;
            WorkbenchReminderPolicy.Candidate candidate = new WorkbenchReminderPolicy.Candidate(item.optString("id"),
                item.optString("startAt"), item.optString("endAt"), item.optString("status"));
            if (seen.containsKey(candidate.id)) duplicate.add(candidate.id);
            seen.put(candidate.id, candidate);
        }
        long now = System.currentTimeMillis();
        List<JSONObject> items = entries();
        for (JSONObject item : items) {
            WorkbenchReminderPolicy.Candidate candidate = seen.get(item.optString("id"));
            if (candidate == null || duplicate.contains(candidate.id) || !WorkbenchReminderPolicy.active(candidate)
                || candidate.end <= now || !notificationsAllowed()) {
                cancelSystem(item);
                if ("armed".equals(item.optString("state"))) put(item, "state", "paused");
                continue;
            }
            if (!"armed".equals(item.optString("state"))) continue;
            if (WorkbenchReminderPolicy.sameTime(candidate, item.optLong("start"), item.optLong("end"))) continue;
            cancelSystem(item);
            Long when = WorkbenchReminderPolicy.trigger(candidate, item.optInt("minutes", -1), now);
            if (when == null) { put(item, "state", "paused"); continue; }
            put(item, "start", candidate.start); put(item, "end", candidate.end); put(item, "when", when);
            put(item, "token", UUID.randomUUID().toString());
            try { arm(item); } catch (RuntimeException error) { cancelSystem(item); put(item, "state", "paused"); }
        }
        save(items);
    }
    void restore() {
        if (!scopeCurrent()) { switchScope(""); return; }
        List<JSONObject> items = entries(); long now = System.currentTimeMillis();
        for (JSONObject item : items) if ("armed".equals(item.optString("state"))) {
            cancelSystem(item);
            if (!WorkbenchReminderPolicy.mayRestore(item.optLong("when"), item.optLong("end"), now, true, notificationsAllowed())) {
                put(item, "state", notificationsAllowed() ? "missed" : "blocked"); continue;
            }
            put(item, "token", UUID.randomUUID().toString());
            try { arm(item); } catch (RuntimeException error) { cancelSystem(item); put(item, "state", "paused"); }
        }
        save(items);
    }
    // Permission and channel are checked immediately before posting; the custom gate is opaque to lint.
    @SuppressLint("MissingPermission")
    void fire(String key, String token) {
        if (!scopeCurrent()) { switchScope(""); return; }
        if (!WorkbenchReminderPolicy.validKey(key)) return;
        List<JSONObject> items = entries();
        for (JSONObject item : items) if (key.equals(item.optString("key"))) {
            long now = System.currentTimeMillis();
            if (!WorkbenchReminderPolicy.mayDeliver(scope(), scope(), item.optString("state"),
                item.optString("token"), token, item.optLong("when"), item.optLong("end"), now)) {
                if ("armed".equals(item.optString("state")) && now >= item.optLong("end")) {
                    put(item, "state", "missed"); save(items);
                }
                return;
            }
            if (!notificationsAllowed()) { put(item, "state", "blocked"); save(items); return; }
            ensureChannel();
            Intent open = new Intent(context, MainActivity.class).setAction(ACTION_OPEN)
                .setData(Uri.parse("workbench-reminder://open/" + key)).putExtra(EXTRA_KEY, key)
                .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            PendingIntent click = PendingIntent.getActivity(context, 0, open, immutable(PendingIntent.FLAG_UPDATE_CURRENT));
            NotificationCompat.Builder notification = new NotificationCompat.Builder(context, CHANNEL)
                .setSmallIcon(R.drawable.ic_schedule_reminder).setContentTitle("\u672c\u673a\u65e5\u7a0b\u63d0\u9192")
                .setContentText("\u4e00\u6761\u672c\u673a\u63d0\u9192\u5df2\u5230\u65f6\u95f4\u3002\u6253\u5f00 App \u767b\u5f55\u6838\u5bf9\uff0c\u901a\u77e5\u4e0d\u5c55\u793a\u65e5\u7a0b\u8be6\u60c5\u3002")
                .setVisibility(NotificationCompat.VISIBILITY_PRIVATE).setCategory(NotificationCompat.CATEGORY_REMINDER)
                .setPriority(NotificationCompat.PRIORITY_DEFAULT).setOnlyAlertOnce(true).setAutoCancel(true).setContentIntent(click);
            put(item, "state", "handled"); save(items);
            try { NotificationManagerCompat.from(context).notify(key, 0, notification.build()); }
            catch (SecurityException error) { put(item, "state", "blocked"); save(items); }
            return;
        }
    }
}
