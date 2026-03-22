/**
 * AWS Importer Type Definitions
 */

/**
 * A discovered AWS resource.
 */
export interface AWSResource {
  readonly arn: string;
  readonly name: string;
  readonly resource_type: string;
  readonly region: string;
  readonly account_id: string;
  readonly properties: Record<string, unknown>;
  readonly tags?: Record<string, string>;
}

/**
 * AWS service type enumeration.
 */
export type AWSServiceType =
  | 'all'
  | 'ec2'
  | 's3'
  | 'rds'
  | 'lambda'
  | 'iam'
  | 'dynamodb'
  | 'ecs'
  | 'eks'
  | 'cloudfront'
  | 'route53'
  | 'sns'
  | 'sqs';

/**
 * Options for AWS import.
 */
export interface AWSImportOptions {
  /** AWS regions to scan (empty = all regions) */
  readonly regions?: string[];

  /** AWS profile to use */
  readonly profile?: string;

  /** Services to scan (empty = all via Resource Explorer) */
  readonly services?: AWSServiceType[];

  /** Only import resources matching these ICE types */
  readonly filter_types?: string[];

  /** Exclude resources matching these ICE types */
  readonly exclude_types?: string[];

  /** Only import resources with these tags */
  readonly filter_tags?: Record<string, string>;

  /** Whether to infer dependencies (default: true) */
  readonly infer_dependencies?: boolean;
}

/**
 * Result of importing AWS resources.
 */
export interface AWSImportResult {
  readonly success: boolean;
  readonly resources: AWSImportedResource[];
  readonly errors: AWSImportError[];
  readonly warnings: AWSImportWarning[];
  readonly metadata: AWSImportMetadata;
}

/**
 * Imported resource from AWS.
 */
export interface AWSImportedResource {
  readonly aws_arn: string;
  readonly aws_type: string;
  readonly ice_type: string;
  readonly name: string;
  readonly properties: Record<string, unknown>;
  readonly dependencies: string[];
  readonly provider: 'aws';
  readonly account_id: string;
  readonly region: string;
  readonly tags: Record<string, string>;
}

/**
 * Import error.
 */
export interface AWSImportError {
  readonly code: string;
  readonly message: string;
  readonly service?: string;
  readonly resource?: string;
  /** Action type for recovery */
  readonly action?: string;
  /** CLI command for recovery */
  readonly command?: string;
  /** URL for more information */
  readonly help_url?: string;
}

/**
 * Import warning.
 */
export interface AWSImportWarning {
  readonly code: string;
  readonly message: string;
  readonly service?: string;
  readonly resource?: string;
}

/**
 * Import metadata.
 */
export interface AWSImportMetadata {
  readonly account_id: string;
  readonly regions: string[];
  readonly services_scanned: string[];
  readonly resource_count: number;
  readonly imported_at: string;
  readonly duration_ms: number;
}
