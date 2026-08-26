package com.axuanran.yesplaymusic;

import android.app.Activity;
import android.content.ClipData;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLConnection;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "TrackDownload")
public class TrackDownloadPlugin extends Plugin {
    private static final int BUFFER_SIZE = 64 * 1024;
    private static final long PROGRESS_INTERVAL_MS = 200L;
    private static final String USER_AGENT =
        "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/124.0 Mobile Safari/537.36";

    private final ExecutorService executor = Executors.newCachedThreadPool();

    @PluginMethod
    public void download(PluginCall call) {
        final String sourceUrl = call.getString("url", "");
        final String requestedName = call.getString("fileName", "track");

        if (sourceUrl == null || sourceUrl.trim().isEmpty()) {
            call.reject("Missing track download URL");
            return;
        }

        String fileName = sanitizeFileName(requestedName);
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(resolveMimeType(null, fileName));
        intent.putExtra(Intent.EXTRA_TITLE, fileName);
        intent.addFlags(
            Intent.FLAG_GRANT_READ_URI_PERMISSION |
            Intent.FLAG_GRANT_WRITE_URI_PERMISSION |
            Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION
        );
        startActivityForResult(call, intent, "downloadTargetSelected");
    }

    @ActivityCallback
    private void downloadTargetSelected(PluginCall call, ActivityResult activityResult) {
        if (call == null) return;

        Intent data = activityResult == null ? null : activityResult.getData();
        Uri targetUri = data == null ? null : data.getData();
        if (
            activityResult == null ||
            activityResult.getResultCode() != Activity.RESULT_OK ||
            targetUri == null
        ) {
            JSObject result = new JSObject();
            result.put("status", "canceled");
            call.resolve(result);
            return;
        }

        persistUriPermission(data, targetUri);

        final String sourceUrl = call.getString("url", "");
        final String requestedName = call.getString("fileName", "track");
        final String requestId = call.getString("requestId", "");
        executor.execute(() -> downloadToUri(call, sourceUrl, requestedName, requestId, targetUri));
    }

    @PluginMethod
    public void share(PluginCall call) {
        String uriValue = call.getString("uri", "");
        String mimeType = call.getString("mimeType", "audio/*");
        String chooserTitle = call.getString("chooserTitle", "Share original track");

        if (uriValue == null || uriValue.trim().isEmpty()) {
            call.reject("Missing downloaded track URI");
            return;
        }

        try {
            Uri uri = Uri.parse(uriValue);
            Intent shareIntent = new Intent(Intent.ACTION_SEND);
            shareIntent.setType(
                mimeType == null || mimeType.trim().isEmpty() ? "audio/*" : mimeType
            );
            shareIntent.putExtra(Intent.EXTRA_STREAM, uri);
            shareIntent.setClipData(ClipData.newRawUri("track", uri));
            shareIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            getActivity().startActivity(Intent.createChooser(shareIntent, chooserTitle));
            call.resolve();
        } catch (Exception error) {
            call.reject(
                error.getMessage() == null ? error.toString() : error.getMessage(),
                error
            );
        }
    }

    private void downloadToUri(
        PluginCall call,
        String sourceUrl,
        String requestedName,
        String requestId,
        Uri targetUri
    ) {
        HttpURLConnection connection = null;
        try {
            connection = openConnection(sourceUrl);
            int status = connection.getResponseCode();
            if (status < 200 || status >= 300) {
                throw new IOException("Track server returned HTTP " + status);
            }

            String mimeType = resolveMimeType(connection.getContentType(), requestedName);
            long totalBytes = connection.getContentLengthLong();
            long receivedBytes = 0L;
            long lastProgressAt = 0L;
            notifyProgress(requestId, receivedBytes, totalBytes);

            OutputStream rawOutput = getContext().getContentResolver().openOutputStream(targetUri, "w");
            if (rawOutput == null) throw new IOException("Unable to open selected download file");

            try (
                InputStream input = new BufferedInputStream(connection.getInputStream(), BUFFER_SIZE);
                OutputStream output = new BufferedOutputStream(rawOutput, BUFFER_SIZE)
            ) {
                byte[] buffer = new byte[BUFFER_SIZE];
                int read;
                while ((read = input.read(buffer)) != -1) {
                    output.write(buffer, 0, read);
                    receivedBytes += read;

                    long now = System.currentTimeMillis();
                    if (now - lastProgressAt >= PROGRESS_INTERVAL_MS) {
                        notifyProgress(requestId, receivedBytes, totalBytes);
                        lastProgressAt = now;
                    }
                }
                output.flush();
            }

            notifyProgress(requestId, receivedBytes, totalBytes);

            JSObject result = new JSObject();
            result.put("status", "completed");
            result.put("uri", targetUri.toString());
            result.put("fileName", queryDisplayName(targetUri, sanitizeFileName(requestedName)));
            result.put("mimeType", mimeType);
            result.put("size", receivedBytes);
            result.put("userSelectedLocation", true);
            result.put("publicMusicLibrary", false);
            call.resolve(result);
        } catch (Exception error) {
            cleanupUri(targetUri);
            call.reject(
                error.getMessage() == null ? error.toString() : error.getMessage(),
                error
            );
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private HttpURLConnection openConnection(String sourceUrl) throws IOException {
        HttpURLConnection connection = (HttpURLConnection) new URL(sourceUrl).openConnection();
        connection.setRequestMethod("GET");
        connection.setConnectTimeout(15000);
        connection.setReadTimeout(30000);
        connection.setInstanceFollowRedirects(true);
        connection.setRequestProperty("Accept", "audio/*,*/*;q=0.8");
        connection.setRequestProperty("Referer", "https://music.163.com/");
        connection.setRequestProperty("User-Agent", USER_AGENT);
        return connection;
    }

    private void persistUriPermission(Intent data, Uri uri) {
        if (data == null || uri == null) return;

        int grantedFlags = data.getFlags();
        boolean canRead = (grantedFlags & Intent.FLAG_GRANT_READ_URI_PERMISSION) != 0;
        boolean canWrite = (grantedFlags & Intent.FLAG_GRANT_WRITE_URI_PERMISSION) != 0;

        try {
            if (canRead && canWrite) {
                getContext()
                    .getContentResolver()
                    .takePersistableUriPermission(
                        uri,
                        Intent.FLAG_GRANT_READ_URI_PERMISSION |
                        Intent.FLAG_GRANT_WRITE_URI_PERMISSION
                    );
            } else if (canRead) {
                getContext()
                    .getContentResolver()
                    .takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION);
            } else if (canWrite) {
                getContext()
                    .getContentResolver()
                    .takePersistableUriPermission(uri, Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
            }
        } catch (SecurityException ignored) {
            // Some document providers only grant permission for the current app lifecycle.
        }
    }

    private void cleanupUri(Uri uri) {
        if (uri == null) return;
        try {
            getContext().getContentResolver().delete(uri, null, null);
        } catch (Exception ignored) {
            // Preserve the original download error if the provider cannot delete the partial file.
        }
    }

    private String queryDisplayName(Uri uri, String fallback) {
        if (uri == null) return fallback;
        try (
            Cursor cursor = getContext()
                .getContentResolver()
                .query(uri, new String[] { OpenableColumns.DISPLAY_NAME }, null, null, null)
        ) {
            if (cursor != null && cursor.moveToFirst()) {
                int index = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                if (index >= 0) {
                    String value = cursor.getString(index);
                    if (value != null && !value.trim().isEmpty()) return value;
                }
            }
        } catch (Exception ignored) {
            // The selected document provider may not expose DISPLAY_NAME.
        }
        return fallback;
    }

    private void notifyProgress(String requestId, long received, long total) {
        JSObject progress = new JSObject();
        progress.put("requestId", requestId == null ? "" : requestId);
        progress.put("received", Math.max(0L, received));
        progress.put("total", Math.max(0L, total));
        notifyListeners("progress", progress);
    }

    private static String resolveMimeType(String responseMimeType, String fileName) {
        String normalized = responseMimeType == null ? "" : responseMimeType.split(";", 2)[0].trim();
        if (!normalized.isEmpty() && !"application/octet-stream".equalsIgnoreCase(normalized)) {
            return normalized;
        }
        String guessed = URLConnection.guessContentTypeFromName(fileName);
        if (guessed != null && !guessed.trim().isEmpty()) return guessed;

        String lower = fileName == null ? "" : fileName.toLowerCase(Locale.ROOT);
        if (lower.endsWith(".flac")) return "audio/flac";
        if (lower.endsWith(".m4a")) return "audio/mp4";
        if (lower.endsWith(".aac")) return "audio/aac";
        if (lower.endsWith(".ogg")) return "audio/ogg";
        if (lower.endsWith(".wav")) return "audio/wav";
        return "audio/mpeg";
    }

    private static String sanitizeFileName(String requestedName) {
        String name = requestedName == null ? "" : requestedName.trim();
        name = name.replaceAll("[\\x00-\\x1f\\x7f/\\\\:*?\"<>|]", "_");
        name = name.replaceAll("[.\\s]+$", "");
        if (name.isEmpty()) name = "track.mp3";
        if (name.length() > 220) name = name.substring(0, 220);
        return name;
    }
}
