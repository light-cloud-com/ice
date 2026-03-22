/**
 * Pulumi Importer Tests
 */

import {
  import_pulumi_state_json,
  import_result_to_graph,
  parse_urn,
  parse_type,
  get_ice_type,
  get_ice_provider,
  get_provider_from_type,
  is_type_supported,
  is_provider_resource,
  is_stack_resource,
} from '../importers/pulumi/index.js';

// =============================================================================
// Sample Pulumi State Data
// =============================================================================

const SAMPLE_EXPORT = {
  version: 3,
  deployment: {
    manifest: {
      time: '2024-01-15T10:30:00.000Z',
      magic: 'test-magic',
      version: 'v3.100.0',
      plugins: [{ name: 'aws', path: '/plugins/aws', type: 'resource', version: '6.0.0' }],
    },
    resources: [
      {
        urn: 'urn:pulumi:dev::my-project::pulumi:pulumi:Stack::my-project-dev',
        type: 'pulumi:pulumi:Stack',
        outputs: {
          vpc_id: 'vpc-12345678',
          db_password: {
            '4dabf18193072939515e22aab3b80af9': '1b47061264138c4ac30d75fd1eb44270',
            plaintext: 'secret-password-123',
          },
        },
      },
      {
        urn: 'urn:pulumi:dev::my-project::pulumi:providers:aws::default',
        type: 'pulumi:providers:aws',
        id: 'default',
        inputs: { region: 'us-east-1' },
        outputs: { region: 'us-east-1' },
      },
      {
        urn: 'urn:pulumi:dev::my-project::aws:ec2/vpc:Vpc::main',
        custom: true,
        type: 'aws:ec2/vpc:Vpc',
        id: 'vpc-12345678',
        inputs: {
          cidrBlock: '10.0.0.0/16',
          enableDnsHostnames: true,
          tags: { Name: 'main-vpc' },
        },
        outputs: {
          id: 'vpc-12345678',
          arn: 'arn:aws:ec2:us-east-1:123456789:vpc/vpc-12345678',
          cidrBlock: '10.0.0.0/16',
          enableDnsHostnames: true,
          enableDnsSupport: true,
          tags: { Name: 'main-vpc', Environment: 'dev' },
        },
        provider: 'urn:pulumi:dev::my-project::pulumi:providers:aws::default',
      },
      {
        urn: 'urn:pulumi:dev::my-project::aws:ec2/subnet:Subnet::public',
        custom: true,
        type: 'aws:ec2/subnet:Subnet',
        id: 'subnet-aaaaaaaa',
        inputs: {
          vpcId: 'vpc-12345678',
          cidrBlock: '10.0.1.0/24',
          availabilityZone: 'us-east-1a',
        },
        outputs: {
          id: 'subnet-aaaaaaaa',
          arn: 'arn:aws:ec2:us-east-1:123456789:subnet/subnet-aaaaaaaa',
          vpcId: 'vpc-12345678',
          cidrBlock: '10.0.1.0/24',
          availabilityZone: 'us-east-1a',
          mapPublicIpOnLaunch: true,
          tags: { Name: 'public-subnet' },
        },
        dependencies: ['urn:pulumi:dev::my-project::aws:ec2/vpc:Vpc::main'],
        parent: 'urn:pulumi:dev::my-project::pulumi:pulumi:Stack::my-project-dev',
        provider: 'urn:pulumi:dev::my-project::pulumi:providers:aws::default',
      },
      {
        urn: 'urn:pulumi:dev::my-project::aws:ec2/subnet:Subnet::private',
        custom: true,
        type: 'aws:ec2/subnet:Subnet',
        id: 'subnet-bbbbbbbb',
        inputs: {
          vpcId: 'vpc-12345678',
          cidrBlock: '10.0.2.0/24',
          availabilityZone: 'us-east-1b',
        },
        outputs: {
          id: 'subnet-bbbbbbbb',
          vpcId: 'vpc-12345678',
          cidrBlock: '10.0.2.0/24',
          availabilityZone: 'us-east-1b',
          mapPublicIpOnLaunch: false,
          tags: { Name: 'private-subnet' },
        },
        dependencies: ['urn:pulumi:dev::my-project::aws:ec2/vpc:Vpc::main'],
        provider: 'urn:pulumi:dev::my-project::pulumi:providers:aws::default',
      },
      {
        urn: 'urn:pulumi:dev::my-project::aws:ec2/securityGroup:SecurityGroup::web_sg',
        custom: true,
        type: 'aws:ec2/securityGroup:SecurityGroup',
        id: 'sg-11111111',
        inputs: {
          vpcId: 'vpc-12345678',
          name: 'web-sg',
          description: 'Security group for web servers',
        },
        outputs: {
          id: 'sg-11111111',
          vpcId: 'vpc-12345678',
          name: 'web-sg',
          description: 'Security group for web servers',
          ingress: [
            { fromPort: 80, toPort: 80, protocol: 'tcp', cidrBlocks: ['0.0.0.0/0'] },
            { fromPort: 443, toPort: 443, protocol: 'tcp', cidrBlocks: ['0.0.0.0/0'] },
          ],
          egress: [{ fromPort: 0, toPort: 0, protocol: '-1', cidrBlocks: ['0.0.0.0/0'] }],
          tags: { Name: 'web-sg' },
        },
        dependencies: ['urn:pulumi:dev::my-project::aws:ec2/vpc:Vpc::main'],
        provider: 'urn:pulumi:dev::my-project::pulumi:providers:aws::default',
      },
      {
        urn: 'urn:pulumi:dev::my-project::aws:ec2/instance:Instance::web',
        custom: true,
        type: 'aws:ec2/instance:Instance',
        id: 'i-1234567890abcdef0',
        inputs: {
          ami: 'ami-12345678',
          instanceType: 't3.micro',
          subnetId: 'subnet-aaaaaaaa',
          vpcSecurityGroupIds: ['sg-11111111'],
        },
        outputs: {
          id: 'i-1234567890abcdef0',
          ami: 'ami-12345678',
          instanceType: 't3.micro',
          subnetId: 'subnet-aaaaaaaa',
          vpcSecurityGroupIds: ['sg-11111111'],
          publicIp: '54.123.45.67',
          privateIp: '10.0.1.10',
          tags: { Name: 'web-server' },
        },
        dependencies: [
          'urn:pulumi:dev::my-project::aws:ec2/subnet:Subnet::public',
          'urn:pulumi:dev::my-project::aws:ec2/securityGroup:SecurityGroup::web_sg',
        ],
        provider: 'urn:pulumi:dev::my-project::pulumi:providers:aws::default',
      },
    ],
  },
};

const SAMPLE_STATE = {
  version: 3,
  checkpoint: {
    stack: 'organization/my-project/dev',
    latest: {
      manifest: {
        time: '2024-01-15T10:30:00.000Z',
        magic: 'test-magic',
        version: 'v3.100.0',
      },
      resources: [
        {
          urn: 'urn:pulumi:dev::my-project::pulumi:pulumi:Stack::my-project-dev',
          type: 'pulumi:pulumi:Stack',
        },
        {
          urn: 'urn:pulumi:dev::my-project::aws:s3/bucket:Bucket::data',
          custom: true,
          type: 'aws:s3/bucket:Bucket',
          id: 'my-data-bucket-12345',
          outputs: {
            id: 'my-data-bucket-12345',
            bucket: 'my-data-bucket-12345',
            arn: 'arn:aws:s3:::my-data-bucket-12345',
            region: 'us-east-1',
          },
        },
      ],
    },
  },
};

const SAMPLE_WITH_SECRETS = {
  version: 3,
  deployment: {
    manifest: {
      time: '2024-01-15T10:30:00.000Z',
      magic: 'test-magic',
      version: 'v3.100.0',
    },
    resources: [
      {
        urn: 'urn:pulumi:dev::my-project::pulumi:pulumi:Stack::my-project-dev',
        type: 'pulumi:pulumi:Stack',
      },
      {
        urn: 'urn:pulumi:dev::my-project::aws:rds/instance:Instance::db',
        custom: true,
        type: 'aws:rds/instance:Instance',
        id: 'my-db',
        outputs: {
          id: 'my-db',
          endpoint: 'my-db.123456.us-east-1.rds.amazonaws.com:5432',
          username: 'admin',
          password: {
            '4dabf18193072939515e22aab3b80af9': '1b47061264138c4ac30d75fd1eb44270',
            plaintext: 'super-secret-password',
          },
        },
        additional_secret_outputs: ['password'],
      },
    ],
  },
};

const SAMPLE_AZURE_GCP = {
  version: 3,
  deployment: {
    manifest: {
      time: '2024-01-15T10:30:00.000Z',
      magic: 'test-magic',
      version: 'v3.100.0',
    },
    resources: [
      {
        urn: 'urn:pulumi:dev::my-project::pulumi:pulumi:Stack::my-project-dev',
        type: 'pulumi:pulumi:Stack',
      },
      {
        urn: 'urn:pulumi:dev::my-project::azure:core/resourceGroup:ResourceGroup::rg',
        custom: true,
        type: 'azure:core/resourceGroup:ResourceGroup',
        id: '/subscriptions/xxx/resourceGroups/my-rg',
        outputs: {
          id: '/subscriptions/xxx/resourceGroups/my-rg',
          name: 'my-rg',
          location: 'eastus',
        },
      },
      {
        urn: 'urn:pulumi:dev::my-project::gcp:compute/instance:Instance::vm',
        custom: true,
        type: 'gcp:compute/instance:Instance',
        id: 'projects/my-project/zones/us-central1-a/instances/my-vm',
        outputs: {
          id: 'projects/my-project/zones/us-central1-a/instances/my-vm',
          name: 'my-vm',
          zone: 'us-central1-a',
          machineType: 'n1-standard-1',
        },
      },
    ],
  },
};

// =============================================================================
// URN Parsing Tests
// =============================================================================

describe('URN Parsing', () => {
  describe('parse_urn', () => {
    it('should parse standard URN format', () => {
      const urn = 'urn:pulumi:dev::my-project::aws:ec2/vpc:Vpc::main';
      const result = parse_urn(urn);

      expect(result).not.toBeNull();
      expect(result?.stack).toBe('dev');
      expect(result?.project).toBe('my-project');
      expect(result?.type).toBe('aws:ec2/vpc:Vpc');
      expect(result?.name).toBe('main');
    });

    it('should parse type components', () => {
      const urn = 'urn:pulumi:dev::my-project::aws:ec2/vpc:Vpc::main';
      const result = parse_urn(urn);

      expect(result?.provider).toBe('aws');
      expect(result?.module).toBe('ec2');
      expect(result?.resource_type).toBe('vpc');
      expect(result?.resource_class).toBe('Vpc');
    });

    it('should handle stack URN', () => {
      const urn = 'urn:pulumi:dev::my-project::pulumi:pulumi:Stack::my-project-dev';
      const result = parse_urn(urn);

      expect(result).not.toBeNull();
      expect(result?.stack).toBe('dev');
      expect(result?.project).toBe('my-project');
      expect(result?.type).toBe('pulumi:pulumi:Stack');
      expect(result?.name).toBe('my-project-dev');
    });

    it('should handle provider URN', () => {
      const urn = 'urn:pulumi:dev::my-project::pulumi:providers:aws::default';
      const result = parse_urn(urn);

      expect(result).not.toBeNull();
      expect(result?.type).toBe('pulumi:providers:aws');
      expect(result?.name).toBe('default');
    });

    it('should return null for invalid URN', () => {
      expect(parse_urn('invalid-urn')).toBeNull();
      expect(parse_urn('')).toBeNull();
      expect(parse_urn('urn:invalid')).toBeNull();
    });
  });

  describe('parse_type', () => {
    it('should parse standard type format', () => {
      const result = parse_type('aws:ec2/vpc:Vpc');

      expect(result.provider).toBe('aws');
      expect(result.module).toBe('ec2');
      expect(result.resource_type).toBe('vpc');
      expect(result.resource_class).toBe('Vpc');
    });

    it('should handle Kubernetes types', () => {
      const result = parse_type('kubernetes:core/v1:Namespace');

      expect(result.provider).toBe('kubernetes');
      expect(result.module).toBe('core');
      expect(result.resource_type).toBe('v1');
      expect(result.resource_class).toBe('Namespace');
    });

    it('should handle stack type', () => {
      const result = parse_type('pulumi:pulumi:Stack');

      expect(result.provider).toBe('pulumi');
      expect(result.module).toBe('pulumi');
      expect(result.resource_class).toBe('Stack');
    });

    it('should handle provider type', () => {
      const result = parse_type('pulumi:providers:aws');

      expect(result.provider).toBe('pulumi');
      expect(result.module).toBe('providers');
      expect(result.resource_class).toBe('aws');
    });
  });
});

// =============================================================================
// Type Mapper Tests
// =============================================================================

describe('Type Mapper', () => {
  describe('get_ice_type', () => {
    it('should map AWS EC2 types', () => {
      expect(get_ice_type('aws:ec2/instance:Instance')).toBe('aws.ec2.instance');
      expect(get_ice_type('aws:ec2/vpc:Vpc')).toBe('aws.vpc.vpc');
      expect(get_ice_type('aws:ec2/subnet:Subnet')).toBe('aws.vpc.subnet');
      expect(get_ice_type('aws:ec2/securityGroup:SecurityGroup')).toBe('aws.vpc.security_group');
    });

    it('should map AWS S3 types', () => {
      expect(get_ice_type('aws:s3/bucket:Bucket')).toBe('aws.s3.bucket');
      expect(get_ice_type('aws:s3/bucketPolicy:BucketPolicy')).toBe('aws.s3.bucket_policy');
    });

    it('should map AWS IAM types', () => {
      expect(get_ice_type('aws:iam/role:Role')).toBe('aws.iam.role');
      expect(get_ice_type('aws:iam/policy:Policy')).toBe('aws.iam.policy');
    });

    it('should map Azure types', () => {
      expect(get_ice_type('azure:compute/virtualMachine:VirtualMachine')).toBe('azure.compute.virtual_machine');
      expect(get_ice_type('azure:network/virtualNetwork:VirtualNetwork')).toBe('azure.network.virtual_network');
      expect(get_ice_type('azure:storage/account:Account')).toBe('azure.storage.storage_account');
    });

    it('should map GCP types', () => {
      expect(get_ice_type('gcp:compute/instance:Instance')).toBe('gcp.compute.instance');
      expect(get_ice_type('gcp:compute/network:Network')).toBe('gcp.compute.network');
      expect(get_ice_type('gcp:storage/bucket:Bucket')).toBe('gcp.storage.bucket');
    });

    it('should map Kubernetes types', () => {
      expect(get_ice_type('kubernetes:core/v1:Namespace')).toBe('kubernetes.core.namespace');
      expect(get_ice_type('kubernetes:apps/v1:Deployment')).toBe('kubernetes.apps.deployment');
      expect(get_ice_type('kubernetes:core/v1:Service')).toBe('kubernetes.core.service');
    });

    it('should fall back to converted format for unknown types', () => {
      const result = get_ice_type('custom:module/resource:CustomResource');
      expect(result).toBe('custom.module.custom_resource');
    });
  });

  describe('get_ice_provider', () => {
    it('should extract provider from URN', () => {
      expect(get_ice_provider('urn:pulumi:dev::proj::aws:ec2/vpc:Vpc::main')).toBe('aws');
    });

    it('should map provider names', () => {
      expect(get_ice_provider('aws')).toBe('aws');
      expect(get_ice_provider('azure')).toBe('azure');
      expect(get_ice_provider('azure-native')).toBe('azure');
      expect(get_ice_provider('gcp')).toBe('gcp');
      expect(get_ice_provider('google-native')).toBe('gcp');
    });
  });

  describe('get_provider_from_type', () => {
    it('should extract provider from resource type', () => {
      expect(get_provider_from_type('aws:ec2/vpc:Vpc')).toBe('aws');
      expect(get_provider_from_type('azure:network/virtualNetwork:VirtualNetwork')).toBe('azure');
      expect(get_provider_from_type('gcp:compute/instance:Instance')).toBe('gcp');
      expect(get_provider_from_type('kubernetes:apps/v1:Deployment')).toBe('kubernetes');
    });
  });

  describe('is_type_supported', () => {
    it('should return true for supported types', () => {
      expect(is_type_supported('aws:ec2/instance:Instance')).toBe(true);
      expect(is_type_supported('aws:s3/bucket:Bucket')).toBe(true);
      expect(is_type_supported('azure:compute/virtualMachine:VirtualMachine')).toBe(true);
    });

    it('should return false for unsupported types', () => {
      expect(is_type_supported('custom:unknown:Resource')).toBe(false);
      expect(is_type_supported('fake:provider:Thing')).toBe(false);
    });
  });

  describe('is_provider_resource', () => {
    it('should identify provider resources', () => {
      expect(is_provider_resource('pulumi:providers:aws')).toBe(true);
      expect(is_provider_resource('pulumi:providers:azure')).toBe(true);
      expect(is_provider_resource('aws:ec2/vpc:Vpc')).toBe(false);
    });
  });

  describe('is_stack_resource', () => {
    it('should identify stack resources', () => {
      expect(is_stack_resource('pulumi:pulumi:Stack')).toBe(true);
      expect(is_stack_resource('aws:ec2/vpc:Vpc')).toBe(false);
    });
  });
});

// =============================================================================
// State Importer Tests
// =============================================================================

describe('Pulumi State Importer', () => {
  describe('import_pulumi_state_json (export format)', () => {
    it('should import basic state successfully', () => {
      const result = import_pulumi_state_json(JSON.stringify(SAMPLE_EXPORT));

      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.resources.length).toBeGreaterThan(0);
      expect(result.metadata.pulumi_version).toBe('v3.100.0');
    });

    it('should import managed resources', () => {
      const result = import_pulumi_state_json(JSON.stringify(SAMPLE_EXPORT));

      // Should have 5 resources (vpc, 2 subnets, security group, instance)
      // Stack and provider excluded by default
      expect(result.resources).toHaveLength(5);

      const vpc = result.resources.find((r) => r.pulumi_type === 'aws:ec2/vpc:Vpc');
      expect(vpc).toBeDefined();
      expect(vpc?.name).toBe('main');
      expect(vpc?.ice_type).toBe('aws.vpc.vpc');
      expect(vpc?.provider).toBe('aws');
    });

    it('should exclude stack and provider by default', () => {
      const result = import_pulumi_state_json(JSON.stringify(SAMPLE_EXPORT));

      const stack = result.resources.find((r) => is_stack_resource(r.pulumi_type));
      expect(stack).toBeUndefined();

      const provider = result.resources.find((r) => is_provider_resource(r.pulumi_type));
      expect(provider).toBeUndefined();
    });

    it('should include stack when option is set', () => {
      const result = import_pulumi_state_json(JSON.stringify(SAMPLE_EXPORT), {
        include_stack: true,
      });

      const stack = result.resources.find((r) => is_stack_resource(r.pulumi_type));
      expect(stack).toBeDefined();
    });

    it('should include providers when option is set', () => {
      const result = import_pulumi_state_json(JSON.stringify(SAMPLE_EXPORT), {
        include_providers: true,
      });

      const provider = result.resources.find((r) => is_provider_resource(r.pulumi_type));
      expect(provider).toBeDefined();
    });

    it('should import outputs from stack', () => {
      const result = import_pulumi_state_json(JSON.stringify(SAMPLE_EXPORT));

      expect(result.outputs).toHaveLength(2);

      const vpc_output = result.outputs.find((o) => o.name === 'vpc_id');
      expect(vpc_output).toBeDefined();
      expect(vpc_output?.value).toBe('vpc-12345678');
      expect(vpc_output?.secret).toBe(false);
    });

    it('should mask secret outputs by default', () => {
      const result = import_pulumi_state_json(JSON.stringify(SAMPLE_EXPORT));

      const db_password = result.outputs.find((o) => o.name === 'db_password');
      expect(db_password).toBeDefined();
      expect(db_password?.value).toBe('***SECRET***');
      expect(db_password?.secret).toBe(true);
    });

    it('should include secrets when option is set', () => {
      const result = import_pulumi_state_json(JSON.stringify(SAMPLE_EXPORT), {
        include_secrets: true,
      });

      const db_password = result.outputs.find((o) => o.name === 'db_password');
      expect(db_password).toBeDefined();
      expect(db_password?.value).toBe('secret-password-123');
    });

    it('should preserve dependencies', () => {
      const result = import_pulumi_state_json(JSON.stringify(SAMPLE_EXPORT));

      const subnet = result.resources.find((r) => r.name === 'public');
      expect(subnet).toBeDefined();
      expect(subnet?.dependencies).toContain('urn:pulumi:dev::my-project::aws:ec2/vpc:Vpc::main');
    });
  });

  describe('import_pulumi_state_json (stack state format)', () => {
    it('should import stack state format', () => {
      const result = import_pulumi_state_json(JSON.stringify(SAMPLE_STATE));

      expect(result.success).toBe(true);
      expect(result.resources).toHaveLength(1);

      const bucket = result.resources.find((r) => r.pulumi_type === 'aws:s3/bucket:Bucket');
      expect(bucket).toBeDefined();
      expect(bucket?.name).toBe('data');
      expect(bucket?.ice_type).toBe('aws.s3.bucket');
    });
  });

  describe('secret handling', () => {
    it('should mask secrets in resource properties by default', () => {
      const result = import_pulumi_state_json(JSON.stringify(SAMPLE_WITH_SECRETS));

      const db = result.resources.find((r) => r.pulumi_type === 'aws:rds/instance:Instance');
      expect(db).toBeDefined();
      expect(db?.properties.password).toBe('***SECRET***');
      expect(db?.secret_outputs).toContain('password');
    });

    it('should include secrets when option is set', () => {
      const result = import_pulumi_state_json(JSON.stringify(SAMPLE_WITH_SECRETS), {
        include_secrets: true,
      });

      const db = result.resources.find((r) => r.pulumi_type === 'aws:rds/instance:Instance');
      expect(db).toBeDefined();
      expect(db?.properties.password).toBe('super-secret-password');
    });
  });

  describe('multi-cloud support', () => {
    it('should import Azure and GCP resources', () => {
      const result = import_pulumi_state_json(JSON.stringify(SAMPLE_AZURE_GCP));

      expect(result.success).toBe(true);
      expect(result.resources).toHaveLength(2);

      const rg = result.resources.find((r) => r.pulumi_type === 'azure:core/resourceGroup:ResourceGroup');
      expect(rg).toBeDefined();
      expect(rg?.name).toBe('rg');
      expect(rg?.provider).toBe('azure');
      expect(rg?.ice_type).toBe('azure.resources.resource_group');

      const vm = result.resources.find((r) => r.pulumi_type === 'gcp:compute/instance:Instance');
      expect(vm).toBeDefined();
      expect(vm?.name).toBe('vm');
      expect(vm?.provider).toBe('gcp');
      expect(vm?.ice_type).toBe('gcp.compute.instance');
    });
  });

  describe('type filtering', () => {
    it('should filter by included types', () => {
      const result = import_pulumi_state_json(JSON.stringify(SAMPLE_EXPORT), {
        filter_types: ['aws:ec2/vpc:Vpc', 'aws:ec2/subnet:Subnet'],
      });

      expect(result.resources).toHaveLength(3); // 1 vpc + 2 subnets
      expect(result.resources.every((r) => ['aws:ec2/vpc:Vpc', 'aws:ec2/subnet:Subnet'].includes(r.pulumi_type))).toBe(
        true,
      );
    });

    it('should filter by excluded types', () => {
      const result = import_pulumi_state_json(JSON.stringify(SAMPLE_EXPORT), {
        exclude_types: ['aws:ec2/instance:Instance'],
      });

      expect(result.resources.find((r) => r.pulumi_type === 'aws:ec2/instance:Instance')).toBeUndefined();
    });
  });

  describe('error handling', () => {
    it('should handle invalid JSON', () => {
      const result = import_pulumi_state_json('not valid json');

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.code).toBe('PARSE_ERROR');
    });

    it('should handle missing deployment', () => {
      const result = import_pulumi_state_json(JSON.stringify({ version: 3 }));

      expect(result.success).toBe(false);
      expect(result.errors.some((e) => e.code === 'INVALID_STATE')).toBe(true);
    });

    it('should warn about unsupported state versions', () => {
      const future_state = { ...SAMPLE_EXPORT, version: 10 };
      const result = import_pulumi_state_json(JSON.stringify(future_state));

      expect(result.warnings.some((w) => w.code === 'UNSUPPORTED_VERSION')).toBe(true);
    });
  });
});

// =============================================================================
// Graph Conversion Tests
// =============================================================================

describe('Graph Conversion', () => {
  it('should convert import result to graph', () => {
    const result = import_pulumi_state_json(JSON.stringify(SAMPLE_EXPORT));
    const graph = import_result_to_graph(result);

    expect(graph.node_count).toBe(5);
    expect(graph.edge_count).toBeGreaterThan(0);
  });

  it('should create nodes with correct types', () => {
    const result = import_pulumi_state_json(JSON.stringify(SAMPLE_EXPORT));
    const graph = import_result_to_graph(result);

    const nodes = Array.from(graph.nodes.values());
    const vpc_node = nodes.find((n) => n.type === 'aws.vpc.vpc');

    expect(vpc_node).toBeDefined();
    expect(vpc_node?.name).toBe('main');
  });

  it('should create edges for dependencies', () => {
    const result = import_pulumi_state_json(JSON.stringify(SAMPLE_EXPORT));
    const graph = import_result_to_graph(result);

    expect(graph.edge_count).toBeGreaterThan(0);

    // Check that subnet depends on VPC
    const nodes = Array.from(graph.nodes.values());
    const subnet_node = nodes.find((n) => n.name === 'public');
    if (subnet_node) {
      const deps = graph.get_dependencies(subnet_node.id);
      expect(deps.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('should preserve pulumi metadata in annotations', () => {
    const result = import_pulumi_state_json(JSON.stringify(SAMPLE_EXPORT));
    const graph = import_result_to_graph(result);

    const nodes = Array.from(graph.nodes.values());
    const vpc_node = nodes.find((n) => n.type === 'aws.vpc.vpc');

    expect(vpc_node?.metadata.annotations?.['imported_from']).toBe('pulumi');
    expect(vpc_node?.metadata.annotations?.['pulumi_urn']).toContain('aws:ec2/vpc:Vpc::main');
  });

  it('should set provider labels', () => {
    const result = import_pulumi_state_json(JSON.stringify(SAMPLE_EXPORT));
    const graph = import_result_to_graph(result);

    const nodes = Array.from(graph.nodes.values());
    for (const node of nodes) {
      expect(node.metadata.labels?.['provider']).toBe('aws');
    }
  });

  it('should set graph metadata', () => {
    const result = import_pulumi_state_json(JSON.stringify(SAMPLE_EXPORT));
    const graph = import_result_to_graph(result);

    expect(graph.metadata.labels?.['source']).toBe('pulumi');
    expect(graph.metadata.labels?.['pulumi_version']).toBe('v3.100.0');
  });
});
