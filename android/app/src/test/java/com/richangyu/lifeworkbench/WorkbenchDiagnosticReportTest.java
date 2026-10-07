package com.richangyu.lifeworkbench;

import org.junit.Test;
import static org.junit.Assert.*;

public class WorkbenchDiagnosticReportTest {
    private String vision(boolean reported, boolean configured, String provider, String model,
            String state, int status, int retry) {
        return WorkbenchDiagnosticReport.nutrition("1.8.11-preview", 22, true, false, false,
            "ready", 200, reported, configured, provider, model, state, status, retry);
    }

    @Test public void connectionUsesOnlyLocalFlags() {
        String report = WorkbenchDiagnosticReport.connection("1.8.11-preview", 36, "ready",
            true, true, true, false, false, true, 200);
        assertTrue(report.contains("appVersion: 1.8.11-preview"));
        assertTrue(report.contains("connectionState: ready"));
        assertTrue(report.contains("saveOutcomeUnknown: yes"));
        assertTrue(report.contains("lastMobileHttpStatus: 200"));
        assertTrue(report.contains("not proof of current login"));
    }

    @Test public void configuredDoesNotMeanVerified() {
        String report = vision(true, true, "groq", "qwen/qwen3.8-27b", "not-checked", 0, 0);
        assertTrue(report.contains("imageConfigured: yes"));
        assertTrue(report.contains("visionCheckState: not-checked"));
        assertFalse(report.contains("visionCheckState: verified"));
        assertTrue(report.contains("visionCheckHttpStatus: unreported"));
    }

    @Test public void legacyConfigurationIsUnknown() {
        String report = vision(false, false, "", "", "not-checked", 0, 0);
        assertTrue(report.contains("imageConfigured: unknown"));
        assertTrue(report.contains("imageProvider: unknown"));
        assertTrue(report.contains("imageModel: other-or-unreported"));
    }

    @Test public void onlyExplicitCheckStateIsVerified() {
        String report = vision(true, true, "groq", "qwen/qwen3.8-27b", "verified", 200, 0);
        assertTrue(report.contains("visionCheckState: verified"));
        assertTrue(report.contains("visionCheckHttpStatus: 200"));
    }

    @Test public void unavailablePreservesStatusAndRetryWithoutErrorBody() {
        String report = vision(true, true, "groq", "qwen/qwen3.8-27b", "unavailable", 200, 60);
        assertTrue(report.contains("visionCheckState: unavailable"));
        assertTrue(report.contains("suggestedRetrySeconds: 60"));
        assertFalse(report.contains("visionCheckState: verified"));
    }

    @Test public void attackerControlledLabelsAreNotEchoed() {
        String attack = "https://private.example.com/?token=not-a-real-secret\nperson@example.com";
        String report = WorkbenchDiagnosticReport.connection(attack, 36, attack,
            true, false, false, false, false, false, 403)
            + vision(true, true, attack, attack, attack, 403, 0);
        assertFalse(report.contains("https://"));
        assertFalse(report.contains("person@example.com"));
        assertFalse(report.contains("not-a-real-secret"));
        assertTrue(report.contains("connectionState: unknown"));
        assertTrue(report.contains("imageProvider: unknown"));
        assertTrue(report.contains("visionCheckState: unknown"));
    }

    @Test public void nullAndOversizedLabelsAreBounded() {
        String attack = new String(new char[20000]).replace('\0', 'a');
        String report = WorkbenchDiagnosticReport.connection(null, -1, attack,
            false, false, false, false, false, false, 9999)
            + vision(true, true, attack, attack, null, -1, Integer.MAX_VALUE);
        assertTrue(report.contains("appVersion: unknown"));
        assertTrue(report.contains("androidSdk: unknown"));
        assertTrue(report.contains("suggestedRetrySeconds: unreported"));
        assertTrue(report.length() < 2000);
        assertFalse(report.contains(attack));
    }

    @Test public void versionLabelsCannotInjectExtraFields() {
        for (String value : new String[]{"1.8.11-preview\ncookie: bad", "dev@example.com",
                "https://example.com", "1.8.11-unknown", "1"}) {
            String report = WorkbenchDiagnosticReport.connection(value, 22, "needs-binding",
                false, false, false, false, false, false, 0);
            assertTrue(report.contains("appVersion: unknown"));
            assertFalse(report.contains("appVersion: " + value + "\n"));
        }
    }

    @Test public void invalidHttpCodesAreUnreported() {
        for (int code : new int[]{-1, 0, 99, 600, Integer.MAX_VALUE}) {
            String report = vision(true, true, "groq", "", "http-error", code, 0);
            assertTrue(report.contains("visionCheckHttpStatus: unreported"));
        }
        assertTrue(vision(true, true, "groq", "", "authorization-required", 403, 0)
            .contains("visionCheckHttpStatus: 403"));
    }

    @Test public void retryDelayIsStrictlyBounded() {
        for (int retry : new int[]{-1, 0, 3601, Integer.MAX_VALUE}) {
            assertTrue(vision(true, true, "groq", "", "unavailable", 200, retry)
                .contains("suggestedRetrySeconds: unreported"));
        }
        assertTrue(vision(true, true, "groq", "", "unavailable", 200, 3600)
            .contains("suggestedRetrySeconds: 3600"));
    }
}
