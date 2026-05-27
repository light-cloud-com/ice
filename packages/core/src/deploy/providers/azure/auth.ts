/**
 * Azure auth helpers.
 *
 * Mirrors `../gcp/auth.ts`: a credential validator + subscription
 * lister the settings UI invokes before the operator finishes wiring
 * an Azure provider.
 *
 * Credential resolution goes through `DefaultAzureCredential` — works
 * with `az login` sessions, service-principal env vars
 * (AZURE_TENANT_ID / AZURE_CLIENT_ID / AZURE_CLIENT_SECRET), managed
 * identity, etc.
 */

import { load_azure_sdk } from './sdk-loader';

export interface AzureAuthConfig {
  tenant_id?: string;
  client_id?: string;
  client_secret?: string;
  subscription_id: string;
}

export interface AzureAuthResult {
  ok: boolean;
  subscription_id?: string;
  display_name?: string;
  state?: string;
  error?: string;
}

export interface AzureSubscription {
  id: string;
  display_name: string;
  state: string;
}

async function get_credential(config: Partial<AzureAuthConfig>): Promise<any> {
  const identity = await load_azure_sdk('@azure/identity');
  if (!identity) throw new Error('Install @azure/identity to validate Azure credentials');

  // Service-principal flow when env vars or config supplies them.
  if (config.tenant_id && config.client_id && config.client_secret) {
    return new identity.ClientSecretCredential(config.tenant_id, config.client_id, config.client_secret);
  }
  return new identity.DefaultAzureCredential();
}

/**
 * Confirm the supplied credentials can describe the target subscription.
 * Mirrors the AWS STS GetCallerIdentity step.
 */
export async function validate_azure_credentials(config: AzureAuthConfig): Promise<AzureAuthResult> {
  try {
    const sub = await load_azure_sdk('@azure/arm-subscriptions');
    if (!sub) return { ok: false, error: 'Install @azure/arm-subscriptions to validate credentials' };

    const credential = await get_credential(config);
    const client = new sub.SubscriptionClient(credential);
    const result = await client.subscriptions.get(config.subscription_id);
    return {
      ok: true,
      subscription_id: config.subscription_id,
      display_name: result?.displayName,
      state: result?.state,
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * List every subscription the credentials can see. Used by the
 * settings UI to populate a subscription picker.
 */
export async function list_azure_subscriptions(config: Partial<AzureAuthConfig>): Promise<AzureSubscription[]> {
  const sub = await load_azure_sdk('@azure/arm-subscriptions');
  if (!sub) throw new Error('Install @azure/arm-subscriptions to list subscriptions');

  const credential = await get_credential(config);
  const client = new sub.SubscriptionClient(credential);
  const out: AzureSubscription[] = [];
  for await (const s of client.subscriptions.list()) {
    out.push({
      id: s.subscriptionId ?? '',
      display_name: s.displayName ?? '',
      state: s.state ?? '',
    });
  }
  return out;
}
