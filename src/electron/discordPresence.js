export function getDiscordProgressTimestamps({
  durationMs,
  now = Date.now(),
  playbackRate = 1,
  positionSeconds = 0,
}) {
  const rate =
    Number.isFinite(playbackRate) && playbackRate > 0 ? playbackRate : 1;
  const duration = Math.max(0, Number(durationMs) || 0) / rate;
  const position = Math.max(0, Number(positionSeconds) || 0);
  const elapsed = Math.min(duration, (position * 1000) / rate);
  const startTimestamp = now - elapsed;

  return {
    endTimestamp: startTimestamp + duration,
    startTimestamp,
  };
}

export function shouldShowDiscordStatus(connected, enabled) {
  return connected === true && enabled === true;
}

export function getDiscordStatus(connected, enabled) {
  return {
    connected: connected === true,
    enabled: enabled === true,
  };
}

export function canPublishDiscordPresence(connected, enabled) {
  return connected === true && enabled === true;
}
