package com.axuanran.yesplaymusic;

import android.Manifest;
import android.content.ComponentName;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;

import androidx.annotation.OptIn;
import androidx.annotation.Nullable;
import androidx.core.content.ContextCompat;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MediaMetadata;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.common.util.UnstableApi;
import androidx.media3.datasource.HttpDataSource;
import androidx.media3.datasource.cache.CacheWriter;
import androidx.media3.session.MediaController;
import androidx.media3.session.SessionToken;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.google.common.util.concurrent.ListenableFuture;

import java.util.ArrayList;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicLong;

@CapacitorPlugin(
    name = "BackgroundAudio",
    permissions = {
        @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS })
    }
)
@OptIn(markerClass = UnstableApi.class)
public final class BackgroundAudioPlugin extends Plugin {
    private interface ControllerAction {
        void run(MediaController controller) throws Exception;
    }

    private final Handler progressHandler = new Handler(Looper.getMainLooper());
    private final ExecutorService cacheExecutor = Executors.newSingleThreadExecutor();
    private final ConcurrentHashMap<String, CacheWriter> cacheWriters =
        new ConcurrentHashMap<>();
    private final Set<String> canceledCacheKeys = ConcurrentHashMap.newKeySet();
    private ListenableFuture<MediaController> controllerFuture;
    private MediaController controller;
    private int activeToken = 0;
    private boolean readyEventSent = false;

    private final Runnable progressUpdate =
        new Runnable() {
            @Override
            public void run() {
                if (controller != null && controller.getMediaItemCount() > 0) {
                    notifyListeners("timeUpdate", createState(), true);
                }
                progressHandler.postDelayed(this, 500);
            }
        };

    private final Player.Listener playerListener =
        new Player.Listener() {
            @Override
            public void onIsPlayingChanged(boolean isPlaying) {
                notifyListeners("stateChanged", createState(), true);
            }

            @Override
            public void onPlaybackStateChanged(int playbackState) {
                if (playbackState == Player.STATE_READY && !readyEventSent) {
                    readyEventSent = true;
                    notifyListeners("ready", createState(), true);
                } else if (playbackState == Player.STATE_ENDED) {
                    notifyListeners("ended", createState(), true);
                }
                notifyListeners("stateChanged", createState(), true);
            }

            @Override
            public void onPlayerError(PlaybackException error) {
                JSObject data = createState();
                data.put("nativeCode", error.errorCode);
                data.put("code", mediaErrorCode(error.errorCode));
                data.put("kind", errorKind(error.errorCode));
                data.put("message", error.getMessage());
                appendNativeErrorDetails(data, error);
                notifyListeners("error", data, true);
            }

            @Override
            public void onMediaItemTransition(
                @Nullable MediaItem mediaItem,
                int reason
            ) {
                if (mediaItem == null) return;
                JSObject data = createState();
                data.put("reason", transitionReason(reason));
                notifyListeners("mediaItemTransition", data, true);
            }
        };

    @Override
    public void load() {
        SessionToken sessionToken =
            new SessionToken(
                getContext(),
                new ComponentName(getContext(), PlaybackService.class)
            );
        controllerFuture =
            new MediaController.Builder(getContext(), sessionToken)
                .setApplicationLooper(Looper.getMainLooper())
                .buildAsync();
        controllerFuture.addListener(
            () -> {
                try {
                    controller = controllerFuture.get();
                    controller.addListener(playerListener);
                    progressHandler.post(progressUpdate);
                } catch (Exception error) {
                    JSObject data = new JSObject();
                    data.put("message", rootMessage(error));
                    notifyListeners("error", data, true);
                }
            },
            ContextCompat.getMainExecutor(getContext())
        );
        PlaybackService.setMediaButtonListener(
            new PlaybackService.MediaButtonListener() {
                @Override
                public void onPrevious() {
                    emitCommand("previous");
                }

                @Override
                public void onNext() {
                    emitCommand("next");
                }
            }
        );
    }

    @Override
    protected void handleOnDestroy() {
        progressHandler.removeCallbacks(progressUpdate);
        for (CacheWriter writer : cacheWriters.values()) writer.cancel();
        cacheWriters.clear();
        cacheExecutor.shutdownNow();
        PlaybackService.setMediaButtonListener(null);
        if (controller != null) {
            controller.removeListener(playerListener);
            controller = null;
        }
        if (controllerFuture != null) {
            MediaController.releaseFuture(controllerFuture);
            controllerFuture = null;
        }
        super.handleOnDestroy();
    }

    @PluginMethod
    public void load(PluginCall call) {
        String source = call.getString("source");
        if (source == null || source.isBlank()) {
            call.reject("Audio source is required");
            return;
        }
        Integer token = call.getInt("token", activeToken + 1);
        JSObject track = call.getObject("track", new JSObject());
        boolean reuseIfSame = call.getBoolean("reuseIfSame", false);
        boolean reuseActiveSession = call.getBoolean("reuseActiveSession", false);
        withController(
            call,
            mediaController -> {
                activeToken = token == null ? activeToken + 1 : token;
                MediaItem currentItem = mediaController.getCurrentMediaItem();
                String requestedMediaId = track.optString("id", "");
                if (
                    (reuseActiveSession || reuseIfSame) &&
                    currentItem != null &&
                    (
                        reuseActiveSession ||
                        (
                            !requestedMediaId.isBlank() &&
                            requestedMediaId.equals(currentItem.mediaId)
                        )
                    )
                ) {
                    JSObject state = createState();
                    state.put("reused", true);
                    state.put("requestedMediaId", requestedMediaId);
                    notifyListeners("stateChanged", state, true);
                    call.resolve(state);
                    return;
                }
                readyEventSent = false;
                MediaItem mediaItem =
                    createMediaItem(
                        source,
                        track,
                        requestedMediaId.isBlank()
                            ? String.valueOf(activeToken)
                            : requestedMediaId
                    );
                mediaController.setMediaItem(mediaItem);
                mediaController.prepare();
                call.resolve(createState());
            }
        );
    }

    @PluginMethod
    public void play(PluginCall call) {
        withController(call, mediaController -> {
            mediaController.play();
            call.resolve(createState());
        });
    }

    @PluginMethod
    public void pause(PluginCall call) {
        withController(call, mediaController -> {
            mediaController.pause();
            call.resolve(createState());
        });
    }

    @PluginMethod
    public void stop(PluginCall call) {
        withController(call, mediaController -> {
            mediaController.stop();
            mediaController.seekTo(0);
            call.resolve(createState());
        });
    }

    @PluginMethod
    public void seek(PluginCall call) {
        double seconds = call.getDouble("position", 0.0);
        withController(call, mediaController -> {
            mediaController.seekTo(Math.max(0, Math.round(seconds * 1000)));
            call.resolve(createState());
        });
    }

    @PluginMethod
    public void setVolume(PluginCall call) {
        double volume = call.getDouble("value", 1.0);
        withController(call, mediaController -> {
            mediaController.setVolume((float) Math.max(0, Math.min(1, volume)));
            call.resolve(createState());
        });
    }

    @PluginMethod
    public void setPlaybackRate(PluginCall call) {
        double rate = call.getDouble("value", 1.0);
        withController(call, mediaController -> {
            mediaController.setPlaybackSpeed((float) Math.max(0.25, Math.min(4, rate)));
            call.resolve(createState());
        });
    }

    @PluginMethod
    public void getState(PluginCall call) {
        withController(call, mediaController -> call.resolve(createState()));
    }

    @PluginMethod
    public void queueNext(PluginCall call) {
        String source = call.getString("source");
        if (source == null || source.isBlank()) {
            call.reject("Audio source is required");
            return;
        }
        JSObject track = call.getObject("track", new JSObject());
        String mediaId = track.optString("id", "");
        if (mediaId.isBlank()) {
            call.reject("Track id is required");
            return;
        }
        withController(
            call,
            mediaController -> {
                if (mediaController.getCurrentMediaItem() == null) {
                    call.reject("No active media item");
                    return;
                }
                int currentIndex = mediaController.getCurrentMediaItemIndex();
                int tailStart = currentIndex + 1;
                MediaItem nextItem = createMediaItem(source, track, mediaId);
                if (tailStart < mediaController.getMediaItemCount()) {
                    MediaItem existing = mediaController.getMediaItemAt(tailStart);
                    if (mediaId.equals(existing.mediaId)) {
                        mediaController.replaceMediaItem(tailStart, nextItem);
                    } else {
                        mediaController.removeMediaItems(
                            tailStart,
                            mediaController.getMediaItemCount()
                        );
                        mediaController.addMediaItem(nextItem);
                    }
                } else {
                    mediaController.addMediaItem(nextItem);
                }
                if (currentIndex > 1) {
                    mediaController.removeMediaItems(0, currentIndex - 1);
                }
                JSObject state = createState();
                state.put("queuedMediaId", mediaId);
                call.resolve(state);
            }
        );
    }

    @PluginMethod
    public void clearNext(PluginCall call) {
        withController(
            call,
            mediaController -> {
                int tailStart = mediaController.getCurrentMediaItemIndex() + 1;
                if (tailStart < mediaController.getMediaItemCount()) {
                    mediaController.removeMediaItems(
                        tailStart,
                        mediaController.getMediaItemCount()
                    );
                }
                call.resolve(createState());
            }
        );
    }

    @PluginMethod
    public void cache(PluginCall call) {
        String source = call.getString("source");
        String cacheKey = call.getString("cacheKey");
        if (source == null || source.isBlank()) {
            call.reject("Audio source is required");
            return;
        }
        if (cacheKey == null || cacheKey.isBlank()) {
            call.reject("Cache key is required");
            return;
        }

        NativeAudioCache audioCache = NativeAudioCache.getInstance(getContext());
        AtomicLong lastProgressEvent = new AtomicLong(0);
        CacheWriter writer =
            audioCache.createWriter(
                source,
                cacheKey,
                (requestLength, bytesCached, newBytesCached) -> {
                    long now = System.currentTimeMillis();
                    long previous = lastProgressEvent.get();
                    if (requestLength != bytesCached && now - previous < 500) return;
                    if (!lastProgressEvent.compareAndSet(previous, now)) return;
                    JSObject data = new JSObject();
                    data.put("cacheKey", cacheKey);
                    data.put("requestLength", requestLength);
                    data.put("bytesCached", bytesCached);
                    data.put("newBytesCached", newBytesCached);
                    postEvent("cacheProgress", data);
                }
            );
        CacheWriter activeWriter = cacheWriters.putIfAbsent(cacheKey, writer);
        JSObject result = cacheStatus();
        result.put("cacheKey", cacheKey);
        result.put("started", activeWriter == null);
        call.resolve(result);
        if (activeWriter != null) return;

        canceledCacheKeys.remove(cacheKey);
        cacheExecutor.execute(
            () -> {
                try {
                    writer.cache();
                } catch (Exception error) {
                    if (!canceledCacheKeys.contains(cacheKey)) {
                        JSObject data = new JSObject();
                        data.put("cacheKey", cacheKey);
                        data.put("message", rootMessage(error));
                        postEvent("cacheError", data);
                    }
                } finally {
                    cacheWriters.remove(cacheKey, writer);
                    canceledCacheKeys.remove(cacheKey);
                    emitCacheChanged(cacheKey);
                }
            }
        );
    }

    @PluginMethod
    public void getCacheStatus(PluginCall call) {
        call.resolve(cacheStatus());
    }

    @PluginMethod
    public void removeCache(PluginCall call) {
        String cacheKey = call.getString("cacheKey");
        if (cacheKey == null || cacheKey.isBlank()) {
            call.reject("Cache key is required");
            return;
        }
        cancelWriter(cacheKey);
        cacheExecutor.execute(
            () -> {
                try {
                    NativeAudioCache.getInstance(getContext()).remove(cacheKey);
                    JSObject result = cacheStatus();
                    result.put("cacheKey", cacheKey);
                    postResolve(call, result);
                    postEvent("cacheChanged", result);
                } catch (Exception error) {
                    postReject(call, error);
                } finally {
                    canceledCacheKeys.remove(cacheKey);
                }
            }
        );
    }

    @PluginMethod
    public void clearCache(PluginCall call) {
        for (String cacheKey : new ArrayList<>(cacheWriters.keySet())) {
            cancelWriter(cacheKey);
        }
        cacheExecutor.execute(
            () -> {
                try {
                    NativeAudioCache.getInstance(getContext()).clear();
                    JSObject result = cacheStatus();
                    postResolve(call, result);
                    postEvent("cacheChanged", result);
                } catch (Exception error) {
                    postReject(call, error);
                } finally {
                    canceledCacheKeys.clear();
                }
            }
        );
    }

    private void withController(PluginCall call, ControllerAction action) {
        if (Looper.myLooper() != Looper.getMainLooper()) {
            progressHandler.post(() -> withController(call, action));
            return;
        }
        if (controller != null) {
            try {
                action.run(controller);
            } catch (Exception error) {
                call.reject(rootMessage(error), error);
            }
            return;
        }
        if (controllerFuture == null) {
            call.reject("Background audio controller is unavailable");
            return;
        }
        controllerFuture.addListener(
            () -> {
                try {
                    controller = controllerFuture.get();
                    action.run(controller);
                } catch (Exception error) {
                    call.reject(rootMessage(error), error);
                }
            },
            ContextCompat.getMainExecutor(getContext())
        );
    }

    private JSObject createState() {
        JSObject state = new JSObject();
        MediaController currentController = controller;
        state.put("token", activeToken);
        if (currentController == null) {
            state.put("playing", false);
            state.put("position", 0);
            state.put("duration", 0);
            state.put("playbackState", Player.STATE_IDLE);
            return state;
        }
        long duration = currentController.getDuration();
        state.put("playing", currentController.isPlaying());
        state.put("position", Math.max(0, currentController.getCurrentPosition()) / 1000.0);
        state.put("duration", duration > 0 ? duration / 1000.0 : 0);
        state.put("playbackState", currentController.getPlaybackState());
        state.put("volume", currentController.getVolume());
        state.put("playbackRate", currentController.getPlaybackParameters().speed);
        state.put("queueIndex", currentController.getCurrentMediaItemIndex());
        state.put("queueLength", currentController.getMediaItemCount());
        state.put("hasPrevious", currentController.hasPreviousMediaItem());
        state.put("hasNext", currentController.hasNextMediaItem());
        MediaItem mediaItem = currentController.getCurrentMediaItem();
        state.put("hasMedia", mediaItem != null);
        if (mediaItem != null) {
            state.put("mediaId", mediaItem.mediaId);
            state.put("title", text(mediaItem.mediaMetadata.title));
            state.put("artist", text(mediaItem.mediaMetadata.artist));
            state.put("album", text(mediaItem.mediaMetadata.albumTitle));
            if (mediaItem.localConfiguration != null) {
                state.put("source", mediaItem.localConfiguration.uri.toString());
            }
            state.put(
                "artwork",
                mediaItem.mediaMetadata.artworkUri == null
                    ? ""
                    : mediaItem.mediaMetadata.artworkUri.toString()
            );
        }
        return state;
    }

    private MediaItem createMediaItem(
        String source,
        JSObject track,
        String fallbackMediaId
    ) {
        String mediaId = track.optString("id", fallbackMediaId);
        MediaMetadata.Builder metadata =
            new MediaMetadata.Builder()
                .setTitle(track.optString("title", ""))
                .setArtist(track.optString("artist", ""))
                .setAlbumTitle(track.optString("album", ""));
        String artwork = track.optString("artwork", "");
        if (!artwork.isBlank()) metadata.setArtworkUri(Uri.parse(artwork));
        return configureCacheKey(
            new MediaItem.Builder()
                .setMediaId(mediaId)
                .setUri(source)
                .setMediaMetadata(metadata.build()),
            mediaId
        ).build();
    }

    private MediaItem.Builder configureCacheKey(
        MediaItem.Builder builder,
        String mediaId
    ) {
        if (!mediaId.isBlank()) {
            builder.setCustomCacheKey(NativeAudioCache.keyFor(mediaId));
        }
        return builder;
    }

    private JSObject cacheStatus() {
        NativeAudioCache.CacheStatus current =
            NativeAudioCache.getInstance(getContext()).status();
        JSObject state = new JSObject();
        state.put("bytes", current.bytes);
        state.put("length", current.length);
        state.put("completed", current.completed);
        state.put("active", cacheWriters.size());
        state.put("maxBytes", NativeAudioCache.MAX_CACHE_BYTES);
        return state;
    }

    private void cancelWriter(String cacheKey) {
        canceledCacheKeys.add(cacheKey);
        CacheWriter writer = cacheWriters.get(cacheKey);
        if (writer != null) writer.cancel();
    }

    private void emitCacheChanged(String cacheKey) {
        JSObject state = cacheStatus();
        state.put("cacheKey", cacheKey);
        postEvent("cacheChanged", state);
    }

    private void postEvent(String event, JSObject data) {
        progressHandler.post(() -> notifyListeners(event, data, true));
    }

    private void postResolve(PluginCall call, JSObject data) {
        progressHandler.post(() -> call.resolve(data));
    }

    private void postReject(PluginCall call, Exception error) {
        progressHandler.post(() -> call.reject(rootMessage(error), error));
    }

    private int mediaErrorCode(int errorCode) {
        if (
            errorCode == PlaybackException.ERROR_CODE_DECODER_INIT_FAILED ||
            errorCode == PlaybackException.ERROR_CODE_DECODER_QUERY_FAILED ||
            errorCode == PlaybackException.ERROR_CODE_DECODING_FORMAT_EXCEEDS_CAPABILITIES ||
            errorCode == PlaybackException.ERROR_CODE_DECODING_FORMAT_UNSUPPORTED
        ) {
            return 4;
        }
        if (errorCode == PlaybackException.ERROR_CODE_DECODING_FAILED) return 3;
        if (
            errorCode >= PlaybackException.ERROR_CODE_IO_NETWORK_CONNECTION_FAILED &&
            errorCode <= PlaybackException.ERROR_CODE_IO_READ_POSITION_OUT_OF_RANGE
        ) {
            return 2;
        }
        return 0;
    }

    private String transitionReason(int reason) {
        if (reason == Player.MEDIA_ITEM_TRANSITION_REASON_AUTO) return "auto";
        if (reason == Player.MEDIA_ITEM_TRANSITION_REASON_SEEK) return "seek";
        if (reason == Player.MEDIA_ITEM_TRANSITION_REASON_REPEAT) return "repeat";
        return "playlist";
    }

    private String errorKind(int errorCode) {
        int mediaCode = mediaErrorCode(errorCode);
        if (mediaCode == 4) return "unsupported";
        if (mediaCode == 3) return "decode";
        if (mediaCode == 2) return "network";
        return "unknown";
    }

    private void appendNativeErrorDetails(JSObject data, Throwable error) {
        Throwable cause = error;
        Throwable rootCause = error;
        while (cause != null) {
            rootCause = cause;
            if (cause instanceof HttpDataSource.InvalidResponseCodeException) {
                HttpDataSource.InvalidResponseCodeException responseError =
                    (HttpDataSource.InvalidResponseCodeException) cause;
                data.put("httpStatus", responseError.responseCode);
            }
            cause = cause.getCause();
        }
        data.put("cause", rootCause.getClass().getSimpleName());
        if (rootCause.getMessage() != null) {
            data.put("detail", rootCause.getMessage());
        }
    }

    private String text(CharSequence value) {
        return value == null ? "" : value.toString();
    }

    private void emitCommand(String action) {
        JSObject data = new JSObject();
        data.put("action", action);
        data.put("token", activeToken);
        notifyListeners("command", data, true);
    }

    private String rootMessage(Exception error) {
        Throwable cause = error;
        if (error instanceof ExecutionException && error.getCause() != null) {
            cause = error.getCause();
        }
        String message = cause.getMessage();
        return message == null ? cause.toString() : message;
    }
}
