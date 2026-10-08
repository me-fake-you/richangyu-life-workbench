package com.richangyu.lifeworkbench;

import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.webkit.WebView;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.Collections;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

/** Uses the authorized page session without extracting cookies or embedding API keys. */
final class MobileApiBridge {
    interface Callback { void complete(JSONObject envelope); }
    private static final String OBJECT_NAME = "RichangyuMobileResponse";
    private final String origin;
    private final Uri expectedOrigin;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Map<String, Pending> pending = new HashMap<>();
    private WebView webView;
    private boolean closed;

    private static final class Pending {
        final Callback callback;
        final Runnable timeout;
        final String endpoint;
        final String photoKey;
        Pending(Callback callback, Runnable timeout, String endpoint, String photoKey) {
            this.callback = callback; this.timeout = timeout; this.endpoint = endpoint; this.photoKey = photoKey;
        }
    }
    MobileApiBridge(String origin) { this.origin = origin; this.expectedOrigin = Uri.parse(origin); }
    boolean matchesOrigin(Uri value) {
        return value != null && "https".equalsIgnoreCase(value.getScheme())
            && expectedOrigin.getHost().equalsIgnoreCase(value.getHost())
            && (value.getPort() == -1 || value.getPort() == 443) && value.getUserInfo() == null;
    }
    boolean attach(WebView view) {
        if (closed || !WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) return false;
        if (webView == view) return true;
        webView = view;
        WebViewCompat.addWebMessageListener(view, OBJECT_NAME, Collections.singleton(origin),
            (source, message, sourceOrigin, isMainFrame, replyProxy) -> {
                if (closed || source != webView || !isMainFrame || !matchesOrigin(sourceOrigin)) return;
                String raw = message.getData();
                if (raw == null || raw.length() > 1048576) return;
                try {
                    JSONObject envelope = new JSONObject(raw);
                    Pending request = pending.remove(envelope.optString("requestId"));
                    if (request == null) return;
                    handler.removeCallbacks(request.timeout);
                    clearPhoto(request.photoKey);
                    envelope.remove("requestId");
                    request.callback.complete(envelope);
                } catch (Exception ignored) { }
            });
        return true;
    }
    void request(JSONObject payload, Callback callback) { request("/api/mobile", payload, callback); }
    void request(String endpoint, JSONObject payload, Callback callback) {
        requestInternal(endpoint, payload, false, callback);
    }
    void requestNutritionMeal(JSONObject fields, Callback callback) {
        requestNutritionMeal(fields, null, callback);
    }
    void requestNutritionMeal(JSONObject fields, NativeNutritionPhotoPicker.Photo photo, Callback callback) {
        if (fields == null || (photo != null && !WorkbenchNutritionPhotoPolicy.validJpeg(photo.jpeg))) {
            callback.complete(error(400, "餐食或照片字段无效。", "/api/nutrition")); return;
        }
        java.util.Iterator<String> keys = fields.keys();
        while (keys.hasNext()) {
            if (!WorkbenchNutritionPolicy.allowsMealField(keys.next())) {
                callback.complete(error(400, "餐食字段不被允许。", "/api/nutrition")); return;
            }
        }
        requestInternal("/api/nutrition", fields, true, photo, callback);
    }
    private void requestInternal(String endpoint, JSONObject payload, boolean multipart, Callback callback) {
        requestInternal(endpoint, payload, multipart, null, callback);
    }
    private void requestInternal(String endpoint, JSONObject payload, boolean multipart,
            NativeNutritionPhotoPicker.Photo photo, Callback callback) {
        if (!WorkbenchClientPolicy.allowsEndpoint(endpoint, payload != null)
                || (photo != null && (!multipart || !"/api/nutrition".equals(endpoint)))) {
            callback.complete(error(400, "不允许访问这个工作台接口。", "/api/mobile")); return;
        }
        if (closed || webView == null || !matchesOrigin(Uri.parse(webView.getUrl() == null ? "" : webView.getUrl()))) {
            callback.complete(error(401, "请先在应用内连接工作台。", endpoint)); return;
        }
        String id = UUID.randomUUID().toString();
        String photoKey = photo == null ? "" : "__richangyuMealPhoto_" + id.replace("-", "");
        boolean generation = payload != null && "/api/assistant".equals(endpoint)
            && ("chat".equals(payload.optString("action")) || "plan".equals(payload.optString("action")));
        boolean visionCheck = payload != null && "/api/nutrition".equals(endpoint) && "vision.check".equals(payload.optString("action"));
        Runnable timeout = () -> finishError(id, visionCheck ? "图片连接检查超时，本次没有保存餐食。" : generation ? "AI 整理超时，尚未保存，请稍后重试。"
            : payload == null ? "连接超时，请检查网络后重试。"
            : "保存响应超时，结果尚不确定。请先同步核对，不要直接重复保存。");
        pending.put(id, new Pending(callback, timeout, endpoint, photoKey));
        handler.postDelayed(timeout, generation ? 260000 : photo != null || visionCheck ? WorkbenchNutritionPhotoPolicy.RESPONSE_TIMEOUT_MS : 32000);
        String options = payload == null
            ? "{method:'GET',headers:{Accept:'application/json'},credentials:'include',cache:'no-store',signal:controller.signal}"
            : "{method:'POST',headers:{Accept:'application/json','Content-Type':'application/json'},credentials:'include',cache:'no-store',signal:controller.signal,body:"
                + JSONObject.quote(payload.toString()) + "}";
        if (multipart) {
            String image = photo == null ? "" :
                "const key=" + JSONObject.quote(photoKey) + ";const image=window[key];"
                + "if(!image||typeof image.encoded!=='string')throw new Error('photo-not-ready');"
                + "const binary=atob(image.encoded);const bytes=new Uint8Array(binary.length);"
                + "for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);"
                + "form.append('photo',new Blob([bytes],{type:'image/jpeg'}),'meal.jpg');delete window[key];";
            String form = "(()=>{const data=JSON.parse(" + JSONObject.quote(payload.toString())
                + ");const form=new FormData();for(const [key,value] of Object.entries(data))form.append(key,String(value));"
                + image + "return form;})()";
            options = "{method:'POST',headers:{Accept:'application/json'},credentials:'include',cache:'no-store',signal:controller.signal,body:" + form + "}";
        }
        String script = "(()=>{if(location.origin!==" + JSONObject.quote(origin)
            + "||!window." + OBJECT_NAME + ")return 'not-ready';const id=" + JSONObject.quote(id)
            + ";const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),"
            + (generation ? 250000 : photo != null || visionCheck ? WorkbenchNutritionPhotoPolicy.FETCH_TIMEOUT_MS : 25000) + ");"
            + "const send=envelope=>window." + OBJECT_NAME + ".postMessage(JSON.stringify({...envelope,requestId:id}));"
            + "try{fetch(" + JSONObject.quote(endpoint) + "," + options + ").then(async response=>{const body=await response.text();"
            + "if(body.length>1000000)throw new Error('response-too-large');"
            + "send({status:response.status,type:response.headers.get('content-type')||'',url:response.url,body});})"
            + ".catch(()=>send({status:0,type:'application/json',url:location.origin+" + JSONObject.quote(endpoint) + ","
            + "body:JSON.stringify({error:'网络或登录连接中断；如正在保存，请先同步核对结果。'})}))"
            + ".finally(()=>clearTimeout(timer));return 'queued';}catch(e){clearTimeout(timer);return 'not-ready';}})()";
        Runnable submit = () -> {
            if (closed || webView == null || !pending.containsKey(id)) return;
            try {
                webView.evaluateJavascript(script, raw -> {
                    if (!pending.containsKey(id)) return;
                    try {
                        if (!"queued".equals(new JSONArray("[" + raw + "]").optString(0))) finishError(id, "授权连接尚未就绪，请重新连接工作台。");
                    } catch (Exception ignored) { finishError(id, "无法启动工作台请求，请重新连接。"); }
                });
            } catch (Exception ignored) { finishError(id, "无法启动工作台请求，请先同步核对。"); }
        };
        if (photo == null) { submit.run(); return; }
        try {
            webView.evaluateJavascript("(()=>{if(location.origin!==" + JSONObject.quote(origin)
                + ")return false;window[" + JSONObject.quote(photoKey) + "]={encoded:''};return true;})()", raw -> {
                    if (!pending.containsKey(id)) return;
                    if (!"true".equals(raw)) { finishError(id, "照片准备连接已变化，未能确认保存。"); return; }
                    appendPhoto(id, photoKey, photo.base64, 0, submit);
                });
        } catch (Exception ignored) { finishError(id, "无法准备照片请求，请先同步核对。"); }
    }
    private void appendPhoto(String id, String key, String encoded, int offset, Runnable submit) {
        if (closed || webView == null || !pending.containsKey(id)) return;
        if (offset == encoded.length()) { submit.run(); return; }
        int end = Math.min(encoded.length(), offset + WorkbenchNutritionPhotoPolicy.CHUNK_CHARS);
        String chunk = encoded.substring(offset, end);
        try {
            webView.evaluateJavascript("(()=>{if(location.origin!==" + JSONObject.quote(origin)
                + ")return false;const data=window[" + JSONObject.quote(key)
                + "];if(!data||typeof data.encoded!=='string')return false;data.encoded+=" + JSONObject.quote(chunk)
                + ";return true;})()", raw -> {
                    if (!pending.containsKey(id)) return;
                    if (!"true".equals(raw)) { finishError(id, "照片准备中断，请先同步核对，不要重复提交。"); return; }
                    appendPhoto(id, key, encoded, end, submit);
                });
        } catch (Exception ignored) { finishError(id, "照片准备中断，请先同步核对。"); }
    }
    private void clearPhoto(String key) {
        if (key.isEmpty() || webView == null) return;
        try {
            webView.evaluateJavascript("if(location.origin===" + JSONObject.quote(origin)
                + "){delete window[" + JSONObject.quote(key) + "];}", null);
        } catch (Exception ignored) {}
    }
    void cancelPending() {
        Map<String, Pending> interrupted = new HashMap<>(pending);
        pending.clear();
        for (Pending request : interrupted.values()) {
            handler.removeCallbacks(request.timeout);
            clearPhoto(request.photoKey);
            request.callback.complete(error(0, "连接页面已切换；如正在保存，请重新同步核对结果。", request.endpoint));
        }
    }
    private void finishError(String id, String message) {
        Pending request = pending.remove(id);
        if (request == null || closed) return;
        handler.removeCallbacks(request.timeout);
        clearPhoto(request.photoKey);
        request.callback.complete(error(0, message, request.endpoint));
    }
    private JSONObject error(int status, String message, String endpoint) {
        JSONObject envelope = new JSONObject();
        try {
            envelope.put("status", status); envelope.put("type", "application/json");
            envelope.put("url", origin + endpoint);
            envelope.put("body", new JSONObject().put("error", message).toString());
        } catch (Exception ignored) { }
        return envelope;
    }
    void close() {
        closed = true;
        for (Pending request : pending.values()) {
            handler.removeCallbacks(request.timeout); clearPhoto(request.photoKey);
        }
        pending.clear();
        if (webView != null) WebViewCompat.removeWebMessageListener(webView, OBJECT_NAME);
        webView = null;
    }
}
