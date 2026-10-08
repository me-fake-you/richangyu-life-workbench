package com.richangyu.lifeworkbench;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.Context;
import android.content.SharedPreferences;
import android.widget.*;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.Date;
import java.util.UUID;

final class NativeWorkSheet {
    interface Host { boolean writesBlocked(); void onSaved(); void onAuthRequired(); void onClosed(); }
    private final Activity activity;
    private final MobileApiBridge api;
    private final Host host;
    private final String origin,scope;
    private final SharedPreferences prefs;
    private AlertDialog dialog,editor;
    private LinearLayout content;
    private TextView status;
    private JSONObject snapshot;
    private boolean busy,closed;
    NativeWorkSheet(Activity activity,MobileApiBridge api,String origin,String scope,Host host){
        this.activity=activity;this.api=api;this.origin=origin;this.scope=scope;this.host=host;
        prefs=activity.getSharedPreferences("native_workbench",Context.MODE_PRIVATE);
    }
    boolean isBusy(){return busy;}
    private String pending(){return prefs.getString("work_pending:"+scope,"");}
    private TextView label(String value,int size){return NativeUi.label(activity,value,size,NativeUi.INK,false);}
    private Button button(String value,boolean primary,Runnable action){
        Button button=NativeUi.button(activity,value,primary);button.setOnClickListener(v->action.run());return button;
    }
    private LinearLayout column(){return NativeUi.column(activity);}
    private LinearLayout card(){LinearLayout card=column();card.setPadding(NativeUi.dp(activity,16),NativeUi.dp(activity,16),NativeUi.dp(activity,16),NativeUi.dp(activity,16));return card;}
    private void notice(String value){Toast.makeText(activity,value,Toast.LENGTH_LONG).show();}
    private boolean canWrite(){
        if(closed||busy||snapshot==null||host.writesBlocked()||!pending().isEmpty()){
            notice("\u8bf7\u5148\u540c\u6b65\u6216\u6838\u5bf9\u4e0a\u4e00\u7b14\u64cd\u4f5c\uff0c\u518d\u8fdb\u884c\u65b0\u7684\u64cd\u4f5c\u3002");return false;
        }
        return true;
    }
    void show(){
        LinearLayout root=column();root.setPadding(NativeUi.dp(activity,20),NativeUi.dp(activity,16),NativeUi.dp(activity,20),NativeUi.dp(activity,16));root.setBackground(NativeUi.pageBackground());
        root.addView(label("\u517c\u804c\u4e0e\u7ed3\u7b97",25));
        root.addView(label("\u5de5\u65f6\u3001\u5f85\u6536\u4e0e\u5230\u8d26\u5206\u5f00\u8bb0\u5f55\uff1b\u7ed3\u675f\u5de5\u4f5c\u4e0d\u4f1a\u81ea\u52a8\u8bb0\u4e3a\u5230\u8d26\u3002",13));
        status=label("\u6b63\u5728\u8bfb\u53d6\u2026",13);root.addView(status);
        ScrollView scroll=new ScrollView(activity);content=column();scroll.addView(content);
        root.addView(scroll,new LinearLayout.LayoutParams(-1,0,1));
        root.addView(button("\u540c\u6b65\u517c\u804c\u6570\u636e",false,this::load));
        root.addView(button("\u5173\u95ed",false,()->{if(!busy)close();else notice("\u8bf7\u7b49\u5f85\u672c\u6b21\u8bf7\u6c42\u5b8c\u6210\u3002");}));
        dialog=new AlertDialog.Builder(activity).setView(root).create();dialog.setCancelable(false);dialog.show();
        if(dialog.getWindow()!=null)dialog.getWindow().setLayout(-1,Math.round(activity.getResources().getDisplayMetrics().heightPixels*.9f));
        load();
    }
    void close(){if(closed)return;closed=true;if(editor!=null)editor.dismiss();if(dialog!=null)dialog.dismiss();host.onClosed();}
    private void load(){
        if(busy||closed)return;busy=true;status.setText("\u6b63\u5728\u8bfb\u53d6\u517c\u804c\u6570\u636e\u2026");
        api.request("/api/mobile-actions",null,envelope->{
            busy=false;if(closed)return;
            try{
                int code=envelope.optInt("status");
                if(code==401||code==403){close();host.onAuthRequired();return;}
                if(code!=200||!WorkbenchOperationPolicy.expectedResponse(envelope.optString("url"),origin)||!WorkbenchNutritionPolicy.jsonType(envelope.optString("type")))throw new Exception();
                JSONObject next=new JSONObject(envelope.optString("body"));
                if(next.optJSONArray("projects")==null||next.optJSONArray("sessions")==null||next.optJSONArray("receivables")==null||next.optJSONArray("accounts")==null||!next.optBoolean("operationReceipts"))throw new Exception();
                snapshot=next;status.setText(pending().isEmpty()?"\u5df2\u540c\u6b65 \u00b7 \u672c\u6b21\u6700\u591a\u52a0\u8f7d 100 \u6761\u5de5\u65f6\u548c\u5e94\u6536":"\u6709\u4e00\u7b14\u64cd\u4f5c\u5f85\u6838\u5bf9\uff0c\u8bf7\u5148\u4f7f\u7528\u539f\u7f16\u53f7\u6838\u5bf9");
            }catch(Exception e){status.setText("\u672c\u6b21\u672a\u540c\u6b65\u6210\u529f\uff0c\u65e7\u6570\u636e\u4e0d\u4ee3\u8868\u5f53\u524d\u72b6\u6001\u3002\u8bf7\u68c0\u67e5\u8fde\u63a5\u6216\u670d\u52a1\u5668\u7248\u672c\u3002");snapshot=null;}
            render();
        });
    }
    private void render(){
        content.removeAllViews();
        if(!pending().isEmpty()){
            LinearLayout box=card();box.addView(label("\u4e0a\u6b21\u64cd\u4f5c\u7ed3\u679c\u5f85\u6838\u5bf9",18));
            box.addView(label("\u7f51\u7edc\u4e2d\u65ad\u4e0d\u4ee3\u8868\u6ca1\u4fdd\u5b58\u3002\u6838\u5bf9\u53ea\u91cd\u7528\u539f\u7f16\u53f7\uff0c\u670d\u52a1\u5668\u4e0d\u4f1a\u91cd\u590d\u521b\u5efa\u3002",13));
            box.addView(button("\u6838\u5bf9\u539f\u64cd\u4f5c",true,()->{
                if(busy||host.writesBlocked())return;
                new AlertDialog.Builder(activity).setTitle("\u6838\u5bf9\u539f\u64cd\u4f5c").setMessage("\u5c06\u53d1\u9001\u539f\u6765\u786e\u8ba4\u7684\u5185\u5bb9\u548c\u540c\u4e00\u4e2a\u64cd\u4f5c\u7f16\u53f7\u3002\u4e0d\u4f1a\u628a\u5f85\u7ed3\u7b97\u81ea\u52a8\u6539\u6210\u5230\u8d26\u3002")
                    .setNegativeButton("\u53d6\u6d88",null).setPositiveButton("\u5f00\u59cb\u6838\u5bf9",(d,w)->{try{send(new JSONObject(pending()));}catch(Exception e){notice("\u539f\u64cd\u4f5c\u8bfb\u53d6\u5931\u8d25\uff0c\u672a\u8fdb\u884c\u4fdd\u5b58\u3002");}}).show();
            }));content.addView(box);
        }
        if(snapshot==null){content.addView(label("\u8fde\u63a5\u6210\u529f\u540e\u663e\u793a\u4f60\u7684\u9879\u76ee\u3001\u5de5\u65f6\u4e0e\u5e94\u6536\u3002",15));return;}
        JSONArray sessions=snapshot.optJSONArray("sessions"),receivables=snapshot.optJSONArray("receivables");
        double outstanding=0;long minutes=0;
        for(int i=0;i<receivables.length();i++){JSONObject r=receivables.optJSONObject(i);if(!"\u5df2\u53d6\u6d88".equals(r.optString("status")))outstanding+=Math.max(0,r.optDouble("amountDue")-r.optDouble("amountReceived"));}
        for(int i=0;i<sessions.length();i++)minutes+=sessions.optJSONObject(i).optInt("minutes");
        LinearLayout overview=card();overview.setBackground(NativeUi.shape(activity,NativeUi.MINT,18));
        overview.addView(label("\u5df2\u52a0\u8f7d\u5f85\u6536 \u00a5"+WorkbenchOperationPolicy.moneyLabel(outstanding),23));
        overview.addView(label("\u5df2\u5b8c\u6210\u5de5\u65f6 "+minutes+" \u5206\u949f \u00b7 \u4e0d\u7b49\u4e8e\u5df2\u5230\u8d26\u6536\u5165",13));content.addView(overview);
        content.addView(button("\u65b0\u5efa\u517c\u804c\u9879\u76ee",false,this::newProject));
        content.addView(label("\u5de5\u4f5c\u8ba1\u65f6",19));
        boolean active=false;
        for(int i=0;i<sessions.length();i++){
            JSONObject session=sessions.optJSONObject(i);
            if(!"\u8fdb\u884c\u4e2d".equals(session.optString("status"))&&!"\u6682\u505c".equals(session.optString("status")))continue;
            active=true;LinearLayout box=card();box.addView(label(session.optString("projectTitle")+" \u00b7 "+session.optString("status"),18));
            box.addView(label("\u4ece "+session.optString("startedAt")+" \u5f00\u59cb",13));
            box.addView(button("\u7ed3\u675f\u5e76\u751f\u6210\u5f85\u7ed3\u7b97",true,()->finish(session)));content.addView(box);
        }
        if(!active)content.addView(button("\u5f00\u59cb\u4e00\u6bb5\u517c\u804c",true,this::start));
        content.addView(label("\u5e94\u6536\u4e0e\u5230\u8d26",19));
        if(receivables.length()==0)content.addView(label("\u7ed3\u675f\u517c\u804c\u540e\u4f1a\u5728\u8fd9\u91cc\u751f\u6210\u5f85\u7ed3\u7b97\uff0c\u4e0d\u4f1a\u81ea\u52a8\u7b97\u4f5c\u5df2\u5230\u8d26\u3002",14));
        for(int i=0;i<receivables.length();i++){
            JSONObject r=receivables.optJSONObject(i);LinearLayout box=card();
            box.addView(label(r.optString("projectTitle")+" \u00b7 "+r.optString("status"),18));
            box.addView(label("\u5e94\u6536 \u00a5"+WorkbenchOperationPolicy.moneyLabel(r.optDouble("amountDue"))+" / \u5df2\u5230\u8d26 \u00a5"+WorkbenchOperationPolicy.moneyLabel(r.optDouble("amountReceived")),14));
            if(!"\u5df2\u53d6\u6d88".equals(r.optString("status"))&&r.optDouble("amountDue")>r.optDouble("amountReceived"))box.addView(button("\u786e\u8ba4\u6536\u5230\u6b3e\u9879",false,()->receive(r)));
            content.addView(box);
        }
        content.addView(label("\u6700\u8fd1\u5b8c\u6210",19));
        int shown=0;
        for(int i=0;i<sessions.length()&&shown<10;i++){
            JSONObject s=sessions.optJSONObject(i);if(!"\u5df2\u5b8c\u6210".equals(s.optString("status")))continue;shown++;
            content.addView(label(s.optString("projectTitle")+" \u00b7 "+s.optInt("minutes")+" \u5206\u949f \u00b7 \u5e94\u6536 \u00a5"+WorkbenchOperationPolicy.moneyLabel(s.optDouble("expectedIncome")),14));
        }
    }
    private EditText input(LinearLayout form,String hint,boolean number){
        form.addView(label(hint,14));EditText field=new EditText(activity);NativeUi.styleInput(field);
        field.setInputType(number?android.text.InputType.TYPE_CLASS_NUMBER|android.text.InputType.TYPE_NUMBER_FLAG_DECIMAL:android.text.InputType.TYPE_CLASS_TEXT);
        field.setFilters(new android.text.InputFilter[]{new android.text.InputFilter.LengthFilter(number?16:1000)});form.addView(field);return field;
    }
    private Spinner select(LinearLayout form,String[] labels){
        Spinner spinner=new Spinner(activity);spinner.setAdapter(new ArrayAdapter<>(activity,android.R.layout.simple_spinner_dropdown_item,labels));form.addView(spinner);return spinner;
    }
    private AlertDialog form(String title,LinearLayout form,Runnable submit){
        ScrollView scroll=new ScrollView(activity);scroll.addView(form);
        AlertDialog current=new AlertDialog.Builder(activity).setTitle(title).setView(scroll).setNegativeButton("\u53d6\u6d88",null).setPositiveButton("\u4e0b\u4e00\u6b65\u6838\u5bf9",null).create();
        editor=current;current.setOnShowListener(d->current.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v->submit.run()));current.show();return current;
    }
    private void newProject(){
        if(!canWrite())return;LinearLayout form=card();EditText title=input(form,"\u9879\u76ee\u540d\u79f0",false);
        Spinner mode=select(form,new String[]{"\u6309\u5c0f\u65f6","\u6309\u6b21"});EditText rate=input(form,"\u5355\u4ef7\uff08\u5143\uff09",true);rate.setText("0");
        form("\u65b0\u5efa\u517c\u804c\u9879\u76ee",form,()->{try{
            String name=title.getText().toString().trim();if(name.isEmpty()){title.setError("\u8bf7\u586b\u5199\u540d\u79f0");return;}
            double value=WorkbenchOperationPolicy.money(rate.getText().toString());
            confirm("project.create",new JSONObject().put("title",name).put("billingMode",mode.getSelectedItem().toString()).put("unitRate",value),
                name+" \u00b7 "+mode.getSelectedItem()+" \u00a5"+WorkbenchOperationPolicy.moneyLabel(value));
        }catch(Exception e){rate.setError("\u8bf7\u8f93\u5165\u6709\u6548\u975e\u8d1f\u91d1\u989d\uff0c\u6700\u591a\u4e24\u4f4d\u5c0f\u6570");}});
    }
    private void start(){
        if(!canWrite())return;JSONArray projects=snapshot.optJSONArray("projects");java.util.List<JSONObject> available=new java.util.ArrayList<>();
        for(int i=0;i<projects.length();i++){JSONObject p=projects.optJSONObject(i);if("\u8fdb\u884c\u4e2d".equals(p.optString("status")))available.add(p);}
        if(available.isEmpty()){notice("\u8bf7\u5148\u65b0\u5efa\u4e00\u4e2a\u517c\u804c\u9879\u76ee\u3002");newProject();return;}
        LinearLayout form=card();String[] labels=new String[available.size()];for(int i=0;i<labels.length;i++)labels[i]=available.get(i).optString("title");
        Spinner project=select(form,labels);EditText note=input(form,"\u51c6\u5907\u505a\u4ec0\u4e48\uff1f",false);
        form("\u5f00\u59cb\u517c\u804c",form,()->{try{
            JSONObject selected=available.get(project.getSelectedItemPosition());
            confirm("work.start",new JSONObject().put("projectId",selected.optString("id")).put("startedAt",WorkbenchNutritionPolicy.iso(new Date())).put("workContent",note.getText().toString()),
                selected.optString("title")+"\n\u5f00\u59cb\u8bb0\u5f55\u5de5\u4f5c\u65f6\u95f4\uff0c\u4e0d\u4ea7\u751f\u6536\u5165\u8d26\u76ee\u3002");
        }catch(Exception e){notice("\u65e0\u6cd5\u51c6\u5907\u8ba1\u65f6");}});
    }
    private void finish(JSONObject session){
        if(!canWrite())return;Date started=WorkbenchNutritionPolicy.instant(session.optString("startedAt"));if(started==null){notice("\u5f00\u59cb\u65f6\u95f4\u65e0\u6548\uff0c\u8bf7\u5148\u6838\u5bf9\u670d\u52a1\u5668\u8bb0\u5f55\u3002");return;}
        Date ended=new Date();long pause=session.optLong("pausedMinutes");
        if("\u6682\u505c".equals(session.optString("status"))){Date paused=WorkbenchNutritionPolicy.instant(session.optString("pausedAt"));if(paused!=null)pause+=Math.max(0,Math.round((ended.getTime()-paused.getTime())/60000.0));}
        long minutes=Math.max(1,Math.round((ended.getTime()-started.getTime())/60000.0)-pause);
        LinearLayout form=card();form.addView(label(session.optString("projectTitle")+" \u00b7 \u7ea6 "+minutes+" \u5206\u949f",17));
        EditText expected=input(form,"\u8fd9\u6b21\u5e94\u6536\u91d1\u989d\uff08\u672a\u5230\u8d26\uff0c\u53ef\u4fee\u6539\uff09",true);
        expected.setText(WorkbenchOperationPolicy.moneyLabel(WorkbenchOperationPolicy.expected(session.optString("billingMode"),session.optDouble("unitRate"),minutes)));
        EditText result=input(form,"\u5b8c\u6210\u4e86\u4ec0\u4e48\uff1f",false);result.setText(session.optString("workContent"));
        form("\u7ed3\u675f\u517c\u804c\u5e76\u751f\u6210\u5e94\u6536",form,()->{try{
            double value=WorkbenchOperationPolicy.money(expected.getText().toString());
            confirm("work.finish",new JSONObject().put("id",session.optString("id")).put("endedAt",WorkbenchNutritionPolicy.iso(ended)).put("expectedIncome",value).put("workContent",result.getText().toString()),
                "\u7ed3\u675f "+session.optString("projectTitle")+"\n\u5e94\u6536 \u00a5"+WorkbenchOperationPolicy.moneyLabel(value)+"\uff0c\u672a\u5230\u8d26\u3002\n\u91d1\u989d\u6765\u81ea\u4f60\u7684\u786e\u8ba4\uff0c\u4e0d\u4f1a\u81ea\u52a8\u8bb0\u4e3a\u6536\u5165\u3002");
        }catch(Exception e){expected.setError("\u8bf7\u8f93\u5165\u6709\u6548\u975e\u8d1f\u91d1\u989d");}});
    }
    private void receive(JSONObject receivable){
        if(!canWrite())return;JSONArray accounts=snapshot.optJSONArray("accounts");if(accounts.length()==0){notice("\u8bf7\u5148\u5728\u8d22\u52a1\u4e2d\u5fc3\u914d\u7f6e\u6536\u6b3e\u8d26\u6237\u3002");return;}
        LinearLayout form=card();EditText paid=input(form,"\u672c\u6b21\u5b9e\u9645\u5230\u8d26\u91d1\u989d\uff08\u5143\uff09",true);
        double remaining=receivable.optDouble("amountDue")-receivable.optDouble("amountReceived");paid.setText(WorkbenchOperationPolicy.moneyLabel(remaining));
        String[] labels=new String[accounts.length()];for(int i=0;i<labels.length;i++)labels[i]=accounts.optJSONObject(i).optString("name");
        Spinner account=select(form,labels);
        form("\u786e\u8ba4\u5b9e\u9645\u5230\u8d26",form,()->{try{
            double value=WorkbenchOperationPolicy.money(paid.getText().toString());if(value<=0||value>remaining){paid.setError("\u4e0d\u80fd\u5927\u4e8e\u5269\u4f59\u5e94\u6536\uff0c\u4e14\u5fc5\u987b\u5927\u4e8e 0");return;}
            JSONObject selected=accounts.optJSONObject(account.getSelectedItemPosition());
            confirm("receivable.receive",new JSONObject().put("receivableId",receivable.optString("id")).put("expectedReceived",receivable.optDouble("amountReceived")).put("amount",value).put("accountId",selected.optString("id")).put("receivedAt",WorkbenchNutritionPolicy.iso(new Date())),
                receivable.optString("projectTitle")+"\n\u5df2\u5b9e\u9645\u6536\u5230 \u00a5"+WorkbenchOperationPolicy.moneyLabel(value)+"\uff0c\u8bb0\u5165 "+selected.optString("name")+"\u3002\n\u786e\u8ba4\u540e\u4f1a\u4ea7\u751f\u4e00\u7b14\u771f\u5b9e\u6536\u5165\u8bb0\u5f55\u3002");
        }catch(Exception e){paid.setError("\u8bf7\u8f93\u5165\u6709\u6548\u91d1\u989d");}});
    }
    private void confirm(String action,JSONObject values,String summary){
        if(!canWrite())return;
        new AlertDialog.Builder(activity).setTitle("\u6838\u5bf9\u540e\u518d\u4fdd\u5b58").setMessage(summary)
            .setNegativeButton("\u8fd4\u56de\u4fee\u6539",null).setPositiveButton("\u786e\u8ba4\u4fdd\u5b58",(d,w)->{
                if(!canWrite())return;
                try{
                    JSONObject request=new JSONObject().put("requestId",UUID.randomUUID().toString()).put("action",action).put("payload",values);
                    if(!prefs.edit().putString("work_pending:"+scope,request.toString()).commit()){notice("\u672c\u673a\u672a\u4fdd\u5b58\u64cd\u4f5c\u7f16\u53f7\uff0c\u6ca1\u6709\u8054\u7f51\u63d0\u4ea4\u3002");return;}
                    if(editor!=null)editor.dismiss();send(request);
                }catch(Exception e){notice("\u65e0\u6cd5\u51c6\u5907\u64cd\u4f5c");}
            }).show();
    }
    private void send(JSONObject request){
        if(busy||closed||host.writesBlocked())return;busy=true;status.setText("\u6b63\u5728\u4fdd\u5b58\uff0c\u8bf7\u7b49\u5f85\u56de\u6267\u2026");
        api.request("/api/mobile-actions",request,envelope->{
            busy=false;if(closed)return;
            try{
                int code=envelope.optInt("status");JSONObject receipt=new JSONObject(envelope.optString("body"));
                boolean expected=WorkbenchOperationPolicy.expectedResponse(envelope.optString("url"),origin)&&WorkbenchNutritionPolicy.jsonType(envelope.optString("type"));
                if(expected&&code>=200&&code<300&&request.optString("requestId").equals(receipt.optString("requestId"))&&!receipt.optString("id").isEmpty()&&!receipt.has("error")){
                    if(!prefs.edit().remove("work_pending:"+scope).commit())throw new Exception();
                    notice(receipt.optBoolean("alreadyApplied")?"\u5df2\u6838\u5bf9\u539f\u64cd\u4f5c\uff0c\u6ca1\u6709\u91cd\u590d\u8bb0\u8d26\u3002":"\u5df2\u4fdd\u5b58\uff1b\u5f85\u6536\u4e0e\u5230\u8d26\u72b6\u6001\u5df2\u66f4\u65b0\u3002");host.onSaved();load();return;
                }
                if(expected&&code>=400&&code<500){
                    prefs.edit().remove("work_pending:"+scope).commit();status.setText("\u672a\u4fdd\u5b58\uff1a"+receipt.optString("error")+"\uff1b\u8bf7\u91cd\u65b0\u540c\u6b65\u540e\u6838\u5bf9\u3002");load();return;
                }
            }catch(Exception ignored){}
            status.setText("\u7ed3\u679c\u5f85\u6838\u5bf9\uff0c\u4fdd\u7559\u539f\u7f16\u53f7\uff0c\u4e0d\u81ea\u52a8\u91cd\u53d1\u3002");render();
        });
    }
}
