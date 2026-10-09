package com.richangyu.lifeworkbench;

import android.app.Activity;
import android.app.AlertDialog;
import android.graphics.Color;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.view.Gravity;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.HorizontalScrollView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import org.json.JSONArray;
import org.json.JSONObject;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.TimeZone;

/** Native seven-day read-only calendar. No model requests, writes, or persistent calendar cache. */
final class NativeWeekSheet {
    interface Host {
        String accountScope();
        boolean readsAllowed();
        void onAuthRequired();
        void onClosed();
    }
    private static final String ENDPOINT = "/api/assistant?days=7";
    private final Activity activity;
    private final MobileApiBridge bridge;
    private final Host host;
    private final String scope;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private AlertDialog dialog;
    private TextView status, range, summary;
    private LinearLayout days, timeline;
    private HorizontalScrollView dayScroll;
    private Button refresh;
    private WorkbenchWeekPolicy.Window snapshot;
    private int selectedDay, revision, rawCount;
    private boolean loading, closed;
    private String problem = "";
    private final Runnable staleTick = new Runnable() {
        @Override public void run() {
            if (closed) return;
            if (!sameScope()) { close(); return; }
            updateStatus();
            handler.postDelayed(this, 30000);
        }
    };

    NativeWeekSheet(Activity activity, MobileApiBridge bridge, Host host) {
        this.activity = activity; this.bridge = bridge; this.host = host;
        this.scope = host.accountScope();
    }

    void show() {
        if (closed || dialog != null) return;
        ScrollView scroll = new ScrollView(activity);
        scroll.setFillViewport(true); scroll.setVerticalScrollBarEnabled(false);
        LinearLayout body = NativeUi.column(activity);
        body.setPadding(dp(18), dp(16), dp(18), dp(24));
        body.setBackground(NativeUi.pageBackground());
        TextView heading = label("\u63a5\u4e0b\u6765\uff0c\u6309\u5929\u770b", 24, NativeUi.INK, true);
        heading.setTypeface(NativeUi.DISPLAY);
        body.addView(heading);
        range = label("\u672a\u6765 7 \u5929\u65e5\u7a0b\u603b\u89c8 \u00b7 \u5317\u4eac\u65f6\u95f4", 13, NativeUi.FOREST, false);
        range.setPadding(0, dp(6), 0, dp(10)); body.addView(range);
        body.addView(label("\u53ea\u5c55\u793a\u8bfb\u53d6\u65f6\u523b\u4e4b\u540e\uff08\u542b\u6b63\u5728\u8fdb\u884c\uff09\u7684\u90e8\u5206\u5b89\u6392\uff0c\u4eca\u5929\u5df2\u7ed3\u675f\u7684\u5b89\u6392\u4e0d\u5728\u6b64\u63a5\u53e3\u4e2d\u3002\u6700\u591a\u8bfb\u53d6 40 \u6761\uff0c\u4e0d\u4ee3\u8868\u5b8c\u6574\u65e5\u5386\uff0c\u4e5f\u4e0d\u63a8\u65ad\u7a7a\u95f2\u65f6\u95f4\u3002", 12, NativeUi.MUTED, false));
        refresh = NativeUi.button(activity, "\u5237\u65b0\u65e5\u7a0b", false);
        refresh.setOnClickListener(v -> load());
        body.addView(refresh);
        status = label("", 12, NativeUi.MUTED, false);
        status.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
        status.setPadding(0, dp(2), 0, dp(12)); body.addView(status);
        dayScroll = new HorizontalScrollView(activity);
        dayScroll.setHorizontalScrollBarEnabled(false);
        days = new LinearLayout(activity);
        dayScroll.addView(days, new FrameLayout.LayoutParams(-2, -2));
        body.addView(dayScroll, new LinearLayout.LayoutParams(-1, -2));
        summary = label("", 14, NativeUi.INK, true);
        summary.setPadding(0, dp(16), 0, dp(8)); body.addView(summary);
        timeline = NativeUi.column(activity); body.addView(timeline);
        TextView boundary = label("\u672c\u9875\u53ea\u67e5\u770b\uff0c\u4e0d\u65b0\u589e\u3001\u4fee\u6539\u3001\u6253\u5361\u6216\u81ea\u52a8\u63d0\u4ea4 AI\u3002\u5173\u95ed\u540e\u53ef\u5728\u65e5\u7a0b\u9875\u5b89\u6392\u6216\u4fee\u6539\uff1b\u5df2\u8bfb\u5b89\u6392\u7684\u91cd\u53e0\u63d0\u793a\u4e0d\u4ee3\u8868\u5168\u90e8\u4e91\u7aef\u51b2\u7a81\u3002", 11, NativeUi.MUTED, false);
        boundary.setPadding(0, dp(16), 0, 0); body.addView(boundary);
        scroll.addView(body, new ScrollView.LayoutParams(-1, -2));
        dialog = new AlertDialog.Builder(activity).setView(scroll)
            .setNegativeButton("\u5173\u95ed", (d, which) -> close()).create();
        dialog.setOnDismissListener(d -> close());
        dialog.show();
        Window window = dialog.getWindow();
        if (window != null) window.setLayout(WindowManager.LayoutParams.MATCH_PARENT,
            Math.round(activity.getResources().getDisplayMetrics().heightPixels * 0.86f));
        handler.postDelayed(staleTick, 30000);
        load();
    }

    private int dp(int value) { return NativeUi.dp(activity, value); }
    private TextView label(String text, int size, int color, boolean bold) {
        return NativeUi.label(activity, text, size, color, bold);
    }
    private String date(long value, String pattern) {
        SimpleDateFormat format = new SimpleDateFormat(pattern, Locale.CHINA);
        format.setTimeZone(TimeZone.getTimeZone("Asia/Shanghai"));
        return format.format(new Date(value));
    }
    private boolean sameScope() { return WorkbenchWeekPolicy.scopeMatches(scope, host.accountScope()); }

    private void load() {
        if (closed || loading) return;
        if (!sameScope()) { close(); return; }
        if (!host.readsAllowed()) {
            snapshot = null; problem = "\u8fde\u63a5\u6682\u4e0d\u53ef\u7528\uff0c\u8bf7\u5173\u95ed\u672c\u9875\u540e\u91cd\u65b0\u8bfb\u53d6\u5de5\u4f5c\u53f0\uff0c\u518d\u6253\u5f00\u603b\u89c8\u3002";
            render(); return;
        }
        loading = true; snapshot = null; problem = ""; rawCount = 0;
        final int requestRevision = ++revision;
        render();
        bridge.request(ENDPOINT, null, envelope -> {
            if (closed || requestRevision != revision) return;
            loading = false;
            if (!sameScope()) { close(); return; }
            int code = envelope.optInt("status");
            String type = envelope.optString("type").toLowerCase(Locale.ROOT);
            if (code == 401 || code == 403 || type.contains("text/html")) {
                close(); host.onAuthRequired(); return;
            }
            if (!host.readsAllowed()) {
                snapshot = null; problem = "\u5de5\u4f5c\u53f0\u8fde\u63a5\u72b6\u6001\u5df2\u53d8\u5316\uff0c\u8bf7\u5173\u95ed\u540e\u91cd\u65b0\u8bfb\u53d6\u3002"; render(); return;
            }
            try {
                Uri uri = Uri.parse(envelope.optString("url"));
                if (code < 200 || code >= 300 || !bridge.matchesOrigin(uri)
                    || !"/api/assistant".equals(uri.getPath())
                    || !type.contains("application/json")) throw new IllegalArgumentException("invalid response");
                JSONObject payload = new JSONObject(envelope.optString("body"));
                JSONArray rows = payload.optJSONArray("schedules");
                if (payload.optInt("days") != 7 || !"Asia/Shanghai".equals(payload.optString("timezone"))
                    || rows == null || rows.length() > WorkbenchWeekPolicy.MAX_ROWS)
                    throw new IllegalArgumentException("invalid range");
                List<WorkbenchWeekPolicy.Entry> entries = new ArrayList<>();
                for (int i = 0; i < rows.length(); i++) {
                    JSONObject item = rows.optJSONObject(i);
                    if (item == null || !(item.opt("id") instanceof String)
                        || !(item.opt("title") instanceof String) || !(item.opt("category") instanceof String)
                        || !(item.opt("startAt") instanceof String) || !(item.opt("endAt") instanceof String)) {
                        entries.add(null); continue;
                    }
                    entries.add(new WorkbenchWeekPolicy.Entry(i, item.getString("id"), item.getString("title"),
                        item.getString("category"), item.getString("startAt"), item.getString("endAt")));
                }
                rawCount = rows.length();
                snapshot = new WorkbenchWeekPolicy.Window(entries, System.currentTimeMillis(), SystemClock.elapsedRealtime());
                problem = "";
            } catch (Exception ignored) {
                snapshot = null;
                problem = code == 0 ? "\u8fde\u63a5\u4e2d\u65ad\uff0c\u672a\u80fd\u8bfb\u53d6\u65e5\u7a0b\u3002\u8bf7\u624b\u52a8\u91cd\u8bd5\uff1b\u672c\u9875\u6ca1\u6709\u63d0\u4ea4\u8bb0\u5f55\u3002"
                    : code == 429 ? "\u8bfb\u53d6\u8fc7\u4e8e\u9891\u7e41\uff0c\u8bf7\u7a0d\u540e\u624b\u52a8\u91cd\u8bd5\u3002"
                    : "\u65e5\u7a0b\u672a\u80fd\u8bfb\u53d6\u6216\u683c\u5f0f\u4e0d\u5339\u914d\u3002\u8bf7\u624b\u52a8\u91cd\u8bd5\uff0c\u6216\u5173\u95ed\u540e\u67e5\u770b\u8fde\u63a5\u8bca\u65ad\u3002";
            }
            render();
        });
    }

    private void updateStatus() {
        if (closed || status == null) return;
        refresh.setEnabled(!loading && sameScope() && host.readsAllowed());
        refresh.setText(loading ? "\u6b63\u5728\u8bfb\u53d6\u2026" : "\u5237\u65b0\u65e5\u7a0b");
        if (loading) { status.setText("\u6b63\u5728\u8bfb\u53d6\u5f53\u524d\u8d26\u53f7\u7684\u65e5\u7a0b\uff0c\u5c1a\u4e0d\u80fd\u786e\u8ba4\u6570\u91cf\u3002"); return; }
        if (snapshot == null) { status.setText(problem.isEmpty() ? "\u5c1a\u672a\u8bfb\u53d6\u65e5\u7a0b\u3002" : problem); return; }
        String text = "\u8bfb\u53d6\u4e8e " + date(snapshot.readAt, "M\u6708d\u65e5 HH:mm") + " \u00b7 \u5317\u4eac\u65f6\u95f4\uff1b\u5207\u6362\u65e5\u671f\u4e0d\u8054\u7f51\u3002";
        if (!WorkbenchWeekPolicy.fresh(snapshot, System.currentTimeMillis(), SystemClock.elapsedRealtime()))
            text += "\n\u5feb\u7167\u5df2\u8fc7\u671f\u6216\u8de8\u65e5\uff0c\u8bf7\u624b\u52a8\u5237\u65b0\uff1b\u4ee5\u4e0b\u4ecd\u662f\u4e0a\u6b21\u8bfb\u53d6\u7684\u8303\u56f4\u3002";
        if (rawCount >= WorkbenchWeekPolicy.MAX_ROWS) text += "\n\u5df2\u8fbe\u5230 40 \u6761\u8fd4\u56de\u4e0a\u9650\uff0c\u53ef\u80fd\u8fd8\u6709\u672a\u663e\u793a\u7684\u65e5\u7a0b\u3002";
        if (snapshot.invalidCount > 0 || snapshot.ambiguousCount > 0)
            text += "\n\u8df3\u8fc7\u5f02\u5e38\u6761\u76ee " + snapshot.invalidCount + " \u6761\u3001\u5185\u5bb9\u4e0d\u4e00\u81f4\u7684\u91cd\u590d\u65f6\u6bb5 " + snapshot.ambiguousCount + " \u7ec4\uff0c\u8bf7\u5728\u65e5\u7a0b\u9875\u6838\u5bf9\u3002";
        if (snapshot.duplicateCount > 0) text += "\n\u5b8c\u5168\u76f8\u540c\u7684\u91cd\u590d\u6761\u76ee\u5df2\u5408\u5e76 " + snapshot.duplicateCount + " \u6761\u3002";
        status.setText(text);
    }

    private void render() {
        if (closed || days == null) return;
        updateStatus(); days.removeAllViews(); timeline.removeAllViews();
        if (snapshot == null) {
            range.setText("\u672a\u6765 7 \u5929\u65e5\u7a0b\u603b\u89c8 \u00b7 \u5317\u4eac\u65f6\u95f4");
            summary.setText(loading ? "\u7b49\u5f85\u8bfb\u53d6\u7ed3\u679c" : "\u6ca1\u6709\u53ef\u5c55\u793a\u7684\u5df2\u8bfb\u5feb\u7167");
            timeline.addView(label("\u672a\u8bfb\u53d6\u6210\u529f\u4e0d\u4ee3\u8868\u4e91\u7aef\u6ca1\u6709\u5b89\u6392\u3002", 14, NativeUi.MUTED, false)); return;
        }
        range.setText(date(snapshot.from, "M\u6708d\u65e5") + " \u81f3 "
            + date(WorkbenchWeekPolicy.dayAt(snapshot.from, 6), "M\u6708d\u65e5") + " \u00b7 \u5317\u4eac\u65f6\u95f4");
        final WorkbenchWeekPolicy.Window visible = snapshot;
        for (int i = 0; i < WorkbenchWeekPolicy.DAYS; i++) {
            final int day = i;
            Button button = NativeUi.button(activity,
                date(WorkbenchWeekPolicy.dayAt(visible.from, i), "EEE\nM/d") + "\n" + visible.day(i).size() + " \u6bb5", false);
            boolean selected = i == selectedDay;
            NativeUi.decorateButton(button, selected ? NativeUi.FOREST : NativeUi.MINT,
                selected ? Color.WHITE : NativeUi.FOREST, Color.TRANSPARENT);
            button.setTextSize(13); button.setSelected(selected);
            button.setContentDescription(date(WorkbenchWeekPolicy.dayAt(visible.from, i), "M\u6708d\u65e5 EEEE")
                + "\uff0c\u5df2\u8bfb\u53d6 " + visible.day(i).size() + " \u6bb5" + (selected ? "\uff0c\u5df2\u9009\u4e2d" : ""));
            button.setOnClickListener(v -> {
                if (closed || !sameScope()) { close(); return; }
                selectedDay = day; render();
            });
            int width = activity.getResources().getConfiguration().fontScale > 1.2f ? 104 : 84;
            LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(dp(width), -2);
            params.setMargins(0, 0, dp(6), 0); days.addView(button, params);
        }
        dayScroll.post(() -> {
            if (!closed && days.getChildCount() > selectedDay)
                dayScroll.smoothScrollTo(days.getChildAt(selectedDay).getLeft(), 0);
        });
        List<WorkbenchWeekPolicy.Slice> slices = visible.day(selectedDay);
        Set<Integer> overlaps = visible.overlaps(selectedDay);
        summary.setText(date(WorkbenchWeekPolicy.dayAt(visible.from, selectedDay), "M\u6708d\u65e5 EEEE")
            + " \u00b7 \u5df2\u8bfb\u53d6 " + slices.size() + " \u6bb5");
        timeline.addView(label("\u65f6\u6bb5\u7d2f\u8ba1\u7ea6 " + visible.minutes(selectedDay)
            + " \u5206\u949f\uff1b\u6309\u672c\u65e5\u8fb9\u754c\u622a\u53d6\uff0c\u91cd\u53e0\u4e0d\u53bb\u91cd\uff0c\u4e0d\u4ee3\u8868\u7a7a\u95f2\u6216\u5b9e\u9645\u5b8c\u6210\u65f6\u957f\u3002", 11, NativeUi.MUTED, false));
        if (!overlaps.isEmpty()) {
            TextView warning = label("\u5df2\u8bfb\u6761\u76ee\u4e2d\u6709 " + overlaps.size() + " \u6bb5\u65f6\u95f4\u91cd\u53e0\uff0c\u8bf7\u5230\u65e5\u7a0b\u9875\u6838\u5bf9\u3002", 12, NativeUi.ROSE, true);
            warning.setPadding(0, dp(10), 0, dp(6)); timeline.addView(warning);
        }
        if (slices.isEmpty()) {
            TextView empty = label("\u672c\u6b21\u8bfb\u53d6\u6ca1\u6709\u8fd9\u4e2a\u65e5\u671f\u7684\u5b89\u6392\uff0c\u4e0d\u4ee3\u8868\u8fd9\u4e00\u5929\u5b8c\u5168\u7a7a\u95f2\u3002", 15, NativeUi.MUTED, false);
            empty.setPadding(0, dp(22), 0, dp(18)); timeline.addView(empty);
        } else for (WorkbenchWeekPolicy.Slice slice : slices) addSlice(slice, overlaps.contains(slice.entry.sourceIndex));
    }

    private void addSlice(WorkbenchWeekPolicy.Slice slice, boolean overlaps) {
        LinearLayout row = NativeUi.column(activity);
        row.setPadding(dp(14), dp(12), dp(14), dp(12));
        row.setBackground(NativeUi.shape(activity, Color.WHITE, 16,
            overlaps ? NativeUi.ROSE : NativeUi.BORDER));
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, -2);
        params.setMargins(0, dp(10), 0, 0); timeline.addView(row, params);
        TextView time = label(date(slice.start, "HH:mm") + " - "
            + (slice.end == WorkbenchWeekPolicy.dayAt(snapshot.from, selectedDay + 1) ? "24:00" : date(slice.end, "HH:mm")),
            15, NativeUi.FOREST, true);
        row.addView(time);
        TextView title = label(slice.entry.title, 17, NativeUi.INK, true);
        title.setPadding(0, dp(6), 0, dp(4)); title.setTextIsSelectable(true); row.addView(title);
        String detail = slice.entry.category.isEmpty() ? "\u65e5\u7a0b" : slice.entry.category;
        if (slice.carryIn || slice.carryOut) detail += " \u00b7 \u8de8\u65e5\u5b89\u6392";
        if (overlaps) detail += " \u00b7 \u5df2\u8bfb\u6761\u76ee\u91cd\u53e0";
        row.addView(label(detail, 12, overlaps ? NativeUi.ROSE : NativeUi.MUTED, false));
        if (slice.carryIn || slice.carryOut) {
            row.addView(label("\u539f\u59cb\u65f6\u6bb5\uff1a" + date(slice.entry.start, "M\u6708d\u65e5 HH:mm") + " - "
                + date(slice.entry.end, "M\u6708d\u65e5 HH:mm"), 11, NativeUi.MUTED, false));
        }
    }

    void close() {
        if (closed) return;
        closed = true; loading = false; revision++;
        handler.removeCallbacks(staleTick); snapshot = null;
        if (timeline != null) timeline.removeAllViews();
        if (days != null) days.removeAllViews();
        if (status != null) status.setText("");
        if (summary != null) summary.setText("");
        if (range != null) range.setText("");
        if (dialog != null && dialog.isShowing()) dialog.dismiss();
        host.onClosed();
    }
}
