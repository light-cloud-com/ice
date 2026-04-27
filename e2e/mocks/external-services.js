/**
 * Mock Server for External Services
 *
 * Lightweight Express server (port 4100) that intercepts calls
 * the backend makes to GCP, GitHub, Stripe APIs.
 */
import express from 'express';
let server = null;
// Stateful mock — tests can control responses
const state = {
    deployResult: 'success',
    requests: new Map(),
};
export function setDeployResult(result) {
    state.deployResult = result;
}
export function getRequests(path) {
    return state.requests.get(path) || [];
}
export function clearRequests() {
    state.requests.clear();
}
function recordRequest(path, body) {
    if (!state.requests.has(path)) {
        state.requests.set(path, []);
    }
    state.requests.get(path).push(body);
}
export async function startMockServer() {
    const app = express();
    app.use(express.json());
    // ── GCP Mocks ─────────────────────────────────────────────────────────────
    app.post('/v1/projects/:project/locations/:location/services', (req, res) => {
        recordRequest('/deploy', req.body);
        if (state.deployResult === 'failure') {
            return res.status(500).json({ error: { message: 'Simulated deploy failure' } });
        }
        res.json({
            name: 'operations/mock-op-123',
            done: false,
        });
    });
    app.get('/v1/operations/:operationId', (_req, res) => {
        res.json({
            name: 'operations/mock-op-123',
            done: true,
            response: { uri: 'https://mock-service.run.app' },
        });
    });
    // ── GitHub Mocks ──────────────────────────────────────────────────────────
    app.get('/user', (_req, res) => {
        res.json({ login: 'test-user', avatar_url: 'https://example.com/avatar.png' });
    });
    app.get('/user/repos', (_req, res) => {
        res.json([
            {
                id: 1,
                name: 'test-repo',
                full_name: 'test-user/test-repo',
                private: false,
                html_url: 'https://github.com/test-user/test-repo',
                description: 'Test repository',
                default_branch: 'main',
                updated_at: new Date().toISOString(),
            },
        ]);
    });
    // ── Stripe Mocks ──────────────────────────────────────────────────────────
    app.post('/v1/customers', (_req, res) => {
        res.json({ id: 'cus_mock_123', email: 'test@ice-saas.dev' });
    });
    // ── Catch-all ─────────────────────────────────────────────────────────────
    app.all('*', (req, res) => {
        recordRequest(req.path, req.body);
        res.json({ mock: true, path: req.path });
    });
    return new Promise((resolve) => {
        server = app.listen(4100, () => {
            console.log('Mock server running on port 4100');
            resolve();
        });
    });
}
export async function stopMockServer() {
    if (server) {
        return new Promise((resolve) => {
            server.close(() => resolve());
            server = null;
        });
    }
}
