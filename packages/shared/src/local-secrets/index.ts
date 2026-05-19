/**
 * Local secret bootstrap for ICE Community Edition.
 *
 * Auto-generates and persists JWT_SECRET and CREDENTIAL_ENCRYPTION_KEY on
 * first boot, so single-user self-hosted installs never need to set them.
 *
 * Persisted to a per-user config path (chmod 600) and reused across boots,
 * which is what lets DB-encrypted provider credentials survive restarts —
 * the desktop app previously regenerated these per launch and silently
 * invalidated every saved credential.
 */

import { randomBytes } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { dirname, join } from 'node:path';

interface LocalSecrets {
  jwtSecret: string;
  credentialEncryptionKey: string;
}

function defaultConfigPath(): string {
  const home = homedir();
  switch (platform()) {
    case 'darwin':
      return join(home, 'Library', 'Application Support', 'ice', 'secrets.json');
    case 'win32':
      return join(process.env.APPDATA || join(home, 'AppData', 'Roaming'), 'ice', 'secrets.json');
    default:
      return join(process.env.XDG_CONFIG_HOME || join(home, '.config'), 'ice', 'secrets.json');
  }
}

function generate(): LocalSecrets {
  return {
    jwtSecret: randomBytes(32).toString('hex'),
    credentialEncryptionKey: randomBytes(32).toString('hex'),
  };
}

function load(path: string): LocalSecrets | null {
  if (!existsSync(path)) return null;
  try {
    const raw = readFileSync(path, 'utf8');
    const parsed = JSON.parse(raw);
    if (typeof parsed?.jwtSecret === 'string' && typeof parsed?.credentialEncryptionKey === 'string') {
      return parsed;
    }
  } catch {
    // fall through — treat as missing and regenerate
  }
  return null;
}

function persist(path: string, secrets: LocalSecrets): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(secrets, null, 2), 'utf8');
  // chmod is a no-op on Windows; ignore failures elsewhere too — the
  // file still lives inside the user's home and is not world-readable
  // by default on macOS/Linux unless the umask is unusual.
  try {
    chmodSync(path, 0o600);
  } catch {
    // best effort
  }
}

/**
 * Ensures `process.env.JWT_SECRET` and `process.env.CREDENTIAL_ENCRYPTION_KEY`
 * are populated. Env vars set by the caller win; otherwise loads from the
 * persisted file or generates and persists fresh values.
 *
 * Returns the path the secrets came from / landed at — callers can log
 * this on first boot so the user knows where to find / back up the file.
 */
export function ensureLocalSecrets(configPath: string = defaultConfigPath()): {
  path: string;
  generated: boolean;
} {
  const haveJwt = !!process.env.JWT_SECRET;
  const haveCrypto = !!process.env.CREDENTIAL_ENCRYPTION_KEY;
  if (haveJwt && haveCrypto) {
    return { path: configPath, generated: false };
  }

  let secrets = load(configPath);
  let generated = false;
  if (!secrets) {
    secrets = generate();
    persist(configPath, secrets);
    generated = true;
  }

  if (!haveJwt) process.env.JWT_SECRET = secrets.jwtSecret;
  if (!haveCrypto) process.env.CREDENTIAL_ENCRYPTION_KEY = secrets.credentialEncryptionKey;

  return { path: configPath, generated };
}
