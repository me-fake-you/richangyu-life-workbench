package com.richangyu.lifeworkbench;
import android.content.Context;
import android.content.SharedPreferences;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.UUID;

/** App-private drafts, partitioned by both authenticated account and workbench. Never auto-send. */
final class NativeDraftStore {
    private final SharedPreferences prefs;
    private final String scope;
    NativeDraftStore(Context context,String scope) {
        this.prefs=context.getSharedPreferences("native_workbench",Context.MODE_PRIVATE);
        this.scope=scope==null?"":scope;
    }
    String scope() { return scope; }
    JSONArray list() {
        if(scope.isEmpty()) return new JSONArray();
        try { return new JSONArray(prefs.getString("drafts:"+scope,"[]")); }
        catch(Exception ignored) { throw new IllegalStateException("\u672c\u673a\u8349\u7a3f\u65e0\u6cd5\u8bfb\u53d6\uff0c\u4e0d\u4f1a\u7528\u7a7a\u5217\u8868\u8986\u76d6\u3002"); }
    }
    JSONObject add(JSONObject payload) throws Exception {
        if(scope.isEmpty() || !WorkbenchOperationPolicy.draftAction(payload.optString("action"))) throw new IllegalArgumentException("\u5c1a\u672a\u786e\u8ba4\u8d26\u53f7\u6216\u4e0d\u652f\u6301\u6b64\u8349\u7a3f\u7c7b\u578b\u3002");
        JSONArray drafts=list();
        if(drafts.length()>=30) throw new IllegalArgumentException("\u672c\u673a\u5df2\u6709 30 \u6761\u8349\u7a3f\uff0c\u8bf7\u5148\u5904\u7406\u540e\u518d\u6dfb\u52a0\u3002");
        JSONObject values=new JSONObject(payload.toString()); String action=values.optString("action");
        values.remove("action");values.remove("deviceId");
        JSONObject request=new JSONObject().put("requestId",UUID.randomUUID().toString()).put("action",action).put("payload",values);
        JSONObject draft=new JSONObject().put("request",request).put("createdAt",System.currentTimeMillis()).put("state","queued");
        drafts.put(draft); persist(drafts); return draft;
    }
    void state(String id,String state) throws Exception {
        JSONArray list=list();
        for(int i=0;i<list.length();i++) {
            JSONObject row=list.getJSONObject(i);
            if(id.equals(row.getJSONObject("request").optString("requestId")))row.put("state",state);
        }
        persist(list);
    }
    void remove(String id) throws Exception {
        JSONArray rows=list(),next=new JSONArray();
        for(int i=0;i<rows.length();i++) {
            JSONObject row=rows.getJSONObject(i);
            if(!id.equals(row.getJSONObject("request").optString("requestId")))next.put(row);
        }
        persist(next);
    }
    private void persist(JSONArray rows) {
        if(!prefs.edit().putString("drafts:"+scope,rows.toString()).commit())throw new IllegalStateException("\u672c\u673a\u8349\u7a3f\u4fdd\u5b58\u5931\u8d25\uff0c\u5c1a\u672a\u8054\u7f51\u63d0\u4ea4\u3002");
    }
}
