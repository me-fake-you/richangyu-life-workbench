package com.richangyu.lifeworkbench;
import java.net.URI;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.security.MessageDigest;
import java.nio.charset.StandardCharsets;
import java.util.Locale;

final class WorkbenchOperationPolicy {
    private WorkbenchOperationPolicy() {}
    static boolean expectedResponse(String value, String origin) {
        try {
            URI uri = new URI(value);
            return origin.equals(WorkbenchClientPolicy.normalizeOrigin(uri.getScheme()+"://"+uri.getRawAuthority()))
                && "/api/mobile-actions".equals(uri.getRawPath()) && uri.getRawQuery()==null
                && uri.getRawFragment()==null && uri.getRawUserInfo()==null;
        } catch (Exception error) { return false; }
    }
    static String scope(String origin, String account) {
        String safe = WorkbenchClientPolicy.normalizeOrigin(origin);
        if (safe.isEmpty() || account == null || account.trim().isEmpty()) return "";
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest((safe+"\n"+account).getBytes(StandardCharsets.UTF_8));
            StringBuilder out = new StringBuilder();
            for (byte b : digest) out.append(String.format(Locale.ROOT,"%02x",b&255));
            return out.toString();
        } catch (Exception error) { return ""; }
    }
    static boolean draftAction(String action) {
        return "event.create".equals(action)||"schedule.create".equals(action)||"inbox.create".equals(action);
    }
    static double money(String value) {
        if (value==null || !value.trim().matches("[0-9]+(?:\\.[0-9]{1,2})?")) throw new IllegalArgumentException("invalid amount");
        BigDecimal amount=new BigDecimal(value.trim());
        if(amount.compareTo(new BigDecimal("100000000"))>0) throw new IllegalArgumentException("amount too large");
        return amount.setScale(2,RoundingMode.HALF_UP).doubleValue();
    }
    static String moneyLabel(double value) { return BigDecimal.valueOf(value).setScale(2,RoundingMode.HALF_UP).toPlainString(); }
    static double expected(String mode,double rate,long minutes) {
        if(rate<0 || Double.isNaN(rate)||Double.isInfinite(rate)||minutes<0) throw new IllegalArgumentException("invalid rate");
        BigDecimal amount=BigDecimal.valueOf(rate);
        if("\u6309\u5c0f\u65f6".equals(mode)) amount=amount.multiply(BigDecimal.valueOf(minutes)).divide(new BigDecimal("60"),2,RoundingMode.HALF_UP);
        return amount.setScale(2,RoundingMode.HALF_UP).doubleValue();
    }
}
