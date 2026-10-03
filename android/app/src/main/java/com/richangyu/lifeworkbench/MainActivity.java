package com.richangyu.lifeworkbench;

import android.annotation.SuppressLint;
import android.app.AlertDialog;
import android.app.DatePickerDialog;
import android.app.TimePickerDialog;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.ViewParent;
import android.webkit.CookieManager;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceError;
import android.widget.Button;
import android.widget.DatePicker;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.TimePicker;
import android.widget.Toast;

import androidx.activity.OnBackPressedCallback;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;

import org.json.JSONArray;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;
import java.util.UUID;

public class MainActivity extends AppCompatActivity {
    private String baseUrl = "";
    private NativeAiSheet aiSheet;
    private boolean bindingChanging;
    private AlertDialog bindingDialog;
    private static final int INK = Color.rgb(29, 45, 40);
    private static final int MUTED = Color.rgb(102, 116, 109);
    private static final int GREEN = Color.rgb(35, 103, 77);
    private static final int PALE_GREEN = Color.rgb(226, 239, 230);
    private static final int CREAM = Color.rgb(248, 244, 235);
    private static final int AMBER = Color.rgb(235, 169, 66);
    private static final int BLUE = Color.rgb(75, 116, 151);
    private static final int ROSE = Color.rgb(171, 91, 82);

    private FrameLayout root;
    private FrameLayout content;
    private LinearLayout nav;
    private TextView syncLabel;
    private WebView authWebView;
    private JSONObject data;
    private String tab = "home";
    private String deviceId;
    private boolean bridgeReady = false;
    private boolean syncing = false;
    private boolean saving = false;
    private boolean saveOutcomeUnknown = false;
    private MobileApiBridge mobileApi;
    private final Handler clockHandler = new Handler(Looper.getMainLooper());
    private TextView elapsedView;
    private String elapsedStartedAt = "";
    private final Runnable clockTick = new Runnable() {
        @Override public void run() {
            if (elapsedView != null && !elapsedStartedAt.isEmpty()) elapsedView.setText(elapsedLabel(elapsedStartedAt));
            clockHandler.postDelayed(this, 30000);
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(CREAM);
        getWindow().setNavigationBarColor(Color.WHITE);
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR);

        SharedPreferences prefs = getSharedPreferences("native_workbench", MODE_PRIVATE);
        deviceId = prefs.getString("device_id", "");
        if (deviceId.isEmpty()) {
            deviceId = "android-" + UUID.randomUUID();
            prefs.edit().putString("device_id", deviceId).apply();
        }
        CookieManager.getInstance().setAcceptCookie(true);
        baseUrl = WorkbenchClientPolicy.normalizeOrigin(prefs.getString("workbench_url", ""));
        saveOutcomeUnknown = prefs.getBoolean("save_outcome_unknown", false);
        mobileApi = new MobileApiBridge(baseUrl.isEmpty() ? "https://unconfigured.invalid" : baseUrl);
        buildShell();
        setContentView(root);
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        WindowCompat.getInsetsController(getWindow(), root).setAppearanceLightStatusBars(true);
        WindowCompat.getInsetsController(getWindow(), root).setAppearanceLightNavigationBars(true);
        ViewCompat.setOnApplyWindowInsetsListener(root, (view, insets) -> {
            Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars()
                | WindowInsetsCompat.Type.displayCutout() | WindowInsetsCompat.Type.ime());
            view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
            return insets;
        });
        ViewCompat.requestApplyInsets(root);
        showAuth();

        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override public void handleOnBackPressed() {
                View overlay = root.findViewWithTag("auth-overlay");
                if (overlay != null) {
                    if (authWebView != null && authWebView.canGoBack()) authWebView.goBack();
                    else dismissAuth();
                } else if (!"home".equals(tab)) {
                    selectTab("home");
                } else {
                    finish();
                }
            }
        });
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private GradientDrawable background(int color, int radius) {
        GradientDrawable drawable = new GradientDrawable();
        drawable.setColor(color);
        drawable.setCornerRadius(dp(radius));
        return drawable;
    }

    private TextView text(String value, int size, int color) {
        TextView view = new TextView(this);
        view.setText(value);
        view.setTextSize(size);
        view.setTextColor(color);
        view.setLineSpacing(0, 1.15f);
        return view;
    }

    private void buildShell() {
        root = new FrameLayout(this);
        root.setBackgroundColor(CREAM);

        LinearLayout shell = new LinearLayout(this);
        shell.setOrientation(LinearLayout.VERTICAL);
        root.addView(shell, new FrameLayout.LayoutParams(-1, -1));

        LinearLayout header = new LinearLayout(this);
        header.setGravity(Gravity.CENTER_VERTICAL);
        header.setPadding(dp(20), dp(12), dp(18), dp(8));
        TextView brand = text("生活工作台", 23, INK);
        brand.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        header.addView(brand, new LinearLayout.LayoutParams(0, dp(54), 1));
        syncLabel = text("正在连接", 12, MUTED);
        syncLabel.setGravity(Gravity.CENTER);
        syncLabel.setPadding(dp(12), dp(7), dp(12), dp(7));
        syncLabel.setBackground(background(Color.rgb(231, 237, 232), 18));
        syncLabel.setOnClickListener(v -> sync());
        header.addView(syncLabel);
        shell.addView(header, new LinearLayout.LayoutParams(-1, dp(72)));

        content = new FrameLayout(this);
        shell.addView(content, new LinearLayout.LayoutParams(-1, 0, 1));

        nav = new LinearLayout(this);
        nav.setGravity(Gravity.CENTER);
        nav.setPadding(dp(8), dp(5), dp(8), dp(8));
        nav.setBackgroundColor(Color.WHITE);
        addNav("首页", "home");
        addNav("记录", "records");
        addNav("日程", "schedule");
        addNav("AI", "ai");
        addNav("我的", "me");
        shell.addView(nav, new LinearLayout.LayoutParams(-1, dp(68)));
        renderLoading("正在连接你的工作台");
    }

    private void addNav(String label, String key) {
        TextView item = text(label, 14, MUTED);
        item.setTag(key);
        item.setGravity(Gravity.CENTER);
        item.setOnClickListener(v -> selectTab(key));
        nav.addView(item, new LinearLayout.LayoutParams(0, -1, 1));
    }

    private void selectTab(String key) {
        if ("ai".equals(key)) { showAi(); return; }
        tab = key;
        for (int i = 0; i < nav.getChildCount(); i++) {
            TextView item = (TextView) nav.getChildAt(i);
            boolean active = key.equals(item.getTag());
            item.setTextColor(active ? GREEN : MUTED);
            item.setTypeface(Typeface.DEFAULT, active ? Typeface.BOLD : Typeface.NORMAL);
        }
        render();
    }

    private void renderLoading(String label) {
        content.removeAllViews();
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setGravity(Gravity.CENTER);
        ProgressBar progress = new ProgressBar(this);
        box.addView(progress, new LinearLayout.LayoutParams(dp(42), dp(42)));
        TextView hint = text(label, 14, MUTED);
        hint.setPadding(0, dp(14), 0, 0);
        box.addView(hint);
        content.addView(box, new FrameLayout.LayoutParams(-1, -1));
    }

    private LinearLayout page() {
        LinearLayout body = new LinearLayout(this);
        body.setOrientation(LinearLayout.VERTICAL);
        body.setPadding(dp(18), dp(6), dp(18), dp(36));
        return body;
    }

    private LinearLayout card() {
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setPadding(dp(18), dp(17), dp(18), dp(17));
        box.setBackground(background(Color.WHITE, 22));
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, -2);
        params.setMargins(0, 0, 0, dp(12));
        box.setLayoutParams(params);
        return box;
    }

    private void render() {
        if (data == null) {
            showError("尚未连接工作台。连接成功后会在这里显示原生打卡、记录和日程页面。");
            return;
        }
        content.removeAllViews();
        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        LinearLayout body = page();
        scroll.addView(body);
        content.addView(scroll, new FrameLayout.LayoutParams(-1, -1));
        if ("records".equals(tab)) renderRecords(body);
        else if ("schedule".equals(tab)) renderSchedules(body);
        else if ("me".equals(tab)) renderMe(body);
        else renderHome(body);
    }

    private void renderHome(LinearLayout body) {
        JSONObject user = data.optJSONObject("user");
        String name = user == null ? "你好" : user.optString("displayName", "你好");
        TextView greeting = text("今天好，" + name, 27, INK);
        greeting.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        body.addView(greeting);
        TextView day = text(new SimpleDateFormat("M月d日 EEEE", Locale.CHINA).format(new Date()), 14, MUTED);
        day.setPadding(0, dp(4), 0, dp(16));
        body.addView(day);

        addCheckinCard(body);
        addQuickActions(body);

        JSONObject summary = data.optJSONObject("summary");
        LinearLayout overview = card();
        TextView overviewTitle = text("今天的工作台", 17, INK);
        overviewTitle.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        overview.addView(overviewTitle);
        String summaryText = (summary == null ? 0 : summary.optInt("todayRecords")) + " 条记录  ·  "
            + (summary == null ? 0 : summary.optInt("upcomingSchedules")) + " 个近期日程  ·  "
            + (summary == null ? 0 : summary.optInt("inboxPending")) + " 条待整理";
        TextView numbers = text(summaryText, 13, MUTED);
        numbers.setPadding(0, dp(8), 0, 0);
        overview.addView(numbers);
        body.addView(overview);

        sectionTitle(body, "近期日程");
        JSONArray schedules = data.optJSONArray("schedules");
        if (schedules == null || schedules.length() == 0) {
            emptyCard(body, "还没有日程", "安排一件接下来要做的事。", "新增日程", this::showScheduleDialog);
        } else {
            for (int i = 0; i < Math.min(3, schedules.length()); i++) addSchedule(body, schedules.optJSONObject(i));
        }

        sectionTitle(body, "最近记录");
        JSONArray records = data.optJSONArray("records");
        if (records == null || records.length() == 0) {
            emptyCard(body, "还没有记录", "从一条简短的想法开始。", "写一条", this::showRecordDialog);
        } else {
            for (int i = 0; i < Math.min(3, records.length()); i++) addRecord(body, records.optJSONObject(i));
        }
    }

    private void addCheckinCard(LinearLayout body) {
        JSONObject active = data.optJSONObject("activeCheckin");
        LinearLayout box = card();
        box.setBackground(background(active == null ? PALE_GREEN : Color.rgb(224, 238, 230), 24));
        TextView eyebrow = text(active == null ? "专注打卡" : "正在打卡", 13, GREEN);
        eyebrow.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        box.addView(eyebrow);
        TextView title = text(active == null ? "开始一段专注时间" : active.optString("title", "专注打卡"), 22, INK);
        title.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        title.setPadding(0, dp(6), 0, dp(5));
        box.addView(title);
        elapsedStartedAt = active == null ? "" : active.optString("happenedAt");
        elapsedView = text(active == null ? "联网保存成功后，与电脑工作台共用记录。" : elapsedLabel(elapsedStartedAt), 13, MUTED);
        box.addView(elapsedView);
        Button button = primaryButton(active == null ? "开始打卡" : "结束并保存");
        LinearLayout.LayoutParams params = (LinearLayout.LayoutParams) button.getLayoutParams();
        params.setMargins(0, dp(14), 0, 0);
        button.setLayoutParams(params);
        button.setOnClickListener(v -> {
            if (active == null) showStartCheckinDialog();
            else showStopCheckinDialog(active);
        });
        box.addView(button);
        body.addView(box);
    }

    private void addQuickActions(LinearLayout body) {
        sectionTitle(body, "快捷操作");
        LinearLayout first = quickRow();
        JSONObject active = data.optJSONObject("activeCheckin");
        first.addView(quickAction(active == null ? "开始打卡" : "结束打卡", "记录专注时间", GREEN,
            () -> { if (active == null) showStartCheckinDialog(); else showStopCheckinDialog(active); }), quickParams(true));
        first.addView(quickAction("写记录", "记下此刻", BLUE, this::showRecordDialog), quickParams(false));
        body.addView(first);

        LinearLayout second = quickRow();
        second.addView(quickAction("安排日程", "规划时间", AMBER, this::showScheduleDialog), quickParams(true));
        second.addView(quickAction("收件箱", "稍后整理", ROSE, this::showInboxDialog), quickParams(false));
        body.addView(second);
    }

    private LinearLayout quickRow() {
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        return row;
    }

    private LinearLayout.LayoutParams quickParams(boolean left) {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(0, dp(104), 1);
        params.setMargins(left ? 0 : dp(6), 0, left ? dp(6) : 0, dp(12));
        return params;
    }

    private View quickAction(String title, String hint, int accent, Runnable action) {
        LinearLayout item = new LinearLayout(this);
        item.setOrientation(LinearLayout.VERTICAL);
        item.setGravity(Gravity.CENTER_VERTICAL);
        item.setPadding(dp(16), dp(14), dp(14), dp(14));
        item.setBackground(background(Color.WHITE, 20));
        item.setOnClickListener(v -> action.run());
        TextView dot = text("●", 12, accent);
        item.addView(dot);
        TextView label = text(title, 17, INK);
        label.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        label.setPadding(0, dp(4), 0, dp(2));
        item.addView(label);
        item.addView(text(hint, 12, MUTED));
        return item;
    }

    private void renderRecords(LinearLayout body) {
        pageTitle(body, "生活记录", "手机和电脑使用同一份数据。", "写一条记录", this::showRecordDialog);
        JSONArray records = data.optJSONArray("records");
        if (records == null || records.length() == 0) {
            emptyCard(body, "这里还没有内容", "记录想法、生活片段或今天完成的事情。", "开始记录", this::showRecordDialog);
        } else {
            for (int i = 0; i < records.length(); i++) addRecord(body, records.optJSONObject(i));
        }
    }

    private void renderSchedules(LinearLayout body) {
        pageTitle(body, "日程安排", "新增后会自动同步到电脑工作台。", "新增日程", this::showScheduleDialog);
        JSONArray schedules = data.optJSONArray("schedules");
        if (schedules == null || schedules.length() == 0) {
            emptyCard(body, "近期没有安排", "添加一次会议、出行或个人计划。", "安排日程", this::showScheduleDialog);
        } else {
            for (int i = 0; i < schedules.length(); i++) addSchedule(body, schedules.optJSONObject(i));
        }
    }

    private void renderMe(LinearLayout body) {
        sectionTitle(body, "我的 App");
        JSONObject user = data.optJSONObject("user");
        LinearLayout account = card();
        TextView name = text(user == null ? "已连接" : user.optString("displayName", "已连接"), 20, INK);
        name.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        account.addView(name);
        account.addView(text(user == null ? "" : user.optString("email"), 13, MUTED));
        TextView version = text("原生安卓开发版 · v1.8.2", 13, GREEN);
        version.setPadding(0, dp(8), 0, 0);
        account.addView(version);
        body.addView(account);
        LinearLayout binding = card();
        binding.addView(text("绑定的工作台", 16, INK));
        binding.addView(text(Uri.parse(baseUrl).getHost(), 12, MUTED));
        binding.addView(text("使用授权账号访问云端数据，不把 AI 密钥放进 App。", 12, GREEN));
        Button changeBinding = secondaryButton("更换工作台");
        changeBinding.setOnClickListener(v -> showBinding());
        binding.addView(changeBinding);
        body.addView(binding);
        if (saveOutcomeUnknown) {
            LinearLayout uncertain = card();
            uncertain.addView(text("有一次保存结果待核实", 17, INK));
            uncertain.addView(text("请先同步查看。网络超时不代表没有保存，App 不会自动重发。", 13, MUTED));
            Button acknowledge = secondaryButton("我已核对云端结果");
            acknowledge.setOnClickListener(v -> new AlertDialog.Builder(this).setTitle("确认已核对")
                .setMessage("确认后允许发起新的操作，不会重发上一次保存。请避免重复添加已经存在的内容。")
                .setNegativeButton("继续核对", null)
                .setPositiveButton("已核对", (dialog, which) -> { setSaveOutcomeUnknown(false); render(); }).show());
            uncertain.addView(acknowledge);
            body.addView(uncertain);
        }

        JSONObject summary = data.optJSONObject("summary");
        LinearLayout stats = card();
        stats.addView(text("云端共有 " + (summary == null ? 0 : summary.optInt("totalRecords")) + " 条记录", 16, INK));
        TextView pending = text("收件箱待整理 " + (summary == null ? 0 : summary.optInt("inboxPending")) + " 条", 14, MUTED);
        pending.setPadding(0, dp(7), 0, dp(5));
        stats.addView(pending);
        stats.addView(text("最近同步：" + pretty(data.optString("serverTime")), 13, MUTED));
        body.addView(stats);

        Button refresh = secondaryButton("立即同步");
        refresh.setOnClickListener(v -> sync());
        body.addView(refresh);
        Button relink = secondaryButton("重新授权设备");
        relink.setOnClickListener(v -> {
            if (saving) { Toast.makeText(this, "请先等待当前保存结束。", Toast.LENGTH_LONG).show(); return; }
            new AlertDialog.Builder(this).setTitle("重新授权工作台")
                .setMessage("会清除本 App 的登录会话和当前页面数据，不会删除云端记录。")
                .setNegativeButton("取消", null)
                .setPositiveButton("重新授权", (dialog, which) -> {
                    bridgeReady = false;
                    mobileApi.cancelPending();
                    data = null;
                    syncLabel.setText("需要授权");
                    showError("请重新连接工作台。");
                    CookieManager.getInstance().removeAllCookies(removed -> {
                        CookieManager.getInstance().flush(); showAuth();
                    });
                }).show();
        });
        body.addView(relink);
    }

    private void pageTitle(LinearLayout body, String title, String hint, String action, Runnable listener) {
        TextView heading = text(title, 27, INK);
        heading.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        body.addView(heading);
        TextView subtitle = text(hint, 13, MUTED);
        subtitle.setPadding(0, dp(4), 0, dp(14));
        body.addView(subtitle);
        Button button = primaryButton(action);
        button.setOnClickListener(v -> listener.run());
        body.addView(button);
        View spacer = new View(this);
        body.addView(spacer, new LinearLayout.LayoutParams(1, dp(8)));
    }

    private void sectionTitle(LinearLayout body, String title) {
        TextView heading = text(title, 19, INK);
        heading.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        heading.setPadding(0, dp(11), 0, dp(10));
        body.addView(heading);
    }

    private void addRecord(LinearLayout body, JSONObject record) {
        if (record == null) return;
        LinearLayout item = card();
        String title = record.optString("title");
        String contentText = record.optString("content");
        String display = title.isEmpty() ? (contentText.isEmpty() ? "一条记录" : contentText) : title;
        TextView heading = text(display, 17, INK);
        heading.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        heading.setMaxLines(2);
        item.addView(heading);
        if (!title.isEmpty() && !contentText.isEmpty()) {
            TextView excerpt = text(contentText, 14, MUTED);
            excerpt.setMaxLines(3);
            excerpt.setPadding(0, dp(7), 0, dp(8));
            item.addView(excerpt);
        }
        item.addView(text(record.optString("kind", "生活") + "  ·  " + pretty(record.optString("happenedAt")), 12, GREEN));
        item.setOnClickListener(v -> new AlertDialog.Builder(this).setTitle(display)
            .setMessage(contentText + "\n\n" + pretty(record.optString("happenedAt")))
            .setPositiveButton("关闭", null).show());
        body.addView(item);
    }

    private void addSchedule(LinearLayout body, JSONObject schedule) {
        if (schedule == null) return;
        LinearLayout item = card();
        TextView heading = text(schedule.optString("title", "日程"), 17, INK);
        heading.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        item.addView(heading);
        TextView time = text(pretty(schedule.optString("startAt")) + "\n结束：" + pretty(schedule.optString("endAt"))
            + "  ·  " + schedule.optString("status", "计划中"), 13, GREEN);
        time.setPadding(0, dp(6), 0, 0);
        item.addView(time);
        String place = schedule.optString("place");
        if (!place.isEmpty()) item.addView(text(place, 13, MUTED));
        String note = schedule.optString("note");
        if (!note.isEmpty()) item.addView(text(note, 13, MUTED));
        body.addView(item);
    }

    private void emptyCard(LinearLayout body, String title, String hint, String action, Runnable listener) {
        LinearLayout empty = card();
        TextView heading = text(title, 17, INK);
        heading.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        empty.addView(heading);
        TextView description = text(hint, 13, MUTED);
        description.setPadding(0, dp(6), 0, dp(12));
        empty.addView(description);
        Button button = secondaryButton(action);
        button.setOnClickListener(v -> listener.run());
        empty.addView(button);
        body.addView(empty);
    }

    private Button primaryButton(String value) {
        Button button = new Button(this);
        button.setText(value);
        button.setTextColor(Color.WHITE);
        button.setTextSize(15);
        button.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        button.setAllCaps(false);
        button.setBackground(background(GREEN, 17));
        button.setLayoutParams(new LinearLayout.LayoutParams(-1, dp(52)));
        return button;
    }

    private Button secondaryButton(String value) {
        Button button = new Button(this);
        button.setText(value);
        button.setTextColor(INK);
        button.setTextSize(15);
        button.setAllCaps(false);
        button.setBackground(background(Color.WHITE, 17));
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, dp(52));
        params.setMargins(0, 0, 0, dp(10));
        button.setLayoutParams(params);
        return button;
    }

    private EditText input(String hint, boolean multiline) {
        EditText edit = new EditText(this);
        edit.setHint(hint);
        edit.setTextColor(INK);
        edit.setHintTextColor(Color.rgb(145, 154, 149));
        edit.setTextSize(16);
        edit.setPadding(dp(14), dp(12), dp(14), dp(12));
        edit.setBackground(background(Color.rgb(244, 246, 242), 14));
        if (multiline) {
            edit.setInputType(android.text.InputType.TYPE_CLASS_TEXT | android.text.InputType.TYPE_TEXT_FLAG_MULTI_LINE);
            edit.setMinLines(4);
        } else edit.setSingleLine(true);
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, -2);
        params.setMargins(0, 0, 0, dp(12));
        edit.setLayoutParams(params);
        return edit;
    }

    private LinearLayout dialogForm() {
        LinearLayout form = new LinearLayout(this);
        form.setOrientation(LinearLayout.VERTICAL);
        form.setPadding(dp(22), dp(8), dp(22), 0);
        return form;
    }

    private void showStartCheckinDialog() {
        LinearLayout form = dialogForm();
        EditText title = input("这次要专注什么？", false);
        title.setText("专注打卡");
        form.addView(title);
        new AlertDialog.Builder(this)
            .setTitle("开始打卡")
            .setMessage("开始后可以继续使用 App，完成时点击结束。")
            .setView(form)
            .setNegativeButton("取消", null)
            .setPositiveButton("开始", (dialog, which) -> {
                JSONObject payload = basePayload("checkin.start");
                put(payload, "title", title.getText().toString());
                submit(payload, "打卡已开始");
            }).show();
    }

    private void showStopCheckinDialog(JSONObject active) {
        LinearLayout form = dialogForm();
        EditText note = input("完成了什么？（可选）", true);
        form.addView(note);
        new AlertDialog.Builder(this)
            .setTitle("结束打卡")
            .setMessage(active.optString("title", "专注打卡") + " · " + elapsedLabel(active.optString("happenedAt")))
            .setView(form)
            .setNegativeButton("继续打卡", null)
            .setPositiveButton("结束并保存", (dialog, which) -> {
                JSONObject payload = basePayload("checkin.stop");
                put(payload, "id", active.optString("id"));
                put(payload, "note", note.getText().toString());
                submit(payload, "打卡记录已保存");
            }).show();
    }

    private void showRecordDialog() {
        LinearLayout form = dialogForm();
        EditText title = input("标题（可选）", false);
        EditText body = input("现在发生了什么？", true);
        form.addView(title);
        form.addView(body);
        AlertDialog dialog = new AlertDialog.Builder(this).setTitle("新建记录").setView(scrollForm(form))
            .setNegativeButton("取消", null)
            .setPositiveButton("保存", null).create();
        dialog.setOnShowListener(ignored -> dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v -> {
                if (title.getText().toString().trim().isEmpty() && body.getText().toString().trim().isEmpty()) {
                    body.setError("请填写记录内容。"); return;
                }
                JSONObject payload = basePayload("event.create");
                put(payload, "title", title.getText().toString());
                put(payload, "content", body.getText().toString());
                put(payload, "happenedAt", iso(new Date()));
                submit(payload, "记录已保存", dialog::dismiss);
            }));
        dialog.show();
    }

    private void showInboxDialog() {
        LinearLayout form = dialogForm();
        EditText body = input("先记下来，稍后再整理", true);
        form.addView(body);
        new AlertDialog.Builder(this).setTitle("放入收件箱").setView(form)
            .setNegativeButton("取消", null)
            .setPositiveButton("保存", (dialog, which) -> {
                JSONObject payload = basePayload("inbox.create");
                put(payload, "content", body.getText().toString());
                submit(payload, "已放入收件箱");
            }).show();
    }

    private void showScheduleDialog() {
        LinearLayout form = dialogForm();
        EditText title = input("日程名称", false);
        EditText place = input("地点（可选）", false);
        Calendar start = Calendar.getInstance(TimeZone.getTimeZone("Asia/Shanghai"), Locale.CHINA);
        start.add(Calendar.HOUR_OF_DAY, 1);
        start.set(Calendar.SECOND, 0);
        start.set(Calendar.MILLISECOND, 0);
        Calendar end = (Calendar) start.clone();
        end.add(Calendar.HOUR_OF_DAY, 1);
        Button time = secondaryButton(scheduleLabel(start));
        Button endTime = secondaryButton("结束：" + scheduleLabel(end));
        time.setOnClickListener(v -> pickDateTime(start, time, () -> {
            if (!end.after(start)) end.setTimeInMillis(start.getTimeInMillis() + 3600000);
            endTime.setText("结束：" + scheduleLabel(end));
        }));
        endTime.setOnClickListener(v -> pickDateTime(end, endTime, () -> endTime.setText("结束：" + scheduleLabel(end))));
        form.addView(title);
        form.addView(time);
        form.addView(endTime);
        form.addView(place);
        AlertDialog dialog = new AlertDialog.Builder(this).setTitle("新建日程").setView(scrollForm(form))
            .setNegativeButton("取消", null)
            .setPositiveButton("保存", null).create();
        dialog.setOnShowListener(ignored -> dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v -> {
                if (title.getText().toString().trim().isEmpty()) { title.setError("请填写日程名称。"); return; }
                if (!end.after(start)) { Toast.makeText(this, "结束时间必须晚于开始时间。", Toast.LENGTH_LONG).show(); return; }
                JSONObject payload = basePayload("schedule.create");
                put(payload, "title", title.getText().toString());
                put(payload, "place", place.getText().toString());
                put(payload, "startAt", iso(start.getTime()));
                put(payload, "endAt", iso(end.getTime()));
                submit(payload, "日程已保存", dialog::dismiss);
            }));
        dialog.show();
    }

    private View scrollForm(LinearLayout form) {
        ScrollView scroll = new ScrollView(this); scroll.addView(form); return scroll;
    }
    private void pickDateTime(Calendar value, Button target, Runnable changed) {
        DatePickerDialog dateDialog = new DatePickerDialog(this, (DatePicker view, int year, int month, int day) -> {
            value.set(year, month, day);
            TimePickerDialog timeDialog = new TimePickerDialog(this, (TimePicker timeView, int hour, int minute) -> {
                value.set(Calendar.HOUR_OF_DAY, hour);
                value.set(Calendar.MINUTE, minute);
                target.setText(scheduleLabel(value));
                changed.run();
            }, value.get(Calendar.HOUR_OF_DAY), value.get(Calendar.MINUTE), true);
            timeDialog.show();
        }, value.get(Calendar.YEAR), value.get(Calendar.MONTH), value.get(Calendar.DAY_OF_MONTH));
        dateDialog.show();
    }

    private String scheduleLabel(Calendar value) {
        SimpleDateFormat format = new SimpleDateFormat("M月d日 HH:mm", Locale.CHINA);
        format.setTimeZone(TimeZone.getTimeZone("Asia/Shanghai"));
        return format.format(value.getTime()) + "（北京时间）";
    }

    private JSONObject basePayload(String action) {
        JSONObject payload = new JSONObject();
        put(payload, "action", action);
        put(payload, "deviceId", deviceId);
        return payload;
    }

    private void put(JSONObject object, String key, Object value) {
        try { object.put(key, value); } catch (Exception ignored) { }
    }

    private void submit(JSONObject payload, String successMessage) {
        submit(payload, successMessage, null);
    }
    private void submit(JSONObject payload, String successMessage, Runnable onSaved) {
        if (saving) { Toast.makeText(this, "正在保存，请不要重复点击。", Toast.LENGTH_SHORT).show(); return; }
        if (saveOutcomeUnknown) {
            Toast.makeText(this, "上次保存结果待核实。请先同步查看，再到“我的”确认结果。", Toast.LENGTH_LONG).show(); return;
        }
        if (!bridgeReady) {
            showAuth();
            return;
        }
        saving = true;
        syncLabel.setText("正在保存");
        api("POST", payload, envelope -> {
            saving = false;
            int status = envelope.optInt("status");
            if (needsAuth(envelope)) {
                showAuth();
                return;
            }
            if (status >= 400 || status == 0) {
                setSaveOutcomeUnknown(status == 0 || status >= 500);
                syncLabel.setText(saveOutcomeUnknown ? "结果待核实" : "保存失败");
                Toast.makeText(this, responseError(envelope), Toast.LENGTH_LONG).show();
                return;
            }
            try {
                JSONObject receipt = new JSONObject(envelope.optString("body"));
                if (receipt.has("error") || receipt.optString("id").isEmpty()) throw new IllegalArgumentException("invalid receipt");
                Toast.makeText(this, receipt.optBoolean("alreadyRunning") ? "已有正在进行的打卡，没有重复创建。" : successMessage, Toast.LENGTH_SHORT).show();
            } catch (Exception error) {
                setSaveOutcomeUnknown(true);
                syncLabel.setText("结果待核实");
                Toast.makeText(this, "没有收到有效保存回执，请先同步核对。", Toast.LENGTH_LONG).show(); return;
            }
            if (onSaved != null) onSaved.run();
            sync();
        });
    }

    private void sync() {
        if (syncing || saving) return;
        if (!bridgeReady || authWebView == null) {
            showAuth();
            return;
        }
        syncing = true;
        syncLabel.setText("同步中");
        api("GET", null, envelope -> {
            syncing = false;
            int status = envelope.optInt("status");
            if (needsAuth(envelope)) {
                syncLabel.setText("需要授权");
                showAuth();
                return;
            }
            if (status >= 400 || status == 0) {
                syncLabel.setText("连接失败");
                if (data == null) showError(responseError(envelope));
                else Toast.makeText(this, responseError(envelope), Toast.LENGTH_LONG).show();
                return;
            }
            try {
                JSONObject snapshot = new JSONObject(envelope.optString("body", "{}"));
                if (snapshot.optJSONObject("user") == null || snapshot.optJSONArray("records") == null
                    || snapshot.optJSONArray("schedules") == null || snapshot.optJSONObject("summary") == null) {
                    throw new IllegalArgumentException("invalid mobile snapshot");
                }
                data = snapshot;
                CookieManager.getInstance().flush();
                syncLabel.setText(saveOutcomeUnknown ? "结果待核实" : "已同步");
                closeAuth();
                selectTab(tab);
            } catch (Exception error) {
                syncLabel.setText("数据异常");
                showError("工作台返回的数据无法读取，请重新连接。");
            }
        });
    }

    private boolean needsAuth(JSONObject envelope) {
        int status = envelope.optInt("status");
        String type = envelope.optString("type");
        String url = envelope.optString("url");
        if (status == 0) return false;
        Uri uri = Uri.parse(url);
        return status == 401 || status == 403 || type.contains("text/html")
            || !mobileApi.matchesOrigin(uri) || !"/api/mobile".equals(uri.getPath());
    }

    private String responseError(JSONObject envelope) {
        String body = envelope.optString("body");
        try {
            String message = new JSONObject(body).optString("error");
            if (!message.isEmpty()) return message.substring(0, Math.min(240, message.length()));
        } catch (Exception ignored) { }
        return "暂时无法连接工作台，请检查网络或重新授权。HTTP " + envelope.optInt("status");
    }

    private void showError(String message) {
        content.removeAllViews();
        LinearLayout box = card();
        box.addView(text("工作台暂时没有连接成功", 20, INK));
        TextView detail = text(message, 14, MUTED);
        detail.setPadding(0, dp(8), 0, dp(14));
        box.addView(detail);
        Button retry = primaryButton("重新连接");
        retry.setOnClickListener(v -> showAuth());
        box.addView(retry);
        Button binding = secondaryButton("设置 / 更换工作台地址");
        binding.setOnClickListener(v -> showBinding());
        box.addView(binding);
        FrameLayout.LayoutParams params = new FrameLayout.LayoutParams(-1, -2, Gravity.CENTER);
        params.setMargins(dp(20), 0, dp(20), 0);
        content.addView(box, params);
    }

    private void setSaveOutcomeUnknown(boolean value) {
        saveOutcomeUnknown = value;
        getSharedPreferences("native_workbench", MODE_PRIVATE).edit().putBoolean("save_outcome_unknown", value).apply();
    }

    private void showAi() {
        if (saving || syncing || bindingChanging) { Toast.makeText(this, "请先等待当前连接或保存完成。", Toast.LENGTH_SHORT).show(); return; }
        if (!bridgeReady || data == null) { showAuth(); return; }
        if (aiSheet != null) return;
        aiSheet = new NativeAiSheet(this, mobileApi, new NativeAiSheet.Host() {
            @Override public boolean writesBlocked() { return saveOutcomeUnknown || saving; }
            @Override public void onAuthRequired() {
                if (aiSheet != null) aiSheet.close();
                showAuth();
            }
            @Override public void onSaved() { sync(); }
            @Override public void onUnknownSave() {
                setSaveOutcomeUnknown(true); syncLabel.setText("结果待核实");
            }
            @Override public void onClosed() { aiSheet = null; }
        });
        aiSheet.show();
    }

    private void showBinding() {
        if (bindingChanging || saving || syncing || (aiSheet != null && aiSheet.isBusy())) {
            Toast.makeText(this, "请先等待当前请求结束。", Toast.LENGTH_LONG).show(); return;
        }
        if (saveOutcomeUnknown) {
            Toast.makeText(this, "请先同步核对上次保存，在“我的”确认后再更换工作台。", Toast.LENGTH_LONG).show(); return;
        }
        if (bindingDialog != null && bindingDialog.isShowing()) return;
        EditText address = input("https://你的工作台域名", false);
        address.setInputType(android.text.InputType.TYPE_CLASS_TEXT | android.text.InputType.TYPE_TEXT_VARIATION_URI);
        address.setText(baseUrl);
        address.setFilters(new android.text.InputFilter[] {new android.text.InputFilter.LengthFilter(300)});
        LinearLayout form = card();
        form.addView(text("填写自己的可信 HTTPS 工作台根地址，不填登录链接、密钥或密码。新地址会接收本次授权与操作。", 14, MUTED));
        form.addView(address);
        bindingDialog = new AlertDialog.Builder(this).setTitle(baseUrl.isEmpty() ? "绑定我的工作台" : "更换工作台")
            .setView(form).setNegativeButton("暂不连接", (d, which) -> {
                if (baseUrl.isEmpty()) showError("尚未设置工作台地址，可随时点击下方按钮连接。");
            }).setPositiveButton("连接", null).create();
        bindingDialog.setOnShowListener(v -> bindingDialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(w -> {
            String next = WorkbenchClientPolicy.normalizeOrigin(address.getText().toString());
            if (next.isEmpty()) { address.setError("只接受 HTTPS 根域名地址，不支持路径、参数、IP 或本地地址。"); return; }
            if (next.equals(baseUrl)) { bindingDialog.dismiss(); showAuth(); return; }
            if (!baseUrl.isEmpty()) {
                new AlertDialog.Builder(this).setTitle("确认切换到 " + Uri.parse(next).getHost())
                    .setMessage("会清除本 App 的登录会话、当前页面和 AI 草稿，再授权新工作台。不会删除旧工作台的云端记录。请确认新域名可信。")
                    .setNegativeButton("取消", null).setPositiveButton("确认更换", (d, which) -> {
                        bindingDialog.dismiss(); bindWorkbench(next);
                    }).show();
            } else { bindingDialog.dismiss(); bindWorkbench(next); }
        }));
        bindingDialog.show();
    }

    private void bindWorkbench(String origin) {
        bindingChanging = true;
        if (aiSheet != null) aiSheet.close();
        bridgeReady = false; mobileApi.close();
        if (authWebView != null) {
            authWebView.stopLoading(); detach(authWebView); authWebView.destroy(); authWebView = null;
        }
        View overlay = root.findViewWithTag("auth-overlay");
        if (overlay != null) root.removeView(overlay);
        data = null; tab = "home"; baseUrl = origin;
        deviceId = "android-" + UUID.randomUUID();
        getSharedPreferences("native_workbench", MODE_PRIVATE).edit()
            .putString("workbench_url", baseUrl).putString("device_id", deviceId).apply();
        android.webkit.WebStorage.getInstance().deleteAllData();
        mobileApi = new MobileApiBridge(baseUrl);
        syncLabel.setText("正在切换"); renderLoading("正在准备新工作台授权");
        CookieManager.getInstance().removeAllCookies(removed -> {
            if (isFinishing() || isDestroyed()) return;
            CookieManager.getInstance().flush(); bindingChanging = false; showAuth();
        });
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void showAuth() {
        if (bindingChanging) return;
        if (baseUrl.isEmpty()) { showError("先设置自己的 HTTPS 工作台地址。"); showBinding(); return; }
        if (root.findViewWithTag("auth-overlay") != null) return;
        bridgeReady = false;
        if (saving) return;
        mobileApi.cancelPending();

        FrameLayout overlay = new FrameLayout(this);
        overlay.setBackgroundColor(Color.WHITE);
        overlay.setTag("auth-overlay");
        LinearLayout shell = new LinearLayout(this);
        shell.setOrientation(LinearLayout.VERTICAL);

        LinearLayout authHeader = new LinearLayout(this);
        authHeader.setOrientation(LinearLayout.VERTICAL);
        authHeader.setPadding(dp(20), dp(13), dp(20), dp(10));
        TextView title = text("连接生活工作台", 19, INK);
        title.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        authHeader.addView(title);
        authHeader.addView(text("仅此页用于授权，读取数据成功后进入原生页面。", 12, MUTED));
        LinearLayout authActions = new LinearLayout(this);
        Button cancel = secondaryButton("返回 App");
        cancel.setOnClickListener(v -> dismissAuth());
        authActions.addView(cancel, new LinearLayout.LayoutParams(0, dp(44), 1));
        Button retry = secondaryButton("重新加载");
        retry.setOnClickListener(v -> authWebView.loadUrl(baseUrl + "/mobile-connect"));
        authActions.addView(retry, new LinearLayout.LayoutParams(0, dp(44), 1));
        authHeader.addView(authActions);
        shell.addView(authHeader, new LinearLayout.LayoutParams(-1, -2));

        if (authWebView == null) {
            authWebView = new WebView(this);
            WebSettings settings = authWebView.getSettings();
            settings.setJavaScriptEnabled(true);
            settings.setDomStorageEnabled(true);
            settings.setAllowFileAccess(false);
            settings.setAllowContentAccess(false);
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
            settings.setJavaScriptCanOpenWindowsAutomatically(false);
            if (Build.VERSION.SDK_INT >= 26) settings.setSafeBrowsingEnabled(true);
            settings.setUserAgentString(settings.getUserAgentString() + " RichangyuNative/1.8.2");
            CookieManager.getInstance().setAcceptThirdPartyCookies(authWebView, true);
            if (!mobileApi.attach(authWebView)) {
                authWebView.destroy(); authWebView = null;
                showError("系统网页组件过旧，无法建立安全连接。请更新 Android System WebView 或 Chrome 后重试。"); return;
            }
            authWebView.setWebViewClient(new WebViewClient() {
                @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                    if ("https".equalsIgnoreCase(request.getUrl().getScheme()) && request.getUrl().getUserInfo() == null) return false;
                    Toast.makeText(MainActivity.this, "只允许安全的 HTTPS 授权页面。", Toast.LENGTH_LONG).show(); return true;
                }
                @Override public void onPageStarted(WebView view, String url, android.graphics.Bitmap icon) {
                    bridgeReady = false; mobileApi.cancelPending();
                }
                @Override public void onPageFinished(WebView view, String url) {
                    Uri uri = Uri.parse(url);
                    if (mobileApi.matchesOrigin(uri) && ("/mobile-connect".equals(uri.getPath())
                        || "/".equals(uri.getPath()) || "".equals(uri.getPath()))) {
                        bridgeReady = true;
                        sync();
                    }
                }
                @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                    if (request.isForMainFrame()) {
                        bridgeReady = false; syncLabel.setText("连接失败");
                        Toast.makeText(MainActivity.this, "授权页面未加载成功，请检查网络后重新加载。", Toast.LENGTH_LONG).show();
                    }
                }
            });
        } else {
            detach(authWebView);
        }
        authWebView.setVisibility(View.VISIBLE);
        shell.addView(authWebView, new LinearLayout.LayoutParams(-1, 0, 1));
        overlay.addView(shell, new FrameLayout.LayoutParams(-1, -1));
        root.addView(overlay, new FrameLayout.LayoutParams(-1, -1));
        authWebView.loadUrl(baseUrl + "/mobile-connect");
    }

    private void closeAuth() {
        if (authWebView == null) return;
        detach(authWebView);
        View overlay = root.findViewWithTag("auth-overlay");
        if (overlay != null) root.removeView(overlay);
        authWebView.setVisibility(View.INVISIBLE);
        FrameLayout.LayoutParams hidden = new FrameLayout.LayoutParams(1, 1);
        hidden.gravity = Gravity.TOP | Gravity.START;
        root.addView(authWebView, hidden);
    }

    private void detach(View view) {
        ViewParent parent = view.getParent();
        if (parent instanceof ViewGroup) ((ViewGroup) parent).removeView(view);
    }

    private interface ApiCallback {
        void complete(JSONObject envelope);
    }

    private void api(String method, JSONObject payload, ApiCallback callback) {
        mobileApi.request(payload, callback::complete);
    }
    private void dismissAuth() {
        bridgeReady = false;
        if (authWebView != null) authWebView.stopLoading();
        mobileApi.cancelPending(); closeAuth(); syncLabel.setText("未连接");
        if (data == null) showError("尚未完成授权。点击重新连接，在 App 内完成登录后继续。");
        else render();
    }

    private String elapsedLabel(String raw) {
        try {
            SimpleDateFormat parser = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
            parser.setTimeZone(TimeZone.getTimeZone("UTC"));
            Date start = parser.parse(raw);
            long minutes = Math.max(0, (System.currentTimeMillis() - start.getTime()) / 60000);
            if (minutes < 60) return "已进行 " + minutes + " 分钟";
            return "已进行 " + (minutes / 60) + " 小时 " + (minutes % 60) + " 分钟";
        } catch (Exception ignored) {
            return "打卡进行中";
        }
    }

    private String pretty(String raw) {
        if (raw == null || raw.isEmpty()) return "刚刚";
        String[] patterns = { "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", "yyyy-MM-dd'T'HH:mm:ss'Z'", "yyyy-MM-dd HH:mm:ss" };
        for (String pattern : patterns) {
            try {
                SimpleDateFormat parser = new SimpleDateFormat(pattern, Locale.US);
                parser.setTimeZone(TimeZone.getTimeZone("UTC")); parser.setLenient(false);
                Date date = parser.parse(raw);
                if (date == null) continue;
                SimpleDateFormat display = new SimpleDateFormat("M月d日 HH:mm", Locale.CHINA);
                display.setTimeZone(TimeZone.getTimeZone("Asia/Shanghai"));
                return display.format(date) + "（北京时间）";
            } catch (Exception ignored) { }
        }
        return raw;
    }

    private String iso(Date value) {
        SimpleDateFormat format = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
        format.setTimeZone(TimeZone.getTimeZone("UTC"));
        return format.format(value);
    }

    @Override protected void onResume() {
        super.onResume(); clockHandler.removeCallbacks(clockTick); clockHandler.post(clockTick);
        if (data != null && bridgeReady && !saving && (aiSheet == null || !aiSheet.isBusy())) sync();
    }
    @Override protected void onPause() {
        clockHandler.removeCallbacks(clockTick); super.onPause();
    }
    @Override protected void onDestroy() {
        clockHandler.removeCallbacks(clockTick);
        if (saving || (aiSheet != null && aiSheet.isWriting())) setSaveOutcomeUnknown(true);
        if (aiSheet != null) aiSheet.close();
        if (bindingDialog != null && bindingDialog.isShowing()) bindingDialog.dismiss();
        if (mobileApi != null) mobileApi.close();
        if (authWebView != null) authWebView.destroy();
        super.onDestroy();
    }
}
