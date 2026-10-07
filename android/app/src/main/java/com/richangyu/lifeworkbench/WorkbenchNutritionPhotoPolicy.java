package com.richangyu.lifeworkbench;

/** Bounded photo preparation and transport, independent of Android widgets. */
final class WorkbenchNutritionPhotoPolicy {
    static final int MAX_SOURCE_BYTES = 12 * 1024 * 1024;
    static final int MAX_UPLOAD_BYTES = 512 * 1024;
    static final int MAX_EDGE = 1280;
    static final int CHUNK_CHARS = 24576;
    static final int RESPONSE_TIMEOUT_MS = 130000;
    static final int FETCH_TIMEOUT_MS = 120000;
    private WorkbenchNutritionPhotoPolicy() {}
    static int sampleSize(int width, int height) {
        if (width <= 0 || height <= 0 || width > 30000 || height > 30000
                || (long) width * height > 100000000L) {
            throw new IllegalArgumentException("Unsupported image dimensions");
        }
        int sample = 1;
        while ((width + sample - 1) / sample > MAX_EDGE || (height + sample - 1) / sample > MAX_EDGE) sample *= 2;
        return sample;
    }
    static boolean sourceMime(String type) {
        return "image/jpeg".equals(type) || "image/png".equals(type) || "image/webp".equals(type)
            || "image/heic".equals(type) || "image/heif".equals(type);
    }
    static boolean validJpeg(byte[] bytes) {
        return bytes != null && bytes.length >= 4 && bytes.length <= MAX_UPLOAD_BYTES
            && (bytes[0] & 255) == 255 && (bytes[1] & 255) == 216
            && (bytes[bytes.length - 2] & 255) == 255 && (bytes[bytes.length - 1] & 255) == 217;
    }
    static String estimateSource(boolean manual, String provider, String source) {
        if (manual || "manual".equals(source)) return "manual";
        if ("vision".equals(source) || "vision+memory".equals(source)) return "vision";
        if ("text".equals(source) || "text+memory".equals(source)) return "text";
        return estimateSource(false, provider);
    }
    static String estimateSource(boolean manual, String provider) {
        if (manual) return "manual";
        if ("openai".equals(provider) || "nvidia".equals(provider) || "groq".equals(provider)) return "vision";
        if ("local".equals(provider)) return "text";
        return "unknown";
    }
}
