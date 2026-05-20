#!/usr/bin/env npx ts-node

/**
 * SQLite Schema Database Generator
 *
 * Generates the ICE knowledge graph database from extracted schemas.
 * Creates a SQLite database with resource types, properties, implementations,
 * and relationships (dependencies, equivalents, property flows).
 *
 * Usage:
 *   npx tsx tools/build-schema-db.ts [options]
 *
 * This is typically called from build-schemas.ts, but can be run standalone.
 */

import * as fs from 'fs';
import * as path from 'path';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import Database, { type Database as DatabaseType } from 'better-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

import type {
  ExtractionResult,
  PropertyDefinition,
  SchemaManifest,
  UnifiedResourceType,
} from './schema-extractor';

// =============================================================================
// Types
// =============================================================================

interface BuildDbOptions {
  output_path: string;
  unified_types: UnifiedResourceType[];
  extraction_results: ExtractionResult[];
  manifest: SchemaManifest;
  detect_relationships?: boolean;
  verbose?: boolean;
}

interface RelationshipPattern {
  property_suffix: string;
  target_category: string;
  target_type_pattern: string;
  relationship_type: 'depends_on' | 'references' | 'connects_to';
  description: string;
}

// =============================================================================
// Relationship Detection Patterns
// =============================================================================

const RELATIONSHIP_PATTERNS: RelationshipPattern[] = [
  // VPC/Network relationships
  {
    property_suffix: 'vpc_id',
    target_category: 'ec2',
    target_type_pattern: 'vpc',
    relationship_type: 'depends_on',
    description: 'Requires VPC',
  },
  {
    property_suffix: 'vpcId',
    target_category: 'ec2',
    target_type_pattern: 'vpc',
    relationship_type: 'depends_on',
    description: 'Requires VPC',
  },
  {
    property_suffix: 'subnet_id',
    target_category: 'ec2',
    target_type_pattern: 'subnet',
    relationship_type: 'depends_on',
    description: 'Deployed in subnet',
  },
  {
    property_suffix: 'subnetId',
    target_category: 'ec2',
    target_type_pattern: 'subnet',
    relationship_type: 'depends_on',
    description: 'Deployed in subnet',
  },
  {
    property_suffix: 'subnet_ids',
    target_category: 'ec2',
    target_type_pattern: 'subnet',
    relationship_type: 'depends_on',
    description: 'Deployed in subnets',
  },
  {
    property_suffix: 'subnetIds',
    target_category: 'ec2',
    target_type_pattern: 'subnet',
    relationship_type: 'depends_on',
    description: 'Deployed in subnets',
  },
  {
    property_suffix: 'security_group_ids',
    target_category: 'ec2',
    target_type_pattern: 'security',
    relationship_type: 'depends_on',
    description: 'Protected by security groups',
  },
  {
    property_suffix: 'securityGroupIds',
    target_category: 'ec2',
    target_type_pattern: 'security',
    relationship_type: 'depends_on',
    description: 'Protected by security groups',
  },
  {
    property_suffix: 'security_groups',
    target_category: 'ec2',
    target_type_pattern: 'security',
    relationship_type: 'depends_on',
    description: 'Protected by security groups',
  },

  // IAM relationships
  {
    property_suffix: 'role_arn',
    target_category: 'iam',
    target_type_pattern: 'role',
    relationship_type: 'depends_on',
    description: 'Assumes IAM role',
  },
  {
    property_suffix: 'roleArn',
    target_category: 'iam',
    target_type_pattern: 'role',
    relationship_type: 'depends_on',
    description: 'Assumes IAM role',
  },
  {
    property_suffix: 'execution_role_arn',
    target_category: 'iam',
    target_type_pattern: 'role',
    relationship_type: 'depends_on',
    description: 'Uses execution role',
  },
  {
    property_suffix: 'task_role_arn',
    target_category: 'iam',
    target_type_pattern: 'role',
    relationship_type: 'depends_on',
    description: 'Uses task role',
  },
  {
    property_suffix: 'instance_profile',
    target_category: 'iam',
    target_type_pattern: 'instance.*profile',
    relationship_type: 'depends_on',
    description: 'Uses instance profile',
  },
  {
    property_suffix: 'policy_arn',
    target_category: 'iam',
    target_type_pattern: 'policy',
    relationship_type: 'references',
    description: 'References IAM policy',
  },

  // KMS relationships
  {
    property_suffix: 'kms_key_id',
    target_category: 'kms',
    target_type_pattern: 'key',
    relationship_type: 'depends_on',
    description: 'Encrypted with KMS key',
  },
  {
    property_suffix: 'kmsKeyId',
    target_category: 'kms',
    target_type_pattern: 'key',
    relationship_type: 'depends_on',
    description: 'Encrypted with KMS key',
  },
  {
    property_suffix: 'kms_key_arn',
    target_category: 'kms',
    target_type_pattern: 'key',
    relationship_type: 'depends_on',
    description: 'Encrypted with KMS key',
  },

  // S3 relationships
  {
    property_suffix: 'bucket',
    target_category: 's3',
    target_type_pattern: 'bucket',
    relationship_type: 'connects_to',
    description: 'Uses S3 bucket',
  },
  {
    property_suffix: 'bucket_name',
    target_category: 's3',
    target_type_pattern: 'bucket',
    relationship_type: 'connects_to',
    description: 'Uses S3 bucket',
  },
  {
    property_suffix: 's3_bucket',
    target_category: 's3',
    target_type_pattern: 'bucket',
    relationship_type: 'connects_to',
    description: 'Stores in S3 bucket',
  },

  // Lambda relationships
  {
    property_suffix: 'function_name',
    target_category: 'lambda',
    target_type_pattern: 'function',
    relationship_type: 'connects_to',
    description: 'Invokes Lambda function',
  },
  {
    property_suffix: 'function_arn',
    target_category: 'lambda',
    target_type_pattern: 'function',
    relationship_type: 'connects_to',
    description: 'Invokes Lambda function',
  },
  {
    property_suffix: 'lambda_arn',
    target_category: 'lambda',
    target_type_pattern: 'function',
    relationship_type: 'connects_to',
    description: 'Invokes Lambda function',
  },

  // Load Balancer relationships
  {
    property_suffix: 'load_balancer_arn',
    target_category: 'elasticloadbalancing',
    target_type_pattern: 'loadbalancer',
    relationship_type: 'depends_on',
    description: 'Attached to load balancer',
  },
  {
    property_suffix: 'target_group_arn',
    target_category: 'elasticloadbalancing',
    target_type_pattern: 'targetgroup',
    relationship_type: 'depends_on',
    description: 'Registered with target group',
  },

  // RDS relationships
  {
    property_suffix: 'db_subnet_group_name',
    target_category: 'rds',
    target_type_pattern: 'subnetgroup',
    relationship_type: 'depends_on',
    description: 'Uses DB subnet group',
  },
  {
    property_suffix: 'db_parameter_group_name',
    target_category: 'rds',
    target_type_pattern: 'parametergroup',
    relationship_type: 'depends_on',
    description: 'Uses DB parameter group',
  },
  {
    property_suffix: 'db_cluster_identifier',
    target_category: 'rds',
    target_type_pattern: 'cluster',
    relationship_type: 'depends_on',
    description: 'Part of RDS cluster',
  },

  // EKS relationships
  {
    property_suffix: 'cluster_name',
    target_category: 'eks',
    target_type_pattern: 'cluster',
    relationship_type: 'depends_on',
    description: 'Part of EKS cluster',
  },
  {
    property_suffix: 'node_group_name',
    target_category: 'eks',
    target_type_pattern: 'nodegroup',
    relationship_type: 'depends_on',
    description: 'Uses EKS node group',
  },

  // ACM relationships
  {
    property_suffix: 'certificate_arn',
    target_category: 'acm',
    target_type_pattern: 'certificate',
    relationship_type: 'depends_on',
    description: 'Uses ACM certificate',
  },
  {
    property_suffix: 'acm_certificate_arn',
    target_category: 'acm',
    target_type_pattern: 'certificate',
    relationship_type: 'depends_on',
    description: 'Uses ACM certificate',
  },

  // CloudWatch relationships
  {
    property_suffix: 'log_group_name',
    target_category: 'cloudwatch',
    target_type_pattern: 'loggroup',
    relationship_type: 'connects_to',
    description: 'Logs to CloudWatch',
  },
  {
    property_suffix: 'alarm_actions',
    target_category: 'cloudwatch',
    target_type_pattern: 'alarm',
    relationship_type: 'connects_to',
    description: 'Triggers CloudWatch alarm',
  },

  // SNS relationships
  {
    property_suffix: 'topic_arn',
    target_category: 'sns',
    target_type_pattern: 'topic',
    relationship_type: 'connects_to',
    description: 'Publishes to SNS topic',
  },
  {
    property_suffix: 'sns_topic_arn',
    target_category: 'sns',
    target_type_pattern: 'topic',
    relationship_type: 'connects_to',
    description: 'Notifies SNS topic',
  },

  // SQS relationships
  {
    property_suffix: 'queue_url',
    target_category: 'sqs',
    target_type_pattern: 'queue',
    relationship_type: 'connects_to',
    description: 'Sends to SQS queue',
  },
  {
    property_suffix: 'sqs_queue_arn',
    target_category: 'sqs',
    target_type_pattern: 'queue',
    relationship_type: 'connects_to',
    description: 'Connected to SQS queue',
  },

  // DynamoDB relationships
  {
    property_suffix: 'table_name',
    target_category: 'dynamodb',
    target_type_pattern: 'table',
    relationship_type: 'connects_to',
    description: 'Uses DynamoDB table',
  },
  {
    property_suffix: 'dynamodb_table',
    target_category: 'dynamodb',
    target_type_pattern: 'table',
    relationship_type: 'connects_to',
    description: 'Uses DynamoDB table',
  },

  // Route53 relationships
  {
    property_suffix: 'zone_id',
    target_category: 'route53',
    target_type_pattern: 'zone',
    relationship_type: 'depends_on',
    description: 'In Route53 zone',
  },
  {
    property_suffix: 'hosted_zone_id',
    target_category: 'route53',
    target_type_pattern: 'zone',
    relationship_type: 'depends_on',
    description: 'In hosted zone',
  },

  // API Gateway relationships
  {
    property_suffix: 'rest_api_id',
    target_category: 'apigateway',
    target_type_pattern: 'restapi',
    relationship_type: 'depends_on',
    description: 'Part of REST API',
  },
  {
    property_suffix: 'api_id',
    target_category: 'apigateway',
    target_type_pattern: 'api',
    relationship_type: 'depends_on',
    description: 'Part of API',
  },
];

// =============================================================================
// Database Schema
// =============================================================================

const SCHEMA_SQL = fs.readFileSync(path.join(__dirname, '../packages/core/src/schemas/db/schema.sql'), 'utf-8');

// =============================================================================
// Database Builder
// =============================================================================

export class SchemaDatabaseBuilder {
  private db: DatabaseType;
  private verbose: boolean;
  private resource_type_ids: Map<string, number> = new Map();
  private property_ids: Map<string, number> = new Map();

  constructor(db_path: string, verbose: boolean = false) {
    // Remove existing database
    if (fs.existsSync(db_path)) {
      fs.unlinkSync(db_path);
    }

    this.db = new Database(db_path);
    this.verbose = verbose;

    // Configure database
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('synchronous = NORMAL');

    // Create schema
    this.db.exec(SCHEMA_SQL);
  }

  /**
   * Build the database from extraction results
   */
  build(options: Omit<BuildDbOptions, 'output_path'>): void {
    const { unified_types, extraction_results, manifest, detect_relationships = true } = options;

    this.log('Building schema database...');

    // Use transaction for performance
    const build_transaction = this.db.transaction(() => {
      // 1. Insert providers
      this.log('  Inserting providers...');
      this.insert_providers(extraction_results);

      // 2. Insert resource types
      this.log('  Inserting resource types...');
      this.insert_resource_types(unified_types);

      // 3. Insert implementations
      this.log('  Inserting implementations...');
      this.insert_implementations(unified_types);

      // 4. Insert properties
      this.log('  Inserting properties...');
      this.insert_properties(unified_types);

      // 5. Detect and insert relationships
      if (detect_relationships) {
        this.log('  Detecting relationships...');
        this.detect_and_insert_relationships();
      }

      // 6. Detect cross-provider equivalents
      this.log('  Detecting cross-provider equivalents...');
      this.detect_equivalents(unified_types);

      // 7. Update metadata
      this.log('  Updating metadata...');
      this.update_metadata(manifest);
    });

    build_transaction();

    // Optimize database
    this.log('  Optimizing database...');
    this.db.exec('ANALYZE');
    this.db.exec('VACUUM');

    this.log('Database build complete!');
  }

  private insert_providers(results: ExtractionResult[]): void {
    const stmt = this.db.prepare(`
            INSERT OR REPLACE INTO providers (name, namespace, source, version, resource_count, extracted_at)
            VALUES (?, ?, ?, ?, ?, datetime('now'))
        `);

    for (const result of results) {
      if (!result.success) continue;

      const namespace = result.source === 'pulumi' ? 'pulumi' : 'hashicorp';
      stmt.run(
        result.provider.name,
        namespace,
        result.source,
        result.provider.version || null,
        result.resources.length,
      );
    }
  }

  private insert_resource_types(unified_types: UnifiedResourceType[]): void {
    const stmt = this.db.prepare(`
            INSERT INTO resource_types (ice_type, display_name, description, category, source, deprecated, deprecation_message)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `);

    for (const type of unified_types) {
      const result = stmt.run(
        type.ice_type,
        type.display_name,
        type.description || null,
        type.category || 'uncategorized',
        type.implementations[0]?.source || 'pulumi',
        type.deprecated ? 1 : 0,
        type.deprecation_message || null,
      );

      this.resource_type_ids.set(type.ice_type, result.lastInsertRowid as number);
    }
  }

  private insert_implementations(unified_types: UnifiedResourceType[]): void {
    const stmt = this.db.prepare(`
            INSERT OR IGNORE INTO implementations (resource_type_id, source, provider_name, native_type, docs_url, provider_version)
            VALUES (?, ?, ?, ?, ?, ?)
        `);

    for (const type of unified_types) {
      const resource_type_id = this.resource_type_ids.get(type.ice_type);
      if (!resource_type_id) continue;

      // Deduplicate implementations by (source, provider_name)
      const seen = new Set<string>();
      for (const impl of type.implementations) {
        const key = `${impl.source}:${impl.provider_name}`;
        if (seen.has(key)) continue;
        seen.add(key);

        stmt.run(
          resource_type_id,
          impl.source,
          impl.provider_name,
          impl.resource_type,
          impl.documentation_url || null,
          null, // provider_version not available in current structure
        );
      }
    }
  }

  private insert_properties(unified_types: UnifiedResourceType[]): void {
    const prop_stmt = this.db.prepare(`
            INSERT INTO properties (resource_type_id, name, type, description, required, computed, sensitive, deprecated, default_value, parent_property_id, element_type, sort_order)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

    const validation_stmt = this.db.prepare(`
            INSERT INTO property_validations (property_id, pattern, min_value, max_value, min_length, max_length, min_items, max_items)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);

    const enum_stmt = this.db.prepare(`
            INSERT INTO property_enum_values (property_id, value)
            VALUES (?, ?)
        `);

    for (const type of unified_types) {
      const resource_type_id = this.resource_type_ids.get(type.ice_type);
      if (!resource_type_id) continue;

      let sort_order = 0;
      for (const prop of type.properties) {
        this.insert_property_recursive(
          prop,
          resource_type_id,
          null,
          sort_order++,
          type.ice_type,
          prop_stmt,
          validation_stmt,
          enum_stmt,
        );
      }
    }
  }

  private insert_property_recursive(
    prop: PropertyDefinition,
    resource_type_id: number,
    parent_property_id: number | null,
    sort_order: number,
    ice_type: string,
    prop_stmt: ReturnType<DatabaseType['prepare']>,
    validation_stmt: ReturnType<DatabaseType['prepare']>,
    enum_stmt: ReturnType<DatabaseType['prepare']>,
  ): void {
    const result = prop_stmt.run(
      resource_type_id,
      prop.name,
      prop.type,
      prop.description || null,
      prop.required ? 1 : 0,
      prop.computed ? 1 : 0,
      prop.sensitive ? 1 : 0,
      prop.deprecated ? 1 : 0,
      prop.default_value !== undefined ? JSON.stringify(prop.default_value) : null,
      parent_property_id,
      prop.element_type || null,
      sort_order,
    );

    const property_id = result.lastInsertRowid as number;
    this.property_ids.set(`${ice_type}.${prop.name}`, property_id);

    // Insert validation rules
    if (prop.validation) {
      validation_stmt.run(
        property_id,
        prop.validation.pattern || null,
        prop.validation.min ?? prop.validation.minimum ?? null,
        prop.validation.max ?? prop.validation.maximum ?? null,
        prop.validation.min_length ?? null,
        prop.validation.max_length ?? null,
        prop.validation.min_items ?? null,
        prop.validation.max_items ?? null,
      );

      // Insert enum values
      if (prop.validation.enum_values) {
        for (const value of prop.validation.enum_values) {
          enum_stmt.run(property_id, String(value));
        }
      }
    }

    // Insert nested properties
    if (prop.nested_properties) {
      let nested_order = 0;
      for (const nested of prop.nested_properties) {
        this.insert_property_recursive(
          nested,
          resource_type_id,
          property_id,
          nested_order++,
          ice_type,
          prop_stmt,
          validation_stmt,
          enum_stmt,
        );
      }
    }
  }

  private detect_and_insert_relationships(): void {
    const rel_stmt = this.db.prepare(`
            INSERT OR IGNORE INTO resource_relationships (source_type_id, target_type_id, relationship_type, property_name, cardinality, description, confidence, inferred, source)
            VALUES (?, ?, ?, ?, ?, ?, ?, 1, 'auto')
        `);

    // Get all resource types with their properties
    const resources = this.db
      .prepare(
        `
            SELECT rt.id, rt.ice_type, rt.category,
                   GROUP_CONCAT(p.name, ',') as property_names
            FROM resource_types rt
            LEFT JOIN properties p ON rt.id = p.resource_type_id AND p.parent_property_id IS NULL
            GROUP BY rt.id
        `,
      )
      .all() as Array<{
      id: number;
      ice_type: string;
      category: string;
      property_names: string | null;
    }>;

    // Build category index for target lookup
    const by_category = new Map<string, Array<{ id: number; ice_type: string }>>();
    for (const res of resources) {
      const cat = res.category.toLowerCase();
      const existing = by_category.get(cat) || [];
      existing.push({ id: res.id, ice_type: res.ice_type });
      by_category.set(cat, existing);
    }

    let relationship_count = 0;

    for (const resource of resources) {
      if (!resource.property_names) continue;

      const properties = resource.property_names.split(',');

      for (const prop_name of properties) {
        for (const pattern of RELATIONSHIP_PATTERNS) {
          if (this.matches_pattern(prop_name, pattern.property_suffix)) {
            // Find target resources
            const targets = by_category.get(pattern.target_category) || [];
            const matching_targets = targets.filter((t) =>
              new RegExp(pattern.target_type_pattern, 'i').test(t.ice_type),
            );

            for (const target of matching_targets) {
              if (target.id === resource.id) continue; // Skip self-references

              const cardinality = prop_name.endsWith('s') || prop_name.includes('ids') ? 'many' : 'one';

              rel_stmt.run(
                resource.id,
                target.id,
                pattern.relationship_type,
                prop_name,
                cardinality,
                pattern.description,
                0.9, // High confidence for pattern-based detection
              );
              relationship_count++;
            }
          }
        }
      }
    }

    this.log(`    Detected ${relationship_count} relationships`);
  }

  private matches_pattern(property_name: string, suffix: string): boolean {
    const normalized_prop = property_name.toLowerCase().replace(/_/g, '');
    const normalized_suffix = suffix.toLowerCase().replace(/_/g, '');
    return normalized_prop.endsWith(normalized_suffix) || normalized_prop === normalized_suffix;
  }

  private detect_equivalents(unified_types: UnifiedResourceType[]): void {
    const equiv_stmt = this.db.prepare(`
            INSERT OR IGNORE INTO resource_relationships (source_type_id, target_type_id, relationship_type, description, confidence, inferred, source)
            VALUES (?, ?, 'equivalent_to', 'Cross-provider equivalent', ?, 1, 'auto')
        `);

    // Group types by normalized name to find equivalents
    const normalized_groups = new Map<string, number[]>();

    for (const type of unified_types) {
      // Normalize: remove provider prefix, lowercase
      const normalized = this.normalize_type_name(type.ice_type);
      const type_id = this.resource_type_ids.get(type.ice_type);
      if (!type_id) continue;

      const existing = normalized_groups.get(normalized) || [];
      existing.push(type_id);
      normalized_groups.set(normalized, existing);
    }

    let equiv_count = 0;

    // Create equivalence relationships
    for (const [_, type_ids] of normalized_groups) {
      if (type_ids.length < 2) continue;

      // Link all pairs
      for (let i = 0; i < type_ids.length; i++) {
        for (let j = i + 1; j < type_ids.length; j++) {
          equiv_stmt.run(type_ids[i], type_ids[j], 0.8);
          equiv_count++;
        }
      }
    }

    this.log(`    Detected ${equiv_count} cross-provider equivalents`);
  }

  private normalize_type_name(ice_type: string): string {
    // Remove provider prefix (aws., gcp., azure., etc.)
    const parts = ice_type.split('.');
    if (parts.length >= 2) {
      // Return category.resource (e.g., ec2.instance)
      return parts.slice(1).join('.').toLowerCase();
    }
    return ice_type.toLowerCase();
  }

  private update_metadata(manifest: SchemaManifest): void {
    const stmt = this.db.prepare(`
            INSERT OR REPLACE INTO schema_metadata (key, value, updated_at)
            VALUES (?, ?, datetime('now'))
        `);

    const counts = this.db
      .prepare(
        `
            SELECT
                (SELECT COUNT(*) FROM resource_types) as resources,
                (SELECT COUNT(*) FROM implementations) as implementations,
                (SELECT COUNT(*) FROM resource_relationships) as relationships,
                (SELECT COUNT(*) FROM properties) as properties
        `,
      )
      .get() as {
      resources: number;
      implementations: number;
      relationships: number;
      properties: number;
    };

    stmt.run('schema_version', manifest.version || '1.0.0');
    stmt.run('generated_at', manifest.generated_at || new Date().toISOString());
    stmt.run('total_resource_types', String(counts.resources));
    stmt.run('total_implementations', String(counts.implementations));
    stmt.run('total_relationships', String(counts.relationships));
    stmt.run('total_properties', String(counts.properties));
  }

  private log(message: string): void {
    if (this.verbose) {
      console.log(message);
    }
  }

  /**
   * Close the database connection
   */
  close(): void {
    this.db.close();
  }
}

// =============================================================================
// Main Function
// =============================================================================

export async function build_schema_database(options: BuildDbOptions): Promise<void> {
  const builder = new SchemaDatabaseBuilder(options.output_path, options.verbose);

  try {
    builder.build({
      unified_types: options.unified_types,
      extraction_results: options.extraction_results,
      manifest: options.manifest,
      detect_relationships: options.detect_relationships ?? true,
    });
  } finally {
    builder.close();
  }
}

// =============================================================================
// CLI Entry Point
// =============================================================================

// Check if running as main module (ES module equivalent of require.main === module)
const isMainModule = import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('build-schema-db.ts');

if (isMainModule) {
  // Standalone execution - load from existing JSON files
  const args = process.argv.slice(2);
  const output_path = args[0] || './packages/schemas/data/ice-schemas.db';
  const generated_dir = './packages/schemas/src/generated';

  console.log('Building schema database from existing JSON files...\n');

  // Load unified types
  const unified_types_path = path.join(generated_dir, 'unified-types.json');
  if (!fs.existsSync(unified_types_path)) {
    console.error(`Error: ${unified_types_path} not found. Run build-schemas.ts first.`);
    process.exit(1);
  }

  const unified_types = JSON.parse(fs.readFileSync(unified_types_path, 'utf-8'));

  // Load manifest
  const manifest_path = path.join(generated_dir, 'manifest.json');
  const manifest = fs.existsSync(manifest_path)
    ? JSON.parse(fs.readFileSync(manifest_path, 'utf-8'))
    : { version: '1.0.0', generated_at: new Date().toISOString() };

  // Ensure output directory exists
  const output_dir = path.dirname(output_path);
  if (!fs.existsSync(output_dir)) {
    fs.mkdirSync(output_dir, { recursive: true });
  }

  build_schema_database({
    output_path,
    unified_types,
    extraction_results: [], // No raw results when building from JSON
    manifest,
    detect_relationships: true,
    verbose: true,
  })
    .then(() => {
      console.log(`\nDatabase written to: ${output_path}`);
      const stats = fs.statSync(output_path);
      console.log(`Database size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
    })
    .catch((error) => {
      console.error('Build failed:', error);
      process.exit(1);
    });
}
