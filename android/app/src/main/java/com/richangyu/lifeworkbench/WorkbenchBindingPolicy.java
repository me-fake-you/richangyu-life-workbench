package com.richangyu.lifeworkbench;

/** A bounded single-origin input policy. Never reads clipboard contents or contacts a server. */
final class WorkbenchBindingPolicy {
    static final int MAX_ADDRESS = 300;
    enum EntryState { NEEDS_BINDING, WAITING_AUTH }

    static String preparedOrigin(String value) {
        if (value == null || value.length() > MAX_ADDRESS) return "";
        for (int i = 0; i < value.length(); i++) {
            char c = value.charAt(i);
            if (c == 127 || (c < 32 && c != '\r' && c != '\n' && c != '\t')) return "";
        }
        String trimmed = value.trim();
        for (int i = 0; i < trimmed.length(); i++) {
            if (trimmed.charAt(i) < 32) return "";
        }
        return WorkbenchClientPolicy.normalizeOrigin(trimmed);
    }

    static EntryState entryState(String origin) {
        return preparedOrigin(origin).isEmpty() ? EntryState.NEEDS_BINDING : EntryState.WAITING_AUTH;
    }

    private WorkbenchBindingPolicy() {}
}
