/**
 * Example file content + creation helper.
 *
 * Extracted from `CustomizationLoader.create_example_files` (rf-cload-1).
 * The four content strings (provider JSON example, override YAML, custom
 * resource YAML, relationships YAML) move out of the orchestrator into
 * named constants. The creation function takes the resolved
 * CustomizationPaths and writes the four `_example.*.disabled` files.
 *
 * Behaviour preserved verbatim:
 *  - Each file uses the suffix `_example.<ext>.disabled` so users must
 *    rename to enable them.
 *  - Content is byte-identical to the original inline strings (provider
 *    JSON pretty-printed with 2-space indent; YAML files use the original
 *    multi-line literals).
 *  - Each file is only written if it doesn't already exist.
 */
import * as fs from 'fs';
import * as path from 'path';
import type { CustomizationPaths } from './paths.js';

export const PROVIDER_EXAMPLE_JSON = JSON.stringify(
  {
    _comment: 'Remove .disabled extension to enable this file',
    source: 'custom',
    provider_name: 'mycompany/internal',
    version: '1.0.0',
    resources: {
      mycompany_api_endpoint: {
        description: 'Internal API endpoint',
        category: 'compute',
        properties: {
          name: { type: 'string', required: true },
          url: { type: 'string', required: true },
          auth_type: { type: 'string', enum: ['oauth', 'apikey', 'none'] },
        },
      },
    },
  },
  null,
  2,
);

export const OVERRIDE_EXAMPLE_YAML = `# Remove .disabled extension to enable this file
# This example shows how to override an existing resource type
ice_type: aws.ec2.instance
overrides:
  display_name: "Custom EC2 Name"
  icon: "server-custom"
  description: |
    Our standard EC2 instance configuration.
    Must use approved AMIs only.

  # Restrict allowed values for a property
  properties:
    instance_type:
      allowed_values: ["t3.micro", "t3.small", "t3.medium"]
      description: "Only t3 instances allowed per policy"

  # Add custom relationships
  relationships:
    - target: mycompany.monitoring.agent
      type: depends_on
      description: "All instances must have monitoring agent"
`;

export const CUSTOM_RESOURCE_EXAMPLE_YAML = `# Remove .disabled extension to enable this file
# This example shows how to define a custom resource type
ice_type: mycompany.api.gateway
display_name: "API Gateway"
category: application
icon: gateway
description: "Internal API Gateway for microservices"

properties:
  name:
    type: string
    required: true
    description: "Gateway name"

  endpoints:
    type: array
    description: "List of API endpoints"

relationships:
  - target: aws.ec2.instance
    type: connects_to
    property: backend_url
    description: "Gateway connects to backend instances"
`;

export const RELATIONSHIPS_EXAMPLE_YAML = `# Remove .disabled extension to enable this file
# This example shows how to add custom relationships between resource types
relationships:
  - source: aws.lambda.function
    target: mycompany.secrets.vault
    type: depends_on
    description: "All lambdas must use our secrets vault"

  - source: aws.ec2.instance
    target: aws.ec2.instance
    type: equivalent_to
    condition: "same availability zone"
`;

/**
 * Write the four `_example.*.disabled` files into their respective
 * directories. Each file is only written if it does not already exist
 * (matches the original behaviour).
 */
export async function create_example_files(paths: CustomizationPaths): Promise<void> {
  write_if_missing(path.join(paths.providers_dir, '_example.json.disabled'), PROVIDER_EXAMPLE_JSON);
  write_if_missing(path.join(paths.overrides_dir, '_example.yaml.disabled'), OVERRIDE_EXAMPLE_YAML);
  write_if_missing(path.join(paths.custom_dir, '_example.yaml.disabled'), CUSTOM_RESOURCE_EXAMPLE_YAML);
  write_if_missing(path.join(paths.relationships_dir, '_example.yaml.disabled'), RELATIONSHIPS_EXAMPLE_YAML);
}

function write_if_missing(file_path: string, content: string): void {
  if (!fs.existsSync(file_path)) {
    fs.writeFileSync(file_path, content);
  }
}
