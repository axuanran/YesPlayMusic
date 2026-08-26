package com.axuanran.yesplaymusic;

import android.content.ClipData;
import android.content.ContentValues;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.File;
import java.io.FileOutputStream;
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
        final String requestId = call.getString("requestId", "");

        if (sourceUrl == null || sourceUrl.trim().isEmpty()) {
            call.reject("Missing track download URL");
            return;
        }

        executor.execute(() -> {
            HttpURLConnection connection = null;
            DownloadTarget target = null;
            try {
                connection = openConnection(sourceUrl);
                int status = connection.getResponseCode();
                if (status < 200 || status >= 300) {
                    throw new IOException("Track server returned HTTP " + status);
                }

                String mimeType = resolveMimeType(connection.getContentType(), requestedName);
                String fileName = normalizeFileNameForMime(requestedName, mimeType);
                long totalBytes = connection.getContentLengthLong();
                target = createTarget(fileName, mimeType);

                long receivedBytes = 0L;
                long lastProgressAt = 0L;
                notifyProgress(requestId, receivedBytes, totalBytes);

                try (
                    InputStream input = new BufferedInputStream(connection.getInputStream(), BUFFER_SIZE);
                    OutputStream rawOutput = openOutput(target);
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

                finishTarget(target);
                notifyProgress(requestId, receivedBytes, totalBytes);

                JSObject result = new JSObject();
                result.put("status", "completed");
                result.put("uri", target.uri.toString());
                result.put("fileName", target.fileName);
                result.put("mimeType", mimeType);
                result.put("size", receivedBytes);
                result.put("publicMusicLibrary", target.mediaStore);
                call.resolve(result);
            } catch (Exception error) {
                cleanupTarget(target);
                call.reject(
                    error.getMessage() == null ? error.toString() : error.getMessage(),
                    error
                );
            } finally {
                if (connection != null) connection.disconnect();
            }
        });
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

    private DownloadTarget createTarget(String fileName, String mimeType) throws IOException {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ContentValues values = new ContentValues();
            values.put(MediaStore.Audio.Media.DISPLAY_NAME, fileName);
            values.put(MediaStore.Audio.Media.MIME_TYPE, mimeType);
            values.put(
                MediaStore.Audio.Media.RELATIVE_PATH,
                Environment.DIRECTORY_MUSIC + File.separator + "XuMP"
            );
            values.put(MediaStore.Audio.Media.IS_PENDING, 1);

            Uri uri = getContext()
                .getContentResolver()
                .insert(MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, values);
            if (uri == null) throw new IOException("Unable to create media library file");
            return new DownloadTarget(uri, null, fileName, true);
        }

        File root = getContext().getExternalFilesDir(Environment.DIRECTORY_MUSIC);
        if (root == null) root = getContext().getFilesDir();
        File directory = new File(root, "XuMP");
        if (!directory.exists() && !directory.mkdirs()) {
            throw new IOException("Unable to create track download directory");
        }

        File file = uniqueFile(directory, fileName);
        Uri uri = FileProvider.getUriForFile(
            getContext(),
            getContext().getPackageName() + ".fileprovider",
            file
        );
        return new DownloadTarget(uri, file, file.getName(), false);
    }

    private OutputStream openOutput(DownloadTarget target) throws IOException {
        if (target.mediaStore) {
            OutputStream output = getContext()
                .getContentResolver()
                .openOutputStream(target.uri, "w");
            if (output == null) throw new IOException("Unable to open media library file");
            return output;
        }
        return new FileOutputStream(target.file, false);
    }

    private void finishTarget(DownloadTarget target) {
        if (target == null || !target.mediaStore || Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            return;
        }
        ContentValues values = new ContentValues();
        values.put(MediaStore.Audio.Media.IS_PENDING, 0);
        getContext().getContentResolver().update(target.uri, values, null, null);
    }

    private void cleanupTarget(DownloadTarget target) {
        if (target == null) return;
        try {
            if (target.mediaStore) {
                getContext().getContentResolver().delete(target.uri, null, null);
            } else if (target.file != null && target.file.exists()) {
                //noinspection ResultOfMethodCallIgnored
                target.file.delete();
            }
        } catch (Exception ignored) {
            // Preserve the original download error.
        }
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

    private static String normalizeFileNameForMime(String requestedName, String mimeType) {
        String name = sanitizeFileName(requestedName);
        String expectedExtension = extensionForMime(mimeType);
        if (expectedExtension == null) return name;

        int dot = name.lastIndexOf('.');
        String currentExtension = dot >= 0 ? name.substring(dot + 1).toLowerCase(Locale.ROOT) : "";
        if (extensionMatchesMime(currentExtension, mimeType)) return name;

        String baseName = dot > 0 ? name.substring(0, dot) : name;
        return baseName + "." + expectedExtension;
    }

    private static String sanitizeFileName(String requestedName) {
        String name = requestedName == null ? "" : requestedName.trim();
        name = name.replaceAll("[\\x00-\\x1f\\x7f/\\\\:*?\"<>|]", "_");
        name = name.replaceAll("[.\\s]+$", "");
        if (name.isEmpty()) name = "track.mp3";
        if (name.length() > 220) name = name.substring(0, 220);
        return name;
    }

    private static String extensionForMime(String mimeType) {
        if (mimeType == null) return null;
        String mime = mimeType.toLowerCase(Locale.ROOT);
        if (mime.equals("audio/flac") || mime.equals("audio/x-flac")) return "flac";
        if (mime.equals("audio/mpeg") || mime.equals("audio/mp3")) return "mp3";
        if (mime.equals("audio/mp4") || mime.equals("audio/x-m4a")) return "m4a";
        if (mime.equals("audio/aac")) return "aac";
        if (mime.equals("audio/ogg")) return "ogg";
        if (mime.equals("audio/wav") || mime.equals("audio/x-wav")) return "wav";
        return null;
    }

    private static boolean extensionMatchesMime(String extension, String mimeType) {
        String expected = extensionForMime(mimeType);
        if (expected == null) return true;
        return expected.equals(extension) || ("m4a".equals(expected) && "mp4".equals(extension));
    }

    private static File uniqueFile(File directory, String fileName) {
        File candidate = new File(directory, fileName);
        if (!candidate.exists()) return candidate;

        int dot = fileName.lastIndexOf('.');
        String base = dot > 0 ? fileName.substring(0, dot) : fileName;
        String extension = dot > 0 ? fileName.substring(dot) : "";
        int index = 1;
        while (candidate.exists()) {
            candidate = new File(directory, base + " (" + index + ")" + extension);
            index += 1;
        }
        return candidate;
    }

    private static final class DownloadTarget {
        final Uri uri;
        final File file;
        final String fileName;
        final boolean mediaStore;

        DownloadTarget(Uri uri, File file, String fileName, boolean mediaStore) {
            this.uri = uri;
            this.file = file;
            this.fileName = fileName;
            this.mediaStore = mediaStore;
        }
    }
}
