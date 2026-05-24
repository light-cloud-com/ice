/**
 * Tests for AWS ancillary extractors.
 */

import { describe, it, expect } from 'vitest';
import {
  extract_sqs_queue_properties,
  extract_sns_topic_properties,
  extract_cognito_user_pool_properties,
  extract_secrets_manager_secret_properties,
  extract_cloudwatch_log_group_properties,
} from '../ancillary';

describe('extract_sqs_queue_properties', () => {
  it('defaults to a standard 4-day-retention queue', () => {
    expect(extract_sqs_queue_properties({}, 'us-east-1')).toEqual({
      region: 'us-east-1',
      fifo: false,
      message_retention_seconds: 345600,
      visibility_timeout_seconds: 30,
      delay_seconds: 0,
      tags: {},
    });
  });

  it('emits FIFO + content_based_deduplication only on FIFO queues', () => {
    const fifo = extract_sqs_queue_properties({ fifo: true, content_based_dedup: true }, 'us-east-1');
    expect(fifo.fifo).toBe(true);
    expect(fifo.content_based_deduplication).toBe(true);

    const std = extract_sqs_queue_properties({ content_based_dedup: true }, 'us-east-1');
    expect(std.content_based_deduplication).toBeUndefined();
  });
});

describe('extract_sns_topic_properties', () => {
  it('defaults to standard topic with no display name + no KMS key', () => {
    expect(extract_sns_topic_properties({}, 'us-east-1')).toEqual({
      region: 'us-east-1',
      fifo: false,
      display_name: '',
      kms_master_key_id: undefined,
      tags: {},
    });
  });

  it('honours FIFO flag', () => {
    expect(extract_sns_topic_properties({ fifo: true }, 'us-east-1').fifo).toBe(true);
  });
});

describe('extract_cognito_user_pool_properties', () => {
  it('defaults to email auto-verification + email/google sign-in + MFA off', () => {
    const result = extract_cognito_user_pool_properties({}, 'us-east-1');
    expect(result).toMatchObject({
      region: 'us-east-1',
      auto_verified_attributes: ['email'],
      sign_in_providers: ['email', 'google'],
      mfa_configuration: 'OFF',
    });
    expect(result.password_policy).toEqual({
      minimum_length: 8,
      require_uppercase: true,
      require_lowercase: true,
      require_numbers: true,
      require_symbols: false,
    });
  });

  it('flips MFA to ON when mfaEnabled=true', () => {
    expect(extract_cognito_user_pool_properties({ mfaEnabled: true }, 'us-east-1').mfa_configuration).toBe('ON');
  });

  it('reads signInProviders (camelCase canvas field) or snake variant', () => {
    expect(
      extract_cognito_user_pool_properties({ signInProviders: ['phone', 'github'] }, 'us-east-1').sign_in_providers,
    ).toEqual(['phone', 'github']);
  });
});

describe('extract_secrets_manager_secret_properties', () => {
  it('forwards data.secrets as bindings (parallel to GCP secret_manager)', () => {
    const result = extract_secrets_manager_secret_properties(
      { secrets: [{ key: 'API_KEY', ref: 'prod-api-key' }, { key: 'TOKEN' }] },
      'us-east-1',
    );
    expect(result.bindings).toEqual([{ key: 'API_KEY', ref: 'prod-api-key' }, { key: 'TOKEN' }]);
  });

  it('coerces missing or non-array secrets to []', () => {
    expect(extract_secrets_manager_secret_properties({ secrets: 'oops' }, 'us-east-1').bindings).toEqual([]);
    expect(extract_secrets_manager_secret_properties({}, 'us-east-1').bindings).toEqual([]);
  });

  it('emits undefined for rotation_lambda_arn + kms_key_id by default', () => {
    const result = extract_secrets_manager_secret_properties({}, 'us-east-1');
    expect(result.rotation_lambda_arn).toBeUndefined();
    expect(result.kms_key_id).toBeUndefined();
    expect(result.rotation_days).toBe(0);
  });
});

describe('extract_cloudwatch_log_group_properties', () => {
  it('defaults to 30-day retention', () => {
    expect(extract_cloudwatch_log_group_properties({}, 'us-east-1')).toEqual({
      region: 'us-east-1',
      retention_in_days: 30,
      kms_key_id: undefined,
      tags: {},
    });
  });

  it('honours retention_in_days override', () => {
    expect(extract_cloudwatch_log_group_properties({ retention_in_days: 14 }, 'us-east-1').retention_in_days).toBe(14);
  });

  it('falls through to retention_days (alternate canvas field)', () => {
    expect(extract_cloudwatch_log_group_properties({ retention_days: 90 }, 'us-east-1').retention_in_days).toBe(90);
  });
});
