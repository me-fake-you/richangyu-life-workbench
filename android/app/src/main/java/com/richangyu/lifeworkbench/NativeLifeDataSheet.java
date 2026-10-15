package com.richangyu.lifeworkbench;

import android.app.AlertDialog;
import android.app.DatePickerDialog;
import android.app.Dialog;
import android.app.TimePickerDialog;
import android.graphics.Color;
import android.text.InputFilter;
import android.text.InputType;
import android.view.WindowManager;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.Spinner;
import android.widget.TextView;
import androidx.appcompat.app.AppCompatActivity;
import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;
import java.util.UUID;
import org.json.JSONArray;
import org.json.JSONObject;

/** Native finance, goal and review projections. Financial writes are explicit and receipt-scoped. */
final class NativeLifeDataSheet {
    interface Host {
        String accountScope();
        boolean readsAllowed();
        boolean writesBlocked();
        void onSaved();
        void onAuthRequired();
        void onClosed();
        void onManage(String section);
    }
    private final AppCompatActivity activity;
    private final MobileApiBridge bridge;
    private final Host host;
    private final String origin, scope, kind;
    private final NativeLedgerWriteStore submissions;
    private AlertDialog dialog, editor, confirmation, detail;
    private Dialog picker;
    private LinearLayout results, pending;
    private TextView state, range;
    private Button refresh, create, previous, next, reveal;
    private JSONObject snapshot;
    private String account = "", month, lastOutcome = "";
    private int page, days = 7, generation;
    private boolean busy, closed, masked = true, secureWasSet;
    NativeLifeDataSheet(AppCompatActivity activity, MobileApiBridge bridge, String origin, String kind, Host host) {
        this.activity = activity; this.bridge = bridge; this.origin = origin; this.kind = kind; this.host = host;
        scope = host.accountScope(); month = WorkbenchDashboardPolicy.month(System.currentTimeMillis());
        submissions = new NativeLedgerWriteStore(activity, scope);
    }
    private int dp(int value) { return NativeUi.dp(activity, value); }
    private boolean allowed() {
        return !closed && scope.matches("[0-9a-f]{64}") && scope.equals(host.accountScope()) && host.readsAllowed();
    }
    private boolean finance() { return "finance".equals(kind); }
    private String endpoint() {
        if (finance()) return "/api/mobile-dashboard?kind=finance&month=" + month + "&page=" + page;
        return "goals".equals(kind) ? "/api/mobile-dashboard?kind=goals" : "/api/mobile-dashboard?kind=review&days=" + days;
    }
    void show() {
        if (finance()) {
            secureWasSet = (activity.getWindow().getAttributes().flags & WindowManager.LayoutParams.FLAG_SECURE) != 0;
            activity.getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
        }
        LinearLayout body = NativeUi.column(activity); body.setPadding(dp(20), dp(8), dp(20), dp(20));
        TextView title = NativeUi.label(activity, finance() ? "收支清楚，心里有数" :
            "goals".equals(kind) ? "朝想去的方向，走一点" : "回头看见自己的脚步", 25, NativeUi.INK, true);
        title.setTypeface(NativeUi.DISPLAY); body.addView(title);
        range = NativeUi.label(activity, "", 14, NativeUi.FOREST, true); range.setPadding(0, dp(12), 0, dp(10)); body.addView(range);
        if (finance()) {
            Button choose = NativeUi.button(activity, "选择账本月份", false);
            choose.setOnClickListener(v -> chooseMonth()); body.addView(choose);
            reveal = NativeUi.button(activity, "显示金额与账目详情", false);
            reveal.setOnClickListener(v -> { masked = !masked; render(); }); body.addView(reveal);
            create = NativeUi.button(activity, "记一笔收入 / 支出", true);
            create.setOnClickListener(v -> edit()); body.addView(create);
            pending = NativeUi.column(activity); body.addView(pending);
        } else if ("review".equals(kind)) {
            for (int value : new int[] {7, 30, 90}) {
                Button button = NativeUi.button(activity, "最近 " + value + " 天", false);
                button.setOnClickListener(v -> { if (!busy) { days = value; load(); } }); body.addView(button);
            }
        }
        if (finance() || "goals".equals(kind)) {
            String[] sections = finance() ? new String[] {"account", "budget", "savings", "transfer", "transaction"} :
                new String[] {"goal", "milestone"};
            String[] names = finance() ? new String[] {"管理账户", "管理分类预算", "管理储蓄目标", "账户转账", "编辑已有账目"} :
                new String[] {"管理目标", "管理里程碑"};
            for (int i = 0; i < sections.length; i++) {
                final String target = sections[i];
                Button manage = NativeUi.button(activity, names[i], false);
                manage.setOnClickListener(v -> { if (allowed() && !busy) host.onManage(target); });
                body.addView(manage);
            }
        }
        state = NativeUi.label(activity, "尚未读取，不代表没有数据。", 13, NativeUi.MUTED, false); body.addView(state);
        results = NativeUi.column(activity); body.addView(results);
        if (finance()) {
            previous = NativeUi.button(activity, "上一页账目", false); next = NativeUi.button(activity, "下一页账目", false);
            previous.setOnClickListener(v -> { if (!busy && page > 0) { page--; load(); } });
            next.setOnClickListener(v -> {
                if (!busy && snapshot != null && !snapshot.isNull("nextPage")) { page++; load(); }
            }); body.addView(previous); body.addView(next);
        }
        ScrollView scroll = new ScrollView(activity); scroll.setFillViewport(true); scroll.addView(body);
        dialog = new AlertDialog.Builder(activity).setTitle(finance() ? "财务与账本" : "goals".equals(kind) ? "目标总览" : "周期回顾")
            .setView(scroll).setNegativeButton("关闭", (d, w) -> close()).setPositiveButton("重新读取", null).create();
        dialog.setOnDismissListener(d -> close());
        dialog.setOnShowListener(d -> {
            if (finance()) dialog.getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
            refresh = dialog.getButton(AlertDialog.BUTTON_POSITIVE); refresh.setOnClickListener(v -> load()); load();
        });
        dialog.show();
    }
    private void chooseMonth() {
        if (!allowed() || busy) return;
        String[] parts = month.split("-");
        DatePickerDialog value = new DatePickerDialog(activity, (view, year, m, day) -> {
            if (!allowed() || busy) return;
            if (year < 2000 || year > 2100) { tell("请选择2000至2100年的月份。"); return; }
            month = String.format(Locale.US, "%04d-%02d", year, m + 1); page = 0; load();
        }, Integer.parseInt(parts[0]), Integer.parseInt(parts[1]) - 1, 1);
        value.setTitle("选择月份，日数不影响结果"); picker = value; value.show();
    }
    private void load() {
        if (busy) return;
        if (!allowed()) { close(); return; }
        busy = true; snapshot = null; account = ""; refresh.setEnabled(false);
        state.setText("正在读取云端数据…"); state.setTextColor(NativeUi.MUTED); render();
        final int request = ++generation; final String path = endpoint();
        bridge.request(path, null, envelope -> {
            if (closed || request != generation) return;
            busy = false; refresh.setEnabled(true);
            if (!allowed()) { close(); return; }
            int status = envelope.optInt("status"); String type = envelope.optString("type");
            if (status == 401 || status == 403 || type.contains("text/html")) { close(); host.onAuthRequired(); return; }
            if (!WorkbenchDashboardPolicy.response(status, type, envelope.optString("url"), origin, path)) {
                tell(status == 404 ? "工作台尚未提供这个原生接口，请先升级服务。" : "读取失败，不代表没有数据。请检查连接后重试。");
                render(); return;
            }
            try {
                JSONObject payload = new JSONObject(envelope.getString("body"));
                JSONObject user = payload.getJSONObject("user");
                if (payload.getInt("schemaVersion") != 1 || !payload.getBoolean("readOnly") ||
                    !kind.equals(payload.getString("kind")) ||
                    !scope.equals(WorkbenchOperationPolicy.scope(origin, user.getString("email"))))
                    throw new IllegalArgumentException("Identity mismatch");
                JSONArray metrics = payload.getJSONArray("metrics"), groups = payload.getJSONArray("groups");
                if (metrics.length() > 12 || groups.length() > 8 || payload.getJSONArray("accounts").length() > 100)
                    throw new IllegalArgumentException("Unbounded dashboard");
                for (int i = 0; i < metrics.length(); i++) {
                    JSONObject entry = metrics.getJSONObject(i); entry.getString("label"); entry.getString("value"); entry.getString("unit");
                }
                for (int i = 0; i < groups.length(); i++) {
                    JSONObject group = groups.getJSONObject(i); group.getString("title");
                    JSONArray items = group.getJSONArray("items");
                    if (items.length() > 100) throw new IllegalArgumentException("Unbounded rows");
                    for (int k = 0; k < items.length(); k++) {
                        JSONObject row = items.getJSONObject(k);
                        for (String field : new String[] {"id", "title", "subtitle", "detail", "value"}) {
                            if (row.getString(field).length() > 6000) throw new IllegalArgumentException("Oversized row");
                        }
                    }
                }
                if (finance() && (!month.equals(payload.getString("month")) || page != payload.getInt("page") ||
                    (!payload.isNull("nextPage") && (page >= 999 || payload.getInt("nextPage") != page + 1))))
                    throw new IllegalArgumentException("Page mismatch");
                if ("review".equals(kind) && days != payload.getInt("days")) throw new IllegalArgumentException("Range mismatch");
                snapshot = payload; account = user.getString("email");
                state.setText("上次读取：" + WorkbenchDashboardPolicy.time(payload.optString("readAt"))
                    + (payload.optBoolean("truncated") ? "\n部分列表达到显示上限，其余内容请在网页版查看。" : "")
                    + "\n关闭页面后清除本次列表，不缓存云端正文。");
                state.setTextColor(NativeUi.MUTED); render();
            } catch (Exception ignored) {
                snapshot = null; account = ""; tell("账号或数据格式校验失败，未显示结果，请重新连接。"); render();
            }
        });
    }
    private boolean canWrite() {
        return finance() && allowed() && !busy && !host.writesBlocked() && snapshot != null
            && snapshot.optBoolean("ledgerActions") && !account.isEmpty() && !submissions.hasPending();
    }
    private TextView label(String value, int size, int color, boolean bold) {
        TextView text = NativeUi.label(activity, value, size, color, bold);
        text.setPadding(0, dp(5), 0, dp(5)); return text;
    }
    private void render() {
        if (closed || results == null) return;
        results.removeAllViews();
        range.setText(finance() ? month + " / 北京时间 / 第 " + (page + 1) + " 页" :
            "review".equals(kind) ? "最近 " + days + " 个自然日 / 北京时间" : "已保存的目标与里程碑");
        if (finance()) {
            create.setEnabled(canWrite()); reveal.setText(masked ? "显示金额与账目详情" : "隐藏金额与账目详情");
            previous.setEnabled(!busy && page > 0);
            next.setEnabled(!busy && snapshot != null && !snapshot.isNull("nextPage")); renderPending();
        }
        if (snapshot == null) return;
        results.addView(label(snapshot.optString("notice"), 12, NativeUi.MUTED, false));
        JSONArray metrics = snapshot.optJSONArray("metrics");
        for (int i = 0; i < metrics.length(); i++) {
            JSONObject metric = metrics.optJSONObject(i);
            LinearLayout line = NativeUi.column(activity); line.setPadding(dp(16), dp(10), dp(16), dp(10));
            if (i == 0) line.setBackground(NativeUi.shape(activity, NativeUi.MINT, 18));
            line.addView(label(metric.optString("label"), 12, NativeUi.MUTED, true));
            line.addView(label(finance() && masked ? "金额与统计已隐藏" :
                metric.optString("value") + " " + metric.optString("unit"), i == 0 ? 32 : 22, NativeUi.FOREST, true));
            results.addView(line);
        }
        JSONArray groups = snapshot.optJSONArray("groups");
        for (int i = 0; i < groups.length(); i++) {
            JSONObject group = groups.optJSONObject(i); JSONArray items = group.optJSONArray("items");
            Button heading = NativeUi.button(activity, group.optString("title") + " / 本次 " + items.length() + " 项", false);
            LinearLayout rows = NativeUi.column(activity); final boolean[] expanded = {i == 0};
            rows.setVisibility(expanded[0] ? android.view.View.VISIBLE : android.view.View.GONE);
            heading.setContentDescription(group.optString("title") + "，点击展开或收起");
            heading.setOnClickListener(v -> {
                expanded[0] = !expanded[0]; rows.setVisibility(expanded[0] ? android.view.View.VISIBLE : android.view.View.GONE);
            });
            results.addView(heading); results.addView(rows);
            if (finance() && masked) {
                rows.addView(label("已隐藏。点击上方“显示金额与账目详情”后查看。", 14, NativeUi.MUTED, false)); continue;
            }
            if (items.length() == 0) rows.addView(label("本次读取范围内没有项目。", 14, NativeUi.MUTED, false));
            for (int k = 0; k < items.length(); k++) {
                JSONObject row = items.optJSONObject(k); LinearLayout entry = NativeUi.column(activity);
                entry.setPadding(dp(14), dp(10), dp(14), dp(10));
                entry.setBackground(NativeUi.touch(activity, Color.WHITE, 12, NativeUi.BORDER));
                LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, -2); params.setMargins(0, dp(7), 0, dp(4));
                rows.addView(entry, params);
                entry.addView(label(row.optString("title"), 17, NativeUi.INK, true));
                if (!row.optString("value").isEmpty()) entry.addView(label(row.optString("value"), 20, NativeUi.FOREST, true));
                if (!row.optString("subtitle").isEmpty()) entry.addView(label(WorkbenchDashboardPolicy.time(row.optString("subtitle")), 12, NativeUi.MUTED, false));
                if (!row.isNull("progress")) {
                    ProgressBar progress = new ProgressBar(activity, null, android.R.attr.progressBarStyleHorizontal);
                    progress.setMax(100); progress.setProgress(Math.max(0, Math.min(100, row.optInt("progress"))));
                    progress.setContentDescription("已保存的进度 " + row.optInt("progress") + "%"); entry.addView(progress);
                }
                entry.setFocusable(true); entry.setClickable(true); entry.setContentDescription(row.optString("title") + "，点击查看详情");
                entry.setOnClickListener(v -> {
                    if (!allowed()) { close(); return; }
                    detail = new AlertDialog.Builder(activity).setTitle(row.optString("title"))
                        .setMessage(row.optString("subtitle") + "\n" + row.optString("value") + "\n\n" + row.optString("detail"))
                        .setPositiveButton("返回", null).create();
                    detail.show();
                    if (finance()) detail.getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
                });
            }
        }
    }
    private void tell(String message) { state.setText(message); state.setTextColor(NativeUi.ROSE); }
    private EditText input(String hint, int max, boolean single) {
        EditText field = new EditText(activity); NativeUi.styleInput(field); field.setHint(hint);
        field.setSingleLine(single); field.setFilters(new InputFilter[] {new InputFilter.LengthFilter(max)}); return field;
    }
    private Spinner choice(String[] values) {
        Spinner spinner = new Spinner(activity);
        spinner.setAdapter(new ArrayAdapter<>(activity, android.R.layout.simple_spinner_dropdown_item, values)); return spinner;
    }
    private String iso(long value) {
        SimpleDateFormat format = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
        format.setTimeZone(TimeZone.getTimeZone("UTC")); return format.format(new Date(value));
    }
    private void edit() {
        if (!canWrite()) return;
        LinearLayout form = NativeUi.column(activity); form.setPadding(dp(20), dp(10), dp(20), dp(16));
        form.addView(label("只记录实际收支，不会改变兼职应收或创建结算。不上传给AI。", 13, NativeUi.MUTED, false));
        Spinner type = choice(new String[] {"支出", "收入"}); form.addView(type);
        EditText amount = input("金额（元，最多两位小数）", 10, true);
        amount.setInputType(InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_FLAG_DECIMAL); form.addView(amount);
        EditText category = input("分类，例如餐饮、交通、工资", 100, true); form.addView(category);
        JSONArray accounts = snapshot.optJSONArray("accounts");
        String[] names = new String[accounts.length() + 1]; names[0] = "未指定账户";
        for (int i = 0; i < accounts.length(); i++) names[i + 1] = accounts.optJSONObject(i).optString("name");
        Spinner accountPicker = choice(names); form.addView(accountPicker);
        EditText note = input("备注（可不填）", 2000, false); form.addView(note);
        final Calendar when = Calendar.getInstance(TimeZone.getTimeZone("Asia/Shanghai"));
        Button time = NativeUi.button(activity, "发生时间：" + WorkbenchDashboardPolicy.time(iso(when.getTimeInMillis())), false); form.addView(time);
        time.setOnClickListener(v -> {
            if (!canWrite()) return;
            DatePickerDialog date = new DatePickerDialog(activity, (view, y, m, d) -> {
                if (!canWrite()) return;
                when.set(y, m, d);
                TimePickerDialog clock = new TimePickerDialog(activity, (view2, h, minute) -> {
                    if (!canWrite()) return;
                    when.set(Calendar.HOUR_OF_DAY, h); when.set(Calendar.MINUTE, minute);
                    when.set(Calendar.SECOND, 0); when.set(Calendar.MILLISECOND, 0);
                    time.setText("发生时间：" + WorkbenchDashboardPolicy.time(iso(when.getTimeInMillis())));
                }, when.get(Calendar.HOUR_OF_DAY), when.get(Calendar.MINUTE), true);
                picker = clock; clock.show(); clock.getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
            }, when.get(Calendar.YEAR), when.get(Calendar.MONTH), when.get(Calendar.DAY_OF_MONTH));
            date.getDatePicker().setMaxDate(System.currentTimeMillis());
            picker = date; date.show(); date.getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
        });
        ScrollView scroll = new ScrollView(activity); scroll.addView(form);
        editor = new AlertDialog.Builder(activity).setTitle("手动记一笔").setView(scroll)
            .setNegativeButton("取消", null).setPositiveButton("核对账目", null).create();
        editor.setOnShowListener(d -> editor.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v -> {
            if (!canWrite()) return;
            long cents = WorkbenchDashboardPolicy.cents(amount.getText().toString());
            if (cents < 0) { amount.setError("请输入0.01至9999999.99元，最多两位小数"); return; }
            String categoryText = category.getText().toString().trim();
            if (categoryText.isEmpty()) { category.setError("请填写分类"); return; }
            if (when.get(Calendar.YEAR) < 2000 || when.get(Calendar.YEAR) > 2100 || when.getTimeInMillis() > System.currentTimeMillis() + 60000) {
                time.setText("请重新选择已发生的时间（2000年至今）"); return;
            }
            try {
                int index = accountPicker.getSelectedItemPosition();
                JSONObject payload = new JSONObject().put("type", type.getSelectedItem().toString())
                    .put("amount", WorkbenchDashboardPolicy.money(cents)).put("category", categoryText)
                    .put("accountId", index == 0 ? JSONObject.NULL : accounts.getJSONObject(index - 1).getString("id"))
                    .put("occurredAt", iso(when.getTimeInMillis())).put("note", note.getText().toString());
                confirmation = new AlertDialog.Builder(activity).setTitle("确认保存这笔账目？")
                    .setMessage(payload.getString("type") + " " + payload.getString("amount") + " 元\n分类：" + categoryText +
                        "\n账户：" + names[index] + "\n" + WorkbenchDashboardPolicy.time(payload.getString("occurredAt")) +
                        "\n\n" + payload.getString("note") + "\n\n只新增一条账目，不代收款、不更改应收或结算。")
                    .setNegativeButton("返回修改", null).setPositiveButton("确认记账", (d2, which) -> {
                        if (submit(payload)) editor.dismiss();
                    }).create();
                confirmation.show(); confirmation.getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
            } catch (Exception ignored) { tell("账目未能准备，本次未发送。"); }
        }));
        editor.show(); editor.getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
    }
    private boolean submit(JSONObject payload) {
        if (!canWrite()) return false;
        try {
            JSONObject original = new JSONObject().put("requestId", UUID.randomUUID().toString()).put("action", "ledger.create")
                .put("payload", payload).put("expectedAccount", account);
            if (!submissions.save(original)) { tell("本机提交记录未安全保存，本次没有发送。"); render(); return false; }
            send(original, "ledger.create"); return true;
        } catch (Exception ignored) { tell("未能准备记账，本次未发送。"); return false; }
    }
    private void renderPending() {
        pending.removeAllViews();
        if (!submissions.hasPending()) return;
        pending.addView(label("上次记账待核对", 17, NativeUi.INK, true));
        pending.addView(label(lastOutcome.isEmpty() ? "原提交保存在本机应用空间，不是加密保险库。不会自动重发，不要重新记一笔。" : lastOutcome, 13, NativeUi.MUTED, false));
        JSONObject original = submissions.read();
        if (original == null || !scope.equals(WorkbenchOperationPolicy.scope(origin, original.optString("expectedAccount")))) {
            pending.addView(label("本机提交记录无法校验，已暂停新增。请保留应用数据，不要卸载或清空。", 13, NativeUi.ROSE, false)); return;
        }
        for (String action : new String[] {"ledger.status", "ledger.create", "ledger.discard"}) {
            String title = "ledger.status".equals(action) ? "核对上次记账" : "ledger.create".equals(action) ? "重试原提交" : "放弃原提交";
            Button button = NativeUi.button(activity, title, false);
            button.setEnabled(allowed() && !busy && !host.writesBlocked());
            button.setOnClickListener(v -> {
                if ("ledger.status".equals(action)) { send(original, action); return; }
                confirmation = new AlertDialog.Builder(activity).setTitle(title)
                    .setMessage("ledger.discard".equals(action) ? "阻止尚未完成的这笔提交继续保存。若已经记账，只返回原回执，不删除或撤销账目。"
                        : "使用原编号和原内容重试，不创建第二笔账目。")
                    .setNegativeButton("返回", null).setPositiveButton("确认", (d, w) -> send(original, action)).create();
                confirmation.show(); confirmation.getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
            }); pending.addView(button);
        }
    }
    private void send(JSONObject original, String action) {
        if (!finance() || !allowed() || busy || host.writesBlocked() || !submissions.hasPending() ||
            !scope.equals(WorkbenchOperationPolicy.scope(origin, original.optString("expectedAccount")))) return;
        try {
            JSONObject command = new JSONObject(original.toString());
            if (!"ledger.create".equals(action)) command.put("action", action).put("payload", new JSONObject()
                .put("action", "ledger.create").put("payload", original.getJSONObject("payload")));
            busy = true; refresh.setEnabled(false); render(); final int request = ++generation;
            bridge.request("/api/mobile-ledger-actions", command, envelope -> {
                if (closed || request != generation) return;
                busy = false; refresh.setEnabled(true);
                if (!allowed()) { close(); return; }
                int code = envelope.optInt("status"); String type = envelope.optString("type");
                if (code == 401 || code == 403 || type.contains("text/html")) { close(); host.onAuthRequired(); return; }
                if (!WorkbenchDashboardPolicy.response(code, type, envelope.optString("url"), origin, "/api/mobile-ledger-actions")) {
                    lastOutcome = code == 409 ? "账户或提交已变化。请读取后核对或放弃原提交，不要重新记账。"
                        : "没有收到确定结果。请核对或手动重试原提交。"; render(); return;
                }
                try {
                    JSONObject result = new JSONObject(envelope.getString("body"));
                    if (result.optInt("schemaVersion") != 1 || !original.getString("requestId").equals(result.optString("requestId")) ||
                        !scope.equals(WorkbenchOperationPolicy.scope(origin, result.getJSONObject("user").getString("email"))) ||
                        !WorkbenchDashboardPolicy.receipt(result.optString("id"), result.optString("requestId"),
                            result.optString("ledgerAction"), result.optString("state"), "ledger.status".equals(action)))
                        throw new IllegalArgumentException("Receipt mismatch");
                    String outcome = result.getString("state");
                    if ("not-confirmed".equals(outcome)) {
                        lastOutcome = "暂未查到回执，不代表一定失败。可重试原提交或明确放弃，不会自动发送。"; render(); return;
                    }
                    if (!submissions.clear(original.getString("requestId"))) {
                        lastOutcome = "已取得回执，但本机清理未成功。请再次核对原提交，不要卸载。"; render(); return;
                    }
                    lastOutcome = ""; if ("applied".equals(outcome)) host.onSaved();
                    tell("applied".equals(outcome) ? "已确认记账，正在重新读取。" : "原提交已安全放弃；没有删除已保存账目。");
                    load();
                } catch (Exception ignored) { lastOutcome = "回执校验未通过，原提交仍保留，请重新连接后核对。"; render(); }
            });
        } catch (Exception ignored) {
            busy = false; refresh.setEnabled(true); lastOutcome = "记账结果尚不确定，原提交仍保留。"; render();
        }
    }
    void close() {
        if (closed) return;
        closed = true; generation++; snapshot = null; account = ""; masked = true;
        if (picker != null) picker.dismiss();
        if (confirmation != null) confirmation.dismiss();
        if (detail != null) detail.dismiss();
        if (editor != null) editor.dismiss();
        if (dialog != null && dialog.isShowing()) dialog.dismiss();
        if (finance() && !secureWasSet) activity.getWindow().clearFlags(WindowManager.LayoutParams.FLAG_SECURE);
        host.onClosed();
    }
}
