# Android 1.8.9-preview: photo meals in the native nutrition screen

## Where to find it
After installing this version, open Home or My > 热量与饮食 > 打开热量与饮食 > 拍照 / 相册记餐.
Select 拍照 or 从相册选择, review the local preview, add food/portion notes, then explicitly confirm upload and save.

## Included
- System camera capture or a user-selected image through the document picker; no broad camera/storage/media-library permission.
- Local background preparation: bounded input (12 MiB), dimension checks, orientation handling where supported by the platform, downsampling to at most 1280 pixels per edge, JPEG output capped at 512 KiB.
- Bitmap re-encoding removes original image metadata and original filename before upload. Only the explicitly chosen image is read.
- Narrow FileProvider cache path, temporary URI grants, and cleanup of the temporary file for the current selection. Album originals are not changed.
- Small acknowledged chunks transfer the prepared image to the existing authenticated session; the final fixed-endpoint multipart request is submitted once, after all chunks arrive.
- Existing meal photo storage and AI estimation use the bound workbench's original /api/nutrition interface. No native API key, private site address, cookie extraction, or new external upload endpoint.
- Upload confirmation explains that the workbench may forward the image to its configured image AI provider.
- Receipt distinguishes manual nutrition, a configured image AI estimate, local/text fallback, and unknown source. A saved photo does not prove image recognition succeeded.
- Longer bounded response timeout for image inference. Uncertain saves retain the previous no-auto-retry protection and require checking cloud data.

## Important limits
- Image AI availability depends on the existing server's vision configuration. A free text/chat API alone does not make the existing vision endpoint available. This release does not configure a paid provider or promise free/unlimited image inference.
- The server's existing endpoint estimates and saves in one operation. You confirm the image before submission; afterwards, verify or correct the returned estimate in the meal list. This is not a separate pre-save analysis preview.
- Compressed images can lose detail. Some older Android versions cannot decode HEIC or fully interpret non-JPEG orientation.
- Local, unsaved image/editor state is not a durable draft and is discarded when the Activity/process is destroyed. No automatic re-upload is attempted.
- Temporary raw input left by a process crash is in private app cache, not public media storage; system cache cleanup/app removal may clear it.
- Nutrition values are estimates for recordkeeping, not precise measurements or individualized medical advice.
- This remains a personal-workbench preview. It does not open the private workbench to public signup or deploy the separate multiuser service.
- A physical Android phone is still required to confirm camera/provider compatibility, install/cover-install, login, image save and cross-device synchronization. Those checks are not claimed by this document.

## Package and signing
- Package: com.richangyu.lifeworkbench.preview
- Version: 1.8.9-preview
- Version code: 10011
- Minimum SDK: 22; target SDK: 36
- Uses the existing pinned persistent preview certificate. The formal signing key and private workbench permissions are unchanged.

Implementation follows the Android [Activity Result APIs](https://developer.android.com/training/basics/intents/result) and [FileProvider](https://developer.android.com/reference/androidx/core/content/FileProvider) patterns.
