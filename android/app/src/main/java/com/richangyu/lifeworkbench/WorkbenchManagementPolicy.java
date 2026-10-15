package com.richangyu.lifeworkbench;
import java.net.URI;
import java.util.Locale;
final class WorkbenchManagementPolicy {
    private WorkbenchManagementPolicy() {}
    static boolean section(String value) {
        return "goal".equals(value) || "milestone".equals(value) || "account".equals(value) || "budget".equals(value)
            || "savings".equals(value) || "transaction".equals(value) || "transfer".equals(value);
    }
    static boolean financial(String value) { return section(value) && !"goal".equals(value) && !"milestone".equals(value); }
    static boolean mutation(String value) {
        return "manage.create".equals(value) || "manage.update".equals(value) || "manage.remove".equals(value);
    }
    static boolean field(String section, String id) {
        String names;
        if ("goal".equals(section)) names = ",title,kind,status,progress,description,startAt,targetAt,";
        else if ("milestone".equals(section)) names = ",title,projectId,happenedAt,note,completed,";
        else if ("account".equals(section)) names = ",name,type,initialBalance,isArchived,";
        else if ("budget".equals(section)) names = ",month,category,amount,note,";
        else if ("savings".equals(section)) names = ",title,targetAmount,savedAmount,targetAt,";
        else if ("transaction".equals(section)) names = ",type,amount,category,accountId,transferAccountId,occurredAt,note,";
        else if ("transfer".equals(section)) names = ",amount,accountId,transferAccountId,occurredAt,note,";
        else return false;
        return id != null && !id.isEmpty() && !id.contains(",") && names.contains("," + id + ",");
    }
    static int fieldCount(String section) {
        if ("goal".equals(section) || "transaction".equals(section)) return 7;
        if ("milestone".equals(section) || "transfer".equals(section)) return 5;
        return "account".equals(section) || "budget".equals(section) || "savings".equals(section) ? 4 : 0;
    }
    static boolean endpoint(String value) {
        return value != null && value.matches("/api/mobile-management\\?section=(goal|milestone|account|budget|savings|transaction|transfer)&page=(0|[1-9][0-9]{0,2})");
    }
    static boolean response(int status, String type, String url, String origin, String endpoint) {
        if (status != 200 || type == null || !type.split(";", 2)[0].trim().equalsIgnoreCase("application/json")) return false;
        if (!endpoint(endpoint) && !"/api/mobile-management-actions".equals(endpoint)) return false;
        try {
            URI actual = new URI(url), expected = new URI(origin + endpoint);
            return "https".equalsIgnoreCase(actual.getScheme()) && actual.getHost() != null &&
                actual.getHost().equalsIgnoreCase(expected.getHost()) && (actual.getPort() == -1 || actual.getPort() == 443) &&
                actual.getRawUserInfo() == null && actual.getRawFragment() == null &&
                actual.getRawPath().equals(expected.getRawPath()) && java.util.Objects.equals(actual.getRawQuery(), expected.getRawQuery());
        } catch (Exception ignored) { return false; }
    }
    static String decimal(String value, boolean signed, boolean zero) {
        if (value == null || !value.matches((signed ? "-?" : "") + "(0|[1-9][0-9]{0,6})(\\.[0-9]{1,2})?")) return "";
        try {
            boolean negative = value.startsWith("-");
            String raw = negative ? value.substring(1) : value;
            String[] parts = raw.split("\\.");
            long cents = Long.parseLong(parts[0]) * 100 + (parts.length == 1 ? 0 :
                Long.parseLong(parts[1].length() == 1 ? parts[1] + "0" : parts[1]));
            if ((!zero && cents == 0) || cents > 999999999) return "";
            return (negative && cents > 0 ? "-" : "") + String.format(Locale.US, "%d.%02d", cents / 100, cents % 100);
        } catch (Exception ignored) { return ""; }
    }
    static boolean result(String id, String expectedId, String requestId, String operation, String expectedOperation,
                          String actualSection, String expectedSection, String state, boolean probe) {
        if (!WorkbenchTaskWritePolicy.requestId(requestId) || !mutation(operation) || !operation.equals(expectedOperation) ||
            !section(actualSection) || !actualSection.equals(expectedSection)) return false;
        boolean target = "manage.create".equals(operation) ? id != null && id.matches("managed-[0-9a-f]{16}-" + requestId) :
            id != null && id.equals(expectedId) && !id.isEmpty();
        return target && ("applied".equals(state) || "cancelled".equals(state) || (probe && "not-confirmed".equals(state)));
    }
}
