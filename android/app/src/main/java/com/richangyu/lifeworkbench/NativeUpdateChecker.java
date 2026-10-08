package com.richangyu.lifeworkbench;

import android.content.Context;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** User-initiated public metadata lookup. No account data, download, or installation. */
final class NativeUpdateChecker {
    interface Callback {
        void complete(WorkbenchReleasePolicy.Candidate candidate, String error);
    }
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final Handler main = new Handler(Looper.getMainLooper());
    private volatile int revision;
    private volatile boolean closed;
    private volatile HttpURLConnection active;

    void check(String installedVersion, Callback callback) {
        if (closed) return;
        cancel();
        final int request = revision;
        executor.execute(() -> {
            WorkbenchReleasePolicy.Candidate candidate = null;
            String error = null;
            HttpURLConnection connection = null;
            try {
                WorkbenchReleasePolicy.Version installed = WorkbenchReleasePolicy.version(installedVersion);
                if (installed == null) throw new Exception("\u65e0\u6cd5\u8bc6\u522b\u5f53\u524d\u7248\u672c\uff0c\u8bf7\u4ece\u5b98\u65b9\u53d1\u5e03\u9875\u67e5\u770b\u3002");
                connection = (HttpURLConnection) new URL(WorkbenchReleasePolicy.RELEASES_API).openConnection();
                synchronized (this) {
                    if (closed || request != revision) { connection.disconnect(); return; }
                    active = connection;
                }
                connection.setInstanceFollowRedirects(false);
                connection.setConnectTimeout(8000);
                connection.setReadTimeout(10000);
                connection.setRequestProperty("Accept", "application/vnd.github+json");
                connection.setRequestProperty("X-GitHub-Api-Version", "2022-11-28");
                connection.setRequestProperty("User-Agent", "RichangyuAndroidPreview");
                int status = connection.getResponseCode();
                if (status == 403 || status == 429) throw new Exception("\u7248\u672c\u670d\u52a1\u6682\u65f6\u9650\u6d41\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u6216\u6253\u5f00\u5b98\u65b9\u53d1\u5e03\u9875\u3002");
                if (status != 200) throw new Exception("\u7248\u672c\u68c0\u67e5\u672a\u6210\u529f\uff08" + status + "\uff09\uff0c\u8fd9\u4e0d\u4ee3\u8868\u5df2\u7ecf\u662f\u6700\u65b0\u7248\u3002");
                ByteArrayOutputStream bytes = new ByteArrayOutputStream();
                try (InputStream input = connection.getInputStream()) {
                    byte[] buffer = new byte[8192];
                    int count;
                    while ((count = input.read(buffer)) != -1) {
                        if (closed || request != revision) return;
                        if (bytes.size() + count > 1048576) throw new Exception("\u7248\u672c\u4fe1\u606f\u8fc7\u5927\uff0c\u5df2\u505c\u6b62\u8bfb\u53d6\u3002");
                        bytes.write(buffer, 0, count);
                    }
                }
                JSONArray releases = new JSONArray(new String(bytes.toByteArray(), StandardCharsets.UTF_8));
                boolean incompleteNewer = false;
                for (int i = 0; i < Math.min(releases.length(), 20); i++) {
                    JSONObject release = releases.optJSONObject(i);
                    if (release == null) continue;
                    String tag = release.optString("tag_name");
                    if (!WorkbenchReleasePolicy.previewRelease(tag, release.optBoolean("draft", true),
                            release.optBoolean("prerelease", false))) continue;
                    WorkbenchReleasePolicy.Version version = WorkbenchReleasePolicy.version(tag.substring(1));
                    if (version.compareTo(installed) <= 0) continue;
                    String page = release.optString("html_url");
                    if (!WorkbenchReleasePolicy.releasePage(tag).equals(page)) { incompleteNewer = true; continue; }
                    JSONArray assets = release.optJSONArray("assets");
                    JSONObject apk = null;
                    if (assets != null) for (int a = 0; a < assets.length(); a++) {
                        JSONObject asset = assets.optJSONObject(a);
                        if (asset != null && "uploaded".equals(asset.optString("state"))
                                && WorkbenchReleasePolicy.validAsset(tag, asset.optString("name"),
                                asset.optString("browser_download_url"), asset.optLong("size"), asset.optString("digest"))) {
                            apk = asset; break;
                        }
                    }
                    if (apk == null) { incompleteNewer = true; continue; }
                    String body = release.optString("body", "");
                    String packageName = WorkbenchReleasePolicy.marker(body, "package");
                    if (!packageName.isEmpty() && !WorkbenchReleasePolicy.PREVIEW_PACKAGE.equals(packageName)) {
                        incompleteNewer = true; continue;
                    }
                    WorkbenchReleasePolicy.Candidate next = new WorkbenchReleasePolicy.Candidate(tag, page,
                        packageName, WorkbenchReleasePolicy.marker(body, "certificate-sha256"),
                        apk.optString("digest").substring(7), WorkbenchReleasePolicy.versionCode(body),
                        apk.optLong("size"), "persistent".equals(WorkbenchReleasePolicy.marker(body, "signing")));
                    if (candidate == null || next.version.compareTo(candidate.version) > 0) candidate = next;
                }
                if (candidate == null && incompleteNewer) throw new Exception("\u53d1\u73b0\u8f83\u65b0\u53d1\u5e03\uff0c\u4f46\u5b89\u88c5\u5305\u4fe1\u606f\u4e0d\u5b8c\u6574\uff0c\u6682\u4e0d\u80fd\u786e\u8ba4\u53ef\u66f4\u65b0\u3002\u8bf7\u67e5\u770b\u5b98\u65b9\u53d1\u5e03\u9875\u3002");
            } catch (Exception failure) {
                error = failure.getMessage();
                if (error == null || error.isEmpty()) error = "\u7248\u672c\u68c0\u67e5\u5931\u8d25\uff0c\u8bf7\u68c0\u67e5\u7f51\u7edc\u540e\u91cd\u8bd5\u3002";
            } finally {
                if (connection != null) connection.disconnect();
                synchronized (this) { if (active == connection) active = null; }
            }
            final WorkbenchReleasePolicy.Candidate result = candidate;
            final String problem = error;
            main.post(() -> { if (!closed && request == revision) callback.complete(result, problem); });
        });
    }

    synchronized void cancel() {
        revision++;
        if (active != null) { active.disconnect(); active = null; }
    }
    void close() { closed = true; cancel(); executor.shutdownNow(); }

    static long installedVersionCode(Context context) {
        try {
            PackageInfo info = context.getPackageManager().getPackageInfo(context.getPackageName(), 0);
            return Build.VERSION.SDK_INT >= 28 ? info.getLongVersionCode() : info.versionCode;
        } catch (Exception error) { return 0; }
    }
    @SuppressWarnings("deprecation")
    static String installedCertificate(Context context) {
        try {
            PackageManager manager = context.getPackageManager();
            Signature[] signers;
            if (Build.VERSION.SDK_INT >= 28) {
                PackageInfo info = manager.getPackageInfo(context.getPackageName(), PackageManager.GET_SIGNING_CERTIFICATES);
                signers = info.signingInfo == null ? null : info.signingInfo.getApkContentsSigners();
            } else {
                signers = manager.getPackageInfo(context.getPackageName(), PackageManager.GET_SIGNATURES).signatures;
            }
            if (signers == null || signers.length != 1) return null;
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(signers[0].toByteArray());
            StringBuilder value = new StringBuilder();
            for (byte b : digest) value.append(String.format(Locale.ROOT, "%02x", b & 0xff));
            return value.toString();
        } catch (Exception error) { return null; }
    }
}
