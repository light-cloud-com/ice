/**
 * Tests for `extractors/database.ts` — property extractors for GCP database
 * services on the card-to-graph translator.
 *
 * Covers:
 *   - `extract_cloud_sql_properties` — version derivation from runtime,
 *     `parse_storage_gb` integration, port defaults, optional tier/edition
 *     pass-through.
 *   - `extract_firestore_properties` — region/type pass-through with default.
 *   - `REDIS_SIZE_MAP` — exact tier strings (`'BASIC'` / `'STANDARD_HA'`)
 *     pinned per RISK #3 (these strings hit the Memorystore API directly;
 *     mutation triggers 400s — see card-translator commentary).
 *   - `REDIS_VALID_TIERS` — guards `literalTier` fallback; case-sensitive.
 *   - `extract_memorystore_properties` — size-map lookup wins over literal
 *     tier; sentinel labels like `'small'` / `'tiny'` get dropped via the
 *     `REDIS_VALID_TIERS` guard.
 */
import { describe, it, expect } from 'vitest';
import {
  extract_cloud_sql_properties,
  extract_firestore_properties,
  REDIS_SIZE_MAP,
  REDIS_VALID_TIERS,
  extract_memorystore_properties,
} from '../database.js';

describe('extract_cloud_sql_properties', () => {
  it('returns MySQL defaults for an empty data object', () => {
    const result = extract_cloud_sql_properties({}, 'us-central1');
    expect(result).toEqual({
      region: 'us-central1',
      database_version: 'MYSQL_8_0',
      storage_size_gb: 20,
      backup_enabled: true,
      port: 3306,
      labels: {},
    });
  });

  it('derives POSTGRES_16 when iceType is Database.PostgreSQL', () => {
    const result = extract_cloud_sql_properties({ iceType: 'Database.PostgreSQL' }, 'us-central1');
    expect(result.database_version).toBe('POSTGRES_16');
    expect(result.port).toBe(5432);
  });

  it('parses runtime version "PostgreSQL 14" → POSTGRES_14', () => {
    const result = extract_cloud_sql_properties(
      { iceType: 'Database.PostgreSQL', runtime: 'PostgreSQL 14' },
      'us-central1',
    );
    expect(result.database_version).toBe('POSTGRES_14');
  });

  it('parses runtime version "MySQL 5.7" → MYSQL_5_7 (dot replaced with underscore)', () => {
    const result = extract_cloud_sql_properties({ runtime: 'MySQL 5.7' }, 'us-central1');
    expect(result.database_version).toBe('MYSQL_5_7');
  });

  it('integrates parse_storage_gb: "50 GB" → 50', () => {
    const result = extract_cloud_sql_properties({ storage: '50 GB' }, 'us-central1');
    expect(result.storage_size_gb).toBe(50);
  });

  it('integrates parse_storage_gb: "1 TB" → 1024', () => {
    const result = extract_cloud_sql_properties({ storage: '1 TB' }, 'us-central1');
    expect(result.storage_size_gb).toBe(1024);
  });

  it('falls back to 20 GB when storage is unparseable (parse_storage_gb returns undefined)', () => {
    const result = extract_cloud_sql_properties({ storage: 'huge' }, 'us-central1');
    expect(result.storage_size_gb).toBe(20);
  });

  it('falls back to 20 GB when storage is missing', () => {
    const result = extract_cloud_sql_properties({}, 'us-central1');
    expect(result.storage_size_gb).toBe(20);
  });

  it('passes through user-supplied port', () => {
    const result = extract_cloud_sql_properties({ port: 1234 }, 'us-central1');
    expect(result.port).toBe(1234);
  });

  it('attaches tier when data.size is set', () => {
    const result = extract_cloud_sql_properties({ size: 'db-f1-micro' }, 'us-central1');
    expect(result.tier).toBe('db-f1-micro');
  });

  it('omits tier when data.size is not set', () => {
    const result = extract_cloud_sql_properties({}, 'us-central1');
    expect(result).not.toHaveProperty('tier');
  });

  it('attaches edition when data.edition is set', () => {
    const result = extract_cloud_sql_properties({ edition: 'ENTERPRISE' }, 'us-central1');
    expect(result.edition).toBe('ENTERPRISE');
  });

  it('omits edition when not set', () => {
    const result = extract_cloud_sql_properties({}, 'us-central1');
    expect(result).not.toHaveProperty('edition');
  });

  it('returns labels: {} regardless of input', () => {
    const result = extract_cloud_sql_properties({ labels: { keep: 'me' } }, 'us-central1');
    expect(result.labels).toEqual({});
  });

  it('always sets backup_enabled: true', () => {
    const result = extract_cloud_sql_properties({}, 'us-central1');
    expect(result.backup_enabled).toBe(true);
  });

  it('falls back to "16" version when runtime has no digit (PostgreSQL branch)', () => {
    const result = extract_cloud_sql_properties(
      { iceType: 'Database.PostgreSQL', runtime: 'PostgreSQL nightly' },
      'us-central1',
    );
    expect(result.database_version).toBe('POSTGRES_16');
  });

  it('falls back to "8.0" version when runtime has no digit (MySQL branch)', () => {
    const result = extract_cloud_sql_properties({ runtime: 'MySQL nightly' }, 'us-central1');
    expect(result.database_version).toBe('MYSQL_8_0');
  });

  it('uses provided region', () => {
    const result = extract_cloud_sql_properties({}, 'europe-west1');
    expect(result.region).toBe('europe-west1');
  });
});

describe('extract_firestore_properties', () => {
  it('returns defaults for an empty data object', () => {
    const result = extract_firestore_properties({}, 'us-central1');
    expect(result).toEqual({
      location_id: 'us-central1',
      type: 'FIRESTORE_NATIVE',
      labels: {},
    });
  });

  it('uses provided region as location_id', () => {
    const result = extract_firestore_properties({}, 'europe-west1');
    expect(result.location_id).toBe('europe-west1');
  });

  it('passes through databaseType (datastore mode)', () => {
    const result = extract_firestore_properties({ databaseType: 'DATASTORE_MODE' }, 'us-central1');
    expect(result.type).toBe('DATASTORE_MODE');
  });

  it('passes through databaseType (native mode explicit)', () => {
    const result = extract_firestore_properties({ databaseType: 'FIRESTORE_NATIVE' }, 'us-central1');
    expect(result.type).toBe('FIRESTORE_NATIVE');
  });

  it('always returns labels: {}', () => {
    const result = extract_firestore_properties({ labels: { keep: 'me' } }, 'us-central1');
    expect(result.labels).toEqual({});
  });
});

describe('REDIS_SIZE_MAP', () => {
  it('contains exactly 5 entries (M1–M5)', () => {
    expect(Object.keys(REDIS_SIZE_MAP).sort()).toEqual(['M1', 'M2', 'M3', 'M4', 'M5']);
  });

  it('maps M1 → BASIC tier, 1 GB', () => {
    expect(REDIS_SIZE_MAP.M1).toEqual({ tier: 'BASIC', memorySizeGb: 1 });
  });

  it('maps M3 → BASIC tier, 10 GB', () => {
    expect(REDIS_SIZE_MAP.M3).toEqual({ tier: 'BASIC', memorySizeGb: 10 });
  });

  it('maps M5 → STANDARD_HA tier, 100 GB', () => {
    expect(REDIS_SIZE_MAP.M5).toEqual({ tier: 'STANDARD_HA', memorySizeGb: 100 });
  });

  // RISK #3: pin the exact tier string values. The Memorystore API rejects
  // anything other than 'BASIC' or 'STANDARD_HA' (case-sensitive,
  // underscore between STANDARD and HA). Mutating these constants
  // re-introduces the 400 errors the original code path was written to fix.
  it('pins tier strings to exactly "BASIC" or "STANDARD_HA" for every entry (RISK #3)', () => {
    for (const key of Object.keys(REDIS_SIZE_MAP)) {
      const entry = REDIS_SIZE_MAP[key]!;
      expect(['BASIC', 'STANDARD_HA']).toContain(entry.tier);
    }
  });

  it('M1, M2, M3, M4 are BASIC tier; M5 is STANDARD_HA (RISK #3 partition)', () => {
    expect(REDIS_SIZE_MAP.M1?.tier).toBe('BASIC');
    expect(REDIS_SIZE_MAP.M2?.tier).toBe('BASIC');
    expect(REDIS_SIZE_MAP.M3?.tier).toBe('BASIC');
    expect(REDIS_SIZE_MAP.M4?.tier).toBe('BASIC');
    expect(REDIS_SIZE_MAP.M5?.tier).toBe('STANDARD_HA');
  });
});

describe('REDIS_VALID_TIERS', () => {
  it('contains exactly 2 entries: BASIC and STANDARD_HA', () => {
    expect(REDIS_VALID_TIERS.size).toBe(2);
    expect(REDIS_VALID_TIERS.has('BASIC')).toBe(true);
    expect(REDIS_VALID_TIERS.has('STANDARD_HA')).toBe(true);
  });

  it('rejects lowercase "basic" (case-sensitive guard)', () => {
    expect(REDIS_VALID_TIERS.has('basic')).toBe(false);
  });

  it('rejects sentinel labels like "small" that the common blueprint may leak', () => {
    expect(REDIS_VALID_TIERS.has('small')).toBe(false);
    expect(REDIS_VALID_TIERS.has('tiny')).toBe(false);
    expect(REDIS_VALID_TIERS.has('huge')).toBe(false);
  });
});

describe('extract_memorystore_properties', () => {
  it('returns defaults for an empty data object (1 GB BASIC)', () => {
    const result = extract_memorystore_properties({}, 'us-central1');
    expect(result).toEqual({
      region: 'us-central1',
      tier: 'BASIC',
      memory_size_gb: 1,
      redis_version: 'REDIS_7_0',
      port: 6379,
      labels: {},
    });
  });

  it('size-map lookup wins: size=M5 → STANDARD_HA + 100 GB', () => {
    const result = extract_memorystore_properties({ size: 'M5' }, 'us-central1');
    expect(result.tier).toBe('STANDARD_HA');
    expect(result.memory_size_gb).toBe(100);
  });

  it('size-map lookup: size=M2 → BASIC + 4 GB', () => {
    const result = extract_memorystore_properties({ size: 'M2' }, 'us-central1');
    expect(result.tier).toBe('BASIC');
    expect(result.memory_size_gb).toBe(4);
  });

  it('size-map wins over literal tier+memorySizeGb', () => {
    // size=M3 (BASIC, 10 GB) takes precedence over tier='STANDARD_HA' / memorySizeGb=50
    const result = extract_memorystore_properties(
      { size: 'M3', tier: 'STANDARD_HA', memorySizeGb: 50 },
      'us-central1',
    );
    expect(result.tier).toBe('BASIC');
    expect(result.memory_size_gb).toBe(10);
  });

  it('literal tier "BASIC" passes through when no size is set', () => {
    const result = extract_memorystore_properties({ tier: 'BASIC' }, 'us-central1');
    expect(result.tier).toBe('BASIC');
  });

  it('literal tier "STANDARD_HA" passes through when no size is set', () => {
    const result = extract_memorystore_properties({ tier: 'STANDARD_HA' }, 'us-central1');
    expect(result.tier).toBe('STANDARD_HA');
  });

  it('drops invalid tier "small" via REDIS_VALID_TIERS guard, falls back to BASIC', () => {
    const result = extract_memorystore_properties({ tier: 'small' }, 'us-central1');
    expect(result.tier).toBe('BASIC');
  });

  it('drops sentinel tier "tiny" via REDIS_VALID_TIERS guard, falls back to BASIC', () => {
    const result = extract_memorystore_properties({ tier: 'tiny' }, 'us-central1');
    expect(result.tier).toBe('BASIC');
  });

  it('drops sentinel tier "huge" via REDIS_VALID_TIERS guard, falls back to BASIC', () => {
    const result = extract_memorystore_properties({ tier: 'huge' }, 'us-central1');
    expect(result.tier).toBe('BASIC');
  });

  it('drops lowercase tier "basic" — guard is case-sensitive, falls back to BASIC default', () => {
    const result = extract_memorystore_properties({ tier: 'basic' }, 'us-central1');
    expect(result.tier).toBe('BASIC');
  });

  it('uses literal memorySizeGb when no size is set and value is positive', () => {
    const result = extract_memorystore_properties({ memorySizeGb: 25 }, 'us-central1');
    expect(result.memory_size_gb).toBe(25);
  });

  it('ignores non-positive literal memorySizeGb', () => {
    const result = extract_memorystore_properties({ memorySizeGb: 0 }, 'us-central1');
    expect(result.memory_size_gb).toBe(1);
  });

  it('ignores negative literal memorySizeGb', () => {
    const result = extract_memorystore_properties({ memorySizeGb: -5 }, 'us-central1');
    expect(result.memory_size_gb).toBe(1);
  });

  it('ignores non-number literal memorySizeGb', () => {
    const result = extract_memorystore_properties({ memorySizeGb: '25' as unknown as number }, 'us-central1');
    expect(result.memory_size_gb).toBe(1);
  });

  it('converts memoryMb → GB (rounds, floor at 1)', () => {
    // 4096 MB → 4 GB
    const result = extract_memorystore_properties({ memoryMb: 4096 }, 'us-central1');
    expect(result.memory_size_gb).toBe(4);
  });

  it('floors memoryMb conversion at 1 GB (sub-1-GB rejected by API)', () => {
    // 256 MB → would round to 0, floored to 1
    const result = extract_memorystore_properties({ memoryMb: 256 }, 'us-central1');
    expect(result.memory_size_gb).toBe(1);
  });

  it('rounds memoryMb conversion (1500 MB → 1 GB)', () => {
    const result = extract_memorystore_properties({ memoryMb: 1500 }, 'us-central1');
    expect(result.memory_size_gb).toBe(1);
  });

  it('rounds memoryMb conversion (1700 MB → 2 GB)', () => {
    const result = extract_memorystore_properties({ memoryMb: 1700 }, 'us-central1');
    expect(result.memory_size_gb).toBe(2);
  });

  it('ignores non-positive memoryMb', () => {
    const result = extract_memorystore_properties({ memoryMb: 0 }, 'us-central1');
    expect(result.memory_size_gb).toBe(1);
  });

  it('ignores non-number memoryMb', () => {
    const result = extract_memorystore_properties(
      { memoryMb: 'lots' as unknown as number },
      'us-central1',
    );
    expect(result.memory_size_gb).toBe(1);
  });

  it('memorySizeGb wins over memoryMb', () => {
    const result = extract_memorystore_properties(
      { memorySizeGb: 50, memoryMb: 4096 },
      'us-central1',
    );
    expect(result.memory_size_gb).toBe(50);
  });

  it('passes through redisVersion', () => {
    const result = extract_memorystore_properties({ redisVersion: 'REDIS_6_X' }, 'us-central1');
    expect(result.redis_version).toBe('REDIS_6_X');
  });

  it('passes through port', () => {
    const result = extract_memorystore_properties({ port: 16379 }, 'us-central1');
    expect(result.port).toBe(16379);
  });

  it('uses provided region', () => {
    const result = extract_memorystore_properties({}, 'europe-west1');
    expect(result.region).toBe('europe-west1');
  });

  it('always returns labels: {}', () => {
    const result = extract_memorystore_properties({ labels: { keep: 'me' } }, 'us-central1');
    expect(result.labels).toEqual({});
  });

  it('non-string size is ignored (size-map lookup skipped)', () => {
    const result = extract_memorystore_properties({ size: 5 as unknown as string }, 'us-central1');
    expect(result.tier).toBe('BASIC');
    expect(result.memory_size_gb).toBe(1);
  });

  it('unknown size string falls through to literal/default path', () => {
    // size='M99' is not in REDIS_SIZE_MAP — falls through to literalTier/literalGb/etc.
    const result = extract_memorystore_properties(
      { size: 'M99', tier: 'STANDARD_HA', memorySizeGb: 25 },
      'us-central1',
    );
    expect(result.tier).toBe('STANDARD_HA');
    expect(result.memory_size_gb).toBe(25);
  });
});
