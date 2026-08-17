package com.axuanran.yesplaymusic;

import android.app.PendingIntent;
import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.KeyEvent;

import androidx.annotation.Nullable;
import androidx.annotation.OptIn;
import androidx.media3.common.AudioAttributes;
import androidx.media3.common.C;
import androidx.media3.common.Player;
import androidx.media3.common.util.UnstableApi;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory;
import androidx.media3.session.CommandButton;
import androidx.media3.session.MediaSession;
import androidx.media3.session.MediaSessionService;
import androidx.media3.session.SessionCommand;
import androidx.media3.session.SessionCommands;
import androidx.media3.session.SessionResult;

import com.google.common.collect.ImmutableList;
import com.google.common.util.concurrent.Futures;
import com.google.common.util.concurrent.ListenableFuture;

/**
 * Owns Android playback independently from the Capacitor activity so audio can
 * continue while the WebView is backgrounded or the screen is locked.
 */
@OptIn(markerClass = UnstableApi.class)
public final class PlaybackService extends MediaSessionService {
    private static final SessionCommand PREVIOUS_COMMAND =
        new SessionCommand("com.axuanran.yesplaymusic.PREVIOUS", Bundle.EMPTY);
    private static final SessionCommand NEXT_COMMAND =
        new SessionCommand("com.axuanran.yesplaymusic.NEXT", Bundle.EMPTY);

    public interface MediaButtonListener {
        void onPrevious();
        void onNext();
    }

    private static volatile MediaButtonListener mediaButtonListener;
    private final Handler persistenceHandler = new Handler(Looper.getMainLooper());
    private MediaSession mediaSession;
    private PlaybackStateStore stateStore;
    private final Runnable persistProgress =
        new Runnable() {
            @Override
            public void run() {
                if (mediaSession != null) {
                    stateStore.save(mediaSession.getPlayer());
                    persistenceHandler.postDelayed(this, 2000);
                }
            }
        };

    public static void setMediaButtonListener(@Nullable MediaButtonListener listener) {
        mediaButtonListener = listener;
    }

    @Override
    public void onCreate() {
        super.onCreate();
        stateStore = new PlaybackStateStore(this);
        AudioAttributes audioAttributes =
            new AudioAttributes.Builder()
                .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)
                .setUsage(C.USAGE_MEDIA)
                .build();
        NativeAudioCache audioCache = NativeAudioCache.getInstance(this);
        DefaultMediaSourceFactory mediaSourceFactory =
            new DefaultMediaSourceFactory(this)
                .setDataSourceFactory(audioCache.getDataSourceFactory());
        ExoPlayer player =
            new ExoPlayer.Builder(this)
                .setMediaSourceFactory(mediaSourceFactory)
                .build();
        player.setAudioAttributes(audioAttributes, true);
        player.setHandleAudioBecomingNoisy(true);
        player.addListener(
            new Player.Listener() {
                @Override
                public void onEvents(Player currentPlayer, Player.Events events) {
                    stateStore.save(currentPlayer);
                }
            }
        );
        PendingIntent sessionActivity =
            PendingIntent.getActivity(
                this,
                0,
                new Intent(this, MainActivity.class),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            );
        CommandButton previousButton =
            new CommandButton.Builder(CommandButton.ICON_PREVIOUS)
                .setDisplayName("Previous")
                .setSessionCommand(PREVIOUS_COMMAND)
                .build();
        CommandButton nextButton =
            new CommandButton.Builder(CommandButton.ICON_NEXT)
                .setDisplayName("Next")
                .setSessionCommand(NEXT_COMMAND)
                .build();
        mediaSession =
            new MediaSession.Builder(this, player)
                .setSessionActivity(sessionActivity)
                .setMediaButtonPreferences(
                    ImmutableList.of(previousButton, nextButton)
                )
                .setCallback(
                    new MediaSession.Callback() {
                        @Override
                        public MediaSession.ConnectionResult onConnect(
                            MediaSession session,
                            MediaSession.ControllerInfo controller
                        ) {
                            SessionCommands commands =
                                MediaSession.ConnectionResult.DEFAULT_SESSION_COMMANDS
                                    .buildUpon()
                                    .add(PREVIOUS_COMMAND)
                                    .add(NEXT_COMMAND)
                                    .build();
                            return new MediaSession.ConnectionResult.AcceptedResultBuilder(
                                session
                            )
                                .setAvailableSessionCommands(commands)
                                .build();
                        }

                        @Override
                        public ListenableFuture<SessionResult> onCustomCommand(
                            MediaSession session,
                            MediaSession.ControllerInfo controller,
                            SessionCommand command,
                            Bundle args
                        ) {
                            if (PREVIOUS_COMMAND.equals(command)) {
                                handlePrevious(session.getPlayer());
                                return Futures.immediateFuture(
                                    new SessionResult(SessionResult.RESULT_SUCCESS)
                                );
                            }
                            if (NEXT_COMMAND.equals(command)) {
                                handleNext(session.getPlayer());
                                return Futures.immediateFuture(
                                    new SessionResult(SessionResult.RESULT_SUCCESS)
                                );
                            }
                            return MediaSession.Callback.super.onCustomCommand(
                                session,
                                controller,
                                command,
                                args
                            );
                        }

                        @Override
                        public ListenableFuture<MediaSession.MediaItemsWithStartPosition> onPlaybackResumption(
                            MediaSession session,
                            MediaSession.ControllerInfo controller,
                            boolean isForPlayback
                        ) {
                            PlaybackStateStore.Snapshot snapshot = stateStore.restore();
                            if (snapshot == null) {
                                return Futures.immediateFailedFuture(
                                    new IllegalStateException("No saved playback state")
                                );
                            }
                            session.getPlayer().setVolume(snapshot.volume);
                            session.getPlayer().setPlaybackSpeed(snapshot.playbackSpeed);
                            return Futures.immediateFuture(
                                new MediaSession.MediaItemsWithStartPosition(
                                    snapshot.mediaItems,
                                    snapshot.currentIndex,
                                    snapshot.positionMs
                                )
                            );
                        }

                        @Override
                        public boolean onMediaButtonEvent(
                            MediaSession session,
                            MediaSession.ControllerInfo controllerInfo,
                            Intent intent
                        ) {
                            KeyEvent event = intent.getParcelableExtra(Intent.EXTRA_KEY_EVENT);
                            if (event == null || event.getAction() != KeyEvent.ACTION_DOWN) {
                                return false;
                            }
                            if (event.getKeyCode() == KeyEvent.KEYCODE_MEDIA_NEXT) {
                                handleNext(session.getPlayer());
                                return true;
                            }
                            if (event.getKeyCode() == KeyEvent.KEYCODE_MEDIA_PREVIOUS) {
                                handlePrevious(session.getPlayer());
                                return true;
                            }
                            return false;
                        }
                    }
                )
                .build();
        persistenceHandler.post(persistProgress);
    }

    private static void emitPrevious() {
        MediaButtonListener listener = mediaButtonListener;
        if (listener != null) listener.onPrevious();
    }

    private static void handlePrevious(Player player) {
        if (player.hasPreviousMediaItem()) {
            player.seekToPreviousMediaItem();
            return;
        }
        emitPrevious();
    }

    private static void emitNext() {
        MediaButtonListener listener = mediaButtonListener;
        if (listener != null) listener.onNext();
    }

    private static void handleNext(Player player) {
        if (player.hasNextMediaItem()) {
            player.seekToNextMediaItem();
            return;
        }
        emitNext();
    }

    @Nullable
    @Override
    public MediaSession onGetSession(MediaSession.ControllerInfo controllerInfo) {
        return mediaSession;
    }

    @Override
    public void onDestroy() {
        persistenceHandler.removeCallbacks(persistProgress);
        if (mediaSession != null) {
            stateStore.save(mediaSession.getPlayer());
            mediaSession.getPlayer().release();
            mediaSession.release();
            mediaSession = null;
        }
        super.onDestroy();
    }
}
