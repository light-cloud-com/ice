/**
 * Tests for the `dialog` / `projects` / `templates` web-stub adapter
 * domains extracted in rf-httpapi-3. These domains either run pure
 * browser code (file pickers) or are no-op stubs because the desktop
 * adapter's behavior doesn't apply to the web build.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Browser globals ────────────────────────────────────────────────────────
//
// `dialog` invokes `document.createElement('input')`, sets handlers,
// and synchronously calls `.click()` on the input — none of which are
// available in node by default. We stub the relevant DOM constructor
// + FileReader.

interface FakeInput {
  type: string;
  accept: string;
  multiple?: boolean;
  files: { length: number; [k: number]: any } | null;
  onchange: (() => void) | null;
  click: () => void;
}

const lastInput: { current: FakeInput | null } = { current: null };

(globalThis as any).window = (globalThis as any).window || { location: { origin: 'http://localhost:3000' } };
(globalThis as any).localStorage = (globalThis as any).localStorage || {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
};

(globalThis as any).document = {
  createElement: (tag: string) => {
    if (tag !== 'input') throw new Error('only input is stubbed');
    const input: FakeInput = {
      type: '',
      accept: '',
      multiple: false,
      files: null,
      onchange: null,
      click: () => {
        // The default click does nothing; tests trigger the change
        // path manually via `setFiles + onchange()`.
      },
    };
    lastInput.current = input;
    return input;
  },
};

class FakeFileReader {
  result: string | ArrayBuffer | null = null;
  onload: (() => void) | null = null;
  readAsText(file: { __content?: string }) {
    setTimeout(() => {
      this.result = file.__content || '';
      this.onload?.();
    }, 0);
  }
}
(globalThis as any).FileReader = FakeFileReader;

beforeEach(() => {
  lastInput.current = null;
});

// ─── dialog adapter ─────────────────────────────────────────────────────────

describe('http-api/dialog', () => {
  it('openFile() configures an input[type=file] with .ice,.json and resolves via FileReader', async () => {
    const { createDialogAdapter } = await import('../http-api/dialog');
    const a = createDialogAdapter();
    const p = a.openFile();
    expect(lastInput.current).not.toBeNull();
    expect(lastInput.current!.type).toBe('file');
    expect(lastInput.current!.accept).toBe('.ice,.json');
    // Inject a synthetic file + trigger change
    lastInput.current!.files = {
      length: 1,
      0: { __content: 'hello world' },
    };
    lastInput.current!.onchange!();
    const result = await p;
    expect(result).toBe('hello world');
  });

  it('openFile() resolves null when the user cancels (no file)', async () => {
    const { createDialogAdapter } = await import('../http-api/dialog');
    const a = createDialogAdapter();
    const p = a.openFile();
    lastInput.current!.files = null;
    lastInput.current!.onchange!();
    const result = await p;
    expect(result).toBeNull();
  });

  it('saveFile() resolves null (web saves to cloud)', async () => {
    const { createDialogAdapter } = await import('../http-api/dialog');
    const a = createDialogAdapter();
    expect(await a.saveFile()).toBeNull();
  });

  it('importTerraform() configures an input[type=file] with .tf,.hcl + multiple, resolves with FileList', async () => {
    const { createDialogAdapter } = await import('../http-api/dialog');
    const a = createDialogAdapter();
    const p = a.importTerraform();
    expect(lastInput.current).not.toBeNull();
    expect(lastInput.current!.type).toBe('file');
    expect(lastInput.current!.accept).toBe('.tf,.hcl');
    expect(lastInput.current!.multiple).toBe(true);
    const fakeList = { length: 2, 0: { name: 'a.tf' }, 1: { name: 'b.hcl' } };
    lastInput.current!.files = fakeList as unknown as FakeInput['files'];
    lastInput.current!.onchange!();
    const result = await p;
    expect(result).toBe(fakeList);
  });

  it('selectDirectory() resolves null (web cloud-stored)', async () => {
    const { createDialogAdapter } = await import('../http-api/dialog');
    const a = createDialogAdapter();
    expect(await a.selectDirectory()).toBeNull();
  });
});

// ─── projects adapter ───────────────────────────────────────────────────────

describe('http-api/projects', () => {
  it('scanDirectory() resolves an empty file/folder shape', async () => {
    const { createProjectsAdapter } = await import('../http-api/projects');
    const a = createProjectsAdapter();
    expect(await a.scanDirectory('/')).toEqual({ files: [], folders: [] });
  });

  it('createFolder() resolves null', async () => {
    const { createProjectsAdapter } = await import('../http-api/projects');
    const a = createProjectsAdapter();
    expect(await a.createFolder('/parent', 'new')).toBeNull();
  });
});

// ─── templates adapter ─────────────────────────────────────────────────────

describe('http-api/templates', () => {
  it('loadToGraph() resolves { success: true } without touching the network', async () => {
    const { createTemplatesAdapter } = await import('../http-api/templates');
    const a = createTemplatesAdapter();
    expect(await a.loadToGraph({ name: 'demo', nodes: [], edges: [] })).toEqual({ success: true });
  });
});
