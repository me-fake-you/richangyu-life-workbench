package com.richangyu.lifeworkbench;
/** Pure presentation math. No storage, network, or mutation decisions. */
final class WorkbenchMotionPolicy {
    private WorkbenchMotionPolicy() {}
    static float progress(int completed, int total) {
        return total <= 0 ? 0f : Math.max(0f, Math.min(1f, completed / (float) total));
    }
    static int snap(int scroll, int stride, int count) {
        if (stride <= 0 || count <= 0) return 0;
        long index = Math.max(0L, Math.min((long) count - 1, Math.round(scroll / (double) stride)));
        return (int) Math.min(Integer.MAX_VALUE, index * stride);
    }
}
