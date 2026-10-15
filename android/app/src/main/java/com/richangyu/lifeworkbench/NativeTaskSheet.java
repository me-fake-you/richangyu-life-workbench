package com.richangyu.lifeworkbench;

import android.app.AlertDialog;
import android.app.Dialog;
import android.app.DatePickerDialog;
import android.app.TimePickerDialog;
import android.text.InputFilter;
import android.text.InputType;
import android.widget.ArrayAdapter;
import android.widget.Spinner;
import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;
import java.util.UUID;
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

/** Native tasks with explicit submission, durable uncertain-save recovery and no automatic replay. */
final class NativeTaskSheet {
    interface Host {
        String accountScope();
        boolean readsAllowed();
        boolean writesBlocked();
        void onSaved();
        void onAuthRequired();
        void onClosed();
    }
    private final AppCompatActivity activity;
    private final MobileApiBridge bridge;
    private final String origin, expectedScope;
    private final Host host;
    private AlertDialog dialog, details;
    private Dialog picker;
    private final NativeTaskWriteStore submissions;
    private LinearLayout pendingBox;
    private Button create;
    private String account = "", lastOutcome = "";
    private boolean taskActions;
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
        this.submissions = new NativeTaskWriteStore(activity, expectedScope);
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
            "新增、编辑或完成云端任务，需要明确确认；关联日程、工时和财务不会跟着自动改写。目标总览已在App内提供，完整目标编辑仍在网页版。", 13, NativeUi.MUTED, false));
        create = NativeUi.button(activity, "新增任务", true);
        create.setOnClickListener(v -> edit(null)); body.addView(create);
        pendingBox = NativeUi.column(activity); body.addView(pendingBox);
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
        busy = true; loaded = false; taskActions = false; entries.clear(); truncated = false;
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
                account = user.optString("email"); taskActions = payload.optBoolean("taskActions");
                List<WorkbenchTaskPolicy.Entry> parsed = new ArrayList<>();
                for (int i = 0; i < tasks.length(); i++) {
                    JSONObject task = tasks.getJSONObject(i);
                    if (task.optString("id").isEmpty() || task.optString("title").isEmpty())
                        throw new IllegalArgumentException("Invalid task");
                    parsed.add(new WorkbenchTaskPolicy.Entry(task.optString("id"), task.optString("title"),
                        task.optString("description"), task.optString("status"), task.optString("priority"),
                        task.optString("due_at"), task.optString("project_title"), task.optInt("planned_minutes"),
                        task.optInt("actual_minutes"), task.optInt("today_rank"), task.optString("revision")));
                }
                entries.addAll(parsed); loaded = true; truncated = payload.optBoolean("truncated");
                String at = payload.optString("readAt");
                state.setText("读取成功：" + (at.isEmpty() ? "刚刚" : WorkbenchTaskPolicy.dueLabel(at).replace("截止 ", ""))
                    + (truncated ? "\n只显示排序后的前 100 项，其余任务仍需在网页版查看。" : "")
                    + (taskActions ? "\n支持确认保存任务；不缓存离线列表。" : "\n服务暂不支持任务编辑，请先升级工作台。"));
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
        renderPending(); create.setEnabled(canWrite());
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
                + "\n\n只修改任务本身；不会更改关联日程、工时或财务。")
            .setPositiveButton("返回任务列表", null).setNeutralButton("编辑", null)
            .setNegativeButton("标记完成", null).create();
        details.setOnShowListener(d -> {
            boolean editable = canWrite() && WorkbenchTaskWritePolicy.revision(entry.revision);
            details.getButton(AlertDialog.BUTTON_NEUTRAL).setEnabled(editable);
            details.getButton(AlertDialog.BUTTON_NEGATIVE).setEnabled(editable &&
                !"已完成".equals(entry.status) && !"已取消".equals(entry.status));
            details.getButton(AlertDialog.BUTTON_NEUTRAL).setOnClickListener(v -> {
                details.dismiss(); edit(entry);
            });
            details.getButton(AlertDialog.BUTTON_NEGATIVE).setOnClickListener(v -> {
                details.dismiss();
                details = new AlertDialog.Builder(activity).setTitle("确认完成任务？")
                    .setMessage(entry.title + "\n只标记这条任务，不自动结束日程、工时或产生收入。")
                    .setNegativeButton("暂不完成", null).setPositiveButton("确认完成", (d2, w) -> {
                        try {
                            submit("task.complete", new JSONObject().put("id", entry.id).put("expectedRevision", entry.revision));
                        } catch (Exception ignored) { tell("未能准备任务提交，本次未发送。"); }
                    }).create();
                details.show();
            });
        });
        details.show();
    }
    private boolean canWrite() {
        return allowed() && loaded && taskActions && !busy && !host.writesBlocked() && !submissions.hasPending() && !account.isEmpty();
    }
    private void tell(String value) {
        state.setText(value); state.setTextColor(NativeUi.ROSE);
    }
    private void renderPending() {
        if (pendingBox == null) return;
        pendingBox.removeAllViews();
        if (!submissions.hasPending()) return;
        pendingBox.addView(NativeUi.label(activity, "上次提交待核对", 16, NativeUi.INK, true));
        pendingBox.addView(NativeUi.label(activity, lastOutcome.isEmpty()
            ? "不会自动重发。请核对结果后，再新增或编辑任务。提交内容保存在本机应用空间。"
            : lastOutcome, 13, NativeUi.MUTED, false));
        JSONObject original = submissions.read();
        if (original == null || !expectedScope.equals(WorkbenchOperationPolicy.scope(origin, original.optString("expectedAccount")))) {
            pendingBox.addView(NativeUi.label(activity, "本机提交记录校验失败，已暂停写入。请保留应用数据并联系维护者，不要卸载重装。", 13, NativeUi.ROSE, false));
            return;
        }
        for (String value : new String[] {"核对上次提交", "重试同一请求", "放弃这次提交"}) {
            Button button = NativeUi.button(activity, value, false);
            button.setEnabled(allowed() && !busy && !host.writesBlocked());
            button.setOnClickListener(v -> {
                String action = "核对上次提交".equals(value) ? "task.status" :
                    "放弃这次提交".equals(value) ? "task.discard" : original.optString("action");
                if ("task.status".equals(action)) { send(original, action); return; }
                details = new AlertDialog.Builder(activity).setTitle(value)
                    .setMessage("task.discard".equals(action)
                        ? "服务端会阻止这笔未完成提交继续保存。如果它已经保存，会返回原结果，不会撤销已保存的任务。"
                        : "使用原提交编号和原内容重试，不生成第二笔任务。")
                    .setNegativeButton("返回", null).setPositiveButton("确认", (d, w) -> send(original, action)).create();
                details.show();
            });
            pendingBox.addView(button);
        }
    }
    private EditText input(String hint, String value, int max, boolean single) {
        EditText view = new EditText(activity); NativeUi.styleInput(view);
        view.setHint(hint); view.setText(value); view.setSingleLine(single);
        view.setFilters(new InputFilter[] {new InputFilter.LengthFilter(max)});
        return view;
    }
    private Spinner choice(String[] values, String selected) {
        Spinner spinner = new Spinner(activity);
        spinner.setAdapter(new ArrayAdapter<>(activity, android.R.layout.simple_spinner_dropdown_item, values));
        for (int i = 0; i < values.length; i++) if (values[i].equals(selected)) spinner.setSelection(i);
        return spinner;
    }
    private void edit(WorkbenchTaskPolicy.Entry entry) {
        if (!canWrite()) return;
        String[] statuses = {"收件箱", "下一步", "进行中", "已完成", "已取消"};
        if (entry != null) {
            boolean known = false;
            for (String value : statuses) if (value.equals(entry.status)) known = true;
            if (!known || !WorkbenchTaskWritePolicy.revision(entry.revision)) {
                tell("这条任务的状态或版本暂不支持手机编辑，请先在网页版处理。"); return;
            }
        }
        LinearLayout form = NativeUi.column(activity); form.setPadding(dp(20), dp(8), dp(20), dp(16));
        EditText title = input("任务标题", entry == null ? "" : entry.title, 200, true);
        EditText note = input("任务说明", entry == null ? "" : entry.description, 5000, false);
        EditText minutes = input("预计分钟（1–14400）",
            entry == null ? "25" : Integer.toString(entry.plannedMinutes), 5, true);
        minutes.setInputType(InputType.TYPE_CLASS_NUMBER);
        form.addView(title); form.addView(note);
        form.addView(NativeUi.label(activity, "状态", 13, NativeUi.MUTED, true));
        Spinner status = choice(statuses, entry == null ? "下一步" : entry.status); form.addView(status);
        form.addView(NativeUi.label(activity, "优先级", 13, NativeUi.MUTED, true));
        Spinner priority = choice(new String[] {"P0", "P1", "P2", "P3"}, entry == null ? "P2" : entry.priority);
        form.addView(priority); form.addView(minutes);
        final long[] due = {entry == null ? 0 : WorkbenchTaskPolicy.timestamp(entry.dueAt)};
        final boolean[] validDue = {entry == null || entry.dueAt.isEmpty() || due[0] > 0};
        Button deadline = NativeUi.button(activity, entry == null ? "设置截止时间（北京时间）" :
            WorkbenchTaskPolicy.dueLabel(entry.dueAt), false); form.addView(deadline);
        Button clearDue = NativeUi.button(activity, "清除截止时间", false); form.addView(clearDue);
        clearDue.setOnClickListener(v -> { due[0] = 0; validDue[0] = true; deadline.setText("未设置截止时间"); });
        deadline.setOnClickListener(v -> {
            if (!canWrite()) return;
            Calendar selected = Calendar.getInstance(TimeZone.getTimeZone("Asia/Shanghai"));
            selected.setTimeInMillis(due[0] > 0 ? due[0] : System.currentTimeMillis());
            DatePickerDialog date = new DatePickerDialog(activity, (view, year, month, day) -> {
                if (!canWrite()) return;
                selected.set(Calendar.YEAR, year); selected.set(Calendar.MONTH, month); selected.set(Calendar.DAY_OF_MONTH, day);
                TimePickerDialog time = new TimePickerDialog(activity, (view2, hour, minute) -> {
                    if (!canWrite()) return;
                    selected.set(Calendar.HOUR_OF_DAY, hour); selected.set(Calendar.MINUTE, minute);
                    selected.set(Calendar.SECOND, 0); selected.set(Calendar.MILLISECOND, 0);
                    due[0] = selected.getTimeInMillis(); validDue[0] = true;
                    deadline.setText(WorkbenchTaskPolicy.dueLabel(iso(due[0])));
                }, selected.get(Calendar.HOUR_OF_DAY), selected.get(Calendar.MINUTE), true);
                time.setTitle("截止时间（北京时间）"); picker = time; time.show();
            }, selected.get(Calendar.YEAR), selected.get(Calendar.MONTH), selected.get(Calendar.DAY_OF_MONTH));
            date.setTitle("截止日期（北京时间）"); picker = date; date.show();
        });
        form.addView(NativeUi.label(activity, "只修改任务本身，不自动改写关联日程、工时或财务。", 13, NativeUi.MUTED, false));
        ScrollView scroll = new ScrollView(activity); scroll.addView(form);
        details = new AlertDialog.Builder(activity).setTitle(entry == null ? "新增任务" : "编辑任务")
            .setView(scroll).setNegativeButton("返回", null).setPositiveButton("确认保存", null).create();
        details.setOnShowListener(d -> details.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v -> {
            if (!canWrite()) return;
            if (title.getText().toString().trim().isEmpty()) { title.setError("请填写任务标题"); return; }
            int planned;
            try { planned = Integer.parseInt(minutes.getText().toString()); }
            catch (Exception ignored) { minutes.setError("请输入有效分钟"); return; }
            if (planned < 1 || planned > 14400) { minutes.setError("请输入 1–14400 分钟"); return; }
            if (!validDue[0]) { tell("原截止时间无法识别，请重新选择或清除。"); return; }
            try {
                JSONObject payload = new JSONObject().put("title", title.getText().toString().trim())
                    .put("description", note.getText().toString()).put("status", status.getSelectedItem().toString())
                    .put("priority", priority.getSelectedItem().toString()).put("plannedMinutes", planned)
                    .put("dueAt", due[0] == 0 ? JSONObject.NULL : iso(due[0]));
                if (entry != null) payload.put("id", entry.id).put("expectedRevision", entry.revision);
                if (submit(entry == null ? "task.create" : "task.update", payload)) details.dismiss();
            } catch (Exception ignored) { tell("未能准备任务提交，本次未发送。"); }
        }));
        details.show();
    }
    private String iso(long time) {
        SimpleDateFormat format = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
        format.setTimeZone(TimeZone.getTimeZone("UTC")); return format.format(new Date(time));
    }
    private boolean submit(String action, JSONObject payload) {
        if (!canWrite()) return false;
        try {
            JSONObject original = new JSONObject().put("requestId", UUID.randomUUID().toString())
                .put("action", action).put("payload", payload).put("expectedAccount", account);
            if (!submissions.save(original)) { tell("本机提交记录未安全保存，本次没有发送。"); render(); return false; }
            send(original, action); return true;
        } catch (Exception ignored) { tell("未能准备提交，本次未发送。"); return false; }
    }
    private void send(JSONObject original, String action) {
        if (!allowed() || busy || host.writesBlocked() || !submissions.hasPending()) return;
        if (!expectedScope.equals(WorkbenchOperationPolicy.scope(origin, original.optString("expectedAccount")))) return;
        try {
            boolean control = "task.status".equals(action) || "task.discard".equals(action);
            JSONObject command = new JSONObject(original.toString());
            if (control) command.put("action", action).put("payload", new JSONObject()
                .put("action", original.getString("action")).put("payload", original.getJSONObject("payload")));
            busy = true; refresh.setEnabled(false); render();
            final int request = ++generation;
            bridge.request("/api/mobile-task-actions", command, envelope -> {
                if (closed || request != generation) return;
                busy = false; refresh.setEnabled(true);
                if (!allowed()) { close(); return; }
                int code = envelope.optInt("status");
                String type = envelope.optString("type");
                if (code == 401 || code == 403 || type.contains("text/html")) {
                    close(); host.onAuthRequired(); return;
                }
                if (!WorkbenchTaskWritePolicy.validResponse(code, type, envelope.optString("url"), origin)) {
                    lastOutcome = code == 409 ? "任务或账号已变化，未覆盖新内容。请重新读取，再核对或放弃原提交。"
                        : "没有收到确定结果，原提交仍保留。请核对或手动重试同一请求。";
                    render(); return;
                }
                try {
                    JSONObject result = new JSONObject(envelope.optString("body"));
                    JSONObject user = result.optJSONObject("user");
                    String target = "task.create".equals(original.optString("action"))
                        ? "mobile-" + original.optString("requestId") : original.getJSONObject("payload").optString("id");
                    String outcome = result.optString("state");
                    if (user == null || !expectedScope.equals(WorkbenchOperationPolicy.scope(origin, user.optString("email"))) ||
                        !WorkbenchTaskWritePolicy.resultMatches(result.optString("requestId"), result.optString("taskAction"),
                            result.optString("id"), outcome, original.optString("requestId"), original.optString("action"),
                            target, "task.status".equals(action))) throw new IllegalArgumentException("Task receipt mismatch");
                    if ("not-confirmed".equals(outcome)) {
                        lastOutcome = "目前未查到回执，不代表提交一定失败。可重试同一请求，或确认放弃；不会自动重发。";
                        render(); return;
                    }
                    if (!submissions.clear(original.optString("requestId"))) {
                        lastOutcome = "服务已返回结果，但本机记录未清除。请再次核对同一笔提交，不要卸载应用。"; render(); return;
                    }
                    lastOutcome = "";
                    if ("applied".equals(outcome)) host.onSaved();
                    tell("applied".equals(outcome) ? "任务已确认保存，正在重新读取。" : "原提交已安全放弃，没有撤销已保存的数据。");
                    load();
                } catch (Exception ignored) {
                    lastOutcome = "回执或账号校验失败，已保留原提交，请重新连接后核对。"; render();
                }
            });
        } catch (Exception ignored) {
            busy = false; refresh.setEnabled(true);
            lastOutcome = "请求未能确认，原提交仍保留。"; render();
        }
    }
    void close() {
        if (closed) return;
        closed = true; generation++; entries.clear();
        if (picker != null) picker.dismiss();
        if (details != null) details.dismiss();
        if (dialog != null && dialog.isShowing()) dialog.dismiss();
        host.onClosed();
    }
}
