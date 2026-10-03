package com.richangyu.lifeworkbench;

import org.junit.Test;
import static org.junit.Assert.*;

public class WorkbenchClientPolicyTest {
    private final String signature = new String(new char[64]).replace('\0', 'a');
    @Test public void bindingCanonicalizesOnlyHttpsOrigins() {
        assertEquals("https://example.com", WorkbenchClientPolicy.normalizeOrigin(" HTTPS://Example.COM:443/ "));
        assertEquals("https://app.example.com", WorkbenchClientPolicy.normalizeOrigin("https://app.example.com"));
    }
    @Test public void bindingRejectsUnsafeOrAmbiguousAddresses() {
        for (String value : new String[] {"http://example.com", "https://user:pass@example.com",
            "https://example.com/app", "https://example.com?x=1", "https://example.com#x",
            "https://example.com:8443", "https://127.0.0.1", "https://[::1]", "https://localhost",
            "https://app.local", "https://app.internal", "https://a..com", "https://-a.com",
            "https://example.com.", "https://example.com/%2f", "https://example.com\\evil"}) {
            assertEquals(value, "", WorkbenchClientPolicy.normalizeOrigin(value));
        }
    }
    @Test public void endpointAllowlistRejectsOtherPathsAndWriteQueries() {
        assertTrue(WorkbenchClientPolicy.allowsEndpoint("/api/mobile", true));
        assertTrue(WorkbenchClientPolicy.allowsEndpoint("/api/assistant", true));
        for (int day : new int[] {1, 7, 30}) {
            assertTrue(WorkbenchClientPolicy.allowsEndpoint("/api/assistant?days=" + day, false));
            assertFalse(WorkbenchClientPolicy.allowsEndpoint("/api/assistant?days=" + day, true));
        }
        for (String value : new String[] {"https://example.com/api/mobile", "/api/admin",
            "//example.com/api/mobile", "/api/assistant?days=2", "/api/assistant?days=7&x=1",
            "/api/mobile/", "/api/assistant%3Fdays=7", "/api/mobile?x=1"}) {
            assertFalse(WorkbenchClientPolicy.allowsEndpoint(value, false));
        }
    }
    @Test public void financeConsentCoversChineseAndCurrencyAmounts() {
        for (String value : new String[] {"\u6536\u5165", "\u5de5\u8d44\u5230\u8d26", "\u517c\u804c\u8d5a\u4e86200", "30\u5143", "20 \u5757\u94b1", "\uffe530", "\u00a530", "\u5e94\u6536\u6b3e"}) {
            assertTrue(value, WorkbenchClientPolicy.needsFinancialConsent(value));
        }
        assertFalse(WorkbenchClientPolicy.needsFinancialConsent("\u4eca\u5929\u517c\u804c\uff0c\u4e0b\u53483\u70b9\u52305\u70b9"));
        assertFalse(WorkbenchClientPolicy.needsFinancialConsent("\u660e\u5929\u8dd1\u6b6530\u5206\u949f"));
    }
    @Test public void credentialsAreNotSentToAssistant() {
        assertTrue(WorkbenchClientPolicy.containsCredential("\u5bc6\u7801\u662fabc"));
        assertTrue(WorkbenchClientPolicy.containsCredential("gsk_12345678901234567890"));
        assertFalse(WorkbenchClientPolicy.containsCredential("\u4eca\u5929\u5b66\u4e60\u4e24\u5c0f\u65f6"));
    }
    @Test public void confirmRequiresValidUnexpiredSignedDraft() {
        assertTrue(WorkbenchClientPolicy.canConfirm("{}", signature, 2000, 1000, 0, false, false, false, false, false));
        assertFalse(WorkbenchClientPolicy.canConfirm("{}", signature, 1000, 1000, 0, false, false, false, false, false));
        assertFalse(WorkbenchClientPolicy.canConfirm("", signature, 2000, 1000, 0, false, false, false, false, false));
        assertFalse(WorkbenchClientPolicy.canConfirm("{}", "bad", 2000, 1000, 0, false, false, false, false, false));
        assertFalse(WorkbenchClientPolicy.canConfirm("{}", signature, 2000, 1000, 1, false, false, false, false, false));
    }
    @Test public void confirmationBlocksMissingConsentRepeatAndUncertainWrites() {
        assertFalse(WorkbenchClientPolicy.canConfirm("{}", signature, 2000, 1000, 0, true, false, false, false, false));
        assertTrue(WorkbenchClientPolicy.canConfirm("{}", signature, 2000, 1000, 0, true, true, false, false, false));
        assertFalse(WorkbenchClientPolicy.canConfirm("{}", signature, 2000, 1000, 0, false, false, true, false, false));
        assertFalse(WorkbenchClientPolicy.canConfirm("{}", signature, 2000, 1000, 0, false, false, false, true, false));
    }
    @Test public void draftPayloadLimitsMatchServer() {
        String large = new String(new char[40001]).replace('\0', 'x');
        assertFalse(WorkbenchClientPolicy.canConfirm(large, signature, 2000, 1000, 0, false, false, false, false, true));
        assertTrue(WorkbenchClientPolicy.canConfirm(large, signature, 2000, 1000, 0, false, false, false, false, false));
        String tooLarge = new String(new char[46001]).replace('\0', 'x');
        assertFalse(WorkbenchClientPolicy.canConfirm(tooLarge, signature, 2000, 1000, 0, false, false, false, false, false));
    }
}
