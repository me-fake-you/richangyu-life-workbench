package com.richangyu.lifeworkbench;
import android.app.Activity;
import android.app.AlertDialog;
import android.widget.*;
import org.json.JSONArray;
import org.json.JSONObject;

final class NativeDraftSheet {
    interface Host { boolean connected(); void onSaved(); void onClosed(); }
    private final Activity activity;
    private final MobileApiBridge api;
    private final NativeDraftStore store;
    private final Host host;
    private final String origin;
    private AlertDialog dialog;
    private LinearLayout content;
    private boolean busy,closed;
    NativeDraftSheet(Activity activity,MobileApiBridge api,String origin,NativeDraftStore store,Host host){
        this.activity=activity;this.api=api;this.origin=origin;this.store=store;this.host=host;
    }
    boolean isBusy(){return busy;}
    private Button button(String value,Runnable action){
        Button button=NativeUi.button(activity,value,false);button.setOnClickListener(v->action.run());return button;
    }
    void show(){
        content=NativeUi.column(activity);content.setPadding(NativeUi.dp(activity,24),NativeUi.dp(activity,16),NativeUi.dp(activity,24),NativeUi.dp(activity,16));
        ScrollView scroll=new ScrollView(activity);scroll.addView(content);
        dialog=new AlertDialog.Builder(activity).setTitle("\u672c\u673a\u8349\u7a3f").setView(scroll)
            .setNegativeButton("\u5173\u95ed",(d,w)->close()).create();
        dialog.setOnCancelListener(d->close());dialog.show();render();
    }
    void close(){if(closed)return;closed=true;if(dialog!=null)dialog.dismiss();host.onClosed();}
    private void notice(String value){Toast.makeText(activity,value,Toast.LENGTH_LONG).show();}
    private void render(){
        if(closed)return;
        content.removeAllViews();
        content.addView(NativeUi.label(activity,"\u672c\u673a\u4fdd\u5b58\u4e0d\u7b49\u4e8e\u4e91\u7aef\u4fdd\u5b58\u3002\u4e0d\u4f1a\u81ea\u52a8\u63d0\u4ea4\uff1b\u6062\u590d\u8fde\u63a5\u540e\uff0c\u9010\u6761\u6838\u5bf9\u5e76\u786e\u8ba4\u3002\u76f8\u540c\u64cd\u4f5c\u7f16\u53f7\u53ef\u5b89\u5168\u6838\u5bf9\uff0c\u4e0d\u80fd\u4fee\u6539\u540e\u5192\u5145\u539f\u64cd\u4f5c\u3002",14,NativeUi.MUTED,false));
        try{
            JSONArray rows=store.list();
            if(rows.length()==0)content.addView(NativeUi.label(activity,"\u6ca1\u6709\u5f85\u5904\u7406\u7684\u672c\u673a\u8349\u7a3f\u3002",17,NativeUi.INK,false));
            for(int i=0;i<rows.length();i++){
                JSONObject row=rows.getJSONObject(i),request=row.getJSONObject("request"),p=request.getJSONObject("payload");
                String id=request.getString("requestId"),state=row.optString("state");
                LinearLayout card=NativeUi.column(activity);card.setPadding(12,20,12,20);
                String kind="schedule.create".equals(request.optString("action"))?"\u65e5\u7a0b":"inbox.create".equals(request.optString("action"))?"\u6536\u4ef6\u7bb1":"\u751f\u6d3b\u8bb0\u5f55";
                card.addView(NativeUi.label(activity,kind+" \u00b7 "+("queued".equals(state)?"\u5c1a\u672a\u63d0\u4ea4":"\u7ed3\u679c\u5f85\u6838\u5bf9"),17,NativeUi.INK,true));
                String detail=p.optString("title")+"\n"+p.optString("content")+("\n"+p.optString("startAt")+" "+p.optString("place"));
                card.addView(NativeUi.label(activity,detail.trim(),14,NativeUi.MUTED,false));
                Button send=button("queued".equals(state)?"\u6838\u5bf9\u5e76\u63d0\u4ea4":"\u6838\u5bf9\u5e76\u91cd\u8bd5\u539f\u64cd\u4f5c",()->confirm(row));send.setEnabled(!busy&&host.connected());card.addView(send);
                Button discard=button("\u5220\u9664\u672c\u673a\u8349\u7a3f",()->{
                    if(busy)return;
                    new AlertDialog.Builder(activity).setTitle("\u4ec5\u5220\u9664\u672c\u673a\u8349\u7a3f\uff1f").setMessage("\u4e0d\u4f1a\u5220\u9664\u4e91\u7aef\u5185\u5bb9\u3002\u7ed3\u679c\u5f85\u6838\u5bf9\u7684\u64cd\u4f5c\u53ef\u80fd\u5df2\u7ecf\u4fdd\u5b58\uff0c\u8bf7\u5148\u786e\u8ba4\uff1b\u5220\u9664\u540e\u5931\u53bb\u539f\u64cd\u4f5c\u7f16\u53f7\uff0c\u4e0d\u8981\u91cd\u65b0\u91cd\u590d\u6dfb\u52a0\u3002")
                        .setNegativeButton("\u4fdd\u7559",null).setPositiveButton("\u5220\u9664\u672c\u673a\u526f\u672c",(d,w)->{
                            try{store.remove(id);render();}catch(Exception e){notice(e.getMessage());}
                        }).show();
                });discard.setEnabled(!busy);card.addView(discard);content.addView(card);
            }
        }catch(Exception e){content.addView(NativeUi.label(activity,"\u8349\u7a3f\u8bfb\u53d6\u5931\u8d25\uff0c\u6ca1\u6709\u8986\u76d6\u672c\u673a\u6570\u636e\u3002",14,NativeUi.ROSE,false));}
    }
    private void confirm(JSONObject draft){
        if(busy||!host.connected()){notice("\u8bf7\u5148\u5b8c\u6210\u672c\u5de5\u4f5c\u53f0\u3001\u540c\u4e00\u8d26\u53f7\u7684\u8fde\u63a5\u3002");return;}
        new AlertDialog.Builder(activity).setTitle("\u786e\u8ba4\u63d0\u4ea4\u8fd9\u6761\u8349\u7a3f").setMessage("\u5c06\u4f7f\u7528\u539f\u64cd\u4f5c\u7f16\u53f7\u63d0\u4ea4\u3002\u4e0d\u4f1a\u4fee\u6539\u5176\u4ed6\u8bb0\u5f55\uff1b\u5373\u4f7f\u4e0a\u6b21\u54cd\u5e94\u4e22\u5931\uff0c\u670d\u52a1\u5668\u4e5f\u4f1a\u6838\u5bf9\u540c\u4e00\u4e2a\u7f16\u53f7\u3002")
            .setNegativeButton("\u518d\u770b\u770b",null).setPositiveButton("\u786e\u8ba4\u63d0\u4ea4",(d,w)->send(draft)).show();
    }
    private void send(JSONObject draft){
        if(busy||!host.connected())return;
        try{
            JSONObject request=draft.getJSONObject("request");String id=request.getString("requestId");
            store.state(id,"uncertain");busy=true;dialog.setCancelable(false);dialog.getButton(AlertDialog.BUTTON_NEGATIVE).setEnabled(false);render();
            api.request("/api/mobile-actions",request,envelope->{
                busy=false;if(closed)return;
                dialog.setCancelable(true);dialog.getButton(AlertDialog.BUTTON_NEGATIVE).setEnabled(true);
                try{
                    int status=envelope.optInt("status");JSONObject receipt=new JSONObject(envelope.optString("body"));
                    boolean expected=WorkbenchOperationPolicy.expectedResponse(envelope.optString("url"),origin)&&WorkbenchNutritionPolicy.jsonType(envelope.optString("type"));
                    if(expected&&status>=200&&status<300&&id.equals(receipt.optString("requestId"))&&!receipt.optString("id").isEmpty()&&!receipt.has("error")){
                        store.remove(id);notice(receipt.optBoolean("alreadyApplied")?"\u5df2\u6838\u5bf9\uff1a\u6b64\u524d\u5df2\u7ecf\u4fdd\u5b58\uff0c\u6ca1\u6709\u91cd\u590d\u521b\u5efa\u3002":"\u5df2\u4fdd\u5b58\u5230\u4e91\u7aef\u3002");host.onSaved();
                    }else if(expected&&status>=400&&status<500){store.state(id,"queued");notice("\u672a\u4fdd\u5b58\uff1a"+receipt.optString("error"));}
                    else notice("\u7ed3\u679c\u4ecd\u5f85\u6838\u5bf9\uff0c\u4fdd\u7559\u4e86\u539f\u64cd\u4f5c\u7f16\u53f7\uff1b\u4e0d\u4f1a\u81ea\u52a8\u91cd\u53d1\u3002");
                }catch(Exception e){notice("\u56de\u6267\u6216\u672c\u673a\u66f4\u65b0\u672a\u5b8c\u6210\uff0c\u4fdd\u7559\u539f\u64cd\u4f5c\u7f16\u53f7\u4f9b\u6838\u5bf9\u3002");}
                render();
            });
        }catch(Exception e){busy=false;notice(e.getMessage());}
    }
}
