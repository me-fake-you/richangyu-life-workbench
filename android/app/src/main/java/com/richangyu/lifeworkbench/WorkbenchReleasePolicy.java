package com.richangyu.lifeworkbench;

import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Release metadata is informational. Only Android validates an APK for installation. */
final class WorkbenchReleasePolicy {
    static final String REPOSITORY = "me-fake-you/richangyu-life-workbench";
    static final String PREVIEW_PACKAGE = "com.richangyu.lifeworkbench.preview";
    static final String RELEASES_PAGE = "https://github.com/" + REPOSITORY + "/releases";
    static final String RELEASES_API = "https://api.github.com/repos/" + REPOSITORY + "/releases?per_page=20";
    private static final String NUMBER = "(0|[1-9][0-9]{0,5})";
    private static final Pattern VERSION = Pattern.compile("^" + NUMBER + "\\." + NUMBER + "\\." + NUMBER + "(?:-preview)?$");
    private static final Pattern CERTIFICATE = Pattern.compile("^[0-9a-fA-F]{64}$");

    static final class Version implements Comparable<Version> {
        final int major, minor, patch;
        Version(int major, int minor, int patch) { this.major = major; this.minor = minor; this.patch = patch; }
        @Override public int compareTo(Version other) {
            int result = Integer.compare(major, other.major);
            if (result == 0) result = Integer.compare(minor, other.minor);
            return result == 0 ? Integer.compare(patch, other.patch) : result;
        }
    }

    static Version version(String value) {
        if (value == null || value.length() > 32) return null;
        Matcher match = VERSION.matcher(value);
        if (!match.matches()) return null;
        return new Version(Integer.parseInt(match.group(1)), Integer.parseInt(match.group(2)), Integer.parseInt(match.group(3)));
    }

    static boolean previewTag(String tag) {
        return tag != null && tag.startsWith("v") && tag.endsWith("-preview") && version(tag.substring(1)) != null;
    }
    static boolean previewRelease(String tag, boolean draft, boolean prerelease) {
        return !draft && prerelease && previewTag(tag);
    }
    static String releasePage(String tag) {
        return previewTag(tag) ? RELEASES_PAGE + "/tag/" + tag : "";
    }
    static String apkName(String tag) {
        return previewTag(tag) ? "life-workbench-" + tag + ".apk" : "";
    }
    static boolean trustedPage(String url) {
        if (RELEASES_PAGE.equals(url)) return true;
        String prefix = RELEASES_PAGE + "/tag/";
        return url != null && url.startsWith(prefix) && previewTag(url.substring(prefix.length()));
    }
    static boolean validAsset(String tag, String name, String url, long bytes, String digest) {
        return previewTag(tag) && apkName(tag).equals(name) && bytes > 0 && bytes <= 150000000
            && ("https://github.com/" + REPOSITORY + "/releases/download/" + tag + "/" + name).equals(url)
            && digest != null && digest.startsWith("sha256:") && certificate(digest.substring(7)) != null;
    }
    static String certificate(String value) {
        return value != null && CERTIFICATE.matcher(value).matches() ? value.toLowerCase(Locale.ROOT) : null;
    }
    static String marker(String body, String key) {
        if (body == null || body.length() > 100000 || key == null || !key.matches("[a-z-]+")) return "";
        Pattern pattern = Pattern.compile("<!-- workbench-preview-" + Pattern.quote(key) + ": ([A-Za-z0-9._-]+) -->");
        Matcher match = pattern.matcher(body);
        if (!match.find()) return "";
        String value = match.group(1);
        return match.find() ? "" : value;
    }
    static long versionCode(String body) {
        String value = marker(body, "version-code");
        if (!value.matches("[1-9][0-9]{0,9}")) return 0;
        try {
            long code = Long.parseLong(value);
            return code <= Integer.MAX_VALUE ? code : 0;
        } catch (NumberFormatException error) { return 0; }
    }

    static final class Candidate {
        final String tag, page, packageName, certificate, sha256;
        final long versionCode, bytes;
        final boolean persistent;
        final Version version;
        Candidate(String tag, String page, String packageName, String certificate, String sha256,
                  long versionCode, long bytes, boolean persistent) {
            this.tag = tag; this.page = page; this.packageName = packageName;
            this.certificate = WorkbenchReleasePolicy.certificate(certificate);
            this.sha256 = sha256; this.versionCode = versionCode; this.bytes = bytes; this.persistent = persistent;
            this.version = previewTag(tag) ? WorkbenchReleasePolicy.version(tag.substring(1)) : null;
        }
    }
    enum Compatibility { SAME_SIGNER, DIFFERENT_SIGNER, UNKNOWN, NON_INCREASING_VERSION }
    static Compatibility compatibility(Candidate candidate, String installedCertificate, long installedVersionCode) {
        String local = certificate(installedCertificate);
        if (candidate == null || !PREVIEW_PACKAGE.equals(candidate.packageName) || candidate.certificate == null
                || local == null || candidate.versionCode <= 0 || installedVersionCode <= 0) return Compatibility.UNKNOWN;
        if (candidate.versionCode <= installedVersionCode) return Compatibility.NON_INCREASING_VERSION;
        return candidate.certificate.equals(local) ? Compatibility.SAME_SIGNER : Compatibility.DIFFERENT_SIGNER;
    }
    private WorkbenchReleasePolicy() {}
}
