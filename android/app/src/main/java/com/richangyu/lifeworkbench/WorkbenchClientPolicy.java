package com.richangyu.lifeworkbench;

import java.net.URI;
import java.util.Locale;
import java.util.regex.Pattern;

/** Pure Java policy shared by binding, the session bridge and draft confirmation. */
final class WorkbenchClientPolicy {
    private WorkbenchClientPolicy() { }
    private static final Pattern FINANCE = Pattern.compile(
        "\u6536\u5165|\u5de5\u8d44|\u5230\u8d26|\u6536\u6b3e|\u91d1\u989d|\u8d5a\u4e86|\u8d5a\u5230|\u5e94\u6536|\u5f85\u6536|\u652f\u51fa|\u8d26\u6237\u4f59\u989d|[\uffe5\u00a5]|\\d\\s*(?:\u5143|\u5757\u94b1|\u4eba\u6c11\u5e01)");
    private static final Pattern CREDENTIAL = Pattern.compile(
        "(?:\u6211\u7684\u5bc6\u7801|\u5bc6\u7801\u662f|\u5bc6\u7801\u4e3a|\u9a8c\u8bc1\u7801\u662f|\u9a8c\u8bc1\u7801\u4e3a|\u8eab\u4efd\u8bc1\u53f7|\u94f6\u884c\u5361\u53f7|\u79c1\u5bc6\u8bb0\u5f55|\u79c1\u5bc6\u65e5\u8bb0)|(?:gsk_|sk-)[A-Za-z0-9_-]{15,}",
        Pattern.CASE_INSENSITIVE);
    static String normalizeOrigin(String value) {
        try {
            URI uri = new URI(value == null ? "" : value.trim());
            String host = uri.getHost();
            String path = uri.getRawPath();
            if (!"https".equalsIgnoreCase(uri.getScheme()) || host == null
                || uri.getRawUserInfo() != null || uri.getRawQuery() != null || uri.getRawFragment() != null
                || (uri.getPort() != -1 && uri.getPort() != 443)
                || (path != null && !path.isEmpty() && !"/".equals(path))) return "";
            host = host.toLowerCase(Locale.ROOT);
            if (host.length() > 253 || !host.matches("[a-z0-9.-]+") || !host.contains(".")
                || host.endsWith(".") || host.matches("[0-9.]+")
                || host.equals("localhost") || host.endsWith(".localhost")
                || host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".invalid")) return "";
            for (String label : host.split("\\.", -1)) {
                if (label.isEmpty() || label.length() > 63 || !label.matches("[a-z0-9](?:[a-z0-9-]*[a-z0-9])?")) return "";
            }
            return "https://" + host;
        } catch (Exception ignored) { return ""; }
    }
    static boolean allowsEndpoint(String path, boolean write) {
        if ("/api/mobile".equals(path) || "/api/assistant".equals(path)) return true;
        return !write && ("/api/assistant?days=1".equals(path)
            || "/api/assistant?days=7".equals(path) || "/api/assistant?days=30".equals(path));
    }
    static boolean needsFinancialConsent(String value) {
        return value != null && FINANCE.matcher(value).find();
    }
    static boolean containsCredential(String value) {
        return value != null && CREDENTIAL.matcher(value).find();
    }
    static boolean canConfirm(String payload, String signature, long expiresAt, long now,
        int warnings, boolean financial, boolean consent, boolean saved, boolean blocked, boolean plan) {
        return !saved && !blocked && warnings == 0 && (!financial || consent)
            && expiresAt > now && payload != null && !payload.trim().isEmpty()
            && payload.length() <= (plan ? 40000 : 46000)
            && signature != null && signature.matches("[0-9a-fA-F]{64}");
    }
}
