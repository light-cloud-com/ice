/**
 * GCP error-detection utilities — pure string/regex predicates and URL builders.
 *
 *   isApiNotEnabledError(s)  : matches any of seven well-known phrases.
 *   extractApiName(s)        : pulls "<name>.googleapis.com" out of any of
 *                              four surrounding contexts.
 *   extractApiEnableUrl(s)   : returns the console URL — either embedded or
 *                              built from the extracted API name.
 *   buildApiEnableUrl(name?) : composes the canonical console URL,
 *                              optionally with `?project=<id>`.
 */

import { describe, it, expect } from 'vitest';
import { isApiNotEnabledError, extractApiName, extractApiEnableUrl, buildApiEnableUrl } from '../gcp-errors';

describe('isApiNotEnabledError', () => {
  it('matches the canonical "has not been used in project" phrase', () => {
    expect(isApiNotEnabledError('Cloud Build API has not been used in project foo')).toBe(true);
  });

  it('matches the "it is disabled" phrase', () => {
    expect(isApiNotEnabledError('… or it is disabled.')).toBe(true);
  });

  it('matches "API has not been enabled"', () => {
    expect(isApiNotEnabledError('API has not been enabled')).toBe(true);
  });

  it('matches the PERMISSION_DENIED grpc status', () => {
    expect(isApiNotEnabledError('PERMISSION_DENIED: …')).toBe(true);
  });

  it('matches SERVICE_DISABLED', () => {
    expect(isApiNotEnabledError('reason: SERVICE_DISABLED')).toBe(true);
  });

  it('matches accessNotConfigured', () => {
    expect(isApiNotEnabledError('Error: accessNotConfigured')).toBe(true);
  });

  it('matches "must be enabled"', () => {
    expect(isApiNotEnabledError('Cloud Run must be enabled')).toBe(true);
  });

  it('returns false for an unrelated error message', () => {
    expect(isApiNotEnabledError('something exploded')).toBe(false);
  });

  it('returns false for an empty string', () => {
    expect(isApiNotEnabledError('')).toBe(false);
  });
});

describe('extractApiName', () => {
  it('extracts from a console URL with /api/<name>.googleapis.com/', () => {
    const url = 'https://console.cloud.google.com/apis/api/run.googleapis.com/overview';
    expect(extractApiName(url)).toBe('run.googleapis.com');
  });

  it('extracts from "API [<name>.googleapis.com]"', () => {
    expect(extractApiName('API [storage.googleapis.com] is disabled')).toBe('storage.googleapis.com');
  });

  it('extracts from `service "<name>.googleapis.com"`', () => {
    expect(extractApiName('service "compute.googleapis.com" not enabled')).toBe('compute.googleapis.com');
  });

  it('extracts from a bare "<name>.googleapis.com " with trailing whitespace', () => {
    expect(extractApiName('cloudresourcemanager.googleapis.com is required')).toBe(
      'cloudresourcemanager.googleapis.com',
    );
  });

  it('returns null when no pattern matches', () => {
    expect(extractApiName('no api in this string')).toBeNull();
  });

  it('returns null on the empty string', () => {
    expect(extractApiName('')).toBeNull();
  });

  it('prefers the URL form over the bracket form when both appear', () => {
    // The URL pattern is checked first; both match "run.googleapis.com" →
    // pinning the URL branch.
    const text =
      'see https://console.cloud.google.com/apis/api/run.googleapis.com/overview and API [pubsub.googleapis.com]';
    expect(extractApiName(text)).toBe('run.googleapis.com');
  });
});

describe('extractApiEnableUrl', () => {
  it('returns an embedded console URL verbatim when present', () => {
    const url = 'https://console.cloud.google.com/apis/api/run.googleapis.com/overview?project=p';
    expect(extractApiEnableUrl(`Click ${url} to enable.`)).toBe(url);
  });

  it('builds a URL from the API name when the error has no embedded URL', () => {
    expect(extractApiEnableUrl('API [storage.googleapis.com] is disabled')).toBe(
      'https://console.cloud.google.com/apis/api/storage.googleapis.com/overview',
    );
  });

  it('returns null when neither a URL nor an API name is present', () => {
    expect(extractApiEnableUrl('something exploded')).toBeNull();
  });

  it('returns null for the empty string', () => {
    expect(extractApiEnableUrl('')).toBeNull();
  });
});

describe('buildApiEnableUrl', () => {
  it('builds the canonical URL when no project is supplied', () => {
    expect(buildApiEnableUrl('run.googleapis.com')).toBe(
      'https://console.cloud.google.com/apis/api/run.googleapis.com/overview',
    );
  });

  it('appends ?project=<id> when project is supplied', () => {
    expect(buildApiEnableUrl('run.googleapis.com', 'my-proj')).toBe(
      'https://console.cloud.google.com/apis/api/run.googleapis.com/overview?project=my-proj',
    );
  });

  it('treats an empty project as "no project" (falsy guard)', () => {
    // `''` is falsy so the suffix is skipped.
    expect(buildApiEnableUrl('run.googleapis.com', '')).toBe(
      'https://console.cloud.google.com/apis/api/run.googleapis.com/overview',
    );
  });
});
