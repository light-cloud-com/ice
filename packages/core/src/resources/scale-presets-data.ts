/**
 * Scale Presets — Bulk preset data dictionary (orchestrator).
 *
 * Module layout (rf-spdat split):
 *   - `./scale-presets-data/compute.ts`     — frontend, backend, serverless, containers, ML, schedulers
 *   - `./scale-presets-data/database.ts`    — postgres, mysql, mongo, redis, dynamodb, vector, search, warehouse
 *   - `./scale-presets-data/storage.ts`     — object/file storage across providers
 *   - `./scale-presets-data/networking.ts`  — load-balancer, cdn, api-gateway
 *   - `./scale-presets-data/messaging.ts`   — queues, event bus, rabbitmq, pubsub, event-stream
 *   - `./scale-presets-data/security.ts`    — secret-store, ssl-certificate
 *   - `./scale-presets-data/monitoring.ts`  — log-group, alert
 *
 *   This file assembles the per-category records into the single
 *   `SCALE_PRESETS` dict consumers expect. Order is preserved so existing
 *   `Object.keys(SCALE_PRESETS)` traversals remain stable.
 *
 *   Types live in `./scale-presets-types.ts`.
 *   Helpers (`getScalePreset`, `getAllPresetsForResource`) and the public
 *   re-export shim live in `./scale-presets.ts`.
 */

import { COMPUTE_PRESETS } from './scale-presets-data/compute';
import { DATABASE_PRESETS } from './scale-presets-data/database';
import { MESSAGING_PRESETS } from './scale-presets-data/messaging';
import { MONITORING_PRESETS } from './scale-presets-data/monitoring';
import { NETWORKING_PRESETS } from './scale-presets-data/networking';
import { SECURITY_PRESETS } from './scale-presets-data/security';
import { STORAGE_PRESETS } from './scale-presets-data/storage';
import type { ScaleTier, TierPreset } from './scale-presets-types';

// Key = resource ID from HIGH_LEVEL_CATEGORIES.
// For each tier: common props + `_providers` for instance-size overrides.
//
// Spread order matches the original file's category order: COMPUTE, DATABASE,
// STORAGE, NETWORKING, MESSAGING, SECURITY, MONITORING. This keeps
// `Object.keys(SCALE_PRESETS)` stable for any consumer that depends on
// insertion order (none observed; preserved defensively).
export const SCALE_PRESETS: Record<string, Partial<Record<ScaleTier, TierPreset>>> = {
  ...COMPUTE_PRESETS,
  ...DATABASE_PRESETS,
  ...STORAGE_PRESETS,
  ...NETWORKING_PRESETS,
  ...MESSAGING_PRESETS,
  ...SECURITY_PRESETS,
  ...MONITORING_PRESETS,
};
