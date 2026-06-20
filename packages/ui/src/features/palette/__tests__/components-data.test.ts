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

import { getComponents, blockKey, def, GOAL_KEYWORDS, componentMatchesQuery } from '../data/components';
import type { ComponentDef } from '../types';

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
  it('declares 25 blocks (Reroute added under Util in the geometry-nodes refactor)', () => {
    expect(COMPONENTS).toHaveLength(25);
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
      'Util.Reroute',
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

  it('kubernetes is declared on every block with a k8s handler (no AI/Source/Email)', () => {
    // Per-block matrix in `data/components.ts` lists k8s where a handler
    // exists (deployment / statefulset / cronjob / service / ingress /
    // configmap / secret / namespace / pvc / etc.). Excluded: AI.* (no
    // first-party AI service), Source.Repository (no CodeBuild equiv),
    // Messaging.Email (no first-party transactional email service).
    const k8sBlocks = COMPONENTS.filter((c) => c.providers.includes('kubernetes')).map((c) => c.type);
    const expected = new Set([
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
      'Network.Gateway',
      'Network.CustomDomain',
      'Network.PrivateNetwork',
      'Security.Secret',
      'Monitoring.Log',
      'Config.Environment',
      'Util.Reroute',
    ]);
    expect(new Set(k8sBlocks)).toEqual(expected);
  });

  it('preview-tier providers (alibaba/oci/digitalocean/ibm) appear on every block they can deploy', () => {
    // Sanity check: each preview-tier provider lands on at least one block,
    // and the per-provider count tracks the handler-existence matrix.
    const counts: Record<string, number> = {
      alibaba: 0,
      oci: 0,
      digitalocean: 0,
      ibm: 0,
    };
    for (const c of COMPONENTS) {
      for (const p of c.providers) {
        if (p in counts) counts[p] += 1;
      }
    }
    expect(counts.alibaba).toBeGreaterThanOrEqual(20); // drops Email
    expect(counts.oci).toBeGreaterThanOrEqual(18); // drops Email/VectorDB/Source
    expect(counts.digitalocean).toBeGreaterThanOrEqual(12); // drops scheduler/messaging/AI/Source/Gateway/Monitoring
    expect(counts.ibm).toBeGreaterThanOrEqual(15); // drops Frontend/Email/Gateway/CustomDomain/VectorDB/Source
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
        'Util',
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

// ─── CD3 — goal keywords + search matching ────────────────────────────────────

describe('GOAL_KEYWORDS wiring', () => {
  it('def() attaches keywords from GOAL_KEYWORDS for a known iceType', () => {
    const cron = def(t, 'Compute.CronJob', Server, ['aws'], 'Scheduler');
    expect(cron.keywords).toEqual(GOAL_KEYWORDS['Compute.CronJob']);
    expect(cron.keywords).toContain('cron');
    expect(cron.keywords).toContain('schedule');
  });

  it('def() omits keywords entirely for an iceType with no entry', () => {
    const unknown = def(t, 'Compute.X', Server, ['aws'], 'Compute');
    expect(unknown.keywords).toBeUndefined();
  });

  it('getComponents() surfaces the keywords on real blocks', () => {
    const redis = COMPONENTS.find((c) => c.type === 'Database.Redis');
    expect(redis?.keywords).toContain('cache');
    const fn = COMPONENTS.find((c) => c.type === 'Compute.ServerlessFunction');
    expect(fn?.keywords).toContain('api');
  });

  it('every GOAL_KEYWORDS key is a real iceType in the inventory', () => {
    const realTypes = new Set(COMPONENTS.map((c) => c.type));
    for (const type of Object.keys(GOAL_KEYWORDS)) {
      expect(realTypes.has(type)).toBe(true);
    }
  });
});

describe('componentMatchesQuery (CD3)', () => {
  const mk = (over: Partial<ComponentDef>): ComponentDef => ({
    type: 'Compute.X',
    name: 'Widget',
    description: 'does things',
    tooltip: 'a widget',
    icon: () => null,
    providers: ['aws'],
    category: 'Compute',
    ...over,
  });

  it('matches everything for an empty / whitespace query', () => {
    expect(componentMatchesQuery(mk({}), '')).toBe(true);
    expect(componentMatchesQuery(mk({}), '   ')).toBe(true);
  });

  it('matches on name and description (the original behaviour)', () => {
    expect(componentMatchesQuery(mk({ name: 'PostgreSQL' }), 'postgres')).toBe(true);
    expect(componentMatchesQuery(mk({ description: 'relational store' }), 'relational')).toBe(true);
  });

  it('matches on the tooltip', () => {
    expect(componentMatchesQuery(mk({ tooltip: 'managed cache' }), 'cache')).toBe(true);
  });

  it('matches on the supplied category label', () => {
    expect(componentMatchesQuery(mk({ name: 'Postgres' }), 'database', 'Database')).toBe(true);
  });

  it('matches on goal keywords', () => {
    expect(componentMatchesQuery(mk({ keywords: ['cron', 'schedule'] }), 'cron')).toBe(true);
    expect(componentMatchesQuery(mk({ keywords: ['api', 'gateway'] }), 'api')).toBe(true);
  });

  it('returns false when nothing matches', () => {
    expect(componentMatchesQuery(mk({ name: 'Widget', description: 'does things' }), 'zzz')).toBe(false);
  });

  it('"cron" finds the CronJob block in the real inventory but not Postgres', () => {
    const cron = COMPONENTS.find((c) => c.type === 'Compute.CronJob')!;
    const pg = COMPONENTS.find((c) => c.type === 'Database.PostgreSQL')!;
    expect(componentMatchesQuery(cron, 'cron')).toBe(true);
    expect(componentMatchesQuery(pg, 'cron')).toBe(false);
  });
});
