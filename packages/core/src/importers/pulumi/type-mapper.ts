/**
 * Pulumi Type Mapper
 *
 * Maps Pulumi resource types to ICE unified types.
 * Pulumi type format: <provider>:<module>/<resource>:<ResourceClass>
 * Example: aws:s3/bucket:Bucket
 *
 * The original 527-LOC monolith has been decomposed into four
 * sub-modules under `./type-mapper/`. This file is now a thin
 * re-export shim that preserves the public API exactly.
 *
 * Decomposition map:
 *  - `./type-mapper/data.ts` — PROVIDER_MAP + TYPE_MAP lookup
 *    tables (rf-pmap-1). The TYPE_MAP entries are the source of
 *    truth for ICE iceType names; external consumers depend on
 *    the exact dotted-form values.
 *  - `./type-mapper/parse.ts` — parse_urn, parse_type (rf-pmap-2).
 *    Pure string parsers; no data-table dependency.
 *  - `./type-mapper/mapping.ts` — get_ice_type, get_ice_provider,
 *    get_provider_from_type, is_type_supported, get_supported_types,
 *    get_supported_ice_types, get_name_from_urn, is_provider_resource,
 *    is_stack_resource (rf-pmap-3). Uses the data tables + parsers.
 *
 * Public API unchanged — all eleven exported functions and the
 * implicit data-table re-exports keep their pre-extraction shapes.
 * External consumers (state-importer.ts, parsing.ts, resource-conversion.ts,
 * index.ts) continue importing through this shim.
 */

export { parse_type, parse_urn } from './type-mapper/parse';

export {
  get_ice_provider,
  get_ice_type,
  get_name_from_urn,
  get_provider_from_type,
  get_supported_ice_types,
  get_supported_types,
  is_provider_resource,
  is_stack_resource,
  is_type_supported,
} from './type-mapper/mapping';
