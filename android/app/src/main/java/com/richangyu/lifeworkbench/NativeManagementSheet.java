package com.richangyu.lifeworkbench;

import android.app.AlertDialog;
import android.app.DatePickerDialog;
import android.app.Dialog;
import android.app.TimePickerDialog;
import android.text.Editable;
import android.text.InputFilter;
import android.text.InputType;
import android.text.TextWatcher;
import android.view.View;
import android.view.WindowManager;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Spinner;
import android.widget.TextView;
import android.widget.Toast;
import androidx.appcompat.app.AppCompatActivity;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.Date;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TimeZone;
import java.util.UUID;
import org.json.JSONArray;
import org.json.JSONObject;

/** Native, bounded management forms. No web content, model calls, automatic replay or offline list cache. */
final class NativeManagementSheet {
    interface Host {
        String accountScope();
        boolean readsAllowed();
        boolean writesBlocked();
        void onSaved();
        void onAuthRequired();
        void onClosed();
        void onNavigate(String section);
    }
    private interface Value { Object read() throws Exception; }
    private final AppCompatActivity activity;
    private final MobileApiBridge bridge;
    private final Host host;
    private final String origin, scope, section;
    private final NativeManagementStore store;
    private AlertDialog dialog, editor, confirmation, detail;
    private Dialog picker;
    private LinearLayout rows, pending;
    private TextView state, count;
    private Button refresh, create, previous, next, reveal;
    private JSONObject snapshot;
    private String account = "", query = "", lastOutcome = "";
    private int page, generation;
    private boolean busy, closed, masked = true, secureWasSet;
    NativeManagementSheet(AppCompatActivity activity, MobileApiBridge bridge, String origin, String section, Host host) {
        if (!WorkbenchManagementPolicy.section(section)) throw new IllegalArgumentException("Invalid section");
        this.activity = activity; this.bridge = bridge; this.origin = origin; this.section = section; this.host = host;
        scope = host.accountScope(); store = new NativeManagementStore(activity, scope);
    }
    private int dp(int value) { return NativeUi.dp(activity, value); }
    private boolean financial() { return WorkbenchManagementPolicy.financial(section); }
    private boolean allowed() { return !closed && scope.equals(host.accountScope()) && host.readsAllowed(); }
    private boolean canWrite() {
        return allowed() && !busy && !host.writesBlocked() && snapshot != null && snapshot.optBoolean("managementActions") &&
            !account.isEmpty() && !store.hasPending();
    }
    private String endpoint() { return "/api/mobile-management?section=" + section + "&page=" + page; }
    private String title() {
        if ("goal".equals(section)) return "目标管理";
        if ("milestone".equals(section)) return "里程碑";
        if ("account".equals(section)) return "账户管理";
        if ("budget".equals(section)) return "分类预算";
        if ("savings".equals(section)) return "储蓄目标";
        return "transfer".equals(section) ? "账户转账" : "已有账目";
    }
    private TextView label(String text, int size, int color, boolean bold) {
        TextView view = NativeUi.label(activity, text, size, color, bold);
        view.setPadding(0, dp(6), 0, dp(6)); return view;
    }
    private void secure(Dialog value) {
        if (financial() && value.getWindow() != null) value.getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
    }
    void show() {
        if (financial()) {
            secureWasSet = (activity.getWindow().getAttributes().flags & WindowManager.LayoutParams.FLAG_SECURE) != 0;
            activity.getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
        }
        LinearLayout body = NativeUi.column(activity); body.setPadding(dp(20), dp(8), dp(20), dp(20));
        TextView heading = label(title(), 27, NativeUi.INK, true); heading.setTypeface(NativeUi.DISPLAY); body.addView(heading);
        body.addView(label(financial() ? "每一笔变化，都先核对再保存。" : "把方向拆清楚，把每一步留下来。", 14, NativeUi.MUTED, false));
        if ("goal".equals(section) || "milestone".equals(section)) {
            Button related = NativeUi.button(activity, "goal".equals(section) ? "管理里程碑" : "返回目标管理", false);
            related.setOnClickListener(v -> {
                if (allowed() && !busy) host.onNavigate("goal".equals(section) ? "milestone" : "goal");
            }); body.addView(related);
        }
        if (financial()) {
            reveal = NativeUi.button(activity, "显示内容与金额", false);
            reveal.setOnClickListener(v -> { masked = !masked; render(); }); body.addView(reveal);
        }
        create = NativeUi.button(activity, "transfer".equals(section) ? "新增一笔转账" : "新增" + title(), true);
        create.setOnClickListener(v -> edit(null)); body.addView(create);
        pending = NativeUi.column(activity); body.addView(pending);
        EditText search = new EditText(activity); NativeUi.styleInput(search); search.setSingleLine(true);
        search.setHint("仅搜索当前页名称"); search.setContentDescription("搜索本次已读取页，不是完整云端搜索"); body.addView(search);
        search.addTextChangedListener(new TextWatcher() {
            @Override public void beforeTextChanged(CharSequence s, int start, int count, int after) {}
            @Override public void onTextChanged(CharSequence s, int start, int before, int count) { query = s.toString().trim(); render(); }
            @Override public void afterTextChanged(Editable value) {}
        });
        state = label("尚未读取，不代表没有数据。", 13, NativeUi.MUTED, false); body.addView(state);
        count = label("", 13, NativeUi.FOREST, true); body.addView(count);
        rows = NativeUi.column(activity); body.addView(rows);
        previous = NativeUi.button(activity, "上一页", false); next = NativeUi.button(activity, "下一页", false);
        previous.setOnClickListener(v -> { if (!busy && page > 0) { page--; load(); } });
        next.setOnClickListener(v -> { if (!busy && snapshot != null && !snapshot.isNull("nextPage")) { page++; load(); } });
        body.addView(previous); body.addView(next);
        ScrollView scroll = new ScrollView(activity); scroll.setFillViewport(true); scroll.addView(body);
        dialog = new AlertDialog.Builder(activity).setTitle(title()).setView(scroll)
            .setNegativeButton("关闭", (d, which) -> close()).setPositiveButton("重新读取", null).create();
        dialog.setOnDismissListener(d -> close());
        dialog.setOnShowListener(d -> {
            secure(dialog); refresh = dialog.getButton(AlertDialog.BUTTON_POSITIVE);
            refresh.setOnClickListener(v -> load()); load();
        });
        dialog.show();
    }
    private void load() {
        if (busy) return;
        if (!allowed()) { close(); return; }
        busy = true; snapshot = null; account = ""; refresh.setEnabled(false);
        state.setText("正在读取…"); state.setTextColor(NativeUi.MUTED); render();
        final int request = ++generation; final String path = endpoint();
        bridge.request(path, null, envelope -> {
            if (closed || request != generation) return;
            busy = false; refresh.setEnabled(true);
            if (!allowed()) { close(); return; }
            int status = envelope.optInt("status"); String type = envelope.optString("type");
            if (status == 401 || status == 403 || type.contains("text/html")) { close(); host.onAuthRequired(); return; }
            if (!WorkbenchManagementPolicy.response(status, type, envelope.optString("url"), origin, path)) {
                tell(status == 404 ? "工作台尚未提供管理接口，请先升级服务。" : "未读取成功，不代表没有数据。请检查连接后重试。"); render(); return;
            }
            try {
                JSONObject data = new JSONObject(envelope.getString("body"));
                if (data.getInt("schemaVersion") != 1 || !section.equals(data.getString("section")) ||
                    data.getInt("page") != page || data.getBoolean("financial") != financial() ||
                    (!data.isNull("nextPage") && (page >= 999 || data.getInt("nextPage") != page + 1)) ||
                    !scope.equals(WorkbenchOperationPolicy.scope(origin, data.getJSONObject("user").getString("email"))))
                    throw new IllegalArgumentException("Management identity mismatch");
                JSONArray fields = data.getJSONArray("fields"), items = data.getJSONArray("items");
                if (fields.length() != WorkbenchManagementPolicy.fieldCount(section) || items.length() > 50)
                    throw new IllegalArgumentException("Unbounded management payload");
                Set<String> names = new HashSet<>();
                for (int i = 0; i < fields.length(); i++) {
                    JSONObject f = fields.getJSONObject(i); String key = f.getString("id");
                    if (!WorkbenchManagementPolicy.field(section, key) || !names.add(key) || f.getString("label").length() > 200 ||
                        !f.getString("type").matches("text|note|money|integer|boolean|reference|choice|datetime|month") ||
                        f.getJSONArray("options").length() > 200) throw new IllegalArgumentException("Invalid form metadata");
                    JSONArray choices = f.getJSONArray("options");
                    for (int k = 0; k < choices.length(); k++) {
                        JSONObject option = choices.getJSONObject(k);
                        if (option.getString("id").length() > 100 || option.getString("label").length() > 2000)
                            throw new IllegalArgumentException("Invalid reference");
                    }
                }
                for (int i = 0; i < items.length(); i++) {
                    JSONObject item = items.getJSONObject(i);
                    if (item.getString("id").isEmpty() || item.getString("id").length() > 100 ||
                        !WorkbenchTaskWritePolicy.revision(item.getString("revision")) || item.getString("title").length() > 200 ||
                        item.getJSONObject("values").toString().length() > 24000)
                        throw new IllegalArgumentException("Invalid row");
                }
                snapshot = data; account = data.getJSONObject("user").getString("email");
                state.setText("上次读取：" + WorkbenchDashboardPolicy.time(data.optString("readAt")) + "\n" + data.optString("notice") +
                    (data.optBoolean("choicesTruncated") ? "\n引用选项达到上限；未列出的新关联请先在网页版处理。" : "") +
                    (data.optBoolean("truncated") ? "\n已到分页显示上限，其余内容请在网页版查看。" : ""));
                state.setTextColor(NativeUi.MUTED); render();
            } catch (Exception ignored) { snapshot = null; account = ""; tell("数据或账号校验未通过，未显示结果，请重新连接。"); render(); }
        });
    }
    private void render() {
        if (closed || rows == null) return;
        rows.removeAllViews(); renderPending();
        create.setVisibility("transaction".equals(section) ? View.GONE : View.VISIBLE);
        create.setEnabled(canWrite() && snapshot.optBoolean("createAllowed"));
        previous.setEnabled(!busy && page > 0); next.setEnabled(!busy && snapshot != null && !snapshot.isNull("nextPage"));
        if (financial()) reveal.setText(masked ? "显示内容与金额" : "隐藏内容与金额");
        if (snapshot == null) { count.setText(""); return; }
        JSONArray items = snapshot.optJSONArray("items");
        count.setText("云端共 " + snapshot.optInt("total") + " 项 / 第 " + (page + 1) + " 页 / 本页 " + items.length() + " 项");
        if (financial() && masked) { rows.addView(label("内容已隐藏，主动显示后查看和编辑。", 15, NativeUi.MUTED, false)); return; }
        int shown = 0;
        for (int i = 0; i < items.length(); i++) {
            JSONObject item = items.optJSONObject(i);
            if (!query.isEmpty() && !item.optString("title").toLowerCase(Locale.ROOT).contains(query.toLowerCase(Locale.ROOT))) continue;
            shown++;
            LinearLayout entry = NativeUi.column(activity); entry.setPadding(dp(16), dp(14), dp(16), dp(14));
            entry.setBackground(NativeUi.touch(activity, android.graphics.Color.WHITE, 14, NativeUi.BORDER));
            LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, -2); params.setMargins(0, dp(9), 0, dp(4)); rows.addView(entry, params);
            entry.addView(label(item.optString("title"), 18, NativeUi.INK, true));
            JSONObject values = item.optJSONObject("values");
            if ("goal".equals(section)) entry.addView(label(values.optString("status") + " / 已存进度 " + values.optInt("progress") + "%", 14, NativeUi.FOREST, true));
            else if ("milestone".equals(section)) entry.addView(label(values.optBoolean("completed") ? "已完成" : "待完成", 14, NativeUi.FOREST, true));
            else if (values.has("amount")) entry.addView(label(values.optString("amount") + " 元", 23, NativeUi.FOREST, true));
            else if ("account".equals(section)) entry.addView(label(values.optBoolean("isArchived") ? "已归档 / 保留历史" : "可用于新增账目", 14, NativeUi.FOREST, true));
            else if ("savings".equals(section)) entry.addView(label(values.optString("savedAmount") + " / " + values.optString("targetAmount") + " 元", 22, NativeUi.FOREST, true));
            entry.addView(label(item.optString("description"), 12, NativeUi.MUTED, false));
            entry.setFocusable(true); entry.setClickable(true); entry.setContentDescription(item.optString("title") + "，点击查看与管理");
            entry.setOnClickListener(v -> details(item));
        }
        if (shown == 0) rows.addView(label(query.isEmpty() ? "当前页没有项目，可以新增或切换页码。" : "当前页没有匹配项，请清空搜索或切换页码。", 15, NativeUi.MUTED, false));
    }
    private String display(JSONObject f, Object value) {
        if (value == null || value == JSONObject.NULL) return "未设置";
        if ("boolean".equals(f.optString("type"))) return Boolean.TRUE.equals(value) ? "是" : "否";
        if ("datetime".equals(f.optString("type"))) return WorkbenchDashboardPolicy.time(String.valueOf(value));
        if ("reference".equals(f.optString("type")) || "choice".equals(f.optString("type"))) {
            JSONArray options = f.optJSONArray("options");
            for (int i = 0; i < options.length(); i++) {
                JSONObject option = options.optJSONObject(i);
                if (option.optString("id").equals(String.valueOf(value))) return option.optString("label");
            }
            return "当前关联（未列在选项中）";
        }
        return String.valueOf(value);
    }
    private String summary(JSONObject values) {
        StringBuilder text = new StringBuilder();
        JSONArray fields = snapshot.optJSONArray("fields");
        for (int i = 0; i < fields.length(); i++) {
            JSONObject f = fields.optJSONObject(i);
            text.append(f.optString("label")).append("：").append(display(f, values.opt(f.optString("id")))).append("\n");
        }
        return text.toString();
    }
    private void details(JSONObject item) {
        if (!allowed() || snapshot == null) { close(); return; }
        detail = new AlertDialog.Builder(activity).setTitle(item.optString("title"))
            .setMessage(summary(item.optJSONObject("values")) + "\n" + item.optString("description"))
            .setPositiveButton("返回列表", null).setNeutralButton("编辑", null).setNegativeButton(
                "goal".equals(section) || "milestone".equals(section) ? "标记完成" : "transaction".equals(section) ? "软删除账目" : "返回", null).create();
        detail.setOnShowListener(d -> {
            secure(detail);
            detail.getButton(AlertDialog.BUTTON_NEUTRAL).setEnabled(canWrite() && item.optBoolean("editable"));
            detail.getButton(AlertDialog.BUTTON_NEUTRAL).setOnClickListener(v -> { detail.dismiss(); edit(item); });
            Button action = detail.getButton(AlertDialog.BUTTON_NEGATIVE);
            boolean completes = "goal".equals(section) || "milestone".equals(section);
            boolean incomplete = !"goal".equals(section) || !"已完成".equals(item.optJSONObject("values").optString("status"));
            if ("milestone".equals(section)) incomplete = !item.optJSONObject("values").optBoolean("completed");
            action.setEnabled(canWrite() && (completes ? item.optBoolean("editable") && incomplete : item.optBoolean("removable")));
            action.setOnClickListener(v -> {
                if (!canWrite()) return;
                try {
                    if (completes) {
                        JSONObject values = new JSONObject(item.getJSONObject("values").toString());
                        if ("goal".equals(section)) values.put("status", "已完成").put("progress", 100);
                        else values.put("completed", true);
                        confirm("manage.update", item, values);
                    } else confirm("manage.remove", item, new JSONObject());
                } catch (Exception ignored) { tell("操作未能准备，本次没有发送。"); }
            });
        });
        detail.show();
    }
    private EditText input(JSONObject spec, Object original) {
        EditText view = new EditText(activity); NativeUi.styleInput(view);
        view.setSingleLine(!"note".equals(spec.optString("type"))); view.setText(original == null || original == JSONObject.NULL ? "" : String.valueOf(original));
        int max = spec.optInt("max", 32);
        if (max < 1 || max > 2000) max = 2000;
        view.setFilters(new InputFilter[] {new InputFilter.LengthFilter(max)});
        String type = spec.optString("type");
        if ("money".equals(type)) view.setInputType(InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_FLAG_DECIMAL |
            (spec.optBoolean("signed") ? InputType.TYPE_NUMBER_FLAG_SIGNED : 0));
        else if ("integer".equals(type)) view.setInputType(InputType.TYPE_CLASS_NUMBER);
        return view;
    }
    private String iso(long value) {
        SimpleDateFormat format = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
        format.setTimeZone(TimeZone.getTimeZone("UTC")); return format.format(new Date(value));
    }
    private void edit(JSONObject item) {
        if (!canWrite() || (item != null && !item.optBoolean("editable"))) return;
        if (item == null && !snapshot.optBoolean("createAllowed")) return;
        LinearLayout form = NativeUi.column(activity); form.setPadding(dp(20), dp(8), dp(20), dp(20));
        form.addView(label(financial() ? "初始余额影响历史余额。储蓄进度不自动转账。请逐项核对。" :
            "目标和里程碑单独保存，不自动完成任务或安排日程。", 13, NativeUi.MUTED, false));
        TextView error = label("", 13, NativeUi.ROSE, true); form.addView(error);
        JSONArray fields = snapshot.optJSONArray("fields");
        Map<String, Value> readers = new LinkedHashMap<>();
        JSONObject existing = item == null ? null : item.optJSONObject("values");
        for (int i = 0; i < fields.length(); i++) {
            JSONObject spec = fields.optJSONObject(i); String key = spec.optString("id"), type = spec.optString("type");
            Object original = existing == null ? spec.opt("default") : existing.opt(key);
            form.addView(label(spec.optString("label"), 13, NativeUi.MUTED, true));
            if ("boolean".equals(type)) {
                CheckBox checkbox = new CheckBox(activity); checkbox.setText(spec.optString("label"));
                checkbox.setChecked(Boolean.TRUE.equals(original)); form.addView(checkbox); readers.put(key, checkbox::isChecked);
            } else if ("choice".equals(type) || "reference".equals(type)) {
                List<String> ids = new ArrayList<>(), names = new ArrayList<>();
                if ("reference".equals(type)) { ids.add(""); names.add(spec.optBoolean("nullable") ? "未指定" : "请选择（必选）"); }
                JSONArray options = spec.optJSONArray("options");
                for (int k = 0; k < options.length(); k++) {
                    JSONObject option = options.optJSONObject(k); ids.add(option.optString("id")); names.add(option.optString("label"));
                }
                String old = original == null || original == JSONObject.NULL ? "" : String.valueOf(original);
                if (!old.isEmpty() && !ids.contains(old)) { ids.add(old); names.add("当前关联（未列出）"); }
                Spinner spinner = new Spinner(activity); spinner.setAdapter(new ArrayAdapter<>(activity, android.R.layout.simple_spinner_dropdown_item, names));
                if (ids.contains(old)) spinner.setSelection(ids.indexOf(old));
                if (item != null && spec.optBoolean("locked")) spinner.setEnabled(false);
                form.addView(spinner);
                readers.put(key, () -> {
                    if (spinner.getSelectedItemPosition() < 0) throw new IllegalArgumentException(spec.optString("label") + "没有可选项");
                    String value = ids.get(spinner.getSelectedItemPosition());
                    if (value.isEmpty() && !spec.optBoolean("nullable")) throw new IllegalArgumentException(spec.optString("label") + "为必选");
                    return value.isEmpty() ? JSONObject.NULL : value;
                });
            } else if ("datetime".equals(type)) {
                final String[] value = {original == null || original == JSONObject.NULL ? null : String.valueOf(original)};
                Button time = NativeUi.button(activity, value[0] == null ? "选择时间（北京时间）" : WorkbenchDashboardPolicy.time(value[0]), false);
                time.setOnClickListener(v -> {
                    if (!canWrite()) return;
                    Calendar selected = Calendar.getInstance(TimeZone.getTimeZone("Asia/Shanghai"));
                    long old = value[0] == null ? 0 : WorkbenchTaskPolicy.timestamp(value[0]);
                    if (old > 0) selected.setTimeInMillis(old);
                    DatePickerDialog date = new DatePickerDialog(activity, (view, y, m, d) -> {
                        if (!canWrite()) return;
                        selected.set(y, m, d);
                        TimePickerDialog clock = new TimePickerDialog(activity, (view2, h, minute) -> {
                            if (!canWrite()) return;
                            selected.set(Calendar.HOUR_OF_DAY, h); selected.set(Calendar.MINUTE, minute);
                            selected.set(Calendar.SECOND, 0); selected.set(Calendar.MILLISECOND, 0);
                            if (y < 2000 || y > 2100) { time.setText("请选择2000至2100年的时间"); return; }
                            value[0] = iso(selected.getTimeInMillis()); time.setText(WorkbenchDashboardPolicy.time(value[0]));
                        }, selected.get(Calendar.HOUR_OF_DAY), selected.get(Calendar.MINUTE), true);
                        picker = clock; clock.show(); secure(clock);
                    }, selected.get(Calendar.YEAR), selected.get(Calendar.MONTH), selected.get(Calendar.DAY_OF_MONTH));
                    picker = date; date.show(); secure(date);
                });
                form.addView(time);
                if (spec.optBoolean("nullable")) {
                    Button clear = NativeUi.button(activity, "清除此时间", false);
                    clear.setOnClickListener(v -> { value[0] = null; time.setText("未设置时间"); }); form.addView(clear);
                }
                readers.put(key, () -> {
                    if (value[0] == null && !spec.optBoolean("nullable")) throw new IllegalArgumentException(spec.optString("label") + "不能为空");
                    return value[0] == null ? JSONObject.NULL : value[0];
                });
            } else {
                EditText view = input(spec, original); form.addView(view);
                readers.put(key, () -> {
                    String raw = view.getText().toString(), value = "note".equals(type) ? raw : raw.trim();
                    if ("money".equals(type)) {
                        String normalized = WorkbenchManagementPolicy.decimal(value, spec.optBoolean("signed"), spec.optBoolean("zero"));
                        if (normalized.isEmpty()) throw new IllegalArgumentException(spec.optString("label") + "须在范围内，且最多两位小数");
                        return normalized;
                    }
                    if ("integer".equals(type)) {
                        if (!value.matches("[0-9]{1,3}")) throw new IllegalArgumentException("请输入0至100的进度");
                        int number = Integer.parseInt(value);
                        if (number < spec.optInt("min") || number > spec.optInt("max")) throw new IllegalArgumentException("进度超出范围");
                        return number;
                    }
                    if ("month".equals(type) && !value.matches("(20[0-9]{2}|2100)-(0[1-9]|1[0-2])"))
                        throw new IllegalArgumentException("月份格式应为2026-10，范围2000至2100年");
                    if (!"note".equals(type) && value.isEmpty()) throw new IllegalArgumentException(spec.optString("label") + "不能为空");
                    return value;
                });
            }
        }
        ScrollView scroll = new ScrollView(activity); scroll.addView(form);
        editor = new AlertDialog.Builder(activity).setTitle(item == null ? "新增" + title() : "编辑" + title())
            .setView(scroll).setNegativeButton("返回", null).setPositiveButton("核对改动", null).create();
        editor.setOnShowListener(d -> {
            secure(editor);
            editor.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v -> {
                if (!canWrite()) return;
                try {
                    JSONObject values = new JSONObject();
                    for (Map.Entry<String, Value> reader : readers.entrySet()) values.put(reader.getKey(), reader.getValue().read());
                    if ("goal".equals(section) && !values.isNull("startAt") && !values.isNull("targetAt") &&
                        WorkbenchTaskPolicy.timestamp(values.getString("targetAt")) < WorkbenchTaskPolicy.timestamp(values.getString("startAt")))
                        throw new IllegalArgumentException("目标时间不能早于开始时间");
                    if (("transfer".equals(section) || "转账".equals(values.optString("type"))) &&
                        (values.isNull("accountId") || values.isNull("transferAccountId") ||
                            values.optString("accountId").equals(values.optString("transferAccountId"))))
                        throw new IllegalArgumentException("转账请选择两个不同的账户");
                    if ("transaction".equals(section) && !"转账".equals(values.optString("type")) && !values.isNull("transferAccountId"))
                        throw new IllegalArgumentException("普通收支不能选择转入账户");
                    confirm(item == null ? "manage.create" : "manage.update", item, values);
                } catch (Exception exception) {
                    error.setText(exception.getMessage() == null ? "请检查填写内容" : exception.getMessage());
                    Toast.makeText(activity, error.getText(), Toast.LENGTH_LONG).show();
                }
            });
        });
        editor.show();
    }
    private void confirm(String action, JSONObject item, JSONObject values) {
        if (!canWrite()) return;
        try {
            JSONObject payload = new JSONObject().put("section", section).put("values", values);
            if (item != null) payload.put("id", item.getString("id")).put("expectedRevision", item.getString("revision"));
            String content = "manage.remove".equals(action) ? "将软删除这条未关联账目，保留数据库历史标记，不删除账户或结算记录。\n" + item.optString("title") :
                summary(values) + "\n只修改本项目；不会自动完成任务、改写日程或结算。";
            confirmation = new AlertDialog.Builder(activity).setTitle("manage.remove".equals(action) ? "确认软删除账目？" : "确认保存这些改动？")
                .setMessage(content).setNegativeButton("返回修改", null).setPositiveButton("确认", (d, which) -> {
                    if (submit(action, payload)) {
                        if (editor != null) editor.dismiss();
                        if (detail != null) detail.dismiss();
                    }
                }).create();
            confirmation.show(); secure(confirmation);
        } catch (Exception ignored) { tell("提交未能准备，本次没有发送。"); }
    }
    private boolean submit(String action, JSONObject payload) {
        if (!canWrite()) return false;
        try {
            JSONObject original = new JSONObject().put("requestId", UUID.randomUUID().toString()).put("action", action)
                .put("payload", payload).put("expectedAccount", account);
            if (!store.save(original)) { tell("本机提交记录未安全保存，本次没有发送。"); render(); return false; }
            send(original, action); return true;
        } catch (Exception ignored) { tell("提交未能准备，本次没有发送。"); return false; }
    }
    private void renderPending() {
        if (pending == null) return;
        pending.removeAllViews();
        if (!store.hasPending()) return;
        pending.addView(label("有一笔管理提交待核对", 17, NativeUi.INK, true));
        pending.addView(label(lastOutcome.isEmpty() ? "原提交位于本机应用沙箱，不是加密保险库。不会自动重发；请先核对，不要另建一笔。" : lastOutcome,
            13, NativeUi.MUTED, false));
        JSONObject original = store.read();
        if (original == null || !scope.equals(WorkbenchOperationPolicy.scope(origin, original.optString("expectedAccount")))) {
            pending.addView(label("本机提交无法校验，已暂停写入。请保留应用数据，不要卸载或清空。", 13, NativeUi.ROSE, false)); return;
        }
        for (String action : new String[] {"manage.status", original.optString("action"), "manage.discard"}) {
            String label = "manage.status".equals(action) ? "核对原提交" : "manage.discard".equals(action) ? "放弃原提交" : "重试原提交";
            Button button = NativeUi.button(activity, label, false); button.setEnabled(allowed() && !busy && !host.writesBlocked());
            button.setOnClickListener(v -> {
                if ("manage.status".equals(action)) { send(original, action); return; }
                confirmation = new AlertDialog.Builder(activity).setTitle(label)
                    .setMessage("manage.discard".equals(action) ? "阻止尚未完成的这笔提交继续保存。若已经保存，只返回原回执，不撤销已保存数据。" :
                        "使用同一个原编号和原内容重试，不创建第二笔；不会套用当前编辑表单的其他内容。")
                    .setNegativeButton("返回", null).setPositiveButton("确认", (d, w) -> send(original, action)).create();
                confirmation.show(); secure(confirmation);
            }); pending.addView(button);
        }
    }
    private void send(JSONObject original, String action) {
        if (!allowed() || busy || host.writesBlocked() || !store.hasPending() ||
            !scope.equals(WorkbenchOperationPolicy.scope(origin, original.optString("expectedAccount")))) return;
        try {
            JSONObject command = new JSONObject(original.toString());
            boolean probe = "manage.status".equals(action);
            if (probe || "manage.discard".equals(action)) command.put("action", action).put("payload", new JSONObject()
                .put("action", original.getString("action")).put("payload", original.getJSONObject("payload")));
            busy = true; refresh.setEnabled(false); render(); final int request = ++generation;
            bridge.request("/api/mobile-management-actions", command, envelope -> {
                if (closed || request != generation) return;
                busy = false; refresh.setEnabled(true);
                if (!allowed()) { close(); return; }
                int code = envelope.optInt("status"); String type = envelope.optString("type");
                if (code == 401 || code == 403 || type.contains("text/html")) { close(); host.onAuthRequired(); return; }
                if (!WorkbenchManagementPolicy.response(code, type, envelope.optString("url"), origin, "/api/mobile-management-actions")) {
                    lastOutcome = code == 409 ? "内容、引用或账号已变化，未覆盖新内容。请重新读取，再核对或放弃原提交。" :
                        "没有收到确定结果，原提交仍保留。请核对或手动重试同一请求。"; render(); return;
                }
                try {
                    JSONObject result = new JSONObject(envelope.getString("body")), payload = original.getJSONObject("payload");
                    if (result.getInt("schemaVersion") != 1 || !result.getString("requestId").equals(original.getString("requestId")) ||
                        !scope.equals(WorkbenchOperationPolicy.scope(origin, result.getJSONObject("user").getString("email"))) ||
                        !WorkbenchManagementPolicy.result(result.optString("id"), payload.optString("id"), result.optString("requestId"),
                            result.optString("operation"), original.getString("action"), result.optString("section"),
                            payload.getString("section"), result.optString("state"), probe))
                        throw new IllegalArgumentException("Management receipt mismatch");
                    String outcome = result.getString("state");
                    if ("not-confirmed".equals(outcome)) {
                        lastOutcome = "暂未查到回执，不代表一定失败。可重试原提交或明确放弃，不会自动发送。"; render(); return;
                    }
                    if (!store.clear(original.getString("requestId"))) {
                        lastOutcome = "已取得回执，但本机清理未成功。请再次核对原提交，不要卸载或另建一笔。"; render(); return;
                    }
                    lastOutcome = ""; if ("applied".equals(outcome)) host.onSaved();
                    tell("applied".equals(outcome) ? "已确认保存，正在重新读取。" : "原提交已安全放弃，没有撤销已保存数据。"); load();
                } catch (Exception ignored) { lastOutcome = "回执或账号校验未通过，原提交仍保留，请重新连接后核对。"; render(); }
            });
        } catch (Exception ignored) { busy = false; refresh.setEnabled(true); lastOutcome = "保存结果尚不确定，原提交仍保留。"; render(); }
    }
    private void tell(String message) { state.setText(message); state.setTextColor(NativeUi.ROSE); }
    void close() {
        if (closed) return;
        closed = true; generation++; snapshot = null; account = ""; masked = true;
        if (picker != null) picker.dismiss();
        if (confirmation != null) confirmation.dismiss();
        if (detail != null) detail.dismiss();
        if (editor != null) editor.dismiss();
        if (dialog != null && dialog.isShowing()) dialog.dismiss();
        if (financial() && !secureWasSet) activity.getWindow().clearFlags(WindowManager.LayoutParams.FLAG_SECURE);
        host.onClosed();
    }
}
