package com.richangyu.lifeworkbench;

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
    private NativeAiSheet aiSheet;
    private NativeNutritionSheet nutritionSheet;
    private boolean bindingChanging;
    private AlertDialog bindingDialog;
    private AlertDialog bindingConfirmation;
    private AlertDialog updateDialog;
    private NativeUpdateChecker updateChecker;
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
    private String scheduleScope = WorkbenchSchedulePolicy.ALL;
    private String scheduleQuery = "";
    private Runnable scheduleFilterTask;
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
        SplashScreen.installSplashScreen(this);
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
        identity.addView(text("生活工作台", 11, MUTED));
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
        if (data == null) {
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
        if ("records".equals(tab)) renderRecords(body);
        else if ("schedule".equals(tab)) renderSchedules(body);
        else if ("me".equals(tab)) renderMe(body);
        else renderHome(body);
        if (!tab.equals(lastRenderedTab)) NativeUi.enter(body);
        lastRenderedTab = tab;
    }

    private void renderHome(LinearLayout body) {
        JSONObject user = data.optJSONObject("user");
        String name = user == null ? "你好" : user.optString("displayName", "你好");
        Calendar clock = Calendar.getInstance(TimeZone.getTimeZone("Asia/Shanghai"));
        int hour = clock.get(Calendar.HOUR_OF_DAY);
        String greeting = hour < 12 ? "早上好" : hour < 18 ? "下午好" : "晚上好";
        SimpleDateFormat date = new SimpleDateFormat("M月d日 EEEE", Locale.CHINA);
        date.setTimeZone(TimeZone.getTimeZone("Asia/Shanghai"));
        TextView day = text(date.format(new Date()) + " · 北京时间", 12, MUTED);
        body.addView(day);
        TextView heading = text(greeting + "，" + name, 28, INK);
        heading.setTypeface(NativeUi.DISPLAY);
        heading.setMaxLines(2);
        heading.setEllipsize(android.text.TextUtils.TruncateAt.END);
        heading.setPadding(0, dp(6), 0, dp(4));
        body.addView(heading);
        TextView subtitle = text("今天的事，一件一件慢慢做好。", 13, MUTED);
        subtitle.setPadding(0, 0, 0, dp(18));
        body.addView(subtitle);

        addCheckinCard(body);
        addQuickActions(body);
        addNutritionEntry(body);

        JSONObject summary = data.optJSONObject("summary");
        LinearLayout overview = card();
        TextView overviewTitle = text("今天的小进展", 16, INK);
        overviewTitle.setTypeface(NativeUi.MEDIUM);
        overview.addView(overviewTitle);
        LinearLayout numbers = new LinearLayout(this);
        numbers.setPadding(0, dp(10), 0, 0);
        numbers.addView(NativeUi.stat(this, summary == null ? 0 : summary.optInt("todayRecords"),
            "今日记录", () -> selectTab("records")), new LinearLayout.LayoutParams(0, -2, 1));
        numbers.addView(NativeUi.stat(this, summary == null ? 0 : summary.optInt("upcomingSchedules"),
            "近期日程", () -> selectTab("schedule")), new LinearLayout.LayoutParams(0, -2, 1));
        numbers.addView(NativeUi.stat(this, summary == null ? 0 : summary.optInt("inboxPending"),
            "待整理", null), new LinearLayout.LayoutParams(0, -2, 1));
        overview.addView(numbers);
        body.addView(overview);

        sectionTitle(body, "近期日程");
        JSONArray schedules = data.optJSONArray("schedules");
        if (schedules == null || schedules.length() == 0) {
            emptyCard(body, "给接下来的时间留个位置", "会议、学习或出行，都可以从这里开始。", "安排日程", this::showScheduleDialog);
        } else {
            for (int i = 0; i < Math.min(3, schedules.length()); i++) addSchedule(body, schedules.optJSONObject(i));
        }
        sectionTitle(body, "最近记录");
        JSONArray records = data.optJSONArray("records");
        if (records == null || records.length() == 0) {
            emptyCard(body, "值得记住的，随手记下来", "不用写很长，一句话也可以。", "写一条记录", this::showRecordDialog);
        } else {
            for (int i = 0; i < Math.min(3, records.length()); i++) addRecord(body, records.optJSONObject(i));
        }
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
        box.setBackground(NativeUi.focusBackground(this));
        TextView eyebrow = text(active == null ? "FOCUS / 专注打卡" : "FOCUS / 正在进行", 12, 0xFFD7E5D7);
        eyebrow.setTypeface(NativeUi.MEDIUM);
        box.addView(eyebrow);
        LinearLayout hero = new LinearLayout(this);
        hero.setGravity(Gravity.CENTER_VERTICAL);
        LinearLayout words = NativeUi.column(this);
        TextView title = text(active == null ? "给自己一段\n专注的时间" : active.optString("title", "专注打卡"), 24, Color.WHITE);
        title.setTypeface(NativeUi.DISPLAY);
        title.setMaxLines(3);
        title.setEllipsize(android.text.TextUtils.TruncateAt.END);
        title.setPadding(0, dp(10), 0, dp(7));
        words.addView(title);
        elapsedStartedAt = active == null ? "" : active.optString("happenedAt");
        elapsedView = text(active == null ? "从一件小事开始，不必着急。" : elapsedLabel(elapsedStartedAt),
            active == null ? 13 : 21, 0xFFE4EEE3);
        if (active != null) elapsedView.setTypeface(NativeUi.MEDIUM);
        words.addView(elapsedView);
        hero.addView(words, new LinearLayout.LayoutParams(0, -2, 1));
        NativeUi.FocusArt art = new NativeUi.FocusArt(this);
        LinearLayout.LayoutParams artParams = new LinearLayout.LayoutParams(dp(80), dp(80));
        artParams.setMargins(dp(8), 0, 0, 0);
        hero.addView(art, artParams);
        box.addView(hero);
        Button button = primaryButton(active == null ? "开始专注" : "结束并保存");
        NativeUi.decorateButton(button, AMBER, INK, Color.TRANSPARENT);
        LinearLayout.LayoutParams params = (LinearLayout.LayoutParams) button.getLayoutParams();
        params.setMargins(0, dp(16), 0, 0);
        button.setLayoutParams(params);
        button.setOnClickListener(v -> {
            if (active == null) showStartCheckinDialog();
            else showStopCheckinDialog(active);
        });
        box.addView(button);
        TextView cloud = text("联网保存成功后，与工作台共用记录", 11, 0xFFD7E5D7);
        cloud.setPadding(0, dp(10), 0, 0);
        box.addView(cloud);
        body.addView(box);
    }

    private void addQuickActions(LinearLayout body) {
        sectionTitle(body, "快捷入口");
        LinearLayout first = quickRow();
        first.addView(quickAction("AI 帮我安排", "说一句，帮你整理", "ai", GREEN, this::showAi), quickParams(true));
        first.addView(quickAction("写一条记录", "记下想法与生活", "records", BLUE, this::showRecordDialog), quickParams(false));
        body.addView(first);
        LinearLayout second = quickRow();
        second.addView(quickAction("安排日程", "把计划放进时间里", "schedule", GREEN, this::showScheduleDialog), quickParams(true));
        second.addView(quickAction("随手收集", "先记下，稍后整理", "inbox", ROSE, this::showInboxDialog), quickParams(false));
        body.addView(second);
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
        item.setMinimumHeight(dp(120));
        item.setPadding(dp(15), dp(14), dp(14), dp(14));
        item.setBackground(NativeUi.touch(this, Color.WHITE, 20, NativeUi.BORDER));
        item.setOnClickListener(v -> action.run());
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
        pageTitle(body, "生活记录", "记下生活的片段，与工作台共用记录。", "写一条记录", this::showRecordDialog);
        JSONArray records = data.optJSONArray("records");
        if (records == null || records.length() == 0) {
            emptyCard(body, "从今天的第一条开始", "一个想法、一段经历，或者今天做成的事。", "开始记录", this::showRecordDialog);
        } else {
            sectionTitle(body, "最近同步的记录");
            for (int i = 0; i < records.length(); i++) addRecord(body, records.optJSONObject(i));
        }
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

        addNutritionEntry(body);
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
        Button installHelp = secondaryButton("安装、登录与更新帮助");
        installHelp.setOnClickListener(v -> showInstallHelp());
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
                .setMessage("会清除本 App 的登录会话和当前页面数据，不会删除云端记录。")
                .setNegativeButton("取消", null)
                .setPositiveButton("重新授权", (dialog, which) -> {
                    bridgeReady = false;
                    mobileApi.cancelPending();
                    resetScheduleFilters();
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
        item.setOnClickListener(v -> new AlertDialog.Builder(this).setTitle(schedule.optString("title", "日程"))
            .setMessage(pretty(start) + "\n结束：" + pretty(end) + "\n状态：" + status
                + (place.isEmpty() ? "" : "\n地点：" + place) + (note.isEmpty() ? "" : "\n\n" + note))
            .setPositiveButton("关闭", null).show());
        body.addView(item);
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
        if (baseUrl.isEmpty()) { showBindingWelcome(); return; }
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
        Button update = secondaryButton("检查 App 新版本");
        update.setOnClickListener(v -> showUpdateCheck());
        box.addView(update);
        body.addView(box);
        scroll.addView(body);
        content.addView(scroll, new FrameLayout.LayoutParams(-1, -1));
    }

    private void setSaveOutcomeUnknown(boolean value) {
        saveOutcomeUnknown = value;
        getSharedPreferences("native_workbench", MODE_PRIVATE).edit().putBoolean("save_outcome_unknown", value).apply();
    }

    private void showNutrition() {
        if (saving || syncing || bindingChanging || aiSheet != null) {
            Toast.makeText(this, "请先结束当前连接、保存或 AI 页面。", Toast.LENGTH_SHORT).show(); return;
        }
        if (!bridgeReady || data == null) { showAuth(); return; }
        if (nutritionSheet != null) return;
        nutritionSheet = new NativeNutritionSheet(this, mobileApi, baseUrl, new NativeNutritionSheet.Host() {
            @Override public boolean writesBlocked() { return saveOutcomeUnknown || saving || bindingChanging; }
            @Override public void onAuthRequired() { showAuth(); }
            @Override public void onClosed() { nutritionSheet = null; }
        });
        nutritionSheet.show();
    }

    private void showAi() {
        if (saving || syncing || bindingChanging) { Toast.makeText(this, "请先等待当前连接或保存完成。", Toast.LENGTH_SHORT).show(); return; }
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
        cancelScheduleFilter();
        elapsedView = null;
        elapsedStartedAt = "";
        syncLabel.setText("待绑定");
        content.removeAllViews();
        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.setVerticalScrollBarEnabled(false);
        LinearLayout body = page();
        TextView eyebrow = text("WELCOME / 初次连接", 11, GREEN);
        eyebrow.setPadding(dp(2), dp(8), 0, dp(8));
        body.addView(eyebrow);
        TextView heading = text("先连接你的工作台", 27, INK);
        heading.setTypeface(NativeUi.DISPLAY);
        body.addView(heading);
        TextView subtitle = text("App 已经打开，下一步绑定你已有的工作台。", 13, MUTED);
        subtitle.setPadding(0, dp(9), 0, dp(18));
        body.addView(subtitle);
        LinearLayout guide = card();
        guide.setBackground(NativeUi.shape(this, PALE_GREEN, 22, NativeUi.BORDER));
        guide.addView(text("三步，让你的日常来到手机上", 17, INK));
        String[] steps = {
            "1. 复制工作台网址\n使用你自己的 HTTPS 根地址，不是邮箱、登录链接或 API 密钥。",
            "2. 粘贴并确认域名\n点击下方绑定按钮，粘贴地址后确认目标工作台。",
            "3. 登录后读取云端数据\n授权并读取成功后，返回原生打卡、记录、日程和 AI 页面。"
        };
        for (String step : steps) {
            TextView line = text(step, 13, INK);
            line.setPadding(0, dp(15), 0, 0);
            guide.addView(line);
        }
        body.addView(guide);
        Button bind = primaryButton("绑定我的工作台");
        bind.setOnClickListener(v -> showBinding());
        body.addView(bind);
        TextView privacy = text("未绑定时不会读取云端记录；公开 App 不内置你的私人网址。", 11, MUTED);
        privacy.setPadding(dp(2), dp(10), dp(2), dp(12));
        body.addView(privacy);
        Button help = secondaryButton("安装与登录帮助");
        help.setOnClickListener(v -> showInstallHelp());
        body.addView(help);
        Button update = secondaryButton("检查 App 新版本");
        update.setOnClickListener(v -> showUpdateCheck());
        body.addView(update);
        scroll.addView(body);
        content.addView(scroll, new FrameLayout.LayoutParams(-1, -1));
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
                : "会清除本 App 的登录会话、当前页面和 AI 草稿，再授权新工作台。不会删除旧工作台的云端记录。请确认新域名可信。")
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
        bindingChanging = true;
        if (nutritionSheet != null) nutritionSheet.close();
        if (aiSheet != null) aiSheet.close();
        bridgeReady = false; mobileApi.close();
        if (authWebView != null) {
            authWebView.stopLoading(); detach(authWebView); authWebView.destroy(); authWebView = null;
        }
        View overlay = root.findViewWithTag("auth-overlay");
        if (overlay != null) root.removeView(overlay);
        resetScheduleFilters();
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
        if (baseUrl.isEmpty()) { showBindingWelcome(); return; }
        if (root.findViewWithTag("auth-overlay") != null) return;
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
        if (data != null && bridgeReady && !saving && (aiSheet == null || !aiSheet.isBusy())
            && (nutritionSheet == null || !nutritionSheet.isBusy())) sync();
    }
    @Override protected void onPause() {
        clockHandler.removeCallbacks(clockTick); super.onPause();
    }
    @Override protected void onDestroy() {
        cancelScheduleFilter();
        clockHandler.removeCallbacks(clockTick);
        if (saving || (aiSheet != null && aiSheet.isWriting())) setSaveOutcomeUnknown(true);
        if (nutritionSheet != null) nutritionSheet.close();
        if (aiSheet != null) aiSheet.close();
        if (bindingConfirmation != null && bindingConfirmation.isShowing()) bindingConfirmation.dismiss();
        if (bindingDialog != null && bindingDialog.isShowing()) bindingDialog.dismiss();
        if (updateDialog != null && updateDialog.isShowing()) updateDialog.dismiss();
        if (updateChecker != null) updateChecker.close();
        if (mobileApi != null) mobileApi.close();
        if (authWebView != null) authWebView.destroy();
        super.onDestroy();
    }
}

