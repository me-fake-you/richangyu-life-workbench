package com.richangyu.lifeworkbench;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;

/** Explicit, non-exported alarm receiver. Performs no network calls or cloud writes. */
public final class ScheduleReminderReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context, Intent intent) {
        if (intent == null || !NativeScheduleReminders.ACTION_FIRE.equals(intent.getAction())) return;
        Uri data = intent.getData();
        if (data == null || !"workbench-reminder".equals(data.getScheme()) || !"local".equals(data.getHost())) return;
        try {
            new NativeScheduleReminders(context).fire(data.getLastPathSegment(), intent.getStringExtra("token"));
        } catch (RuntimeException ignored) { }
    }
}
