import { registerPlugin } from '@capacitor/core';
import { isCapacitor } from '@/utils/env';

const TrackDownload = registerPlugin('TrackDownload');

export function downloadTrackOnMobile({ url, fileName, requestId = '' }) {
  if (!isCapacitor) throw new Error('Native track download is unavailable');
  return TrackDownload.download({ url, fileName, requestId });
}

export function shareDownloadedTrackOnMobile({
  uri,
  mimeType = 'audio/*',
  chooserTitle = 'Share original track',
}) {
  if (!isCapacitor) throw new Error('Native track sharing is unavailable');
  return TrackDownload.share({ uri, mimeType, chooserTitle });
}

export async function addTrackDownloadProgressListener(listener) {
  if (!isCapacitor) return null;
  return TrackDownload.addListener('progress', listener);
}
