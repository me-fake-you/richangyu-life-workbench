package com.richangyu.lifeworkbench;

import android.animation.ValueAnimator;
import android.content.Context;
import android.content.res.ColorStateList;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.Typeface;
import android.graphics.drawable.Drawable;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.RippleDrawable;
import android.graphics.drawable.StateListDrawable;
import android.os.Build;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

/** Shared native surfaces, typography, and vector drawing; no web content or network dependencies. */
final class NativeUi {
    static final int INK = 0xFF203D34;
    static final int MUTED = 0xFF69756F;
    static final int FOREST = 0xFF235844;
    static final int PAPER = 0xFFF7F5EF;
    static final int MINT = 0xFFE5EFE7;
    static final int AMBER = 0xFFE5AE6F;
    static final int BLUE = 0xFF627F98;
    static final int ROSE = 0xFFAC716B;
    static final int BORDER = 0xFFE3E7DD;
    static final Typeface BODY = Typeface.create("sans-serif", Typeface.NORMAL);
    static final Typeface MEDIUM = Typeface.create("sans-serif-medium", Typeface.NORMAL);
    static final Typeface DISPLAY = Typeface.create("serif", Typeface.BOLD);

    private NativeUi() { }
    static int dp(Context context, int value) {
        return Math.round(value * context.getResources().getDisplayMetrics().density);
    }
    static int alpha(int color, int amount) {
        return (color & 0x00FFFFFF) | (amount << 24);
    }
    static GradientDrawable shape(Context context, int color, int radius, int border) {
        GradientDrawable shape = new GradientDrawable();
        shape.setColor(color);
        shape.setCornerRadius(dp(context, radius));
        if (border != Color.TRANSPARENT) shape.setStroke(dp(context, 1), border);
        return shape;
    }
    static GradientDrawable shape(Context context, int color, int radius) {
        return shape(context, color, radius, Color.TRANSPARENT);
    }
    static GradientDrawable pageBackground() {
        return new GradientDrawable(GradientDrawable.Orientation.TL_BR,
            new int[] { PAPER, 0xFFF0F4EC, 0xFFF9F7F1 });
    }
    static GradientDrawable focusBackground(Context context) {
        GradientDrawable shape = new GradientDrawable(GradientDrawable.Orientation.TL_BR,
            new int[] { 0xFF294F3F, 0xFF193A2E });
        shape.setCornerRadius(dp(context, 24));
        return shape;
    }
    static Drawable touch(Context context, int color, int radius, int border) {
        return new RippleDrawable(ColorStateList.valueOf(alpha(FOREST, 28)),
            shape(context, color, radius, border), shape(context, Color.WHITE, radius));
    }
    static LinearLayout column(Context context) {
        LinearLayout view = new LinearLayout(context);
        view.setOrientation(LinearLayout.VERTICAL);
        return view;
    }
    static TextView label(Context context, String value, int size, int color, boolean bold) {
        TextView view = new TextView(context);
        view.setText(value);
        view.setTextSize(size);
        view.setTextColor(color);
        view.setTypeface(bold ? MEDIUM : BODY);
        view.setLineSpacing(0, 1.2f);
        return view;
    }
    static TextView badge(Context context, String value, int fill, int ink) {
        TextView view = label(context, value, 12, ink, true);
        view.setPadding(dp(context, 10), dp(context, 5), dp(context, 10), dp(context, 5));
        view.setBackground(shape(context, fill, 10));
        view.setGravity(Gravity.CENTER);
        return view;
    }
    static Button button(Context context, String value, boolean primary) {
        Button button = new Button(context);
        button.setText(value);
        button.setAllCaps(false);
        button.setTextSize(15);
        button.setTypeface(MEDIUM);
        button.setMinHeight(dp(context, 52));
        button.setMinimumHeight(dp(context, 52));
        button.setMinWidth(0);
        button.setPadding(dp(context, 16), dp(context, 12), dp(context, 16), dp(context, 12));
        button.setStateListAnimator(null);
        button.setElevation(0);
        decorateButton(button, primary ? FOREST : Color.WHITE,
            primary ? Color.WHITE : INK, primary ? Color.TRANSPARENT : BORDER);
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, -2);
        params.setMargins(0, dp(context, 6), 0, dp(context, 6));
        button.setLayoutParams(params);
        return button;
    }
    static void decorateButton(Button button, int fill, int ink, int border) {
        Context context = button.getContext();
        StateListDrawable states = new StateListDrawable();
        states.addState(new int[] {-android.R.attr.state_enabled},
            shape(context, 0xFFE4E8E1, 16, BORDER));
        states.addState(new int[] {}, touch(context, fill, 16, border));
        button.setBackgroundTintList(null);
        button.setBackground(states);
        button.setTextColor(new ColorStateList(
            new int[][] { {-android.R.attr.state_enabled}, {} },
            new int[] { MUTED, ink }));
    }
    static void styleInput(EditText input) {
        Context context = input.getContext();
        input.setTextSize(16);
        input.setTextColor(INK);
        input.setHintTextColor(MUTED);
        input.setTypeface(BODY);
        input.setPadding(dp(context, 14), dp(context, 14), dp(context, 14), dp(context, 14));
        input.setMinHeight(dp(context, 52));
        input.setBackgroundTintList(null);
        input.setBackground(shape(context, PAPER, 14, BORDER));
    }
    static LinearLayout stat(Context context, int count, String title, Runnable action) {
        LinearLayout box = column(context);
        box.setPadding(dp(context, 8), dp(context, 6), dp(context, 8), dp(context, 6));
        TextView number = label(context, Integer.toString(count), 29, FOREST, false);
        number.setTypeface(DISPLAY);
        box.addView(number);
        TextView caption = label(context, title, 12, MUTED, false);
        caption.setPadding(0, dp(context, 4), 0, 0);
        box.addView(caption);
        if (action != null) {
            box.setBackground(touch(context, Color.WHITE, 12, Color.TRANSPARENT));
            box.setOnClickListener(v -> action.run());
            box.setMinimumHeight(dp(context, 72));
        }
        return box;
    }
    static LinearLayout navItem(Context context, String title, String key,
                                 boolean active, View.OnClickListener listener) {
        LinearLayout item = column(context);
        item.setGravity(Gravity.CENTER);
        item.setPadding(dp(context, 2), dp(context, 7), dp(context, 2), dp(context, 7));
        item.setMinimumHeight(dp(context, 70));
        item.setTag(key);
        FrameLayout iconSlot = new FrameLayout(context);
        IconView icon = new IconView(context, key, MUTED);
        iconSlot.addView(icon, new FrameLayout.LayoutParams(dp(context, 23), dp(context, 23), Gravity.CENTER));
        item.addView(iconSlot, new LinearLayout.LayoutParams(dp(context, 42), dp(context, 32)));
        TextView caption = label(context, title, 12, MUTED, false);
        caption.setGravity(Gravity.CENTER);
        caption.setPadding(0, dp(context, 3), 0, 0);
        item.addView(caption);
        item.setOnClickListener(listener);
        item.setBackground(touch(context, Color.WHITE, 16, Color.TRANSPARENT));
        item.setContentDescription(title);
        item.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_YES);
        caption.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
        selectNav(item, active);
        return item;
    }
    static void selectNav(View view, boolean active) {
        LinearLayout item = (LinearLayout) view;
        FrameLayout iconSlot = (FrameLayout) item.getChildAt(0);
        IconView icon = (IconView) iconSlot.getChildAt(0);
        TextView caption = (TextView) item.getChildAt(1);
        item.setSelected(active);
        iconSlot.setBackground(shape(view.getContext(), active ? MINT : Color.TRANSPARENT, 12));
        icon.setInk(active ? FOREST : MUTED);
        caption.setTextColor(active ? FOREST : MUTED);
        caption.setTypeface(active ? MEDIUM : BODY);
        item.setContentDescription(caption.getText() + (active ? "\uff0c\u5df2\u9009\u4e2d" : ""));
    }
    static LinearLayout message(Context context, String value, boolean mine) {
        LinearLayout bubble = column(context);
        bubble.setPadding(dp(context, 15), dp(context, 12), dp(context, 15), dp(context, 12));
        bubble.setBackground(shape(context, mine ? MINT : Color.WHITE, 18, mine ? Color.TRANSPARENT : BORDER));
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, -2);
        params.setMargins(mine ? dp(context, 24) : 0, dp(context, 6),
            mine ? 0 : dp(context, 16), dp(context, 6));
        bubble.setLayoutParams(params);
        TextView role = label(context, mine ? "\u4f60" : "AI \u751f\u6d3b\u52a9\u624b", 12, FOREST, true);
        bubble.addView(role);
        TextView body = label(context, value, 15, INK, false);
        body.setPadding(0, dp(context, 6), 0, 0);
        body.setTextIsSelectable(true);
        body.setLineSpacing(dp(context, 2), 1.2f);
        bubble.addView(body);
        return bubble;
    }
    static void enter(View view) {
        if (Build.VERSION.SDK_INT >= 26 && !ValueAnimator.areAnimatorsEnabled()) return;
        view.setAlpha(0);
        view.setTranslationY(dp(view.getContext(), 9));
        view.animate().alpha(1).translationY(0).setDuration(220).start();
    }

    static final class IconView extends View {
        private final String kind;
        private int ink;
        private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Path path = new Path();
        IconView(Context context, String kind, int ink) {
            super(context);
            this.kind = kind; this.ink = ink;
            setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
        }
        void setInk(int value) { ink = value; invalidate(); }
        @Override protected void onDraw(Canvas canvas) {
            super.onDraw(canvas);
            int checkpoint = canvas.save();
            float size = Math.min(getWidth(), getHeight());
            canvas.translate((getWidth() - size) / 2f, (getHeight() - size) / 2f);
            canvas.scale(size / 24f, size / 24f);
            paint.setColor(ink); paint.setStyle(Paint.Style.STROKE);
            paint.setStrokeWidth(1.7f); paint.setStrokeCap(Paint.Cap.ROUND); paint.setStrokeJoin(Paint.Join.ROUND);
            path.reset();
            switch (kind) {
                case "nutrition":
                    path.moveTo(12, 2); path.cubicTo(17, 7, 19, 10, 19, 14);
                    path.cubicTo(19, 19, 16, 22, 12, 22);
                    path.cubicTo(8, 22, 5, 19, 5, 14);
                    path.cubicTo(5, 11, 7, 8, 9, 7);
                    path.lineTo(9, 13); path.cubicTo(13, 10, 13, 6, 12, 2);
                    canvas.drawPath(path, paint); break;
                case "home":
                    path.moveTo(3, 10); path.lineTo(12, 3); path.lineTo(21, 10);
                    canvas.drawPath(path, paint);
                    canvas.drawRoundRect(6, 10, 18, 21, 2, 2, paint);
                    canvas.drawLine(12, 15, 12, 21, paint); break;
                case "records":
                    canvas.drawRoundRect(5, 3, 19, 21, 2, 2, paint);
                    canvas.drawLine(8, 3, 8, 21, paint);
                    canvas.drawLine(11, 8, 16, 8, paint); canvas.drawLine(11, 12, 16, 12, paint);
                    canvas.drawLine(11, 16, 14, 16, paint); break;
                case "schedule":
                    canvas.drawRoundRect(4, 5, 20, 21, 2, 2, paint);
                    canvas.drawLine(4, 10, 20, 10, paint);
                    canvas.drawLine(8, 3, 8, 7, paint); canvas.drawLine(16, 3, 16, 7, paint);
                    canvas.drawLine(8, 14, 10, 14, paint); canvas.drawLine(14, 14, 16, 14, paint);
                    canvas.drawLine(8, 17, 10, 17, paint); break;
                case "ai":
                    path.moveTo(11, 3); path.quadTo(12, 10, 19, 11);
                    path.quadTo(12, 12, 11, 19); path.quadTo(10, 12, 3, 11);
                    path.quadTo(10, 10, 11, 3); path.close(); canvas.drawPath(path, paint);
                    canvas.drawLine(20, 3, 20, 7, paint); canvas.drawLine(18, 5, 22, 5, paint);
                    canvas.drawLine(20, 17, 20, 21, paint); canvas.drawLine(18, 19, 22, 19, paint); break;
                case "me":
                    canvas.drawCircle(12, 7, 4, paint);
                    path.moveTo(5, 21); path.lineTo(5, 19);
                    path.cubicTo(5, 12, 19, 12, 19, 19); path.lineTo(19, 21);
                    canvas.drawPath(path, paint); break;
                case "inbox":
                    path.moveTo(3, 10); path.lineTo(6, 4); path.lineTo(18, 4); path.lineTo(21, 10);
                    path.lineTo(21, 20); path.lineTo(3, 20); path.close(); canvas.drawPath(path, paint);
                    path.reset(); path.moveTo(3, 11); path.lineTo(8, 11); path.lineTo(10, 14);
                    path.lineTo(14, 14); path.lineTo(16, 11); path.lineTo(21, 11);
                    canvas.drawPath(path, paint); break;
                case "play":
                    path.moveTo(8, 4); path.lineTo(20, 12); path.lineTo(8, 20); path.close();
                    canvas.drawPath(path, paint); break;
                case "arrow":
                    canvas.drawLine(4, 12, 20, 12, paint);
                    path.moveTo(14, 6); path.lineTo(20, 12); path.lineTo(14, 18);
                    canvas.drawPath(path, paint); break;
                case "check":
                    path.moveTo(5, 12); path.lineTo(10, 17); path.lineTo(20, 6);
                    canvas.drawPath(path, paint); break;
                default:
                    path.moveTo(5, 21); path.cubicTo(7, 13, 12, 9, 19, 4);
                    canvas.drawPath(path, paint);
                    path.reset(); path.moveTo(7, 16); path.cubicTo(2, 6, 10, 2, 20, 3);
                    path.cubicTo(21, 13, 16, 20, 7, 16); canvas.drawPath(path, paint);
                    break;
            }
            canvas.restoreToCount(checkpoint);
        }
    }

    static final class FocusArt extends View {
        private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Path path = new Path();
        FocusArt(Context context) {
            super(context);
            setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
        }
        @Override protected void onDraw(Canvas canvas) {
            super.onDraw(canvas);
            int checkpoint = canvas.save();
            canvas.scale(getWidth() / 96f, getHeight() / 96f);
            paint.setStyle(Paint.Style.STROKE); paint.setStrokeWidth(1);
            paint.setColor(alpha(Color.WHITE, 28));
            canvas.drawCircle(46, 49, 35, paint); canvas.drawCircle(46, 49, 43, paint);
            canvas.drawLine(3, 49, 89, 49, paint); canvas.drawLine(46, 6, 46, 92, paint);
            paint.setStyle(Paint.Style.FILL); paint.setColor(AMBER);
            canvas.drawCircle(73, 24, 10, paint);
            path.reset(); path.moveTo(32, 68); path.cubicTo(19, 43, 38, 27, 62, 28);
            path.cubicTo(65, 55, 51, 74, 32, 68); path.close();
            paint.setColor(0xFFD7E5D7); canvas.drawPath(path, paint);
            paint.setStyle(Paint.Style.STROKE); paint.setStrokeWidth(2.2f);
            paint.setStrokeCap(Paint.Cap.ROUND); paint.setColor(0xFF3D6850);
            path.reset(); path.moveTo(25, 82); path.cubicTo(31, 61, 45, 44, 57, 34);
            canvas.drawPath(path, paint);
            canvas.restoreToCount(checkpoint);
        }
    }
}
