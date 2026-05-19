/**
 * rf-pset-2 — `PROVIDER_CONFIGS` data leaf.
 *
 * Pins the shape and per-provider field set of the data array extracted
 * from `provider-settings.tsx` into `./data/provider-configs.ts`. Each
 * entry's:
 *
 *   - `id` matches the discriminated `ProviderId` union order (aws, gcp,
 *     azure) — the visual order in the modal,
 *   - `color` / `bgColor` Tailwind classes,
 *   - `configFields` array,
 *
 * is asserted verbatim. The test also exercises the `?? 'literal'`
 * fallbacks by mocking `getCloudProvider` to return undefined.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@ice/core/resources', () => {
  const mockGetter = vi.fn((id: string) => {
    if (id === 'aws') return { name: 'Amazon Web Services', icon: 'aws' };
    if (id === 'gcp') return { name: 'Google Cloud Platform', icon: 'gcp' };
    if (id === 'azure') return { name: 'Microsoft Azure', icon: 'azure' };
    return undefined;
  });
  return { getCloudProvider: mockGetter };
});

beforeEach(async () => {
  vi.resetModules();
});

describe('PROVIDER_CONFIGS — shape regression', () => {
  it('exports an array with three entries in aws/gcp/azure order', async () => {
    const { PROVIDER_CONFIGS } = await import('../data/provider-configs');
    expect(Array.isArray(PROVIDER_CONFIGS)).toBe(true);
    expect(PROVIDER_CONFIGS.map((p) => p.id)).toEqual(['aws', 'gcp', 'azure']);
  });

  it('AWS config carries access-key, secret-key, and region select fields', async () => {
    const { PROVIDER_CONFIGS } = await import('../data/provider-configs');
    const aws = PROVIDER_CONFIGS.find((p) => p.id === 'aws');
    expect(aws).toBeDefined();
    expect(aws?.color).toBe('text-orange-500');
    expect(aws?.bgColor).toBe('bg-orange-100 dark:bg-orange-900/30');
    expect(aws?.description).toBe('Connect to AWS using access keys or IAM role');
    expect(aws?.configFields.map((f) => f.name)).toEqual(['accessKeyId', 'secretAccessKey', 'region']);
    const region = aws?.configFields.find((f) => f.name === 'region');
    expect(region?.type).toBe('select');
    expect(region?.options).toEqual(['us-east-1', 'us-west-2', 'eu-west-1', 'ap-southeast-1']);
  });

  it('AWS access-key fields are required text/password inputs with placeholders', async () => {
    const { PROVIDER_CONFIGS } = await import('../data/provider-configs');
    const aws = PROVIDER_CONFIGS.find((p) => p.id === 'aws');
    const accessKey = aws?.configFields.find((f) => f.name === 'accessKeyId');
    expect(accessKey?.type).toBe('text');
    expect(accessKey?.required).toBe(true);
    expect(accessKey?.placeholder).toBe('AKIA...');
    const secret = aws?.configFields.find((f) => f.name === 'secretAccessKey');
    expect(secret?.type).toBe('password');
    expect(secret?.required).toBe(true);
    expect(secret?.placeholder).toBe('********');
  });

  it('GCP config carries a single optional service-account-key textarea with helpLink', async () => {
    const { PROVIDER_CONFIGS } = await import('../data/provider-configs');
    const gcp = PROVIDER_CONFIGS.find((p) => p.id === 'gcp');
    expect(gcp?.color).toBe('text-blue-500');
    expect(gcp?.bgColor).toBe('bg-blue-100 dark:bg-blue-900/30');
    expect(gcp?.configFields).toHaveLength(1);
    const sak = gcp?.configFields[0];
    expect(sak?.name).toBe('service_account_key');
    expect(sak?.type).toBe('textarea');
    expect(sak?.required).toBe(false);
    expect(sak?.helpLink?.url).toBe('https://console.cloud.google.com/iam-admin/serviceaccounts');
    expect(sak?.helpLink?.text).toBe('Create service account');
  });

  it('Azure config carries the four service-principal fields in declaration order', async () => {
    const { PROVIDER_CONFIGS } = await import('../data/provider-configs');
    const az = PROVIDER_CONFIGS.find((p) => p.id === 'azure');
    expect(az?.color).toBe('text-sky-500');
    expect(az?.bgColor).toBe('bg-sky-100 dark:bg-sky-900/30');
    expect(az?.configFields.map((f) => f.name)).toEqual(['subscriptionId', 'tenantId', 'clientId', 'clientSecret']);
    expect(az?.configFields.every((f) => f.required)).toBe(true);
    const clientSecret = az?.configFields.find((f) => f.name === 'clientSecret');
    expect(clientSecret?.type).toBe('password');
  });

  it('uses registry name + icon when getCloudProvider resolves', async () => {
    const { PROVIDER_CONFIGS } = await import('../data/provider-configs');
    expect(PROVIDER_CONFIGS.find((p) => p.id === 'aws')?.name).toBe('Amazon Web Services');
    expect(PROVIDER_CONFIGS.find((p) => p.id === 'gcp')?.name).toBe('Google Cloud Platform');
    expect(PROVIDER_CONFIGS.find((p) => p.id === 'azure')?.name).toBe('Microsoft Azure');
    expect(PROVIDER_CONFIGS.find((p) => p.id === 'aws')?.icon).toBe('aws');
    expect(PROVIDER_CONFIGS.find((p) => p.id === 'gcp')?.icon).toBe('gcp');
    expect(PROVIDER_CONFIGS.find((p) => p.id === 'azure')?.icon).toBe('azure');
  });

  it('falls back to literal name + icon when getCloudProvider returns undefined', async () => {
    vi.doMock('@ice/core/resources', () => ({
      getCloudProvider: vi.fn(() => undefined),
    }));
    const { PROVIDER_CONFIGS } = await import('../data/provider-configs');
    expect(PROVIDER_CONFIGS.find((p) => p.id === 'aws')?.name).toBe('Amazon Web Services');
    expect(PROVIDER_CONFIGS.find((p) => p.id === 'gcp')?.name).toBe('Google Cloud Platform');
    expect(PROVIDER_CONFIGS.find((p) => p.id === 'azure')?.name).toBe('Microsoft Azure');
    expect(PROVIDER_CONFIGS.find((p) => p.id === 'aws')?.icon).toBe('aws');
    expect(PROVIDER_CONFIGS.find((p) => p.id === 'gcp')?.icon).toBe('gcp');
    expect(PROVIDER_CONFIGS.find((p) => p.id === 'azure')?.icon).toBe('azure');
    vi.doUnmock('@ice/core/resources');
  });
});
