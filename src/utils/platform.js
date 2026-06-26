import { isDevelopment, platform } from '@/utils/env';

export { isDevelopment };

export const isWindows = platform === 'win32';
export const isMac = platform === 'darwin';
export const isLinux = platform === 'linux';

export const isCreateTray = isWindows || isLinux || isDevelopment;
