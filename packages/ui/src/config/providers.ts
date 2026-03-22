/**
 * Enabled Cloud Providers — single source of truth
 *
 * Only AWS, GCP, Azure for now. Add more here to enable them everywhere:
 * palette, wizard, provider settings, blocks.
 */

import { CLOUD_PROVIDERS } from '@ice/core/resources';

export const ENABLED_PROVIDER_IDS = new Set(['aws', 'gcp', 'azure']);

export const ENABLED_PROVIDERS = CLOUD_PROVIDERS.filter((p) => ENABLED_PROVIDER_IDS.has(p.id));
