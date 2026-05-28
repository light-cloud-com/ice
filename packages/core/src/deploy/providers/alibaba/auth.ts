/**
 * Alibaba auth helpers — RAM AccessKey ID + Secret validation.
 *
 * Probe approach: call STS GetCallerIdentity. This is the cheapest
 * authenticated read and returns the calling principal's account ID +
 * ARN, which the settings UI shows back to the operator.
 */

import { normalize_region, service_endpoint } from './region';
import { load_alibaba_sdk } from './sdk-loader';
import type { AlibabaCredentials } from './types';

export interface AlibabaValidationResult {
  valid: boolean;
  account_id?: string;
  arn?: string;
  error?: string;
}

/**
 * Validate creds by calling sts.GetCallerIdentity. The STS package is
 * tiny so we load it directly instead of going through the registry.
 */
export async function validate_alibaba_credentials(credentials: AlibabaCredentials): Promise<AlibabaValidationResult> {
  try {
    const stsMod = await load_alibaba_sdk('@alicloud/sts20150401');
    if (!stsMod) return { valid: false, error: '@alicloud/sts20150401 not installed' };
    const Config = (stsMod.OpenApi?.Config ?? stsMod.Config) as new (cfg: unknown) => unknown;
    const Client = stsMod.default;
    if (!Config || !Client) return { valid: false, error: 'STS client constructor not found' };
    const client = new Client(
      new Config({
        accessKeyId: credentials.access_key_id,
        accessKeySecret: credentials.access_key_secret,
        securityToken: credentials.security_token,
        endpoint: service_endpoint('sts', normalize_region(credentials.region)),
      }),
    ) as { getCallerIdentity?: () => Promise<{ body?: { accountId?: string; arn?: string } }> };
    if (!client.getCallerIdentity) {
      return { valid: false, error: 'STS client missing getCallerIdentity()' };
    }
    const result = await client.getCallerIdentity();
    return {
      valid: true,
      account_id: result.body?.accountId,
      arn: result.body?.arn,
    };
  } catch (error) {
    return { valid: false, error: error instanceof Error ? error.message : String(error) };
  }
}
