package com.richangyu.lifeworkbench;

/** Pure presentation decisions. Does not read, cache, send, or mutate private data. */
final class WorkbenchHomePolicy {
    enum SnapshotState { UNAVAILABLE, REFRESHING, FRESH, STALE }

    static SnapshotState snapshotState(boolean hasSnapshot, boolean bridgeReady,
                                       boolean refreshing, boolean lastReadSucceeded) {
        if (!hasSnapshot) return SnapshotState.UNAVAILABLE;
        if (refreshing) return SnapshotState.REFRESHING;
        return bridgeReady && lastReadSucceeded ? SnapshotState.FRESH : SnapshotState.STALE;
    }

    static boolean stackedActions(int widthDp, float fontScale) {
        return widthDp < 360 || Float.isNaN(fontScale) || Float.isInfinite(fontScale)
            || fontScale <= 0 || fontScale > 1.2f;
    }

    private WorkbenchHomePolicy() { }
}
