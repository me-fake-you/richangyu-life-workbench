package com.richangyu.lifeworkbench;

import android.app.AlertDialog;
import android.graphics.Color;
import android.text.Editable;
import android.text.TextWatcher;
import android.widget.Button;
import android.widget.EditText;
import android.widget.HorizontalScrollView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import androidx.appcompat.app.AppCompatActivity;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.ArrayList;
import java.util.List;

/** Native read-only task viewer. No mutations, local cache, or external navigation. */
final class NativeTaskSheet {
    interface Host {
        String accountScope();
        boolean readsAllowed();
        void onAuthRequired();
        void onClosed();
    }
    private final AppCompatActivity activity;
    private final MobileApiBridge bridge;
    private final String origin, expectedScope;
    private final Host host;
    private AlertDialog dialog, details;
    private LinearLayout rows;
    private TextView state, count;
    private Button refresh;
    private final List<WorkbenchTaskPolicy.Entry> entries = new ArrayList<>();
    private String query = "", scope = WorkbenchTaskPolicy.ALL;
    private boolean closed, busy, loaded, truncated;
    private int generation;
    NativeTaskSheet(AppCompatActivity activity, MobileApiBridge bridge, String origin, Host host) {
        this.activity = activity; this.bridge = bridge; this.origin = origin; this.host = host;
        this.expectedScope = host.accountScope();
    }
    private int dp(int value) { return NativeUi.dp(activity, value); }
    private boolean allowed() {
        return !closed && WorkbenchTaskPolicy.readAllowed(expectedScope, host.accountScope(), host.readsAllowed());
    }
    void show() {
        LinearLayout body = NativeUi.column(activity);
        body.setPadding(dp(20), dp(8), dp(20), dp(20));
        body.addView(NativeUi.label(activity, "把事情看清楚，再安排今天", 21, NativeUi.INK, true));
        body.addView(NativeUi.label(activity,
            "查看和筛选云端任务。此页只读，编辑任务、安排任务日程与目标管理仍在网页版。", 13, NativeUi.MUTED, false));
        EditText search = new EditText(activity); NativeUi.styleInput(search);
        search.setSingleLine(true); search.setHint("搜索标题、说明、项目或优先级");
        search.setContentDescription("搜索本次已读取的任务");
        LinearLayout.LayoutParams searchParams = new LinearLayout.LayoutParams(-1, -2);
        searchParams.setMargins(0, dp(14), 0, dp(10)); body.addView(search, searchParams);
        HorizontalScrollView scroller = new HorizontalScrollView(activity);
        scroller.setHorizontalScrollBarEnabled(false);
        LinearLayout filters = new LinearLayout(activity);
        final String[] scopes = { WorkbenchTaskPolicy.ALL, WorkbenchTaskPolicy.PENDING, WorkbenchTaskPolicy.TODAY,
            WorkbenchTaskPolicy.OVERDUE, WorkbenchTaskPolicy.DONE };
        List<Button> buttons = new ArrayList<>();
        for (String value : scopes) {
            Button button = NativeUi.button(activity, value, false);
            LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-2, -2);
            params.setMargins(0, 0, dp(8), 0); filters.addView(button, params); buttons.add(button);
            button.setOnClickListener(v -> {
                scope = value;
                for (int i = 0; i < buttons.size(); i++) {
                    boolean selected = scopes[i].equals(scope);
                    buttons.get(i).setSelected(selected);
                    NativeUi.decorateButton(buttons.get(i), selected ? NativeUi.MINT : Color.WHITE,
                        NativeUi.INK, NativeUi.BORDER);
                }
                render();
            });
        }
        buttons.get(0).setSelected(true);
        NativeUi.decorateButton(buttons.get(0), NativeUi.MINT, NativeUi.INK, NativeUi.BORDER);
        scroller.addView(filters); body.addView(scroller);
        state = NativeUi.label(activity, "尚未读取任务", 13, NativeUi.MUTED, false); body.addView(state);
        count = NativeUi.label(activity, "", 13, NativeUi.FOREST, true); body.addView(count);
        rows = NativeUi.column(activity); body.addView(rows);
        search.addTextChangedListener(new TextWatcher() {
            @Override public void beforeTextChanged(CharSequence s, int start, int count, int after) {}
            @Override public void onTextChanged(CharSequence s, int start, int before, int count) {
                query = s.toString(); render();
            }
            @Override public void afterTextChanged(Editable value) {}
        });
        ScrollView scroll = new ScrollView(activity); scroll.setFillViewport(true); scroll.addView(body);
        dialog = new AlertDialog.Builder(activity).setTitle("任务中心").setView(scroll)
            .setNegativeButton("关闭", (d, which) -> close()).setPositiveButton("重新读取", null).create();
        dialog.setOnDismissListener(d -> close());
        dialog.setOnShowListener(d -> {
            refresh = dialog.getButton(AlertDialog.BUTTON_POSITIVE);
            refresh.setOnClickListener(v -> load()); load();
        });
        dialog.show();
    }
    private void load() {
        if (busy) return;
        if (!allowed()) { close(); return; }
        busy = true; loaded = false; entries.clear(); truncated = false;
        refresh.setEnabled(false); state.setText("正在读取云端任务…"); state.setTextColor(NativeUi.MUTED); render();
        final int request = ++generation;
        bridge.request("/api/mobile-tasks", null, envelope -> {
            if (closed || request != generation) return;
            busy = false; refresh.setEnabled(true);
            if (!allowed()) { entries.clear(); close(); return; }
            int status = envelope.optInt("status");
            String type = envelope.optString("type"), url = envelope.optString("url");
            if (status == 401 || status == 403 || type.contains("text/html")) {
                close(); host.onAuthRequired(); return;
            }
            if (!WorkbenchTaskPolicy.validResponse(status, type, url, origin)) {
                state.setText(status == 404 ? "这个工作台还没有任务读取接口，请先更新工作台服务。"
                    : "任务未读取成功，不代表没有任务。请检查连接后重新读取。");
                state.setTextColor(NativeUi.ROSE); render(); return;
            }
            try {
                JSONObject payload = new JSONObject(envelope.optString("body"));
                JSONObject user = payload.optJSONObject("user");
                JSONArray tasks = payload.optJSONArray("tasks");
                if (payload.optInt("schemaVersion") != 1 || !payload.optBoolean("readOnly") ||
                    user == null || tasks == null || tasks.length() > WorkbenchTaskPolicy.LIMIT ||
                    !expectedScope.equals(WorkbenchOperationPolicy.scope(origin, user.optString("email")))) {
                    throw new IllegalArgumentException("Task identity or schema mismatch");
                }
                List<WorkbenchTaskPolicy.Entry> parsed = new ArrayList<>();
                for (int i = 0; i < tasks.length(); i++) {
                    JSONObject task = tasks.getJSONObject(i);
                    if (task.optString("id").isEmpty() || task.optString("title").isEmpty())
                        throw new IllegalArgumentException("Invalid task");
                    parsed.add(new WorkbenchTaskPolicy.Entry(task.optString("id"), task.optString("title"),
                        task.optString("description"), task.optString("status"), task.optString("priority"),
                        task.optString("due_at"), task.optString("project_title"), task.optInt("planned_minutes"),
                        task.optInt("actual_minutes"), task.optInt("today_rank")));
                }
                entries.addAll(parsed); loaded = true; truncated = payload.optBoolean("truncated");
                String at = payload.optString("readAt");
                state.setText("读取成功：" + (at.isEmpty() ? "刚刚" : WorkbenchTaskPolicy.dueLabel(at).replace("截止 ", ""))
                    + (truncated ? "\n只显示排序后的前 100 项，其余任务仍需在网页版查看。" : "")
                    + "\n此页不缓存离线数据，也不会修改任务。");
                state.setTextColor(NativeUi.MUTED); render();
            } catch (Exception ignored) {
                entries.clear(); loaded = false;
                state.setText("任务数据或账号校验未通过，未显示结果。请重新连接工作台。");
                state.setTextColor(NativeUi.ROSE); render();
            }
        });
    }
    private void render() {
        if (rows == null || closed) return;
        rows.removeAllViews();
        if (!loaded) { count.setText(""); return; }
        List<WorkbenchTaskPolicy.Entry> matches = WorkbenchTaskPolicy.filter(entries, query, scope, System.currentTimeMillis());
        count.setText("本次读取 " + entries.size() + " 项，筛选显示 " + matches.size() + " 项");
        if (matches.isEmpty()) {
            rows.addView(NativeUi.label(activity, entries.isEmpty() ? "这次读取没有任务。"
                : "没有匹配项，可以切回“全部”或清空搜索。", 15, NativeUi.MUTED, false)); return;
        }
        for (WorkbenchTaskPolicy.Entry entry : matches) {
            LinearLayout row = NativeUi.column(activity);
            row.setPadding(dp(16), dp(16), dp(16), dp(16));
            row.setBackground(NativeUi.touch(activity, Color.WHITE, 18, NativeUi.BORDER));
            LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, -2);
            params.setMargins(0, dp(10), 0, 0); row.setLayoutParams(params);
            row.addView(NativeUi.label(activity, entry.title, 18, NativeUi.INK, true));
            row.addView(NativeUi.label(activity, entry.status + " / " + entry.priority
                + (entry.todayRank >= 1 && entry.todayRank <= 3 ? " / 今日重点 " + entry.todayRank : ""),
                13, NativeUi.FOREST, false));
            row.addView(NativeUi.label(activity, WorkbenchTaskPolicy.dueLabel(entry.dueAt), 13,
                WorkbenchTaskPolicy.overdue(entry, System.currentTimeMillis()) ? NativeUi.ROSE : NativeUi.MUTED, false));
            if (!entry.project.isEmpty()) row.addView(NativeUi.label(activity, "项目：" + entry.project, 13, NativeUi.MUTED, false));
            row.setFocusable(true); row.setClickable(true);
            row.setContentDescription(entry.title + "，" + entry.status + "，点击查看任务详情");
            row.setOnClickListener(v -> showDetails(entry)); rows.addView(row);
        }
    }
    private void showDetails(WorkbenchTaskPolicy.Entry entry) {
        if (!allowed()) { close(); return; }
        details = new AlertDialog.Builder(activity).setTitle(entry.title)
            .setMessage(entry.status + " / " + entry.priority + "\n" + WorkbenchTaskPolicy.dueLabel(entry.dueAt)
                + "\n项目：" + (entry.project.isEmpty() ? "未指定" : entry.project)
                + "\n预计 " + entry.plannedMinutes + " 分钟，实际 " + entry.actualMinutes + " 分钟"
                + "\n\n" + (entry.description.isEmpty() ? "没有任务说明。" : entry.description)
                + "\n\n只读预览：不会更改任务状态、财务数据或日程。")
            .setPositiveButton("返回任务列表", null).create();
        details.show();
    }
    void close() {
        if (closed) return;
        closed = true; generation++; entries.clear();
        if (details != null) details.dismiss();
        if (dialog != null && dialog.isShowing()) dialog.dismiss();
        host.onClosed();
    }
}
