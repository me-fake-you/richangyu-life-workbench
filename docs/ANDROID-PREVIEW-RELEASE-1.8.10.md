# Android 1.8.10-preview: explicit image AI support and connection checks

## Included
- Native nutrition screen shows image-provider configuration separately from verified connectivity.
- A user-confirmed connection check sends a synthetic colored square to Groq. It uploads no personal photo and saves no meal, water log, or settings.
- The server caches this probe for 60 seconds per Worker isolate to reduce repeated quota use. This is not a global rate limit.
- Groq image support is an explicit opt-in through GROQ_VISION_MODEL=qwen/qwen3.8-27b, using the existing server-side key. The text model remains unchanged.
- Groq mode never silently falls back to OpenAI or NVIDIA. Unavailable image inference uses clearly labeled local/text estimation.
- Reject incomplete or non-finite nutrition output instead of reporting false image success. Zero values are preserved.
- Manual nutrition entry skips external image inference while still saving the selected photo.
- Receipts distinguish image estimation with personal food-memory adjustments from text-only estimation.
- Web nutrition includes the same configuration card and non-saving connection check.
- The native bridge remains limited to the existing bound nutrition endpoint. No API key or private workbench address is included in the APK.

## Use
Install this version over the existing preview using the same fixed preview certificate.
Open Home or My, then the nutrition screen. Use the image AI connection check before trying a photo meal.
Check and correct the food quantities and returned nutrition values after saving.

## Limits and privacy
Groq lists this vision model in its free-plan rate-limit table, but account availability, permissions and quota still control access.
The model is currently a provider preview and may be removed. No paid service or billing upgrade is enabled by this release.
A passed color-image probe proves only that the image endpoint responded correctly at that time, not meal accuracy or phone camera compatibility.
This release does not open the private workbench to public signup or deploy the separate multiuser service.
Physical-phone install, camera, login, meal save and cross-device synchronization still require the user's test.

## Package
- Package: com.richangyu.lifeworkbench.preview
- Version: 1.8.10-preview
- Version code: 10012
- Minimum SDK: 22; target SDK: 36
- Existing pinned persistent preview signing; formal signing unchanged.

Sources: [Groq vision](https://console.groq.com/docs/vision), [free-plan rate limits](https://console.groq.com/docs/rate-limits), [model availability](https://console.groq.com/docs/models).
