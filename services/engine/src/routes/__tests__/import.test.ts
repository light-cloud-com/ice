/**
 * HTTP tests for the engine import router (`/api/engine/import/...`).
 *
 * The Terraform / Pulumi importer surface from `@ice/core` is mocked at the
 * boundary so the router's job (request validation, error envelopes, graph
 * serialisation, auth middleware wiring) is what we exercise here. The
 * `@ice/shared` auth middleware is mocked to a deterministic shim.
 */

import http from 'node:http';
import express from 'express';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { AddressInfo } from 'node:net';

const importTerraformMock = vi.fn();
const terraformResultToGraphMock = vi.fn();
const importPulumiMock = vi.fn();
const pulumiResultToGraphMock = vi.fn();

vi.mock('@ice/core', () => ({
  import_terraform_state_json: (...args: unknown[]) => importTerraformMock(...args),
  terraform_result_to_graph: (...args: unknown[]) => terraformResultToGraphMock(...args),
  import_pulumi_state_json: (...args: unknown[]) => importPulumiMock(...args),
  pulumi_result_to_graph: (...args: unknown[]) => pulumiResultToGraphMock(...args),
}));

// Auth middleware shim — toggle between allow / deny via `currentAuth`.
type AuthMode = 'allow' | 'no-auth';
let currentAuth: AuthMode = 'allow';

vi.mock('@ice/shared', () => ({
  requireAuth: (req: any, res: any, next: any) => {
    if (currentAuth === 'no-auth') {
      return res.status(401).json({ message: 'Missing authorization token' });
    }
    req.userId = 'user-1';
    req.organisationId = 'org-1';
    next();
  },
}));

let server: http.Server;
let baseUrl: string;

beforeEach(async () => {
  vi.clearAllMocks();
  currentAuth = 'allow';
  vi.spyOn(console, 'error').mockImplementation(() => {});

  const { default: router } = await import('../import');
  const app = express();
  app.use(express.json());
  app.use('/api/engine/import', router);

  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => resolve());
  });
  const addr = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  vi.restoreAllMocks();
});

async function post(path: string, body: unknown) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: any;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, body: json };
}

const tfStateJson = JSON.stringify({ resources: [] });
const fakeGraph = {
  nodes: new Map([
    ['n1', { id: 'n1', kind: 'compute' }],
    ['n2', { id: 'n2', kind: 'storage' }],
  ]),
  edges: new Map([['e1', { id: 'e1', from: 'n1', to: 'n2' }]]),
};

// ── /terraform ───────────────────────────────────────────────────────────

describe('POST /api/engine/import/terraform — happy path', () => {
  it('returns 200 with serialised {nodes,edges,warnings} on a successful import', async () => {
    importTerraformMock.mockReturnValue({ success: true, errors: [], warnings: ['orphan resource'] });
    terraformResultToGraphMock.mockReturnValue(fakeGraph);

    const res = await post('/api/engine/import/terraform', { stateJson: tfStateJson });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      nodes: [
        { id: 'n1', kind: 'compute' },
        { id: 'n2', kind: 'storage' },
      ],
      edges: [{ id: 'e1', from: 'n1', to: 'n2' }],
      warnings: ['orphan resource'],
    });
    expect(importTerraformMock).toHaveBeenCalledWith(tfStateJson);
    expect(terraformResultToGraphMock).toHaveBeenCalledWith({
      success: true,
      errors: [],
      warnings: ['orphan resource'],
    });
  });
});

describe('POST /api/engine/import/terraform — body validation', () => {
  it('returns 400 when stateJson is missing', async () => {
    const res = await post('/api/engine/import/terraform', {});
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Request body must include a "stateJson" string field' });
    expect(importTerraformMock).not.toHaveBeenCalled();
  });

  it('returns 400 when stateJson is empty string', async () => {
    const res = await post('/api/engine/import/terraform', { stateJson: '' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Request body must include a "stateJson" string field');
  });

  it('returns 400 when stateJson is not a string (number)', async () => {
    const res = await post('/api/engine/import/terraform', { stateJson: 123 });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Request body must include a "stateJson" string field');
    expect(importTerraformMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/engine/import/terraform — importer-reported failure', () => {
  it('returns 422 with {errors,warnings} when importer reports success:false', async () => {
    importTerraformMock.mockReturnValue({
      success: false,
      errors: ['unparsable resource'],
      warnings: ['legacy field'],
    });
    const res = await post('/api/engine/import/terraform', { stateJson: tfStateJson });
    expect(res.status).toBe(422);
    expect(res.body).toEqual({ errors: ['unparsable resource'], warnings: ['legacy field'] });
    // Graph builder should NOT be called when import failed.
    expect(terraformResultToGraphMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/engine/import/terraform — server error', () => {
  it('returns 500 with the generic error envelope when the importer throws', async () => {
    importTerraformMock.mockImplementation(() => {
      throw new Error('SDK detonation: state corrupt');
    });
    const res = await post('/api/engine/import/terraform', { stateJson: tfStateJson });
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Internal server error during Terraform import' });
    // Internal detail must not leak.
    expect(JSON.stringify(res.body)).not.toContain('SDK detonation');
  });
});

describe('POST /api/engine/import/terraform — auth', () => {
  it('returns 401 when requireAuth rejects', async () => {
    currentAuth = 'no-auth';
    const res = await post('/api/engine/import/terraform', { stateJson: tfStateJson });
    expect(res.status).toBe(401);
    expect(importTerraformMock).not.toHaveBeenCalled();
  });
});

// ── /pulumi ──────────────────────────────────────────────────────────────

describe('POST /api/engine/import/pulumi — happy path', () => {
  it('returns 200 with serialised {nodes,edges,warnings} on a successful import', async () => {
    importPulumiMock.mockReturnValue({ success: true, errors: [], warnings: [] });
    pulumiResultToGraphMock.mockReturnValue(fakeGraph);

    const res = await post('/api/engine/import/pulumi', { stateJson: tfStateJson });

    expect(res.status).toBe(200);
    expect(res.body.nodes).toEqual([
      { id: 'n1', kind: 'compute' },
      { id: 'n2', kind: 'storage' },
    ]);
    expect(res.body.edges).toEqual([{ id: 'e1', from: 'n1', to: 'n2' }]);
    expect(res.body.warnings).toEqual([]);
    expect(importPulumiMock).toHaveBeenCalledWith(tfStateJson);
  });
});

describe('POST /api/engine/import/pulumi — body validation', () => {
  it('returns 400 when stateJson is missing', async () => {
    const res = await post('/api/engine/import/pulumi', {});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Request body must include a "stateJson" string field');
    expect(importPulumiMock).not.toHaveBeenCalled();
  });

  it('returns 400 when stateJson is not a string (boolean)', async () => {
    const res = await post('/api/engine/import/pulumi', { stateJson: true });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Request body must include a "stateJson" string field');
  });
});

describe('POST /api/engine/import/pulumi — importer-reported failure', () => {
  it('returns 422 with {errors,warnings} when importer reports success:false', async () => {
    importPulumiMock.mockReturnValue({
      success: false,
      errors: ['unsupported provider'],
      warnings: [],
    });
    const res = await post('/api/engine/import/pulumi', { stateJson: tfStateJson });
    expect(res.status).toBe(422);
    expect(res.body).toEqual({ errors: ['unsupported provider'], warnings: [] });
    expect(pulumiResultToGraphMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/engine/import/pulumi — server error', () => {
  it('returns 500 with the generic error envelope when the importer throws', async () => {
    importPulumiMock.mockImplementation(() => {
      throw new Error('Pulumi state version unsupported');
    });
    const res = await post('/api/engine/import/pulumi', { stateJson: tfStateJson });
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Internal server error during Pulumi import' });
  });
});

describe('POST /api/engine/import/pulumi — auth', () => {
  it('returns 401 when requireAuth rejects', async () => {
    currentAuth = 'no-auth';
    const res = await post('/api/engine/import/pulumi', { stateJson: tfStateJson });
    expect(res.status).toBe(401);
    expect(importPulumiMock).not.toHaveBeenCalled();
  });
});
