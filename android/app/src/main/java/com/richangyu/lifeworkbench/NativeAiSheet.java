package com.richangyu.lifeworkbench;

import android.app.Activity;
import android.app.AlertDialog;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.text.InputFilter;
import android.view.View;
import android.view.WindowManager;
import android.widget.*;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.HashSet;

/** Native conversation and signed preview UI. The WebView only carries the authorized session. */
final class NativeAiSheet {
    interface Host {
        boolean writesBlocked();
        String accountScope();
        void onAuthRequired();
        void onSaved();
        void onUnknownSave();
        void onClosed();
    }
    private final Activity activity;
    private final MobileApiBridge bridge;
    private final Host host;
    private final String accountScope;
    private long choicesReadElapsed;
    private int ambiguousChoices;
    private LinearLayout planWorkspace, referenceList;
    private TextView referenceStatus;
    private Button planChoose, clearContext;
    private CheckBox planReviewed;
    private TextView planValidation;
    private boolean previewMatchesPayload, sourceCountMatches = true;
    private String lastPlanPrompt = "";
    private final Set<String> generatedReferences = new HashSet<>();
    private final Set<String> generatedEditable = new HashSet<>();
    private final List<WorkbenchPlanReviewPolicy.Operation> reviewOperations = new ArrayList<>();
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final List<String> selected = new ArrayList<>();
    private JSONArray choices = new JSONArray();
    private JSONArray history = new JSONArray();
    private String pendingSource = "", previousDraft = "";
    private JSONObject draft;
    private JSONObject undoReceipt;
    private Button undo;
    private AlertDialog dialog;
    private LinearLayout conversation, previewBox, settingsBody;
    private Button settingsToggle;
    private EditText question;
    private TextView status, expiry;
    private CheckBox finance, calendar;
    private RadioGroup mode;
    private int planId, days = 7, statusRevision;
    private Spinner range;
    private Button send, confirm, discard, choose, refresh;
    private boolean ready, busy, writing, closed, saved, planDraft;
    private long cooldownUntil;
    private static final int INK = NativeUi.INK, GREEN = NativeUi.FOREST;
    private final Runnable expiryTick = new Runnable() {
        @Override public void run() {
            if (closed) return;
            updateControls(); handler.postDelayed(this, 1000);
        }
    };
    NativeAiSheet(Activity activity, MobileApiBridge bridge, Host host) {
        this.activity = activity; this.bridge = bridge; this.host = host;
        this.accountScope = host.accountScope();
    }
    boolean isBusy() { return busy; }
    boolean isWriting() { return writing; }
    void show() {
        LinearLayout page = column();
        page.setPadding(dp(18), dp(18), dp(18), dp(18));
        page.setBackground(NativeUi.pageBackground());

        LinearLayout titleRow = new LinearLayout(activity);
        titleRow.setGravity(android.view.Gravity.CENTER_VERTICAL);
        titleRow.addView(new NativeUi.IconView(activity, "ai", GREEN), new LinearLayout.LayoutParams(dp(25), dp(25)));
        TextView brand = label("AI \u751f\u6d3b\u52a9\u624b", 14, true);
        brand.setPadding(dp(9), 0, 0, 0);
        titleRow.addView(brand);
        page.addView(titleRow);
        TextView heading = label("\u8bf4\u4e00\u53e5\uff0c\n\u6574\u7406\u597d\u4eca\u5929", 28, true);
        heading.setTypeface(NativeUi.DISPLAY);
        heading.setPadding(0, dp(12), 0, dp(8));
        page.addView(heading);
        page.addView(label("AI \u5148\u6574\u7406\u6210\u8349\u7a3f\uff0c\u4f60\u786e\u8ba4\u540e\u624d\u4f1a\u4fdd\u5b58\u3002", 13, false));

        mode = new RadioGroup(activity);
        boolean stacked = activity.getResources().getConfiguration().screenWidthDp < 360
            || activity.getResources().getConfiguration().fontScale > 1.2f;
        mode.setOrientation(stacked ? RadioGroup.VERTICAL : RadioGroup.HORIZONTAL);
        mode.setBackground(NativeUi.shape(activity, Color.WHITE, 14, NativeUi.BORDER));
        mode.setPadding(dp(6), dp(3), dp(6), dp(3));
        RadioButton chat = new RadioButton(activity);
        chat.setId(View.generateViewId()); chat.setText("\u804a\u5929\u8bb0\u4e8b");
        RadioButton plan = new RadioButton(activity);
        planId = View.generateViewId(); plan.setId(planId); plan.setText("\u8ba1\u5212\u8c03\u6574");
        for (RadioButton item : new RadioButton[] {chat, plan}) {
            item.setTextSize(14); item.setTextColor(INK); item.setTypeface(NativeUi.MEDIUM);
            item.setMinHeight(dp(48));
            item.setButtonTintList(new android.content.res.ColorStateList(
                new int[][] {{-android.R.attr.state_enabled}, {}}, new int[] {NativeUi.MUTED, GREEN}));
            mode.addView(item, stacked ? new RadioGroup.LayoutParams(-1, -2)
                : new RadioGroup.LayoutParams(0, -2, 1));
        }
        mode.check(chat.getId());
        LinearLayout.LayoutParams modeParams = new LinearLayout.LayoutParams(-1, -2);
        modeParams.setMargins(0, dp(10), 0, dp(12));
        page.addView(mode, modeParams);
        planWorkspace = column();
        planWorkspace.setPadding(dp(14),dp(10),dp(14),dp(12));
        planWorkspace.setBackground(NativeUi.shape(activity,NativeUi.MINT,18,NativeUi.BORDER));
        planWorkspace.addView(label("\u8fd9\u6b21\u8ba1\u5212\u53c2\u8003\u4ec0\u4e48\uff1f",17,true));
        referenceStatus = label("",12,false);planWorkspace.addView(referenceStatus);
        referenceList = column();planWorkspace.addView(referenceList);
        planWorkspace.addView(label("\u9ed8\u8ba4\u4e0d\u5206\u4eab\u65e5\u7a0b\u3002\u53ea\u5f15\u7528\u4f60\u4e3b\u52a8\u9009\u62e9\u7684\u6700\u591a 8 \u9879\uff1b\u672a\u9009\u4e2d\u7684\u5b89\u6392\u4ecd\u7531\u670d\u52a1\u5668\u68c0\u67e5\u51b2\u7a81\uff0c\u4e0d\u4f1a\u5f53\u4f5c\u5df2\u5206\u4eab\u7ed9 AI\u3002",12,false));
        planChoose = button("\u9009\u62e9\u8981\u53c2\u8003\u7684\u65e5\u7a0b",false);
        planChoose.setOnClickListener(v->chooseSchedules());planWorkspace.addView(planChoose);
        clearContext = button("\u6e05\u7a7a\u672c\u6b21\u4e0a\u4e0b\u6587\uff0c\u4e0d\u5220\u9664\u4e91\u7aef",false);
        clearContext.setOnClickListener(v->confirmClearContext());planWorkspace.addView(clearContext);
        planWorkspace.setVisibility(View.GONE);page.addView(planWorkspace);

        LinearLayout composer = column();
        composer.setPadding(dp(16), dp(10), dp(16), dp(12));
        composer.setBackground(NativeUi.shape(activity, Color.WHITE, 22, NativeUi.BORDER));
        composer.addView(label("\u4eca\u5929\u6709\u4ec0\u4e48\u60f3\u505a\u7684\uff1f", 15, true));
        question = new EditText(activity);
        NativeUi.styleInput(question);
        question.setHint("\u6bd4\u5982\uff1a\u660e\u5929\u4e0b\u5348 3 \u70b9\u5b66\u4e60\u4e24\u5c0f\u65f6\uff0c\u5e2e\u6211\u5b89\u6392\u4e00\u4e0b\u3002");
        question.setMinLines(3); question.setMaxLines(6);
        question.setGravity(android.view.Gravity.TOP | android.view.Gravity.START);
        question.setFilters(new InputFilter[] {new InputFilter.LengthFilter(800)});
        question.setInputType(android.text.InputType.TYPE_CLASS_TEXT | android.text.InputType.TYPE_TEXT_FLAG_MULTI_LINE);
        composer.addView(question, new LinearLayout.LayoutParams(-1, -2));
        send = button("\u53d1\u9001\u7ed9 AI", true);
        send.setOnClickListener(v -> generate());
        composer.addView(send);
        page.addView(composer);

        settingsToggle = button("\u53c2\u8003\u8303\u56f4\u4e0e\u6743\u9650 \u00b7 \u53ef\u9009", false);
        page.addView(settingsToggle);
        settingsBody = column();
        settingsBody.setPadding(dp(14), dp(8), dp(14), dp(12));
        settingsBody.setBackground(NativeUi.shape(activity, Color.WHITE, 18, NativeUi.BORDER));
        settingsBody.addView(label("\u5b89\u6392\u65f6\u95f4\u8303\u56f4", 14, true));
        range = new Spinner(activity);
        ArrayAdapter<String> ranges = new ArrayAdapter<>(activity, android.R.layout.simple_spinner_item,
            new String[] {"\u4eca\u5929", "\u672a\u6765 7 \u5929", "\u672a\u6765 30 \u5929"});
        ranges.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
        range.setAdapter(ranges); range.setSelection(1); range.setMinimumHeight(dp(48));
        settingsBody.addView(range, new LinearLayout.LayoutParams(-1, -2));
        calendar = new CheckBox(activity);
        calendar.setText("\u672c\u6b21\u53c2\u8003\u6211\u4e3b\u52a8\u9009\u4e2d\u7684\u65e5\u7a0b");
        calendar.setMinHeight(dp(48)); calendar.setTextColor(INK); calendar.setTextSize(13);
        settingsBody.addView(calendar);
        choose = button("\u9009\u62e9\u65e5\u7a0b\uff08\u6700\u591a 8 \u9879\uff09", false);
        settingsBody.addView(choose); choose.setOnClickListener(v -> chooseSchedules());
        calendar.setOnCheckedChangeListener((v, checked) -> {
            if (!checked && !busy && !draftPending()) previousDraft = "";
            renderReferences(); updateControls();
        });
        finance = new CheckBox(activity);
        finance.setText("\u540c\u610f\u672c\u6b21\u5904\u7406\u6211\u63d0\u4f9b\u7684\u91d1\u989d / \u6536\u5165\u4fe1\u606f");
        finance.setMinHeight(dp(48)); finance.setTextColor(INK); finance.setTextSize(13);
        settingsBody.addView(finance);
        finance.setOnCheckedChangeListener((v, checked) -> updateControls());
        settingsBody.addView(label("\u9ed8\u8ba4\u4e0d\u5206\u4eab\u65e5\u7a0b\uff0c\u4e0d\u5f00\u542f\u91d1\u989d\u6388\u6743\uff1b\u4e0d\u8981\u63d0\u4ea4\u5bc6\u7801\u3001\u9a8c\u8bc1\u7801\u6216\u5bc6\u94a5\u3002", 12, false));
        settingsBody.setVisibility(View.GONE);
        page.addView(settingsBody);
        settingsToggle.setOnClickListener(v -> {
            boolean open = settingsBody.getVisibility() != View.VISIBLE;
            settingsBody.setVisibility(open ? View.VISIBLE : View.GONE);
            settingsToggle.setText(open ? "\u6536\u8d77\u53c2\u8003\u8303\u56f4\u4e0e\u6743\u9650" : "\u53c2\u8003\u8303\u56f4\u4e0e\u6743\u9650 \u00b7 \u53ef\u9009");
        });

        LinearLayout connection = column();
        connection.setPadding(dp(4), dp(6), dp(4), dp(6));
        status = label("\u6b63\u5728\u8bfb\u53d6 AI \u8fde\u63a5\u72b6\u6001\u2026", 13, false);
        status.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
        connection.addView(status);
        refresh = button("\u5237\u65b0\u8fde\u63a5\u72b6\u6001", false);
        refresh.setOnClickListener(v -> fetchStatus()); connection.addView(refresh);
        page.addView(connection);
        conversation = column(); page.addView(conversation);
        previewBox = column(); previewBox.setVisibility(View.GONE); page.addView(previewBox);
        ScrollView scroll = new ScrollView(activity);
        scroll.setFillViewport(true); scroll.setVerticalScrollBarEnabled(false); scroll.addView(page);
        dialog = new AlertDialog.Builder(activity).setView(scroll).setNegativeButton("\u8fd4\u56de\u5de5\u4f5c\u53f0", null).create();
        dialog.setOnDismissListener(v -> close());
        dialog.setOnShowListener(v -> {
            Button back = dialog.getButton(AlertDialog.BUTTON_NEGATIVE);
            back.setTextColor(GREEN); back.setMinHeight(dp(48));
            back.setOnClickListener(w -> {
                if (busy) { toast("\u8bf7\u7b49\u5f85\u5f53\u524d\u8bf7\u6c42\u7ed3\u675f\uff0c\u4fdd\u5b58\u65f6\u4e0d\u8981\u9000\u51fa\u3002"); return; }
                dialog.dismiss();
            });
            if (dialog.getWindow() != null) {
                dialog.getWindow().setLayout(-1, -1);
                dialog.getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
            }
            NativeUi.enter(page);
        });
        dialog.show();
        mode.setOnCheckedChangeListener((v, id) -> { renderReferences(); updateControls(); });
        range.setOnItemSelectedListener(new android.widget.AdapterView.OnItemSelectedListener() {
            @Override public void onItemSelected(android.widget.AdapterView<?> parent, View view, int position, long id) {
                int next = new int[] {1,7,30}[position];
                if (next != days) { days = next; selected.clear(); previousDraft = ""; choicesReadElapsed = 0; renderReferences(); fetchStatus(); }
            }
            @Override public void onNothingSelected(android.widget.AdapterView<?> parent) { }
        });
        handler.post(expiryTick); fetchStatus();
    }

    private boolean sessionMatches(){
        return !closed&&WorkbenchPlanReviewPolicy.scopeMatches(accountScope,host.accountScope());
    }
    private Set<String> availableReferenceIds(){
        Set<String> ids=new HashSet<>();
        for(int i=0;i<choices.length();i++){
            JSONObject item=choices.optJSONObject(i);
            if(item!=null)ids.add(item.optString("id"));
        }
        return ids;
    }
    private void renderReferences(){
        if(referenceList==null||calendar==null)return;
        referenceList.removeAllViews();
        if(calendar.isChecked())for(int i=0;i<choices.length();i++){
            JSONObject item=choices.optJSONObject(i);
            if(item!=null&&selected.contains(item.optString("id"))){
                referenceList.addView(label(item.optString("title")+"\n"
                    +timeLabel(item.optString("startAt"))+" \u81f3 "+timeLabel(item.optString("endAt"))
                    +(item.optBoolean("editable")?"\n\u53ef\u8c03\u6574\u7684\u5355\u6b21\u65e5\u7a0b":"\n\u4ec5\u53c2\u8003\uff0c\u4e0d\u5141\u8bb8\u4fee\u6539"),13,false));
            }
        }
        if(ambiguousChoices>0)referenceList.addView(label("\u6709 "+ambiguousChoices+" \u4e2a\u8fd4\u56de\u6761\u76ee\u4e0d\u80fd\u552f\u4e00\u6838\u5bf9\uff0c\u6682\u4e0d\u7528\u4e8e\u624b\u673a\u9009\u62e9\u3002",12,false));
        referenceList.addView(label("\u672c\u6b21\u5019\u9009\u5217\u8868\u6700\u591a 40 \u9879\uff0c\u4e0d\u4ee3\u8868\u5168\u90e8\u65e5\u7a0b\u3002\u591a\u6b21\u53d1\u751f\u7684\u540c\u4e00\u6807\u8bc6\u4e0d\u4f1a\u88ab\u5f53\u4f5c\u53ef\u8c03\u6574\u7684\u5355\u6b21\u4e8b\u9879\u3002",11,false));
    }
    private void confirmClearContext(){
        if(busy||draftPending()||closed)return;
        new AlertDialog.Builder(activity).setTitle("\u6e05\u7a7a\u672c\u6b21\u4e0a\u4e0b\u6587\uff1f")
            .setMessage("\u53ea\u6e05\u9664\u672c\u6b21\u5bf9\u8bdd\u5386\u53f2\u3001\u5df2\u9009\u65e5\u7a0b\u548c\u672a\u4fdd\u5b58\u8349\u7a3f\u7684\u53c2\u8003\u6587\u672c\uff0c\u4e0d\u5220\u9664\u4e91\u7aef\u6570\u636e\u3001\u4e0d\u53d1\u51fa AI \u8bf7\u6c42\u3002")
            .setNegativeButton("\u4fdd\u7559",null).setPositiveButton("\u6e05\u7a7a",(d,w)->{
                if(busy||draftPending()||closed)return;
                selected.clear();previousDraft="";pendingSource="";history=new JSONArray();
                conversation.removeAllViews();calendar.setChecked(false);finance.setChecked(false);
                renderReferences();updateControls();
            }).show();
    }
    private String beforeTime(JSONObject before,String camel,String snake){
        if(before==null)return "";
        String value=before.optString(camel);
        return value.isEmpty()?before.optString(snake):value;
    }
    private boolean sameDisplayedOperation(JSONObject visible,JSONObject signed){
        if(visible==null||signed==null)return false;
        for(String key:new String[]{"action","id","title","category","startAt","endAt","note"})
            if(!visible.optString(key).equals(signed.optString(key)))return false;
        JSONObject a=visible.optJSONObject("before"),b=signed.optJSONObject("before");
        if(a==null||b==null)return a==b;
        for(String key:new String[]{"id","title","category","note"})
            if(!a.optString(key).equals(b.optString(key)))return false;
        return beforeTime(a,"startAt","start_at").equals(beforeTime(b,"startAt","start_at"))
            &&beforeTime(a,"endAt","end_at").equals(beforeTime(b,"endAt","end_at"));
    }
    private boolean displayedPlanMatchesPayload(JSONArray visible){
        try{
            JSONArray signed=new JSONObject(draft.optString("payload")).optJSONArray("operations");
            if(visible==null||signed==null||visible.length()!=signed.length()||visible.length()<1||visible.length()>8)return false;
            for(int i=0;i<visible.length();i++)
                if(!sameDisplayedOperation(visible.optJSONObject(i),signed.optJSONObject(i)))return false;
            return true;
        }catch(Exception ignored){return false;}
    }
    private String minimalPreviousDraft(JSONObject preview){
        JSONObject summary=new JSONObject();put(summary,"summary",preview.optString("summary"));
        JSONArray compact=new JSONArray(),operations=preview.optJSONArray("operations");
        if(operations!=null)for(int i=0;i<Math.min(operations.length(),8);i++){
            JSONObject item=operations.optJSONObject(i);if(item==null)continue;
            JSONObject next=new JSONObject();
            // No before snapshot, signatures, participant/project fields, or persisted calendar IDs.
            for(String key:new String[]{"action","title","category","startAt","endAt","note"})put(next,key,item.optString(key));
            compact.put(next);
        }
        put(summary,"operations",compact);
        String value=summary.toString();return value.substring(0,Math.min(value.length(),1400));
    }
    private void renderPlanReview(){
        previewBox.addView(label(draft.optString("summary"),14,false));
        JSONArray operations=draft.optJSONArray("operations");
        previewMatchesPayload=displayedPlanMatchesPayload(operations);
        int creates=0,updates=0;
        if(operations!=null)for(int i=0;i<operations.length();i++){
            JSONObject item=operations.optJSONObject(i);
            if(item==null){reviewOperations.add(null);continue;}
            JSONObject before=item.optJSONObject("before");
            String action=item.optString("action"),id=item.optString("id");
            reviewOperations.add(new WorkbenchPlanReviewPolicy.Operation(action,id,item.optString("title"),
                item.optString("startAt"),item.optString("endAt"),before==null?"":before.optString("id"),
                beforeTime(before,"startAt","start_at"),beforeTime(before,"endAt","end_at")));
            if("create".equals(action))creates++;if("update".equals(action))updates++;
            LinearLayout change=column();change.setPadding(dp(12),dp(10),dp(12),dp(10));
            change.setBackground(NativeUi.shape(activity,NativeUi.PAPER,14,NativeUi.BORDER));
            LinearLayout.LayoutParams margin=new LinearLayout.LayoutParams(-1,-2);margin.setMargins(0,dp(10),0,0);change.setLayoutParams(margin);
            change.addView(NativeUi.badge(activity,"update".equals(action)?"\u4fee\u6539\u5df2\u6709\u65e5\u7a0b":"\u65b0\u589e\u65e5\u7a0b",NativeUi.MINT,GREEN));
            if(before!=null){
                change.addView(label("\u4fee\u6539\u524d\uff1a"+before.optString("title"),15,true));
                change.addView(label(timeLabel(beforeTime(before,"startAt","start_at"))+" \u81f3 "
                    +timeLabel(beforeTime(before,"endAt","end_at")),13,false));
                change.addView(label("\u539f\u5206\u7c7b\uff1a"+before.optString("category")+"\n\u539f\u5907\u6ce8\uff1a"+before.optString("note"),12,false));
            }
            change.addView(label(("update".equals(action)?"\u4fee\u6539\u540e\uff1a":"\u65b0\u589e\uff1a")+item.optString("title"),16,true));
            change.addView(label(timeLabel(item.optString("startAt"))+" \u81f3 "+timeLabel(item.optString("endAt")),14,false));
            change.addView(label("\u5206\u7c7b\uff1a"+item.optString("category")+"\n\u5907\u6ce8\uff1a"+item.optString("note"),13,false));
            previewBox.addView(change);
        }
        previewBox.addView(label("\u65b0\u589e "+creates+" \u9879\uff0c\u4fee\u6539 "+updates+" \u9879\uff1b\u4e0d\u4f1a\u5220\u9664\u65e5\u7a0b\u3002\u65f6\u95f4\u6309\u5317\u4eac\u65f6\u95f4\u5c55\u793a\u3002",13,true));
        List<String> problems=WorkbenchPlanReviewPolicy.problems(reviewOperations,generatedReferences,generatedEditable,System.currentTimeMillis());
        if(!previewMatchesPayload)problems.add("\u663e\u793a\u6761\u76ee\u4e0e\u51ed\u8bc1\u4e2d\u7684\u6761\u76ee\u4e0d\u80fd\u4e00\u81f4\u6838\u5bf9\uff0c\u8bf7\u91cd\u65b0\u751f\u6210\u3002");
        if(!sourceCountMatches)problems.add("\u670d\u52a1\u8fd4\u56de\u7684\u5f15\u7528\u6570\u91cf\u4e0e\u672c\u6b21\u9009\u62e9\u4e0d\u4e00\u81f4\uff0c\u8bf7\u5237\u65b0\u540e\u91cd\u65b0\u9009\u62e9\u3002");
        for(String problem:problems){
            TextView warning=label("\u672c\u673a\u6838\u5bf9\uff1a"+problem,13,true);warning.setTextColor(0xFF865324);
            previewBox.addView(warning);
        }
        previewBox.addView(label("\u672c\u673a\u6838\u5bf9\u53ea\u8986\u76d6\u663e\u793a\u6761\u76ee\u3002\u670d\u52a1\u5668\u4ecd\u4f1a\u9a8c\u8bc1\u7b7e\u540d\u3001\u5f53\u524d\u8d26\u53f7\u3001\u5b8c\u6574\u65e5\u7a0b\u51b2\u7a81\u53ca\u539f\u503c\u662f\u5426\u88ab\u6539\u52a8\uff1b\u4e0d\u4f1a\u5173\u95ed\u670d\u52a1\u5668\u6821\u9a8c\u3002",12,false));
    }
    private void revisePlan(){
        if(closed||busy||!planDraft||!draftPending())return;
        final JSONObject current=draft;
        new AlertDialog.Builder(activity).setTitle("\u653e\u5f03\u8fd9\u4efd\u672a\u4fdd\u5b58\u8ba1\u5212\uff0c\u4fee\u6539\u8981\u6c42\uff1f")
            .setMessage("\u4e0d\u4f1a\u5199\u5165\u4e91\u7aef\u3002\u4fdd\u7559\u4f60\u539f\u6765\u7684\u8f93\u5165\uff0c\u4fee\u6539\u540e\u9700\u518d\u6b21\u4e3b\u52a8\u751f\u6210\uff1b\u4e0d\u4f1a\u628a\u5176\u4ed6\u672a\u9009\u65e5\u7a0b\u7684\u51b2\u7a81\u6807\u9898\u81ea\u52a8\u53d1\u7ed9 AI\u3002")
            .setNegativeButton("\u4fdd\u7559\u8349\u7a3f",null).setPositiveButton("\u4fee\u6539\u8981\u6c42",(d,w)->{
                if(closed||busy||draft!=current||saved)return;
                draft=null;saved=false;planReviewed=null;planValidation=null;reviewOperations.clear();
                previewBox.removeAllViews();previewBox.setVisibility(View.GONE);confirm=null;discard=null;expiry=null;
                question.setText(lastPlanPrompt);question.setSelection(question.length());question.requestFocus();
                status.setText("\u8bf7\u8865\u5145\u6216\u4fee\u6539\u8981\u6c42\uff0c\u518d\u4e3b\u52a8\u751f\u6210\u3002\u672a\u4fdd\u5b58\u3001\u672a\u81ea\u52a8\u53d1\u9001\u3002");updateControls();
            }).show();
    }

    private void showSettings() {
        settingsBody.setVisibility(View.VISIBLE);
        settingsToggle.setText("\u6536\u8d77\u53c2\u8003\u8303\u56f4\u4e0e\u6743\u9650");
    }
    private void fetchStatus() {
        if (busy || closed || !sessionMatches()) return;
        final int revision = ++statusRevision;
        ready = false; setBusy(true); status.setText("\u6b63\u5728\u8bfb\u53d6 AI \u72b6\u6001\u548c\u53ef\u9009\u62e9\u65e5\u7a0b\u2026");
        bridge.request("/api/assistant?days=" + days, null, envelope -> {
            if (closed || revision != statusRevision || !sessionMatches()) return;
            setBusy(false);
            JSONObject result = response(envelope, false);
            if (result == null || closed) return;
            ready = result.optBoolean("ready", false);
            JSONArray received = result.optJSONArray("schedules");
            if (received == null || result.optInt("days",days) != days) {
                ready = false; choicesReadElapsed = 0;
                status.setText("\u6ca1\u6709\u6536\u5230\u53ef\u6838\u5bf9\u7684\u65e5\u7a0b\u8303\u56f4\uff0c\u8bf7\u5237\u65b0\u540e\u518d\u9009\u62e9\u3002");updateControls();return;
            }
            List<String> ids = new ArrayList<>();
            for(int i=0;i<received.length();i++){
                JSONObject item=received.optJSONObject(i);
                if(item!=null)ids.add(item.optString("id"));
            }
            Set<String> unique=WorkbenchPlanReviewPolicy.unambiguousIds(ids);
            JSONArray usable=new JSONArray();
            for(int i=0;i<received.length();i++){
                JSONObject item=received.optJSONObject(i);
                if(item!=null&&unique.contains(item.optString("id")))usable.put(item);
            }
            ambiguousChoices=received.length()-usable.length();
            choices=usable;choicesReadElapsed=SystemClock.elapsedRealtime();
            if(!selected.isEmpty()&&!WorkbenchPlanReviewPolicy.selectionValid(selected,unique)){
                selected.clear();previousDraft="";
                toast("\u539f\u9009\u62e9\u6709\u53d8\u66f4\u6216\u4e0d\u80fd\u552f\u4e00\u6838\u5bf9\uff0c\u5df2\u6e05\u9664\u5f15\u7528\uff1b\u8bf7\u91cd\u65b0\u9009\u62e9\u3002");
            }
            renderReferences();
            status.setText(ready ? "AI \u5df2\u8fde\u63a5 \u00b7 " + result.optString("model") + "\n\u53ea\u63d0\u4ea4\u4f60\u7684\u8f93\u5165\u548c\u4e3b\u52a8\u9009\u4e2d\u7684\u65e5\u7a0b\uff0c\u989d\u5ea6\u9650\u5236\u65f6\u4f1a\u63d0\u793a\u3002"
                : "\u5de5\u4f5c\u53f0\u5c1a\u672a\u914d\u7f6e AI\u3002\u8bf7\u5728\u670d\u52a1\u7aef\u914d\u7f6e\u5bc6\u94a5\uff0c\u4e0d\u8981\u5728 App \u6216\u804a\u5929\u4e2d\u586b\u5199\u5bc6\u94a5\u3002");
            updateControls();
        });
    }
    private void chooseSchedules() {
        if (busy || !ready || !sessionMatches() || draftPending()) return;
        if (!WorkbenchPlanReviewPolicy.contextFresh(choicesReadElapsed,SystemClock.elapsedRealtime())) {
            toast("\u65e5\u7a0b\u8303\u56f4\u9700\u8981\u91cd\u65b0\u8bfb\u53d6\uff0c\u8bf7\u5148\u5237\u65b0\u8fde\u63a5\u72b6\u6001\u3002");return;
        }
        List<JSONObject> available = new ArrayList<>();
        for (int i = 0; i < choices.length(); i++) {
            JSONObject item = choices.optJSONObject(i);
            if (item != null && !item.optString("id").isEmpty()) available.add(item);
        }
        if (available.isEmpty()) { toast("\u8fd9\u4e2a\u65f6\u95f4\u8303\u56f4\u5185\u6ca1\u6709\u53ef\u9009\u62e9\u7684\u65e5\u7a0b\u3002"); return; }
        String[] labels = new String[available.size()];
        boolean[] checked = new boolean[available.size()];
        for (int i = 0; i < available.size(); i++) {
            JSONObject item = available.get(i);
            labels[i] = item.optString("title") + "\n" + timeLabel(item.optString("startAt"))
                + (item.optBoolean("editable") ? " \u00b7 \u53ef\u8c03\u6574" : " \u00b7 \u4ec5\u53c2\u8003");
            checked[i] = selected.contains(item.optString("id"));
        }
        AlertDialog picker = new AlertDialog.Builder(activity).setTitle("\u53ea\u5206\u4eab\u9009\u4e2d\u65e5\u7a0b\uff0c\u6700\u591a 8 \u9879")
            .setMultiChoiceItems(labels, checked, (v, which, value) -> checked[which] = value)
            .setNegativeButton("\u53d6\u6d88", null).setPositiveButton("\u4f7f\u7528\u9009\u4e2d\u9879", null).create();
        picker.setOnShowListener(v -> picker.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(w -> {
            int count = 0; for (boolean value : checked) if (value) count++;
            if (count > 8) { toast("\u6700\u591a\u9009\u62e9 8 \u9879\uff0c\u8bf7\u51cf\u5c11\u9009\u62e9\u3002"); return; }
            selected.clear();
            for (int i = 0; i < checked.length; i++) if (checked[i]) selected.add(available.get(i).optString("id"));
            calendar.setChecked(!selected.isEmpty()); previousDraft = "";
            picker.dismiss(); renderReferences(); updateControls();
        }));
        picker.show();
    }
    private void generate() {
        if (busy || !ready || closed || !sessionMatches() || draftPending()) return;
        if (System.currentTimeMillis() < cooldownUntil) { toast("\u989d\u5ea6\u6216\u670d\u52a1\u6682\u65f6\u53d7\u9650\uff0c\u8bf7\u7b49\u5f85\u5012\u8ba1\u65f6\u7ed3\u675f\u3002"); return; }
        String prompt = question.getText().toString().trim();
        if (prompt.isEmpty()) { question.setError("\u5148\u544a\u8bc9 AI \u4f60\u60f3\u505a\u4ec0\u4e48"); return; }
        boolean planning = mode.getCheckedRadioButtonId() == planId;
        if(calendar.isChecked()&&!selected.isEmpty()
            &&(!WorkbenchPlanReviewPolicy.contextFresh(choicesReadElapsed,SystemClock.elapsedRealtime())
                ||!WorkbenchPlanReviewPolicy.selectionValid(selected,availableReferenceIds()))){
            toast("\u9009\u4e2d\u65e5\u7a0b\u9700\u8981\u91cd\u65b0\u6838\u5bf9\uff0c\u8bf7\u5148\u5237\u65b0\uff1b\u5c1a\u672a\u53d1\u9001 AI \u8bf7\u6c42\u3002");return;
        }
        generatedReferences.clear();generatedEditable.clear();
        if(planning){
            lastPlanPrompt=prompt;
            if(calendar.isChecked())for(int i=0;i<choices.length();i++){
                JSONObject item=choices.optJSONObject(i);
                if(item!=null&&selected.contains(item.optString("id"))){
                    generatedReferences.add(item.optString("id"));
                    if(item.optBoolean("editable"))generatedEditable.add(item.optString("id"));
                }
            }
        }
        String context = prompt + (planning ? "\n" + previousDraft : "\n" + pendingSource + "\n" + history.toString());
        if (calendar.isChecked()) {
            for (int i = 0; i < choices.length(); i++) {
                JSONObject item = choices.optJSONObject(i);
                if (item != null && selected.contains(item.optString("id"))) context += "\n" + item.toString();
            }
        }
        if (WorkbenchClientPolicy.containsCredential(context)) {
            toast("\u8bf7\u4e0d\u8981\u63d0\u4ea4\u5bc6\u7801\u3001\u9a8c\u8bc1\u7801\u3001\u5bc6\u94a5\u3001\u94f6\u884c\u5361\u53f7\u6216\u79c1\u5bc6\u65e5\u8bb0\u3002\u5148\u5220\u9664\u654f\u611f\u5185\u5bb9\u3002"); return;
        }
        boolean allowed = finance.isChecked();
        if (WorkbenchClientPolicy.needsFinancialConsent(context) && !allowed) {
            showSettings();
            toast("\u8fd9\u6b21\u8f93\u5165\u6216\u5bf9\u8bdd\u4e0a\u4e0b\u6587\u5305\u542b\u91d1\u989d / \u6536\u5165\u4fe1\u606f\uff0c\u8bf7\u5148\u52fe\u9009\u672c\u6b21\u5904\u7406\u540c\u610f\u3002"); return;
        }
        JSONObject payload = new JSONObject();
        put(payload, "action", planning ? "plan" : "chat"); put(payload, "prompt", prompt);
        put(payload, "days", days); put(payload, "includeCalendar", calendar.isChecked());
        put(payload, "scheduleIds", calendar.isChecked() ? new JSONArray(selected) : new JSONArray());
        put(payload, "allowFinancial", allowed);
        if (planning) put(payload, "previousDraft", previousDraft);
        else { put(payload, "history", history); put(payload, "captureSource", pendingSource); }
        undoReceipt=null;undo=null;
        draft = null; saved = false; previewBox.removeAllViews(); previewBox.setVisibility(View.GONE); confirm = null; discard = null; expiry = null;
        setBusy(true); status.setText("AI \u6b63\u5728\u6574\u7406\uff0c\u6ca1\u6709\u4fdd\u5b58\u4efb\u4f55\u6570\u636e\u3002\u8bf7\u7a0d\u7b49\u2026");
        finance.setChecked(false);
        bridge.request("/api/assistant", payload, envelope -> {
            if (closed || !sessionMatches()) return;
            setBusy(false);
            JSONObject result = response(envelope, false);
            if (result == null || closed) return;
            JSONObject next = result.optJSONObject(planning ? "preview" : "capture");
            String answer = result.optString("answer", planning ? "\u8ba1\u5212\u8349\u7a3f\u5df2\u751f\u6210\uff0c\u8bf7\u6838\u5bf9\u540e\u786e\u8ba4\u3002" : "");
            appendHistory("user", prompt);
            appendHistory("assistant", answer.isEmpty() ? "\u6ca1\u6709\u5f97\u5230\u53ef\u786e\u8ba4\u7684\u5185\u5bb9\uff0c\u8bf7\u8865\u5145\u4fe1\u606f\u3002" : answer);
            renderConversation(prompt, answer); question.setText("");
            pendingSource = result.optString("pendingSource", "");
            if (pendingSource.length() > 1200) pendingSource = pendingSource.substring(pendingSource.length() - 1200);
            draft = next; planDraft = planning;
            sourceCountMatches = !planning || !result.has("sourceCount") || result.optInt("sourceCount",-1) == generatedReferences.size();
            if (next != null && planning) {
                previousDraft = minimalPreviousDraft(next);
            }
            status.setText(next == null ? "AI \u5df2\u56de\u590d\uff1b\u6ca1\u6709\u4fdd\u5b58\u8bb0\u5f55\u3002" : "\u8349\u7a3f\u5f85\u786e\u8ba4\uff0c\u5c1a\u672a\u4fdd\u5b58\u3002");
            renderPreview(); updateControls();
        });
    }
    private void appendHistory(String role, String value) {
        JSONObject item = new JSONObject(); put(item, "role", role);
        put(item, "text", value.substring(0, Math.min(value.length(), 240))); history.put(item);
        if (history.length() > 4) {
            JSONArray recent = new JSONArray();
            for (int i = history.length() - 4; i < history.length(); i++) recent.put(history.optJSONObject(i));
            history = recent;
        }
    }
    private void renderConversation(String prompt, String answer) {
        conversation.addView(NativeUi.message(activity, prompt, true));
        conversation.addView(NativeUi.message(activity,
            answer.substring(0, Math.min(answer.length(), 8000)), false));
        while (conversation.getChildCount() > 12) conversation.removeViewAt(0);
    }

    private String timeLabel(String raw) {
        Long instant=WorkbenchSchedulePolicy.instant(raw);
        if(instant==null)return raw==null||raw.isEmpty()?"\u65f6\u95f4\u5f85\u6838\u5bf9":raw;
        java.text.SimpleDateFormat display=new java.text.SimpleDateFormat("M\u6708d\u65e5 HH:mm",java.util.Locale.CHINA);
        display.setTimeZone(java.util.TimeZone.getTimeZone("Asia/Shanghai"));
        return display.format(new java.util.Date(instant))+"\uff08\u5317\u4eac\u65f6\u95f4\uff09";
    }
    private void renderPreview() {
        previewBox.removeAllViews(); previewBox.setVisibility(View.GONE); confirm = null; discard = null; expiry = null;
        planReviewed=null;planValidation=null;reviewOperations.clear();previewMatchesPayload=false;
        if (draft == null) return;
        previewBox.setVisibility(View.VISIBLE);
        if (financialDraft()) showSettings();
        previewBox.setPadding(dp(14), dp(14), dp(14), dp(14));
        previewBox.setBackground(NativeUi.shape(activity, Color.WHITE, 22, NativeUi.BORDER));
        previewBox.addView(NativeUi.badge(activity, "\u5f85\u786e\u8ba4 \u00b7 \u5c1a\u672a\u4fdd\u5b58", NativeUi.MINT, GREEN));
        previewBox.addView(label(planDraft ? "\u8ba1\u5212\u8349\u7a3f \u00b7 \u786e\u8ba4\u540e\u624d\u4fdd\u5b58" : draft.optString("title", "\u5f85\u786e\u8ba4\u5185\u5bb9"), 19, true));
        if (planDraft) {
            renderPlanReview();
        } else {
            previewBox.addView(label("\u4fdd\u5b58\u4f4d\u7f6e\uff1a" + draft.optString("destination"), 14, false));
            JSONArray fields = draft.optJSONArray("fields");
            if (fields != null) for (int i = 0; i < fields.length(); i++) {
                JSONObject item = fields.optJSONObject(i);
                if (item != null) previewBox.addView(label(item.optString("label") + "\uff1a" + item.optString("value"), 14, false));
            }
        }
        JSONArray warnings = draft.optJSONArray("warnings");
        if (warnings != null) for (int i = 0; i < warnings.length(); i++) {
            TextView warning = label("\u9700\u8981\u5904\u7406\uff1a" + warnings.optString(i), 13, true);
            warning.setTextColor(0xFF865324);
            warning.setPadding(dp(12), dp(10), dp(12), dp(10));
            warning.setBackground(NativeUi.shape(activity, 0xFFFFF3DF, 12));
            previewBox.addView(warning);
        }
        if(planDraft){
            planReviewed=new CheckBox(activity);
            planReviewed.setText("\u6211\u5df2\u9010\u9879\u6838\u5bf9\u65b0\u589e / \u4fee\u6539\u3001\u539f\u65e5\u7a0b\u4e0e\u65e5\u671f\u65f6\u95f4");
            planReviewed.setTextColor(INK);planReviewed.setTextSize(13);planReviewed.setMinHeight(dp(48));
            planReviewed.setChecked(false);planReviewed.setOnCheckedChangeListener((v,value)->updateControls());
            previewBox.addView(planReviewed);
            planValidation=label("",12,false);previewBox.addView(planValidation);
            Button revise=button("\u4fee\u6539\u8981\u6c42\uff0c\u91cd\u65b0\u751f\u6210\u8349\u7a3f",false);
            revise.setOnClickListener(v->revisePlan());previewBox.addView(revise);
        }
        expiry = label("", 12, false); previewBox.addView(expiry);
        confirm = button("\u786e\u8ba4\u6dfb\u52a0\u5230\u5de5\u4f5c\u53f0", true); confirm.setOnClickListener(v -> confirmSave()); previewBox.addView(confirm);
        discard = button("\u653e\u5f03\u8349\u7a3f\uff0c\u7ee7\u7eed\u6c9f\u901a", false);
        discard.setOnClickListener(v -> new AlertDialog.Builder(activity).setTitle("\u653e\u5f03\u672a\u4fdd\u5b58\u8349\u7a3f\uff1f")
            .setMessage("\u4e0d\u4f1a\u4fee\u6539\u4e91\u7aef\u6570\u636e\u3002\u4f60\u53ef\u4ee5\u8865\u5145\u8981\u6c42\uff0c\u91cd\u65b0\u8ba9 AI \u6574\u7406\u3002")
            .setNegativeButton("\u4fdd\u7559", null).setPositiveButton("\u653e\u5f03", (d, which) -> {
                draft = null; saved = false; planReviewed=null;planValidation=null; reviewOperations.clear(); previewBox.removeAllViews(); previewBox.setVisibility(View.GONE); confirm = null; discard = null; expiry = null;
                status.setText("\u8349\u7a3f\u5df2\u653e\u5f03\uff0c\u6ca1\u6709\u4fdd\u5b58\u3002"); updateControls();
            }).show());
        previewBox.addView(discard); updateControls();
    }
    private boolean draftPending() { return draft != null && !saved; }
    private boolean financialDraft() {
        return draft != null && (draft.optBoolean("requiresFinancialConsent") || "income".equals(draft.optString("kind")));
    }
    private boolean canSave() {
        if (draft == null) return false;
        JSONArray warnings = draft.optJSONArray("warnings");
        boolean structure = warnings != null;
        if (planDraft) {
            JSONArray operations = draft.optJSONArray("operations");
            structure &= operations != null && operations.length() > 0 && operations.length() <= 8
                && previewMatchesPayload && sourceCountMatches && planReviewed != null && planReviewed.isChecked()
                && WorkbenchPlanReviewPolicy.problems(reviewOperations,generatedReferences,generatedEditable,System.currentTimeMillis()).isEmpty();
        } else {
            String kind = draft.optString("kind");
            structure &= ("schedule".equals(kind) || "life".equals(kind) || "income".equals(kind))
                && draft.optJSONArray("fields") != null;
        }
        return structure && sessionMatches() && WorkbenchClientPolicy.canConfirm(draft.optString("payload"), draft.optString("signature"),
            draft.optLong("expiresAt"), System.currentTimeMillis(), warnings.length(), financialDraft(),
            finance.isChecked(), saved, host.writesBlocked(), planDraft);
    }
    private void confirmSave() {
        if (busy || !canSave()) { toast("\u8349\u7a3f\u4e0d\u53ef\u4fdd\u5b58\uff1a\u8bf7\u68c0\u67e5\u8b66\u544a\u3001\u6709\u6548\u671f\u3001\u672c\u6b21\u91d1\u989d\u540c\u610f\u53ca\u4e0a\u6b21\u4fdd\u5b58\u7ed3\u679c\u3002"); return; }
        new AlertDialog.Builder(activity).setTitle("\u786e\u8ba4\u5199\u5165\u5de5\u4f5c\u53f0")
            .setMessage("\u5c06\u4fdd\u5b58\u4f60\u521a\u624d\u6838\u5bf9\u7684\u8349\u7a3f\u3002\u8ba1\u5212\u53ef\u80fd\u5305\u542b\u4fee\u6539\u5df2\u6709\u65e5\u7a0b\u3002\u4fdd\u5b58\u540e\u4f1a\u540c\u6b65\u56de App\uff1b\u4e0d\u4f1a\u81ea\u52a8\u91cd\u53d1\u3002")
            .setNegativeButton("\u518d\u770b\u770b", null).setPositiveButton("\u786e\u8ba4\u4fdd\u5b58", (v, which) -> {
                if (closed || busy || !canSave()) { toast("\u8349\u7a3f\u5df2\u5931\u6548\u6216\u6682\u65f6\u4e0d\u80fd\u4fdd\u5b58\uff0c\u8bf7\u91cd\u65b0\u6838\u5bf9\u3002"); return; }
                JSONObject payload = new JSONObject();
                put(payload, "action", planDraft ? "apply" : "capture.apply"); put(payload, "confirmed", true);
                put(payload, "payload", draft.optString("payload")); put(payload, "signature", draft.optString("signature"));
                put(payload, "allowFinancial", finance.isChecked());
                writing = true; setBusy(true); status.setText("\u6b63\u5728\u4fdd\u5b58\uff0c\u8bf7\u4e0d\u8981\u91cd\u590d\u63d0\u4ea4\u2026");
                bridge.request("/api/assistant", payload, envelope -> {
                    if (closed) return;
                    JSONObject result = response(envelope, true);
                    writing = false; setBusy(false);
                    if (result == null || closed) return;
                    if (result.optInt("saved", 0) <= 0 || result.has("error")) {
                        unknownSave(); return;
                    }
                    saved = true; pendingSource = ""; finance.setChecked(false);
                    if(planDraft){choicesReadElapsed=0;selected.clear();calendar.setChecked(false);previousDraft="";renderReferences();}
                    status.setText(result.optBoolean("alreadyApplied") ? "\u8fd9\u4efd\u8349\u7a3f\u5df2\u4fdd\u5b58\uff0c\u6ca1\u6709\u91cd\u590d\u6dfb\u52a0\u3002" : "\u5df2\u4fdd\u5b58\u5230\u5de5\u4f5c\u53f0\uff0c\u6b63\u5728\u540c\u6b65\u3002");
                    showSavedReceipt(result); updateControls(); host.onSaved();
                });
            }).show();
    }
    private void showSavedReceipt(JSONObject result) {
        previewBox.removeAllViews(); confirm=null;discard=null;expiry=null;undo=null;
        planReviewed=null;planValidation=null;reviewOperations.clear();
        previewBox.addView(NativeUi.badge(activity,"\u5df2\u4fdd\u5b58\u5230\u5de5\u4f5c\u53f0",NativeUi.MINT,GREEN));
        previewBox.addView(label(result.optString("destination",planDraft?"\u65e5\u7a0b\u5b89\u6392":"\u751f\u6d3b\u8bb0\u5f55"),19,true));
        undoReceipt=result.optJSONObject("undo");
        if(undoReceipt!=null&&!undoReceipt.optString("payload").isEmpty()&&!undoReceipt.optString("signature").isEmpty()){
            previewBox.addView(label("\u53ef\u5728 30 \u5206\u949f\u5185\u786e\u8ba4\u64a4\u9500\uff1b\u82e5\u65e5\u7a0b\u6216\u8bb0\u5f55\u5df2\u88ab\u6539\u52a8\uff0c\u670d\u52a1\u5668\u4f1a\u62d2\u7edd\u8986\u76d6\u3002",13,false));
            undo=button("\u64a4\u9500\u672c\u6b21 AI \u64cd\u4f5c",false);undo.setOnClickListener(v->confirmUndo());previewBox.addView(undo);
        }else previewBox.addView(label("\u6b64\u64cd\u4f5c\u4e0d\u63d0\u4f9b\u5feb\u6377\u64a4\u9500\u3002\u91d1\u989d\u8bb0\u5f55\u8bf7\u5728\u517c\u804c\u4e0e\u8d22\u52a1\u4e2d\u6838\u5bf9\uff0c\u4e0d\u4f1a\u81ea\u52a8\u5220\u9664\u6536\u6b3e\u3002",13,false));
    }
    private void confirmUndo() {
        if(closed||busy||!sessionMatches()||undoReceipt==null||undoReceipt.optLong("expiresAt")<=System.currentTimeMillis()||host.writesBlocked())return;
        new AlertDialog.Builder(activity).setTitle("\u786e\u8ba4\u64a4\u9500\u8fd9\u6b21\u64cd\u4f5c\uff1f")
            .setMessage("\u65b0\u5efa\u65e5\u7a0b\u4f1a\u6807\u8bb0\u53d6\u6d88\uff0c\u4fee\u6539\u65e5\u7a0b\u4f1a\u5c1d\u8bd5\u6062\u590d\u539f\u503c\uff0c\u65b0\u5efa\u751f\u6d3b\u8bb0\u5f55\u4f1a\u79fb\u5165\u56de\u6536\u72b6\u6001\u3002\u4e0d\u4f1a\u8986\u76d6\u540e\u6765\u7684\u4fee\u6539\u6216\u5df2\u6709\u5de5\u65f6\uff0c\u4e0d\u4f1a\u64a4\u9500\u771f\u5b9e\u6536\u6b3e\u3002")
            .setNegativeButton("\u4fdd\u7559",null).setPositiveButton("\u786e\u8ba4\u64a4\u9500",(d,w)->{
                if(closed||busy||!sessionMatches()||host.writesBlocked()||undoReceipt.optLong("expiresAt")<=System.currentTimeMillis())return;
                JSONObject p=new JSONObject();put(p,"action","undo");put(p,"confirmed",true);put(p,"payload",undoReceipt.optString("payload"));put(p,"signature",undoReceipt.optString("signature"));
                writing=true;setBusy(true);status.setText("\u6b63\u5728\u6838\u5bf9\u5e76\u64a4\u9500\u2026");
                bridge.request("/api/assistant",p,envelope->{
                    if(closed)return;JSONObject result=response(envelope,true);writing=false;setBusy(false);
                    if(result==null)return;
                    if(result.optInt("undone")<=0){unknownSave();return;}
                    undoReceipt=null;if(undo!=null)undo.setEnabled(false);
                    choicesReadElapsed=0;selected.clear();calendar.setChecked(false);previousDraft="";renderReferences();
                    status.setText("\u5df2\u64a4\u9500\u672c\u6b21\u64cd\u4f5c\uff0c\u6b63\u5728\u540c\u6b65\u3002");host.onSaved();
                });
            }).show();
    }

    private JSONObject response(JSONObject envelope, boolean saveRequest) {
        if(!sessionMatches()){ready=false;return null;}
        int code = envelope.optInt("status", 0);
        String type = envelope.optString("type").toLowerCase(java.util.Locale.ROOT);
        if (code == 0 || code >= 500) {
            if (saveRequest) unknownSave();
            else status.setText("\u7f51\u7edc\u6216\u670d\u52a1\u6682\u65f6\u4e0d\u53ef\u7528\uff0c\u8f93\u5165\u4fdd\u7559\uff0c\u53ef\u7a0d\u540e\u91cd\u8bd5\u3002");
            return null;
        }
        Uri url = Uri.parse(envelope.optString("url"));
        boolean json = type.contains("application/json") || type.contains("+json");
        if (code == 401 || code == 403 || !json || !bridge.matchesOrigin(url) || !"/api/assistant".equals(url.getPath())) {
            if (saveRequest && code != 401 && code != 403) unknownSave();
            ready = false; status.setText("\u767b\u5f55\u8fde\u63a5\u5df2\u5931\u6548\uff0c\u8bf7\u91cd\u65b0\u6388\u6743\u3002");
            host.onAuthRequired(); return null;
        }
        try {
            JSONObject result = new JSONObject(envelope.optString("body"));
            if (code >= 400 || result.has("error")) {
                if (code == 429) cooldownUntil = System.currentTimeMillis()
                    + Math.min(3600, Math.max(1, result.optInt("retryAfter", 60))) * 1000L;
                status.setText(result.optString("error", "\u8fd9\u6b21\u8bf7\u6c42\u672a\u5b8c\u6210\uff0c\u8bf7\u6838\u5bf9\u8f93\u5165\u3002"));
                updateControls(); return null;
            }
            return result;
        } catch (Exception ignored) {
            if (saveRequest) unknownSave();
            else status.setText("\u6ca1\u6709\u6536\u5230\u6709\u6548 AI \u56de\u590d\u3002\u8f93\u5165\u4fdd\u7559\uff0c\u7a0d\u540e\u91cd\u8bd5\u3002");
            return null;
        }
    }
    private void unknownSave() {
        status.setText("\u4fdd\u5b58\u7ed3\u679c\u5f85\u6838\u5bf9\u3002\u8bf7\u8fd4\u56de\u5de5\u4f5c\u53f0\u540c\u6b65\u67e5\u770b\uff0c\u518d\u5230\u201c\u6211\u7684\u201d\u786e\u8ba4\u7ed3\u679c\uff1b\u4e0d\u8981\u91cd\u590d\u4fdd\u5b58\u3002");
        host.onUnknownSave(); updateControls();
    }
    private void updateControls() {
        if (send == null || closed) return;
        boolean scoped=sessionMatches();
        boolean planning=mode.getCheckedRadioButtonId()==planId;
        planWorkspace.setVisibility(planning?View.VISIBLE:View.GONE);
        boolean referenceFresh=WorkbenchPlanReviewPolicy.contextFresh(choicesReadElapsed,SystemClock.elapsedRealtime());
        referenceStatus.setText((calendar.isChecked()?"\u5df2\u540c\u610f\u5f15\u7528 "+selected.size()+" / 8 \u9879":"\u672c\u6b21\u4e0d\u5f15\u7528\u65e5\u7a0b")
            +(referenceFresh?"\uff1b\u8303\u56f4\u5df2\u8bfb\u53d6":"\uff1b\u65e5\u7a0b\u8303\u56f4\u9700\u5237\u65b0"));
        planChoose.setEnabled(!busy&&!draftPending()&&ready&&scoped);
        clearContext.setEnabled(!busy&&!draftPending());
        if(planReviewed!=null)planReviewed.setEnabled(!busy&&!saved&&scoped);
        if(!scoped&&status!=null)status.setText("\u8d26\u53f7\u72b6\u6001\u5df2\u53d8\u5316\uff0c\u8bf7\u8fd4\u56de\u5de5\u4f5c\u53f0\u5e76\u91cd\u65b0\u6253\u5f00 AI\u3002");
        if(planValidation!=null&&draft!=null&&planDraft&&!saved){
            List<String> live=WorkbenchPlanReviewPolicy.problems(reviewOperations,generatedReferences,generatedEditable,System.currentTimeMillis());
            JSONArray warnings=draft.optJSONArray("warnings");
            String reason=!scoped?"\u8d26\u53f7\u72b6\u6001\u9700\u8981\u91cd\u65b0\u6838\u5bf9"
                :!previewMatchesPayload||!sourceCountMatches?"\u663e\u793a\u5185\u5bb9\u6216\u5f15\u7528\u8303\u56f4\u4e0d\u80fd\u4e00\u81f4\u6838\u5bf9\uff0c\u8bf7\u91cd\u65b0\u751f\u6210"
                :!live.isEmpty()?live.get(0)
                :warnings==null||warnings.length()>0?"\u8bf7\u5148\u5904\u7406\u8349\u7a3f\u8b66\u544a\u6216\u51b2\u7a81\uff0c\u4e0d\u80fd\u76f4\u63a5\u4fdd\u5b58"
                :draft.optLong("expiresAt")<=System.currentTimeMillis()?"\u8349\u7a3f\u5df2\u8fc7\u671f\uff0c\u8bf7\u91cd\u65b0\u751f\u6210"
                :host.writesBlocked()?"\u8bf7\u5148\u5237\u65b0\u5de5\u4f5c\u53f0\u5e76\u6838\u5bf9\u4e0a\u6b21\u4fdd\u5b58\u7ed3\u679c"
                :planReviewed==null||!planReviewed.isChecked()?"\u9010\u9879\u6838\u5bf9\u540e\uff0c\u52fe\u9009\u786e\u8ba4"
                :"\u53ef\u8fdb\u5165\u4fdd\u5b58\u786e\u8ba4\uff0c\u5c1a\u672a\u5199\u5165\u4e91\u7aef";
            planValidation.setText(reason);
        }
        if(undo!=null)undo.setEnabled(!busy&&undoReceipt!=null&&undoReceipt.optLong("expiresAt")>System.currentTimeMillis()&&!host.writesBlocked());
        boolean pending = draftPending();
        boolean cooling = System.currentTimeMillis() < cooldownUntil;
        send.setEnabled(!busy && ready && !pending && !cooling && scoped);
        send.setText(cooling ? "\u8bf7\u7b49\u5f85 " + ((cooldownUntil - System.currentTimeMillis() + 999) / 1000) + " \u79d2"
            : mode.getCheckedRadioButtonId() == planId ? "\u751f\u6210\u8ba1\u5212\u8349\u7a3f" : "\u53d1\u9001\u7ed9 AI");
        refresh.setEnabled(!busy && !pending);
        question.setEnabled(!busy && !pending);
        finance.setEnabled(!busy);
        calendar.setEnabled(!busy && !pending);
        choose.setEnabled(!busy && !pending && ready && calendar.isChecked());
        choose.setText("\u9009\u62e9\u65e5\u7a0b\uff08\u5df2\u9009 " + selected.size() + " / 8 \u9879\uff09");
        range.setEnabled(!busy && !pending);
        for (int i = 0; i < mode.getChildCount(); i++) mode.getChildAt(i).setEnabled(!busy && !pending);
        if (confirm != null) { confirm.setEnabled(!busy && canSave()); confirm.setText(saved ? "\u5df2\u4fdd\u5b58\uff0c\u4e0d\u91cd\u590d\u6dfb\u52a0" : planDraft ? "\u786e\u8ba4\u4fdd\u5b58\u8fd9\u4efd\u8ba1\u5212" : "\u786e\u8ba4\u6dfb\u52a0\u5230\u5de5\u4f5c\u53f0"); }
        if (discard != null) discard.setEnabled(!busy);
        if (expiry != null && draft != null) {
            long remaining = Math.max(0, (draft.optLong("expiresAt") - System.currentTimeMillis()) / 1000);
            expiry.setText(saved ? "\u4fdd\u5b58\u5df2\u5b8c\u6210" : remaining > 0 ? "\u8349\u7a3f\u5269\u4f59 " + remaining / 60 + " \u5206 " + remaining % 60 + " \u79d2"
                : "\u8349\u7a3f\u5df2\u8fc7\u671f\uff0c\u8bf7\u653e\u5f03\u540e\u91cd\u65b0\u751f\u6210\u3002");
        }
    }
    private void setBusy(boolean value) {
        busy = value;
        if (dialog != null) { dialog.setCancelable(!value); dialog.setCanceledOnTouchOutside(false); }
        updateControls();
    }
    void close() {
        if (closed) return;
        closed = true; statusRevision++; handler.removeCallbacks(expiryTick);
        history = new JSONArray(); pendingSource = ""; previousDraft = ""; draft = null;
        selected.clear();generatedReferences.clear();generatedEditable.clear();reviewOperations.clear();
        if (dialog != null && dialog.isShowing()) dialog.dismiss();
        host.onClosed();
    }
    private int dp(int n) { return Math.round(n * activity.getResources().getDisplayMetrics().density); }
    private LinearLayout column() { LinearLayout view = new LinearLayout(activity); view.setOrientation(LinearLayout.VERTICAL); return view; }
    private GradientDrawable shape(int color) {
        return NativeUi.shape(activity, color, 18);
    }

    private TextView label(String value, int size, boolean bold) {
        TextView view = NativeUi.label(activity, value, size, size < 14 && !bold ? NativeUi.MUTED : INK, bold);
        view.setPadding(0, dp(7), 0, dp(7));
        view.setTextIsSelectable(true);
        return view;
    }

    private Button button(String text, boolean primary) {
        return NativeUi.button(activity, text, primary);
    }

    private void toast(String value) { Toast.makeText(activity, value, Toast.LENGTH_LONG).show(); }
    private static void put(JSONObject object, String key, Object value) {
        try { object.put(key, value); } catch (Exception ignored) { }
    }
}
