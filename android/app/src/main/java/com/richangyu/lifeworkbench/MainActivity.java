package com.richangyu.lifeworkbench;

import android.Manifest;
import android.content.pm.PackageManager;
import android.annotation.SuppressLint;
import android.app.AlertDialog;
import android.app.DatePickerDialog;
import android.app.TimePickerDialog;
import android.content.SharedPreferences;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Intent;
import android.content.ActivityNotFoundException;
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
import android.widget.HorizontalScrollView;
import android.text.Editable;
import android.text.TextWatcher;
import android.view.inputmethod.EditorInfo;
import android.widget.ProgressBar;
import android.widget.RadioButton;
import android.widget.RadioGroup;
import androidx.core.app.ActivityCompat;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.TimePicker;
import android.widget.Toast;

import androidx.activity.OnBackPressedCallback;
import androidx.core.splashscreen.SplashScreen;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;

import org.json.JSONArray;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.ArrayList;
import java.util.List;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;
import java.util.UUID;

public class MainActivity extends AppCompatActivity {
    private String baseUrl = "";
    private static final int REMINDER_PERMISSION_REQUEST = 4100;
    private NativeScheduleReminders reminders;
    private AlertDialog reminderDialog;
    private NativeScheduleReminders.Request pendingReminderRequest;
    private String pendingReminderKey = "";
    private NativeAiSheet aiSheet;
    private NativeWorkSheet workSheet;
    private NativeDraftSheet draftSheet;
    private NativeDraftStore drafts;
    private String activeDraftScope = "";
    private NativeNutritionSheet nutritionSheet;
    private NativeNutritionPhotoPicker nutritionPhotoPicker;
    private boolean bindingChanging;
    private AlertDialog bindingDialog;
    private AlertDialog bindingConfirmation;
    private AlertDialog updateDialog;
    private NativeUpdateChecker updateChecker;
    private AlertDialog diagnosticDialog;
    private String connectionDiagnosticState = "not-started";
    private int lastMobileHttpStatus;
    private String lastNutritionDiagnostic = "";
    private static final int INK = NativeUi.INK;
    private static final int MUTED = NativeUi.MUTED;
    private static final int GREEN = NativeUi.FOREST;
    private static final int PALE_GREEN = NativeUi.MINT;
    private static final int CREAM = NativeUi.PAPER;
    private static final int AMBER = NativeUi.AMBER;
    private static final int BLUE = NativeUi.BLUE;
    private static final int ROSE = NativeUi.ROSE;

    private FrameLayout root;
    private FrameLayout content;
    private LinearLayout nav;
    private TextView syncLabel;
    private WebView authWebView;
    private JSONObject data;
    private String tab = "home";
    private String lastRenderedTab = "";
    private String featureQuery = "";
    private NativeFeatureCatalog.Scope featureScope = NativeFeatureCatalog.Scope.ALL;
    private String recordScope = WorkbenchRecordPolicy.ALL;
    private String recordQuery = "";
    private String scheduleScope = WorkbenchSchedulePolicy.ALL;
    private String scheduleQuery = "";
    private Runnable scheduleFilterTask;
    private String deviceId;
    private boolean bridgeReady = false;
    private boolean syncing = false;
    private boolean saving = false;
    private boolean saveOutcomeUnknown = false;
    private long lastHomeReadAt;
    private boolean homeReadSucceeded;
    private String homeConnectionMessage = "";
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
        SplashScreen.installSplashScreen(this);
        super.onCreate(savedInstanceState);
        nutritionPhotoPicker = new NativeNutritionPhotoPicker(this);
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
        activeDraftScope = prefs.getString("active_scope:" + baseUrl, "");
        drafts = new NativeDraftStore(this, activeDraftScope);
        reminders = new NativeScheduleReminders(this);
        try { reminders.switchScope(activeDraftScope); reminders.restore(); }
        catch (RuntimeException ignored) { /* A fresh authenticated sync can reconcile again. */ }
        readReminderIntent(getIntent());
        mobileApi = new MobileApiBridge(baseUrl.isEmpty() ? "https://unconfigured.invalid" : baseUrl);
        updateChecker = new NativeUpdateChecker();
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
        return NativeUi.label(this, value, size, color, false);
    }

    private void buildShell() {
        root = new FrameLayout(this);
        root.setBackground(NativeUi.pageBackground());
        LinearLayout shell = NativeUi.column(this);
        root.addView(shell, new FrameLayout.LayoutParams(-1, -1));

        LinearLayout header = new LinearLayout(this);
        header.setGravity(Gravity.CENTER_VERTICAL);
        header.setPadding(dp(20), dp(8), dp(18), dp(8));
        NativeUi.IconView mark = new NativeUi.IconView(this, "leaf", GREEN);
        header.addView(mark, new LinearLayout.LayoutParams(dp(28), dp(32)));
        LinearLayout identity = NativeUi.column(this);
        identity.setPadding(dp(10), 0, dp(8), 0);
        TextView brand = text("日常屿", 22, INK);
        brand.setTypeface(NativeUi.DISPLAY);
        identity.addView(brand);
        identity.addView(text("生活工作台", 13, MUTED));
        header.addView(identity, new LinearLayout.LayoutParams(0, -2, 1));
        syncLabel = text(WorkbenchBindingPolicy.entryState(baseUrl) == WorkbenchBindingPolicy.EntryState.NEEDS_BINDING
            ? "待绑定" : "等待授权", 12, GREEN);
        syncLabel.setGravity(Gravity.CENTER);
        syncLabel.setMinHeight(dp(48));
        syncLabel.setMaxLines(2);
        syncLabel.setPadding(dp(12), dp(9), dp(12), dp(9));
        syncLabel.setBackground(NativeUi.touch(this, PALE_GREEN, 16, Color.TRANSPARENT));
        syncLabel.setOnClickListener(v -> sync());
        header.addView(syncLabel, new LinearLayout.LayoutParams(-2, -2));
        shell.addView(header, new LinearLayout.LayoutParams(-1, -2));

        content = new FrameLayout(this);
        shell.addView(content, new LinearLayout.LayoutParams(-1, 0, 1));
        LinearLayout footer = NativeUi.column(this);
        footer.setBackgroundColor(Color.WHITE);
        View line = new View(this);
        line.setBackgroundColor(NativeUi.BORDER);
        footer.addView(line, new LinearLayout.LayoutParams(-1, dp(1)));
        nav = new LinearLayout(this);
        nav.setGravity(Gravity.CENTER);
        nav.setPadding(dp(6), dp(2), dp(6), dp(2));
        addNav("首页", "home");
        addNav("记录", "records");
        addNav("日程", "schedule");
        addNav("AI 助手", "ai");
        addNav("我的", "me");
        footer.addView(nav, new LinearLayout.LayoutParams(-1, -2));
        shell.addView(footer, new LinearLayout.LayoutParams(-1, -2));
        renderLoading("正在连接你的工作台");
    }

    private void addNav(String label, String key) {
        nav.addView(NativeUi.navItem(this, label, key, key.equals(tab), v -> selectTab(key)),
            new LinearLayout.LayoutParams(0, -2, 1));
    }

    private void selectTab(String key) {
        if ("ai".equals(key)) { showAi(); return; }
        tab = key;
        render();
    }

    private void renderLoading(String label) {
        content.removeAllViews();
        LinearLayout box = NativeUi.column(this);
        box.setGravity(Gravity.CENTER);
        NativeUi.IconView mark = new NativeUi.IconView(this, "leaf", GREEN);
        box.addView(mark, new LinearLayout.LayoutParams(dp(52), dp(52)));
        TextView title = text("你的日常，正在就位", 21, INK);
        title.setTypeface(NativeUi.DISPLAY);
        title.setPadding(0, dp(18), 0, dp(12));
        box.addView(title);
        ProgressBar progress = new ProgressBar(this);
        progress.setIndeterminateTintList(android.content.res.ColorStateList.valueOf(GREEN));
        box.addView(progress, new LinearLayout.LayoutParams(dp(28), dp(28)));
        TextView hint = text(label, 13, MUTED);
        hint.setPadding(dp(20), dp(12), dp(20), 0);
        hint.setGravity(Gravity.CENTER);
        box.addView(hint);
        content.addView(box, new FrameLayout.LayoutParams(-1, -1));
    }

    private LinearLayout page() {
        LinearLayout body = NativeUi.column(this);
        body.setPadding(dp(18), dp(12), dp(18), dp(28));
        return body;
    }

    private LinearLayout card() {
        LinearLayout box = NativeUi.column(this);
        box.setPadding(dp(18), dp(18), dp(18), dp(18));
        box.setBackground(NativeUi.shape(this, Color.WHITE, 22, NativeUi.BORDER));
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, -2);
        params.setMargins(0, 0, 0, dp(12));
        box.setLayoutParams(params);
        return box;
    }

    private void render() {
        cancelScheduleFilter();
        for (int i = 0; i < nav.getChildCount(); i++) {
            View item = nav.getChildAt(i);
            NativeUi.selectNav(item, tab.equals(item.getTag()));
        }
        if (data == null && !"features".equals(tab) && !"home".equals(tab)) {
            showError("尚未连接工作台。连接成功后会在这里显示原生打卡、记录和日程页面。");
            return;
        }
        content.removeAllViews();
        elapsedView = null;
        elapsedStartedAt = "";
        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.setVerticalScrollBarEnabled(false);
        LinearLayout body = page();
        scroll.addView(body);
        content.addView(scroll, new FrameLayout.LayoutParams(-1, -1));
        if ("features".equals(tab)) renderFeatures(body);
        else if ("records".equals(tab)) renderRecords(body);
        else if ("schedule".equals(tab)) renderSchedules(body);
        else if ("me".equals(tab)) renderMe(body);
        else renderHome(body);
        if (!tab.equals(lastRenderedTab)) NativeUi.enter(body);
        lastRenderedTab = tab;
    }

    private void renderHome(LinearLayout body) {
        JSONObject user = data == null ? null : data.optJSONObject("user");
        long now = System.currentTimeMillis();
        SimpleDateFormat format = new SimpleDateFormat("M月d日 EEEE", Locale.CHINA);
        format.setTimeZone(TimeZone.getTimeZone("Asia/Shanghai"));
        body.addView(text(format.format(new Date(now)) + " · 北京时间", 13, MUTED));
        TextView heading = text("今天，按自己的节奏", 25, INK);
        heading.setTypeface(NativeUi.DISPLAY);
        heading.setPadding(0, dp(6), 0, dp(10));
        body.addView(heading);
        String displayName = user == null ? "" : user.optString("displayName");
        if (!displayName.isEmpty()) {
            TextView account = text(displayName, 13, MUTED);
            account.setMaxLines(1);
            account.setEllipsize(android.text.TextUtils.TruncateAt.END);
            account.setPadding(0, 0, 0, dp(10));
            body.addView(account);
        }
        addHomeConnectionState(body);
        addQuickActions(body);
        if (data == null) {
            TextView hint = text("连接并读取成功后，这里才会显示你的今日安排与记录。未读取不代表云端没有数据。", 12, MUTED);
            hint.setPadding(0, dp(4), 0, dp(12));
            body.addView(hint);
            addHomeConnectionHelp(body);
            return;
        }
        if (data.optJSONObject("activeCheckin") != null) addCheckinCard(body);
        JSONArray records = data.optJSONArray("records");
        int todayCount = WorkbenchRecordPolicy.select(recordEntries(records),
            WorkbenchRecordPolicy.TODAY, "", now).size();
        TextView summary = text("今日记录 " + todayCount + " · 本机草稿 " + draftCount(), 13, GREEN);
        summary.setPadding(0, dp(4), 0, dp(4));
        body.addView(summary);
        body.addView(text("数量与安排仅统计本次读取到手机的内容，不代表全部云端数据。", 11, MUTED));
        addHomeSectionHeader(body, "今天的安排", "查看今日日程", () -> {
            scheduleScope = WorkbenchSchedulePolicy.TODAY;
            scheduleQuery = "";
            selectTab("schedule");
        });
        JSONArray schedules = data.optJSONArray("schedules");
        List<WorkbenchSchedulePolicy.Entry> rows = new ArrayList<>();
        if (schedules != null) for (int i = 0; i < schedules.length(); i++) {
            JSONObject item = schedules.optJSONObject(i);
            if (item != null) rows.add(new WorkbenchSchedulePolicy.Entry(i, item.optString("title"),
                item.optString("place"), item.optString("note"), item.optString("startAt"), item.optString("endAt")));
        }
        List<WorkbenchSchedulePolicy.Entry> today = WorkbenchSchedulePolicy.select(rows,
            WorkbenchSchedulePolicy.TODAY, "", now);
        if (today.isEmpty()) emptyCard(body, "今天的时间，还可以安排",
            "本次读取的日程中，没有今天的安排。", "安排日程", () -> openHomeAction("schedule-create"));
        else for (int i = 0; i < Math.min(3, today.size()); i++)
            addSchedule(body, schedules.optJSONObject(today.get(i).sourceIndex));
        if (today.size() > 3) body.addView(text("本次读取还有 " + (today.size() - 3)
            + " 条今日安排，可在日程页查看。", 12, MUTED));
        addHomeSectionHeader(body, "最近记录", "查看记录", () -> {
            resetRecordFilters();
            selectTab("records");
        });
        List<WorkbenchRecordPolicy.Entry> recent = WorkbenchRecordPolicy.select(recordEntries(records),
            WorkbenchRecordPolicy.ALL, "", now);
        if (recent.isEmpty()) emptyCard(body, "随手记下今天",
            "本机草稿与云端记录会明确分开。", "写一条记录", () -> openHomeAction("record-create"));
        else for (int i = 0; i < Math.min(3, recent.size()); i++)
            addRecord(body, records.optJSONObject(recent.get(i).sourceIndex));
    }

    private void addHomeConnectionState(LinearLayout body) {
        WorkbenchHomePolicy.SnapshotState state = WorkbenchHomePolicy.snapshotState(
            data != null, bridgeReady, syncing, homeReadSucceeded);
        SimpleDateFormat clock = new SimpleDateFormat("HH:mm", Locale.CHINA);
        clock.setTimeZone(TimeZone.getTimeZone("Asia/Shanghai"));
        String stamp = lastHomeReadAt > 0 ? "上次读取 " + clock.format(new Date(lastHomeReadAt)) : "尚未成功读取";
        if (state == WorkbenchHomePolicy.SnapshotState.FRESH && !saveOutcomeUnknown) {
            TextView status = text(stamp + " · 点右上角可刷新", 11, MUTED);
            status.setPadding(0, 0, 0, dp(10));
            body.addView(status);
            return;
        }
        LinearLayout box = card();
        box.setPadding(dp(14), dp(12), dp(14), dp(12));
        box.setBackground(NativeUi.shape(this, PALE_GREEN, 16, NativeUi.BORDER));
        String title, hint;
        if (state == WorkbenchHomePolicy.SnapshotState.UNAVAILABLE) {
            title = baseUrl.isEmpty() ? "先连接你的工作台" : syncing ? "正在读取工作台" : "连接后，日常就在这里";
            hint = baseUrl.isEmpty() ? "绑定自己的 HTTPS 工作台根地址，不填写邮箱、密码或 API 密钥。"
                : syncing ? "读取完成前不显示云端统计。" : homeConnectionMessage.isEmpty()
                    ? "还没有读取云端数据。先在 App 内登录，再使用记录、热量与日程。"
                    : homeConnectionMessage;
        } else if (state == WorkbenchHomePolicy.SnapshotState.REFRESHING) {
            title = "正在刷新";
            hint = stamp + "；刷新完成前仍显示上次内容。";
        } else if (saveOutcomeUnknown) {
            title = "有保存结果待核对";
            hint = stamp + "；请先同步核对，不要重复提交同一条记录。";
        } else {
            title = "当前显示上次读取内容";
            hint = stamp + "；" + (homeConnectionMessage.isEmpty() ? "请刷新或重新授权。" : homeConnectionMessage);
        }
        box.addView(text(title, 16, GREEN));
        TextView detail = text(hint, 12, MUTED);
        detail.setPadding(0, dp(5), 0, 0);
        box.addView(detail);
        if (state != WorkbenchHomePolicy.SnapshotState.REFRESHING) {
            Button connect = primaryButton(baseUrl.isEmpty() ? "绑定我的工作台"
                : syncing ? "正在读取" : data == null || !bridgeReady ? "登录 / 重新连接" : "刷新核对");
            connect.setEnabled(!syncing && !saving && !bindingChanging);
            connect.setOnClickListener(v -> { if (baseUrl.isEmpty()) showBinding(); else sync(); });
            box.addView(connect);
        }
        body.addView(box);
    }

    private boolean homeActionsStacked() {
        return WorkbenchHomePolicy.stackedActions(getResources().getConfiguration().screenWidthDp,
            getResources().getConfiguration().fontScale);
    }

    private void addHomeSectionHeader(LinearLayout body, String title, String action, Runnable listener) {
        boolean stacked = homeActionsStacked();
        LinearLayout row = quickRow();
        row.setOrientation(stacked ? LinearLayout.VERTICAL : LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setPadding(0, dp(10), 0, dp(6));
        TextView label = text(title, 18, INK);
        label.setTypeface(NativeUi.MEDIUM);
        row.addView(label, stacked ? new LinearLayout.LayoutParams(-1, -2)
            : new LinearLayout.LayoutParams(0, -2, 1));
        Button button = secondaryButton(action);
        button.setTextSize(13);
        button.setOnClickListener(v -> listener.run());
        row.addView(button, new LinearLayout.LayoutParams(stacked ? -1 : -2, -2));
        body.addView(row);
    }

    private void addHomeConnectionHelp(LinearLayout body) {
        body.addView(text("App 版本 " + appVersion() + " · 未连接时不会读取云端记录", 11, MUTED));
        if (!activeDraftScope.isEmpty()) {
            Button draft = secondaryButton("离线写一条草稿");
            draft.setOnClickListener(v -> showRecordDialog());
            body.addView(draft);
        }
        Button binding = secondaryButton("设置 / 更换工作台地址");
        binding.setOnClickListener(v -> showBinding());
        body.addView(binding);
        Button help = secondaryButton("安装与登录帮助");
        help.setOnClickListener(v -> showInstallHelp());
        body.addView(help);
        body.addView(privacyButton());
        body.addView(diagnosticsButton());
        Button update = secondaryButton("检查 App 新版本");
        update.setOnClickListener(v -> showUpdateCheck());
        body.addView(update);
    }

    private void addNutritionEntry(LinearLayout body) {
        LinearLayout box = card();
        box.setBackground(NativeUi.shape(this, 0xFFF5EBD9, 22, 0xFFE9D8B8));
        LinearLayout heading = new LinearLayout(this);
        heading.setGravity(Gravity.CENTER_VERTICAL);
        heading.addView(new NativeUi.IconView(this, "nutrition", GREEN), new LinearLayout.LayoutParams(dp(24), dp(24)));
        TextView title = text("热量与饮食", 21, INK);
        title.setTypeface(NativeUi.DISPLAY); title.setPadding(dp(10), 0, 0, 0);
        heading.addView(title, new LinearLayout.LayoutParams(0, -2, 1));
        heading.addView(NativeUi.badge(this, "原生功能", PALE_GREEN, GREEN));
        box.addView(heading);
        TextView hint = text("查看每日热量、营养素与饮水；记录一餐后，与原工作台共用数据。", 13, MUTED);
        hint.setPadding(0, dp(10), 0, dp(10)); box.addView(hint);
        if (NativeNutritionSheet.hasUnknownSave(this, baseUrl)) {
            box.addView(text("有饮食保存结果待核对，请进入后先同步。", 12, ROSE));
        }
        Button open = primaryButton("打开热量与饮食");
        open.setOnClickListener(v -> showNutrition()); box.addView(open); body.addView(box);
    }

    private void addCheckinCard(LinearLayout body) {
        JSONObject active = data.optJSONObject("activeCheckin");
        LinearLayout box = card();
        if (active == null) {
            boolean largeText = getResources().getConfiguration().fontScale > 1.2f;
            LinearLayout row = new LinearLayout(this);
            row.setOrientation(largeText ? LinearLayout.VERTICAL : LinearLayout.HORIZONTAL);
            row.setGravity(Gravity.CENTER_VERTICAL);
            LinearLayout words = NativeUi.column(this);
            words.addView(text("专注打卡", 17, INK));
            TextView hint = text("开始一段专注时间", 12, MUTED);
            hint.setPadding(0, dp(4), 0, 0);
            words.addView(hint);
            row.addView(words, largeText ? new LinearLayout.LayoutParams(-1, -2)
                : new LinearLayout.LayoutParams(0, -2, 1));
            Button start = primaryButton("开始专注");
            start.setOnClickListener(v -> showStartCheckinDialog());
            LinearLayout.LayoutParams startParams = new LinearLayout.LayoutParams(largeText ? -1 : -2, -2);
            startParams.setMargins(largeText ? 0 : dp(10), largeText ? dp(10) : 0, 0, 0);
            row.addView(start, startParams);
            box.addView(row);
            body.addView(box);
            return;
        }
        box.setBackground(NativeUi.focusBackground(this));
        TextView eyebrow = text("正在专注", 12, 0xFFD7E5D7);
        eyebrow.setTypeface(NativeUi.MEDIUM);
        box.addView(eyebrow);
        LinearLayout hero = new LinearLayout(this);
        hero.setGravity(Gravity.CENTER_VERTICAL);
        LinearLayout words = NativeUi.column(this);
        TextView title = text(active.optString("title", "专注打卡"), 24, Color.WHITE);
        title.setTypeface(NativeUi.DISPLAY);
        title.setMaxLines(3);
        title.setEllipsize(android.text.TextUtils.TruncateAt.END);
        title.setPadding(0, dp(10), 0, dp(7));
        words.addView(title);
        elapsedStartedAt = active.optString("happenedAt");
        elapsedView = text(elapsedLabel(elapsedStartedAt), 21, 0xFFE4EEE3);
        elapsedView.setTypeface(NativeUi.MEDIUM);
        words.addView(elapsedView);
        hero.addView(words, new LinearLayout.LayoutParams(0, -2, 1));
        if (getResources().getConfiguration().fontScale <= 1.2f) {
            NativeUi.FocusArt art = new NativeUi.FocusArt(this);
            LinearLayout.LayoutParams artParams = new LinearLayout.LayoutParams(dp(80), dp(80));
            artParams.setMargins(dp(8), 0, 0, 0);
            hero.addView(art, artParams);
        }
        box.addView(hero);
        Button button = primaryButton("结束并保存");
        NativeUi.decorateButton(button, AMBER, INK, Color.TRANSPARENT);
        LinearLayout.LayoutParams params = (LinearLayout.LayoutParams) button.getLayoutParams();
        params.setMargins(0, dp(16), 0, 0);
        button.setLayoutParams(params);
        button.setOnClickListener(v -> showStopCheckinDialog(active));
        box.addView(button);
        TextView cloud = text("联网保存成功后，与工作台共用记录", 11, 0xFFD7E5D7);
        cloud.setPadding(0, dp(10), 0, 0);
        box.addView(cloud);
        body.addView(box);
    }

    private void addQuickActions(LinearLayout body) {
        addHomeSectionHeader(body, "常用功能", "全部功能", () -> selectTab("features"));
        addHomeActionRow(body,
            quickAction("热量与饮食", "记一餐、看热量", "nutrition", GREEN, () -> openHomeAction("nutrition")),
            quickAction("写记录", "记下此刻发生的事", "records", BLUE, () -> openHomeAction("record-create")));
        addHomeActionRow(body,
            quickAction("安排日程", "选择日期与时间", "schedule", GREEN, () -> openHomeAction("schedule-create")),
            quickAction("专注打卡", "开始或查看当前专注", "home", GREEN, () -> openHomeAction("checkin")));
        LinearLayout more = quickRow();
        boolean stacked = homeActionsStacked();
        more.setOrientation(stacked ? LinearLayout.VERTICAL : LinearLayout.HORIZONTAL);
        String[] titles = {"兼职结算", "AI 助手", "本机草稿"};
        String[] keys = {"work-hours", "ai", "drafts"};
        for (int i = 0; i < titles.length; i++) {
            final String key = keys[i];
            Button button = secondaryButton(titles[i]);
            button.setTextSize(13);
            button.setPadding(dp(8), dp(10), dp(8), dp(10));
            button.setOnClickListener(v -> openHomeAction(key));
            LinearLayout.LayoutParams params = stacked ? new LinearLayout.LayoutParams(-1, -2)
                : new LinearLayout.LayoutParams(0, -2, 1);
            params.setMargins(0, 0, !stacked && i < titles.length - 1 ? dp(6) : 0, dp(8));
            more.addView(button, params);
        }
        body.addView(more);
    }

    private void addHomeActionRow(LinearLayout body, View first, View second) {
        boolean stacked = homeActionsStacked();
        LinearLayout row = quickRow();
        row.setOrientation(stacked ? LinearLayout.VERTICAL : LinearLayout.HORIZONTAL);
        for (int i = 0; i < 2; i++) {
            LinearLayout.LayoutParams params;
            if (stacked) {
                params = new LinearLayout.LayoutParams(-1, -2);
                params.setMargins(0, 0, 0, dp(10));
            } else params = quickParams(i == 0);
            row.addView(i == 0 ? first : second, params);
        }
        body.addView(row);
    }

    private void openHomeAction(String key) {
        if ("drafts".equals(key)) { showDrafts(); return; }
        if (saving || syncing || bindingChanging || workSheet != null || draftSheet != null
            || aiSheet != null || nutritionSheet != null) {
            Toast.makeText(this, "请先结束当前连接、保存或弹出页面。", Toast.LENGTH_SHORT).show();
            return;
        }
        if (!bridgeReady || data == null) { showAuth(); return; }
        if ("nutrition".equals(key)) showNutrition();
        else if ("record-create".equals(key)) showRecordDialog();
        else if ("schedule-create".equals(key)) showScheduleDialog();
        else if ("checkin".equals(key)) openFeatureCheckin("专注打卡");
        else if ("work-hours".equals(key)) showWork();
        else if ("ai".equals(key)) showAi();
    }

    private void renderFeatures(LinearLayout body) {
        TextView eyebrow = text("EXPLORE / 功能地图", 11, GREEN);
        body.addView(eyebrow);
        TextView title = text("想做的事，在这里找到", 26, INK);
        title.setTypeface(NativeUi.DISPLAY);
        title.setPadding(0, dp(7), 0, dp(9));
        body.addView(title);
        TextView hint = text("App 内入口可以直接使用；尚未迁移的功能会标为网页版，不会自动跳转。", 13, MUTED);
        hint.setPadding(0, 0, 0, dp(12));
        body.addView(hint);
        if (data == null || !bridgeReady) {
            TextView connection = text("当前未读取云端数据。浏览入口无需登录，使用云端功能前需先连接工作台。", 12, GREEN);
            connection.setPadding(0, 0, 0, dp(12));
            body.addView(connection);
        }
        EditText search = input("搜索热量、兼职、日程、财务…", false);
        search.setContentDescription("搜索工作台功能");
        search.setText(featureQuery);
        body.addView(search);
        LinearLayout scopes = quickRow();
        final NativeFeatureCatalog.Scope[] values = {
            NativeFeatureCatalog.Scope.ALL, NativeFeatureCatalog.Scope.NATIVE, NativeFeatureCatalog.Scope.WEB
        };
        String[] labels = { "全部", "App 内", "网页版" };
        final List<Button> buttons = new ArrayList<>();
        TextView count = text("", 12, MUTED);
        count.setPadding(dp(2), dp(14), dp(2), 0);
        LinearLayout results = NativeUi.column(this);
        for (int i = 0; i < values.length; i++) {
            final NativeFeatureCatalog.Scope scope = values[i];
            Button filter = secondaryButton(labels[i]);
            filter.setMinWidth(0);
            filter.setMinimumWidth(0);
            LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(0, -2, 1);
            params.setMargins(i == 0 ? 0 : dp(4), 0, i == values.length - 1 ? 0 : dp(4), 0);
            scopes.addView(filter, params);
            buttons.add(filter);
            filter.setOnClickListener(v -> {
                featureScope = scope;
                updateFeatureFilters(buttons, values);
                renderFeatureResults(results, count);
            });
        }
        body.addView(scopes);
        body.addView(count);
        body.addView(results);
        Button back = secondaryButton("返回首页");
        back.setOnClickListener(v -> selectTab("home"));
        body.addView(back);
        search.addTextChangedListener(new TextWatcher() {
            @Override public void beforeTextChanged(CharSequence s, int start, int count, int after) {}
            @Override public void onTextChanged(CharSequence s, int start, int before, int count) {}
            @Override public void afterTextChanged(Editable value) {
                featureQuery = value.toString();
                renderFeatureResults(results, count);
            }
        });
        updateFeatureFilters(buttons, values);
        renderFeatureResults(results, count);
    }

    private void updateFeatureFilters(List<Button> buttons, NativeFeatureCatalog.Scope[] values) {
        for (int i = 0; i < buttons.size(); i++) {
            boolean selected = values[i] == featureScope;
            NativeUi.decorateButton(buttons.get(i), selected ? GREEN : Color.WHITE,
                selected ? Color.WHITE : GREEN, selected ? Color.TRANSPARENT : NativeUi.BORDER);
            buttons.get(i).setSelected(selected);
        }
    }

    private void renderFeatureResults(LinearLayout results, TextView count) {
        results.removeAllViews();
        List<NativeFeatureCatalog.Entry> matches = NativeFeatureCatalog.search(featureQuery, featureScope);
        int nativeCount = 0;
        for (NativeFeatureCatalog.Entry feature : matches) if (feature.nativeInApp) nativeCount++;
        count.setText("找到 " + matches.size() + " 项 · App 内 " + nativeCount
            + " 项 · 网页版 " + (matches.size() - nativeCount) + " 项");
        if (matches.isEmpty()) {
            emptyCard(results, "没有找到这个入口", "试试“饮食”“打卡”或“日程”，也可以清空搜索查看全部功能。",
                "清空搜索", () -> {
                    featureQuery = "";
                    featureScope = NativeFeatureCatalog.Scope.ALL;
                    render();
                });
            return;
        }
        Boolean previousNative = null;
        for (NativeFeatureCatalog.Entry feature : matches) {
            if (previousNative == null || previousNative.booleanValue() != feature.nativeInApp) {
                sectionTitle(results, feature.nativeInApp ? "App 内入口" : "仍在网页版的功能");
                previousNative = feature.nativeInApp;
            }
            LinearLayout box = card();
            LinearLayout heading = quickRow();
            heading.setGravity(Gravity.CENTER_VERTICAL);
            TextView title = text(feature.title, 18, INK);
            title.setTypeface(NativeUi.MEDIUM);
            heading.addView(title, new LinearLayout.LayoutParams(0, -2, 1));
            heading.addView(NativeUi.badge(this, feature.nativeInApp ? "App 内" : "网页版",
                feature.nativeInApp ? PALE_GREEN : 0xFFF5EBD9, GREEN));
            box.addView(heading);
            TextView detail = text(feature.description, 13, MUTED);
            detail.setPadding(0, dp(9), 0, dp(9));
            box.addView(detail);
            Button open = feature.nativeInApp ? primaryButton("打开" + feature.title) : secondaryButton("查看使用说明");
            open.setOnClickListener(v -> openFeature(feature));
            box.addView(open);
            results.addView(box);
        }
    }

    private void openFeature(NativeFeatureCatalog.Entry feature) {
        if (!feature.nativeInApp) { showWebFeatureInfo(feature); return; }
        if ("drafts".equals(feature.key)) { showDrafts(); return; }
        if (saving || syncing || bindingChanging || workSheet != null || draftSheet != null || aiSheet != null || nutritionSheet != null) {
            Toast.makeText(this, "请先结束当前连接、保存或弹出页面。", Toast.LENGTH_SHORT).show();
            return;
        }
        if (!bridgeReady || data == null) { showAuth(); return; }
        if ("nutrition".equals(feature.key)) showNutrition();
        else if ("work-hours".equals(feature.key) || "settlement".equals(feature.key)) showWork();
        else if ("records".equals(feature.key)) selectTab("records");
        else if ("schedule".equals(feature.key)) selectTab("schedule");
        else if ("checkin".equals(feature.key)) openFeatureCheckin("专注打卡");
        else if ("capture".equals(feature.key)) showInboxDialog();
        else if ("ai".equals(feature.key)) showAi();
    }

    private void openFeatureCheckin(String initialTitle) {
        if (saving || syncing || bindingChanging || workSheet != null || draftSheet != null || aiSheet != null || nutritionSheet != null) {
            Toast.makeText(this, "请先结束当前连接、保存或弹出页面。", Toast.LENGTH_SHORT).show();
            return;
        }
        if (!bridgeReady || data == null) { showAuth(); return; }
        JSONObject active = data.optJSONObject("activeCheckin");
        if (active == null) showStartCheckinDialog(initialTitle);
        else {
            Toast.makeText(this, "已有打卡正在进行，不会再创建一段计时。", Toast.LENGTH_SHORT).show();
            showStopCheckinDialog(active);
        }
    }

    private void showWebFeatureInfo(NativeFeatureCatalog.Entry feature) {
        new AlertDialog.Builder(this).setTitle(feature.title + " · 网页版")
            .setMessage(feature.description + "\n\n这不是已经完成的原生功能。若选择打开完整版网页，请在网页中进入“"
                + feature.title + "”对应模块。网页可能需要单独登录；不会开放你的私人站点。")
            .setNegativeButton("留在 App", null)
            .setPositiveButton(baseUrl.isEmpty() ? "先绑定工作台" : "打开完整版网页", (dialog, which) -> {
                String origin = WorkbenchClientPolicy.normalizeOrigin(baseUrl);
                if (origin.isEmpty()) { showBinding(); return; }
                try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(origin))); }
                catch (ActivityNotFoundException error) {
                    Toast.makeText(this, "没有可用浏览器，请先安装或启用浏览器。", Toast.LENGTH_LONG).show();
                }
            }).show();
    }

    private LinearLayout quickRow() {
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        return row;
    }

    private LinearLayout.LayoutParams quickParams(boolean left) {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(0, -2, 1);
        params.setMargins(left ? 0 : dp(6), 0, left ? dp(6) : 0, dp(12));
        return params;
    }

    private View quickAction(String title, String hint, String icon, int accent, Runnable action) {
        LinearLayout item = NativeUi.column(this);
        item.setMinimumHeight(dp(98));
        item.setPadding(dp(15), dp(14), dp(14), dp(14));
        item.setBackground(NativeUi.touch(this, Color.WHITE, 20, NativeUi.BORDER));
        item.setOnClickListener(v -> action.run());
        item.setFocusable(true);
        item.setContentDescription(title + "，" + hint);
        LinearLayout top = new LinearLayout(this);
        top.setGravity(Gravity.CENTER_VERTICAL);
        FrameLayout badge = new FrameLayout(this);
        badge.setBackground(NativeUi.shape(this, NativeUi.alpha(accent, 22), 11));
        badge.addView(new NativeUi.IconView(this, icon, accent),
            new FrameLayout.LayoutParams(dp(22), dp(22), Gravity.CENTER));
        top.addView(badge, new LinearLayout.LayoutParams(dp(34), dp(34)));
        View space = new View(this);
        top.addView(space, new LinearLayout.LayoutParams(0, 1, 1));
        top.addView(new NativeUi.IconView(this, "arrow", MUTED), new LinearLayout.LayoutParams(dp(16), dp(16)));
        item.addView(top);
        TextView label = text(title, 16, INK);
        label.setTypeface(NativeUi.MEDIUM);
        label.setPadding(0, dp(9), 0, dp(3));
        item.addView(label);
        item.addView(text(hint, 12, MUTED));
        return item;
    }

    private void renderRecords(LinearLayout body) {
        pageTitle(body, "生活记录", "记录生活片段，日期按北京时间显示。", "写一条记录", this::showRecordDialog);
        final JSONArray records = data.optJSONArray("records");
        LinearLayout filters = card();
        TextView title = text("找回生活里的片段", 17, INK);
        title.setTypeface(NativeUi.MEDIUM);
        filters.addView(title);
        HorizontalScrollView strip = new HorizontalScrollView(this);
        strip.setHorizontalScrollBarEnabled(false);
        strip.setOverScrollMode(View.OVER_SCROLL_NEVER);
        LinearLayout chips = new LinearLayout(this);
        String[][] scopes = {{"全部", WorkbenchRecordPolicy.ALL}, {"今天", WorkbenchRecordPolicy.TODAY},
            {"过去 7 天", WorkbenchRecordPolicy.WEEK}};
        for (String[] scope : scopes) {
            Button chip = secondaryButton(scope[0]);
            chip.setTextSize(13);
            boolean selected = scope[1].equals(recordScope);
            NativeUi.decorateButton(chip, selected ? GREEN : PALE_GREEN,
                selected ? Color.WHITE : GREEN, selected ? Color.TRANSPARENT : NativeUi.BORDER);
            chip.setSelected(selected);
            chip.setContentDescription(scope[0] + (selected ? "，已选中" : "，筛选记录"));
            chip.setOnClickListener(v -> { recordScope = scope[1]; render(); });
            LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-2, -2);
            params.setMargins(0, dp(4), dp(6), dp(9));
            chips.addView(chip, params);
        }
        strip.addView(chips, new FrameLayout.LayoutParams(-2, -2));
        filters.addView(strip, new LinearLayout.LayoutParams(-1, -2));
        EditText search = input("搜索标题、正文或类型", false);
        search.setContentDescription("搜索本次已同步的记录");
        search.setFilters(new android.text.InputFilter[] {new android.text.InputFilter.LengthFilter(100)});
        search.setImeOptions(EditorInfo.IME_ACTION_SEARCH);
        search.setText(recordQuery);
        filters.addView(search);
        filters.addView(text("只筛选本次已同步记录，不删除或改写云端数据。", 11, MUTED));
        body.addView(filters);
        TextView count = text("", 12, MUTED);
        count.setPadding(dp(2), dp(2), dp(2), dp(8));
        body.addView(count);
        LinearLayout results = NativeUi.column(this);
        body.addView(results);
        renderRecordResults(results, count, records);
        search.addTextChangedListener(new TextWatcher() {
            @Override public void beforeTextChanged(CharSequence s, int start, int count, int after) {}
            @Override public void onTextChanged(CharSequence s, int start, int before, int count) {}
            @Override public void afterTextChanged(Editable value) {
                recordQuery = value.toString();
                if (!isFinishing() && !isDestroyed() && "records".equals(tab) && results.isAttachedToWindow())
                    renderRecordResults(results, count, records);
            }
        });
    }

    private List<WorkbenchRecordPolicy.Entry> recordEntries(JSONArray records) {
        List<WorkbenchRecordPolicy.Entry> loaded = new ArrayList<>();
        if (records != null) for (int i = 0; i < records.length(); i++) {
            JSONObject item = records.optJSONObject(i);
            if (item != null) loaded.add(new WorkbenchRecordPolicy.Entry(i, item.optString("title"),
                item.optString("content"), item.optString("kind"), item.optString("happenedAt")));
        }
        return loaded;
    }

    private void renderRecordResults(LinearLayout results, TextView count, JSONArray records) {
        List<WorkbenchRecordPolicy.Entry> loaded = recordEntries(records);
        long now = System.currentTimeMillis();
        List<WorkbenchRecordPolicy.Entry> selected = WorkbenchRecordPolicy.select(loaded, recordScope, recordQuery, now);
        String scopeLabel = WorkbenchRecordPolicy.TODAY.equals(recordScope) ? "今天"
            : WorkbenchRecordPolicy.WEEK.equals(recordScope) ? "过去 7 天" : "全部";
        count.setText("显示 " + selected.size() + " / " + loaded.size()
            + " 条本次已同步记录 · " + scopeLabel + " · 北京时间");
        results.removeAllViews();
        if (loaded.isEmpty()) {
            emptyCard(results, "从今天的第一条开始", "一个想法、一段经历，或者今天做成的事。",
                "开始记录", this::showRecordDialog);
            return;
        }
        if (selected.isEmpty()) {
            emptyCard(results, "这个筛选下还没有记录",
                "本次已同步内容中没有匹配项，不代表云端没有其他记录。可清空筛选或到“我的”立即同步。",
                "清空筛选", () -> { resetRecordFilters(); render(); });
            return;
        }
        String today = WorkbenchRecordPolicy.dayKey(now);
        String lastDay = "";
        for (WorkbenchRecordPolicy.Entry entry : selected) {
            String key = WorkbenchRecordPolicy.dayKey(entry.timestamp);
            String group = key.isEmpty() ? "unknown" : key;
            if (!group.equals(lastDay)) {
                String heading = key.isEmpty() ? "时间待核对"
                    : (today.equals(key) ? "今天 · " : "")
                        + visualDateLabel(entry.happenedAt, "M月d日 EEEE", key);
                sectionTitle(results, heading);
                lastDay = group;
            }
            addRecord(results, records.optJSONObject(entry.sourceIndex));
        }
    }

    private void resetRecordFilters() {
        recordScope = WorkbenchRecordPolicy.ALL;
        recordQuery = "";
    }

    private void renderSchedules(LinearLayout body) {
        pageTitle(body, "日程安排", "给重要的事留出时间。日期均按北京时间显示。", "新增日程", this::showScheduleDialog);
        final JSONArray schedules = data.optJSONArray("schedules");
        LinearLayout filters = card();
        LinearLayout titleRow = new LinearLayout(this);
        titleRow.setGravity(Gravity.CENTER_VERTICAL);
        TextView title = text("找到接下来的安排", 16, INK);
        title.setTypeface(NativeUi.MEDIUM);
        titleRow.addView(title, new LinearLayout.LayoutParams(0, -2, 1));
        Button reset = secondaryButton("重置");
        reset.setTextSize(12);
        reset.setOnClickListener(v -> resetScheduleFiltersAndRender());
        titleRow.addView(reset, new LinearLayout.LayoutParams(dp(68), dp(48)));
        filters.addView(titleRow);
        HorizontalScrollView strip = new HorizontalScrollView(this);
        strip.setHorizontalScrollBarEnabled(false);
        strip.setOverScrollMode(View.OVER_SCROLL_NEVER);
        LinearLayout chips = new LinearLayout(this);
        String[][] scopes = {{"全部", WorkbenchSchedulePolicy.ALL}, {"今天", WorkbenchSchedulePolicy.TODAY},
            {"明天", WorkbenchSchedulePolicy.TOMORROW}, {"近 7 天", WorkbenchSchedulePolicy.WEEK}};
        for (String[] scope : scopes) {
            Button chip = secondaryButton(scope[0]);
            chip.setTextSize(13);
            boolean selected = scope[1].equals(scheduleScope);
            NativeUi.decorateButton(chip, selected ? GREEN : PALE_GREEN, selected ? Color.WHITE : GREEN,
                selected ? Color.TRANSPARENT : NativeUi.BORDER);
            chip.setSelected(selected);
            chip.setContentDescription(scope[0] + (selected ? "，已选中" : "，筛选日程"));
            chip.setOnClickListener(v -> { scheduleScope = scope[1]; render(); });
            LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(dp(78), dp(48));
            params.setMargins(0, dp(4), dp(6), dp(9));
            chips.addView(chip, params);
        }
        strip.addView(chips, new FrameLayout.LayoutParams(-2, -2));
        filters.addView(strip, new LinearLayout.LayoutParams(-1, -2));
        EditText search = input("搜索标题、地点或备注", false);
        search.setContentDescription("搜索已同步的日程");
        search.setFilters(new android.text.InputFilter[] {new android.text.InputFilter.LengthFilter(100)});
        search.setImeOptions(EditorInfo.IME_ACTION_SEARCH);
        search.setText(scheduleQuery);
        filters.addView(search);
        filters.addView(text("只筛选手机本次已同步的日程，不会删除或改写云端数据。", 11, MUTED));
        body.addView(filters);
        TextView count = text("", 12, MUTED);
        count.setPadding(dp(2), dp(2), dp(2), dp(8));
        body.addView(count);
        LinearLayout results = NativeUi.column(this);
        body.addView(results);
        renderScheduleResults(results, count, schedules);
        search.addTextChangedListener(new TextWatcher() {
            @Override public void beforeTextChanged(CharSequence s, int start, int count, int after) {}
            @Override public void onTextChanged(CharSequence s, int start, int before, int count) {}
            @Override public void afterTextChanged(Editable value) {
                scheduleQuery = value.toString();
                cancelScheduleFilter();
                scheduleFilterTask = () -> {
                    scheduleFilterTask = null;
                    if (!isFinishing() && !isDestroyed() && "schedule".equals(tab) && results.isAttachedToWindow())
                        renderScheduleResults(results, count, schedules);
                };
                clockHandler.postDelayed(scheduleFilterTask, 180);
            }
        });
        search.setOnEditorActionListener((view, action, event) -> {
            if (action == EditorInfo.IME_ACTION_SEARCH) {
                cancelScheduleFilter();
                renderScheduleResults(results, count, schedules);
            }
            return false;
        });
    }

    private void renderScheduleResults(LinearLayout results, TextView count, JSONArray schedules) {
        List<WorkbenchSchedulePolicy.Entry> loaded = new ArrayList<>();
        if (schedules != null) for (int i = 0; i < schedules.length(); i++) {
            JSONObject item = schedules.optJSONObject(i);
            if (item != null) loaded.add(new WorkbenchSchedulePolicy.Entry(i, item.optString("title"),
                item.optString("place"), item.optString("note"), item.optString("startAt"), item.optString("endAt")));
        }
        long now = System.currentTimeMillis();
        List<WorkbenchSchedulePolicy.Entry> selected = WorkbenchSchedulePolicy.select(loaded, scheduleScope, scheduleQuery, now);
        String scopeLabel = WorkbenchSchedulePolicy.TODAY.equals(scheduleScope) ? "今天"
            : WorkbenchSchedulePolicy.TOMORROW.equals(scheduleScope) ? "明天"
            : WorkbenchSchedulePolicy.WEEK.equals(scheduleScope) ? "今天起 7 天" : "全部";
        count.setText("显示 " + selected.size() + " / " + loaded.size() + " 条已同步日程 · " + scopeLabel + " · 北京时间");
        results.removeAllViews();
        if (loaded.isEmpty()) {
            emptyCard(results, "时间空着，也是一种可能", "安排一次学习、会议或出行，保存成功后同步到工作台。",
                "安排日程", this::showScheduleDialog);
            return;
        }
        if (selected.isEmpty()) {
            emptyCard(results, "这个筛选下还没有安排", "本次已同步日程中没有匹配项，不代表云端没有其他日程。可以换个日期或关键词。",
                "清空筛选", this::resetScheduleFiltersAndRender);
            return;
        }
        Calendar clock = Calendar.getInstance(TimeZone.getTimeZone("Asia/Shanghai"));
        clock.setTimeInMillis(now);
        SimpleDateFormat keyFormat = new SimpleDateFormat("yyyy-MM-dd", Locale.US);
        keyFormat.setTimeZone(TimeZone.getTimeZone("Asia/Shanghai"));
        String todayKey = keyFormat.format(clock.getTime());
        clock.add(Calendar.DAY_OF_MONTH, 1);
        String tomorrowKey = keyFormat.format(clock.getTime());
        String lastDay = "";
        for (WorkbenchSchedulePolicy.Entry entry : selected) {
            JSONObject item = schedules.optJSONObject(entry.sourceIndex);
            String key = visualDateLabel(item.optString("startAt"), "yyyy-MM-dd", "日期待定");
            if (!key.equals(lastDay)) {
                String day = visualDateLabel(item.optString("startAt"), "M月d日 EEEE", "日期待定");
                sectionTitle(results, (key.equals(todayKey) ? "今天 · " : key.equals(tomorrowKey) ? "明天 · " : "") + day);
                lastDay = key;
            }
            addSchedule(results, item);
        }
    }

    private void cancelScheduleFilter() {
        if (scheduleFilterTask != null) clockHandler.removeCallbacks(scheduleFilterTask);
        scheduleFilterTask = null;
    }

    private void resetScheduleFilters() {
        cancelScheduleFilter();
        scheduleScope = WorkbenchSchedulePolicy.ALL;
        scheduleQuery = "";
    }

    private void resetScheduleFiltersAndRender() {
        resetScheduleFilters();
        render();
    }

    private void renderMe(LinearLayout body) {
        TextView heading = text("我的日常屿", 28, INK);
        heading.setTypeface(NativeUi.DISPLAY);
        heading.setPadding(0, 0, 0, dp(16));
        body.addView(heading);
        JSONObject user = data.optJSONObject("user");
        String displayName = user == null ? "已连接" : user.optString("displayName", "已连接");
        LinearLayout account = card();
        LinearLayout identity = new LinearLayout(this);
        identity.setGravity(Gravity.CENTER_VERTICAL);
        TextView avatar = text(displayName.isEmpty() ? "我" : displayName.substring(0, displayName.offsetByCodePoints(0, 1)), 22, GREEN);
        avatar.setTypeface(NativeUi.DISPLAY);
        avatar.setGravity(Gravity.CENTER);
        avatar.setBackground(NativeUi.shape(this, PALE_GREEN, 18));
        identity.addView(avatar, new LinearLayout.LayoutParams(dp(54), dp(54)));
        LinearLayout profile = NativeUi.column(this);
        profile.setPadding(dp(13), 0, 0, 0);
        TextView name = text(displayName, 20, INK);
        name.setTypeface(NativeUi.MEDIUM);
        profile.addView(name);
        TextView email = text(user == null ? "" : user.optString("email"), 12, MUTED);
        email.setMaxLines(2);
        profile.addView(email);
        identity.addView(profile, new LinearLayout.LayoutParams(0, -2, 1));
        account.addView(identity);
        TextView version = text("原生安卓预览版 · " + appVersion(), 12, GREEN);
        version.setPadding(0, dp(14), 0, 0);
        account.addView(version);
        body.addView(account);

        Button features = secondaryButton("全部功能与使用入口");
        features.setOnClickListener(v -> selectTab("features"));
        body.addView(features);
        Button work=primaryButton("兼职工时与结算");work.setOnClickListener(v->showWork());body.addView(work);
        Button local=secondaryButton("本机草稿 · "+draftCount());local.setOnClickListener(v->showDrafts());body.addView(local);
        addNutritionEntry(body);
        body.addView(reminderOverviewButton());
        body.addView(privacyButton());
        sectionTitle(body, "安装与更新");
        LinearLayout updates = card();
        TextView updateHeading = text("让日常屿保持新鲜", 17, INK);
        updateHeading.setTypeface(NativeUi.MEDIUM);
        updates.addView(updateHeading);
        TextView updateHint = text("当前 " + appVersion() + "\n手动检查公开预览版，不上传工作台记录。", 12, MUTED);
        updateHint.setPadding(0, dp(8), 0, dp(6));
        updates.addView(updateHint);
        Button checkUpdate = primaryButton("检查新版本");
        checkUpdate.setOnClickListener(v -> showUpdateCheck());
        updates.addView(checkUpdate);
        Button installHelp = secondaryButton("手机实测与安装帮助");
        installHelp.setOnClickListener(v -> showPhoneGuide());
        updates.addView(installHelp);
        body.addView(updates);

        sectionTitle(body, "连接与同步");
        LinearLayout binding = card();
        TextView bindingTitle = text("绑定的工作台", 16, INK);
        bindingTitle.setTypeface(NativeUi.MEDIUM);
        binding.addView(bindingTitle);
        TextView host = text(Uri.parse(baseUrl).getHost(), 13, MUTED);
        host.setPadding(0, dp(7), 0, dp(8));
        binding.addView(host);
        binding.addView(text("账号授权访问云端数据，AI 密钥不保存在 App 里。", 12, GREEN));
        Button changeBinding = secondaryButton("更换工作台");
        changeBinding.setOnClickListener(v -> showBinding());
        binding.addView(changeBinding);
        binding.addView(diagnosticsButton());
        body.addView(binding);
        if (saveOutcomeUnknown) {
            LinearLayout uncertain = card();
            uncertain.setBackground(NativeUi.shape(this, 0xFFFFF3DF, 22, 0xFFEAD5B5));
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
        TextView statsTitle = text("我的数据", 16, INK);
        statsTitle.setTypeface(NativeUi.MEDIUM);
        stats.addView(statsTitle);
        LinearLayout row = new LinearLayout(this);
        row.setPadding(0, dp(10), 0, dp(10));
        row.addView(NativeUi.stat(this, summary == null ? 0 : summary.optInt("totalRecords"),
            "云端记录", () -> selectTab("records")), new LinearLayout.LayoutParams(0, -2, 1));
        row.addView(NativeUi.stat(this, summary == null ? 0 : summary.optInt("inboxPending"),
            "收件箱待整理", null), new LinearLayout.LayoutParams(0, -2, 1));
        stats.addView(row);
        stats.addView(text("最近同步：" + pretty(data.optString("serverTime")), 12, MUTED));
        body.addView(stats);
        Button refresh = secondaryButton("立即同步");
        refresh.setOnClickListener(v -> sync());
        body.addView(refresh);
        Button relink = secondaryButton("重新授权设备");
        relink.setOnClickListener(v -> {
            if (saving) { Toast.makeText(this, "请先等待当前保存结束。", Toast.LENGTH_LONG).show(); return; }
            new AlertDialog.Builder(this).setTitle("重新授权工作台")
                .setMessage("会清除本 App 的登录会话、当前页面数据和本机日程提醒，不会删除云端记录。")
                .setNegativeButton("取消", null)
                .setPositiveButton("重新授权", (dialog, which) -> {
                    invalidateLocalReminders();
                    bridgeReady = false;
                    mobileApi.cancelPending();
                    resetScheduleFilters();
                    resetRecordFilters();
                    if(workSheet!=null)workSheet.close();if(draftSheet!=null)draftSheet.close();
                    getSharedPreferences("native_workbench",MODE_PRIVATE).edit().remove("active_scope:"+baseUrl).apply();
                    activeDraftScope="";drafts=new NativeDraftStore(this,"");
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

    private String appVersion() {
        try { return getPackageManager().getPackageInfo(getPackageName(), 0).versionName; }
        catch (Exception ignored) { return "开发版"; }
    }


    private Button privacyButton() {
        Button button = secondaryButton("数据与隐私说明");
        button.setOnClickListener(v -> NativePrivacySheet.show(this));
        return button;
    }

    private Button diagnosticsButton() {
        Button button = secondaryButton("复制诊断信息");
        button.setOnClickListener(v -> showDiagnostics());
        return button;
    }

    private void showDiagnostics() {
        if (diagnosticDialog != null && diagnosticDialog.isShowing()) return;
        String report = WorkbenchDiagnosticReport.connection(appVersion(), Build.VERSION.SDK_INT,
            connectionDiagnosticState, !baseUrl.isEmpty(), bridgeReady, data != null, syncing,
            saving, saveOutcomeUnknown || NativeNutritionSheet.hasUnknownSave(this, baseUrl),
            lastMobileHttpStatus);
        if (!lastNutritionDiagnostic.isEmpty()) {
            report += "\nLast nutrition snapshot in this App session:\n" + lastNutritionDiagnostic;
        }
        diagnosticDialog = NativeDiagnosticDialog.show(this, report, () -> diagnosticDialog = null);
    }

    private void showUpdateCheck() {
        if (saving || syncing || bindingChanging || (aiSheet != null && aiSheet.isBusy())) {
            Toast.makeText(this, "请先等待当前操作结束，再检查版本。", Toast.LENGTH_LONG).show();
            return;
        }
        if (!WorkbenchReleasePolicy.PREVIEW_PACKAGE.equals(getPackageName())) {
            new AlertDialog.Builder(this).setTitle("正式版更新")
                .setMessage("此入口只检查公开预览版。正式版请使用其原始发行渠道；目前尚未完成商店上架。")
                .setPositiveButton("知道了", null).show();
            return;
        }
        if (updateDialog != null && updateDialog.isShowing()) return;
        final AlertDialog dialog = new AlertDialog.Builder(this).setTitle("安装与更新")
            .setMessage("当前版本：" + appVersion() + "\n正在读取 GitHub 公开发布信息…")
            .setNegativeButton("关闭", null).setNeutralButton("官方发布页", (d, which) ->
                openReleasePage(WorkbenchReleasePolicy.RELEASES_PAGE))
            .setPositiveButton("重新检查", null).create();
        updateDialog = dialog;
        dialog.setOnDismissListener(d -> {
            if (updateDialog == dialog) { updateChecker.cancel(); updateDialog = null; }
        });
        dialog.setOnShowListener(d -> runUpdateCheck(dialog));
        dialog.show();
    }

    private void runUpdateCheck(AlertDialog dialog) {
        dialog.setMessage("当前版本：" + appVersion() + "\n正在读取 GitHub 公开发布信息…\n不发送账号或记录，不自动下载安装。");
        Button action = dialog.getButton(AlertDialog.BUTTON_POSITIVE);
        action.setText("正在检查");
        action.setEnabled(false);
        updateChecker.check(appVersion(), (candidate, error) -> {
            if (isFinishing() || isDestroyed() || updateDialog != dialog || !dialog.isShowing()) return;
            action.setEnabled(true);
            if (error != null) {
                dialog.setMessage("检查未完成\n\n" + error + "\n\n没有把检查失败当作“已是最新版”。");
                action.setText("重试");
                action.setOnClickListener(v -> runUpdateCheck(dialog));
                return;
            }
            if (candidate == null) {
                dialog.setMessage("当前版本：" + appVersion() + "\n\n未发现比当前版本更新的公开预览包。此检查不代表正式版或应用商店状态。");
                action.setText("重新检查");
                action.setOnClickListener(v -> runUpdateCheck(dialog));
                return;
            }
            WorkbenchReleasePolicy.Compatibility compatibility = WorkbenchReleasePolicy.compatibility(candidate,
                NativeUpdateChecker.installedCertificate(this), NativeUpdateChecker.installedVersionCode(this));
            String hint;
            if (compatibility == WorkbenchReleasePolicy.Compatibility.SAME_SIGNER) {
                hint = "签名一致且版本代码递增，满足覆盖更新的基本条件；是否能安装仍由安卓系统判断。";
            } else if (compatibility == WorkbenchReleasePolicy.Compatibility.DIFFERENT_SIGNER) {
                hint = "签名不一致，不能直接覆盖当前安装。不要直接卸载：先确认重要记录已成功保存到云端，本机草稿和未保存输入可能丢失。";
            } else if (compatibility == WorkbenchReleasePolicy.Compatibility.NON_INCREASING_VERSION) {
                hint = "安装包的安卓版本代码没有递增，不能把它视为可覆盖更新，请先查看发布说明。";
            } else {
                hint = "签名或版本信息不足，暂不能确认能否覆盖安装。请查看发布说明，不要为绕过冲突删除未同步数据。";
            }
            String signing = candidate.persistent ? "此发布声明使用固定预览签名。" : "此发布未声明固定预览签名，后续覆盖更新不保证。";
            dialog.setMessage("发现 " + candidate.tag + "\n安装包约 "
                + String.format(Locale.CHINA, "%.1f", candidate.bytes / 1000000.0) + " MB\n\n"
                + hint + "\n\n" + signing + "\n\n版本信息来自公开发布记录，并非已下载 APK 的安全验证。点击后仅打开官方发布页，由你手动下载。");
            action.setText("打开下载页");
            action.setOnClickListener(v -> openReleasePage(candidate.page));
        });
    }

    private void openReleasePage(String page) {
        if (!WorkbenchReleasePolicy.trustedPage(page)) {
            Toast.makeText(this, "下载地址不属于可信的官方发布页。", Toast.LENGTH_LONG).show();
            return;
        }
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(page)).addCategory(Intent.CATEGORY_BROWSABLE));
        } catch (ActivityNotFoundException error) {
            Toast.makeText(this, "未找到能打开链接的浏览器，请安装或启用手机浏览器。", Toast.LENGTH_LONG).show();
        }
    }

    private void showPhoneGuide() {
        LinearLayout form = dialogForm();
        form.addView(text("当前版本：" + appVersion(), 15, INK));
        form.addView(text(baseUrl.isEmpty() ? "尚未绑定工作台"
            : (bridgeReady && data != null ? "已读取工作台数据" : "已填写地址，尚未完成读取"), 13, MUTED));
        form.addView(text("这是手动实测指南，不是检查通过的报告。不会自动新增记录、付款或上传账号信息。", 13, MUTED));
        String[][] steps = {
            {"1. 安装与登录", "确认版本，绑定自己的可信 HTTPS 工作台。在 App 内授权后，应回到原生首页；反复跳转或空白请反馈。"},
            {"2. 打卡与生活记录", "记录一件实际发生的事，结束一次真实专注。同步后核对标题、时间与数量；网络超时先核对，不重复提交。"},
            {"3. 日程与饮食", "保存真实安排，检查北京时间、日期筛选与重新打开后的内容。饮食可从首页热量入口添加，AI 估算需先核对份量。"},
            {"4. 兼职与结算", "核对工时、应收与实收分别显示。只有实际到账才能登记收款，不要为了测试虚构付款。"},
            {"5. AI 预览确认", "先说明想做的事，核对 AI 预览，再自行确认添加。取消预览不应写入；涉及财务必须人工核实。"},
            {"6. 草稿与同步", "需要时手动保存本机草稿，联网后明确提交。草稿不是云端记录，不承诺所有功能离线可用。"},
            {"7. 反馈截图", "提供手机型号、系统版本、App 版本、所在入口与实际问题。截图先遮住邮箱、私人地址、记录内容、授权链接和密钥。"}
        };
        for (String[] step : steps) {
            TextView heading = text(step[0], 16, INK);
            heading.setTypeface(NativeUi.MEDIUM);
            heading.setPadding(0, dp(15), 0, dp(5));
            form.addView(heading);
            form.addView(text(step[1], 13, MUTED));
        }
        form.addView(text("网页版更新不等于安卓界面更新。本轮界面改动需要安装后续新版 APK 才会出现在手机上。", 12, GREEN));
        new AlertDialog.Builder(this).setTitle("手机实测步骤")
            .setView(scrollForm(form)).setNegativeButton("关闭", null)
            .setNeutralButton("全部功能", (d, which) -> selectTab("features"))
            .setPositiveButton("安装帮助", (d, which) -> showInstallHelp()).show();
    }

    private void showInstallHelp() {
        new AlertDialog.Builder(this).setTitle("安装、登录与更新帮助")
            .setMessage("下载与安装\n请用手机浏览器打开官方发布页，下载 .apk 文件。微信内不能安装时，可选择在浏览器打开。若文件被加上 .1 后缀，仅在确认它是官方 APK 后恢复 .apk 扩展名；不要把其他文件改名安装。\n\n"
                + "登录与使用\n首次填写自己的可信 HTTPS 工作台根地址。网页只用于授权，读取成功后进入原生打卡、记录、日程和 AI 页面。没有绑定或授权失败时，不会出现你的云端记录。\n\n"
                + "工作台与 App 更新\n云端保存成功的记录共用同一工作台。服务器功能能否同步取决于接口兼容；原生界面和安卓功能需要安装新版 APK，不会随网页自动更新。\n\n"
                + "升级前保护数据\n先等待当前保存结束，核对云端记录。遇到签名冲突不要直接卸载，本机输入和草稿可能丢失。\n\n"
                + "当前为预览版，尚未在应用商店正式上架，也未完成你的手机实测。仅为可信下载来源授权安装，不要关闭全局安全防护。")
            .setNegativeButton("关闭", null)
            .setPositiveButton("官方发布页", (d, which) -> openReleasePage(WorkbenchReleasePolicy.RELEASES_PAGE)).show();
    }

    private void pageTitle(LinearLayout body, String title, String hint, String action, Runnable listener) {
        TextView eyebrow = text("records".equals(tab) ? "LIFE / 记录" : "PLANNER / 日程", 11, GREEN);
        body.addView(eyebrow);
        TextView heading = text(title, 28, INK);
        heading.setTypeface(NativeUi.DISPLAY);
        heading.setPadding(0, dp(6), 0, dp(6));
        body.addView(heading);
        TextView subtitle = text(hint, 13, MUTED);
        subtitle.setPadding(0, 0, 0, dp(12));
        body.addView(subtitle);
        Button button = primaryButton(action);
        button.setOnClickListener(v -> listener.run());
        body.addView(button);
    }

    private void sectionTitle(LinearLayout body, String title) {
        TextView heading = text(title, 18, INK);
        heading.setTypeface(NativeUi.MEDIUM);
        heading.setPadding(dp(2), dp(12), 0, dp(12));
        body.addView(heading);
    }

    private void addRecord(LinearLayout body, JSONObject record) {
        if (record == null) return;
        LinearLayout item = card();
        item.setBackground(NativeUi.touch(this, Color.WHITE, 22, NativeUi.BORDER));
        String title = record.optString("title");
        String contentText = record.optString("content");
        String display = title.isEmpty() ? (contentText.isEmpty() ? "一条记录" : contentText) : title;
        String kind = record.optString("kind", "life");
        String category = "checkin".equals(kind) ? "专注" : "income".equals(kind) ? "收入"
            : ("life".equals(kind) || "event".equals(kind)) ? "生活" : "note".equals(kind) ? "随记" : kind;
        LinearLayout metadata = new LinearLayout(this);
        metadata.setGravity(Gravity.CENTER_VERTICAL);
        metadata.addView(NativeUi.badge(this, category, PALE_GREEN, GREEN));
        TextView stamp = text(pretty(record.optString("happenedAt")), 12, MUTED);
        stamp.setPadding(dp(10), 0, 0, 0);
        metadata.addView(stamp, new LinearLayout.LayoutParams(0, -2, 1));
        item.addView(metadata);
        TextView heading = text(display, 17, INK);
        heading.setTypeface(NativeUi.MEDIUM);
        heading.setMaxLines(2);
        heading.setEllipsize(android.text.TextUtils.TruncateAt.END);
        heading.setPadding(0, dp(12), 0, 0);
        item.addView(heading);
        if (!title.isEmpty() && !contentText.isEmpty()) {
            TextView excerpt = text(contentText, 14, MUTED);
            excerpt.setMaxLines(3);
            excerpt.setEllipsize(android.text.TextUtils.TruncateAt.END);
            excerpt.setPadding(0, dp(7), 0, 0);
            item.addView(excerpt);
        }
        item.setOnClickListener(v -> new AlertDialog.Builder(this).setTitle(display)
            .setMessage(contentText + "\n\n" + pretty(record.optString("happenedAt")))
            .setPositiveButton("关闭", null).show());
        body.addView(item);
    }

    private void addSchedule(LinearLayout body, JSONObject schedule) {
        if (schedule == null) return;
        LinearLayout item = card();
        item.setOrientation(LinearLayout.HORIZONTAL);
        item.setBackground(NativeUi.touch(this, Color.WHITE, 22, NativeUi.BORDER));
        LinearLayout date = NativeUi.column(this);
        date.setGravity(Gravity.CENTER);
        date.setPadding(dp(6), dp(10), dp(6), dp(10));
        date.setBackground(NativeUi.shape(this, PALE_GREEN, 15));
        date.addView(text(visualDateLabel(schedule.optString("startAt"), "M月", "日期"), 12, GREEN));
        TextView day = text(visualDateLabel(schedule.optString("startAt"), "d", "待定"), 29, INK);
        day.setTypeface(NativeUi.DISPLAY);
        date.addView(day);
        date.addView(text(visualDateLabel(schedule.optString("startAt"), "EEE", ""), 11, GREEN));
        LinearLayout.LayoutParams dateParams = new LinearLayout.LayoutParams(dp(60), -2);
        dateParams.setMargins(0, 0, dp(14), 0);
        item.addView(date, dateParams);
        LinearLayout details = NativeUi.column(this);
        TextView title = text(schedule.optString("title", "日程"), 17, INK);
        title.setTypeface(NativeUi.MEDIUM);
        title.setMaxLines(2);
        title.setEllipsize(android.text.TextUtils.TruncateAt.END);
        details.addView(title);
        String start = schedule.optString("startAt"), end = schedule.optString("endAt");
        String startDay = visualDateLabel(start, "yyyy-MM-dd", "");
        String endDay = visualDateLabel(end, "yyyy-MM-dd", "");
        String range = visualDateLabel(start, "HH:mm", pretty(start)) + " - "
            + visualDateLabel(end, !startDay.isEmpty() && startDay.equals(endDay) ? "HH:mm" : "M月d日 HH:mm", pretty(end));
        TextView time = text(range, 14, GREEN);
        time.setPadding(0, dp(6), 0, dp(4));
        details.addView(time);
        String rawStatus = schedule.optString("status", "计划中");
        String status = ("planned".equals(rawStatus) || "pending".equals(rawStatus)) ? "计划中"
            : ("done".equals(rawStatus) || "completed".equals(rawStatus)) ? "已完成"
            : ("cancelled".equals(rawStatus) || "canceled".equals(rawStatus)) ? "已取消"
            : "active".equals(rawStatus) ? "进行中" : rawStatus;
        details.addView(text(status + " · 北京时间", 11, MUTED));
        details.addView(text("本机提醒：" + reminders.labelFor(schedule.optString("id")), 11, GREEN));
        String place = schedule.optString("place"), note = schedule.optString("note");
        if (!place.isEmpty()) {
            TextView location = text("地点：" + place, 13, MUTED);
            location.setMaxLines(2);
            location.setEllipsize(android.text.TextUtils.TruncateAt.END);
            location.setPadding(0, dp(6), 0, 0);
            details.addView(location);
        }
        if (!note.isEmpty()) {
            TextView description = text(note, 13, MUTED);
            description.setMaxLines(2);
            description.setEllipsize(android.text.TextUtils.TruncateAt.END);
            description.setPadding(0, dp(5), 0, 0);
            details.addView(description);
        }
        item.addView(details, new LinearLayout.LayoutParams(0, -2, 1));
        item.setOnClickListener(v -> showScheduleDetails(schedule));
        body.addView(item);
    }


    private Button reminderOverviewButton() {
        Button button = secondaryButton("本机日程提醒 · " + reminders.configuredCount());
        button.setOnClickListener(v -> showReminderOverview());
        return button;
    }

    private void dismissReminderEditor() {
        pendingReminderRequest = null;
        if (reminderDialog != null) reminderDialog.dismiss();
        reminderDialog = null;
    }

    private void invalidateLocalReminders() {
        dismissReminderEditor();
        pendingReminderKey = "";
        // Invalidating the account anchor first also blocks delivery if reminder cleanup fails.
        getSharedPreferences("native_workbench", MODE_PRIVATE).edit().remove("active_scope:" + baseUrl).apply();
        if (reminders != null) {
            try { reminders.switchScope(""); } catch (RuntimeException ignored) { }
        }
    }

    private JSONObject currentSchedule(String id, JSONObject snapshot) {
        if (id == null || id.isEmpty() || snapshot == null) return null;
        JSONArray schedules = snapshot.optJSONArray("schedules");
        JSONObject found = null;
        if (schedules != null) for (int i = 0; i < schedules.length(); i++) {
            JSONObject item = schedules.optJSONObject(i);
            if (item != null && id.equals(item.optString("id"))) {
                if (found != null) return null;
                found = item;
            }
        }
        return found;
    }

    private void showScheduleDetails(JSONObject schedule) {
        String place = schedule.optString("place"), note = schedule.optString("note");
        new AlertDialog.Builder(this).setTitle(schedule.optString("title", "日程"))
            .setMessage(pretty(schedule.optString("startAt")) + "\n结束：" + pretty(schedule.optString("endAt"))
                + "\n状态：" + schedule.optString("status", "待核对")
                + "\n本机提醒：" + reminders.labelFor(schedule.optString("id"))
                + (place.isEmpty() ? "" : "\n地点：" + place) + (note.isEmpty() ? "" : "\n\n" + note))
            .setNeutralButton("本机提醒", (d, which) -> showScheduleReminder(schedule))
            .setPositiveButton("关闭", null).show();
    }

    private void showScheduleReminder(JSONObject schedule) {
        if (reminderDialog != null || bindingChanging || !WorkbenchReminderPolicy.validScope(activeDraftScope)) return;
        final String scope = activeDraftScope;
        LinearLayout form = dialogForm();
        form.addView(text("普通提醒可能因系统省电而延迟，不是精确闹钟，也不会修改云端日程。"
            + "\n远端更改需打开 App 刷新；本次未能核对的提醒会暂停，需重新确认。通知不展示日程详情。", 13, MUTED));
        RadioGroup choices = new RadioGroup(this);
        choices.setOrientation(LinearLayout.VERTICAL);
        final int[] offsets = {0, 10, 30, 60};
        final int[] ids = new int[offsets.length];
        for (int i = 0; i < offsets.length; i++) {
            RadioButton option = new RadioButton(this);
            ids[i] = View.generateViewId();
            option.setId(ids[i]);
            option.setText(offsets[i] == 0 ? "开始时提醒" : "提前 " + offsets[i] + " 分钟");
            option.setTextColor(INK);
            option.setTextSize(15);
            option.setMinHeight(dp(48));
            choices.addView(option, new RadioGroup.LayoutParams(-1, -2));
            if (offsets[i] == reminders.offsetFor(schedule.optString("id"))) choices.check(ids[i]);
        }
        form.addView(choices);
        ScrollView scroll = new ScrollView(this);
        scroll.addView(form, new ScrollView.LayoutParams(-1, -2));
        AlertDialog dialog = new AlertDialog.Builder(this).setTitle("设置本机日程提醒")
            .setView(scroll).setNegativeButton("返回", null)
            .setNeutralButton("取消这条提醒", (d, which) -> {
                if (!scope.equals(activeDraftScope)) return;
                try { reminders.cancel(schedule.optString("id")); render(); }
                catch (RuntimeException error) { Toast.makeText(this, "未能清理本机提醒，请重试。", Toast.LENGTH_LONG).show(); }
            }).setPositiveButton("设置提醒", null).create();
        reminderDialog = dialog;
        dialog.setOnDismissListener(d -> {
            if (reminderDialog == dialog) { reminderDialog = null; pendingReminderRequest = null; }
        });
        dialog.setOnShowListener(d -> dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v -> {
            if (pendingReminderRequest != null) return;
            int minutes = -1;
            for (int i = 0; i < ids.length; i++) if (choices.getCheckedRadioButtonId() == ids[i]) minutes = offsets[i];
            NativeScheduleReminders.Request request = new NativeScheduleReminders.Request(scope, schedule, minutes);
            if (WorkbenchReminderPolicy.trigger(request.candidate(), minutes, System.currentTimeMillis()) == null) {
                Toast.makeText(this, "请选择尚未到期的有效提醒时间。", Toast.LENGTH_LONG).show(); return;
            }
            if (Build.VERSION.SDK_INT >= 33 && androidx.core.content.ContextCompat.checkSelfPermission(this,
                    Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                pendingReminderRequest = request;
                ActivityCompat.requestPermissions(this, new String[] {Manifest.permission.POST_NOTIFICATIONS}, REMINDER_PERMISSION_REQUEST);
            } else if (!reminders.notificationsAllowed()) {
                new AlertDialog.Builder(this).setTitle("通知未开启")
                    .setMessage("本次尚未设置提醒。可到系统设置开启 App 通知与日程提醒频道，再回来主动设置。")
                    .setNegativeButton("返回", null).setPositiveButton("系统设置", (a, w) -> {
                        Intent settings = Build.VERSION.SDK_INT >= 26
                            ? new Intent(android.provider.Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(android.provider.Settings.EXTRA_APP_PACKAGE, getPackageName())
                            : new Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getPackageName()));
                        try { startActivity(settings); } catch (ActivityNotFoundException ignored) {
                            Toast.makeText(this, "请在系统设置中开启 App 通知。", Toast.LENGTH_LONG).show();
                        }
                    }).show();
            } else commitReminderRequest(request);
        }));
        dialog.show();
    }

    private void commitReminderRequest(NativeScheduleReminders.Request request) {
        if (isFinishing() || isDestroyed()) return;
        JSONObject latest = currentSchedule(request.id, data);
        WorkbenchReminderPolicy.Candidate candidate = latest == null ? null : new NativeScheduleReminders.Request(activeDraftScope, latest, request.minutes).candidate();
        WorkbenchReminderPolicy.Candidate frozen = request.candidate();
        if (!request.scope.equals(activeDraftScope) || !bridgeReady || !homeReadSucceeded || bindingChanging
            || syncing || saving || System.currentTimeMillis() - lastHomeReadAt > 5 * 60000L
            || frozen.start == null || frozen.end == null || !WorkbenchReminderPolicy.sameTime(candidate, frozen.start, frozen.end)
            || !candidate.status.equals(frozen.status)) {
            Toast.makeText(this, "日程或连接状态已变化，请先刷新，再重新设置提醒。", Toast.LENGTH_LONG).show(); return;
        }
        try {
            reminders.create(request);
            dismissReminderEditor();
            render();
            Toast.makeText(this, "已设置本机普通提醒，系统可能延迟。", Toast.LENGTH_LONG).show();
        } catch (RuntimeException error) {
            Toast.makeText(this, error.getMessage() == null ? "本机提醒未设置，请重新核对。" : error.getMessage(), Toast.LENGTH_LONG).show();
        }
    }

    @Override public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode != REMINDER_PERMISSION_REQUEST) return;
        NativeScheduleReminders.Request request = pendingReminderRequest;
        pendingReminderRequest = null;
        if (request != null && grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED)
            commitReminderRequest(request);
        else Toast.makeText(this, "本次未设置提醒，不影响日程使用。", Toast.LENGTH_LONG).show();
    }

    private void showReminderOverview() {
        final String scope = activeDraftScope;
        new AlertDialog.Builder(this).setTitle("本机日程提醒")
            .setMessage("已安排：" + reminders.configuredCount() + " 条\n需重新核对：" + reminders.reviewCount()
                + " 条\n通知：" + (reminders.notificationsAllowed() ? "已开启" : "未开启")
                + "\n\n到“日程”点开一条安排，设置开始时或提前 10、30、60 分钟的提醒。"
                + "\n提醒只在本机运行，不是后台实时同步。重启或安装更新仅恢复尚未到期的提醒，不补发错过的提醒。"
                + "\n系统省电或强行停止 App 可能导致延迟或不提醒。一次最多保存 64 条设置，清理只影响本机。")
            .setPositiveButton("关闭", null).setNeutralButton("刷新核对", (d, w) -> sync())
            .setNegativeButton("取消全部本机提醒", (d, w) -> new AlertDialog.Builder(this).setTitle("取消本机提醒？")
                .setMessage("仅取消这台手机的提醒，不会删除或修改云端日程。").setNegativeButton("返回", null)
                .setPositiveButton("确认取消", (a, b) -> {
                    if (!scope.equals(activeDraftScope)) return;
                    try { reminders.clear(); render(); }
                    catch (RuntimeException error) { Toast.makeText(this, "清理失败，请重试。", Toast.LENGTH_LONG).show(); }
                }).show()).show();
    }

    private void readReminderIntent(Intent intent) {
        if (intent == null || !NativeScheduleReminders.ACTION_OPEN.equals(intent.getAction())) return;
        String key = intent.getStringExtra(NativeScheduleReminders.EXTRA_KEY);
        if (WorkbenchReminderPolicy.validKey(key)) pendingReminderKey = key;
    }

    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        readReminderIntent(intent);
        if (!pendingReminderKey.isEmpty()) {
            dismissReminderEditor();
            if (bridgeReady) sync(); else showAuth();
        }
    }

    private void openPendingReminder(JSONObject snapshot) {
        if (pendingReminderKey.isEmpty()) return;
        String key = pendingReminderKey;
        pendingReminderKey = "";
        String id = reminders.idForKey(key, activeDraftScope);
        JSONObject schedule = currentSchedule(id, snapshot);
        if (schedule == null) {
            Toast.makeText(this, "本次未能核对这条提醒，可能已变更或属于其他账号。请查看日程，不会补造记录。", Toast.LENGTH_LONG).show(); return;
        }
        resetScheduleFilters();
        selectTab("schedule");
        showScheduleDetails(schedule);
    }

    private String visualDateLabel(String raw, String pattern, String fallback) {
        if (raw == null || raw.isEmpty()) return fallback;
        String normalized = raw.endsWith("Z") ? raw.substring(0, raw.length() - 1) + "+0000"
            : raw.replaceAll("([+-]\\d\\d):(\\d\\d)$", "$1$2");
        for (String source : new String[] {"yyyy-MM-dd'T'HH:mm:ss.SSSZ", "yyyy-MM-dd'T'HH:mm:ssZ",
                "yyyy-MM-dd'T'HH:mmZ", "yyyy-MM-dd HH:mm:ss"}) {
            SimpleDateFormat parser = new SimpleDateFormat(source, Locale.US);
            parser.setLenient(false);
            parser.setTimeZone(TimeZone.getTimeZone("UTC"));
            java.text.ParsePosition position = new java.text.ParsePosition(0);
            Date value = parser.parse(normalized, position);
            if (value == null || position.getIndex() != normalized.length()) continue;
            SimpleDateFormat display = new SimpleDateFormat(pattern, Locale.CHINA);
            display.setTimeZone(TimeZone.getTimeZone("Asia/Shanghai"));
            return display.format(value);
        }
        return fallback;
    }

    private void emptyCard(LinearLayout body, String title, String hint, String action, Runnable listener) {
        LinearLayout empty = card();
        empty.setGravity(Gravity.CENTER_HORIZONTAL);
        empty.setBackground(NativeUi.shape(this, 0xFFF0F4EC, 22, NativeUi.BORDER));
        empty.addView(new NativeUi.IconView(this, "schedule".equals(tab) ? "schedule" : "records", GREEN),
            new LinearLayout.LayoutParams(dp(34), dp(34)));
        TextView heading = text(title, 17, INK);
        heading.setTypeface(NativeUi.MEDIUM);
        heading.setGravity(Gravity.CENTER);
        heading.setPadding(0, dp(12), 0, dp(6));
        empty.addView(heading);
        TextView description = text(hint, 13, MUTED);
        description.setGravity(Gravity.CENTER);
        description.setPadding(0, 0, 0, dp(12));
        empty.addView(description);
        Button button = secondaryButton(action);
        button.setOnClickListener(v -> listener.run());
        empty.addView(button);
        body.addView(empty);
    }

    private Button primaryButton(String value) {
        return NativeUi.button(this, value, true);
    }

    private Button secondaryButton(String value) {
        return NativeUi.button(this, value, false);
    }

    private EditText input(String hint, boolean multiline) {
        EditText edit = new EditText(this);
        NativeUi.styleInput(edit);
        edit.setHint(hint);
        if (multiline) {
            edit.setInputType(android.text.InputType.TYPE_CLASS_TEXT | android.text.InputType.TYPE_TEXT_FLAG_MULTI_LINE);
            edit.setMinLines(4);
            edit.setGravity(Gravity.TOP | Gravity.START);
        } else edit.setSingleLine(true);
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, -2);
        params.setMargins(0, dp(5), 0, dp(12));
        edit.setLayoutParams(params);
        return edit;
    }

    private LinearLayout dialogForm() {
        LinearLayout form = NativeUi.column(this);
        form.setPadding(dp(22), dp(12), dp(22), dp(8));
        return form;
    }

    private void showStartCheckinDialog() {
        showStartCheckinDialog("专注打卡");
    }

    private void showStartCheckinDialog(String initialTitle) {
        LinearLayout form = dialogForm();
        EditText title = input("这次要专注什么？", false);
        title.setText(initialTitle);
        form.addView(title);
        new AlertDialog.Builder(this)
            .setTitle("兼职打卡".equals(initialTitle) ? "记录兼职工时" : "开始打卡")
            .setMessage("兼职打卡".equals(initialTitle)
                ? "只记录这段工作的时间，不自动计算工资、应收或结算。完成后点击结束并保存。"
                : "开始后可以继续使用 App，完成时点击结束。")
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
        LinearLayout form=dialogForm();EditText title=input("标题（可选）",false),body=input("现在发生了什么？",true);form.addView(title);form.addView(body);
        AlertDialog dialog=new AlertDialog.Builder(this).setTitle("新建记录").setView(scrollForm(form)).setNegativeButton("取消",null)
            .setNeutralButton("存为本机草稿",null).setPositiveButton("联网保存",null).create();
        dialog.setOnShowListener(d->{
            PayloadFactory values=()->{
                if(title.getText().toString().trim().isEmpty()&&body.getText().toString().trim().isEmpty()){body.setError("请填写内容");return null;}
                JSONObject p=basePayload("event.create");put(p,"title",title.getText().toString());put(p,"content",body.getText().toString());put(p,"happenedAt",iso(new Date()));return p;
            };
            dialog.getButton(AlertDialog.BUTTON_NEUTRAL).setOnClickListener(v->{JSONObject p=values.create();if(p!=null)saveDraft(p,dialog);});
            dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v->{JSONObject p=values.create();if(p!=null)submit(p,"记录已保存",dialog::dismiss);});
        });dialog.show();
    }

    private void showInboxDialog() {
        LinearLayout form=dialogForm();EditText body=input("先记下来，稍后再整理",true);form.addView(body);
        AlertDialog dialog=new AlertDialog.Builder(this).setTitle("放入收件箱").setView(scrollForm(form)).setNegativeButton("取消",null)
            .setNeutralButton("存为本机草稿",null).setPositiveButton("联网保存",null).create();
        dialog.setOnShowListener(d->{
            PayloadFactory values=()->{if(body.getText().toString().trim().isEmpty()){body.setError("请填写内容");return null;}JSONObject p=basePayload("inbox.create");put(p,"content",body.getText().toString());return p;};
            dialog.getButton(AlertDialog.BUTTON_NEUTRAL).setOnClickListener(v->{JSONObject p=values.create();if(p!=null)saveDraft(p,dialog);});
            dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v->{JSONObject p=values.create();if(p!=null)submit(p,"已放入收件箱",dialog::dismiss);});
        });dialog.show();
    }

    private void showScheduleDialog() {
        LinearLayout form=dialogForm();EditText title=input("日程名称",false),place=input("地点（可选）",false),note=input("备注（可选）",true);
        Calendar start=Calendar.getInstance(TimeZone.getTimeZone("Asia/Shanghai"),Locale.CHINA);start.add(Calendar.HOUR_OF_DAY,1);start.set(Calendar.SECOND,0);start.set(Calendar.MILLISECOND,0);
        Calendar end=(Calendar)start.clone();end.add(Calendar.HOUR_OF_DAY,1);
        Button time=secondaryButton(scheduleLabel(start)),endTime=secondaryButton("结束："+scheduleLabel(end));
        time.setOnClickListener(v->pickDateTime(start,time,()->{if(!end.after(start))end.setTimeInMillis(start.getTimeInMillis()+3600000);endTime.setText("结束："+scheduleLabel(end));}));
        endTime.setOnClickListener(v->pickDateTime(end,endTime,()->endTime.setText("结束："+scheduleLabel(end))));
        form.addView(title);form.addView(time);form.addView(endTime);form.addView(place);form.addView(note);
        AlertDialog dialog=new AlertDialog.Builder(this).setTitle("新建日程").setView(scrollForm(form)).setNegativeButton("取消",null)
            .setNeutralButton("存为本机草稿",null).setPositiveButton("联网保存",null).create();
        dialog.setOnShowListener(d->{
            PayloadFactory values=()->{
                if(title.getText().toString().trim().isEmpty()){title.setError("请填写日程名称");return null;}
                if(!end.after(start)){Toast.makeText(this,"结束时间必须晚于开始时间",Toast.LENGTH_LONG).show();return null;}
                JSONObject p=basePayload("schedule.create");put(p,"title",title.getText().toString());put(p,"place",place.getText().toString());put(p,"note",note.getText().toString());put(p,"startAt",iso(start.getTime()));put(p,"endAt",iso(end.getTime()));return p;
            };
            dialog.getButton(AlertDialog.BUTTON_NEUTRAL).setOnClickListener(v->{JSONObject p=values.create();if(p!=null)saveDraft(p,dialog);});
            dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v->{JSONObject p=values.create();if(p!=null)submit(p,"日程已保存",dialog::dismiss);});
        });dialog.show();
    }

    private int draftCount() { try{return drafts==null?0:drafts.list().length();}catch(Exception ignored){return 0;} }
    private void saveDraft(JSONObject payload,AlertDialog form) {
        try {
            if(drafts==null||activeDraftScope.isEmpty())throw new IllegalStateException("请先完成一次工作台登录，才能建立账号隔离的本机草稿。");
            drafts.add(payload);form.dismiss();Toast.makeText(this,"已保存到本机，尚未提交云端。",Toast.LENGTH_LONG).show();if(data!=null)render();
        } catch(Exception error){Toast.makeText(this,error.getMessage(),Toast.LENGTH_LONG).show();}
    }
    private void showDrafts() {
        if(draftSheet!=null||workSheet!=null||aiSheet!=null||nutritionSheet!=null||saving||bindingChanging)return;
        if(drafts==null||activeDraftScope.isEmpty()){Toast.makeText(this,"请先完成一次工作台登录，再使用账号隔离的本机草稿。",Toast.LENGTH_LONG).show();return;}
        final String scope=activeDraftScope;
        draftSheet=new NativeDraftSheet(this,mobileApi,baseUrl,drafts,new NativeDraftSheet.Host(){
            @Override public boolean connected(){return bridgeReady&&data!=null&&scope.equals(activeDraftScope)&&!saving&&!syncing&&!saveOutcomeUnknown&&!bindingChanging;}
            @Override public void onSaved(){sync();}
            @Override public void onClosed(){draftSheet=null;}
        });draftSheet.show();
    }
    private void showWork() {
        if(workSheet!=null||draftSheet!=null||aiSheet!=null||nutritionSheet!=null||saving||syncing||bindingChanging)return;
        if(!bridgeReady||data==null||activeDraftScope.isEmpty()){showAuth();return;}
        workSheet=new NativeWorkSheet(this,mobileApi,baseUrl,activeDraftScope,new NativeWorkSheet.Host(){
            @Override public boolean writesBlocked(){return saveOutcomeUnknown||saving||bindingChanging;}
            @Override public void onSaved(){sync();}
            @Override public void onAuthRequired(){showAuth();}
            @Override public void onClosed(){workSheet=null;}
        });workSheet.show();
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
        if (syncing || saving || (workSheet!=null&&workSheet.isBusy()) || (draftSheet!=null&&draftSheet.isBusy())) return;
        if (!bridgeReady || authWebView == null) {
            showAuth();
            return;
        }
        syncing = true;
        connectionDiagnosticState = "reading";
        syncLabel.setText("同步中");
        if ("home".equals(tab) && data != null) render();
        api("GET", null, envelope -> {
            syncing = false;
            int status = envelope.optInt("status");
            lastMobileHttpStatus = status;
            if (needsAuth(envelope)) {
                connectionDiagnosticState = "authorization-required";
                syncLabel.setText("需要授权");
                showAuth();
                return;
            }
            if (status >= 400 || status == 0) {
                connectionDiagnosticState = status == 0 ? "no-http-result" : "http-error";
                syncLabel.setText("连接失败");
                homeReadSucceeded = false;
                homeConnectionMessage = responseError(envelope);
                if (data == null) showError(homeConnectionMessage);
                else {
                    if ("home".equals(tab)) render();
                    Toast.makeText(this, homeConnectionMessage, Toast.LENGTH_LONG).show();
                }
                return;
            }
            try {
                JSONObject snapshot = new JSONObject(envelope.optString("body", "{}"));
                if (snapshot.optJSONObject("user") == null || snapshot.optJSONArray("records") == null
                    || snapshot.optJSONArray("schedules") == null || snapshot.optJSONObject("summary") == null) {
                    throw new IllegalArgumentException("invalid mobile snapshot");
                }
                String accountScope=WorkbenchOperationPolicy.scope(baseUrl,snapshot.getJSONObject("user").optString("email"));
                if(accountScope.isEmpty())throw new IllegalArgumentException("account missing");
                if(!accountScope.equals(activeDraftScope)){
                    dismissReminderEditor();
                    resetScheduleFilters();
                    resetRecordFilters();
                    if(draftSheet!=null)draftSheet.close();
                    if(workSheet!=null)workSheet.close();
                    activeDraftScope=accountScope;drafts=new NativeDraftStore(this,activeDraftScope);
                }
                getSharedPreferences("native_workbench",MODE_PRIVATE).edit().putString("active_scope:"+baseUrl,activeDraftScope).apply();
                data = snapshot;
                try { reminders.reconcile(accountScope, snapshot.optJSONArray("schedules")); }
                catch (RuntimeException reminderError) {
                    invalidateLocalReminders();
                    Toast.makeText(this, "本机提醒核对失败，请到日程详情重新确认。", Toast.LENGTH_LONG).show();
                }
                lastHomeReadAt = System.currentTimeMillis();
                homeReadSucceeded = true;
                homeConnectionMessage = "";
                connectionDiagnosticState = "ready";
                CookieManager.getInstance().flush();
                syncLabel.setText(saveOutcomeUnknown ? "结果待核实" : "已同步");
                closeAuth();
                selectTab(tab);
                openPendingReminder(snapshot);
            } catch (Exception error) {
                connectionDiagnosticState = "invalid-response";
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
        boolean required = status == 401 || status == 403 || type.contains("text/html")
            || !mobileApi.matchesOrigin(uri) || !"/api/mobile".equals(uri.getPath());
        if (required) {
            homeReadSucceeded = false;
            invalidateLocalReminders();
        }
        return required;
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
        homeReadSucceeded = false;
        homeConnectionMessage = message;
        if (baseUrl.isEmpty()) { showBindingWelcome(); return; }
        if ("home".equals(tab)) { render(); return; }
        content.removeAllViews();
        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.setVerticalScrollBarEnabled(false);
        LinearLayout body = page();
        body.setGravity(Gravity.CENTER_VERTICAL);
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
        Button help = secondaryButton("安装与登录帮助");
        help.setOnClickListener(v -> showInstallHelp());
        box.addView(help);
        box.addView(privacyButton());
        Button features = secondaryButton("全部功能与使用入口");
        features.setOnClickListener(v -> selectTab("features"));
        box.addView(features);
        Button update = secondaryButton("检查 App 新版本");
        update.setOnClickListener(v -> showUpdateCheck());
        box.addView(update);
        if(!activeDraftScope.isEmpty()){
            Button draftsButton=secondaryButton("查看本机草稿");draftsButton.setOnClickListener(v->showDrafts());box.addView(draftsButton);
            Button capture=secondaryButton("离线写一条草稿");capture.setOnClickListener(v->showRecordDialog());box.addView(capture);
        }
        box.addView(diagnosticsButton());
        body.addView(box);
        scroll.addView(body);
        content.addView(scroll, new FrameLayout.LayoutParams(-1, -1));
    }

    private void setSaveOutcomeUnknown(boolean value) {
        saveOutcomeUnknown = value;
        getSharedPreferences("native_workbench", MODE_PRIVATE).edit().putBoolean("save_outcome_unknown", value).apply();
    }

    private void showNutrition() {
        if (saving || syncing || bindingChanging || workSheet != null || draftSheet != null || aiSheet != null) {
            Toast.makeText(this, "请先结束当前连接、保存或 AI 页面。", Toast.LENGTH_SHORT).show(); return;
        }
        if (!bridgeReady || data == null) { showAuth(); return; }
        if (nutritionSheet != null) return;
        nutritionSheet = new NativeNutritionSheet(this, mobileApi, baseUrl, new NativeNutritionSheet.Host() {
            @Override public String accountScope() { return activeDraftScope; }
            @Override public boolean writesBlocked() { return saveOutcomeUnknown || saving || bindingChanging; }
            @Override public void pickPhoto(boolean camera, NativeNutritionPhotoPicker.Callback callback) {
                nutritionPhotoPicker.pick(camera, callback);
            }
            @Override public void onAuthRequired() { showAuth(); }
            @Override public void onDiagnosticReport(String report) { lastNutritionDiagnostic = report; }
            @Override public void onClosed() { nutritionSheet = null; }
        });
        nutritionSheet.show();
    }

    private void showAi() {
        if (saving || syncing || bindingChanging || workSheet != null || draftSheet != null) { Toast.makeText(this, "请先等待当前连接或保存完成。", Toast.LENGTH_SHORT).show(); return; }
        if (!bridgeReady || data == null) { showAuth(); return; }
        if (aiSheet != null || nutritionSheet != null) return;
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

    private void showBindingWelcome() {
        connectionDiagnosticState = "needs-binding";
        homeReadSucceeded = false;
        homeConnectionMessage = "";
        syncLabel.setText("待绑定");
        selectTab("home");
    }
    private void showBinding() {
        if (bindingChanging || saving || syncing || (aiSheet != null && aiSheet.isBusy())
            || (nutritionSheet != null && nutritionSheet.isBusy())) {
            Toast.makeText(this, "请先等待当前请求结束。", Toast.LENGTH_LONG).show(); return;
        }
        if (saveOutcomeUnknown || NativeNutritionSheet.hasUnknownSave(this, baseUrl)) {
            Toast.makeText(this, "请先核对上次保存，在“我的”或“热量与饮食”确认后再更换工作台。", Toast.LENGTH_LONG).show(); return;
        }
        if (bindingDialog != null && bindingDialog.isShowing()) return;
        EditText address = input("https://你的工作台域名", false);
        address.setInputType(android.text.InputType.TYPE_CLASS_TEXT | android.text.InputType.TYPE_TEXT_VARIATION_URI);
        address.setText(baseUrl);
        address.setFilters(new android.text.InputFilter[] {new android.text.InputFilter.LengthFilter(WorkbenchBindingPolicy.MAX_ADDRESS)});
        LinearLayout form = dialogForm();
        form.addView(text("填写自己的可信 HTTPS 根地址，不填邮箱、登录路径、密钥或密码。新地址会接收本次授权与操作。", 13, MUTED));
        form.addView(address);
        Button paste = secondaryButton("粘贴工作台地址");
        paste.setOnClickListener(v -> pasteWorkbenchAddress(address));
        form.addView(paste);
        TextView hint = text("只在你点击粘贴时读取第一项剪贴板文本，不自动连接。下一步会让你确认域名。", 11, MUTED);
        hint.setPadding(0, dp(7), 0, dp(5));
        form.addView(hint);
        bindingDialog = new AlertDialog.Builder(this).setTitle(baseUrl.isEmpty() ? "绑定我的工作台" : "更换工作台")
            .setView(scrollForm(form)).setNegativeButton("暂不连接", (d, which) -> {
                if (baseUrl.isEmpty()) showBindingWelcome();
            }).setPositiveButton("连接", null).create();
        bindingDialog.setOnShowListener(v -> bindingDialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(w -> {
            String next = WorkbenchBindingPolicy.preparedOrigin(address.getText().toString());
            if (next.isEmpty()) {
                address.setError("请输入一个可信 HTTPS 根域名地址，不填邮箱、登录路径、参数、IP 或本地地址。");
                return;
            }
            if (next.equals(baseUrl)) { bindingDialog.dismiss(); showAuth(); return; }
            confirmWorkbenchBinding(next);
        }));
        bindingDialog.show();
    }

    private void pasteWorkbenchAddress(EditText address) {
        try {
            ClipboardManager clipboard = (ClipboardManager) getSystemService(CLIPBOARD_SERVICE);
            ClipData clip = clipboard == null ? null : clipboard.getPrimaryClip();
            CharSequence copied = clip == null || clip.getItemCount() == 0 ? null : clip.getItemAt(0).getText();
            if (copied == null) {
                Toast.makeText(this, "先复制你的 HTTPS 工作台根地址，再点击粘贴。", Toast.LENGTH_LONG).show();
                return;
            }
            String origin = WorkbenchBindingPolicy.preparedOrigin(copied.toString());
            if (origin.isEmpty()) {
                address.setError("剪贴板不是一个可用的 HTTPS 根地址。请复制网址，不要复制登录链接、邮箱、密码或多行文字。");
                return;
            }
            address.setError(null);
            address.setText(origin);
            address.setSelection(origin.length());
            Toast.makeText(this, "地址已填入，确认域名后点击连接。", Toast.LENGTH_LONG).show();
        } catch (SecurityException error) {
            Toast.makeText(this, "暂时无法读取剪贴板，可长按输入框手动粘贴地址。", Toast.LENGTH_LONG).show();
        }
    }

    private void confirmWorkbenchBinding(String origin) {
        if (bindingConfirmation != null && bindingConfirmation.isShowing()) return;
        final String previousOrigin = baseUrl;
        final AlertDialog confirmation = new AlertDialog.Builder(this)
            .setTitle((previousOrigin.isEmpty() ? "确认连接到 " : "确认切换到 ") + Uri.parse(origin).getHost())
            .setMessage(previousOrigin.isEmpty()
                ? "将使用这个工作台地址打开登录授权页，并向它读取和保存你的工作台数据。请核对域名确实属于你要使用的工作台；此确认不会自动登录或创建记录。"
                : "会清除本 App 的登录会话、当前页面、AI 草稿和本机日程提醒，再授权新工作台。不会删除旧工作台的云端记录。请确认新域名可信。")
            .setNegativeButton("返回修改", null)
            .setPositiveButton(previousOrigin.isEmpty() ? "确认连接" : "确认更换", (d, which) -> {
                if (isFinishing() || isDestroyed()) return;
                if (!previousOrigin.equals(baseUrl) || bindingChanging || saving || syncing
                        || saveOutcomeUnknown || (aiSheet != null && aiSheet.isBusy())
                        || NativeNutritionSheet.hasUnknownSave(this, baseUrl)
                        || (nutritionSheet != null && nutritionSheet.isBusy())) {
                    Toast.makeText(this, "工作台状态已变化，请等待当前操作结束后重新确认。", Toast.LENGTH_LONG).show();
                    return;
                }
                if (bindingDialog != null) bindingDialog.dismiss();
                bindWorkbench(origin);
            }).create();
        bindingConfirmation = confirmation;
        confirmation.setOnDismissListener(d -> {
            if (bindingConfirmation == confirmation) bindingConfirmation = null;
        });
        confirmation.show();
    }

    private void bindWorkbench(String origin) {
        invalidateLocalReminders();
        bindingChanging = true;
        if(workSheet!=null)workSheet.close();
        if(draftSheet!=null)draftSheet.close();
        if (nutritionSheet != null) nutritionSheet.close();
        if (aiSheet != null) aiSheet.close();
        bridgeReady = false; mobileApi.close();
        if (authWebView != null) {
            authWebView.stopLoading(); detach(authWebView); authWebView.destroy(); authWebView = null;
        }
        View overlay = root.findViewWithTag("auth-overlay");
        if (overlay != null) root.removeView(overlay);
        resetScheduleFilters();
        resetRecordFilters();
        data = null; tab = "home"; baseUrl = origin;
        lastHomeReadAt = 0; homeReadSucceeded = false; homeConnectionMessage = "";
        activeDraftScope="";drafts=new NativeDraftStore(this,"");
        lastMobileHttpStatus = 0; lastNutritionDiagnostic = "";
        connectionDiagnosticState = "authorization";
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
        if (baseUrl.isEmpty()) { showBindingWelcome(); return; }
        if (root.findViewWithTag("auth-overlay") != null) return;
        connectionDiagnosticState = "authorization";
        bridgeReady = false;
        if (saving) return;
        mobileApi.cancelPending();
        syncLabel.setText("等待授权");

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
        authHeader.addView(diagnosticsButton());
        authHeader.addView(privacyButton());
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
            settings.setUserAgentString(settings.getUserAgentString() + " RichangyuNative/" + appVersion());
            CookieManager.getInstance().setAcceptThirdPartyCookies(authWebView, true);
            if (!mobileApi.attach(authWebView)) {
                connectionDiagnosticState = "webview-unavailable";
                authWebView.destroy(); authWebView = null;
                showError("系统网页组件过旧，无法建立安全连接。请更新 Android System WebView 或 Chrome 后重试。"); return;
            }
            authWebView.setWebViewClient(new WebViewClient() {
                @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                    if ("https".equalsIgnoreCase(request.getUrl().getScheme()) && request.getUrl().getUserInfo() == null) return false;
                    Toast.makeText(MainActivity.this, "只允许安全的 HTTPS 授权页面。", Toast.LENGTH_LONG).show(); return true;
                }
                @Override public void onPageStarted(WebView view, String url, android.graphics.Bitmap icon) {
                    connectionDiagnosticState = "authorization";
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
                        connectionDiagnosticState = "page-load-failed";
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

    private interface PayloadFactory { JSONObject create(); }

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
        if (data != null && bridgeReady && !saving && reminderDialog == null && (aiSheet == null || !aiSheet.isBusy())
            && (nutritionSheet == null || !nutritionSheet.isBusy())) sync();
    }
    @Override protected void onPause() {
        clockHandler.removeCallbacks(clockTick); super.onPause();
    }
    @Override protected void onDestroy() {
        dismissReminderEditor();
        cancelScheduleFilter();
        clockHandler.removeCallbacks(clockTick);
        if (saving || (aiSheet != null && aiSheet.isWriting())) setSaveOutcomeUnknown(true);
        if (workSheet != null) workSheet.close();
        if (draftSheet != null) draftSheet.close();
        if (nutritionSheet != null) nutritionSheet.close();
        if (nutritionPhotoPicker != null) nutritionPhotoPicker.close();
        if (aiSheet != null) aiSheet.close();
        if (bindingConfirmation != null && bindingConfirmation.isShowing()) bindingConfirmation.dismiss();
        if (bindingDialog != null && bindingDialog.isShowing()) bindingDialog.dismiss();
        if (updateDialog != null && updateDialog.isShowing()) updateDialog.dismiss();
        if (diagnosticDialog != null && diagnosticDialog.isShowing()) diagnosticDialog.dismiss();
        if (updateChecker != null) updateChecker.close();
        if (mobileApi != null) mobileApi.close();
        if (authWebView != null) authWebView.destroy();
        super.onDestroy();
    }
}
