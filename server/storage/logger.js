import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG_PATH = path.join(__dirname, 'logs.jsonl');
const MAX_LOG_LINES = 2000;

export function logEntry(entry) {
  const line = JSON.stringify({
    time: new Date().toISOString(),
    ...entry,
  }) + '\n';

  try {
    fs.appendFileSync(LOG_PATH, line, 'utf-8');
    trimLogFile();
  } catch {
    // Silent fail - logging is best-effort
  }
}

export function getLogs(count = 200) {
  try {
    if (!fs.existsSync(LOG_PATH)) return [];
    const raw = fs.readFileSync(LOG_PATH, 'utf-8');
    const lines = raw.trim().split('\n').filter(Boolean);
    const parsed = lines.map(l => {
      try { return JSON.parse(l); } catch { return null; }
    }).filter(Boolean);
    return parsed.slice(-count).reverse();
  } catch {
    return [];
  }
}

export function clearLogs() {
  try {
    fs.writeFileSync(LOG_PATH, '', 'utf-8');
  } catch {
    // Silent fail
  }
}

function trimLogFile() {
  try {
    if (!fs.existsSync(LOG_PATH)) return;
    const raw = fs.readFileSync(LOG_PATH, 'utf-8');
    const lines = raw.trim().split('\n').filter(Boolean);
    if (lines.length > MAX_LOG_LINES) {
      fs.writeFileSync(LOG_PATH, lines.slice(-MAX_LOG_LINES).join('\n') + '\n', 'utf-8');
    }
  } catch {
    // Silent fail
  }
}
