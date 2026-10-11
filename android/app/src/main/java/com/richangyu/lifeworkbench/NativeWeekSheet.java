package com.richangyu.lifeworkbench;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.DatePickerDialog;
import android.graphics.Color;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
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
import java.util.Calendar;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.TimeZone;

/** Manual, read-only date browsing with account-bound, consistent pagination. */
final class NativeWeekSheet {
    interface Host {
        String accountScope();
        boolean readsAllowed();
        void onAuthRequired();
        void onClosed();
    }
    private final Activity activity;
    private final MobileApiBridge bridge;
    private final Host host;
    private final String scope;
    private final Handler handler=new Handler(Looper.getMainLooper());
    private AlertDialog dialog;
    private NativeLegacyWeekSheet legacy;
    private LinearLayout days, timeline;
    private TextView range, status, summary, coverage;
    private Button previous, next, choose, refresh, more, fallback;
    private WorkbenchCalendarPolicy.Snapshot snapshot;
    private String from=WorkbenchCalendarPolicy.day(System.currentTimeMillis()), problem="";
    private int selectedDay, revision, visibleCount=100;
    private boolean loading, closed, oldServer;
    private final Runnable staleTick=new Runnable() {
        @Override public void run() {
            if(closed) return;
            if(!sameScope()) { close(); return; }
            updateStatus(); handler.postDelayed(this,30000);
        }
    };
    NativeWeekSheet(Activity activity, MobileApiBridge bridge, Host host) {
        this.activity=activity; this.bridge=bridge; this.host=host; scope=host.accountScope();
    }
    private int dp(int value) { return NativeUi.dp(activity,value); }
    private TextView label(String value,int size,int color,boolean bold) {
        return NativeUi.label(activity,value,size,color,bold);
    }
    private String date(long value,String pattern) {
        SimpleDateFormat format=new SimpleDateFormat(pattern,Locale.CHINA);
        format.setTimeZone(TimeZone.getTimeZone("Asia/Shanghai")); return format.format(new Date(value));
    }
    private boolean sameScope() { return WorkbenchWeekPolicy.scopeMatches(scope,host.accountScope()); }
    void show() {
        if(closed || dialog!=null) return;
        ScrollView scroll=new ScrollView(activity);
        scroll.setFillViewport(true); scroll.setVerticalScrollBarEnabled(false);
        LinearLayout body=NativeUi.column(activity);
        body.setPadding(dp(18),dp(16),dp(18),dp(24)); body.setBackground(NativeUi.pageBackground());
        TextView heading=label("\u65e5\u7a0b\uff0c\u6309\u5929\u6162\u6162\u770b",24,NativeUi.INK,true);
        heading.setTypeface(NativeUi.DISPLAY); body.addView(heading);
        range=label("",13,NativeUi.FOREST,false); body.addView(range);
        coverage=label("\u6d4f\u89c8\u5df2\u4fdd\u5b58\u7684\u5b89\u6392\u4e0e\u6267\u884c\u5b9e\u4f8b\uff1b\u8ba1\u5212\u65f6\u957f\u4e0d\u7b49\u4e8e\u5b9e\u9645\u6295\u5165\u3002",12,NativeUi.MUTED,false);
        coverage.setPadding(0,dp(8),0,dp(10)); body.addView(coverage);
        previous=NativeUi.button(activity,"\u524d 7 \u5929",false);
        next=NativeUi.button(activity,"\u540e 7 \u5929",false);
        LinearLayout navigation=new LinearLayout(activity);
        navigation.addView(previous,new LinearLayout.LayoutParams(0,-2,1));
        navigation.addView(next,new LinearLayout.LayoutParams(0,-2,1)); body.addView(navigation);
        previous.setOnClickListener(v -> move(-7)); next.setOnClickListener(v -> move(7));
        choose=NativeUi.button(activity,"\u9009\u62e9\u8d77\u59cb\u65e5\u671f",false); choose.setOnClickListener(v -> chooseDate()); body.addView(choose);
        refresh=NativeUi.button(activity,"\u5237\u65b0\u672c\u671f",false); refresh.setOnClickListener(v -> load(false)); body.addView(refresh);
        status=label("",12,NativeUi.MUTED,false);
        status.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE); body.addView(status);
        fallback=NativeUi.button(activity,"\u6253\u5f00\u65e7\u7248\u8fd1\u671f\u9884\u89c8\uff08\u6700\u591a 40 \u6761\uff09",false);
        fallback.setOnClickListener(v -> openLegacy()); body.addView(fallback);
        HorizontalScrollView strip=new HorizontalScrollView(activity);
        strip.setHorizontalScrollBarEnabled(false);
        days=new LinearLayout(activity); strip.addView(days,new FrameLayout.LayoutParams(-2,-2)); body.addView(strip);
        summary=label("",14,NativeUi.INK,true); summary.setPadding(0,dp(16),0,dp(8)); body.addView(summary);
        timeline=NativeUi.column(activity); body.addView(timeline);
        more=NativeUi.button(activity,"\u7ee7\u7eed\u8bfb\u53d6\u4e0b\u4e00\u9875",true); more.setOnClickListener(v -> load(true)); body.addView(more);
        body.addView(label("\u672c\u9875\u4e0d\u4fdd\u5b58\u3001\u4fee\u6539\u6216\u5411 AI \u53d1\u9001\u65e5\u7a0b\u3002\u5173\u95ed\u9875\u9762\u4f1a\u6e05\u9664\u5185\u5b58\u4e2d\u7684\u65e5\u7a0b\uff0c\u4e0d\u6e05\u7a7a\u4e91\u7aef\u6570\u636e\u3002",11,NativeUi.MUTED,false));
        scroll.addView(body,new ScrollView.LayoutParams(-1,-2));
        dialog=new AlertDialog.Builder(activity).setView(scroll).setNegativeButton("\u5173\u95ed",(d,w)->close()).create();
        dialog.setOnDismissListener(d->close()); dialog.show();
        Window window=dialog.getWindow();
        if(window!=null) window.setLayout(WindowManager.LayoutParams.MATCH_PARENT,
            Math.round(activity.getResources().getDisplayMetrics().heightPixels*0.88f));
        handler.postDelayed(staleTick,30000); load(false);
    }
    private void move(int days) {
        if(loading || !sameScope()) return;
        String value=WorkbenchCalendarPolicy.day(WorkbenchCalendarPolicy.start(from)+days*WorkbenchCalendarPolicy.DAY);
        if(!WorkbenchCalendarPolicy.allowedDate(value,System.currentTimeMillis())) return;
        from=value; selectedDay=0; visibleCount=100; load(false);
    }
    private void chooseDate() {
        if(loading || !sameScope()) return;
        Calendar day=Calendar.getInstance(TimeZone.getTimeZone("Asia/Shanghai"),Locale.ROOT);
        day.setTimeInMillis(WorkbenchCalendarPolicy.start(from));
        DatePickerDialog picker=new DatePickerDialog(activity,(view,y,m,d)->{
            if(closed || loading || !sameScope()) return;
            String value=String.format(Locale.ROOT,"%04d-%02d-%02d",y,m+1,d);
            if(WorkbenchCalendarPolicy.allowedDate(value,System.currentTimeMillis())) {
                from=value; selectedDay=0; load(false);
            }
        },day.get(Calendar.YEAR),day.get(Calendar.MONTH),day.get(Calendar.DAY_OF_MONTH));
        long today=WorkbenchWeekPolicy.dayStart(System.currentTimeMillis());
        picker.getDatePicker().setMinDate(today-365*WorkbenchCalendarPolicy.DAY);
        picker.getDatePicker().setMaxDate(today+365*WorkbenchCalendarPolicy.DAY);
        picker.show();
    }
    private static String string(JSONObject item,String key) throws Exception {
        if(!(item.opt(key) instanceof String)) throw new IllegalArgumentException("text");
        return item.getString(key);
    }
    private static int integer(JSONObject item,String key) throws Exception {
        if(!(item.opt(key) instanceof Number) || item.getDouble(key)!=item.getInt(key))
            throw new IllegalArgumentException("number");
        return item.getInt(key);
    }
    private void load(boolean append) {
        if(closed || loading) return;
        if(!sameScope()) { close(); return; }
        if(!host.readsAllowed()) { problem="\u8fde\u63a5\u72b6\u6001\u5df2\u53d8\u5316\uff0c\u8bf7\u5173\u95ed\u540e\u91cd\u65b0\u8bfb\u53d6\u5de5\u4f5c\u53f0\u3002"; render(); return; }
        if(!WorkbenchCalendarPolicy.allowedDate(from,System.currentTimeMillis())) {
            problem="\u8bf7\u9009\u62e9\u4eca\u5929\u524d\u540e\u4e00\u5e74\u5185\u7684\u65e5\u671f\u3002"; render(); return;
        }
        if(append && (snapshot==null || snapshot.cursor.isEmpty() || !snapshot.fresh(SystemClock.elapsedRealtime()))) return;
        if(!append) { snapshot=null; oldServer=false; visibleCount=100; }
        final String requestedFrom=from;
        final String endpoint="/api/mobile-calendar?from="+from+(append ? "&cursor="+snapshot.cursor : "");
        final int requestRevision=++revision;
        loading=true; problem=""; render();
        bridge.request(endpoint,null,envelope->{
            if(closed || requestRevision != revision) return;
            loading=false;
            if(!sameScope()) { close(); return; }
            int code=envelope.optInt("status");
            String type=envelope.optString("type").toLowerCase(Locale.ROOT);
            if(code == 401 || code == 403 || (code>=200 && code<300 && type.contains("text/html"))) {
                close(); host.onAuthRequired(); return;
            }
            if(!host.readsAllowed()) {
                snapshot=null; problem="\u8fde\u63a5\u72b6\u6001\u5df2\u53d8\u5316\uff0c\u8bf7\u5173\u95ed\u540e\u91cd\u65b0\u8bfb\u53d6\u3002"; render(); return;
            }
            if(code==404 || code==405) {
                snapshot=null; oldServer=true;
                problem="\u5de5\u4f5c\u53f0\u5c1a\u672a\u63d0\u4f9b\u65b0\u7248\u65e5\u7a0b\u63a5\u53e3\u3002\u4ecd\u53ef\u6253\u5f00\u65e7\u7248\u8fd1\u671f\u9884\u89c8\uff0c\u4f46\u5b83\u4e0d\u662f\u5b8c\u6574\u65e5\u5386\u3002";
                render(); return;
            }
            if(code==409) {
                snapshot=null; problem="\u4e91\u7aef\u65e5\u7a0b\u5df2\u53d8\u5316\uff0c\u672c\u671f\u7ffb\u9875\u5df2\u505c\u6b62\u3002\u8bf7\u5237\u65b0\uff0c\u907f\u514d\u6f0f\u770b\u6216\u6df7\u5165\u65e7\u6570\u636e\u3002";
                render(); return;
            }
            try {
                Uri uri=Uri.parse(envelope.optString("url"));
                if(code<200 || code>=300 || !bridge.matchesOrigin(uri) || !type.contains("application/json")
                    || !endpoint.equals(uri.getEncodedPath()+"?"+uri.getEncodedQuery()))
                    throw new IllegalArgumentException("response");
                JSONObject payload=new JSONObject(envelope.optString("body"));
                WorkbenchCalendarPolicy.Snapshot target=snapshot==null
                    ? new WorkbenchCalendarPolicy.Snapshot(requestedFrom) : snapshot;
                if(integer(payload,"schema")!=1 || !"Asia/Shanghai".equals(string(payload,"timezone"))
                    || !requestedFrom.equals(string(payload,"from")) || !target.to.equals(string(payload,"to"))
                    || !"stored-occurrences-and-single-events".equals(string(payload,"coverage")))
                    throw new IllegalArgumentException("range");
                JSONArray rows=payload.getJSONArray("rows");
                if(rows.length()>WorkbenchCalendarPolicy.PAGE_SIZE) throw new IllegalArgumentException("limit");
                List<WorkbenchCalendarPolicy.Entry> entries=new ArrayList<>();
                for(int i=0;i<rows.length();i++) {
                    JSONObject item=rows.getJSONObject(i);
                    String source=string(item,"source");
                    if(!"stored".equals(source) && !"single".equals(source)) throw new IllegalArgumentException("source");
                    entries.add(new WorkbenchCalendarPolicy.Entry(string(item,"id"),string(item,"title"),
                        string(item,"category"),string(item,"startAt"),string(item,"endAt"),string(item,"place"),
                        string(item,"note"),string(item,"status"),integer(item,"actualMinutes"),
                        string(item,"reflection"),string(item,"interruptionReason"),"stored".equals(source)));
                }
                target.append(string(payload,"snapshot"),string(payload,"nextCursor"),integer(payload,"offset"),
                    integer(payload,"total"),integer(payload,"repeating"),integer(payload,"invalidTemplates"),
                    entries,SystemClock.elapsedRealtime());
                snapshot=target;
            } catch(Exception ignored) {
                problem=code==0 ? "\u8fde\u63a5\u4e2d\u65ad\uff0c\u672a\u80fd\u8bfb\u53d6\u8fd9\u4e00\u9875\u3002\u8bf7\u624b\u52a8\u91cd\u8bd5\uff1b\u672c\u9875\u6ca1\u6709\u63d0\u4ea4\u8bb0\u5f55\u3002"
                    : code==413 ? "\u672c\u671f\u6570\u636e\u8fc7\u591a\uff0c\u6682\u4e0d\u80fd\u5b8c\u6574\u8bfb\u53d6\u3002\u8bf7\u5728\u5de5\u4f5c\u53f0\u6838\u5bf9\uff0c\u4e0d\u4f1a\u628a\u5b83\u663e\u793a\u6210\u7a7a\u65e5\u7a0b\u3002"
                    : code==429 ? "\u8bfb\u53d6\u8fc7\u4e8e\u9891\u7e41\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u3002"
                    : "\u8fd9\u4e00\u9875\u672a\u8bfb\u53d6\u6210\u529f\u6216\u683c\u5f0f\u4e0d\u5339\u914d\uff1b\u5df2\u8bfb\u90e8\u5206\u4e0d\u662f\u5b8c\u6574\u7ed3\u679c\u3002\u8bf7\u5237\u65b0\u6216\u67e5\u770b\u8fde\u63a5\u8bca\u65ad\u3002";
            }
            render();
        });
    }
    private void updateStatus() {
        if(closed || status==null) return;
        boolean ready=!loading && sameScope() && host.readsAllowed();
        long start=WorkbenchCalendarPolicy.start(from), now=System.currentTimeMillis();
        previous.setEnabled(ready && WorkbenchCalendarPolicy.allowedDate(WorkbenchCalendarPolicy.day(start-7*WorkbenchCalendarPolicy.DAY),now));
        next.setEnabled(ready && WorkbenchCalendarPolicy.allowedDate(WorkbenchCalendarPolicy.day(start+7*WorkbenchCalendarPolicy.DAY),now));
        choose.setEnabled(ready); refresh.setEnabled(ready);
        more.setVisibility(snapshot!=null && !snapshot.cursor.isEmpty() ? View.VISIBLE : View.GONE);
        more.setEnabled(ready && snapshot!=null && snapshot.fresh(SystemClock.elapsedRealtime()));
        fallback.setVisibility(oldServer ? View.VISIBLE : View.GONE); fallback.setEnabled(ready);
        String value=loading ? "\u6b63\u5728\u8bfb\u53d6\u5f53\u524d\u8d26\u53f7\u7684\u65e5\u7a0b\u2026" : problem;
        if(snapshot!=null) {
            value+=(value.isEmpty() ? "" : "\n")+"\u672c\u671f\u5df2\u8bfb "+snapshot.entries.size()+" / "+snapshot.total+" \u6761";
            value+=snapshot.complete() ? "\uff0c\u5f53\u524d\u6570\u636e\u8303\u56f4\u5df2\u8bfb\u5b8c\u3002" : "\uff0c\u5c1a\u672a\u8bfb\u5b8c\uff0c\u8bf7\u7ee7\u7eed\u8bfb\u53d6\u3002";
            if(!snapshot.fresh(SystemClock.elapsedRealtime())) value+="\n\u5df2\u8bfb\u6570\u636e\u8d85\u8fc7 5 \u5206\u949f\uff0c\u8bf7\u624b\u52a8\u5237\u65b0\u672c\u671f\u3002";
        } else if(value.isEmpty()) value="\u5c1a\u672a\u8bfb\u53d6\uff0c\u4e0d\u4ee3\u8868\u4e91\u7aef\u6ca1\u6709\u5b89\u6392\u3002";
        status.setText(value);
    }
    private void render() {
        if(closed || days==null) return;
        updateStatus(); days.removeAllViews(); timeline.removeAllViews();
        long start=WorkbenchCalendarPolicy.start(from);
        range.setText(date(start,"M\u6708d\u65e5")+" \u81f3 "+date(start+6*WorkbenchCalendarPolicy.DAY,"M\u6708d\u65e5")+" \u00b7 \u5317\u4eac\u65f6\u95f4");
        coverage.setText("\u5355\u6b21\u5b89\u6392\u4e0e\u5df2\u751f\u6210\u7684\u91cd\u590d\u65e5\u7a0b\u5b9e\u4f8b\u3002\u8fc7\u53bb\u7684\u5b89\u6392\u4e5f\u53ef\u67e5\u770b\uff1b\u672a\u751f\u6210\u7684\u91cd\u590d\u5386\u53f2\u4e0d\u5728\u672c\u9875\uff0c\u4e0d\u80fd\u636e\u6b64\u5224\u65ad\u7a7a\u95f2\u3002"
            +(snapshot!=null && snapshot.invalidTemplates>0 ? "\n\u53e6\u6709 "+snapshot.invalidTemplates+" \u6761\u6e90\u5b89\u6392\u65f6\u95f4\u5f02\u5e38\uff0c\u9700\u5728\u5de5\u4f5c\u53f0\u6838\u5bf9\u3002" : ""));
        for(int i=0;i<7;i++) {
            final int day=i;
            int count=snapshot==null ? 0 : snapshot.day(i).size();
            Button button=NativeUi.button(activity,date(start+i*WorkbenchCalendarPolicy.DAY,"EEE\nM/d")
                +(snapshot==null ? "\n\u672a\u8bfb" : "\n"+count+" \u6bb5"),false);
            NativeUi.decorateButton(button,i==selectedDay ? NativeUi.FOREST : NativeUi.MINT,
                i==selectedDay ? Color.WHITE : NativeUi.FOREST,Color.TRANSPARENT);
            button.setSelected(i==selectedDay); button.setTextSize(13);
            button.setOnClickListener(v->{if(!sameScope()){close();return;} selectedDay=day;visibleCount=100;render();});
            days.addView(button,new LinearLayout.LayoutParams(dp(activity.getResources().getConfiguration().fontScale>1.2f ? 110 : 86),-2));
        }
        summary.setText(date(start+selectedDay*WorkbenchCalendarPolicy.DAY,"M\u6708d\u65e5 EEEE")+" \u00b7 \u5df2\u8bfb\u90e8\u5206");
        if(snapshot==null) { timeline.addView(label("\u5c1a\u65e0\u53ef\u5c55\u793a\u7684\u5df2\u8bfb\u6570\u636e\u3002",14,NativeUi.MUTED,false)); return; }
        List<WorkbenchCalendarPolicy.Entry> entries=snapshot.day(selectedDay);
        if(entries.isEmpty()) timeline.addView(label(snapshot.complete()
            ? "\u672c\u671f\u5df2\u4fdd\u5b58\u7684\u6570\u636e\u4e2d\u6ca1\u6709\u8fd9\u4e00\u5929\u7684\u6761\u76ee\u3002\u91cd\u590d\u65e5\u7a0b\u751f\u6210\u8303\u56f4\u4ecd\u9700\u6838\u5bf9\u3002"
            : "\u5df2\u8bfb\u90e8\u5206\u6ca1\u6709\u8fd9\u4e00\u5929\u7684\u6761\u76ee\uff0c\u8bf7\u7ee7\u7eed\u8bfb\u53d6\uff0c\u4e0d\u80fd\u636e\u6b64\u5224\u65ad\u7a7a\u95f2\u3002",14,NativeUi.MUTED,false));
        for(int i=0;i<Math.min(visibleCount,entries.size());i++) addEntry(entries.get(i));
        if(entries.size()>visibleCount) {
            Button reveal=NativeUi.button(activity,"\u7ee7\u7eed\u663e\u793a\u672c\u65e5\u6761\u76ee\uff08\u5df2\u663e\u793a "+visibleCount+" / "+entries.size()+" \u6bb5\uff09",false);
            reveal.setOnClickListener(v->{if(!sameScope()){close();return;} visibleCount+=100;render();});
            timeline.addView(reveal);
        }
    }
    private void addEntry(WorkbenchCalendarPolicy.Entry entry) {
        LinearLayout card=NativeUi.column(activity);
        card.setPadding(dp(14),dp(12),dp(14),dp(12));
        card.setBackground(NativeUi.shape(activity,Color.WHITE,16,NativeUi.BORDER));
        LinearLayout.LayoutParams params=new LinearLayout.LayoutParams(-1,-2);
        params.setMargins(0,dp(10),0,dp(8)); timeline.addView(card,params);
        long start=snapshot.start+selectedDay*WorkbenchCalendarPolicy.DAY, end=start+WorkbenchCalendarPolicy.DAY;
        card.addView(label(date(Math.max(start,entry.start),"HH:mm")+" - "
            +(Math.min(end,entry.end)==end ? "24:00" : date(Math.min(end,entry.end),"HH:mm")),15,NativeUi.FOREST,true));
        TextView title=label(entry.title,17,NativeUi.INK,true); title.setTextIsSelectable(true); card.addView(title);
        card.addView(label(entry.category+" \u00b7 "+entry.status,12,NativeUi.MUTED,false));
        if(entry.start<start || entry.end>end) card.addView(label("\u8de8\u65e5\u5b89\u6392 \u00b7 \u539f\u65f6\u6bb5 "
            +date(entry.start,"M/d HH:mm")+" - "+date(entry.end,"M/d HH:mm"),11,NativeUi.MUTED,false));
        long planned=(entry.end-entry.start+59999L)/60000L;
        card.addView(label("\u6574\u6761\u8ba1\u5212\u7ea6 "+planned+" \u5206\u949f\uff1b"+(entry.actualMinutes>0
            ? "\u6574\u6761\u5df2\u8bb0\u5f55\u5b9e\u9645 "+entry.actualMinutes+" \u5206\u949f\uff08\u975e\u672c\u65e5\u7d2f\u8ba1\uff09\u3002" : "\u5c1a\u65e0\u5df2\u8bb0\u5f55\u7684\u5b9e\u9645\u7528\u65f6\u3002"),12,NativeUi.MUTED,false));
        if(!entry.place.isEmpty()) card.addView(label("\u5730\u70b9 \u00b7 "+entry.place,12,NativeUi.MUTED,false));
        if(!entry.note.isEmpty()) card.addView(label(entry.note,13,NativeUi.INK,false));
        if(!entry.reflection.isEmpty()) card.addView(label("\u6267\u884c\u56de\u987e \u00b7 "+entry.reflection,13,NativeUi.INK,false));
        if(!entry.interruption.isEmpty()) card.addView(label("\u4e2d\u65ad\u8bf4\u660e \u00b7 "+entry.interruption,12,NativeUi.ROSE,false));
    }
    private void openLegacy() {
        if(closed || loading || legacy!=null || !sameScope() || !host.readsAllowed()) return;
        dialog.hide();
        legacy=new NativeLegacyWeekSheet(activity,bridge,new NativeLegacyWeekSheet.Host() {
            @Override public String accountScope() { return host.accountScope(); }
            @Override public boolean readsAllowed() { return !closed && host.readsAllowed() && sameScope(); }
            @Override public void onAuthRequired() { close(); host.onAuthRequired(); }
            @Override public void onClosed() { legacy=null; if(!closed && sameScope()) dialog.show(); }
        });
        legacy.show();
    }
    void close() {
        if(closed) return;
        closed=true; loading=false; revision++;
        handler.removeCallbacks(staleTick); snapshot = null;
        if(legacy!=null) legacy.close();
        if(timeline!=null) timeline.removeAllViews();
        if(days!=null) days.removeAllViews();
        if(status!=null) status.setText("");
        if(coverage!=null) coverage.setText("");
        if(summary!=null) summary.setText("");
        if(range!=null) range.setText("");
        if(dialog!=null) dialog.dismiss();
        host.onClosed();
    }
}
