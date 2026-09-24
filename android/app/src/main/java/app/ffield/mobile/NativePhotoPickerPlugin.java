package app.ffield.mobile;

import android.Manifest;
import android.app.Activity;
import android.content.ClipData;
import android.content.ContentUris;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.media.ExifInterface;
import android.net.Uri;
import android.os.Build;
import android.provider.DocumentsContract;
import android.provider.MediaStore;
import android.util.Base64;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.text.ParseException;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.TimeZone;

@CapacitorPlugin(
    name = "NativePhotoPicker",
    permissions = {
        @Permission(strings = { Manifest.permission.ACCESS_MEDIA_LOCATION }, alias = "mediaLocation")
    }
)
public class NativePhotoPickerPlugin extends Plugin {

    private static final int DEFAULT_MAX_COUNT = 5;

    @PluginMethod
    public void pickImages(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
            && getPermissionState("mediaLocation") != PermissionState.GRANTED) {
            requestPermissionForAlias("mediaLocation", call, "mediaLocationPermissionCallback");
            return;
        }
        openPicker(call);
    }

    @PermissionCallback
    private void mediaLocationPermissionCallback(PluginCall call) {
        if (call == null) return;
        openPicker(call);
    }

    private void openPicker(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("image/*");
        intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        intent.addFlags(Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
        startActivityForResult(call, intent, "pickImagesResult");
    }

    @ActivityCallback
    private void pickImagesResult(PluginCall call, ActivityResult result) {
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            call.reject("Photo selection canceled");
            return;
        }

        try {
            int maxCount = call.getInt("maxCount", DEFAULT_MAX_COUNT);
            List<Uri> uris = getSelectedUris(result.getData());
            if (uris.isEmpty()) {
                call.reject("No photo selected");
                return;
            }
            if (uris.size() > maxCount) {
                call.reject("사진은 최대 " + maxCount + "장까지만 저장할 수 있습니다.");
                return;
            }

            JSArray items = new JSArray();
            for (Uri uri : uris) {
                items.put(readPhoto(uri));
            }

            JSObject response = new JSObject();
            response.put("items", items);
            call.resolve(response);
        } catch (Exception error) {
            call.reject("Native photo picker failed: " + error.getMessage(), error);
        }
    }

    private List<Uri> getSelectedUris(Intent data) {
        List<Uri> uris = new ArrayList<>();
        ClipData clipData = data.getClipData();
        if (clipData != null) {
            for (int i = 0; i < clipData.getItemCount(); i++) {
                Uri uri = clipData.getItemAt(i).getUri();
                if (uri != null) uris.add(uri);
            }
        } else if (data.getData() != null) {
            uris.add(data.getData());
        }
        return uris;
    }

    private JSObject readPhoto(Uri uri) throws Exception {
        try {
            getContext().getContentResolver().takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION);
        } catch (Exception ignored) {
            // Some providers do not support persistable permissions. The transient grant is enough here.
        }

        byte[] bytes = readPhotoBytes(uri);
        String mimeType = getContext().getContentResolver().getType(uri);
        if (mimeType == null || mimeType.trim().isEmpty()) mimeType = "image/jpeg";

        ExifInterface exif = new ExifInterface(new ByteArrayInputStream(bytes));
        float[] latLong = new float[2];
        boolean hasGps = exif.getLatLong(latLong);

        JSObject item = new JSObject();
        item.put("uri", uri.toString());
        item.put("mimeType", mimeType);
        item.put("dataUrl", "data:" + mimeType + ";base64," + Base64.encodeToString(bytes, Base64.NO_WRAP));
        String takenAt = getTakenAtIso(exif);
        if (takenAt != null) item.put("takenAt", takenAt);
        if (hasGps) {
            JSObject gps = new JSObject();
            gps.put("lat", latLong[0]);
            gps.put("lng", latLong[1]);
            item.put("gps", gps);
        }
        return item;
    }

    private byte[] readPhotoBytes(Uri uri) throws Exception {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
            && getContext().checkSelfPermission(Manifest.permission.ACCESS_MEDIA_LOCATION) == PackageManager.PERMISSION_GRANTED) {
            for (Uri candidate : getOriginalUriCandidates(uri)) {
                try {
                    return readAllBytes(MediaStore.setRequireOriginal(candidate));
                } catch (SecurityException ignored) {
                    // Some providers reject requireOriginal even after ACTION_OPEN_DOCUMENT. Fall back below.
                } catch (Exception ignored) {
                    // Continue trying the next candidate before falling back to the granted document URI.
                }
            }
        }

        return readAllBytes(uri);
    }

    private List<Uri> getOriginalUriCandidates(Uri uri) {
        List<Uri> candidates = new ArrayList<>();
        candidates.add(uri);
        Uri mediaStoreUri = getMediaStoreUriFromDocumentUri(uri);
        if (mediaStoreUri != null && !mediaStoreUri.equals(uri)) candidates.add(mediaStoreUri);
        return candidates;
    }

    private Uri getMediaStoreUriFromDocumentUri(Uri uri) {
        try {
            if (!DocumentsContract.isDocumentUri(getContext(), uri)) return null;
            if (!"com.android.providers.media.documents".equals(uri.getAuthority())) return null;
            String documentId = DocumentsContract.getDocumentId(uri);
            String[] parts = documentId.split(":");
            if (parts.length != 2 || !"image".equals(parts[0])) return null;
            long id = Long.parseLong(parts[1]);
            return ContentUris.withAppendedId(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, id);
        } catch (Exception ignored) {
            return null;
        }
    }

    private byte[] readAllBytes(Uri uri) throws Exception {
        try (InputStream inputStream = getContext().getContentResolver().openInputStream(uri);
             ByteArrayOutputStream outputStream = new ByteArrayOutputStream()) {
            if (inputStream == null) throw new Exception("Could not open photo");
            byte[] buffer = new byte[8192];
            int read;
            while ((read = inputStream.read(buffer)) != -1) {
                outputStream.write(buffer, 0, read);
            }
            return outputStream.toByteArray();
        }
    }

    private String getTakenAtIso(ExifInterface exif) {
        String value = exif.getAttribute(ExifInterface.TAG_DATETIME_ORIGINAL);
        if (value == null || value.trim().isEmpty()) value = exif.getAttribute(ExifInterface.TAG_DATETIME);
        if (value == null || value.trim().isEmpty()) return null;

        try {
            SimpleDateFormat inputFormat = new SimpleDateFormat("yyyy:MM:dd HH:mm:ss", Locale.US);
            Date date = inputFormat.parse(value);
            if (date == null) return null;
            SimpleDateFormat outputFormat = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
            outputFormat.setTimeZone(TimeZone.getTimeZone("UTC"));
            return outputFormat.format(date);
        } catch (ParseException ignored) {
            return null;
        }
    }
}
