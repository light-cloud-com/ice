/**
 * rf-pset-1 — type-shape regression for the provider-settings type leaf.
 *
 * `ProviderId`, `ConfigField`, `ProviderConfig`, `ProviderProject`,
 * `ProviderRuntimeState`, `ProviderStatesMap`, and `ProviderSettingsProps`
 * were extracted verbatim from `provider-settings.tsx` into `./types.ts`.
 * These tests:
 *
 *   1. Import-resolution smoke: each interface/type alias must be importable
 *      from `'../types'`. If a future edit drops one, the file stops
 *      compiling.
 *   2. Field-shape regression: assemble dummy values exercising every
 *      required + optional field. Renaming or dropping a field surfaces
 *      here as a TS error before consumer files break.
 */

import { describe, expect, it } from 'vitest';
import type {
  ProviderId,
  ConfigField,
  ProviderConfig,
  ProviderProject,
  ProviderRuntimeState,
  ProviderStatesMap,
  ProviderSettingsProps,
} from '../types';

describe('provider-settings types — import resolution', () => {
  it('ProviderId resolves and accepts the three documented IDs', () => {
    const aws: ProviderId = 'aws';
    const gcp: ProviderId = 'gcp';
    const azure: ProviderId = 'azure';
    expect([aws, gcp, azure]).toEqual(['aws', 'gcp', 'azure']);
  });

  it('ConfigField resolves and accepts every documented field type', () => {
    const text: ConfigField = { name: 't', label: 'T', type: 'text', required: true };
    const password: ConfigField = { name: 'p', label: 'P', type: 'password', required: true };
    const textarea: ConfigField = { name: 'a', label: 'A', type: 'textarea', required: false };
    const select: ConfigField = { name: 's', label: 'S', type: 'select', required: true, options: ['x'] };
    expect([text.type, password.type, textarea.type, select.type]).toEqual(['text', 'password', 'textarea', 'select']);
  });

  it('ConfigField allows optional placeholder, options, and helpLink', () => {
    const f: ConfigField = {
      name: 'svc',
      label: 'Service',
      type: 'textarea',
      required: false,
      placeholder: '{...}',
      helpLink: { url: 'https://example.test', text: 'Create one' },
      options: undefined,
    };
    expect(f.placeholder).toBe('{...}');
    expect(f.helpLink?.url).toBe('https://example.test');
    expect(f.helpLink?.text).toBe('Create one');
  });

  it('ProviderConfig resolves with all required fields plus configFields array', () => {
    const cfg: ProviderConfig = {
      id: 'aws',
      name: 'AWS',
      description: 'desc',
      icon: 'aws',
      color: 'text-orange-500',
      bgColor: 'bg-orange-100 dark:bg-orange-900/30',
      configFields: [{ name: 'a', label: 'A', type: 'text', required: true }],
    };
    expect(cfg.id).toBe('aws');
    expect(cfg.configFields).toHaveLength(1);
  });

  it('ProviderProject resolves with optional region', () => {
    const withRegion: ProviderProject = { id: 'p1', name: 'P1', region: 'us-east-1' };
    const noRegion: ProviderProject = { id: 'p2', name: 'P2' };
    expect(withRegion.region).toBe('us-east-1');
    expect(noRegion.region).toBeUndefined();
  });

  it('ProviderRuntimeState bundles connected + projects + formValues', () => {
    const s: ProviderRuntimeState = {
      connected: true,
      projects: [{ id: 'p1', name: 'P1' }],
      formValues: { accessKeyId: 'AKIA' },
    };
    expect(s.connected).toBe(true);
    expect(s.projects[0].id).toBe('p1');
    expect(s.formValues.accessKeyId).toBe('AKIA');
  });

  it('ProviderStatesMap is a Record keyed by provider ID', () => {
    const map: ProviderStatesMap = {
      aws: { connected: false, projects: [], formValues: {} },
      gcp: { connected: true, projects: [{ id: 'g1', name: 'G' }], formValues: { service_account_key: '{}' } },
    };
    expect(Object.keys(map).sort()).toEqual(['aws', 'gcp']);
    expect(map.gcp.projects[0].id).toBe('g1');
  });

  it('ProviderSettingsProps requires isOpen + onClose, allows onImportComplete', () => {
    const onClose = (): void => undefined;
    const minimal: ProviderSettingsProps = { isOpen: false, onClose };
    const full: ProviderSettingsProps = {
      isOpen: true,
      onClose,
      onImportComplete: (graph) => {
        // intentionally treats `graph` as `any` — preserved from source
        void graph;
      },
    };
    expect(minimal.isOpen).toBe(false);
    expect(typeof full.onImportComplete).toBe('function');
  });
});
