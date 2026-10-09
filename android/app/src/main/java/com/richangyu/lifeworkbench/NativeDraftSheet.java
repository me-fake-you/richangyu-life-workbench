package com.richangyu.lifeworkbench;
import android.app.Activity;
import android.app.AlertDialog;
import android.widget.*;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

final class NativeDraftSheet {
    interface Host { boolean connected(); void onSaved(); void onClosed(); void onRefresh(); void onAuthRequired(); }
    private final Activity activity;
    private final MobileApiBridge api;
    private final NativeDraftStore store;
    private final Host host;
    private final String origin;
    private final Set<String> confirmedThisSession=new HashSet<>();
    private AlertDialog dialog;
    private LinearLayout content;
    private boolean busy,closed;
    private String activeRequestId="";
    NativeDraftSheet(Activity activity,MobileApiBridge api,String origin,NativeDraftStore store,Host host){
        this.activity=activity;this.api=api;this.origin=origin;this.store=store;this.host=host;
    }
    boolean isBusy(){return busy;}
    private Button button(String value,Runnable action){
        Button button=NativeUi.button(activity,value,false);button.setOnClickListener(v->action.run());return button;
    }
    void show(){
        content=NativeUi.column(activity);
        content.setPadding(NativeUi.dp(activity,20),NativeUi.dp(activity,12),NativeUi.dp(activity,20),NativeUi.dp(activity,20));
        ScrollView scroll=new ScrollView(activity);scroll.addView(content);
        dialog=new AlertDialog.Builder(activity).setTitle("\u672c\u673a\u8349\u7a3f").setView(scroll)
            .setNegativeButton("\u5173\u95ed",(d,w)->close()).create();
        dialog.setOnCancelListener(d->close());dialog.show();render();
    }
    void close(){if(closed)return;closed=true;if(dialog!=null)dialog.dismiss();host.onClosed();}
    private void notice(String value){Toast.makeText(activity,value,Toast.LENGTH_LONG).show();}
    private String displayState(JSONObject row,String id) {
        return confirmedThisSession.contains(id) ? "confirmed" : row.optString("state");
    }
    private boolean canSubmit(String id) throws Exception {
        if(confirmedThisSession.contains(id))return false;
        JSONArray rows=store.list();
        for(int i=0;i<rows.length();i++){
            JSONObject row=rows.getJSONObject(i);
            if(id.equals(row.getJSONObject("request").optString("requestId")))
                return WorkbenchSyncPolicy.canSubmit(row.optString("state"));
        }
        return false;
    }
    private void render(){
        if(closed)return;
        content.removeAllViews();
        content.addView(NativeUi.label(activity,"\u672c\u673a\u4fdd\u5b58\u4e0d\u7b49\u4e8e\u4e91\u7aef\u4fdd\u5b58\u3002\u6062\u590d\u8fde\u63a5\u4e5f\u4e0d\u4f1a\u81ea\u52a8\u63d0\u4ea4\uff1b\u9010\u6761\u6838\u5bf9\u540e\uff0c\u624d\u7528\u539f\u64cd\u4f5c\u7f16\u53f7\u63d0\u4ea4\u3002",14,NativeUi.MUTED,false));
        content.addView(NativeUi.label(activity,busy?"\u6b63\u5728\u63d0\u4ea4\u4e00\u6761\u8349\u7a3f\uff0c\u7b49\u5f85\u6709\u6548\u56de\u6267\u3002"
            :host.connected()?"\u5df2\u8fde\u63a5\u5f53\u524d\u5de5\u4f5c\u53f0\u4e0e\u8d26\u53f7\uff0c\u53ef\u9010\u6761\u786e\u8ba4\u3002":"\u5f53\u524d\u4e0d\u80fd\u63d0\u4ea4\uff0c\u53ef\u67e5\u770b\u6216\u4fdd\u7559\u672c\u673a\u8349\u7a3f\u3002",13,busy?NativeUi.FOREST:NativeUi.MUTED,true));
        Button refresh=button("\u5173\u95ed\u8349\u7a3f\u5e76\u5237\u65b0 / \u767b\u5f55",()->{if(busy)return;close();host.onRefresh();});
        refresh.setEnabled(!busy);content.addView(refresh);
        try{
            JSONArray stored=store.list();
            List<JSONObject> rows=new ArrayList<>();
            List<String> states=new ArrayList<>();
            for(int i=0;i<stored.length();i++){
                JSONObject row=stored.getJSONObject(i),request=row.getJSONObject("request");
                request.getJSONObject("payload");
                String id=request.getString("requestId");
                rows.add(row);states.add(displayState(row,id));
            }
            WorkbenchSyncPolicy.Summary count=WorkbenchSyncPolicy.summarize(states);
            content.addView(NativeUi.label(activity,"\u4ec5\u672c\u673a "+count.local+"   \u8bf7\u6c42\u88ab\u62d2\u7edd "+count.rejected
                +"\n\u5f85\u6838\u5bf9 "+count.uncertain+"   \u56de\u6267\u5df2\u786e\u8ba4 "+count.confirmed,13,NativeUi.FOREST,true));
            if(rows.isEmpty())content.addView(NativeUi.label(activity,"\u6ca1\u6709\u5f85\u5904\u7406\u7684\u672c\u673a\u8349\u7a3f\u3002",17,NativeUi.INK,false));
            java.util.Collections.sort(rows,(a,b)->Integer.compare(WorkbenchSyncPolicy.priority(displayState(a,a.optJSONObject("request").optString("requestId"))),
                WorkbenchSyncPolicy.priority(displayState(b,b.optJSONObject("request").optString("requestId")))));
            for(JSONObject row:rows){
                JSONObject request=row.getJSONObject("request"),p=request.getJSONObject("payload");
                String id=request.getString("requestId"),state=displayState(row,id);
                boolean confirmed=!WorkbenchSyncPolicy.canSubmit(state);
                LinearLayout card=NativeUi.column(activity);
                card.setPadding(NativeUi.dp(activity,14),NativeUi.dp(activity,16),NativeUi.dp(activity,14),NativeUi.dp(activity,16));
                card.setBackground(NativeUi.shape(activity,NativeUi.PAPER,18,NativeUi.BORDER));
                LinearLayout.LayoutParams params=new LinearLayout.LayoutParams(-1,-2);
                params.setMargins(0,NativeUi.dp(activity,12),0,0);card.setLayoutParams(params);
                String kind="schedule.create".equals(request.optString("action"))?"\u65e5\u7a0b":"inbox.create".equals(request.optString("action"))?"\u6536\u4ef6\u7bb1":"\u751f\u6d3b\u8bb0\u5f55";
                String title=busy&&id.equals(activeRequestId)?"\u6b63\u5728\u7b49\u5f85\u56de\u6267":WorkbenchSyncPolicy.title(state);
                card.addView(NativeUi.label(activity,kind+" \u00b7 "+title,17,NativeUi.INK,true));
                card.addView(NativeUi.label(activity,WorkbenchSyncPolicy.hint(state),12,
                    "uncertain".equals(state)||"rejected".equals(state)?NativeUi.ROSE:NativeUi.MUTED,false));
                String detail=p.optString("title")+"\n"+p.optString("content")+"\n"+p.optString("startAt")+" "+p.optString("place");
                TextView text=NativeUi.label(activity,detail.trim(),14,NativeUi.MUTED,false);
                text.setPadding(0,NativeUi.dp(activity,8),0,0);card.addView(text);
                long created=row.optLong("createdAt");
                if(created>0){
                    java.text.SimpleDateFormat format=new java.text.SimpleDateFormat("M\u6708d\u65e5 HH:mm",java.util.Locale.CHINA);
                    format.setTimeZone(java.util.TimeZone.getTimeZone("Asia/Shanghai"));
                    card.addView(NativeUi.label(activity,"\u5b58\u5165\u672c\u673a\uff1a"+format.format(new java.util.Date(created))+"\uff08\u5317\u4eac\u65f6\u95f4\uff09",11,NativeUi.MUTED,false));
                }
                if(!confirmed){
                    Button send=button("queued".equals(state)?"\u6838\u5bf9\u5e76\u63d0\u4ea4":"\u6838\u5bf9\u5e76\u91cd\u8bd5\u539f\u64cd\u4f5c",()->confirm(row));
                    send.setEnabled(!busy&&host.connected());card.addView(send);
                }else card.addView(NativeUi.label(activity,"\u4e0d\u518d\u63d0\u4ea4\uff0c\u53ea\u9700\u6e05\u7406\u672c\u673a\u526f\u672c\u3002",13,NativeUi.FOREST,true));
                Button discard=button(confirmed?"\u6e05\u7406\u5df2\u786e\u8ba4\u7684\u672c\u673a\u526f\u672c":"\u5220\u9664\u672c\u673a\u8349\u7a3f",()->{
                    if(busy)return;
                    new AlertDialog.Builder(activity).setTitle("\u4ec5\u5220\u9664\u672c\u673a\u526f\u672c\uff1f")
                        .setMessage("\u4e0d\u4f1a\u5220\u9664\u4e91\u7aef\u5185\u5bb9\u3002\u5f85\u6838\u5bf9\u7684\u64cd\u4f5c\u53ef\u80fd\u5df2\u7ecf\u4fdd\u5b58\uff1b\u5220\u9664\u540e\u4f1a\u5931\u53bb\u539f\u64cd\u4f5c\u7f16\u53f7\uff0c\u4e0d\u8981\u91cd\u65b0\u91cd\u590d\u6dfb\u52a0\u3002")
                        .setNegativeButton("\u4fdd\u7559",null).setPositiveButton("\u5220\u9664\u672c\u673a\u526f\u672c",(d,w)->{
                            if(busy||closed)return;
                            try{store.remove(id);render();}catch(Exception e){notice("\u672c\u673a\u6e05\u7406\u672a\u5b8c\u6210\uff0c\u8bf7\u4fdd\u7559\u5185\u5bb9\u5e76\u91cd\u8bd5\u3002");}
                        }).show();
                });discard.setEnabled(!busy);card.addView(discard);content.addView(card);
            }
        }catch(Exception e){content.addView(NativeUi.label(activity,"\u8349\u7a3f\u8bfb\u53d6\u5931\u8d25\uff0c\u6ca1\u6709\u8986\u76d6\u672c\u673a\u6570\u636e\uff0c\u4e5f\u4e0d\u80fd\u5c06\u5b83\u5f53\u4f5c 0 \u6761\u3002",14,NativeUi.ROSE,false));}
    }
    private void confirm(JSONObject draft){
        if(busy||!host.connected()){notice("\u8bf7\u5148\u5b8c\u6210\u672c\u5de5\u4f5c\u53f0\u3001\u540c\u4e00\u8d26\u53f7\u7684\u8fde\u63a5\u3002");return;}
        try{
            if(!canSubmit(draft.getJSONObject("request").getString("requestId"))){
                notice("\u8fd9\u4efd\u672c\u673a\u8349\u7a3f\u5df2\u53d8\u5316\u6216\u56de\u6267\u5df2\u786e\u8ba4\uff0c\u8bf7\u91cd\u65b0\u67e5\u770b\uff0c\u4e0d\u4f1a\u518d\u6b21\u63d0\u4ea4\u3002");render();return;
            }
        }catch(Exception error){notice("\u672c\u673a\u8349\u7a3f\u65e0\u6cd5\u6838\u5bf9\uff0c\u672a\u63d0\u4ea4\u3002");return;}
        new AlertDialog.Builder(activity).setTitle("\u786e\u8ba4\u63d0\u4ea4\u8fd9\u6761\u8349\u7a3f")
            .setMessage("\u5148\u6838\u5bf9\u5185\u5bb9\u662f\u5426\u5df2\u7ecf\u4fdd\u5b58\u3002\u5c06\u4f7f\u7528\u539f\u64cd\u4f5c\u7f16\u53f7\u63d0\u4ea4\uff0c\u670d\u52a1\u5668\u4f1a\u6838\u5bf9\u540c\u4e00\u7f16\u53f7\uff1b\u4e0d\u4f1a\u6539\u7528\u65b0\u7f16\u53f7\u6216\u81ea\u52a8\u8fde\u7eed\u91cd\u8bd5\u3002")
            .setNegativeButton("\u518d\u770b\u770b",null).setPositiveButton("\u786e\u8ba4\u63d0\u4ea4",(d,w)->send(draft)).show();
    }
    private void send(JSONObject draft){
        if(busy||!host.connected())return;
        try{
            JSONObject request=draft.getJSONObject("request");String id=request.getString("requestId");
            if(!canSubmit(id)){notice("\u672c\u673a\u72b6\u6001\u5df2\u53d8\u5316\uff0c\u672a\u518d\u6b21\u63d0\u4ea4\u3002");render();return;}
            store.state(id,"uncertain");busy=true;activeRequestId=id;
            dialog.setCancelable(false);dialog.getButton(AlertDialog.BUTTON_NEGATIVE).setEnabled(false);render();
            api.request("/api/mobile-actions",request,envelope->{
                busy=false;activeRequestId="";if(closed)return;
                dialog.setCancelable(true);dialog.getButton(AlertDialog.BUTTON_NEGATIVE).setEnabled(true);
                try{
                    int status=envelope.optInt("status");
                    boolean expected=WorkbenchOperationPolicy.expectedResponse(envelope.optString("url"),origin)
                        &&WorkbenchNutritionPolicy.jsonType(envelope.optString("type"));
                    if(expected&&(status==401||status==403)){
                        notice("\u6388\u6743\u9700\u8981\u91cd\u65b0\u786e\u8ba4\uff1b\u539f\u8349\u7a3f\u4e0e\u64cd\u4f5c\u7f16\u53f7\u5df2\u4fdd\u7559\uff0c\u7ed3\u679c\u4ecd\u9700\u6838\u5bf9\u3002");
                        close();host.onAuthRequired();return;
                    }
                    JSONObject receipt=new JSONObject(envelope.optString("body"));
                    if(expected&&status>=200&&status<300&&id.equals(receipt.optString("requestId"))
                        &&!receipt.optString("id").isEmpty()&&!receipt.has("error")){
                        confirmedThisSession.add(id);
                        try{
                            store.state(id,"confirmed");
                            store.remove(id);
                            notice(receipt.optBoolean("alreadyApplied")?"\u5df2\u6838\u5bf9\uff1a\u6b64\u524d\u5df2\u7ecf\u4fdd\u5b58\uff0c\u6ca1\u6709\u91cd\u590d\u521b\u5efa\u3002":"\u6709\u6548\u4fdd\u5b58\u56de\u6267\u5df2\u6536\u5230\uff0c\u672c\u673a\u8349\u7a3f\u5df2\u6e05\u7406\u3002");
                        }catch(Exception localError){
                            notice("\u4e91\u7aef\u56de\u6267\u5df2\u786e\u8ba4\uff0c\u4f46\u672c\u673a\u6e05\u7406\u672a\u5b8c\u6210\u3002\u4e0d\u4f1a\u518d\u6b21\u63d0\u4ea4\uff0c\u8bf7\u53ea\u6e05\u7406\u672c\u673a\u526f\u672c\u3002");
                        }
                        host.onSaved();
                    }else if(expected&&status>=400&&status<500&&receipt.has("error")){
                        store.state(id,"rejected");
                        notice("\u672c\u6b21\u8bf7\u6c42\u88ab\u62d2\u7edd\u3002\u5148\u68c0\u67e5\u767b\u5f55\u548c\u539f\u5185\u5bb9\uff1b\u8fd9\u4e0d\u4ee3\u8868\u6b64\u524d\u4ece\u672a\u4fdd\u5b58\uff0c\u539f\u64cd\u4f5c\u7f16\u53f7\u5df2\u4fdd\u7559\u3002");
                    }else notice("\u7ed3\u679c\u4ecd\u5f85\u6838\u5bf9\uff0c\u4fdd\u7559\u539f\u64cd\u4f5c\u7f16\u53f7\uff1b\u4e0d\u4f1a\u81ea\u52a8\u91cd\u53d1\u3002");
                }catch(Exception e){notice("\u56de\u6267\u6216\u672c\u673a\u66f4\u65b0\u672a\u5b8c\u6210\uff0c\u4fdd\u7559\u539f\u64cd\u4f5c\u7f16\u53f7\u4f9b\u6838\u5bf9\u3002");}
                render();
            });
        }catch(Exception e){
            busy=false;activeRequestId="";
            if(dialog!=null){dialog.setCancelable(true);dialog.getButton(AlertDialog.BUTTON_NEGATIVE).setEnabled(true);}
            notice(e.getMessage()==null?"\u672a\u80fd\u63d0\u4ea4\uff0c\u8bf7\u5148\u6838\u5bf9\u672c\u673a\u72b6\u6001\u3002":e.getMessage());render();
        }
    }
}
