package com.richangyu.lifeworkbench;

import org.junit.Test;
import static org.junit.Assert.*;

public class WorkbenchReleasePolicyTest {
    private static final String A = repeat('a');
    private static final String B = repeat('b');
    private static String repeat(char character) {
        StringBuilder value = new StringBuilder();
        for (int i = 0; i < 64; i++) value.append(character);
        return value.toString();
    }
    private WorkbenchReleasePolicy.Candidate candidate(String packageName, String certificate, long code) {
        return new WorkbenchReleasePolicy.Candidate("v1.8.4-preview",
            WorkbenchReleasePolicy.releasePage("v1.8.4-preview"), packageName, certificate, A, code, 3000000, false);
    }

    @Test public void versionsCompareNumerically() {
        assertTrue(WorkbenchReleasePolicy.version("1.8.10-preview").compareTo(WorkbenchReleasePolicy.version("1.8.9")) > 0);
        assertTrue(WorkbenchReleasePolicy.version("2.0.0").compareTo(WorkbenchReleasePolicy.version("1.99.99")) > 0);
        assertEquals(0, WorkbenchReleasePolicy.version("1.8.4").compareTo(WorkbenchReleasePolicy.version("1.8.4-preview")));
    }
    @Test public void malformedOrUnboundedVersionsAreRejected() {
        for (String value : new String[] {null, "", "v1.8.4", "01.8.4", "1.8", "1.8.4-beta",
            "1.8.4-preview?x", "-1.8.4", "1000000.8.4", "1.8.4-preview\n"})
            assertNull(value, WorkbenchReleasePolicy.version(value));
    }
    @Test public void onlyPublishedPreviewChannelIsAccepted() {
        assertTrue(WorkbenchReleasePolicy.previewRelease("v1.8.4-preview", false, true));
        assertFalse(WorkbenchReleasePolicy.previewRelease("v1.8.4-preview", true, true));
        assertFalse(WorkbenchReleasePolicy.previewRelease("v1.8.4-preview", false, false));
        assertFalse(WorkbenchReleasePolicy.previewRelease("v1.8.4", false, true));
        assertFalse(WorkbenchReleasePolicy.previewTag("v01.8.4-preview"));
    }
    @Test public void onlyCanonicalOfficialPagesAreAccepted() {
        String page = WorkbenchReleasePolicy.releasePage("v1.8.4-preview");
        assertTrue(WorkbenchReleasePolicy.trustedPage(page));
        assertTrue(WorkbenchReleasePolicy.trustedPage(WorkbenchReleasePolicy.RELEASES_PAGE));
        for (String url : new String[] {null, page + "?x=1", page + "#fragment", page + "/",
            page.replace("https:", "http:"), page.replace("github.com", "github.com.evil.test"),
            page.replace("github.com", "evil.test@github.com"), "file:///tmp/app.apk", "intent://app"})
            assertFalse(url, WorkbenchReleasePolicy.trustedPage(url));
    }
    @Test public void exactAssetNameAddressSizeAndDigestAreRequired() {
        String tag = "v1.8.4-preview";
        String name = WorkbenchReleasePolicy.apkName(tag);
        String url = "https://github.com/" + WorkbenchReleasePolicy.REPOSITORY + "/releases/download/" + tag + "/" + name;
        assertTrue(WorkbenchReleasePolicy.validAsset(tag, name, url, 3000000, "sha256:" + A));
        assertFalse(WorkbenchReleasePolicy.validAsset(tag, name + ".1", url, 3000000, "sha256:" + A));
        assertFalse(WorkbenchReleasePolicy.validAsset(tag, name, url + "?download=1", 3000000, "sha256:" + A));
        assertFalse(WorkbenchReleasePolicy.validAsset(tag, name, url, 0, "sha256:" + A));
        assertFalse(WorkbenchReleasePolicy.validAsset(tag, name, url, 150000001, "sha256:" + A));
        assertFalse(WorkbenchReleasePolicy.validAsset(tag, name, url, 3000000, "sha256:invalid"));
    }
    @Test public void certificateFingerprintsAreNormalizedAndValidated() {
        assertEquals(A, WorkbenchReleasePolicy.certificate(A.toUpperCase(java.util.Locale.ROOT)));
        assertNull(WorkbenchReleasePolicy.certificate(null));
        assertNull(WorkbenchReleasePolicy.certificate(A + " "));
        assertNull(WorkbenchReleasePolicy.certificate(A.substring(1)));
    }
    @Test public void releaseMarkersMustBeUniqueAndVersionCodeBounded() {
        String body = "<!-- workbench-preview-version-code: 10006 -->";
        assertEquals(10006, WorkbenchReleasePolicy.versionCode(body));
        assertEquals(0, WorkbenchReleasePolicy.versionCode(body + body));
        assertEquals(0, WorkbenchReleasePolicy.versionCode("<!-- workbench-preview-version-code: 2147483648 -->"));
        assertEquals(0, WorkbenchReleasePolicy.versionCode("<!-- workbench-preview-version-code: 01 -->"));
        assertEquals("", WorkbenchReleasePolicy.marker("", "package"));
    }
    @Test public void sameSignerStillRequiresIncreasingVersionCode() {
        WorkbenchReleasePolicy.Candidate next = candidate(WorkbenchReleasePolicy.PREVIEW_PACKAGE, A, 10006);
        assertEquals(WorkbenchReleasePolicy.Compatibility.SAME_SIGNER, WorkbenchReleasePolicy.compatibility(next, A, 10005));
        assertEquals(WorkbenchReleasePolicy.Compatibility.NON_INCREASING_VERSION, WorkbenchReleasePolicy.compatibility(next, A, 10006));
    }
    @Test public void differentSignerDoesNotPromiseCoverInstallation() {
        assertEquals(WorkbenchReleasePolicy.Compatibility.DIFFERENT_SIGNER,
            WorkbenchReleasePolicy.compatibility(candidate(WorkbenchReleasePolicy.PREVIEW_PACKAGE, A, 10006), B, 10005));
    }
    @Test public void missingOrWrongPackageCertificateAndVersionAreUnknown() {
        assertEquals(WorkbenchReleasePolicy.Compatibility.UNKNOWN,
            WorkbenchReleasePolicy.compatibility(candidate("other.app", A, 10006), A, 10005));
        assertEquals(WorkbenchReleasePolicy.Compatibility.UNKNOWN,
            WorkbenchReleasePolicy.compatibility(candidate(WorkbenchReleasePolicy.PREVIEW_PACKAGE, null, 10006), A, 10005));
        assertEquals(WorkbenchReleasePolicy.Compatibility.UNKNOWN,
            WorkbenchReleasePolicy.compatibility(candidate(WorkbenchReleasePolicy.PREVIEW_PACKAGE, A, 0), A, 10005));
        assertEquals(WorkbenchReleasePolicy.Compatibility.UNKNOWN,
            WorkbenchReleasePolicy.compatibility(candidate(WorkbenchReleasePolicy.PREVIEW_PACKAGE, A, 10006), null, 10005));
    }
}
