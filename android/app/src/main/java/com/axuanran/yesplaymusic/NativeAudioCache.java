package com.axuanran.yesplaymusic;

import android.content.Context;

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

import java.io.File;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

/** Process-wide Media3 cache shared by playback and UI-triggered prefetches. */
@OptIn(markerClass = UnstableApi.class)
final class NativeAudioCache {
    static final long MAX_CACHE_BYTES = 512L * 1024L * 1024L;
    private static final String NETEASE_REFERER = "https://music.163.com/";
    private static final String MEDIA_USER_AGENT =
        "NeteaseMusic 9.0.90/5038 (iPhone; iOS 16.2; zh_CN)";
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

    static String keyFor(String mediaId) {
        return "track:" + mediaId;
    }

    private final SimpleCache cache;
    private final CacheDataSource.Factory dataSourceFactory;
    private final CacheDataSource.Factory downloadDataSourceFactory;

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
        dataSourceFactory =
            new CacheDataSource.Factory()
                .setCache(cache)
                .setUpstreamDataSourceFactory(upstreamFactory)
                .setCacheWriteDataSinkFactory(null)
                .setFlags(CacheDataSource.FLAG_IGNORE_CACHE_ON_ERROR);
        downloadDataSourceFactory =
            new CacheDataSource.Factory()
                .setCache(cache)
                .setUpstreamDataSourceFactory(upstreamFactory)
                .setFlags(CacheDataSource.FLAG_IGNORE_CACHE_ON_ERROR);
    }

    CacheDataSource.Factory getDataSourceFactory() {
        return dataSourceFactory;
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

    synchronized void remove(String cacheKey) throws Exception {
        cache.removeResource(cacheKey);
    }

    synchronized void clear() throws Exception {
        for (String key : new HashSet<>(cache.getKeys())) {
            cache.removeResource(key);
        }
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
}
