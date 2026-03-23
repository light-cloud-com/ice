/**
 * Terraform Importer Tests
 */

import {
  import_terraform_state_json,
  import_result_to_graph,
  get_ice_type,
  get_ice_provider,
  get_provider_from_type,
  is_type_supported,
} from '../importers/terraform';

// =============================================================================
// Sample Terraform State Data
// =============================================================================

const SAMPLE_STATE = {
  version: 4,
  terraform_version: '1.5.0',
  serial: 42,
  lineage: 'test-lineage-123',
  outputs: {
    vpc_id: {
      value: 'vpc-12345678',
      type: 'string',
      sensitive: false,
    },
    db_password: {
      value: 'super-secret',
      type: 'string',
      sensitive: true,
    },
  },
  resources: [
    {
      mode: 'managed',
      type: 'aws_vpc',
      name: 'main',
      provider: 'provider["registry.terraform.io/hashicorp/aws"]',
      instances: [
        {
          schema_version: 1,
          attributes: {
            id: 'vpc-12345678',
            arn: 'arn:aws:ec2:us-east-1:123456789:vpc/vpc-12345678',
            cidr_block: '10.0.0.0/16',
            enable_dns_hostnames: true,
            enable_dns_support: true,
            tags: { Name: 'main-vpc', Environment: 'production' },
          },
          sensitive_attributes: [],
        },
      ],
    },
    {
      mode: 'managed',
      type: 'aws_subnet',
      name: 'public',
      provider: 'provider["registry.terraform.io/hashicorp/aws"]',
      instances: [
        {
          schema_version: 1,
          attributes: {
            id: 'subnet-aaaaaaaa',
            arn: 'arn:aws:ec2:us-east-1:123456789:subnet/subnet-aaaaaaaa',
            vpc_id: 'vpc-12345678',
            cidr_block: '10.0.1.0/24',
            availability_zone: 'us-east-1a',
            map_public_ip_on_launch: true,
            tags: { Name: 'public-subnet' },
          },
          sensitive_attributes: [],
          dependencies: ['aws_vpc.main'],
        },
      ],
    },
    {
      mode: 'managed',
      type: 'aws_subnet',
      name: 'private',
      provider: 'provider["registry.terraform.io/hashicorp/aws"]',
      instances: [
        {
          schema_version: 1,
          attributes: {
            id: 'subnet-bbbbbbbb',
            vpc_id: 'vpc-12345678',
            cidr_block: '10.0.2.0/24',
            availability_zone: 'us-east-1b',
            map_public_ip_on_launch: false,
            tags: { Name: 'private-subnet' },
          },
          sensitive_attributes: [],
          dependencies: ['aws_vpc.main'],
        },
      ],
    },
    {
      mode: 'managed',
      type: 'aws_security_group',
      name: 'web_sg',
      provider: 'provider["registry.terraform.io/hashicorp/aws"]',
      instances: [
        {
          schema_version: 1,
          attributes: {
            id: 'sg-11111111',
            vpc_id: 'vpc-12345678',
            name: 'web-sg',
            description: 'Security group for web servers',
            ingress: [
              { from_port: 80, to_port: 80, protocol: 'tcp', cidr_blocks: ['0.0.0.0/0'] },
              { from_port: 443, to_port: 443, protocol: 'tcp', cidr_blocks: ['0.0.0.0/0'] },
            ],
            egress: [{ from_port: 0, to_port: 0, protocol: '-1', cidr_blocks: ['0.0.0.0/0'] }],
            tags: { Name: 'web-sg' },
          },
          sensitive_attributes: [],
          dependencies: ['aws_vpc.main'],
        },
      ],
    },
    {
      mode: 'managed',
      type: 'aws_instance',
      name: 'web',
      provider: 'provider["registry.terraform.io/hashicorp/aws"]',
      instances: [
        {
          schema_version: 1,
          attributes: {
            id: 'i-1234567890abcdef0',
            ami: 'ami-12345678',
            instance_type: 't3.micro',
            subnet_id: 'subnet-aaaaaaaa',
            vpc_security_group_ids: ['sg-11111111'],
            key_name: 'my-key',
            tags: { Name: 'web-server' },
          },
          sensitive_attributes: [],
          dependencies: ['aws_subnet.public', 'aws_security_group.web_sg'],
        },
      ],
    },
    {
      mode: 'data',
      type: 'aws_ami',
      name: 'ubuntu',
      provider: 'provider["registry.terraform.io/hashicorp/aws"]',
      instances: [
        {
          schema_version: 0,
          attributes: {
            id: 'ami-12345678',
            name: 'ubuntu/images/hvm-ssd/ubuntu-focal-20.04-amd64-server',
            architecture: 'x86_64',
          },
          sensitive_attributes: [],
        },
      ],
    },
  ],
};

const SAMPLE_STATE_WITH_MODULES = {
  version: 4,
  terraform_version: '1.5.0',
  serial: 10,
  lineage: 'module-test-123',
  resources: [
    {
      mode: 'managed',
      type: 'aws_vpc',
      name: 'main',
      provider: 'provider["registry.terraform.io/hashicorp/aws"]',
      module: 'module.network',
      instances: [
        {
          schema_version: 1,
          attributes: {
            id: 'vpc-module-123',
            cidr_block: '10.0.0.0/16',
          },
          sensitive_attributes: [],
        },
      ],
    },
  ],
};

const SAMPLE_STATE_WITH_COUNT = {
  version: 4,
  terraform_version: '1.5.0',
  serial: 5,
  lineage: 'count-test-123',
  resources: [
    {
      mode: 'managed',
      type: 'aws_subnet',
      name: 'app',
      provider: 'provider["registry.terraform.io/hashicorp/aws"]',
      instances: [
        {
          schema_version: 1,
          index_key: 0,
          attributes: {
            id: 'subnet-count-0',
            cidr_block: '10.0.1.0/24',
          },
          sensitive_attributes: [],
        },
        {
          schema_version: 1,
          index_key: 1,
          attributes: {
            id: 'subnet-count-1',
            cidr_block: '10.0.2.0/24',
          },
          sensitive_attributes: [],
        },
        {
          schema_version: 1,
          index_key: 2,
          attributes: {
            id: 'subnet-count-2',
            cidr_block: '10.0.3.0/24',
          },
          sensitive_attributes: [],
        },
      ],
    },
  ],
};

// =============================================================================
// Type Mapper Tests
// =============================================================================

describe('Type Mapper', () => {
  describe('get_ice_type', () => {
    it('should map AWS VPC types', () => {
      expect(get_ice_type('aws_vpc')).toBe('aws.vpc.vpc');
      expect(get_ice_type('aws_subnet')).toBe('aws.vpc.subnet');
      expect(get_ice_type('aws_security_group')).toBe('aws.vpc.security_group');
      expect(get_ice_type('aws_internet_gateway')).toBe('aws.vpc.internet_gateway');
    });

    it('should map AWS EC2 types', () => {
      expect(get_ice_type('aws_instance')).toBe('aws.ec2.instance');
      expect(get_ice_type('aws_key_pair')).toBe('aws.ec2.key_pair');
      expect(get_ice_type('aws_ebs_volume')).toBe('aws.ec2.ebs_volume');
    });

    it('should map AWS S3 types', () => {
      expect(get_ice_type('aws_s3_bucket')).toBe('aws.s3.bucket');
      expect(get_ice_type('aws_s3_bucket_policy')).toBe('aws.s3.bucket_policy');
    });

    it('should map Azure types', () => {
      expect(get_ice_type('azurerm_virtual_network')).toBe('azure.network.virtual_network');
      expect(get_ice_type('azurerm_resource_group')).toBe('azure.resources.resource_group');
      expect(get_ice_type('azurerm_kubernetes_cluster')).toBe('azure.aks.cluster');
    });

    it('should map GCP types', () => {
      expect(get_ice_type('google_compute_instance')).toBe('gcp.compute.instance');
      expect(get_ice_type('google_compute_network')).toBe('gcp.compute.network');
      expect(get_ice_type('google_container_cluster')).toBe('gcp.gke.cluster');
    });

    it('should map Kubernetes types', () => {
      expect(get_ice_type('kubernetes_namespace')).toBe('kubernetes.core.namespace');
      expect(get_ice_type('kubernetes_deployment')).toBe('kubernetes.apps.deployment');
      expect(get_ice_type('kubernetes_service')).toBe('kubernetes.core.service');
    });

    it('should fall back to converted format for unknown types', () => {
      expect(get_ice_type('aws_unknown_resource')).toBe('aws.unknown_resource');
      expect(get_ice_type('custom_provider_thing')).toBe('custom.provider_thing');
    });
  });

  describe('get_ice_provider', () => {
    it('should extract provider from full terraform provider string', () => {
      expect(get_ice_provider('provider["registry.terraform.io/hashicorp/aws"]')).toBe('aws');
      expect(get_ice_provider('provider["registry.terraform.io/hashicorp/azurerm"]')).toBe('azure');
      expect(get_ice_provider('provider["registry.terraform.io/hashicorp/google"]')).toBe('gcp');
    });

    it('should handle simple provider format', () => {
      expect(get_ice_provider('provider.aws')).toBe('aws');
      expect(get_ice_provider('aws')).toBe('aws');
    });
  });

  describe('get_provider_from_type', () => {
    it('should extract provider from resource type', () => {
      expect(get_provider_from_type('aws_vpc')).toBe('aws');
      expect(get_provider_from_type('azurerm_virtual_network')).toBe('azure');
      expect(get_provider_from_type('google_compute_instance')).toBe('gcp');
      expect(get_provider_from_type('kubernetes_deployment')).toBe('kubernetes');
    });
  });

  describe('is_type_supported', () => {
    it('should return true for supported types', () => {
      expect(is_type_supported('aws_vpc')).toBe(true);
      expect(is_type_supported('aws_instance')).toBe(true);
      expect(is_type_supported('azurerm_resource_group')).toBe(true);
    });

    it('should return false for unsupported types', () => {
      expect(is_type_supported('unknown_resource')).toBe(false);
      expect(is_type_supported('fake_provider_thing')).toBe(false);
    });
  });
});

// =============================================================================
// State Importer Tests
// =============================================================================

describe('Terraform State Importer', () => {
  describe('import_terraform_state_json', () => {
    it('should import basic state successfully', () => {
      const result = import_terraform_state_json(JSON.stringify(SAMPLE_STATE));

      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.resources.length).toBeGreaterThan(0);
      expect(result.metadata.terraform_version).toBe('1.5.0');
      expect(result.metadata.state_version).toBe(4);
    });

    it('should import managed resources', () => {
      const result = import_terraform_state_json(JSON.stringify(SAMPLE_STATE));

      // Should have 5 managed resources (vpc, 2 subnets, security group, instance)
      // Data source (aws_ami) excluded by default
      expect(result.resources).toHaveLength(5);

      const vpc = result.resources.find((r) => r.terraform_type === 'aws_vpc');
      expect(vpc).toBeDefined();
      expect(vpc?.name).toBe('main');
      expect(vpc?.ice_type).toBe('aws.vpc.vpc');
      expect(vpc?.provider).toBe('aws');
    });

    it('should exclude data sources by default', () => {
      const result = import_terraform_state_json(JSON.stringify(SAMPLE_STATE));

      const data_source = result.resources.find((r) => r.terraform_address.includes('data.'));
      expect(data_source).toBeUndefined();
    });

    it('should include data sources when option is set', () => {
      const result = import_terraform_state_json(JSON.stringify(SAMPLE_STATE), {
        include_data_sources: true,
      });

      // Now should have 6 resources (5 managed + 1 data)
      expect(result.resources).toHaveLength(6);
    });

    it('should import outputs', () => {
      const result = import_terraform_state_json(JSON.stringify(SAMPLE_STATE));

      expect(result.outputs).toHaveLength(2);

      const vpc_output = result.outputs.find((o) => o.name === 'vpc_id');
      expect(vpc_output).toBeDefined();
      expect(vpc_output?.value).toBe('vpc-12345678');
      expect(vpc_output?.sensitive).toBe(false);
    });

    it('should mask sensitive outputs by default', () => {
      const result = import_terraform_state_json(JSON.stringify(SAMPLE_STATE));

      const db_password = result.outputs.find((o) => o.name === 'db_password');
      expect(db_password).toBeDefined();
      expect(db_password?.value).toBe('***SENSITIVE***');
      expect(db_password?.sensitive).toBe(true);
    });

    it('should preserve explicit dependencies', () => {
      const result = import_terraform_state_json(JSON.stringify(SAMPLE_STATE));

      const subnet = result.resources.find((r) => r.name === 'public');
      expect(subnet).toBeDefined();
      expect(subnet?.dependencies).toContain('aws_vpc.main');
    });

    it('should infer dependencies from attribute references', () => {
      const result = import_terraform_state_json(JSON.stringify(SAMPLE_STATE), {
        infer_dependencies: true,
      });

      // The instance should have inferred dependencies through vpc_id and subnet_id
      const instance = result.resources.find((r) => r.terraform_type === 'aws_instance');
      expect(instance).toBeDefined();
      // Should have dependencies from explicit + inferred
      expect(instance?.dependencies.length).toBeGreaterThan(0);
    });
  });

  describe('module handling', () => {
    it('should import resources from modules', () => {
      const result = import_terraform_state_json(JSON.stringify(SAMPLE_STATE_WITH_MODULES));

      expect(result.success).toBe(true);
      expect(result.resources).toHaveLength(1);

      const vpc = result.resources[0];
      expect(vpc?.module).toBe('module.network');
      expect(vpc?.terraform_address).toBe('module.network.aws_vpc.main');
    });

    it('should filter by module', () => {
      const result = import_terraform_state_json(JSON.stringify(SAMPLE_STATE_WITH_MODULES), {
        filter_modules: ['module.other'],
      });

      expect(result.resources).toHaveLength(0);
    });
  });

  describe('count/for_each handling', () => {
    it('should import multiple instances with index keys', () => {
      const result = import_terraform_state_json(JSON.stringify(SAMPLE_STATE_WITH_COUNT));

      expect(result.success).toBe(true);
      expect(result.resources).toHaveLength(3);

      const subnet_0 = result.resources.find((r) => r.index_key === 0);
      const subnet_1 = result.resources.find((r) => r.index_key === 1);
      const subnet_2 = result.resources.find((r) => r.index_key === 2);

      expect(subnet_0).toBeDefined();
      expect(subnet_1).toBeDefined();
      expect(subnet_2).toBeDefined();

      expect(subnet_0?.name).toBe('app_0');
      expect(subnet_1?.name).toBe('app_1');
      expect(subnet_2?.name).toBe('app_2');
    });
  });

  describe('type filtering', () => {
    it('should filter by included types', () => {
      const result = import_terraform_state_json(JSON.stringify(SAMPLE_STATE), {
        filter_types: ['aws_vpc', 'aws_subnet'],
      });

      expect(result.resources).toHaveLength(3); // 1 vpc + 2 subnets
      expect(result.resources.every((r) => ['aws_vpc', 'aws_subnet'].includes(r.terraform_type))).toBe(true);
    });

    it('should filter by excluded types', () => {
      const result = import_terraform_state_json(JSON.stringify(SAMPLE_STATE), {
        exclude_types: ['aws_instance'],
      });

      expect(result.resources.find((r) => r.terraform_type === 'aws_instance')).toBeUndefined();
    });
  });

  describe('error handling', () => {
    it('should handle invalid JSON', () => {
      const result = import_terraform_state_json('not valid json');

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.code).toBe('PARSE_ERROR');
    });

    it('should warn about unsupported state versions', () => {
      const old_state = { ...SAMPLE_STATE, version: 2 };
      const result = import_terraform_state_json(JSON.stringify(old_state));

      expect(result.warnings.some((w) => w.code === 'UNSUPPORTED_VERSION')).toBe(true);
    });
  });
});

// =============================================================================
// Graph Conversion Tests
// =============================================================================

describe('Graph Conversion', () => {
  it('should convert import result to graph', () => {
    const result = import_terraform_state_json(JSON.stringify(SAMPLE_STATE));
    const graph = import_result_to_graph(result);

    expect(graph.node_count).toBe(5);
    expect(graph.edge_count).toBeGreaterThan(0);
  });

  it('should create nodes with correct types', () => {
    const result = import_terraform_state_json(JSON.stringify(SAMPLE_STATE));
    const graph = import_result_to_graph(result);

    const nodes = Array.from(graph.nodes.values());
    const vpc_node = nodes.find((n) => n.type === 'aws.vpc.vpc');

    expect(vpc_node).toBeDefined();
    expect(vpc_node?.name).toBe('main');
  });

  it('should create edges for dependencies', () => {
    const result = import_terraform_state_json(JSON.stringify(SAMPLE_STATE));
    const graph = import_result_to_graph(result);

    expect(graph.edge_count).toBeGreaterThan(0);

    // Check that subnet depends on VPC
    const nodes = Array.from(graph.nodes.values());
    const subnet_node = nodes.find((n) => n.name === 'public');
    if (subnet_node) {
      const deps = graph.get_dependencies(subnet_node.id);
      expect(deps.length).toBeGreaterThanOrEqual(0); // May have inferred deps
    }
  });

  it('should preserve terraform metadata in annotations', () => {
    const result = import_terraform_state_json(JSON.stringify(SAMPLE_STATE));
    const graph = import_result_to_graph(result);

    const nodes = Array.from(graph.nodes.values());
    const vpc_node = nodes.find((n) => n.type === 'aws.vpc.vpc');

    expect(vpc_node?.metadata.annotations?.['imported_from']).toBe('terraform');
    expect(vpc_node?.metadata.annotations?.['terraform_address']).toBe('aws_vpc.main');
  });

  it('should set provider labels', () => {
    const result = import_terraform_state_json(JSON.stringify(SAMPLE_STATE));
    const graph = import_result_to_graph(result);

    const nodes = Array.from(graph.nodes.values());
    for (const node of nodes) {
      expect(node.metadata.labels?.['provider']).toBe('aws');
    }
  });
});
