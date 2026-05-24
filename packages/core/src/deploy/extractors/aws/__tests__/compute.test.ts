/**
 * Tests for AWS compute extractors.
 *
 * Mirrors the assertion style used by the GCP extractor tests: pin
 * defaults, exercise passthrough fields, lock in the multi-port +
 * cron-preset normalisations. Provider-specific defaults that differ
 * from GCP (Fargate CPU/memory units, EventBridge 6-field cron) are
 * called out in their own describe blocks so a future change to those
 * defaults trips the test instead of silently shifting deployed
 * resources.
 */

import { describe, it, expect } from 'vitest';
import {
  extract_ecs_service_properties,
  extract_lambda_function_properties,
  extract_events_rule_properties,
} from '../compute';

describe('extract_ecs_service_properties', () => {
  it('returns Fargate-shaped defaults for an empty data object', () => {
    expect(extract_ecs_service_properties({}, 'us-east-1')).toEqual({
      region: 'us-east-1',
      image: '',
      repository: '',
      branch: 'main',
      port: 8080,
      desired_count: 1,
      min_capacity: 1,
      max_capacity: 3,
      cpu: '256',
      memory: '512',
      assign_public_ip: true,
      internal: false,
      env_vars: {},
      tags: {},
    });
  });

  it('honours user-supplied image / port / branch / cpu / memory', () => {
    const result = extract_ecs_service_properties(
      {
        image: 'my-org/api:v1.2',
        port: 3000,
        branch: 'release',
        cpu: '512',
        memory: '1024',
      },
      'eu-west-1',
    );
    expect(result.image).toBe('my-org/api:v1.2');
    expect(result.port).toBe(3000);
    expect(result.branch).toBe('release');
    expect(result.cpu).toBe('512');
    expect(result.memory).toBe('1024');
    expect(result.region).toBe('eu-west-1');
  });

  it('parses exposed_ports and forwards additional_ports + primary port', () => {
    const result = extract_ecs_service_properties(
      {
        exposed_ports: [
          { port: 443, protocol: 'https' },
          { port: 8080, protocol: 'http', label: 'admin' },
        ],
      },
      'us-east-1',
    );
    expect(result.port).toBe(443);
    expect(result.additional_ports).toEqual([
      { port: 443, protocol: 'https' },
      { port: 8080, protocol: 'http', label: 'admin' },
    ]);
  });

  it('maps minInstances/maxInstances onto ECS desired_count + capacity', () => {
    const result = extract_ecs_service_properties({ minInstances: 2, maxInstances: 10 }, 'us-east-1');
    expect(result.desired_count).toBe(2);
    expect(result.min_capacity).toBe(2);
    expect(result.max_capacity).toBe(10);
  });
});

describe('extract_lambda_function_properties', () => {
  it('returns nodejs20.x defaults + empty S3 ref for an empty data object', () => {
    expect(extract_lambda_function_properties({}, 'us-east-1')).toEqual({
      region: 'us-east-1',
      runtime: 'nodejs20.x',
      handler: 'index.handler',
      memory_size: 128,
      timeout: 30,
      s3_bucket: '',
      s3_key: '',
      role: '',
      description: '',
      repository: '',
      branch: 'main',
      environment: {},
      tags: {},
    });
  });

  it('reads code from the nested code.{s3Bucket,s3Key} shape', () => {
    const result = extract_lambda_function_properties(
      { code: { s3Bucket: 'build-artifacts', s3Key: 'app/v3.zip' } },
      'us-east-1',
    );
    expect(result.s3_bucket).toBe('build-artifacts');
    expect(result.s3_key).toBe('app/v3.zip');
  });

  it('falls back to top-level s3_bucket/s3_key when nested code is absent', () => {
    const result = extract_lambda_function_properties({ s3_bucket: 'legacy', s3_key: 'fn.zip' }, 'us-east-1');
    expect(result.s3_bucket).toBe('legacy');
    expect(result.s3_key).toBe('fn.zip');
  });

  it('passes runtime/handler/memory/timeout through', () => {
    const result = extract_lambda_function_properties(
      { runtime: 'python3.12', handler: 'main.lambda_handler', memory: 512, timeout: 120 },
      'us-east-1',
    );
    expect(result.runtime).toBe('python3.12');
    expect(result.handler).toBe('main.lambda_handler');
    expect(result.memory_size).toBe(512);
    expect(result.timeout).toBe(120);
  });

  it('renames envVars → environment (Lambda SDK shape)', () => {
    const result = extract_lambda_function_properties({ envVars: { LOG_LEVEL: 'debug' } }, 'us-east-1');
    expect(result.environment).toEqual({ LOG_LEVEL: 'debug' });
  });
});

describe('extract_events_rule_properties', () => {
  it('returns ENABLED-by-default cron(0 0 * * ? *) for an empty data object', () => {
    expect(extract_events_rule_properties({}, 'us-east-1')).toEqual({
      region: 'us-east-1',
      schedule_expression: 'cron(0 0 * * ? *)',
      description: '',
      state: 'ENABLED',
      target_type: 'lambda',
      target_arn: '',
      tags: {},
    });
  });

  it('maps named presets to EventBridge 6-field cron expressions', () => {
    expect(extract_events_rule_properties({ schedule: 'daily' }, 'us-east-1').schedule_expression).toBe(
      'cron(0 0 * * ? *)',
    );
    expect(extract_events_rule_properties({ schedule: 'hourly' }, 'us-east-1').schedule_expression).toBe(
      'cron(0 * * * ? *)',
    );
    expect(extract_events_rule_properties({ schedule: 'weekly' }, 'us-east-1').schedule_expression).toBe(
      'cron(0 0 ? * SUN *)',
    );
    expect(extract_events_rule_properties({ schedule: 'monthly' }, 'us-east-1').schedule_expression).toBe(
      'cron(0 0 1 * ? *)',
    );
  });

  it('passes a custom cron expression through verbatim', () => {
    const custom = 'cron(15 10 ? * MON-FRI *)';
    expect(extract_events_rule_properties({ schedule: custom }, 'us-east-1').schedule_expression).toBe(custom);
  });

  it('honours enabled=false → state DISABLED', () => {
    expect(extract_events_rule_properties({ enabled: false }, 'us-east-1').state).toBe('DISABLED');
  });
});
