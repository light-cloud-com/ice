/**
 * Tests for AWS AI / analytics extractors.
 */

import { describe, it, expect } from 'vitest';
import {
  extract_opensearch_domain_properties,
  extract_bedrock_endpoint_properties,
  extract_sagemaker_endpoint_properties,
  extract_redshift_cluster_properties,
} from '../ai';

describe('extract_opensearch_domain_properties', () => {
  it('defaults to OpenSearch 2.13 on a single t3.small.search instance', () => {
    expect(extract_opensearch_domain_properties({}, 'us-east-1')).toMatchObject({
      region: 'us-east-1',
      engine_version: 'OpenSearch_2.13',
      instance_type: 't3.small.search',
      instance_count: 1,
      dedicated_master_enabled: false,
      ebs_enabled: true,
      ebs_volume_type: 'gp3',
      ebs_volume_size_gb: 10,
      encryption_at_rest: true,
      node_to_node_encryption: true,
    });
  });

  it('honours production-sized overrides (3 nodes + dedicated master)', () => {
    const result = extract_opensearch_domain_properties(
      {
        instance_count: 3,
        instance_type: 'r6g.large.search',
        dedicated_master_enabled: true,
        dedicated_master_type: 'r6g.large.search',
        dedicated_master_count: 3,
      },
      'eu-west-1',
    );
    expect(result.instance_count).toBe(3);
    expect(result.dedicated_master_enabled).toBe(true);
    expect(result.dedicated_master_count).toBe(3);
  });
});

describe('extract_bedrock_endpoint_properties', () => {
  it('defaults to Claude 3 Haiku, on-demand (zero model units)', () => {
    expect(extract_bedrock_endpoint_properties({}, 'us-east-1')).toMatchObject({
      region: 'us-east-1',
      model_id: 'anthropic.claude-3-haiku-20240307-v1:0',
      model_units: 0,
      commitment_duration: 'OneMonth',
    });
  });

  it('emits provisioned-throughput config when model_units > 0', () => {
    const result = extract_bedrock_endpoint_properties(
      { model_units: 5, commitment_duration: 'SixMonths' },
      'us-east-1',
    );
    expect(result.model_units).toBe(5);
    expect(result.commitment_duration).toBe('SixMonths');
  });
});

describe('extract_sagemaker_endpoint_properties', () => {
  it('defaults to a real-time ml.t2.medium endpoint', () => {
    expect(extract_sagemaker_endpoint_properties({}, 'us-east-1')).toMatchObject({
      region: 'us-east-1',
      model_name: '',
      instance_type: 'ml.t2.medium',
      initial_instance_count: 1,
      initial_variant_weight: 1.0,
      endpoint_mode: 'real-time',
    });
  });

  it('passes endpoint_mode + instance_type overrides through', () => {
    const result = extract_sagemaker_endpoint_properties(
      { endpoint_mode: 'serverless', instance_type: 'ml.g4dn.xlarge', initial_instance_count: 2 },
      'us-east-1',
    );
    expect(result.endpoint_mode).toBe('serverless');
    expect(result.instance_type).toBe('ml.g4dn.xlarge');
    expect(result.initial_instance_count).toBe(2);
  });
});

describe('extract_redshift_cluster_properties', () => {
  it('defaults to a single-node dc2.large with no password', () => {
    expect(extract_redshift_cluster_properties({}, 'us-east-1')).toMatchObject({
      region: 'us-east-1',
      node_type: 'dc2.large',
      cluster_type: 'single-node',
      number_of_nodes: 1,
      db_name: 'analytics',
      master_username: 'admin',
      master_user_password: '',
      publicly_accessible: false,
      encrypted: true,
      port: 5439,
    });
  });

  it('honours production-sized overrides (ra3 multi-node)', () => {
    const result = extract_redshift_cluster_properties(
      { node_type: 'ra3.xlplus', cluster_type: 'multi-node', number_of_nodes: 3 },
      'us-east-1',
    );
    expect(result.node_type).toBe('ra3.xlplus');
    expect(result.cluster_type).toBe('multi-node');
    expect(result.number_of_nodes).toBe(3);
  });
});
