package com.axuanran.yesplaymusic;

import android.content.Context;
import android.content.SharedPreferences;

import androidx.annotation.OptIn;
import androidx.media3.common.util.UnstableApi;
import androidx.media3.database.StandaloneDatabaseProvider;
import androidx.media3.datasource.DataSource;
import androidx.media3.datasource.DataSpec;
import androidx.media3.datasource.DefaultDataSource;
import androidx.media3.datasource.DefaultHttpDataSource;
import androidx.media3.datasource.cache.CacheDataSource;
import androidx.media3.datasource.cache.CacheSpan;
import androidx.media3.datasource.cache.CacheWriter;
import androidx.media3.datasource.cache.ContentMetadata;
import androidx.media3.datasource.cache.LeastRecentlyUsedCacheEvictor;
import androidx.media3.datasource.cache.SimpleCache;

import org.json.JSONObject;

import java.io.File;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** Process-wide Media3 cache shared by playback and UI-triggered prefetches. */
@OptIn(markerClass = UnstableApi.class)
final class NativeAudioCache {
    static final long MAX_CACHE_BYTES = 512L * 1024L * 1024L;
    private static final String NETEASE_REFERER = "https://music.163.com/";
    private static final String MEDIA_USER_AGENT =
        "NeteaseMusic 9.0.90/5038 (iPhone; iOS 16.2; zh_CN)";
    private static final String CACHE_KEY_PREFIX = "track:v2:";
    private static final String LEGACY_CACHE_KEY_PREFIX = "track:";
    private static final String INDEX_PREFS = "native_audio_cache_index";
    private static final String SETTINGS_PREFS = "native_audio_cache_settings";
    private static final String INDEX_PREFIX = "entry:";
    private static final String WRITE_THROUGH_ENABLED = "write_through_enabled";
    private static volatile NativeAudioCache instance;

    static NativeAudioCache getInstance(Context context) {
        NativeAudioCache current = instance;
        if (current != null) return current;
        synchronized (NativeAudioCache.class) {
            if (instance == null) {
                instance = new NativeAudioCache(context.getApplicationContext());
            }
            return instance;
        }
    }

    static String keyFor(String mediaId, String quality) {
        String id = mediaId == null ? "" : mediaId.trim();
        return CACHE_KEY_PREFIX + id + ":" + normalizeQuality(quality);
    }

    static String normalizeQuality(String quality) {
        if (quality == null || quality.isBlank()) return "exhigh";
        String normalized = quality.trim().toLowerCase();
        if ("higher".equals(normalized)) return "exhigh";
        if ("flac".equals(normalized)) return "lossless";
        return normalized.replaceAll("[^a-z0-9_-]", "_");
    }

    private final SimpleCache cache;
    private final DataSource.Factory playbackDataSourceFactory;
    private final CacheDataSource.Factory downloadDataSourceFactory;
    private final SharedPreferences indexPreferences;
    private final SharedPreferences settingsPreferences;
    private volatile boolean writeThroughEnabled;

    private NativeAudioCache(Context context) {
        File directory = new File(context.getFilesDir(), "audio_cache");
        StandaloneDatabaseProvider databaseProvider =
            new StandaloneDatabaseProvider(context);
        cache =
            new SimpleCache(
                directory,
                new LeastRecentlyUsedCacheEvictor(MAX_CACHE_BYTES),
                databaseProvider
            );
        indexPreferences = context.getSharedPreferences(INDEX_PREFS, Context.MODE_PRIVATE);
        settingsPreferences =
            context.getSharedPreferences(SETTINGS_PREFS, Context.MODE_PRIVATE);
        writeThroughEnabled =
            settingsPreferences.getBoolean(WRITE_THROUGH_ENABLED, true);

        Map<String, String> requestHeaders = new HashMap<>();
        requestHeaders.put("Referer", NETEASE_REFERER);
        requestHeaders.put("Accept", "*/*");
        DefaultHttpDataSource.Factory httpFactory =
            new DefaultHttpDataSource.Factory()
                .setAllowCrossProtocolRedirects(true)
                .setConnectTimeoutMs(15000)
                .setReadTimeoutMs(20000)
                .setDefaultRequestProperties(requestHeaders)
                .setUserAgent(MEDIA_USER_AGENT);
        DataSource.Factory upstreamFactory =
            new DefaultDataSource.Factory(context, httpFactory);

        CacheDataSource.Factory readOnlyDataSourceFactory =
            new CacheDataSource.Factory()
                .setCache(cache)
                .setUpstreamDataSourceFactory(upstreamFactory)
                .setCacheWriteDataSinkFactory(null)
                .setFlags(CacheDataSource.FLAG_IGNORE_CACHE_ON_ERROR);
        CacheDataSource.Factory writeThroughDataSourceFactory =
            new CacheDataSource.Factory()
                .setCache(cache)
                .setUpstreamDataSourceFactory(upstreamFactory)
                .setFlags(CacheDataSource.FLAG_IGNORE_CACHE_ON_ERROR);
        playbackDataSourceFactory =
            () ->
                (writeThroughEnabled
                        ? writeThroughDataSourceFactory
                        : readOnlyDataSourceFactory)
                    .createDataSource();
        downloadDataSourceFactory = writeThroughDataSourceFactory;

        removeLegacyCacheEntries();
        pruneStaleIndexEntries();
    }

    DataSource.Factory getDataSourceFactory() {
        return playbackDataSourceFactory;
    }

    void setWriteThroughEnabled(boolean enabled) {
        writeThroughEnabled = enabled;
        settingsPreferences
            .edit()
            .putBoolean(WRITE_THROUGH_ENABLED, enabled)
            .apply();
    }

    boolean isWriteThroughEnabled() {
        return writeThroughEnabled;
    }

    CacheWriter createWriter(
        String source,
        String cacheKey,
        CacheWriter.ProgressListener listener
    ) {
        DataSpec dataSpec =
            new DataSpec.Builder()
                .setUri(source)
                .setKey(cacheKey)
                .build();
        return new CacheWriter(
            downloadDataSourceFactory.createDataSourceForDownloading(),
            dataSpec,
            null,
            listener
        );
    }

    synchronized void record(
        String cacheKey,
        String mediaId,
        String quality,
        String title,
        String artist,
        String album,
        String artwork
    ) {
        if (cacheKey == null || cacheKey.isBlank()) return;
        try {
            JSONObject value = new JSONObject();
            value.put("cacheKey", cacheKey);
            value.put("id", mediaId == null ? "" : mediaId);
            value.put("quality", normalizeQuality(quality));
            value.put("title", title == null ? "" : title);
            value.put("artist", artist == null ? "" : artist);
            value.put("album", album == null ? "" : album);
            value.put("artwork", artwork == null ? "" : artwork);
            value.put("updatedAt", System.currentTimeMillis());
            indexPreferences.edit().putString(INDEX_PREFIX + cacheKey, value.toString()).apply();
        } catch (Exception ignored) {
            // Cache metadata is best-effort and must never interrupt playback.
        }
    }

    synchronized CacheStatus status() {
        Set<String> keys = cache.getKeys();
        int completed = 0;
        for (String key : keys) {
            long contentLength =
                ContentMetadata.getContentLength(cache.getContentMetadata(key));
            if (contentLength >= 0 && cachedBytes(key) >= contentLength) completed += 1;
        }
        return new CacheStatus(cache.getCacheSpace(), keys.size(), completed);
    }

    synchronized List<CacheEntry> entries() {
        Set<String> keys = cache.getKeys();
        List<CacheEntry> result = new ArrayList<>();
        for (String key : keys) {
            if (!key.startsWith(CACHE_KEY_PREFIX)) continue;
            long bytes = cachedBytes(key);
            long contentLength =
                ContentMetadata.getContentLength(cache.getContentMetadata(key));
            JSONObject metadata = readMetadata(key);
            String[] parsed = parseKey(key);
            String id = metadata.optString("id", parsed[0]);
            String quality = metadata.optString("quality", parsed[1]);
            result.add(
                new CacheEntry(
                    key,
                    id,
                    quality,
                    metadata.optString("title", id.isBlank() ? key : "#" + id),
                    metadata.optString("artist", ""),
                    metadata.optString("album", ""),
                    metadata.optString("artwork", ""),
                    bytes,
                    contentLength,
                    contentLength >= 0 && bytes >= contentLength,
                    metadata.optLong("updatedAt", 0)
                )
            );
        }
        result.sort(Comparator.comparingLong((CacheEntry item) -> item.updatedAt).reversed());
        pruneStaleIndexEntries(keys);
        return result;
    }

    synchronized void remove(String cacheKey) throws Exception {
        cache.removeResource(cacheKey);
        indexPreferences.edit().remove(INDEX_PREFIX + cacheKey).apply();
    }

    synchronized void clear() throws Exception {
        for (String key : new HashSet<>(cache.getKeys())) {
            cache.removeResource(key);
        }
        indexPreferences.edit().clear().apply();
    }

    private JSONObject readMetadata(String cacheKey) {
        String raw = indexPreferences.getString(INDEX_PREFIX + cacheKey, null);
        if (raw == null || raw.isBlank()) return new JSONObject();
        try {
            return new JSONObject(raw);
        } catch (Exception ignored) {
            return new JSONObject();
        }
    }

    private String[] parseKey(String cacheKey) {
        String value = cacheKey.substring(CACHE_KEY_PREFIX.length());
        int separator = value.lastIndexOf(':');
        if (separator < 0) return new String[] { value, "exhigh" };
        return new String[] {
            value.substring(0, separator),
            normalizeQuality(value.substring(separator + 1))
        };
    }

    private void removeLegacyCacheEntries() {
        for (String key : new HashSet<>(cache.getKeys())) {
            if (
                key.startsWith(LEGACY_CACHE_KEY_PREFIX) &&
                !key.startsWith(CACHE_KEY_PREFIX)
            ) {
                try {
                    cache.removeResource(key);
                } catch (Exception ignored) {
                    // A failed cleanup should not prevent the player from starting.
                }
            }
        }
    }

    private void pruneStaleIndexEntries() {
        pruneStaleIndexEntries(cache.getKeys());
    }

    private void pruneStaleIndexEntries(Set<String> liveKeys) {
        SharedPreferences.Editor editor = indexPreferences.edit();
        boolean changed = false;
        for (String preferenceKey : indexPreferences.getAll().keySet()) {
            if (!preferenceKey.startsWith(INDEX_PREFIX)) continue;
            String cacheKey = preferenceKey.substring(INDEX_PREFIX.length());
            if (!liveKeys.contains(cacheKey)) {
                editor.remove(preferenceKey);
                changed = true;
            }
        }
        if (changed) editor.apply();
    }

    private long cachedBytes(String cacheKey) {
        long bytes = 0;
        for (CacheSpan span : cache.getCachedSpans(cacheKey)) {
            bytes += span.length;
        }
        return bytes;
    }

    static final class CacheStatus {
        final long bytes;
        final int length;
        final int completed;

        CacheStatus(long bytes, int length, int completed) {
            this.bytes = bytes;
            this.length = length;
            this.completed = completed;
        }
    }

    static final class CacheEntry {
        final String cacheKey;
        final String id;
        final String quality;
        final String title;
        final String artist;
        final String album;
        final String artwork;
        final long bytes;
        final long contentLength;
        final boolean completed;
        final long updatedAt;

        CacheEntry(
            String cacheKey,
            String id,
            String quality,
            String title,
            String artist,
            String album,
            String artwork,
            long bytes,
            long contentLength,
            boolean completed,
            long updatedAt
        ) {
            this.cacheKey = cacheKey;
            this.id = id;
            this.quality = quality;
            this.title = title;
            this.artist = artist;
            this.album = album;
            this.artwork = artwork;
            this.bytes = bytes;
            this.contentLength = contentLength;
            this.completed = completed;
            this.updatedAt = updatedAt;
        }
    }
}
