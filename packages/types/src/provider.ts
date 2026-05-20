/** Provider API contracts */

import { type Provider } from '@ice/constants';

export type CloudProvider = Provider;

export interface ProviderCredentials {
  provider: CloudProvider;
  project_id?: string;
  is_connected: boolean;
}

export interface ProviderStatus {
  connected: boolean;
  provider?: string;
  project_id?: string;
}

export interface ProviderConnectRequest {
  credentials: Record<string, string>;
}

export interface ProviderConnectResponse {
  success: boolean;
  projects?: Array<{ id: string; name: string }>;
}
