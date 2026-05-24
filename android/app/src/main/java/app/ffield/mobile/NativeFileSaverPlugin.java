package app.ffield.mobile;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.util.Base64;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.io.OutputStream;

@CapacitorPlugin(name = "NativeFileSaver")
public class NativeFileSaverPlugin extends Plugin {

    private String pendingBase64;
    private String pendingSourceUri;
    private String pendingFileName;

    @PluginMethod
    public void save(PluginCall call) {
        String fileName = call.getString("fileName");
        String mimeType = call.getString("mimeType", "application/octet-stream");
        String base64 = call.getString("base64");

        if (fileName == null || fileName.trim().isEmpty()) {
            call.reject("fileName is required");
            return;
        }

        if (base64 == null || base64.isEmpty()) {
            call.reject("base64 is required");
            return;
        }

        int markerIndex = base64.indexOf(";base64,");
        if (markerIndex >= 0) {
            base64 = base64.substring(markerIndex + 8);
        }

        pendingBase64 = base64;
        pendingFileName = fileName;

        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(mimeType);
        intent.putExtra(Intent.EXTRA_TITLE, fileName);

        startActivityForResult(call, intent, "saveResult");
    }

    @PluginMethod
    public void saveFromUri(PluginCall call) {
        String fileName = call.getString("fileName");
        String mimeType = call.getString("mimeType", "application/octet-stream");
        String sourceUri = call.getString("sourceUri");

        if (fileName == null || fileName.trim().isEmpty()) {
            call.reject("fileName is required");
            return;
        }

        if (sourceUri == null || sourceUri.isEmpty()) {
            call.reject("sourceUri is required");
            return;
        }

        pendingSourceUri = sourceUri;
        pendingBase64 = null;
        pendingFileName = fileName;

        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(mimeType);
        intent.putExtra(Intent.EXTRA_TITLE, fileName);

        startActivityForResult(call, intent, "saveResult");
    }

    @ActivityCallback
    private void saveResult(PluginCall call, ActivityResult result) {
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            clearPending();
            call.reject("Save canceled");
            return;
        }

        Uri uri = result.getData().getData();
        if (uri == null) {
            clearPending();
            call.reject("No file destination selected");
            return;
        }

        try (OutputStream outputStream = getContext().getContentResolver().openOutputStream(uri)) {
            if (outputStream == null) {
                throw new Exception("Could not open output stream");
            }

            if (pendingSourceUri != null) {
                copySourceUriToOutputStream(pendingSourceUri, outputStream);
            } else {
                byte[] bytes = Base64.decode(pendingBase64, Base64.DEFAULT);
                outputStream.write(bytes);
            }
            outputStream.flush();

            JSObject response = new JSObject();
            response.put("uri", uri.toString());
            response.put("fileName", pendingFileName);
            call.resolve(response);
        } catch (Exception err) {
            call.reject("Save failed: " + err.getMessage(), err);
        } finally {
            clearPending();
        }
    }

    private void clearPending() {
        pendingBase64 = null;
        pendingSourceUri = null;
        pendingFileName = null;
    }

    private void copySourceUriToOutputStream(String sourceUri, OutputStream outputStream) throws Exception {
        Uri uri = Uri.parse(sourceUri);
        InputStream inputStream;

        if ("file".equals(uri.getScheme())) {
            inputStream = new FileInputStream(new File(uri.getPath()));
        } else {
            inputStream = getContext().getContentResolver().openInputStream(uri);
        }

        if (inputStream == null) {
            throw new Exception("Could not open source file");
        }

        try (InputStream in = inputStream) {
            byte[] buffer = new byte[64 * 1024];
            int read;
            while ((read = in.read(buffer)) != -1) {
                outputStream.write(buffer, 0, read);
            }
        }
    }
}
