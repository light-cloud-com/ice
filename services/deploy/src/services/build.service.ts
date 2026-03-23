/**
 * Build Service — Downloads repo source, runs install + build, streams logs
 *
 * Phase 2 implementation:
 * 1. Download repo tarball from GitHub at specific commit/branch
 * 2. Extract to temp directory
 * 3. Run install command (npm ci / yarn / pnpm)
 * 4. Run build command (npm run build)
 * 5. Stream stdout/stderr as deployment log steps via callback
 * 6. Clean up temp directory
 */

import { execSync, spawn } from 'child_process';
import { mkdtempSync, rmSync, existsSync, createWriteStream } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { pipeline as streamPipeline } from 'stream/promises';
import prisma from '@ice/db';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface BuildConfig {
  repository: string; // "owner/repo"
  branch: string;
  commitSha: string;
  installCommand: string | null;
  buildCommand: string | null;
  outputDir: string | null;
  framework: string | null;
}

export interface BuildResult {
  success: boolean;
  buildDir: string;
  outputPath: string | null;
  duration_ms: number;
  error?: string;
}

type LogCallback = (step: string, status: 'started' | 'completed' | 'failed', message: string) => Promise<void>;
type LineCallback = (line: string) => void;

// ─── Main Build Function ────────────────────────────────────────────────────

export async function buildFromSource(
  config: BuildConfig,
  userId: string,
  onLog: LogCallback,
  onLine?: LineCallback,
): Promise<BuildResult> {
  const startTime = Date.now();
  const buildDir = mkdtempSync(join(tmpdir(), 'ice-build-'));

  // Build cache: reuse node_modules from previous builds of the same repo
  const cacheDir = join(tmpdir(), 'ice-build-cache', config.repository.replace('/', '-'));
  const cachedNodeModules = join(cacheDir, 'node_modules');

  try {
    // ── Step 1: Download source ──
    await onLog('clone', 'started', `Downloading ${config.repository}@${config.branch}`);

    const token = await getGitHubToken(userId);
    if (!token) {
      throw new Error('GitHub not connected. Please connect GitHub first.');
    }

    await downloadAndExtract(
      token,
      config.repository,
      config.commitSha !== 'HEAD' ? config.commitSha : config.branch,
      buildDir,
    );

    await onLog('clone', 'completed', `Source downloaded (${config.repository})`);

    // ── Step 2: Install dependencies (with cache) ──
    const installCmd = config.installCommand || detectInstallCommand(buildDir);
    if (installCmd) {
      // Restore cached node_modules via hardlinks (fast, space-efficient)
      if (existsSync(cachedNodeModules)) {
        try {
          execSync(`cp -al "${cachedNodeModules}" "${join(buildDir, 'node_modules')}"`, {
            stdio: 'pipe',
            timeout: 30000,
          });
          await onLog('install', 'started', `Running: ${installCmd} (cached via hardlinks)`);
        } catch {
          // Hardlinks failed (cross-device?), fall back to regular copy
          try {
            execSync(`cp -r "${cachedNodeModules}" "${join(buildDir, 'node_modules')}"`, {
              stdio: 'pipe',
              timeout: 60000,
            });
            await onLog('install', 'started', `Running: ${installCmd} (cached)`);
          } catch {
            await onLog('install', 'started', `Running: ${installCmd}`);
          }
        }
      } else {
        await onLog('install', 'started', `Running: ${installCmd}`);
      }

      await runCommand(installCmd, buildDir, async (line) => {
        onLine?.(`[install] ${line}`);
      });
      await onLog('install', 'completed', 'Dependencies installed');

      // Save node_modules to cache for next build (using rsync for incremental updates)
      try {
        const buildNodeModules = join(buildDir, 'node_modules');
        if (existsSync(buildNodeModules)) {
          execSync(`mkdir -p "${cacheDir}"`, { stdio: 'pipe' });
          execSync(`rsync -a --delete "${buildNodeModules}/" "${cachedNodeModules}/"`, {
            stdio: 'pipe',
            timeout: 120000,
          });
        }
      } catch {
        /* cache save is best-effort */
      }
    }

    // ── Step 3: Build ──
    const buildCmd = config.buildCommand;
    if (buildCmd) {
      await onLog('build', 'started', `Running: ${buildCmd}`);
      await runCommand(buildCmd, buildDir, async (line) => {
        onLine?.(`[build] ${line}`);
      });
      await onLog('build', 'completed', 'Build successful');
    } else {
      await onLog('build', 'completed', 'No build command — skipping');
    }

    // ── Determine output path ──
    const outputPath = config.outputDir ? join(buildDir, config.outputDir) : buildDir;

    return {
      success: true,
      buildDir,
      outputPath: existsSync(outputPath) ? outputPath : buildDir,
      duration_ms: Date.now() - startTime,
    };
  } catch (err: any) {
    await onLog('error', 'failed', err.message);
    return {
      success: false,
      buildDir,
      outputPath: null,
      duration_ms: Date.now() - startTime,
      error: err.message,
    };
  }
}

/**
 * Clean up a build directory after deploy completes
 */
export function cleanupBuild(buildDir: string) {
  try {
    if (buildDir.startsWith(tmpdir()) && existsSync(buildDir)) {
      rmSync(buildDir, { recursive: true, force: true });
    }
  } catch {
    // Best-effort cleanup
  }
}

// ─── Download & Extract ─────────────────────────────────────────────────────

async function downloadAndExtract(token: string, repository: string, ref: string, targetDir: string): Promise<void> {
  const [owner, repo] = repository.split('/');
  const tarballUrl = `https://api.github.com/repos/${owner}/${repo}/tarball/${ref}`;

  const response = await fetch(tarballUrl, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    redirect: 'follow',
  });

  if (!response.ok) {
    throw new Error(`Failed to download source: ${response.status} ${response.statusText}`);
  }

  // Save tarball to temp file
  const tarPath = join(targetDir, '_source.tar.gz');
  const fileStream = createWriteStream(tarPath);
  // @ts-ignore - Node fetch body is readable
  await streamPipeline(response.body as any, fileStream);

  // Extract (--strip-components=1 removes the top-level GitHub directory)
  try {
    execSync(`tar xzf _source.tar.gz --strip-components=1`, {
      cwd: targetDir,
      stdio: 'pipe',
      timeout: 60000,
    });
  } catch (err: any) {
    throw new Error(`Failed to extract source: ${err.message}`, { cause: err });
  }

  // Remove tarball
  try {
    rmSync(tarPath);
  } catch {
    /* ignore */
  }
}

// ─── Run Command with Streaming Output ──────────────────────────────────────

// Allowlist of safe commands that can be executed by the build service
const ALLOWED_COMMANDS = new Set([
  'npm',
  'npx',
  'yarn',
  'pnpm',
  'pip',
  'go',
  'make',
  'cargo',
  'dotnet',
  'mvn',
  'gradle',
]);

function validateAndParseCommand(command: string): { cmd: string; args: string[] } {
  // Parse respecting quoted strings
  const parts: string[] = [];
  let current = '';
  let inQuote = false;
  let quoteChar = '';
  for (const ch of command) {
    if (inQuote) {
      if (ch === quoteChar) {
        inQuote = false;
      } else {
        current += ch;
      }
    } else if (ch === '"' || ch === "'") {
      inQuote = true;
      quoteChar = ch;
    } else if (ch === ' ' || ch === '\t') {
      if (current) {
        parts.push(current);
        current = '';
      }
    } else {
      current += ch;
    }
  }
  if (current) parts.push(current);

  const [cmd, ...args] = parts;
  if (!cmd) throw new Error('Empty command');

  // Block shell metacharacters in all parts
  const SHELL_META = /[;&|`$(){}[\]<>!\n\\]/;
  for (const part of parts) {
    if (SHELL_META.test(part)) {
      throw new Error(`Command contains disallowed shell metacharacter: "${part}"`);
    }
  }

  // Validate command is in the allowlist
  const baseName = cmd.split('/').pop()!;
  if (!ALLOWED_COMMANDS.has(baseName)) {
    throw new Error(`Command "${baseName}" is not in the allowed list. Allowed: ${[...ALLOWED_COMMANDS].join(', ')}`);
  }

  return { cmd, args };
}

function runCommand(command: string, cwd: string, onOutput: (line: string) => Promise<void>): Promise<void> {
  return new Promise((resolve, reject) => {
    const { cmd, args } = validateAndParseCommand(command);
    const proc = spawn(cmd, args, {
      cwd,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, CI: 'true', NODE_ENV: 'production' },
      timeout: 300000, // 5 minute timeout
    });

    let stderr = '';

    proc.stdout?.on('data', (chunk: Buffer) => {
      const lines = chunk.toString().split('\n').filter(Boolean);
      for (const line of lines) {
        onOutput(line).catch(() => {});
      }
    });

    proc.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
      const lines = chunk.toString().split('\n').filter(Boolean);
      for (const line of lines) {
        onOutput(line).catch(() => {});
      }
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Command "${command}" exited with code ${code}.\n${stderr.slice(-500)}`));
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to run "${command}": ${err.message}`));
    });
  });
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function detectInstallCommand(buildDir: string): string | null {
  if (existsSync(join(buildDir, 'pnpm-lock.yaml'))) return 'pnpm install --frozen-lockfile';
  if (existsSync(join(buildDir, 'yarn.lock'))) return 'yarn install --frozen-lockfile';
  if (existsSync(join(buildDir, 'package-lock.json'))) return 'npm ci';
  if (existsSync(join(buildDir, 'package.json'))) return 'npm install';
  if (existsSync(join(buildDir, 'requirements.txt'))) return 'pip install -r requirements.txt';
  if (existsSync(join(buildDir, 'go.mod'))) return 'go mod download';
  return null;
}

async function getGitHubToken(_userId: string): Promise<string | null> {
  // Find any user in the org who has a GitHub token
  const record = await prisma.gitHubToken.findFirst({
    orderBy: { connected_at: 'desc' },
  });
  if (!record) return null;
  try {
    const { decryptString } = await import('@ice/shared');
    return decryptString(record.access_token);
  } catch {
    return record.access_token;
  }
}
