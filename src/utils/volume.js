export const VOLUME_WHEEL_STEP = 0.05;

const clampVolume = volume => Math.min(1, Math.max(0, volume));

export function getWheelAdjustedVolume(
  volume,
  deltaY,
  step = VOLUME_WHEEL_STEP
) {
  const currentVolume = Number(volume);
  const wheelDelta = Number(deltaY);
  const volumeStep = Number(step);

  if (!Number.isFinite(currentVolume)) return 0;
  if (
    !Number.isFinite(wheelDelta) ||
    wheelDelta === 0 ||
    !Number.isFinite(volumeStep) ||
    volumeStep <= 0
  ) {
    return clampVolume(currentVolume);
  }

  const nextVolume =
    currentVolume + (wheelDelta < 0 ? volumeStep : -volumeStep);
  return Math.round(clampVolume(nextVolume) * 100) / 100;
}
