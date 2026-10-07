package com.richangyu.lifeworkbench;

/** Allowlisted local state only. Never accepts URLs, response bodies or record data. */
final class WorkbenchDiagnosticReport {
    private WorkbenchDiagnosticReport() {}

    static String connection(String version, int sdk, String state, boolean bound,
            boolean bridgeReady, boolean snapshotLoaded, boolean syncing, boolean saving,
            boolean saveOutcomeUnknown, int httpStatus) {
        StringBuilder report = header(version, sdk, "connection");
        field(report, "connectionState", oneOf(state, "unknown", "not-started", "needs-binding",
            "authorization", "webview-unavailable", "page-load-failed", "reading",
            "authorization-required", "no-http-result", "http-error", "invalid-response", "ready"));
        flag(report, "workbenchConfigured", bound);
        flag(report, "authorizationBridgeReady", bridgeReady);
        flag(report, "snapshotLoaded", snapshotLoaded);
        flag(report, "syncInProgress", syncing);
        flag(report, "saveInProgress", saving);
        flag(report, "saveOutcomeUnknown", saveOutcomeUnknown);
        field(report, "lastMobileHttpStatus", http(httpStatus));
        return finish(report);
    }

    static String nutrition(String version, int sdk, boolean loaded, boolean busy,
            boolean saveOutcomeUnknown, String readState, int readStatus,
            boolean configReported, boolean configured, String provider, String model,
            String checkState, int checkStatus, int retryAfter) {
        StringBuilder report = header(version, sdk, "nutrition");
        flag(report, "snapshotLoaded", loaded);
        flag(report, "operationInProgress", busy);
        flag(report, "saveOutcomeUnknown", saveOutcomeUnknown);
        field(report, "nutritionReadState", oneOf(readState, "unknown", "not-started",
            "loading", "ready", "authorization-required", "no-http-result", "http-error",
            "invalid-response"));
        field(report, "nutritionReadHttpStatus", http(readStatus));
        flag(report, "imageConfigurationReported", configReported);
        field(report, "imageConfigured", configReported ? (configured ? "yes" : "no") : "unknown");
        field(report, "imageProvider", oneOf(provider, "unknown", "groq", "nvidia", "openai", "local"));
        // An arbitrary server-supplied model label could contain secrets or personal data.
        field(report, "imageModel", "qwen/qwen3.8-27b".equals(model)
            ? "qwen/qwen3.8-27b" : "other-or-unreported");
        field(report, "visionCheckState", oneOf(checkState, "unknown", "not-checked", "checking",
            "verified", "unavailable", "not-configured", "authorization-required",
            "no-http-result", "http-error", "invalid-response", "request-failed"));
        field(report, "visionCheckHttpStatus", http(checkStatus));
        field(report, "suggestedRetrySeconds", retryAfter > 0 && retryAfter <= 3600
            ? Integer.toString(retryAfter) : "unreported");
        return finish(report);
    }

    private static StringBuilder header(String version, int sdk, String screen) {
        StringBuilder report = new StringBuilder("Richangyu diagnostics v1 (manual sharing)\n");
        field(report, "appVersion", version != null && version.matches(
            "[0-9]{1,4}(\\.[0-9]{1,4}){1,3}(-preview)?") ? version : "unknown");
        field(report, "androidSdk", sdk >= 1 && sdk <= 1000 ? Integer.toString(sdk) : "unknown");
        field(report, "screen", screen);
        return report;
    }

    private static String finish(StringBuilder report) {
        report.append("privacy: no account, URL, key, cookie, device ID, photo or record data\n");
        report.append("scope: local state snapshot, not proof of current login or synchronization\n");
        return report.toString();
    }

    private static void field(StringBuilder report, String key, String value) {
        report.append(key).append(": ").append(value).append('\n');
    }

    private static void flag(StringBuilder report, String key, boolean value) {
        field(report, key, value ? "yes" : "no");
    }

    private static String http(int code) {
        return code >= 100 && code <= 599 ? Integer.toString(code) : "unreported";
    }

    private static String oneOf(String value, String fallback, String... allowed) {
        for (String option : allowed) if (option.equals(value)) return option;
        return fallback;
    }
}
