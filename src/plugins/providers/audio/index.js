import { registerResolverAudioProvider } from './resolverProvider';

export {
  clearAudioProviderCache,
  getAudioProviders,
  getAudioProviderStatus,
  registerAudioProvider,
  resolveTrackSourceWithProviders,
  unregisterAudioProvider,
} from './registry';

export { getResolverQuality } from './quality';
export { registerResolverAudioProvider } from './resolverProvider';

registerResolverAudioProvider();
