package com.richangyu.lifeworkbench;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.DatePickerDialog;
import android.app.TimePickerDialog;
import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.text.InputFilter;
import android.text.InputType;
import android.view.Gravity;
import android.view.KeyEvent;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.Spinner;
import android.widget.TextView;
import android.widget.Toast;
import org.json.JSONArray;
import org.json.JSONObject;
import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;

/** Native nutrition controls over the existing authenticated workbench API. */
final class NativeNutritionSheet {
    interface Host {
        boolean writesBlocked();
        void onAuthRequired();
        void onClosed();
    }
    private static final String ENDPOINT = "/api/nutrition";
    private static final String[] MEAL_TYPES = {"\u65e9\u9910", "\u5348\u9910", "\u665a\u9910", "\u52a0\u9910"};
    private final Activity activity;
    private final MobileApiBridge api;
    private final Host host;
    private final String origin;
    private final SharedPreferences preferences;
    private final Calendar selected = Calendar.getInstance();
    private AlertDialog dialog, editor;
    private LinearLayout content;
    private TextView status;
    private Button dateButton, previous, next, refresh, addMeal, addWater;
    private JSONObject snapshot;
    private boolean closed, loading, writing, loaded, verifiedUnknown;
    NativeNutritionSheet(Activity activity, MobileApiBridge api, String origin, Host host) {
        this.activity = activity; this.api = api; this.origin = origin; this.host = host;
        this.preferences = activity.getSharedPreferences("native_workbench", Context.MODE_PRIVATE);
    }
    static boolean hasUnknownSave(Context context, String origin) {
        return !origin.isEmpty() && context.getSharedPreferences("native_workbench", Context.MODE_PRIVATE)
            .getBoolean("nutrition_unknown:" + origin, false);
    }
    private boolean unknown() { return hasUnknownSave(activity, origin); }
    private void markUnknown(boolean value) {
        preferences.edit().putBoolean("nutrition_unknown:" + origin, value).commit();
        if (value) verifiedUnknown = false;
    }
    boolean isBusy() { return loading || writing; }
    private int dp(int value) { return NativeUi.dp(activity, value); }
    private TextView label(String value, int size, int ink) {
        return NativeUi.label(activity, value, size, ink, false);
    }
    private LinearLayout column() { return NativeUi.column(activity); }
    private LinearLayout card() {
        LinearLayout view = column();
        view.setPadding(dp(16), dp(16), dp(16), dp(16));
        view.setBackground(NativeUi.shape(activity, Color.WHITE, 20, NativeUi.BORDER));
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, -2);
        params.setMargins(0, 0, 0, dp(12)); view.setLayoutParams(params); return view;
    }
    private Button button(String title, boolean primary, Runnable action) {
        Button button = NativeUi.button(activity, title, primary);
        button.setOnClickListener(v -> action.run()); return button;
    }
    void show() {
        LinearLayout root = column();
        root.setPadding(dp(16), dp(14), dp(16), dp(10));
        root.setBackground(NativeUi.pageBackground());
        LinearLayout heading = new LinearLayout(activity);
        heading.setGravity(Gravity.CENTER_VERTICAL);
        TextView title = label("\u70ed\u91cf\u4e0e\u996e\u98df", 25, NativeUi.INK);
        title.setTypeface(NativeUi.DISPLAY);
        heading.addView(title, new LinearLayout.LayoutParams(0, -2, 1));
        heading.addView(button("\u5173\u95ed", false, this::requestClose), new LinearLayout.LayoutParams(-2, -2));
        root.addView(heading);
        root.addView(label("\u539f\u751f\u9875\u9762 \u00b7 \u4e0e\u7ed1\u5b9a\u5de5\u4f5c\u53f0\u5171\u7528\u996e\u98df\u8bb0\u5f55", 11, NativeUi.MUTED));
        LinearLayout dates = new LinearLayout(activity);
        previous = button("\u524d\u4e00\u5929", false, () -> changeDay(-1));
        dateButton = button("", false, this::pickDay);
        next = button("\u540e\u4e00\u5929", false, () -> changeDay(1));
        dates.addView(previous, new LinearLayout.LayoutParams(0, -2, 1));
        dates.addView(dateButton, new LinearLayout.LayoutParams(0, -2, 2));
        dates.addView(next, new LinearLayout.LayoutParams(0, -2, 1));
        root.addView(dates);
        status = label("\u6b63\u5728\u8bfb\u53d6\u5de5\u4f5c\u53f0\u996e\u98df\u8bb0\u5f55\u2026", 12, NativeUi.MUTED);
        status.setPadding(0, dp(4), 0, dp(8)); root.addView(status);
        ScrollView scroll = new ScrollView(activity);
        scroll.setFillViewport(true); content = column(); scroll.addView(content);
        root.addView(scroll, new LinearLayout.LayoutParams(-1, 0, 1));
        LinearLayout actions = new LinearLayout(activity);
        addMeal = button("\u8bb0\u4e00\u9910", true, () -> showMeal(null));
        addWater = button("\u559d\u4e00\u676f", false, this::saveWater);
        actions.addView(addMeal, new LinearLayout.LayoutParams(0, -2, 1));
        actions.addView(addWater, new LinearLayout.LayoutParams(0, -2, 1));
        root.addView(actions);
        refresh = button("\u540c\u6b65\u996e\u98df\u8bb0\u5f55", false, this::load); root.addView(refresh);
        dialog = new AlertDialog.Builder(activity).setView(root).create();
        dialog.setCancelable(false);
        dialog.setOnKeyListener((d, key, event) -> {
            if (key == KeyEvent.KEYCODE_BACK && event.getAction() == KeyEvent.ACTION_UP) {
                requestClose(); return true;
            }
            return key == KeyEvent.KEYCODE_BACK;
        });
        dialog.show();
        if (dialog.getWindow() != null) {
            dialog.getWindow().setBackgroundDrawable(NativeUi.shape(activity, NativeUi.PAPER, 22));
            dialog.getWindow().setLayout(-1, Math.round(activity.getResources().getDisplayMetrics().heightPixels * 0.9f));
        }
        load();
    }
    private void requestClose() {
        if (writing) { notice("\u6b63\u5728\u4fdd\u5b58\uff0c\u8bf7\u7b49\u5f85\u7ed3\u679c\uff0c\u4e0d\u8981\u91cd\u590d\u63d0\u4ea4\u3002"); return; }
        close();
    }
    void close() {
        if (closed) return;
        if (writing) markUnknown(true);
        closed = true;
        if (editor != null) editor.dismiss();
        if (dialog != null) dialog.dismiss();
        host.onClosed();
    }
    private void notice(String value) { Toast.makeText(activity, value, Toast.LENGTH_LONG).show(); }
    private boolean canWrite() {
        if (!loaded || loading || writing || unknown() || host.writesBlocked()) {
            notice("\u8bf7\u5148\u540c\u6b65\u5e76\u6838\u5bf9\u5f85\u786e\u8ba4\u7684\u4fdd\u5b58\u7ed3\u679c\uff0c\u518d\u53d1\u8d77\u65b0\u7684\u64cd\u4f5c\u3002"); return false;
        }
        return true;
    }
    private void controls() {
        boolean busy = loading || writing;
        previous.setEnabled(!busy); dateButton.setEnabled(!busy);
        next.setEnabled(!busy && !day().equals(WorkbenchNutritionPolicy.dayKey(new Date(), TimeZone.getDefault())));
        refresh.setEnabled(!busy);
        boolean allowed = loaded && !busy && !unknown() && !host.writesBlocked();
        addMeal.setEnabled(allowed); addWater.setEnabled(allowed);
        dateButton.setText(new SimpleDateFormat("M\u6708d\u65e5", Locale.CHINA).format(selected.getTime()));
    }
    private String day() { return WorkbenchNutritionPolicy.dayKey(selected.getTime(), TimeZone.getDefault()); }
    private void changeDay(int amount) {
        if (isBusy()) return;
        selected.add(Calendar.DAY_OF_MONTH, amount); render();
    }
    private void pickDay() {
        if (isBusy()) return;
        DatePickerDialog picker = new DatePickerDialog(activity, (view, year, month, date) -> {
            selected.set(year, month, date); render();
        }, selected.get(Calendar.YEAR), selected.get(Calendar.MONTH), selected.get(Calendar.DAY_OF_MONTH));
        picker.getDatePicker().setMaxDate(System.currentTimeMillis()); picker.show();
    }
    private boolean needsAuth(JSONObject envelope) {
        int code = envelope.optInt("status");
        return code == 401 || code == 403 || (code != 0 &&
            (!WorkbenchNutritionPolicy.expectedResponse(envelope.optString("url"), origin)
                || envelope.optString("type").toLowerCase(Locale.ROOT).contains("text/html")));
    }
    private String error(JSONObject envelope) {
        try {
            String message = new JSONObject(envelope.optString("body")).optString("error");
            if (!message.isEmpty()) return message.substring(0, Math.min(220, message.length()));
        } catch (Exception ignored) {}
        return "\u996e\u98df\u8fde\u63a5\u5931\u8d25\uff0c\u8bf7\u68c0\u67e5\u7f51\u7edc\u6216\u91cd\u65b0\u6388\u6743\u3002";
    }
    private void load() {
        if (closed || isBusy()) return;
        loading = true; loaded = false; status.setText("\u6b63\u5728\u540c\u6b65\u996e\u98df\u8bb0\u5f55\u2026"); controls();
        api.request(ENDPOINT, null, envelope -> {
            if (closed) return;
            loading = false;
            if (needsAuth(envelope)) { close(); host.onAuthRequired(); return; }
            if (envelope.optInt("status") != 200 || !WorkbenchNutritionPolicy.jsonType(envelope.optString("type"))) {
                status.setText(error(envelope)); render(); return;
            }
            try {
                JSONObject value = new JSONObject(envelope.optString("body"));
                validateSnapshot(value);
                snapshot = value; loaded = true;
                verifiedUnknown = unknown();
                status.setText(unknown() ? "\u4fdd\u5b58\u7ed3\u679c\u5f85\u6838\u5bf9\uff0c\u8bf7\u68c0\u67e5\u9910\u98df\u548c\u996e\u6c34\u540e\u786e\u8ba4\u3002" :
                    host.writesBlocked() ? "\u5176\u4ed6\u4fdd\u5b58\u7ed3\u679c\u5f85\u6838\u5bf9\uff1b\u8bf7\u5148\u5230\u201c\u6211\u7684\u201d\u786e\u8ba4\u3002" : "\u5df2\u540c\u6b65 \u00b7 \u65e5\u671f\u6309\u624b\u673a\u672c\u5730\u65f6\u533a\u663e\u793a");
            } catch (Exception ignored) { status.setText("\u5de5\u4f5c\u53f0\u996e\u98df\u6570\u636e\u683c\u5f0f\u5f02\u5e38\uff0c\u672a\u5f53\u4f5c\u7a7a\u8bb0\u5f55\u663e\u793a\u3002"); }
            render();
        });
    }
    private double metric(JSONObject object, String key) {
        double value = object.optDouble(key, Double.NaN);
        if (!WorkbenchNutritionPolicy.validMetric(value)) throw new IllegalArgumentException("invalid metric");
        return value;
    }
    private void validateSnapshot(JSONObject value) {
        JSONArray meals = value.optJSONArray("meals"), water = value.optJSONArray("water");
        JSONObject settings = value.optJSONObject("settings");
        if (meals == null || water == null || settings == null) throw new IllegalArgumentException("invalid snapshot");
        for (String key : new String[]{"calorieTarget", "proteinTarget", "carbsTarget", "fatTarget", "waterTarget"}) metric(settings, key);
        for (int i = 0; i < meals.length(); i++) {
            JSONObject meal = meals.optJSONObject(i);
            if (meal == null || meal.optString("id").isEmpty() ||
                WorkbenchNutritionPolicy.instant(meal.optString("eatenAt")) == null) throw new IllegalArgumentException("invalid meal");
            for (String key : new String[]{"estimatedCalories", "proteinG", "carbsG", "fatG"}) metric(meal, key);
        }
        for (int i = 0; i < water.length(); i++) {
            JSONObject item = water.optJSONObject(i);
            if (item == null || WorkbenchNutritionPolicy.instant(item.optString("loggedAt")) == null) throw new IllegalArgumentException("invalid water");
            metric(item, "glasses");
        }
    }
    private String amount(double value) {
        return value == Math.rint(value) ? String.format(Locale.ROOT, "%.0f", value) : String.format(Locale.ROOT, "%.1f", value);
    }
    private void render() {
        if (closed) return;
        content.removeAllViews(); controls();
        if (snapshot == null) {
            LinearLayout empty = card();
            empty.addView(label(loading ? "\u6b63\u5728\u8bfb\u53d6\u996e\u98df\u4e0e\u8425\u517b" : "\u6682\u672a\u8bfb\u53d6\u5230\u996e\u98df\u6570\u636e", 19, NativeUi.INK));
            empty.addView(label("\u9700\u8981\u767b\u5f55\u5230\u6709\u996e\u98df\u63a5\u53e3\u7684\u5de5\u4f5c\u53f0\uff1b\u8fde\u63a5\u5931\u8d25\u4e0d\u4ee3\u8868\u6ca1\u6709\u8bb0\u5f55\u3002", 13, NativeUi.MUTED));
            content.addView(empty); return;
        }
        if (!loaded) content.addView(label("\u4ee5\u4e0b\u662f\u4e0a\u6b21\u8bfb\u53d6\u7684\u6570\u636e\uff1b\u672c\u6b21\u5c1a\u672a\u540c\u6b65\u6210\u529f\u3002", 12, NativeUi.ROSE));
        double calories = 0, protein = 0, carbs = 0, fat = 0, glasses = 0;
        JSONArray meals = snapshot.optJSONArray("meals"), water = snapshot.optJSONArray("water");
        for (int i = 0; i < meals.length(); i++) {
            JSONObject meal = meals.optJSONObject(i);
            if (!day().equals(WorkbenchNutritionPolicy.dayKey(meal.optString("eatenAt"), TimeZone.getDefault()))) continue;
            calories += metric(meal, "estimatedCalories"); protein += metric(meal, "proteinG");
            carbs += metric(meal, "carbsG"); fat += metric(meal, "fatG");
        }
        for (int i = 0; i < water.length(); i++) {
            JSONObject item = water.optJSONObject(i);
            if (day().equals(WorkbenchNutritionPolicy.dayKey(item.optString("loggedAt"), TimeZone.getDefault()))) glasses += metric(item, "glasses");
        }
        JSONObject settings = snapshot.optJSONObject("settings");
        LinearLayout summary = card();
        summary.setBackground(NativeUi.shape(activity, NativeUi.MINT, 20, NativeUi.BORDER));
        summary.addView(label("\u5df2\u52a0\u8f7d\u7684\u5f53\u65e5\u6444\u5165", 12, NativeUi.FOREST));
        TextView total = label(amount(Math.round(calories)) + " \u5343\u5361", 36, NativeUi.INK);
        total.setTypeface(NativeUi.DISPLAY); summary.addView(total);
        double target = metric(settings, "calorieTarget");
        summary.addView(label("\u4f60\u8bbe\u7f6e\u7684\u6bcf\u65e5\u76ee\u6807 " + amount(target) + " \u5343\u5361", 12, NativeUi.MUTED));
        ProgressBar progress = new ProgressBar(activity, null, android.R.attr.progressBarStyleHorizontal);
        progress.setMax(100); progress.setProgress(target > 0 ? (int)Math.min(100, calories / target * 100) : 0);
        progress.setProgressTintList(android.content.res.ColorStateList.valueOf(NativeUi.FOREST));
        LinearLayout.LayoutParams progressParams = new LinearLayout.LayoutParams(-1, dp(8));
        progressParams.setMargins(0, dp(12), 0, dp(12)); summary.addView(progress, progressParams);
        LinearLayout macros = new LinearLayout(activity);
        for (int i = 0; i < 3; i++) {
            String[] labels = {"\u86cb\u767d\u8d28", "\u78b3\u6c34", "\u8102\u80aa"};
            double[] values = {protein, carbs, fat};
            LinearLayout cell = column(); cell.addView(label(labels[i], 12, NativeUi.MUTED));
            cell.addView(label(amount(values[i]) + " g", 19, NativeUi.INK));
            macros.addView(cell, new LinearLayout.LayoutParams(0, -2, 1));
        }
        summary.addView(macros);
        summary.addView(label("\u996e\u6c34 " + amount(glasses) + " / " + amount(metric(settings, "waterTarget")) + " \u676f", 16, NativeUi.FOREST));
        content.addView(summary);
        if (unknown()) {
            LinearLayout warning = card();
            warning.addView(label("\u4e0a\u4e00\u6b21\u4fdd\u5b58\u7ed3\u679c\u5f85\u6838\u5bf9", 17, NativeUi.ROSE));
            warning.addView(label("\u8d85\u65f6\u4e0d\u7b49\u4e8e\u6ca1\u6709\u4fdd\u5b58\u3002\u5148\u540c\u6b65\u68c0\u67e5\u6240\u9009\u65e5\u671f\uff0cApp \u4e0d\u4f1a\u81ea\u52a8\u91cd\u53d1\u3002", 13, NativeUi.MUTED));
            Button acknowledge = button("\u6211\u5df2\u6838\u5bf9\u9910\u98df\u548c\u996e\u6c34", false, () ->
                new AlertDialog.Builder(activity).setTitle("\u786e\u8ba4\u5df2\u6838\u5bf9")
                    .setMessage("\u786e\u8ba4\u540e\u6062\u590d\u65b0\u7684\u64cd\u4f5c\uff0c\u4e0d\u4f1a\u91cd\u53d1\u4e0a\u6b21\u4fdd\u5b58\u3002\u8bf7\u907f\u514d\u91cd\u590d\u6dfb\u52a0\u5df2\u5b58\u5728\u7684\u5185\u5bb9\u3002")
                    .setNegativeButton("\u7ee7\u7eed\u6838\u5bf9", null)
                    .setPositiveButton("\u5df2\u6838\u5bf9", (d, which) -> { markUnknown(false); status.setText("\u5df2\u786e\u8ba4\u6838\u5bf9\u7ed3\u679c"); render(); }).show());
            acknowledge.setEnabled(loaded && verifiedUnknown && !isBusy()); warning.addView(acknowledge); content.addView(warning);
        }
        Button targets = button("\u8bbe\u7f6e\u70ed\u91cf\u4e0e\u8425\u517b\u76ee\u6807", false, this::showTargets);
        targets.setEnabled(loaded && !unknown() && !host.writesBlocked() && !isBusy()); content.addView(targets);
        content.addView(label("\u9910\u98df\u8bb0\u5f55", 19, NativeUi.INK));
        int count = 0;
        for (int i = 0; i < meals.length(); i++) {
            JSONObject meal = meals.optJSONObject(i);
            if (!day().equals(WorkbenchNutritionPolicy.dayKey(meal.optString("eatenAt"), TimeZone.getDefault()))) continue;
            count++;
            LinearLayout mealCard = card();
            Date eaten = WorkbenchNutritionPolicy.instant(meal.optString("eatenAt"));
            mealCard.addView(label(meal.optString("mealType", "\u9910\u98df") + " \u00b7 " +
                new SimpleDateFormat("HH:mm", Locale.CHINA).format(eaten), 17, NativeUi.INK));
            mealCard.addView(label(amount(metric(meal, "estimatedCalories")) + " \u5343\u5361 \u00b7 " +
                ("local".equals(meal.optString("analysisProvider")) ? "\u624b\u52a8\u6216\u6587\u5b57\u4f30\u7b97" : "\u53c2\u8003\u4f30\u7b97"), 13, NativeUi.FOREST));
            TextView note = label(meal.optString("note"), 13, NativeUi.MUTED);
            note.setMaxLines(4); note.setPadding(0, dp(6), 0, dp(6)); mealCard.addView(note);
            LinearLayout row = new LinearLayout(activity);
            Button edit = button("\u4fee\u6b63\u8425\u517b", false, () -> showMeal(meal));
            Button remove = button("\u5220\u9664", false, () -> deleteMeal(meal));
            edit.setEnabled(loaded && !isBusy() && !unknown() && !host.writesBlocked());
            remove.setEnabled(edit.isEnabled());
            row.addView(edit, new LinearLayout.LayoutParams(0, -2, 1));
            row.addView(remove, new LinearLayout.LayoutParams(0, -2, 1)); mealCard.addView(row); content.addView(mealCard);
        }
        if (count == 0) content.addView(label("\u8be5\u65e5\u671f\u672c\u6b21\u672a\u8fd4\u56de\u9910\u98df\u8bb0\u5f55\u3002\u53ef\u8bb0\u4e00\u9910\uff1b\u66f4\u65e9\u8bb0\u5f55\u53ef\u80fd\u4e0d\u5728\u63a5\u53e3\u52a0\u8f7d\u8303\u56f4\u3002", 13, NativeUi.MUTED));
        LinearLayout help = card();
        help.addView(label("\u5173\u4e8e\u70ed\u91cf\u8bb0\u5f55", 15, NativeUi.INK));
        help.addView(label("\u70ed\u91cf\u548c\u8425\u517b\u7d20\u4ec5\u4f9b\u65e5\u5e38\u8bb0\u5f55\uff0c\u4f30\u7b97\u5e76\u975e\u7cbe\u786e\u6d4b\u91cf\u3002\u76ee\u6807\u7531\u4f60\u81ea\u884c\u586b\u5199\uff0c\u4e0d\u662f\u4e2a\u6027\u5316\u8425\u517b\u6216\u533b\u7597\u5efa\u8bae\u3002\u5386\u53f2\u8303\u56f4\u4ee5\u5de5\u4f5c\u53f0\u63a5\u53e3\u8fd4\u56de\u7684\u6570\u636e\u4e3a\u51c6\u3002\n\u672c\u8f6e\u5148\u63d0\u4f9b\u6587\u5b57\u4e0e\u624b\u52a8\u8bb0\u9910\uff0c\u624b\u673a\u62cd\u7167\u8bc6\u522b\u5c1a\u672a\u63a5\u5165\u3002", 12, NativeUi.MUTED));
        content.addView(help);
    }
    private EditText input(LinearLayout form, String title, String value, boolean numeric) {
        form.addView(label(title, 13, NativeUi.MUTED));
        EditText field = new EditText(activity); NativeUi.styleInput(field);
        field.setText(value);
        field.setInputType(numeric ? InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_FLAG_DECIMAL :
            InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_MULTI_LINE);
        field.setFilters(new InputFilter[]{new InputFilter.LengthFilter(numeric ? 18 : 3000)});
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, -2);
        params.setMargins(0, dp(5), 0, dp(10)); field.setLayoutParams(params);
        form.addView(field); return field;
    }
    private ScrollView formScroll(LinearLayout form) {
        form.setPadding(dp(16), dp(8), dp(16), dp(12));
        ScrollView scroll = new ScrollView(activity); scroll.addView(form); return scroll;
    }
    private void showMeal(JSONObject meal) {
        if (!canWrite()) return;
        boolean correcting = meal != null;
        LinearLayout form = column();
        Spinner type = new Spinner(activity);
        type.setAdapter(new ArrayAdapter<>(activity, android.R.layout.simple_spinner_dropdown_item, MEAL_TYPES));
        if (correcting) for (int i=0;i<MEAL_TYPES.length;i++) if(MEAL_TYPES[i].equals(meal.optString("mealType"))) type.setSelection(i);
        form.addView(label("\u9910\u6b21", 13, NativeUi.MUTED)); form.addView(type);
        EditText note = input(form, "\u5403\u4e86\u4ec0\u4e48\u3001\u4efd\u91cf\u591a\u5c11", correcting ? meal.optString("note") : "", false);
        Calendar eaten = (Calendar)selected.clone();
        if (correcting) eaten.setTime(WorkbenchNutritionPolicy.instant(meal.optString("eatenAt")));
        Button time = button("", false, () -> new TimePickerDialog(activity, (view, hour, minute) -> {
            eaten.set(Calendar.HOUR_OF_DAY,hour); eaten.set(Calendar.MINUTE,minute);
            if(editor!=null) { Button current=(Button)form.findViewWithTag("meal-time");
                if(current!=null)current.setText("\u7528\u9910\u65f6\u95f4\uff1a"+new SimpleDateFormat("M\u6708d\u65e5 HH:mm",Locale.CHINA).format(eaten.getTime())); }
        }, eaten.get(Calendar.HOUR_OF_DAY), eaten.get(Calendar.MINUTE), true).show());
        time.setTag("meal-time"); time.setText("\u7528\u9910\u65f6\u95f4\uff1a"+new SimpleDateFormat("M\u6708d\u65e5 HH:mm",Locale.CHINA).format(eaten.getTime()));
        time.setEnabled(!correcting); form.addView(time);
        CheckBox manual = new CheckBox(activity);
        manual.setText(correcting ? "\u624b\u52a8\u4fee\u6b63\u8425\u517b\u503c" : "\u624b\u52a8\u586b\u5199\u70ed\u91cf\uff08\u53d6\u6d88\u52fe\u9009\u5219\u6309\u6587\u5b57\u4f30\u7b97\uff09");
        manual.setChecked(true); manual.setEnabled(!correcting); form.addView(manual);
        LinearLayout numbers = column();
        EditText calories = input(numbers, "\u70ed\u91cf\uff08\u5343\u5361\uff09", correcting ? amount(metric(meal,"estimatedCalories")) : "", true);
        EditText protein = input(numbers, "\u86cb\u767d\u8d28\uff08g\uff09", correcting ? amount(metric(meal,"proteinG")) : "", true);
        EditText carbs = input(numbers, "\u78b3\u6c34\uff08g\uff09", correcting ? amount(metric(meal,"carbsG")) : "", true);
        EditText fat = input(numbers, "\u8102\u80aa\uff08g\uff09", correcting ? amount(metric(meal,"fatG")) : "", true);
        numbers.addView(label("\u672a\u77e5\u8425\u517b\u7d20\u53ef\u7559\u7a7a\uff0c\u4f1a\u6309 0 \u4fdd\u5b58\uff0c\u4e0d\u4ee3\u8868\u5b9e\u9645\u4e3a 0\u3002\u6587\u5b57\u4f30\u7b97\u4e0d\u662f\u7167\u7247\u8bc6\u522b\u3002",11,NativeUi.MUTED));
        form.addView(numbers); manual.setOnCheckedChangeListener((v,checked)->numbers.setVisibility(checked?android.view.View.VISIBLE:android.view.View.GONE));
        editor = new AlertDialog.Builder(activity).setTitle(correcting?"\u4fee\u6b63\u8fd9\u9910\u8425\u517b":"\u8bb0\u5f55\u4e00\u9910")
            .setView(formScroll(form)).setNegativeButton("\u53d6\u6d88",null).setPositiveButton("\u4fdd\u5b58",null).create();
        final AlertDialog current = editor;
        current.setOnShowListener(d -> current.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v -> {
            if (!canWrite()) return;
            String description = note.getText().toString().trim();
            if(description.isEmpty()){note.setError("\u8bf7\u586b\u5199\u9910\u98df\u63cf\u8ff0");return;}
            try {
                JSONObject values = new JSONObject().put("mealType",type.getSelectedItem().toString()).put("note",description);
                if (manual.isChecked()) {
                    values.put("calories",WorkbenchNutritionPolicy.number(calories.getText().toString(),correcting?0:Double.MIN_NORMAL,100000,false));
                    values.put("proteinG",WorkbenchNutritionPolicy.number(protein.getText().toString(),0,100000,true));
                    values.put("carbsG",WorkbenchNutritionPolicy.number(carbs.getText().toString(),0,100000,true));
                    values.put("fatG",WorkbenchNutritionPolicy.number(fat.getText().toString(),0,100000,true));
                }
                if(correcting){
                    values.put("id",meal.optString("id")).put("reason","Android \u624b\u52a8\u4fee\u6b63");
                    if(meal.optJSONArray("items")!=null)values.put("items",meal.optJSONArray("items"));
                    write(new JSONObject().put("action","meal.update").put("payload",values),false,current);
                }else{
                    values.put("eatenAt",WorkbenchNutritionPolicy.iso(eaten.getTime()));
                    write(values,true,current);
                }
            }catch(Exception ignored){calories.setError(correcting?"\u8bf7\u8f93\u5165\u6709\u6548\u975e\u8d1f\u6570\u5b57":"\u624b\u52a8\u70ed\u91cf\u9700\u5927\u4e8e 0\uff0c\u8425\u517b\u503c\u9700\u4e3a\u6709\u6548\u975e\u8d1f\u6570\u5b57");}
        })); current.show();
    }
    private void showTargets() {
        if (!canWrite()) return;
        LinearLayout form = column(); JSONObject settings=snapshot.optJSONObject("settings");
        String[] keys={"calorieTarget","proteinTarget","carbsTarget","fatTarget","waterTarget"};
        String[] names={"\u6bcf\u65e5\u70ed\u91cf\u76ee\u6807\uff08\u5343\u5361\uff09","\u86cb\u767d\u8d28\u76ee\u6807\uff08g\uff09","\u78b3\u6c34\u76ee\u6807\uff08g\uff09","\u8102\u80aa\u76ee\u6807\uff08g\uff09","\u996e\u6c34\u76ee\u6807\uff08\u676f\uff09"};
        double[] minimum={800,10,20,10,1}, maximum={6000,500,1000,500,30};
        EditText[] fields=new EditText[keys.length];
        form.addView(label("\u6cbf\u7528\u5de5\u4f5c\u53f0\u53ef\u586b\u5199\u8303\u56f4\uff1b\u8fd9\u4e9b\u8303\u56f4\u548c\u9ed8\u8ba4\u503c\u4e0d\u662f\u9488\u5bf9\u4f60\u7684\u5065\u5eb7\u5efa\u8bae\u3002",12,NativeUi.MUTED));
        for(int i=0;i<keys.length;i++)fields[i]=input(form,names[i],amount(metric(settings,keys[i])),true);
        editor=new AlertDialog.Builder(activity).setTitle("\u70ed\u91cf\u4e0e\u8425\u517b\u76ee\u6807").setView(formScroll(form))
            .setNegativeButton("\u53d6\u6d88",null).setPositiveButton("\u4fdd\u5b58",null).create();
        final AlertDialog current=editor;
        current.setOnShowListener(d->current.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v->{
            if(!canWrite())return;
            JSONObject values=new JSONObject();
            for(int i=0;i<keys.length;i++){
                try{values.put(keys[i],WorkbenchNutritionPolicy.number(fields[i].getText().toString(),minimum[i],maximum[i],false));}
                catch(Exception ignored){fields[i].setError("\u8303\u56f4 "+amount(minimum[i])+" \u5230 "+amount(maximum[i]));return;}
            }
            try{write(new JSONObject().put("action","settings.update").put("payload",values),false,current);}
            catch(Exception ignored){notice("\u65e0\u6cd5\u51c6\u5907\u8425\u517b\u76ee\u6807\uff0c\u8bf7\u91cd\u8bd5\u3002");}
        })); current.show();
    }
    private void saveWater() {
        if(!canWrite())return;
        try{write(new JSONObject().put("action","water.add").put("payload",new JSONObject()
            .put("glasses",1).put("loggedAt",WorkbenchNutritionPolicy.iso(selected.getTime()))),false,null);}
        catch(Exception ignored){notice("\u65e0\u6cd5\u51c6\u5907\u996e\u6c34\u8bb0\u5f55\u3002");}
    }
    private void deleteMeal(JSONObject meal) {
        if(!canWrite())return;
        new AlertDialog.Builder(activity).setTitle("\u5220\u9664\u8fd9\u9910\u8bb0\u5f55\uff1f")
            .setMessage("\u4f1a\u540c\u6b65\u5220\u9664\u5de5\u4f5c\u53f0\u4e2d\u7684\u8fd9\u6761\u9910\u98df\u53ca\u5176\u5173\u8054\u7167\u7247\uff0c\u4e0d\u53ea\u662f\u79fb\u9664\u624b\u673a\u663e\u793a\u3002")
            .setNegativeButton("\u53d6\u6d88",null).setPositiveButton("\u786e\u8ba4\u5220\u9664",(d,which)->{
                if(!canWrite())return;
                try{write(new JSONObject().put("action","meal.delete").put("payload",
                    new JSONObject().put("id",meal.optString("id"))),false,null);}
                catch(Exception ignored){notice("\u65e0\u6cd5\u51c6\u5907\u5220\u9664\u64cd\u4f5c\u3002");}
            }).show();
    }
    private void write(JSONObject payload, boolean multipart, AlertDialog form) {
        if (!canWrite()) return;
        writing=true; markUnknown(true); status.setText("\u6b63\u5728\u4fdd\u5b58\uff0c\u5c1a\u672a\u786e\u8ba4\u6210\u529f\u2026"); controls();
        if(form!=null){form.setCancelable(false);form.getButton(AlertDialog.BUTTON_POSITIVE).setEnabled(false);form.getButton(AlertDialog.BUTTON_NEGATIVE).setEnabled(false);}
        MobileApiBridge.Callback callback=envelope->{
            if(closed)return;
            writing=false;
            int code=envelope.optInt("status");
            if(needsAuth(envelope)){
                if(code==401||code==403)markUnknown(false);
                close();host.onAuthRequired();return;
            }
            boolean valid=false;
            if(WorkbenchNutritionPolicy.expectedResponse(envelope.optString("url"),origin)&&code>=200&&code<300){
                if(code==204&&!multipart&&"meal.delete".equals(payload.optString("action")))valid=true;
                else if(WorkbenchNutritionPolicy.jsonType(envelope.optString("type"))){
                    try{JSONObject receipt=new JSONObject(envelope.optString("body"));valid=!receipt.has("error")&&!receipt.optString("id").isEmpty();}
                    catch(Exception ignored){}
                }
            }
            if(valid){
                markUnknown(false); if(form!=null)form.dismiss(); editor=null;
                notice(multipart?"\u9910\u98df\u5df2\u4fdd\u5b58\uff1b\u624b\u52a8\u6216\u6587\u5b57\u4f30\u7b97\uff0c\u672a\u4f7f\u7528\u624b\u673a\u7167\u7247\u8bc6\u522b\u3002":"\u996e\u98df\u64cd\u4f5c\u5df2\u540c\u6b65\u4fdd\u5b58\u3002"); load();return;
            }
            if(code>=400&&code<500){
                markUnknown(false);status.setText(error(envelope));
                if(form!=null){form.setCancelable(true);form.getButton(AlertDialog.BUTTON_POSITIVE).setEnabled(true);form.getButton(AlertDialog.BUTTON_NEGATIVE).setEnabled(true);}
                controls();notice(error(envelope));return;
            }
            loaded=false;verifiedUnknown=false;
            if(form!=null)form.dismiss();editor=null;
            status.setText("\u4fdd\u5b58\u7ed3\u679c\u4e0d\u786e\u5b9a\u3002\u8bf7\u540c\u6b65\u6838\u5bf9\uff0c\u4e0d\u8981\u91cd\u65b0\u63d0\u4ea4\u540c\u4e00\u6761\u3002");render();notice(status.getText().toString());
        };
        if(multipart)api.requestNutritionMeal(payload,callback);else api.request(ENDPOINT,payload,callback);
    }
}
