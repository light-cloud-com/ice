/**
 * Integration connection status — shared by every BYOK surface
 * (GitHub PAT, Anthropic API key, cloud provider credentials, …).
 *
 * Lives in `@ice/constants` so the redux slice, the connect modals,
 * the status-dot row, and Settings → Integrations all reference the
 * same union without redefining it.
 */

export type IntegrationStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export const INTEGRATION_STATUSES: readonly IntegrationStatus[] = [
  'disconnected',
  'connecting',
  'connected',
  'error',
] as const;
