package com.richangyu.lifeworkbench;
import java.util.List;

/** Pure display/permission-to-retry policy. A read is never evidence of all writes succeeding. */
final class WorkbenchSyncPolicy {
    enum ReadState { UNBOUND, READING, AUTH_REQUIRED, UNREAD, STALE, READY }
    enum DraftState { LOCAL_ONLY, REJECTED, UNCERTAIN, CONFIRMED }
    static final class Summary {
        final int local, rejected, uncertain, confirmed, total;
        Summary(int local, int rejected, int uncertain, int confirmed) {
            this.local=local; this.rejected=rejected; this.uncertain=uncertain; this.confirmed=confirmed;
            this.total=local+rejected+uncertain+confirmed;
        }
    }
    static boolean validScope(String scope) { return scope != null && scope.matches("[0-9a-f]{64}"); }
    static ReadState readState(boolean bound, boolean reading, boolean authorized, boolean loaded, boolean readSucceeded) {
        if (!bound) return ReadState.UNBOUND;
        if (reading) return ReadState.READING;
        if (!authorized) return ReadState.AUTH_REQUIRED;
        if (!loaded) return ReadState.UNREAD;
        return readSucceeded ? ReadState.READY : ReadState.STALE;
    }
    static DraftState draftState(String state) {
        if ("queued".equals(state)) return DraftState.LOCAL_ONLY;
        if ("rejected".equals(state)) return DraftState.REJECTED;
        if ("confirmed".equals(state)) return DraftState.CONFIRMED;
        return DraftState.UNCERTAIN;
    }
    static Summary summarize(List<String> states) {
        if (states == null) throw new IllegalArgumentException("unread draft list");
        int local=0, rejected=0, uncertain=0, confirmed=0;
        for (String value : states) switch (draftState(value)) {
            case LOCAL_ONLY: local++; break;
            case REJECTED: rejected++; break;
            case CONFIRMED: confirmed++; break;
            default: uncertain++;
        }
        return new Summary(local,rejected,uncertain,confirmed);
    }
    static boolean canSubmit(String state) { return draftState(state) != DraftState.CONFIRMED; }
    static int priority(String state) {
        switch (draftState(state)) {
            case UNCERTAIN: return 0;
            case REJECTED: return 1;
            case LOCAL_ONLY: return 2;
            default: return 3;
        }
    }
    static String title(String state) {
        switch (draftState(state)) {
            case LOCAL_ONLY: return "\u4ec5\u5b58\u672c\u673a";
            case REJECTED: return "\u672c\u6b21\u8bf7\u6c42\u88ab\u62d2\u7edd";
            case CONFIRMED: return "\u4e91\u7aef\u56de\u6267\u5df2\u786e\u8ba4";
            default: return "\u7ed3\u679c\u5f85\u6838\u5bf9";
        }
    }
    static String hint(String state) {
        switch (draftState(state)) {
            case LOCAL_ONLY: return "\u5c1a\u672a\u7531\u8fd9\u4efd\u8349\u7a3f\u63d0\u4ea4\u5230\u4e91\u7aef\u3002\u6062\u590d\u8fde\u63a5\u540e\u4ecd\u9700\u9010\u6761\u786e\u8ba4\u3002";
            case REJECTED: return "\u672c\u6b21\u8bf7\u6c42\u88ab\u670d\u52a1\u62d2\u7edd\uff0c\u4e0d\u4ee3\u8868\u6b64\u524d\u4ece\u672a\u4fdd\u5b58\u3002\u5148\u68c0\u67e5\u767b\u5f55\u4e0e\u539f\u5185\u5bb9\uff0c\u518d\u6838\u5bf9\u539f\u64cd\u4f5c\u7f16\u53f7\u3002";
            case CONFIRMED: return "\u5df2\u6536\u5230\u5339\u914d\u7684\u6709\u6548\u4fdd\u5b58\u56de\u6267\uff0c\u4f46\u672c\u673a\u526f\u672c\u5c1a\u672a\u6e05\u7406\u3002\u53ea\u6e05\u7406\u672c\u673a\uff0c\u4e0d\u518d\u63d0\u4ea4\u3002";
            default: return "\u53ef\u80fd\u5df2\u7ecf\u4fdd\u5b58\u3002\u4fdd\u7559\u539f\u64cd\u4f5c\u7f16\u53f7\uff0c\u5148\u6838\u5bf9\uff1b\u91cd\u8bd5\u4e5f\u4f7f\u7528\u540c\u4e00\u7f16\u53f7\uff0c\u4e0d\u65b0\u5efa\u91cd\u590d\u64cd\u4f5c\u3002";
        }
    }
    static boolean usableReceiptTime(long timestamp, long now) { return timestamp > 0 && timestamp <= now; }
    private WorkbenchSyncPolicy() {}
}
