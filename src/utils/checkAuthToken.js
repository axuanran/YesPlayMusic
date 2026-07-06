import os from 'os';
import fs from 'fs';
import path from 'path';

const anonymousTokenPath = path.resolve(os.tmpdir(), 'anonymous_token');

export function ensureAnonymousToken() {
  // Extracted from NeteasyCloudMusicAPI/generateConfig.js to avoid import-time crashes.
  if (!fs.existsSync(anonymousTokenPath)) {
    fs.writeFileSync(anonymousTokenPath, '', 'utf-8');
  }
}

ensureAnonymousToken();
