/**
 * Tests for the brand-icon registry. The lookup is a tiered match strategy:
 * exact lowercase → version-stripped → punctuation-stripped → first word →
 * dotted-suffix → null. Each test below pins one tier so the ordering
 * (which determines which `BrandIcon` wins for ambiguous inputs like
 * "node.js 20") doesn't drift.
 */

import { describe, it, expect } from 'vitest';

import { getBrandIcon, getProviderBrandIcon } from '../brand-registry';

describe('getBrandIcon — exact match', () => {
  it('returns the expected entry for a primary key', () => {
    const pg = getBrandIcon('postgresql');
    expect(pg).not.toBeNull();
    expect(pg!.label).toBe('PostgreSQL');
    expect(pg!.url).toMatch(/postgresql/);
  });

  it('returns the same entry for any alias (postgres / pg / iceType form)', () => {
    const a = getBrandIcon('postgresql');
    const b = getBrandIcon('postgres');
    const c = getBrandIcon('pg');
    const d = getBrandIcon('database.postgresql');
    expect(a).toBe(b);
    expect(b).toBe(c);
    expect(c).toBe(d);
  });

  it('lowercases the input before lookup', () => {
    expect(getBrandIcon('PostgreSQL')!.label).toBe('PostgreSQL');
    expect(getBrandIcon('REACT')!.label).toBe('React');
    expect(getBrandIcon('  Docker  ')!.label).toBe('Docker'); // trims too
  });
});

describe('getBrandIcon — version-stripped match', () => {
  it('strips a trailing version with a space separator', () => {
    expect(getBrandIcon('node.js 20')!.label).toBe('Node.js');
    expect(getBrandIcon('go 1.21')!.label).toBe('Go');
    expect(getBrandIcon('python 3.12')!.label).toBe('Python');
  });

  it('strips a trailing version with a dot/dash/underscore separator', () => {
    expect(getBrandIcon('node-20')!.label).toBe('Node.js');
    expect(getBrandIcon('python_3.12')!.label).toBe('Python');
  });
});

describe('getBrandIcon — normalized (no punctuation) match', () => {
  it('matches by collapsing dots, dashes, spaces, and underscores', () => {
    // "Node.js" registered as "node.js" + "node" + "nodejs".
    // "ruby on rails" not registered, but "rubyonrails" is.
    expect(getBrandIcon('Ruby on Rails')!.label).toBe('Rails');
    expect(getBrandIcon('Spring Boot')!.label).toBe('Spring');
  });
});

describe('getBrandIcon — first-word match', () => {
  it('falls back to the first word when later tiers miss', () => {
    // "rust 1.78" → version strip → "rust" (registered).
    expect(getBrandIcon('rust 1.78')!.label).toBe('Rust');

    // "java openjdk-17" — version-strip leaves "java openjdk", normalized
    // "javaopenjdk" not registered → first-word "java" wins.
    expect(getBrandIcon('java openjdk-17')!.label).toBe('Java');
  });
});

describe('getBrandIcon — afterDot suffix match', () => {
  it('matches the subtype after the last dot when nothing else does', () => {
    // The iceType-shaped key already covers most lookups, but obscure
    // category prefixes still resolve via the dotted-suffix fallback.
    expect(getBrandIcon('Custom.PostgreSQL')!.label).toBe('PostgreSQL');
    expect(getBrandIcon('Random.Docker')!.label).toBe('Docker');
  });
});

describe('getBrandIcon — negative path', () => {
  it('returns null for an empty input', () => {
    expect(getBrandIcon('')).toBeNull();
  });

  it('returns null when no tier matches', () => {
    expect(getBrandIcon('totally-unknown-tech')).toBeNull();
    expect(getBrandIcon('xyz123')).toBeNull();
  });

  it('returns null when the dotted-suffix has no entry either', () => {
    expect(getBrandIcon('Something.Unknown')).toBeNull();
  });

  it('returns null for a dotted input with an empty after-dot segment', () => {
    // "totally.unknown." → split → ['totally','unknown',''] → pop → '' →
    // `afterDot &&` short-circuits → falls through to null.
    expect(getBrandIcon('totally.unknown.')).toBeNull();
  });
});

describe('getProviderBrandIcon', () => {
  it('returns the cloud-provider icon entry for a known provider', () => {
    expect(getProviderBrandIcon('aws')!.label).toBe('AWS');
    expect(getProviderBrandIcon('gcp')!.label).toBe('Google Cloud');
    expect(getProviderBrandIcon('azure')!.label).toBe('Azure');
    expect(getProviderBrandIcon('digitalocean')!.label).toBe('DigitalOcean');
  });

  it('returns the same entry for the known provider aliases', () => {
    expect(getProviderBrandIcon('amazon')).toBe(getProviderBrandIcon('aws'));
    expect(getProviderBrandIcon('google-cloud')).toBe(getProviderBrandIcon('gcp'));
    expect(getProviderBrandIcon('do')).toBe(getProviderBrandIcon('digitalocean'));
  });

  it('returns null for an unknown provider', () => {
    expect(getProviderBrandIcon('unknown-cloud')).toBeNull();
    expect(getProviderBrandIcon('')).toBeNull();
  });
});

describe('getBrandIcon — entry shape', () => {
  it('returns a {url, label} object with non-empty values for known keys', () => {
    const entry = getBrandIcon('react');
    expect(entry).not.toBeNull();
    expect(typeof entry!.url).toBe('string');
    expect(entry!.url.length).toBeGreaterThan(0);
    expect(typeof entry!.label).toBe('string');
    expect(entry!.label.length).toBeGreaterThan(0);
  });
});
