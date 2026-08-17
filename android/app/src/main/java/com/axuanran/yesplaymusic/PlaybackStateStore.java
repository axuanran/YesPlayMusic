package com.axuanran.yesplaymusic;

import android.content.Context;
import android.content.SharedPreferences;
import android.net.Uri;

import androidx.annotation.Nullable;
import androidx.annotation.OptIn;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MediaMetadata;
import androidx.media3.common.Player;
import androidx.media3.common.util.UnstableApi;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/** Stores only the minimum non-sensitive state required for local playback resumption. */
@OptIn(markerClass = UnstableApi.class)
final class PlaybackStateStore {
    static final class Snapshot {
        final List<MediaItem> mediaItems;
        final int currentIndex;
        final long positionMs;
        final float volume;
        final float playbackSpeed;

        Snapshot(
            List<MediaItem> mediaItems,
            int currentIndex,
            long positionMs,
            float volume,
            float playbackSpeed
        ) {
            this.mediaItems = mediaItems;
            this.currentIndex = currentIndex;
            this.positionMs = positionMs;
            this.volume = volume;
            this.playbackSpeed = playbackSpeed;
        }
    }

    private static final String PREFERENCES = "background_audio_state";
    private static final String KEY_SOURCE = "source";
    private static final String KEY_MEDIA_ID = "media_id";
    private static final String KEY_CACHE_KEY = "cache_key";
    private static final String KEY_TITLE = "title";
    private static final String KEY_ARTIST = "artist";
    private static final String KEY_ALBUM = "album";
    private static final String KEY_ARTWORK = "artwork";
    private static final String KEY_POSITION = "position";
    private static final String KEY_VOLUME = "volume";
    private static final String KEY_SPEED = "speed";
    private static final String KEY_QUEUE = "queue";
    private static final String KEY_QUEUE_INDEX = "queue_index";

    private final SharedPreferences preferences;

    PlaybackStateStore(Context context) {
        preferences = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE);
    }

    void save(Player player) {
        MediaItem item = player.getCurrentMediaItem();
        if (item == null || item.localConfiguration == null) return;
        Uri source = item.localConfiguration.uri;
        if (source == null || source.toString().isBlank()) return;

        MediaMetadata metadata = item.mediaMetadata;
        long position =
            player.getPlaybackState() == Player.STATE_ENDED
                ? 0
                : Math.max(0, player.getCurrentPosition());
        int currentIndex = player.getCurrentMediaItemIndex();
        int fromIndex = Math.max(0, currentIndex - 1);
        int toIndex = Math.min(player.getMediaItemCount(), currentIndex + 2);
        JSONArray queue = new JSONArray();
        int queueCurrentIndex = 0;
        for (int index = fromIndex; index < toIndex; index += 1) {
            JSONObject encoded = encode(player.getMediaItemAt(index));
            if (encoded == null) continue;
            if (index == currentIndex) queueCurrentIndex = queue.length();
            queue.put(encoded);
        }
        preferences
            .edit()
            .putString(KEY_SOURCE, source.toString())
            .putString(KEY_MEDIA_ID, item.mediaId)
            .putString(KEY_CACHE_KEY, item.localConfiguration.customCacheKey)
            .putString(KEY_TITLE, text(metadata.title))
            .putString(KEY_ARTIST, text(metadata.artist))
            .putString(KEY_ALBUM, text(metadata.albumTitle))
            .putString(
                KEY_ARTWORK,
                metadata.artworkUri == null ? "" : metadata.artworkUri.toString()
            )
            .putLong(KEY_POSITION, position)
            .putFloat(KEY_VOLUME, player.getVolume())
            .putFloat(KEY_SPEED, player.getPlaybackParameters().speed)
            .putString(KEY_QUEUE, queue.toString())
            .putInt(KEY_QUEUE_INDEX, queueCurrentIndex)
            .apply();
    }

    @Nullable
    Snapshot restore() {
        Snapshot queueSnapshot = restoreQueue();
        if (queueSnapshot != null) return queueSnapshot;
        String source = preferences.getString(KEY_SOURCE, "");
        if (source == null || source.isBlank()) return null;

        MediaMetadata.Builder metadata =
            new MediaMetadata.Builder()
                .setTitle(preferences.getString(KEY_TITLE, ""))
                .setArtist(preferences.getString(KEY_ARTIST, ""))
                .setAlbumTitle(preferences.getString(KEY_ALBUM, ""));
        String artwork = preferences.getString(KEY_ARTWORK, "");
        if (artwork != null && !artwork.isBlank()) {
            metadata.setArtworkUri(Uri.parse(artwork));
        }
        String mediaId = preferences.getString(KEY_MEDIA_ID, "");
        MediaItem.Builder itemBuilder =
            new MediaItem.Builder()
                .setMediaId(mediaId == null ? "" : mediaId)
                .setUri(source)
                .setMediaMetadata(metadata.build());
        String cacheKey = preferences.getString(KEY_CACHE_KEY, "");
        if (cacheKey != null && !cacheKey.isBlank()) {
            itemBuilder.setCustomCacheKey(cacheKey);
        }
        MediaItem item = itemBuilder.build();
        return new Snapshot(
            Collections.singletonList(item),
            0,
            Math.max(0, preferences.getLong(KEY_POSITION, 0)),
            clamp(preferences.getFloat(KEY_VOLUME, 1f), 0f, 1f),
            clamp(preferences.getFloat(KEY_SPEED, 1f), 0.25f, 4f)
        );
    }

    @Nullable
    private Snapshot restoreQueue() {
        String encodedQueue = preferences.getString(KEY_QUEUE, "");
        if (encodedQueue == null || encodedQueue.isBlank()) return null;
        try {
            JSONArray queue = new JSONArray(encodedQueue);
            ArrayList<MediaItem> items = new ArrayList<>();
            for (int index = 0; index < queue.length(); index += 1) {
                MediaItem item = decode(queue.getJSONObject(index));
                if (item != null) items.add(item);
            }
            if (items.isEmpty()) return null;
            int currentIndex =
                Math.min(
                    Math.max(0, preferences.getInt(KEY_QUEUE_INDEX, 0)),
                    items.size() - 1
                );
            return new Snapshot(
                items,
                currentIndex,
                Math.max(0, preferences.getLong(KEY_POSITION, 0)),
                clamp(preferences.getFloat(KEY_VOLUME, 1f), 0f, 1f),
                clamp(preferences.getFloat(KEY_SPEED, 1f), 0.25f, 4f)
            );
        } catch (JSONException error) {
            return null;
        }
    }

    @Nullable
    private static JSONObject encode(MediaItem item) {
        if (item.localConfiguration == null) return null;
        Uri source = item.localConfiguration.uri;
        if (source == null || source.toString().isBlank()) return null;
        try {
            JSONObject encoded = new JSONObject();
            encoded.put("source", source.toString());
            encoded.put("mediaId", item.mediaId);
            encoded.put("cacheKey", item.localConfiguration.customCacheKey);
            encoded.put("title", text(item.mediaMetadata.title));
            encoded.put("artist", text(item.mediaMetadata.artist));
            encoded.put("album", text(item.mediaMetadata.albumTitle));
            encoded.put(
                "artwork",
                item.mediaMetadata.artworkUri == null
                    ? ""
                    : item.mediaMetadata.artworkUri.toString()
            );
            return encoded;
        } catch (JSONException error) {
            return null;
        }
    }

    @Nullable
    private static MediaItem decode(JSONObject encoded) {
        String source = encoded.optString("source", "");
        if (source.isBlank()) return null;
        MediaMetadata.Builder metadata =
            new MediaMetadata.Builder()
                .setTitle(encoded.optString("title", ""))
                .setArtist(encoded.optString("artist", ""))
                .setAlbumTitle(encoded.optString("album", ""));
        String artwork = encoded.optString("artwork", "");
        if (!artwork.isBlank()) metadata.setArtworkUri(Uri.parse(artwork));
        MediaItem.Builder builder =
            new MediaItem.Builder()
                .setMediaId(encoded.optString("mediaId", ""))
                .setUri(source)
                .setMediaMetadata(metadata.build());
        String cacheKey = encoded.optString("cacheKey", "");
        if (!cacheKey.isBlank()) builder.setCustomCacheKey(cacheKey);
        return builder.build();
    }

    private static String text(@Nullable CharSequence value) {
        return value == null ? "" : value.toString();
    }

    private static float clamp(float value, float min, float max) {
        return Math.min(Math.max(value, min), max);
    }
}
