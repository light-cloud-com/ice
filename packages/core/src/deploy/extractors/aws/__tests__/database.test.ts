/**
 * Tests for AWS database extractors.
 *
 * Locks in engine selection (PostgreSQL vs MySQL via iceType),
 * size-enum translation (M-series → ElastiCache node types), DynamoDB
 * billing-mode branching, and the "no default password" invariant on
 * RDS + DocDB.
 */

import { describe, it, expect } from 'vitest';
import {
  extract_rds_db_instance_properties,
  extract_dynamodb_table_properties,
  extract_elasticache_cluster_properties,
  extract_docdb_cluster_properties,
  ELASTICACHE_REDIS_SIZE_MAP,
} from '../database';

describe('extract_rds_db_instance_properties', () => {
  it('defaults to PostgreSQL 16 when iceType is Database.PostgreSQL', () => {
    const result = extract_rds_db_instance_properties({ iceType: 'Database.PostgreSQL' }, 'us-east-1');
    expect(result.engine).toBe('postgres');
    expect(result.engine_version).toBe('16');
    expect(result.port).toBe(5432);
    expect(result.master_username).toBe('postgres');
  });

  it('defaults to MySQL 8.0 when iceType is Database.MySQL', () => {
    const result = extract_rds_db_instance_properties({ iceType: 'Database.MySQL' }, 'us-east-1');
    expect(result.engine).toBe('mysql');
    expect(result.engine_version).toBe('8.0');
    expect(result.port).toBe(3306);
    expect(result.master_username).toBe('admin');
  });

  it('extracts version from runtime string (e.g. "PostgreSQL 14.5" → 14.5)', () => {
    const result = extract_rds_db_instance_properties(
      { iceType: 'Database.PostgreSQL', runtime: 'PostgreSQL 14.5' },
      'us-east-1',
    );
    expect(result.engine_version).toBe('14.5');
  });

  it('defaults to db.t3.micro instance class', () => {
    expect(extract_rds_db_instance_properties({}, 'us-east-1').db_instance_class).toBe('db.t3.micro');
  });

  it('honours user-supplied size + storage', () => {
    const result = extract_rds_db_instance_properties({ size: 'db.r5.large', storage: '100GB' }, 'us-east-1');
    expect(result.db_instance_class).toBe('db.r5.large');
    expect(result.allocated_storage).toBe(100);
  });

  it('leaves master_user_password empty by default (handler must error)', () => {
    expect(extract_rds_db_instance_properties({}, 'us-east-1').master_user_password).toBe('');
  });
});

describe('extract_dynamodb_table_properties', () => {
  it('defaults to PAY_PER_REQUEST billing mode + string id partition key', () => {
    expect(extract_dynamodb_table_properties({}, 'us-east-1')).toMatchObject({
      region: 'us-east-1',
      billing_mode: 'PAY_PER_REQUEST',
      partition_key: 'id',
      partition_key_type: 'S',
      point_in_time_recovery: true,
    });
  });

  it('emits RCU/WCU only when billing_mode === PROVISIONED', () => {
    const onDemand = extract_dynamodb_table_properties({}, 'us-east-1');
    expect(onDemand.read_capacity).toBeUndefined();
    expect(onDemand.write_capacity).toBeUndefined();

    const provisioned = extract_dynamodb_table_properties({ billing_mode: 'PROVISIONED' }, 'us-east-1');
    expect(provisioned.read_capacity).toBe(5);
    expect(provisioned.write_capacity).toBe(5);
  });

  it('honours user-supplied partition/sort key shape', () => {
    const result = extract_dynamodb_table_properties(
      { partition_key: 'pk', partition_key_type: 'N', sort_key: 'sk', sort_key_type: 'S' },
      'us-east-1',
    );
    expect(result).toMatchObject({
      partition_key: 'pk',
      partition_key_type: 'N',
      sort_key: 'sk',
      sort_key_type: 'S',
    });
  });
});

describe('extract_elasticache_cluster_properties', () => {
  it('defaults to Redis 7.0 on cache.t3.micro', () => {
    expect(extract_elasticache_cluster_properties({}, 'us-east-1')).toMatchObject({
      region: 'us-east-1',
      engine: 'redis',
      engine_version: '7.0',
      cache_node_type: 'cache.t3.micro',
      num_cache_nodes: 1,
      port: 6379,
    });
  });

  it('translates the M-series size enum to a known node type', () => {
    for (const [size, mapped] of Object.entries(ELASTICACHE_REDIS_SIZE_MAP)) {
      const result = extract_elasticache_cluster_properties({ size }, 'us-east-1');
      expect(result.cache_node_type, `${size} → node type`).toBe(mapped.node_type);
      expect(result.num_cache_nodes, `${size} → num nodes`).toBe(mapped.num_nodes);
    }
  });

  it('falls through to cache_node_type when size is not a known M-tier', () => {
    const result = extract_elasticache_cluster_properties(
      { cache_node_type: 'cache.r5.xlarge', num_cache_nodes: 3 },
      'us-east-1',
    );
    expect(result.cache_node_type).toBe('cache.r5.xlarge');
    expect(result.num_cache_nodes).toBe(3);
  });
});

describe('extract_docdb_cluster_properties', () => {
  it('defaults to engine_version 5.0.0 + db.t3.medium', () => {
    expect(extract_docdb_cluster_properties({}, 'us-east-1')).toMatchObject({
      region: 'us-east-1',
      engine: 'docdb',
      engine_version: '5.0.0',
      db_instance_class: 'db.t3.medium',
      instance_count: 1,
      port: 27017,
      storage_encrypted: true,
    });
  });

  it('leaves master_user_password empty by default (handler must error)', () => {
    expect(extract_docdb_cluster_properties({}, 'us-east-1').master_user_password).toBe('');
  });

  it('honours instance_count + master_username overrides', () => {
    const result = extract_docdb_cluster_properties({ instance_count: 3, master_username: 'mongo' }, 'us-east-1');
    expect(result.instance_count).toBe(3);
    expect(result.master_username).toBe('mongo');
  });
});
