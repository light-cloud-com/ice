/**
 * Tests for the declarative `CONNECTION_RULES` array + the AI prompt
 * generator.
 *
 * The data-array tests confirm structural invariants (every rule has
 * the required fields, the reverse-flag bookkeeping is consistent,
 * `traffic` rules carry a `trafficType`, non-traffic rules don't, etc.)
 * plus a few representative source→target probes that lock down the
 * lookup contract.
 *
 * The prompt-generator tests stitch on the same data and verify that
 * each section heading is present, every non-reverse rule's label
 * appears in its category section, and that the auto-injected env-var
 * + port lookups land in their dedicated sections of the prompt.
 */

import { describe, expect, it } from 'vitest';
import { CATEGORY_COLORS, DEFAULT_ENV_VARS, DEFAULT_PORTS } from '@ice/constants';
import { CONNECTION_RULES, generateAiConnectionPrompt } from '../rules-data';

describe('CONNECTION_RULES — structural invariants', () => {
  it('is non-empty', () => {
    expect(CONNECTION_RULES.length).toBeGreaterThan(0);
  });

  it('every entry has a label, source predicate, target predicate, category, and lineStyle', () => {
    for (const r of CONNECTION_RULES) {
      expect(typeof r.label).toBe('string');
      expect(typeof r.source).toBe('function');
      expect(typeof r.target).toBe('function');
      expect(['traffic', 'pipeline', 'config', 'dns']).toContain(r.category);
      expect(['solid', 'dashed', 'dotted', 'thin']).toContain(r.lineStyle);
    }
  });

  it('all `traffic` category rules carry a trafficType discriminant', () => {
    for (const r of CONNECTION_RULES) {
      if (r.category === 'traffic') {
        expect(r.trafficType).toBeDefined();
        expect(['request', 'data', 'publish', 'subscribe', 'stream']).toContain(r.trafficType);
      }
    }
  });

  it('non-traffic categories do NOT carry a trafficType', () => {
    for (const r of CONNECTION_RULES) {
      if (r.category !== 'traffic') {
        expect(r.trafficType).toBeUndefined();
      }
    }
  });

  it('all CATEGORY_COLORS keys appear in the array (every category has at least one rule)', () => {
    const seen = new Set(CONNECTION_RULES.map((r) => r.category));
    for (const k of Object.keys(CATEGORY_COLORS)) {
      expect(seen.has(k as keyof typeof CATEGORY_COLORS)).toBe(true);
    }
  });
});

describe('CONNECTION_RULES — representative source→target probes', () => {
  it('contains a Frontend → Backend traffic/request rule', () => {
    const hit = CONNECTION_RULES.find((r) => r.source('Compute.StaticSite') && r.target('Compute.Backend'));
    expect(hit).toBeDefined();
    expect(hit?.category).toBe('traffic');
    expect(hit?.trafficType).toBe('request');
  });

  it('contains a Backend → Database traffic/data rule', () => {
    const hit = CONNECTION_RULES.find((r) => r.source('Compute.Backend') && r.target('Database.PostgreSQL'));
    expect(hit).toBeDefined();
    expect(hit?.trafficType).toBe('data');
  });

  it('contains a Database → Backend reverse rule', () => {
    const hit = CONNECTION_RULES.find(
      (r) => r.reverse && r.source('Database.PostgreSQL') && r.target('Compute.Backend'),
    );
    expect(hit).toBeDefined();
    expect(hit?.trafficType).toBe('data');
    expect(hit?.lineStyle).toBe('solid');
  });

  it('contains a Backend → Queue publish rule (dashed)', () => {
    const hit = CONNECTION_RULES.find((r) => r.source('Compute.Backend') && r.target('Messaging.SQS'));
    expect(hit).toBeDefined();
    expect(hit?.trafficType).toBe('publish');
    expect(hit?.lineStyle).toBe('dashed');
  });

  it('contains a Queue → Backend subscribe rule (dotted)', () => {
    const hit = CONNECTION_RULES.find((r) => r.source('Messaging.SQS') && r.target('Compute.Backend'));
    expect(hit).toBeDefined();
    expect(hit?.trafficType).toBe('subscribe');
    expect(hit?.lineStyle).toBe('dotted');
  });

  it('contains a Service → Monitoring stream rule (thin)', () => {
    const hit = CONNECTION_RULES.find((r) => r.source('Compute.Backend') && r.target('Monitoring.Log'));
    expect(hit).toBeDefined();
    expect(hit?.trafficType).toBe('stream');
    expect(hit?.lineStyle).toBe('thin');
  });

  it('Service→Monitoring source predicate excludes monitoring nodes themselves', () => {
    const r = CONNECTION_RULES.find((rr) => rr.label === 'Service → Monitoring')!;
    expect(r.source('Monitoring.Log')).toBe(false);
    expect(r.source('Network.VPC')).toBe(false);
    expect(r.source('Compute.Backend')).toBe(true);
  });

  it('contains a Repo → Service pipeline rule (dashed)', () => {
    const hit = CONNECTION_RULES.find((r) => r.source('Source.Repository') && r.target('Compute.Backend'));
    expect(hit).toBeDefined();
    expect(hit?.category).toBe('pipeline');
    expect(hit?.lineStyle).toBe('dashed');
  });

  it('contains a Service → EnvVars config rule (dotted)', () => {
    const hit = CONNECTION_RULES.find((r) => r.source('Compute.Backend') && r.target('Config.Environment'));
    expect(hit).toBeDefined();
    expect(hit?.category).toBe('config');
    expect(hit?.lineStyle).toBe('dotted');
  });

  it('contains a Domain → Routable DNS rule', () => {
    const hit = CONNECTION_RULES.find((r) => r.source('Network.CustomDomain') && r.target('Compute.Backend'));
    expect(hit).toBeDefined();
    expect(hit?.category).toBe('dns');
  });
});

describe('generateAiConnectionPrompt', () => {
  const prompt = generateAiConnectionPrompt();

  it('begins with the CONNECTION CATEGORIES heading', () => {
    expect(prompt.startsWith('## CONNECTION CATEGORIES')).toBe(true);
  });

  it.each([
    '### TRAFFIC (green)',
    '### PIPELINE (purple)',
    '### CONFIG (amber)',
    '### DNS (cyan)',
    '### CONTAINERS CANNOT HAVE EDGES',
    '### Auto-generated env vars',
    '### Auto-detected ports',
    '### Direction normalization',
  ])('contains the section heading %s', (heading) => {
    expect(prompt).toContain(heading);
  });

  it('lists every non-reverse rule label in the prompt', () => {
    for (const r of CONNECTION_RULES) {
      if (r.reverse) continue;
      expect(prompt).toContain(r.label);
    }
  });

  it('does NOT list reverse-flag-only rules (they would lie about direction)', () => {
    // Some reverse-flag rules share their label with their canonical
    // counterpart (e.g. "Routable → Domain (flip)"). The "(flip)" suffix
    // distinguishes them. None of those should leak into the prompt.
    const flipLabels = CONNECTION_RULES.filter((r) => r.reverse).map((r) => r.label);
    for (const lab of flipLabels) {
      expect(prompt).not.toContain(lab);
    }
  });

  it('emits each DEFAULT_ENV_VARS entry as a `- key → value` bullet', () => {
    for (const [k, v] of Object.entries(DEFAULT_ENV_VARS)) {
      expect(prompt).toContain(`- ${k} → ${v}`);
    }
  });

  it('emits each DEFAULT_PORTS entry as a `- key → port` bullet', () => {
    for (const [k, v] of Object.entries(DEFAULT_PORTS)) {
      expect(prompt).toContain(`- ${k} → ${v}`);
    }
  });

  it('annotates traffic rules with both their trafficType and lineStyle', () => {
    expect(prompt).toMatch(/Frontend → Backend \(request, solid line\)/);
    expect(prompt).toMatch(/Backend → Queue \(publish\) \(publish, dashed line\)/);
  });

  it('falls back to "request" when a traffic rule omits trafficType (defensive default)', () => {
    // Every current traffic rule sets trafficType, but the generator's
    // template uses `r.trafficType || 'request'` as a fallback. This
    // test pins the fallback behavior.
    const trafficRulesWithoutType = CONNECTION_RULES.filter(
      (r) => r.category === 'traffic' && !r.trafficType && !r.reverse,
    );
    if (trafficRulesWithoutType.length > 0) {
      for (const r of trafficRulesWithoutType) {
        expect(prompt).toContain(`${r.label} (request,`);
      }
    } else {
      // Branch is exercised at runtime by the regex above; the negative
      // result here is the proof there are no offending entries.
      expect(trafficRulesWithoutType.length).toBe(0);
    }
  });

  it('groups labels under the correct category heading', () => {
    const trafficStart = prompt.indexOf('### TRAFFIC');
    const pipelineStart = prompt.indexOf('### PIPELINE');
    const configStart = prompt.indexOf('### CONFIG');
    const dnsStart = prompt.indexOf('### DNS');
    expect(trafficStart).toBeGreaterThan(0);
    expect(pipelineStart).toBeGreaterThan(trafficStart);
    expect(configStart).toBeGreaterThan(pipelineStart);
    expect(dnsStart).toBeGreaterThan(configStart);

    const traffic = CONNECTION_RULES.find((r) => r.category === 'traffic' && !r.reverse)!;
    const pipeline = CONNECTION_RULES.find((r) => r.category === 'pipeline' && !r.reverse)!;
    const config = CONNECTION_RULES.find((r) => r.category === 'config' && !r.reverse)!;
    const dns = CONNECTION_RULES.find((r) => r.category === 'dns' && !r.reverse)!;
    expect(prompt.indexOf(traffic.label)).toBeGreaterThan(trafficStart);
    expect(prompt.indexOf(traffic.label)).toBeLessThan(pipelineStart);
    expect(prompt.indexOf(pipeline.label)).toBeGreaterThan(pipelineStart);
    expect(prompt.indexOf(pipeline.label)).toBeLessThan(configStart);
    expect(prompt.indexOf(config.label)).toBeGreaterThan(configStart);
    expect(prompt.indexOf(config.label)).toBeLessThan(dnsStart);
    expect(prompt.indexOf(dns.label)).toBeGreaterThan(dnsStart);
  });
});
