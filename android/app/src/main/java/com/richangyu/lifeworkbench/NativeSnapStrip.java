package com.richangyu.lifeworkbench;
import android.content.Context;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.widget.HorizontalScrollView;
/** Native fling, followed by nearest-card settling; never changes a selected record. */
final class NativeSnapStrip extends HorizontalScrollView {
    private boolean gesture, snapping;
    private final Runnable settled = this::snapToCard;
    NativeSnapStrip(Context context) {
        super(context); setHorizontalScrollBarEnabled(false); setFillViewport(false);
    }
    @Override public boolean dispatchTouchEvent(MotionEvent event) {
        if (event.getActionMasked() == MotionEvent.ACTION_DOWN) {
            removeCallbacks(settled); gesture = true; snapping = false;
        }
        boolean result = super.dispatchTouchEvent(event);
        if (event.getActionMasked() == MotionEvent.ACTION_UP && gesture) {
            removeCallbacks(settled); postDelayed(settled, 160);
        } else if (event.getActionMasked() == MotionEvent.ACTION_CANCEL) {
            gesture = false; removeCallbacks(settled);
        }
        return result;
    }
    @Override protected void onScrollChanged(int l, int t, int oldl, int oldt) {
        super.onScrollChanged(l, t, oldl, oldt);
        if (gesture && !snapping) { removeCallbacks(settled); postDelayed(settled, 160); }
    }
    private void snapToCard() {
        if (!gesture || getChildCount() == 0 || !(getChildAt(0) instanceof ViewGroup)) return;
        ViewGroup row = (ViewGroup) getChildAt(0);
        if (row.getChildCount() == 0) return;
        View first = row.getChildAt(0);
        int stride = row.getChildCount() > 1 ? row.getChildAt(1).getLeft() - first.getLeft() : first.getWidth();
        int target = Math.min(Math.max(0, row.getWidth() - getWidth()),
            WorkbenchMotionPolicy.snap(getScrollX(), stride, row.getChildCount()));
        snapping = true; gesture = false;
        if (NativeUi.motionAllowed(getContext())) smoothScrollTo(target, 0); else scrollTo(target, 0);
    }
    @Override protected void onDetachedFromWindow() {
        removeCallbacks(settled); gesture = false; super.onDetachedFromWindow();
    }
}
