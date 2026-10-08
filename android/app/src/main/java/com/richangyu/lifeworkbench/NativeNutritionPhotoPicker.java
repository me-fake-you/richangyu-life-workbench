package com.richangyu.lifeworkbench;

import android.app.Activity;
import android.content.ClipData;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Matrix;
import android.media.ExifInterface;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.provider.MediaStore;
import android.util.Base64;
import androidx.activity.result.ActivityResult;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.content.FileProvider;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Only the explicitly selected photo is read; no media-library or camera permission is requested. */
final class NativeNutritionPhotoPicker {
    interface Callback { void complete(Photo photo, String error); }
    static final class Photo {
        final byte[] jpeg;
        final String base64;
        final Bitmap preview;
        private Photo(byte[] jpeg, Bitmap preview) {
            this.jpeg = jpeg; this.preview = preview;
            this.base64 = Base64.encodeToString(jpeg, Base64.NO_WRAP);
        }
    }
    private final AppCompatActivity activity;
    private final ActivityResultLauncher<Intent> camera, album;
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private final Handler main = new Handler(Looper.getMainLooper());
    private Callback callback;
    private File capture;
    private Uri captureUri;
    private boolean busy;
    private volatile boolean closed;
    NativeNutritionPhotoPicker(AppCompatActivity activity) {
        this.activity = activity;
        camera = activity.registerForActivityResult(new ActivityResultContracts.StartActivityForResult(), this::cameraResult);
        album = activity.registerForActivityResult(new ActivityResultContracts.StartActivityForResult(), this::albumResult);
    }
    void pick(boolean useCamera, Callback result) {
        if (closed || busy) { result.complete(null, "\u56fe\u7247\u9009\u62e9\u5c1a\u672a\u7ed3\u675f\uff0c\u8bf7\u7a0d\u5019\u3002"); return; }
        busy = true; callback = result;
        try {
            if (useCamera) {
                capture = temporary(".jpg");
                captureUri = FileProvider.getUriForFile(activity, activity.getPackageName() + ".fileprovider", capture);
                Intent intent = new Intent(MediaStore.ACTION_IMAGE_CAPTURE)
                    .putExtra(MediaStore.EXTRA_OUTPUT, captureUri);
                intent.setClipData(ClipData.newRawUri("meal-photo", captureUri));
                intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
                camera.launch(intent);
            } else {
                Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE)
                    .setType("image/*").addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                album.launch(intent);
            }
        } catch (Exception ignored) {
            releaseCapture(true);
            finish(null, useCamera ? "\u65e0\u6cd5\u6253\u5f00\u7cfb\u7edf\u76f8\u673a\uff0c\u8bf7\u4f7f\u7528\u76f8\u518c\u6216\u624b\u52a8\u8bb0\u9910\u3002" : "\u65e0\u6cd5\u6253\u5f00\u56fe\u7247\u9009\u62e9\u5668\uff0c\u8bf7\u4f7f\u7528\u62cd\u7167\u6216\u624b\u52a8\u8bb0\u9910\u3002");
        }
    }
    private File temporary(String extension) throws IOException {
        File folder = new File(activity.getCacheDir(), "nutrition_photos");
        if (!folder.isDirectory() && !folder.mkdirs()) throw new IOException("Cannot create private photo cache");
        return File.createTempFile("meal-", extension, folder);
    }
    private void releaseCapture(boolean delete) {
        if (captureUri != null) {
            try { activity.revokeUriPermission(captureUri, Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION); }
            catch (Exception ignored) {}
        }
        if (delete && capture != null) capture.delete();
        capture = null; captureUri = null;
    }
    private void cameraResult(ActivityResult result) {
        if (!busy || closed) { releaseCapture(true); return; }
        File file = capture;
        releaseCapture(false);
        if (result.getResultCode() != Activity.RESULT_OK || file == null) {
            if (file != null) file.delete();
            finish(null, null); return;
        }
        prepare(null, file);
    }
    private void albumResult(ActivityResult result) {
        if (!busy || closed) return;
        Uri uri = result.getData() == null ? null : result.getData().getData();
        if (result.getResultCode() != Activity.RESULT_OK) { finish(null, null); return; }
        if (uri == null || !"content".equalsIgnoreCase(uri.getScheme())) {
            finish(null, "\u8bf7\u9009\u62e9\u7cfb\u7edf\u56fe\u7247\u9009\u62e9\u5668\u4e2d\u7684\u56fe\u7247\uff0c\u4e0d\u80fd\u4f7f\u7528\u7f51\u5740\u6216\u4efb\u610f\u6587\u4ef6\u8def\u5f84\u3002"); return;
        }
        prepare(uri, null);
    }
    private void prepare(Uri uri, File cameraFile) {
        worker.execute(() -> {
            File file = cameraFile;
            Photo photo = null;
            String error = null;
            try {
                if (file == null) {
                    file = temporary(".source");
                    try (InputStream in = activity.getContentResolver().openInputStream(uri);
                         FileOutputStream out = new FileOutputStream(file)) {
                        if (in == null) throw new IOException("Unreadable photo");
                        byte[] buffer = new byte[16384];
                        int count, total = 0;
                        while ((count = in.read(buffer)) != -1) {
                            if (closed || Thread.currentThread().isInterrupted()) throw new IOException("Cancelled");
                            total += count;
                            if (total > WorkbenchNutritionPhotoPolicy.MAX_SOURCE_BYTES) throw new IOException("Photo exceeds source limit");
                            out.write(buffer, 0, count);
                        }
                    }
                }
                if (closed || file.length() == 0 || file.length() > WorkbenchNutritionPhotoPolicy.MAX_SOURCE_BYTES) {
                    throw new IOException("Invalid photo length");
                }
                photo = normalize(file);
            } catch (Exception | OutOfMemoryError ignored) {
                error = "\u56fe\u7247\u65e0\u6cd5\u5904\u7406\uff1a\u8bf7\u9009\u4e0d\u8d85\u8fc7 12MB \u7684 JPEG\u3001PNG\u3001WebP \u6216\u8bbe\u5907\u652f\u6301\u7684 HEIC \u56fe\u7247\uff0c\u6216\u6539\u7528\u624b\u52a8\u8bb0\u9910\u3002\u672a\u4e0a\u4f20\u7167\u7247\u3002";
            } finally {
                // Delete only the temporary file allocated for this selection, never the source album URI.
                if (file != null) file.delete();
            }
            final Photo ready = photo;
            final String message = error;
            main.post(() -> finish(ready, message));
        });
    }
    private Photo normalize(File file) throws IOException {
        BitmapFactory.Options options = new BitmapFactory.Options();
        options.inJustDecodeBounds = true;
        BitmapFactory.decodeFile(file.getAbsolutePath(), options);
        if (!WorkbenchNutritionPhotoPolicy.sourceMime(options.outMimeType)) throw new IOException("Unsupported image");
        options.inSampleSize = WorkbenchNutritionPhotoPolicy.sampleSize(options.outWidth, options.outHeight);
        options.inJustDecodeBounds = false;
        options.inPreferredConfig = Bitmap.Config.ARGB_8888;
        Bitmap image = BitmapFactory.decodeFile(file.getAbsolutePath(), options);
        if (image == null) throw new IOException("Decode failed");
        try {
            int orientation = ExifInterface.ORIENTATION_NORMAL;
            try { orientation = new ExifInterface(file.getAbsolutePath()).getAttributeInt(ExifInterface.TAG_ORIENTATION, orientation); }
            catch (IOException ignored) {}
            Matrix matrix = new Matrix();
            switch (orientation) {
                case ExifInterface.ORIENTATION_FLIP_HORIZONTAL: matrix.setScale(-1, 1); break;
                case ExifInterface.ORIENTATION_ROTATE_180: matrix.setRotate(180); break;
                case ExifInterface.ORIENTATION_FLIP_VERTICAL: matrix.setScale(1, -1); break;
                case ExifInterface.ORIENTATION_TRANSPOSE: matrix.setRotate(90); matrix.postScale(-1, 1); break;
                case ExifInterface.ORIENTATION_ROTATE_90: matrix.setRotate(90); break;
                case ExifInterface.ORIENTATION_TRANSVERSE: matrix.setRotate(270); matrix.postScale(-1, 1); break;
                case ExifInterface.ORIENTATION_ROTATE_270: matrix.setRotate(270); break;
                default: break;
            }
            if (!matrix.isIdentity()) {
                Bitmap rotated = Bitmap.createBitmap(image, 0, 0, image.getWidth(), image.getHeight(), matrix, true);
                if (rotated != image) { image.recycle(); image = rotated; }
            }
            if (Math.max(image.getWidth(), image.getHeight()) > WorkbenchNutritionPhotoPolicy.MAX_EDGE) {
                float ratio = WorkbenchNutritionPhotoPolicy.MAX_EDGE / (float) Math.max(image.getWidth(), image.getHeight());
                Bitmap scaled = Bitmap.createScaledBitmap(image, Math.max(1, Math.round(image.getWidth() * ratio)),
                    Math.max(1, Math.round(image.getHeight() * ratio)), true);
                if (scaled != image) { image.recycle(); image = scaled; }
            }
            for (int attempt = 0; attempt < 2; attempt++) {
                for (int quality : new int[]{85, 70, 55, 40}) {
                    ByteArrayOutputStream out = new ByteArrayOutputStream();
                    if (!image.compress(Bitmap.CompressFormat.JPEG, quality, out)) throw new IOException("JPEG encoding failed");
                    byte[] jpeg = out.toByteArray();
                    if (WorkbenchNutritionPhotoPolicy.validJpeg(jpeg)) {
                        // Bitmap re-encoding removes original EXIF/location metadata and original filename.
                        Photo photo = new Photo(jpeg, image); image = null; return photo;
                    }
                }
                Bitmap scaled = Bitmap.createScaledBitmap(image, Math.max(1, image.getWidth() / 2),
                    Math.max(1, image.getHeight() / 2), true);
                if (scaled != image) { image.recycle(); image = scaled; }
            }
            throw new IOException("Compressed photo still too large");
        } finally { if (image != null) image.recycle(); }
    }
    private void finish(Photo photo, String error) {
        if (closed) { if (photo != null) photo.preview.recycle(); return; }
        Callback result = callback;
        callback = null; busy = false;
        if (result != null) result.complete(photo, error);
        else if (photo != null) photo.preview.recycle();
    }
    void close() {
        closed = true; callback = null;
        releaseCapture(true);
        worker.shutdownNow();
        camera.unregister(); album.unregister();
    }
}
