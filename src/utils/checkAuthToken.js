import os from 'os';
import fs from 'fs';
import path from 'path';

// extract from NeteasyCloudMusicAPI/generateConfig.js and avoid bugs in there (generateConfig require main.js but the main.js has bugs)
const anonymousTokenPath = path.resolve(os.tmpdir(), 'anonymous_token');

try {
  fs.mkdirSync(path.dirname(anonymousTokenPath), { recursive: true });
  if (!fs.existsSync(anonymousTokenPath)) {
    fs.writeFileSync(anonymousTokenPath, '', 'utf-8');
  }
} catch (error) {
  console.warn('Failed to initialize anonymous_token', error);
}
