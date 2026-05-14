/**
 * AWS Deployer
 *
 * Deploys resources to Amazon Web Services using direct API calls.
 */

import type { DeployOptions, ResourceDeployResult, ProviderDeployer } from '../types';

/**
 * AWS resource deployer.
 */
export class AWSDeployer implements ProviderDeployer {
  provider = 'aws';

  private region: string = 'us-east-1';
  private ec2_client: any = null;
  private s3_client: any = null;
  private lambda_client: any = null;

  async initialize(options: DeployOptions): Promise<void> {
    this.region = options.regions?.[0] || 'us-east-1';

    try {
      // Dynamic import of AWS SDK v3
      const client_ec2_module = '@aws-sdk/client-ec2';
      const client_s3_module = '@aws-sdk/client-s3';
      const client_lambda_module = '@aws-sdk/client-lambda';

      try {
        const ec2 = await Function('m', 'return import(m)')(client_ec2_module);
        this.ec2_client = new ec2.EC2Client({ region: this.region });
      } catch {
        // EC2 client not available
      }

      try {
        const s3 = await Function('m', 'return import(m)')(client_s3_module);
        this.s3_client = new s3.S3Client({ region: this.region });
      } catch {
        // S3 client not available
      }

      try {
        const lambda = await Function('m', 'return import(m)')(client_lambda_module);
        this.lambda_client = new lambda.LambdaClient({ region: this.region });
      } catch {
        // Lambda client not available
      }
    } catch (error) {
      throw new Error(`Failed to initialize AWS SDK: ${error instanceof Error ? error.message : String(error)}`, {
        cause: error,
      });
    }
  }

  async cleanup(): Promise<void> {
    // Destroy clients
    if (this.ec2_client) this.ec2_client.destroy();
    if (this.s3_client) this.s3_client.destroy();
    if (this.lambda_client) this.lambda_client.destroy();
  }

  async create(
    type: string,
    name: string,
    properties: Record<string, unknown>,
    _options: Record<string, unknown>,
  ): Promise<ResourceDeployResult> {
    const start = Date.now();

    try {
      let provider_id: string | undefined;

      if (type.startsWith('aws.ec2.instance')) {
        provider_id = await this.create_ec2_instance(name, properties);
      } else if (type.startsWith('aws.s3.bucket')) {
        provider_id = await this.create_s3_bucket(name, properties);
      } else if (type.startsWith('aws.lambda.function')) {
        provider_id = await this.create_lambda_function(name, properties);
      } else {
        return {
          resource_id: name,
          name,
          type,
          action: 'create',
          success: false,
          error: `Unsupported resource type for creation: ${type}`,
          duration_ms: Date.now() - start,
        };
      }

      return {
        resource_id: name,
        name,
        type,
        action: 'create',
        success: true,
        provider_id,
        duration_ms: Date.now() - start,
      };
    } catch (error) {
      return {
        resource_id: name,
        name,
        type,
        action: 'create',
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration_ms: Date.now() - start,
      };
    }
  }

  async update(
    type: string,
    name: string,
    provider_id: string,
    properties: Record<string, unknown>,
    current_properties: Record<string, unknown>,
    _options: Record<string, unknown>,
  ): Promise<ResourceDeployResult> {
    const start = Date.now();

    try {
      if (type.startsWith('aws.ec2.instance')) {
        await this.update_ec2_instance(name, provider_id, properties, current_properties);
      } else if (type.startsWith('aws.s3.bucket')) {
        await this.update_s3_bucket(name, provider_id, properties);
      } else if (type.startsWith('aws.lambda.function')) {
        await this.update_lambda_function(name, provider_id, properties);
      } else {
        return {
          resource_id: name,
          name,
          type,
          action: 'update',
          success: false,
          error: `Unsupported resource type for update: ${type}`,
          duration_ms: Date.now() - start,
        };
      }

      return {
        resource_id: name,
        name,
        type,
        action: 'update',
        success: true,
        provider_id,
        duration_ms: Date.now() - start,
      };
    } catch (error) {
      return {
        resource_id: name,
        name,
        type,
        action: 'update',
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration_ms: Date.now() - start,
      };
    }
  }

  async delete(
    type: string,
    name: string,
    provider_id: string,
    _options: Record<string, unknown>,
  ): Promise<ResourceDeployResult> {
    const start = Date.now();

    try {
      if (type.startsWith('aws.ec2.instance')) {
        await this.delete_ec2_instance(name, provider_id);
      } else if (type.startsWith('aws.s3.bucket')) {
        await this.delete_s3_bucket(name, provider_id);
      } else if (type.startsWith('aws.lambda.function')) {
        await this.delete_lambda_function(name, provider_id);
      } else {
        return {
          resource_id: name,
          name,
          type,
          action: 'delete',
          success: false,
          error: `Unsupported resource type for deletion: ${type}`,
          duration_ms: Date.now() - start,
        };
      }

      return {
        resource_id: name,
        name,
        type,
        action: 'delete',
        success: true,
        duration_ms: Date.now() - start,
      };
    } catch (error) {
      return {
        resource_id: name,
        name,
        type,
        action: 'delete',
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration_ms: Date.now() - start,
      };
    }
  }

  // ============================================================================
  // EC2
  // ============================================================================

  private async create_ec2_instance(name: string, properties: Record<string, unknown>): Promise<string> {
    if (!this.ec2_client) {
      throw new Error('EC2 SDK not available. Install @aws-sdk/client-ec2');
    }

    const ec2_module = '@aws-sdk/client-ec2';
    const ec2 = await Function('m', 'return import(m)')(ec2_module);

    const image_id = (properties.image_id as string) || 'ami-0c55b159cbfafe1f0';
    const instance_type = (properties.instance_type as string) || 't2.micro';

    const command = new ec2.RunInstancesCommand({
      ImageId: image_id,
      InstanceType: instance_type,
      MinCount: 1,
      MaxCount: 1,
      TagSpecifications: [
        {
          ResourceType: 'instance',
          Tags: [
            { Key: 'Name', Value: name },
            ...Object.entries(properties.tags || {}).map(([Key, Value]) => ({
              Key,
              Value: Value as string,
            })),
          ],
        },
      ],
      SubnetId: properties.subnet_id as string,
      SecurityGroupIds: properties.security_group_ids as string[],
    });

    const result = await this.ec2_client.send(command);
    const instance_id = result.Instances?.[0]?.InstanceId;

    if (!instance_id) {
      throw new Error('Failed to get instance ID from RunInstances response');
    }

    return `arn:aws:ec2:${this.region}:*:instance/${instance_id}`;
  }

  private async update_ec2_instance(
    name: string,
    provider_id: string,
    properties: Record<string, unknown>,
    _current_properties: Record<string, unknown>,
  ): Promise<void> {
    if (!this.ec2_client) {
      throw new Error('EC2 SDK not available');
    }

    const ec2_module = '@aws-sdk/client-ec2';
    const ec2 = await Function('m', 'return import(m)')(ec2_module);

    // Extract instance ID from ARN
    const instance_id = provider_id.split('/').pop();

    // Update tags
    if (properties.tags) {
      const command = new ec2.CreateTagsCommand({
        Resources: [instance_id],
        Tags: Object.entries(properties.tags as Record<string, string>).map(([Key, Value]) => ({
          Key,
          Value,
        })),
      });
      await this.ec2_client.send(command);
    }
  }

  private async delete_ec2_instance(name: string, provider_id: string): Promise<void> {
    if (!this.ec2_client) {
      throw new Error('EC2 SDK not available');
    }

    const ec2_module = '@aws-sdk/client-ec2';
    const ec2 = await Function('m', 'return import(m)')(ec2_module);

    const instance_id = provider_id.split('/').pop();

    const command = new ec2.TerminateInstancesCommand({
      InstanceIds: [instance_id],
    });

    await this.ec2_client.send(command);
  }

  // ============================================================================
  // S3
  // ============================================================================

  private async create_s3_bucket(name: string, properties: Record<string, unknown>): Promise<string> {
    if (!this.s3_client) {
      throw new Error('S3 SDK not available. Install @aws-sdk/client-s3');
    }

    const s3_module = '@aws-sdk/client-s3';
    const s3 = await Function('m', 'return import(m)')(s3_module);

    const command = new s3.CreateBucketCommand({
      Bucket: name,
      CreateBucketConfiguration:
        this.region !== 'us-east-1'
          ? {
              LocationConstraint: this.region,
            }
          : undefined,
    });

    await this.s3_client.send(command);

    // Apply tags if provided
    if (properties.tags) {
      const tag_command = new s3.PutBucketTaggingCommand({
        Bucket: name,
        Tagging: {
          TagSet: Object.entries(properties.tags as Record<string, string>).map(([Key, Value]) => ({
            Key,
            Value,
          })),
        },
      });
      await this.s3_client.send(tag_command);
    }

    return `arn:aws:s3:::${name}`;
  }

  private async update_s3_bucket(
    name: string,
    provider_id: string,
    properties: Record<string, unknown>,
  ): Promise<void> {
    if (!this.s3_client) {
      throw new Error('S3 SDK not available');
    }

    const s3_module = '@aws-sdk/client-s3';
    const s3 = await Function('m', 'return import(m)')(s3_module);

    // Update tags
    if (properties.tags) {
      const command = new s3.PutBucketTaggingCommand({
        Bucket: name,
        Tagging: {
          TagSet: Object.entries(properties.tags as Record<string, string>).map(([Key, Value]) => ({
            Key,
            Value,
          })),
        },
      });
      await this.s3_client.send(command);
    }
  }

  private async delete_s3_bucket(name: string, _provider_id: string): Promise<void> {
    if (!this.s3_client) {
      throw new Error('S3 SDK not available');
    }

    const s3_module = '@aws-sdk/client-s3';
    const s3 = await Function('m', 'return import(m)')(s3_module);

    // Delete all objects first
    const list_command = new s3.ListObjectsV2Command({ Bucket: name });
    const objects = await this.s3_client.send(list_command);

    if (objects.Contents && objects.Contents.length > 0) {
      const delete_command = new s3.DeleteObjectsCommand({
        Bucket: name,
        Delete: {
          Objects: objects.Contents.map((obj: any) => ({ Key: obj.Key })),
        },
      });
      await this.s3_client.send(delete_command);
    }

    // Delete the bucket
    const command = new s3.DeleteBucketCommand({ Bucket: name });
    await this.s3_client.send(command);
  }

  // ============================================================================
  // Lambda
  // ============================================================================

  private async create_lambda_function(name: string, properties: Record<string, unknown>): Promise<string> {
    if (!this.lambda_client) {
      throw new Error('Lambda SDK not available. Install @aws-sdk/client-lambda');
    }

    const lambda_module = '@aws-sdk/client-lambda';
    const lambda = await Function('m', 'return import(m)')(lambda_module);

    const command = new lambda.CreateFunctionCommand({
      FunctionName: name,
      Runtime: (properties.runtime as string) || 'nodejs18.x',
      Role: properties.role as string,
      Handler: (properties.handler as string) || 'index.handler',
      Code: {
        S3Bucket: properties.s3_bucket as string,
        S3Key: properties.s3_key as string,
        ZipFile: properties.zip_file ? Buffer.from(properties.zip_file as string, 'base64') : undefined,
      },
      Description: properties.description as string,
      Timeout: (properties.timeout as number) || 30,
      MemorySize: (properties.memory_size as number) || 128,
      Environment: properties.environment
        ? {
            Variables: properties.environment as Record<string, string>,
          }
        : undefined,
      Tags: properties.tags as Record<string, string>,
    });

    const result = await this.lambda_client.send(command);

    return result.FunctionArn;
  }

  private async update_lambda_function(
    name: string,
    provider_id: string,
    properties: Record<string, unknown>,
  ): Promise<void> {
    if (!this.lambda_client) {
      throw new Error('Lambda SDK not available');
    }

    const lambda_module = '@aws-sdk/client-lambda';
    const lambda = await Function('m', 'return import(m)')(lambda_module);

    // Update configuration
    const config_command = new lambda.UpdateFunctionConfigurationCommand({
      FunctionName: name,
      Description: properties.description as string,
      Timeout: properties.timeout as number,
      MemorySize: properties.memory_size as number,
      Environment: properties.environment
        ? {
            Variables: properties.environment as Record<string, string>,
          }
        : undefined,
    });
    await this.lambda_client.send(config_command);

    // Update code if provided
    if (properties.s3_bucket && properties.s3_key) {
      const code_command = new lambda.UpdateFunctionCodeCommand({
        FunctionName: name,
        S3Bucket: properties.s3_bucket as string,
        S3Key: properties.s3_key as string,
      });
      await this.lambda_client.send(code_command);
    }
  }

  private async delete_lambda_function(name: string, _provider_id: string): Promise<void> {
    if (!this.lambda_client) {
      throw new Error('Lambda SDK not available');
    }

    const lambda_module = '@aws-sdk/client-lambda';
    const lambda = await Function('m', 'return import(m)')(lambda_module);

    const command = new lambda.DeleteFunctionCommand({
      FunctionName: name,
    });

    await this.lambda_client.send(command);
  }
}

/**
 * Create an AWS deployer instance.
 */
export function create_aws_deployer(): AWSDeployer {
  return new AWSDeployer();
}
