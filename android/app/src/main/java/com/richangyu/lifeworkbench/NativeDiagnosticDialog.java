package com.richangyu.lifeworkbench;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.graphics.Typeface;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

/** Preview first; writes only to the clipboard after an explicit user tap. */
final class NativeDiagnosticDialog {
    private NativeDiagnosticDialog() {}

    static String appVersion(Activity activity) {
        try { return activity.getPackageManager().getPackageInfo(activity.getPackageName(), 0).versionName; }
        catch (Exception ignored) { return "unknown"; }
    }

    static AlertDialog show(Activity activity, String report, Runnable onDismiss) {
        if (activity.isFinishing() || activity.isDestroyed()) return null;
        int pad = NativeUi.dp(activity, 18);
        LinearLayout panel = NativeUi.column(activity);
        panel.setPadding(pad, pad, pad, pad);
        panel.setBackground(NativeUi.pageBackground());
        TextView hint = NativeUi.label(activity,
            "\u8fd9\u662f\u6253\u5f00\u65f6\u7684\u72b6\u6001\u5feb\u7167\uff0c\u4ec5\u5305\u542b\u7248\u672c\u548c\u56fa\u5b9a\u72b6\u6001\u3002\u4e0d\u5305\u542b\u8d26\u53f7\u3001\u7f51\u5740\u3001\u5bc6\u94a5\u3001\u7167\u7247\u6216\u8bb0\u5f55\u3002\u590d\u5236\u4e0d\u4f1a\u8054\u7f51\uff1b\u7531\u4f60\u9009\u62e9\u53d1\u9001\u5bf9\u8c61\u3002",
            13, NativeUi.MUTED, false);
        hint.setPadding(0, 0, 0, NativeUi.dp(activity, 12));
        panel.addView(hint);
        TextView text = NativeUi.label(activity, report, 12, NativeUi.INK, false);
        text.setTypeface(Typeface.MONOSPACE);
        text.setTextIsSelectable(true);
        text.setPadding(pad, pad, pad, pad);
        text.setBackground(NativeUi.shape(activity, NativeUi.PAPER, 16, NativeUi.BORDER));
        ScrollView scroll = new ScrollView(activity);
        scroll.addView(text);
        int height = Math.min(NativeUi.dp(activity, 340),
            (int) (activity.getResources().getDisplayMetrics().heightPixels * 0.5f));
        panel.addView(scroll, new LinearLayout.LayoutParams(-1, height));
        AlertDialog dialog = new AlertDialog.Builder(activity)
            .setTitle("\u9884\u89c8\u8bca\u65ad\u4fe1\u606f")
            .setView(panel)
            .setNegativeButton("\u5173\u95ed", null)
            .setPositiveButton("\u590d\u5236\u8bca\u65ad\u4fe1\u606f", null).create();
        dialog.setOnDismissListener(d -> { if (onDismiss != null) onDismiss.run(); });
        dialog.show();
        dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v -> {
            try {
                ClipboardManager clipboard = (ClipboardManager) activity.getSystemService(Context.CLIPBOARD_SERVICE);
                if (clipboard == null) {
                    Toast.makeText(activity, "\u6682\u65f6\u65e0\u6cd5\u8bbf\u95ee\u526a\u8d34\u677f\u3002", Toast.LENGTH_LONG).show();
                    return;
                }
                clipboard.setPrimaryClip(ClipData.newPlainText("Richangyu diagnostics", report));
                Toast.makeText(activity, "\u5df2\u590d\u5236\uff0c\u53ef\u624b\u52a8\u53d1\u9001\u7ed9\u7ef4\u62a4\u8005\u3002", Toast.LENGTH_LONG).show();
                dialog.dismiss();
            } catch (RuntimeException ignored) {
                Toast.makeText(activity, "\u590d\u5236\u5931\u8d25\uff0c\u53ef\u7a0d\u540e\u91cd\u8bd5\u3002", Toast.LENGTH_LONG).show();
            }
        });
        return dialog;
    }
}
