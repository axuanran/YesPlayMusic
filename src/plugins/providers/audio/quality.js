function getRuntimeStore() {
  return globalThis?.yesplaymusicStore;
}

export function getResolverQuality(runtimeStore = getRuntimeStore()) {
  const quality = runtimeStore?.state?.settings?.musicQuality ?? 320000;
  switch (quality) {
    case 'standard':
    case 'exhigh':
    case 'lossless':
    case 'hires':
    case 'jyeffect':
    case 'sky':
    case 'jymaster':
      return quality;
    case 128000:
      return 'standard';
    case 192000:
    case 320000:
      return 'exhigh';
    case 'flac':
    case 350000:
      return 'lossless';
    case 999000:
      return 'hires';
    default:
      return 'standard';
  }
}
