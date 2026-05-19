/**
 * rf-rpal-3 — `data/components.ts` invariant tests.
 *
 * Pin the 24 concept blocks (icon + provider list + category), the
 * `blockKey` slug helper, and the `def` builder's i18n + fallback
 * branching. The component order is observable in the palette — keep
 * it stable.
 *
 * `getComponents(t)` and `def(t, ...)` take the translator as an
 * argument so they can be called per-render with React's locale-bound
 * `t`. Tests pass identity `(k) => k` so block names equal the
 * derived translation key (or trip the missing-key fallback when the
 * fallback shape is exercised).
 */

import {
  Server,
  Globe,
  HardDrive,
  Zap,
  Folder, // unused by COMPONENTS — present in source's set but not referenced here
  GitBranch,
  Key,
  FileText,
  List,
  Cog,
  Clock,
  Bell,
  Brain,
  BrainCircuit,
  Waypoints,
  Shield,
  Database,
  Activity,
} from 'lucide-react';
import { describe, it, expect } from 'vitest';
void Folder;

import { getComponents, blockKey, def } from '../data/components';

const t = (k: string) => k;
const COMPONENTS = getComponents(t);

// ─── blockKey ───────────────────────────────────────────────────────────────

describe('blockKey', () => {
  it('lowercases the full category prefix and concatenates with the name', () => {
    expect(blockKey('Compute.Container')).toBe('computeContainer');
    expect(blockKey('Database.PostgreSQL')).toBe('databasePostgreSQL');
    // All-caps acronym prefixes (AI) must map to the i18n bundle's
    // lowercase `ai` keys (`aiVectorDB`, `aiLLMGateway`, …).
    expect(blockKey('AI.VectorDB')).toBe('aiVectorDB');
    expect(blockKey('AI.LLMGateway')).toBe('aiLLMGateway');
    expect(blockKey('AI.ModelServing')).toBe('aiModelServing');
  });

  it('preserves case after the category prefix', () => {
    expect(blockKey('Compute.SSRSite')).toBe('computeSSRSite');
    expect(blockKey('Storage.Bucket')).toBe('storageBucket');
  });

  it('handles single-letter category prefixes', () => {
    expect(blockKey('A.B')).toBe('aB');
  });
});

// ─── def ─────────────────────────────────────────────────────────────────────

describe('def — i18n branch', () => {
  it('uses t() for name/description/tooltip when no fallback provided', () => {
    const c = def(t, 'Compute.X', Server, ['aws'], 'Compute');
    // Identity translator means name === t(key) === key.
    expect(c.name).toBe('blocks.computeX.name');
    expect(c.description).toBe('blocks.computeX.description');
    expect(c.tooltip).toBe('blocks.computeX.tooltip');
  });

  it('forwards icon, providers, category verbatim', () => {
    const c = def(t, 'Compute.X', Server, ['aws', 'gcp'], 'Compute');
    expect(c.icon).toBe(Server);
    expect(c.providers).toEqual(['aws', 'gcp']);
    expect(c.category).toBe('Compute');
  });

  it('omits runtimes when not provided', () => {
    const c = def(t, 'Compute.X', Server, ['aws'], 'Compute');
    expect(c.runtimes).toBeUndefined();
    expect('runtimes' in c).toBe(false);
  });

  it('attaches runtimes when provided', () => {
    const rt = [{ label: 'Node', value: 'Node.js 20' }];
    const c = def(t, 'Compute.X', Server, ['aws'], 'Compute', rt);
    expect(c.runtimes).toBe(rt);
  });
});

describe('def — fallback branch', () => {
  it('uses fallback name and description when the i18n key is missing', () => {
    // Identity translator causes t('blocks.fooBar.name') to return 'blocks.fooBar.name',
    // which equals the key string — so def() detects the miss and uses fallback.
    const c = def(t, 'Foo.Bar', Server, ['aws'], 'Custom', undefined, {
      name: 'Foo Bar',
      description: 'A foo that bars.',
    });
    expect(c.name).toBe('Foo Bar');
    expect(c.description).toBe('A foo that bars.');
  });

  it('falls back tooltip to description when fallback.tooltip is omitted', () => {
    const c = def(t, 'Foo.Bar', Server, ['aws'], 'Custom', undefined, {
      name: 'Foo Bar',
      description: 'desc',
    });
    expect(c.tooltip).toBe('desc');
  });

  it('uses explicit fallback.tooltip when provided', () => {
    const c = def(t, 'Foo.Bar', Server, ['aws'], 'Custom', undefined, {
      name: 'Foo Bar',
      description: 'desc',
      tooltip: 'explicit tooltip',
    });
    expect(c.tooltip).toBe('explicit tooltip');
  });
});

// ─── COMPONENTS data ─────────────────────────────────────────────────────────

describe('COMPONENTS — count', () => {
  it('declares 24 blocks (verbatim from source — the source comment says "25" but the array has 24)', () => {
    expect(COMPONENTS).toHaveLength(24);
  });
});

describe('COMPONENTS — declaration order by type', () => {
  it('preserves the source ordering Frontend → Config', () => {
    expect(COMPONENTS.map((c) => c.type)).toEqual([
      'Compute.StaticSite',
      'Compute.SSRSite',
      'Compute.Container',
      'Compute.ServerlessFunction',
      'Compute.Worker',
      'Compute.CronJob',
      'Database.PostgreSQL',
      'Database.MySQL',
      'Database.MongoDB',
      'Database.Redis',
      'Storage.Bucket',
      'Messaging.Queue',
      'Messaging.EventStream',
      'Messaging.Email',
      'Network.Gateway',
      'Network.CustomDomain',
      'Network.PrivateNetwork',
      'Security.Secret',
      'AI.VectorDB',
      'AI.LLMGateway',
      'AI.PrivateAIService',
      'Monitoring.Log',
      'Source.Repository',
      'Config.Environment',
    ]);
  });
});

describe('COMPONENTS — icon binding', () => {
  it('binds the documented lucide icon to each block type', () => {
    const iconByType = Object.fromEntries(COMPONENTS.map((c) => [c.type, c.icon]));
    expect(iconByType['Compute.StaticSite']).toBe(Globe);
    expect(iconByType['Compute.SSRSite']).toBe(Globe);
    expect(iconByType['Compute.Container']).toBe(Server);
    expect(iconByType['Compute.ServerlessFunction']).toBe(Zap);
    expect(iconByType['Compute.Worker']).toBe(Cog);
    expect(iconByType['Compute.CronJob']).toBe(Clock);
    expect(iconByType['Database.PostgreSQL']).toBe(Database);
    expect(iconByType['Database.MySQL']).toBe(Database);
    expect(iconByType['Database.MongoDB']).toBe(Database);
    expect(iconByType['Database.Redis']).toBe(Zap);
    expect(iconByType['Storage.Bucket']).toBe(HardDrive);
    expect(iconByType['Messaging.Queue']).toBe(List);
    expect(iconByType['Messaging.EventStream']).toBe(Activity);
    expect(iconByType['Messaging.Email']).toBe(Bell);
    expect(iconByType['Network.Gateway']).toBe(GitBranch);
    expect(iconByType['Network.CustomDomain']).toBe(Globe);
    expect(iconByType['Network.PrivateNetwork']).toBe(Shield);
    expect(iconByType['Security.Secret']).toBe(Key);
    expect(iconByType['AI.VectorDB']).toBe(Waypoints);
    expect(iconByType['AI.LLMGateway']).toBe(BrainCircuit);
    expect(iconByType['AI.PrivateAIService']).toBe(Brain);
    expect(iconByType['Monitoring.Log']).toBe(FileText);
    expect(iconByType['Source.Repository']).toBe(GitBranch);
    expect(iconByType['Config.Environment']).toBe(Cog);
  });
});

describe('COMPONENTS — provider list', () => {
  it('every block lists at least one provider', () => {
    for (const c of COMPONENTS) {
      expect(c.providers.length).toBeGreaterThan(0);
    }
  });

  it('aws+gcp+azure are the universal providers (every block declares all three)', () => {
    for (const c of COMPONENTS) {
      expect(c.providers).toContain('aws');
      expect(c.providers).toContain('gcp');
      expect(c.providers).toContain('azure');
    }
  });

  it('container/SSR/Worker/Redis additionally declare kubernetes', () => {
    const k8sBlocks = COMPONENTS.filter((c) => c.providers.includes('kubernetes')).map((c) => c.type);
    expect(new Set(k8sBlocks)).toEqual(
      new Set(['Compute.SSRSite', 'Compute.Container', 'Compute.Worker', 'Database.Redis']),
    );
  });
});

describe('COMPONENTS — category', () => {
  it('every block declares a category that maps onto a known section header', () => {
    const categories = new Set(COMPONENTS.map((c) => c.category));
    expect(categories).toEqual(
      new Set([
        'Compute',
        'Frontend',
        'Scheduler',
        'Database',
        'Cache',
        'Storage',
        'Messaging',
        'Network',
        'Security',
        'AI',
        'Monitoring',
        'Source',
        'Config',
      ]),
    );
  });
});

describe('COMPONENTS — runtimes', () => {
  it('Compute.Container exposes 6 runtime options', () => {
    const container = COMPONENTS.find((c) => c.type === 'Compute.Container');
    expect(container?.runtimes).toEqual([
      { label: 'Node.js', value: 'Node.js 20' },
      { label: 'Python', value: 'Python 3.12' },
      { label: 'Go', value: 'Go 1.22' },
      { label: 'Java', value: 'Java 21' },
      { label: 'Rust', value: 'Rust 1.77' },
      { label: '.NET', value: '.NET 8' },
    ]);
  });

  it('Compute.ServerlessFunction exposes 5 runtime options (no Rust)', () => {
    const fn = COMPONENTS.find((c) => c.type === 'Compute.ServerlessFunction');
    expect(fn?.runtimes).toHaveLength(5);
    expect(fn?.runtimes?.map((r) => r.label)).toEqual(['Node.js', 'Python', 'Go', 'Java', '.NET']);
  });

  it('blocks without runtimes omit the field entirely', () => {
    const cron = COMPONENTS.find((c) => c.type === 'Compute.CronJob');
    expect(cron?.runtimes).toBeUndefined();
  });
});

describe('COMPONENTS — fallback names', () => {
  it('Messaging.Queue, Messaging.EventStream, Messaging.Email use fallback names under identity t()', () => {
    // identity mock => t('blocks.messagingQueue.name') === 'blocks.messagingQueue.name'
    // so def() detects the miss and uses the inline fallback.
    const queue = COMPONENTS.find((c) => c.type === 'Messaging.Queue');
    const stream = COMPONENTS.find((c) => c.type === 'Messaging.EventStream');
    const email = COMPONENTS.find((c) => c.type === 'Messaging.Email');
    expect(queue?.name).toBe('Message Queue');
    expect(stream?.name).toBe('Event Stream');
    expect(email?.name).toBe('Email Service');
  });

  it('AI.PrivateAIService uses the fallback name Private AI Service', () => {
    const svc = COMPONENTS.find((c) => c.type === 'AI.PrivateAIService');
    expect(svc?.name).toBe('Private AI Service');
  });

  it('blocks without fallback resolve name via t() (identity mock yields the key)', () => {
    const container = COMPONENTS.find((c) => c.type === 'Compute.Container');
    expect(container?.name).toBe('blocks.computeContainer.name');
    expect(container?.description).toBe('blocks.computeContainer.description');
    expect(container?.tooltip).toBe('blocks.computeContainer.tooltip');
  });
});
