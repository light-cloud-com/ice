#!/usr/bin/env npx ts-node

/**
 * Schema Build Pipeline
 *
 * Orchestrates the extraction of schemas from Terraform and Pulumi registries,
 * unifies them, and generates TypeScript output files for the ICE engine.
 *
 * Usage:
 *   npx ts-node tools/build-schemas.ts [options]
 *
 * Options:
 *   --providers <list>    Comma-separated list of providers to extract
 *   --output <dir>        Output directory (default: ./packages/schemas/src/generated)
 *   --cache <dir>         Cache directory (default: ./.schema-cache)
 *   --include-deprecated  Include deprecated resources
 *   --terraform-only      Only extract from Terraform
 *   --pulumi-only         Only extract from Pulumi
 *   --dry-run             Show what would be extracted without writing files
 */

import * as fs from 'fs';
import * as path from 'path';
import { build_schema_database } from './build-schema-db';
import {
  create_terraform_extractor,
  create_terraform_cli_extractor,
  create_pulumi_extractor,
  create_schema_unifier,
  TerraformCliExtractor,
  DEFAULT_CONFIG,
  type ExtractorConfig,
  type ExtractionResult,
  type SchemaManifest,
  type UnifiedResourceType,
} from './schema-extractor';

// =============================================================================
// CLI Argument Parsing
// =============================================================================

interface BuildOptions {
  providers: string[];
  output_dir: string;
  cache_dir: string;
  include_deprecated: boolean;
  terraform_only: boolean;
  pulumi_only: boolean;
  dry_run: boolean;
}

function parse_args(): BuildOptions {
  const args = process.argv.slice(2);
  const options: BuildOptions = {
    providers: [],
    output_dir: DEFAULT_CONFIG.output_dir,
    cache_dir: DEFAULT_CONFIG.cache_dir,
    include_deprecated: false,
    terraform_only: false,
    pulumi_only: false,
    dry_run: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case '--providers':
        options.providers = args[++i]?.split(',') || [];
        break;
      case '--output':
        options.output_dir = args[++i] || options.output_dir;
        break;
      case '--cache':
        options.cache_dir = args[++i] || options.cache_dir;
        break;
      case '--include-deprecated':
        options.include_deprecated = true;
        break;
      case '--terraform-only':
        options.terraform_only = true;
        break;
      case '--pulumi-only':
        options.pulumi_only = true;
        break;
      case '--dry-run':
        options.dry_run = true;
        break;
      case '--help':
      case '-h':
        print_help();
        process.exit(0);
    }
  }

  return options;
}

function print_help(): void {
  console.log(`
Schema Build Pipeline - Extract and unify cloud provider schemas

Extracts schemas from:
  - Terraform CLI (requires terraform installed) - full schemas
  - Pulumi Registry (GitHub) - full schemas

Usage:
  npx tsx tools/build-schemas.ts [options]

Options:
  --providers <list>    Comma-separated list of providers to extract
                        e.g., --providers hashicorp/aws,pulumi/gcp
  --output <dir>        Output directory for generated schemas
                        Default: ./packages/schemas/src/generated
  --cache <dir>         Cache directory for downloaded schemas
                        Default: ./.schema-cache
  --include-deprecated  Include deprecated resources in output
  --terraform-only      Only extract from Terraform CLI
  --pulumi-only         Only extract from Pulumi Registry
  --dry-run             Show extraction plan without writing files
  --help, -h            Show this help message

Examples:
  # Extract from both Terraform CLI and Pulumi (default)
  npx tsx tools/build-schemas.ts

  # Extract specific providers
  npx tsx tools/build-schemas.ts --providers hashicorp/aws,pulumi/gcp

  # Terraform only
  npx tsx tools/build-schemas.ts --terraform-only

  # Pulumi only
  npx tsx tools/build-schemas.ts --pulumi-only
`);
}

// =============================================================================
// Build Pipeline
// =============================================================================

async function run_build(options: BuildOptions): Promise<void> {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║           ICE Schema Extraction Pipeline                   ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  const config: ExtractorConfig = {
    ...DEFAULT_CONFIG,
    output_dir: options.output_dir,
    cache_dir: options.cache_dir,
    include_deprecated: options.include_deprecated,
  };

  // Ensure directories exist
  if (!options.dry_run) {
    ensure_directory(config.output_dir);
    ensure_directory(config.cache_dir);
  }

  const unifier = create_schema_unifier();
  const all_results: ExtractionResult[] = [];

  // Extract from Terraform CLI (if available and not pulumi-only)
  if (!options.pulumi_only) {
    if (TerraformCliExtractor.is_available()) {
      console.log('📦 Extracting from Terraform CLI...\n');
      const tf_version = TerraformCliExtractor.get_version();
      console.log(`   ✓ Terraform CLI found (v${tf_version})\n`);
      const terraform_results = await extract_terraform_cli(config, options);
      all_results.push(...terraform_results);
      unifier.add_results(terraform_results);
    } else {
      console.log('ℹ️  Terraform CLI not found - skipping Terraform extraction');
      console.log('   Install Terraform for direct schema extraction.\n');
    }
  }

  // Extract from Pulumi
  if (!options.terraform_only) {
    console.log('\n📦 Extracting from Pulumi Registry...\n');
    const pulumi_results = await extract_pulumi(config, options);
    all_results.push(...pulumi_results);
    unifier.add_results(pulumi_results);
  }

  // Print statistics
  const stats = unifier.get_statistics();
  print_statistics(stats);

  if (options.dry_run) {
    console.log('\n🔍 Dry run complete. No files written.\n');
    return;
  }

  // Generate output files
  console.log('\n📝 Generating output files...\n');

  const unified_types = unifier.generate_unified_types();
  const manifest = unifier.generate_manifest();

  await generate_output_files(config.output_dir, unified_types, manifest, all_results);

  console.log('\n✅ Schema extraction complete!\n');
  console.log(`   Output directory: ${config.output_dir}`);
  console.log(`   Total unified types: ${unified_types.length}`);
  console.log(`   Total resources: ${stats.total_resources}`);
}

async function extract_terraform_cli(config: ExtractorConfig, options: BuildOptions): Promise<ExtractionResult[]> {
  const extractor = create_terraform_cli_extractor(config);
  const results: ExtractionResult[] = [];

  if (options.providers.length > 0) {
    // Extract specific providers (filter to terraform format)
    const tf_providers = options.providers.filter((p) => p.includes('/'));
    for (const provider_id of tf_providers) {
      console.log(`   Extracting ${provider_id}...`);
      const result = await extractor.extract_provider(provider_id);
      results.push(result);
      print_extraction_result(result);
    }
  } else {
    // Discover and extract ALL providers
    console.log('   Discovering providers...');
    const providers = await extractor.discover_providers();
    console.log(`   Found ${providers.length} providers\n`);

    for (const provider of providers) {
      console.log(`   Extracting ${provider.id}...`);
      const result = await extractor.extract_provider(provider.id);
      results.push(result);
      print_extraction_result(result);
    }
  }

  return results;
}

async function extract_terraform(config: ExtractorConfig, options: BuildOptions): Promise<ExtractionResult[]> {
  const extractor = create_terraform_extractor(config);
  const results: ExtractionResult[] = [];

  if (options.providers.length > 0) {
    // Extract specific providers
    for (const provider_id of options.providers) {
      if (!provider_id.includes('/')) continue; // Skip non-terraform format
      console.log(`   Extracting ${provider_id}...`);
      const result = await extractor.extract_provider(provider_id);
      results.push(result);
      print_extraction_result(result);
    }
  } else {
    // Discover and extract all providers
    console.log('   Discovering providers...');
    const providers = await extractor.discover_providers();
    console.log(`   Found ${providers.length} providers\n`);

    // For now, extract top providers (can be expanded)
    const top_providers = providers.slice(0, 5); // Limit for demo

    for (const provider of top_providers) {
      console.log(`   Extracting ${provider.id}...`);
      const result = await extractor.extract_provider(provider.id);
      results.push(result);
      print_extraction_result(result);
    }
  }

  return results;
}

async function extract_pulumi(config: ExtractorConfig, options: BuildOptions): Promise<ExtractionResult[]> {
  const extractor = create_pulumi_extractor(config);
  const results: ExtractionResult[] = [];

  if (options.providers.length > 0) {
    // Extract specific providers
    for (const provider_id of options.providers) {
      console.log(`   Extracting ${provider_id}...`);
      const result = await extractor.extract_provider(provider_id);
      results.push(result);
      print_extraction_result(result);
    }
  } else {
    // Discover and extract all providers
    console.log('   Discovering packages...');
    const providers = await extractor.discover_providers();
    console.log(`   Found ${providers.length} packages\n`);

    for (const provider of providers) {
      console.log(`   Extracting ${provider.name}...`);
      const result = await extractor.extract_provider(provider.name);
      results.push(result);
      print_extraction_result(result);
    }
  }

  return results;
}

function print_extraction_result(result: ExtractionResult): void {
  if (result.success) {
    console.log(
      `      ✓ ${result.provider.name}: ${result.resources.length} resources, ` +
        `${result.metadata.categories_found.length} categories ` +
        `(${result.metadata.duration_ms}ms)`,
    );
  } else {
    console.log(`      ✗ ${result.provider.name}: ${result.errors[0]?.error || 'Unknown error'}`);
  }
}

function print_statistics(stats: {
  total_resources: number;
  terraform_resources: number;
  pulumi_resources: number;
  inferred_terraform_implementations?: number;
  terraform_providers: number;
  pulumi_providers: number;
  categories: string[];
  category_counts: Record<string, number>;
  cross_provider_equivalents: number;
}): void {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║                    Extraction Statistics                   ║');
  console.log('╠════════════════════════════════════════════════════════════╣');
  console.log(`║  Total Resources:           ${String(stats.total_resources).padStart(6)}                       ║`);
  console.log(`║  Pulumi Resources:          ${String(stats.pulumi_resources).padStart(6)}                       ║`);
  console.log(`║  Terraform Resources:       ${String(stats.terraform_resources).padStart(6)}                       ║`);
  if (stats.inferred_terraform_implementations) {
    console.log(
      `║  Inferred TF Impls:         ${String(stats.inferred_terraform_implementations).padStart(6)}                       ║`,
    );
  }
  console.log(`║  Pulumi Providers:          ${String(stats.pulumi_providers).padStart(6)}                       ║`);
  console.log(`║  Terraform Providers:       ${String(stats.terraform_providers).padStart(6)}                       ║`);
  console.log(`║  Categories:                ${String(stats.categories.length).padStart(6)}                       ║`);
  console.log(
    `║  Cross-Provider Matches:    ${String(stats.cross_provider_equivalents).padStart(6)}                       ║`,
  );
  console.log('╚════════════════════════════════════════════════════════════╝');
}

// =============================================================================
// File Generation
// =============================================================================

async function generate_output_files(
  output_dir: string,
  unified_types: UnifiedResourceType[],
  manifest: SchemaManifest,
  results: ExtractionResult[],
): Promise<void> {
  // Generate manifest.json
  const manifest_path = path.join(output_dir, 'manifest.json');
  fs.writeFileSync(manifest_path, JSON.stringify(manifest, null, 2));
  console.log(`   ✓ Generated ${manifest_path}`);

  // Generate unified-types.json
  const unified_path = path.join(output_dir, 'unified-types.json');
  fs.writeFileSync(unified_path, JSON.stringify(unified_types, null, 2));
  console.log(`   ✓ Generated ${unified_path}`);

  // Generate TypeScript type definitions
  const types_ts_path = path.join(output_dir, 'resource-types.ts');
  const types_content = generate_typescript_types(unified_types);
  fs.writeFileSync(types_ts_path, types_content);
  console.log(`   ✓ Generated ${types_ts_path}`);

  // Generate per-provider raw schemas
  const raw_dir = path.join(output_dir, 'raw');
  ensure_directory(raw_dir);

  for (const result of results) {
    if (!result.success) continue;

    const provider_file = path.join(raw_dir, `${result.source}-${result.provider.name.replace('/', '-')}.json`);
    fs.writeFileSync(
      provider_file,
      JSON.stringify(
        {
          provider: result.provider,
          resources: result.resources,
          metadata: result.metadata,
        },
        null,
        2,
      ),
    );
  }
  console.log(`   ✓ Generated raw provider schemas in ${raw_dir}`);

  // Generate index.ts
  const index_path = path.join(output_dir, 'index.ts');
  const index_content = generate_index_file();
  fs.writeFileSync(index_path, index_content);
  console.log(`   ✓ Generated ${index_path}`);

  // Generate SQLite knowledge graph database
  console.log('\n📊 Generating SQLite knowledge graph...\n');
  const data_dir = path.join(path.dirname(output_dir), 'data');
  ensure_directory(data_dir);
  const db_path = path.join(data_dir, 'ice-schemas.db');

  try {
    await build_schema_database({
      output_path: db_path,
      unified_types,
      extraction_results: results,
      manifest,
      detect_relationships: true,
      verbose: true,
    });

    const stats = fs.statSync(db_path);
    console.log(`   ✓ Generated ${db_path} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
  } catch (error) {
    console.error(`   ✗ Failed to generate SQLite database: ${error}`);
  }
}

function generate_typescript_types(unified_types: UnifiedResourceType[]): string {
  const lines: string[] = [
    '/**',
    ' * ICE Resource Type Definitions',
    ' *',
    ' * Auto-generated from Terraform and Pulumi schemas.',
    ' * DO NOT EDIT MANUALLY.',
    ' *',
    ` * Generated: ${new Date().toISOString()}`,
    ` * Total Types: ${unified_types.length}`,
    ' */',
    '',
    "import type { UnifiedResourceType } from './types';",
    '',
  ];

  // Group by category
  const by_category = new Map<string, UnifiedResourceType[]>();
  for (const type of unified_types) {
    const category = type.category || 'uncategorized';
    const existing = by_category.get(category) || [];
    existing.push(type);
    by_category.set(category, existing);
  }

  // Generate type union per category
  for (const [category, types] of by_category) {
    const type_names = types.map((t) => `'${t.ice_type}'`).join(' | ');
    lines.push(`export type ${capitalize(category)}ResourceType = ${type_names};`);
    lines.push('');
  }

  // Generate all resource types union
  const all_types = unified_types.map((t) => `'${t.ice_type}'`).join(' | ');
  lines.push(`export type ICEResourceType = ${all_types};`);
  lines.push('');

  // Generate category type
  const categories = Array.from(by_category.keys())
    .map((c) => `'${c}'`)
    .join(' | ');
  lines.push(`export type ResourceCategory = ${categories};`);
  lines.push('');

  // Export the unified types array
  lines.push('export const UNIFIED_RESOURCE_TYPES: UnifiedResourceType[] = ');
  lines.push(JSON.stringify(unified_types, null, 2) + ';');
  lines.push('');

  return lines.join('\n');
}

function generate_index_file(): string {
  return `/**
 * Generated Schemas - Index
 *
 * Auto-generated exports for ICE schema system.
 * DO NOT EDIT MANUALLY.
 */

export * from './resource-types';

// Re-export manifest
import manifest from './manifest.json';
export { manifest };

// Re-export unified types
import unifiedTypes from './unified-types.json';
export { unifiedTypes };
`;
}

// =============================================================================
// Utilities
// =============================================================================

function ensure_directory(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// =============================================================================
// Main Entry Point
// =============================================================================

const options = parse_args();
run_build(options).catch((error) => {
  console.error('Build failed:', error);
  process.exit(1);
});
