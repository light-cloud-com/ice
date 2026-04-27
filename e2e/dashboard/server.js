/**
 * Dashboard Server — Node.js HTTP server for the interactive test dashboard
 *
 * Uses only built-in Node modules (no express dependency).
 *
 * Serves the dashboard UI and provides API endpoints for:
 * - Listing templates
 * - Starting/stopping test runs
 * - Streaming progress via SSE
 * - Serving reports
 *
 * Run: pnpm test:dashboard
 * Opens: http://localhost:15200
 */
import { readFileSync as _readEnv } from 'fs';
// Load .env manually — dotenv not available at e2e level
try {
    const envFile = _readEnv('.env', 'utf-8');
    for (const line of envFile.split('\n')) {
        const match = line.match(/^([A-Z_]+)=(.+)$/);
        if (match && !process.env[match[1]])
            process.env[match[1]] = match[2].trim();
    }
}
catch { }
import { createServer } from 'http';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { TestRunner } from './runner';
const __dirname = dirname(fileURLToPath(import.meta.url));
// Dynamic import of @ice/templates — use resolved absolute path since
// workspace packages aren't available as bare specifiers from e2e/
async function loadTemplates() {
    try {
        const { resolve } = await import('path');
        const templatesPath = resolve(process.cwd(), 'packages/templates/src/index.ts');
        const mod = await import(templatesPath);
        return { templates: mod.ALL_TEMPLATES || [], categories: mod.TEMPLATE_CATEGORIES || [] };
    }
    catch (err) {
        console.warn('Could not load templates:', err.message);
        return { templates: [], categories: [] };
    }
}
const PORT = 15200;
const runner = new TestRunner();
// ─── Helpers ───────────────────────────────────────────────────────────────
function json(res, data, status = 200) {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
}
function html(res, content, status = 200) {
    res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(content);
}
function text(res, content, status = 200) {
    res.writeHead(status, { 'Content-Type': 'text/plain' });
    res.end(content);
}
function readBody(req) {
    return new Promise((resolve) => {
        const chunks = [];
        req.on('data', (chunk) => chunks.push(chunk));
        req.on('end', () => resolve(Buffer.concat(chunks).toString()));
    });
}
// ─── Route Handler ─────────────────────────────────────────────────────────
async function handleRequest(req, res) {
    const url = new URL(req.url || '/', `http://localhost:${PORT}`);
    const path = url.pathname;
    const method = req.method || 'GET';
    // CORS for local dev
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }
    try {
        // ── Serve Dashboard HTML ─────────────────────────────────
        if (method === 'GET' && path === '/') {
            const htmlPath = join(__dirname, 'index.html');
            if (existsSync(htmlPath)) {
                html(res, readFileSync(htmlPath, 'utf-8'));
            }
            else {
                text(res, 'Dashboard HTML not found at ' + htmlPath, 404);
            }
            return;
        }
        // ── API: Config (pre-filled from .env) ─────────────────────
        if (method === 'GET' && path === '/api/config') {
            json(res, {
                githubToken: process.env.ICE_TEST_GITHUB_TOKEN || '',
            });
            return;
        }
        // ── API: List Templates ──────────────────────────────────
        if (method === 'GET' && path === '/api/templates') {
            const { templates, categories } = await loadTemplates();
            json(res, {
                templates: templates.map((t) => ({
                    id: t.id,
                    name: t.name,
                    description: t.description,
                    category: t.category,
                    difficulty: t.difficulty,
                    estimatedCost: t.estimatedCost,
                    blockCount: t.blocks?.length || 0,
                    tags: t.tags || [],
                })),
                categories,
            });
            return;
        }
        // ── API: Run Status ──────────────────────────────────────
        if (method === 'GET' && path === '/api/status') {
            json(res, runner.getFullStatus());
            return;
        }
        // ── API: Process Output ──────────────────────────────────
        if (method === 'GET' && path === '/api/output') {
            json(res, { output: runner.getOutput() });
            return;
        }
        // ── API: Pre-flight check ──────────────────────────────────
        if (method === 'GET' && path === '/api/preflight') {
            json(res, await runner.preflight());
            return;
        }
        // ── API: Create Test Repos ─────────────────────────────────
        if (method === 'POST' && path === '/api/repos/create') {
            const body = JSON.parse(await readBody(req));
            const token = body.githubToken;
            if (!token) {
                json(res, { error: 'GitHub token required' }, 400);
                return;
            }
            process.env.ICE_TEST_GITHUB_TOKEN = token;
            try {
                const { resolve } = await import('path');
                const reposPath = resolve(process.cwd(), 'e2e/repos/index.ts');
                const { ensureTestRepos } = await import(reposPath);
                const result = await ensureTestRepos();
                // Forward the per-repo statuses AND the manifest's own success flag —
                // hardcoding success:true hid real 403/permission failures from the UI.
                json(res, { success: result.success !== false, repos: result.repos });
            }
            catch (err) {
                json(res, { success: false, error: err.message }, 500);
            }
            return;
        }
        // ── API: Delete Test Repos ───────────────────────────────
        if (method === 'POST' && path === '/api/repos/delete') {
            try {
                const raw = await readBody(req).catch(() => '');
                const body = raw ? JSON.parse(raw) : {};
                if (body.githubToken)
                    process.env.ICE_TEST_GITHUB_TOKEN = body.githubToken;
                const { resolve } = await import('path');
                const reposPath = resolve(process.cwd(), 'e2e/repos/index.ts');
                const { cleanupTestRepos } = await import(reposPath);
                const result = await cleanupTestRepos();
                json(res, {
                    success: result.success,
                    discovered: result.discovered,
                    deleted: result.deleted,
                    failed: result.failed,
                });
            }
            catch (err) {
                json(res, { success: false, error: err.message }, 500);
            }
            return;
        }
        // ── API: Start Run ───────────────────────────────────────
        if (method === 'POST' && path === '/api/run') {
            const body = JSON.parse(await readBody(req));
            const { templates, project, region, saKeyPath, githubToken } = body;
            if (!templates?.length) {
                json(res, { error: 'No templates selected' }, 400);
                return;
            }
            if (!project) {
                json(res, { error: 'GCP project required' }, 400);
                return;
            }
            if (!saKeyPath) {
                json(res, { error: 'SA key path required' }, 400);
                return;
            }
            const result = await runner.start({
                templates,
                project,
                region: region || 'us-central1',
                saKeyPath,
                githubToken: githubToken || undefined,
            });
            json(res, result);
            return;
        }
        // ── API: Stop Run ────────────────────────────────────────
        if (method === 'POST' && path === '/api/stop') {
            json(res, runner.stop());
            return;
        }
        // ── API: SSE Progress Stream ─────────────────────────────
        if (method === 'GET' && path === '/api/progress') {
            res.writeHead(200, {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                Connection: 'keep-alive',
            });
            let lastOutputLen = 0;
            const interval = setInterval(() => {
                const progress = runner.getProgress();
                const output = runner.getOutput();
                // Only send new output lines
                const newOutput = output.slice(lastOutputLen);
                lastOutputLen = output.length;
                const fullStatus = runner.getFullStatus();
                const data = JSON.stringify({
                    runnerStatus: fullStatus.status,
                    error: fullStatus.error,
                    progress,
                    newOutput,
                });
                res.write(`data: ${data}\n\n`);
                // Keep streaming for 5s after run ends so client gets final state
                if (fullStatus.status !== 'running' && fullStatus.status !== 'idle') {
                    setTimeout(() => {
                        clearInterval(interval);
                        // Send one final event
                        const finalData = JSON.stringify({
                            runnerStatus: runner.getFullStatus().status,
                            progress: runner.getProgress(),
                            newOutput: [],
                            final: true,
                        });
                        res.write(`data: ${finalData}\n\n`);
                        res.end();
                    }, 3000);
                }
            }, 1000);
            req.on('close', () => clearInterval(interval));
            return;
        }
        // ── API: Get Report JSON ─────────────────────────────────
        if (method === 'GET' && path === '/api/report') {
            const reportPath = runner.getLatestReportPath();
            if (!reportPath) {
                json(res, { error: 'No report available' }, 404);
                return;
            }
            try {
                json(res, JSON.parse(readFileSync(reportPath, 'utf-8')));
            }
            catch {
                json(res, { error: 'Failed to read report' }, 500);
            }
            return;
        }
        // ── API: Serve HTML Report ───────────────────────────────
        if (method === 'GET' && path === '/api/report/html') {
            const htmlPath = join(process.cwd(), 'test-results/gcp', 'latest-report.html');
            if (existsSync(htmlPath)) {
                html(res, readFileSync(htmlPath, 'utf-8'));
            }
            else {
                text(res, 'No HTML report available yet', 404);
            }
            return;
        }
        // ── 404 ──────────────────────────────────────────────────
        text(res, 'Not Found', 404);
    }
    catch (err) {
        console.error('Request error:', err);
        json(res, { error: err.message }, 500);
    }
}
// ─── Start Server ──────────────────────────────────────────────────────────
const server = createServer(handleRequest);
server.listen(PORT, () => {
    console.log(`\n  ICE GCP Test Dashboard`);
    console.log(`  http://localhost:${PORT}\n`);
});
