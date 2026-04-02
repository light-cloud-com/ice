/**
 * Relationship Inferrer
 *
 * Infers data flow relationships between resources by analyzing:
 * - Terraform references
 * - Environment variables (connection strings)
 * - IAM policies (access grants)
 * - Security group rules (network access)
 */

import type { Node, NodeId, EdgeRelationship, InferenceConfidence, InferenceSource } from '../../types/graph.js';

// =============================================================================
// Types
// =============================================================================

/**
 * An inferred relationship between two resources.
 */
export interface InferredRelationship {
  /** Source node ID */
  source: NodeId;
  /** Target node ID */
  target: NodeId;
  /** Relationship type (always 'talks_to' for inferred) */
  relationship: EdgeRelationship;
  /** Confidence level */
  confidence: InferenceConfidence;
  /** Source of the inference */
  inference_source: InferenceSource;
  /** Human-readable evidence */
  evidence: string;
  /** Security rule label if applicable */
  security_rule?: string;
}

/**
 * Options for relationship inference.
 */
export interface InferenceOptions {
  /** Enable Terraform reference scanning */
  terraform_references?: boolean;
  /** Enable environment variable scanning */
  environment_variables?: boolean;
  /** Enable IAM policy analysis */
  iam_policies?: boolean;
  /** Enable security group rule analysis */
  security_groups?: boolean;
  /** Minimum confidence level to include */
  min_confidence?: InferenceConfidence;
}

const DEFAULT_OPTIONS: InferenceOptions = {
  terraform_references: true,
  environment_variables: true,
  iam_policies: true,
  security_groups: true,
  min_confidence: 'low',
};

// =============================================================================
// Inference Patterns
// =============================================================================

/**
 * Environment variable patterns that indicate data connections.
 */
const ENV_VAR_PATTERNS = [
  // Database connection strings
  { pattern: /DATABASE_URL|DB_HOST|DB_CONNECTION/i, target_category: 'Database' },
  { pattern: /REDIS_URL|REDIS_HOST|CACHE_URL/i, target_category: 'Database.Redis' },
  { pattern: /POSTGRES_URL|PG_HOST/i, target_category: 'Database.PostgreSQL' },
  { pattern: /MYSQL_URL|MYSQL_HOST/i, target_category: 'Database.MySQL' },
  { pattern: /MONGO_URL|MONGODB_URI/i, target_category: 'Database.MongoDB' },
  // Storage
  { pattern: /S3_BUCKET|GCS_BUCKET|STORAGE_BUCKET/i, target_category: 'Storage' },
  // Messaging
  { pattern: /SQS_URL|QUEUE_URL|RABBITMQ_URL/i, target_category: 'Messaging' },
  { pattern: /KAFKA_BROKERS|KAFKA_URL/i, target_category: 'Messaging.Kafka' },
  { pattern: /PUBSUB_TOPIC|SNS_TOPIC/i, target_category: 'Messaging.Topic' },
];

/**
 * IAM action patterns that indicate data access.
 */
const IAM_ACTION_PATTERNS = [
  // Database access
  { pattern: /rds:(Connect|Describe|Read)/i, implies: 'Database' },
  { pattern: /dynamodb:(GetItem|Query|Scan|PutItem)/i, implies: 'Database.DynamoDB' },
  // Storage access
  { pattern: /s3:(GetObject|PutObject|ListBucket)/i, implies: 'Storage' },
  // Messaging
  { pattern: /sqs:(SendMessage|ReceiveMessage)/i, implies: 'Messaging.Queue' },
  { pattern: /sns:(Publish|Subscribe)/i, implies: 'Messaging.Topic' },
];

// =============================================================================
// RelationshipInferrer Class
// =============================================================================

/**
 * Infers relationships between resources in a graph.
 */
export class RelationshipInferrer {
  private nodes: Map<NodeId, Node>;
  private options: InferenceOptions;

  constructor(nodes: Map<NodeId, Node>, options: Partial<InferenceOptions> = {}) {
    this.nodes = nodes;
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Infer all relationships in the graph.
   */
  infer_all(): InferredRelationship[] {
    const relationships: InferredRelationship[] = [];

    if (this.options.terraform_references) {
      relationships.push(...this.infer_from_terraform_references());
    }

    if (this.options.environment_variables) {
      relationships.push(...this.infer_from_environment_variables());
    }

    if (this.options.iam_policies) {
      relationships.push(...this.infer_from_iam_policies());
    }

    if (this.options.security_groups) {
      relationships.push(...this.infer_from_security_groups());
    }

    // Filter by minimum confidence
    return this.filter_by_confidence(relationships);
  }

  /**
   * Infer relationships from Terraform references.
   * High confidence - direct code references.
   */
  private infer_from_terraform_references(): InferredRelationship[] {
    const relationships: InferredRelationship[] = [];

    for (const [sourceId, sourceNode] of this.nodes) {
      const properties = sourceNode.properties as Record<string, unknown>;

      // Look for reference patterns in properties
      for (const [key, value] of Object.entries(properties)) {
        if (typeof value === 'string' && value.includes('.')) {
          // Check if this references another resource
          const targetNode = this.find_node_by_reference(value);
          if (targetNode && targetNode.id !== sourceId) {
            relationships.push({
              source: sourceId,
              target: targetNode.id,
              relationship: 'talks_to',
              confidence: 'high',
              inference_source: 'terraform_reference',
              evidence: `Property "${key}" references ${targetNode.name}`,
            });
          }
        }
      }
    }

    return relationships;
  }

  /**
   * Infer relationships from environment variables.
   * High confidence - explicit connection configuration.
   */
  private infer_from_environment_variables(): InferredRelationship[] {
    const relationships: InferredRelationship[] = [];

    for (const [sourceId, sourceNode] of this.nodes) {
      // Only compute resources have env vars
      if (!this.is_compute_resource(sourceNode)) continue;

      const properties = sourceNode.properties as Record<string, unknown>;
      const envVars = this.extract_env_vars(properties);

      for (const [envName, envValue] of Object.entries(envVars)) {
        // Check for connection string patterns
        for (const pattern of ENV_VAR_PATTERNS) {
          if (pattern.pattern.test(envName)) {
            // Find target resource by value or type
            const targetNode = this.find_target_by_env_value(envValue, pattern.target_category);
            if (targetNode && targetNode.id !== sourceId) {
              relationships.push({
                source: sourceId,
                target: targetNode.id,
                relationship: 'talks_to',
                confidence: 'high',
                inference_source: 'environment_variable',
                evidence: `Env var "${envName}" connects to ${targetNode.name}`,
              });
            }
          }
        }
      }
    }

    return relationships;
  }

  /**
   * Infer relationships from IAM policies.
   * High confidence - explicit access grants.
   */
  private infer_from_iam_policies(): InferredRelationship[] {
    const relationships: InferredRelationship[] = [];

    for (const [sourceId, sourceNode] of this.nodes) {
      // Look for IAM role attachments or policies
      const properties = sourceNode.properties as Record<string, unknown>;

      // Check for inline policies or policy attachments
      const policies = this.extract_policies(properties);

      for (const policy of policies) {
        for (const pattern of IAM_ACTION_PATTERNS) {
          if (pattern.pattern.test(policy.action)) {
            // Find target resource by ARN or type
            const targetNode = this.find_target_by_arn(policy.resource, pattern.implies);
            if (targetNode && targetNode.id !== sourceId) {
              relationships.push({
                source: sourceId,
                target: targetNode.id,
                relationship: 'talks_to',
                confidence: 'high',
                inference_source: 'iam_policy',
                evidence: `IAM policy grants "${policy.action}" on ${targetNode.name}`,
              });
            }
          }
        }
      }
    }

    return relationships;
  }

  /**
   * Infer relationships from security group rules.
   * Medium confidence - allows but doesn't prove communication.
   */
  private infer_from_security_groups(): InferredRelationship[] {
    const relationships: InferredRelationship[] = [];

    // Find all security groups
    const securityGroups = this.find_security_groups();

    for (const sg of securityGroups) {
      const properties = sg.properties as Record<string, unknown>;
      const rules = this.extract_security_rules(properties);

      for (const rule of rules) {
        // Find resources that use this security group as source
        const sourceResources = this.find_resources_with_security_group(sg.id);

        // Find resources that could be the target (based on ports/protocols)
        const targetResources = this.find_resources_by_port(rule.port, rule.protocol);

        for (const source of sourceResources) {
          for (const target of targetResources) {
            if (source.id !== target.id) {
              relationships.push({
                source: source.id,
                target: target.id,
                relationship: 'talks_to',
                confidence: 'medium',
                inference_source: 'security_group',
                evidence: `Security group allows ${rule.protocol}/${rule.port}`,
                security_rule: `allow ${rule.port}/${rule.protocol}`,
              });
            }
          }
        }
      }
    }

    return relationships;
  }

  // ---------------------------------------------------------------------------
  // Helper Methods
  // ---------------------------------------------------------------------------

  private is_compute_resource(node: Node): boolean {
    return node.type.startsWith('Compute.') || node.type.startsWith('Compute.');
  }

  private find_node_by_reference(reference: string): Node | undefined {
    // Try to match by name or ID pattern
    for (const [, node] of this.nodes) {
      if (reference.includes(node.name) || reference.includes(node.id)) {
        return node;
      }
    }
    return undefined;
  }

  private extract_env_vars(properties: Record<string, unknown>): Record<string, string> {
    const envVars: Record<string, string> = {};

    // Check common env var property names
    const envProps = ['environment', 'env', 'environment_variables', 'envVars'];
    for (const prop of envProps) {
      if (properties[prop] && typeof properties[prop] === 'object') {
        Object.assign(envVars, properties[prop]);
      }
    }

    return envVars;
  }

  private find_target_by_env_value(value: string, targetCategory: string): Node | undefined {
    // First try to match by name/id in the value
    for (const [, node] of this.nodes) {
      if (value.includes(node.name) || value.includes(node.id)) {
        return node;
      }
    }

    // Fall back to first matching resource of the target category
    for (const [, node] of this.nodes) {
      if (node.type.startsWith(targetCategory)) {
        return node;
      }
    }

    return undefined;
  }

  private extract_policies(properties: Record<string, unknown>): Array<{ action: string; resource: string }> {
    const policies: Array<{ action: string; resource: string }> = [];

    // Check for policy documents
    const policyDoc = properties['policy'] || properties['inline_policy'] || properties['assume_role_policy'];
    if (policyDoc && typeof policyDoc === 'object') {
      const doc = policyDoc as Record<string, unknown>;
      const statements = (doc['Statement'] || doc['statements'] || []) as Array<Record<string, unknown>>;

      for (const stmt of statements) {
        const actions = Array.isArray(stmt['Action']) ? stmt['Action'] : [stmt['Action']];
        const resources = Array.isArray(stmt['Resource']) ? stmt['Resource'] : [stmt['Resource']];

        for (const action of actions) {
          for (const resource of resources) {
            if (typeof action === 'string' && typeof resource === 'string') {
              policies.push({ action, resource });
            }
          }
        }
      }
    }

    return policies;
  }

  private find_target_by_arn(arn: string, implies: string): Node | undefined {
    // Try to match by ARN pattern
    for (const [, node] of this.nodes) {
      const nodeArn = (node.properties as Record<string, unknown>)['arn'] as string;
      if (nodeArn && arn.includes(nodeArn)) {
        return node;
      }
      // Check if ARN contains node name
      if (arn.includes(node.name)) {
        return node;
      }
    }

    // Fall back to first matching resource type
    for (const [, node] of this.nodes) {
      if (node.type.startsWith(implies)) {
        return node;
      }
    }

    return undefined;
  }

  private find_security_groups(): Node[] {
    return Array.from(this.nodes.values()).filter((node) => node.type === 'Security.SecurityGroup');
  }

  private extract_security_rules(properties: Record<string, unknown>): Array<{ port: number; protocol: string }> {
    const rules: Array<{ port: number; protocol: string }> = [];

    // Check for ingress/egress rules
    const ruleProps = ['ingress', 'egress', 'inbound_rules', 'outbound_rules'];
    for (const prop of ruleProps) {
      const ruleList = properties[prop] as Array<Record<string, unknown>> | undefined;
      if (Array.isArray(ruleList)) {
        for (const rule of ruleList) {
          const port = rule['from_port'] || rule['port'] || rule['to_port'];
          const protocol = rule['protocol'] || 'tcp';
          if (typeof port === 'number' && typeof protocol === 'string') {
            rules.push({ port, protocol });
          }
        }
      }
    }

    return rules;
  }

  private find_resources_with_security_group(sgId: NodeId): Node[] {
    return Array.from(this.nodes.values()).filter((node) => {
      const props = node.properties as Record<string, unknown>;
      const securityGroups = props['security_groups'] || props['vpc_security_group_ids'] || [];
      return Array.isArray(securityGroups) && securityGroups.includes(sgId);
    });
  }

  private find_resources_by_port(port: number, _protocol: string): Node[] {
    // Map common ports to resource types
    const portToType: Record<number, string[]> = {
      5432: ['Database.PostgreSQL'],
      3306: ['Database.MySQL'],
      27017: ['Database.MongoDB'],
      6379: ['Database.Redis'],
      443: ['Network.LoadBalancer', 'Network.Gateway'],
      80: ['Network.LoadBalancer', 'Network.Gateway'],
    };

    const targetTypes = portToType[port] || [];
    return Array.from(this.nodes.values()).filter((node) =>
      targetTypes.some((t) => node.type === t || node.type.startsWith(t)),
    );
  }

  private filter_by_confidence(relationships: InferredRelationship[]): InferredRelationship[] {
    const confidenceLevels: Record<InferenceConfidence, number> = {
      high: 3,
      medium: 2,
      low: 1,
    };

    const minLevel = confidenceLevels[this.options.min_confidence || 'low'];
    return relationships.filter((r) => confidenceLevels[r.confidence] >= minLevel);
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a relationship inferrer for a set of nodes.
 */
export function create_relationship_inferrer(
  nodes: Map<NodeId, Node>,
  options?: Partial<InferenceOptions>,
): RelationshipInferrer {
  return new RelationshipInferrer(nodes, options);
}

/**
 * Infer all relationships in a node map.
 */
export function infer_relationships(
  nodes: Map<NodeId, Node>,
  options?: Partial<InferenceOptions>,
): InferredRelationship[] {
  const inferrer = create_relationship_inferrer(nodes, options);
  return inferrer.infer_all();
}
