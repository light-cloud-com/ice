/**
 * Providers Module
 *
 * Provider registration, management, and lifecycle.
 */

// Provider registry
export type { ProviderManagerOptions } from './provider-registry.js';

export {
  DefaultProviderRegistry,
  ProviderManager,
  create_provider_registry,
  create_provider_manager,
  get_global_registry,
  set_global_registry,
} from './provider-registry.js';
