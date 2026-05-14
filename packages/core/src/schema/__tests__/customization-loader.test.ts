/**
 * Tests for `customization-loader.ts`.
 *
 * The orchestrator is a thin shim over `customization/*` helpers. We mock
 * the helper-module boundary plus `fs` so we can control directory state
 * and exercise:
 *  - constructor (default cwd vs explicit project_root)
 *  - get_paths (joins each subdir relative to base_path)
 *  - has_customizations (fs.existsSync)
 *  - scan (calls scan_directory once per directory with the right exts)
 *  - initialize (mkdir + create_example_files)
 *  - validate (loops through summary + collects errors and warnings)
 *  - get_project_db_path / has_project_db
 *  - factory + base-db re-export
 */
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fsMocks = vi.hoisted(() => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

vi.mock('fs', () => ({
  existsSync: fsMocks.existsSync,
  mkdirSync: fsMocks.mkdirSync,
}));

const customizationMocks = vi.hoisted(() => ({
  scan_directory: vi.fn(() => []),
  create_example_files: vi.fn(async () => {}),
  validate_provider_file: vi.fn(async () => ({ errors: [], warnings: [] })),
  validate_override_file: vi.fn(async () => ({ errors: [], warnings: [] })),
  validate_custom_resource_file: vi.fn(async () => ({ errors: [], warnings: [] })),
  validate_relationships_file: vi.fn(async () => ({ errors: [], warnings: [] })),
  resolve_base_db_path: vi.fn(() => '/bundled/base.db'),
}));

vi.mock('../customization/scanner', () => ({
  scan_directory: customizationMocks.scan_directory,
}));

vi.mock('../customization/example-files', () => ({
  create_example_files: customizationMocks.create_example_files,
}));

vi.mock('../customization/file-validators', () => ({
  validate_provider_file: customizationMocks.validate_provider_file,
  validate_override_file: customizationMocks.validate_override_file,
  validate_custom_resource_file: customizationMocks.validate_custom_resource_file,
  validate_relationships_file: customizationMocks.validate_relationships_file,
}));

vi.mock('../customization/base-db', () => ({
  get_base_db_path: customizationMocks.resolve_base_db_path,
}));

import {
  CustomizationLoader,
  create_customization_loader,
  get_base_db_path,
} from '../customization-loader';

beforeEach(() => {
  vi.clearAllMocks();
  // Default fs behaviour: nothing exists
  fsMocks.existsSync.mockReturnValue(false);
  customizationMocks.scan_directory.mockReturnValue([]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('CustomizationLoader.constructor', () => {
  it('defaults to process.cwd() + .ice/schemas when no project_root is supplied', () => {
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue('/cwd');
    const loader = new CustomizationLoader();
    expect(loader.get_paths().providers_dir).toBe(path.join('/cwd', '.ice/schemas', 'providers'));
    cwdSpy.mockRestore();
  });

  it('uses an explicit project_root when supplied', () => {
    const loader = new CustomizationLoader('/proj');
    const paths = loader.get_paths();
    expect(paths.providers_dir).toBe(path.join('/proj', '.ice/schemas', 'providers'));
    expect(paths.overrides_dir).toBe(path.join('/proj', '.ice/schemas', 'overrides'));
    expect(paths.custom_dir).toBe(path.join('/proj', '.ice/schemas', 'custom'));
    expect(paths.relationships_dir).toBe(path.join('/proj', '.ice/schemas', 'relationships'));
  });
});

describe('CustomizationLoader.has_customizations', () => {
  it('returns true when fs.existsSync(base_path) is true', () => {
    fsMocks.existsSync.mockReturnValue(true);
    expect(new CustomizationLoader('/proj').has_customizations()).toBe(true);
  });

  it('returns false when fs.existsSync(base_path) is false', () => {
    fsMocks.existsSync.mockReturnValue(false);
    expect(new CustomizationLoader('/proj').has_customizations()).toBe(false);
  });
});

describe('CustomizationLoader.scan', () => {
  it('calls scan_directory with the right extensions for each subdir', () => {
    new CustomizationLoader('/proj').scan();
    expect(customizationMocks.scan_directory).toHaveBeenCalledTimes(4);
    // providers: .json
    expect(customizationMocks.scan_directory).toHaveBeenCalledWith(
      path.join('/proj', '.ice/schemas', 'providers'),
      ['.json'],
    );
    // overrides: .yaml/.yml
    expect(customizationMocks.scan_directory).toHaveBeenCalledWith(
      path.join('/proj', '.ice/schemas', 'overrides'),
      ['.yaml', '.yml'],
    );
    // custom: .yaml/.yml
    expect(customizationMocks.scan_directory).toHaveBeenCalledWith(
      path.join('/proj', '.ice/schemas', 'custom'),
      ['.yaml', '.yml'],
    );
    // relationships: .yaml/.yml
    expect(customizationMocks.scan_directory).toHaveBeenCalledWith(
      path.join('/proj', '.ice/schemas', 'relationships'),
      ['.yaml', '.yml'],
    );
  });

  it('collects each scan result into the summary', () => {
    customizationMocks.scan_directory
      .mockReturnValueOnce([{ name: 'p.json', path: '/p', size: 1, modified: new Date() }])
      .mockReturnValueOnce([{ name: 'o.yaml', path: '/o', size: 1, modified: new Date() }])
      .mockReturnValueOnce([{ name: 'c.yaml', path: '/c', size: 1, modified: new Date() }])
      .mockReturnValueOnce([{ name: 'r.yaml', path: '/r', size: 1, modified: new Date() }]);
    fsMocks.existsSync.mockReturnValue(true);

    const summary = new CustomizationLoader('/proj').scan();
    expect(summary.base_path).toBe(path.join('/proj', '.ice/schemas'));
    expect(summary.has_customizations).toBe(true);
    expect(summary.providers).toHaveLength(1);
    expect(summary.overrides).toHaveLength(1);
    expect(summary.custom_resources).toHaveLength(1);
    expect(summary.relationships).toHaveLength(1);
  });

  it('reports has_customizations=false when base_path does not exist', () => {
    fsMocks.existsSync.mockReturnValue(false);
    expect(new CustomizationLoader('/proj').scan().has_customizations).toBe(false);
  });
});

describe('CustomizationLoader.initialize', () => {
  it('creates each missing directory recursively', async () => {
    fsMocks.existsSync.mockReturnValue(false);
    await new CustomizationLoader('/proj').initialize();
    // 4 dirs total
    expect(fsMocks.mkdirSync).toHaveBeenCalledTimes(4);
    for (const call of fsMocks.mkdirSync.mock.calls) {
      expect(call[1]).toEqual({ recursive: true });
    }
  });

  it('skips directories that already exist', async () => {
    fsMocks.existsSync.mockReturnValue(true);
    await new CustomizationLoader('/proj').initialize();
    expect(fsMocks.mkdirSync).not.toHaveBeenCalled();
  });

  it('invokes create_example_files with the resolved paths', async () => {
    fsMocks.existsSync.mockReturnValue(true);
    await new CustomizationLoader('/proj').initialize();
    expect(customizationMocks.create_example_files).toHaveBeenCalledTimes(1);
    const arg = customizationMocks.create_example_files.mock.calls[0]?.[0] as Record<string, string>;
    expect(arg.providers_dir).toBe(path.join('/proj', '.ice/schemas', 'providers'));
    expect(arg.overrides_dir).toBe(path.join('/proj', '.ice/schemas', 'overrides'));
    expect(arg.custom_dir).toBe(path.join('/proj', '.ice/schemas', 'custom'));
    expect(arg.relationships_dir).toBe(path.join('/proj', '.ice/schemas', 'relationships'));
  });
});

describe('CustomizationLoader.validate', () => {
  it('returns valid:true with empty errors/warnings when scan finds nothing', async () => {
    fsMocks.existsSync.mockReturnValue(true);
    const r = await new CustomizationLoader('/proj').validate();
    expect(r.valid).toBe(true);
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
  });

  it('runs the matching validator for each scanned file', async () => {
    fsMocks.existsSync.mockReturnValue(true);
    customizationMocks.scan_directory
      .mockReturnValueOnce([{ name: 'p.json', path: '/p', size: 1, modified: new Date() }])
      .mockReturnValueOnce([{ name: 'o.yaml', path: '/o', size: 1, modified: new Date() }])
      .mockReturnValueOnce([{ name: 'c.yaml', path: '/c', size: 1, modified: new Date() }])
      .mockReturnValueOnce([{ name: 'r.yaml', path: '/r', size: 1, modified: new Date() }]);

    await new CustomizationLoader('/proj').validate();

    expect(customizationMocks.validate_provider_file).toHaveBeenCalledWith('/p');
    expect(customizationMocks.validate_override_file).toHaveBeenCalledWith('/o');
    expect(customizationMocks.validate_custom_resource_file).toHaveBeenCalledWith('/c');
    expect(customizationMocks.validate_relationships_file).toHaveBeenCalledWith('/r');
  });

  it('aggregates errors and warnings across all files; valid:false when any error', async () => {
    fsMocks.existsSync.mockReturnValue(true);
    customizationMocks.scan_directory
      .mockReturnValueOnce([{ name: 'p.json', path: '/p', size: 1, modified: new Date() }])
      .mockReturnValueOnce([{ name: 'o.yaml', path: '/o', size: 1, modified: new Date() }])
      .mockReturnValueOnce([])
      .mockReturnValueOnce([]);
    customizationMocks.validate_provider_file.mockResolvedValue({
      errors: [{ file: '/p', message: 'bad' }],
      warnings: [{ file: '/p', message: 'meh' }],
    });
    customizationMocks.validate_override_file.mockResolvedValue({
      errors: [],
      warnings: [{ file: '/o', message: 'note' }],
    });

    const r = await new CustomizationLoader('/proj').validate();
    expect(r.valid).toBe(false);
    expect(r.errors).toHaveLength(1);
    expect(r.warnings).toHaveLength(2);
  });
});

describe('CustomizationLoader.get_project_db_path / has_project_db', () => {
  it('get_project_db_path returns a path adjacent to the customization base dir', () => {
    const loader = new CustomizationLoader('/proj');
    expect(loader.get_project_db_path()).toBe(path.join('/proj', '.ice', 'schemas.db'));
  });

  it('has_project_db returns the result of fs.existsSync on the project DB path', () => {
    fsMocks.existsSync.mockReturnValue(false);
    expect(new CustomizationLoader('/proj').has_project_db()).toBe(false);
    fsMocks.existsSync.mockReturnValue(true);
    expect(new CustomizationLoader('/proj').has_project_db()).toBe(true);
  });
});

describe('factory and re-exports', () => {
  it('create_customization_loader returns a CustomizationLoader', () => {
    expect(create_customization_loader('/proj')).toBeInstanceOf(CustomizationLoader);
  });

  it('create_customization_loader without args defaults to cwd', () => {
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue('/cwd');
    const loader = create_customization_loader();
    expect(loader.get_paths().providers_dir).toBe(path.join('/cwd', '.ice/schemas', 'providers'));
    cwdSpy.mockRestore();
  });

  it('get_base_db_path delegates to the customization/base-db helper', () => {
    expect(get_base_db_path()).toBe('/bundled/base.db');
    expect(customizationMocks.resolve_base_db_path).toHaveBeenCalled();
  });
});
