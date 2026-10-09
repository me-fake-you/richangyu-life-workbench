package com.richangyu.lifeworkbench;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** System-only recovery, enabled only while the user has armed local reminders. */
public final class ScheduleReminderRestoreReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context, Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        if (!Intent.ACTION_BOOT_COMPLETED.equals(action) && !Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)
            && !Intent.ACTION_TIME_CHANGED.equals(action) && !Intent.ACTION_TIMEZONE_CHANGED.equals(action)) return;
        try { new NativeScheduleReminders(context).restore(); }
        catch (RuntimeException ignored) { }
    }
}
