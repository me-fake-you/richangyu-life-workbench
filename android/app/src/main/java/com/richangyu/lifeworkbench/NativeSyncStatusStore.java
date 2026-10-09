package com.richangyu.lifeworkbench;
import android.content.Context;
import android.content.SharedPreferences;

/** Account-scoped local receipt timestamps only. Never stores event content, IDs or credentials. */
final class NativeSyncStatusStore {
    private final SharedPreferences prefs;
    NativeSyncStatusStore(Context context) {
        prefs=context.getApplicationContext().getSharedPreferences("native_workbench",Context.MODE_PRIVATE);
    }
    void received(String scope,long timestamp) {
        if (!WorkbenchSyncPolicy.validScope(scope) || timestamp <= 0) return;
        if (!prefs.edit().putLong("receipt_time:"+scope,timestamp).commit())
            throw new IllegalStateException("Receipt timestamp was not persisted");
    }
    long lastReceipt(String scope,long now) {
        if (!WorkbenchSyncPolicy.validScope(scope)) return 0;
        try {
            long value=prefs.getLong("receipt_time:"+scope,0);
            return WorkbenchSyncPolicy.usableReceiptTime(value,now) ? value : 0;
        } catch (RuntimeException ignored) { return 0; }
    }
}
