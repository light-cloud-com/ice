/**
 * AWS Type Mapper
 *
 * Maps AWS resource types to ICE unified types.
 */

/**
 * Mapping from AWS resource types to ICE types.
 * AWS types are in format: AWS::Service::Resource
 */
const TYPE_MAP: Record<string, string> = {
  // EC2
  'aws::ec2::instance': 'aws.ec2.instance',
  'aws::ec2::vpc': 'aws.ec2.vpc',
  'aws::ec2::subnet': 'aws.ec2.subnet',
  'aws::ec2::securitygroup': 'aws.ec2.security_group',
  'aws::ec2::networkinterface': 'aws.ec2.network_interface',
  'aws::ec2::internetgateway': 'aws.ec2.internet_gateway',
  'aws::ec2::natgateway': 'aws.ec2.nat_gateway',
  'aws::ec2::routetable': 'aws.ec2.route_table',
  'aws::ec2::eip': 'aws.ec2.eip',
  'aws::ec2::volume': 'aws.ec2.volume',
  'aws::ec2::snapshot': 'aws.ec2.snapshot',
  'aws::ec2::launchtemplate': 'aws.ec2.launch_template',
  'aws::ec2::keypair': 'aws.ec2.key_pair',

  // S3
  'aws::s3::bucket': 'aws.s3.bucket',

  // RDS
  'aws::rds::dbinstance': 'aws.rds.instance',
  'aws::rds::dbcluster': 'aws.rds.cluster',
  'aws::rds::dbsubnetgroup': 'aws.rds.subnet_group',

  // Lambda
  'aws::lambda::function': 'aws.lambda.function',
  'aws::lambda::layerversion': 'aws.lambda.layer',

  // IAM
  'aws::iam::role': 'aws.iam.role',
  'aws::iam::user': 'aws.iam.user',
  'aws::iam::group': 'aws.iam.group',
  'aws::iam::policy': 'aws.iam.policy',
  'aws::iam::instanceprofile': 'aws.iam.instance_profile',

  // DynamoDB
  'aws::dynamodb::table': 'aws.dynamodb.table',
  'aws::dynamodb::globaltable': 'aws.dynamodb.global_table',

  // ECS
  'aws::ecs::cluster': 'aws.ecs.cluster',
  'aws::ecs::service': 'aws.ecs.service',
  'aws::ecs::taskdefinition': 'aws.ecs.task_definition',

  // EKS
  'aws::eks::cluster': 'aws.eks.cluster',
  'aws::eks::nodegroup': 'aws.eks.node_group',

  // CloudFront
  'aws::cloudfront::distribution': 'aws.cloudfront.distribution',

  // Route53
  'aws::route53::hostedzone': 'aws.route53.hosted_zone',
  'aws::route53::recordset': 'aws.route53.record_set',

  // SNS
  'aws::sns::topic': 'aws.sns.topic',
  'aws::sns::subscription': 'aws.sns.subscription',

  // SQS
  'aws::sqs::queue': 'aws.sqs.queue',

  // API Gateway
  'aws::apigateway::restapi': 'aws.apigateway.rest_api',
  'aws::apigatewayv2::api': 'aws.apigateway.http_api',

  // CloudWatch
  'aws::cloudwatch::alarm': 'aws.cloudwatch.alarm',
  'aws::logs::loggroup': 'aws.cloudwatch.log_group',

  // Secrets Manager
  'aws::secretsmanager::secret': 'aws.secretsmanager.secret',

  // KMS
  'aws::kms::key': 'aws.kms.key',
  'aws::kms::alias': 'aws.kms.alias',

  // ElastiCache
  'aws::elasticache::cluster': 'aws.elasticache.cluster',
  'aws::elasticache::replicationgroup': 'aws.elasticache.replication_group',

  // Elastic Load Balancing
  'aws::elasticloadbalancingv2::loadbalancer': 'aws.elb.load_balancer',
  'aws::elasticloadbalancingv2::targetgroup': 'aws.elb.target_group',
  'aws::elasticloadbalancingv2::listener': 'aws.elb.listener',

  // ACM
  'aws::acm::certificate': 'aws.acm.certificate',

  // CloudFormation
  'aws::cloudformation::stack': 'aws.cloudformation.stack',

  // ECR
  'aws::ecr::repository': 'aws.ecr.repository',

  // Step Functions
  'aws::stepfunctions::statemachine': 'aws.stepfunctions.state_machine',

  // EventBridge
  'aws::events::rule': 'aws.events.rule',
  'aws::events::eventbus': 'aws.events.event_bus',

  // CodeBuild
  'aws::codebuild::project': 'aws.codebuild.project',

  // CodePipeline
  'aws::codepipeline::pipeline': 'aws.codepipeline.pipeline',

  // Cognito
  'aws::cognito::userpool': 'aws.cognito.user_pool',
  'aws::cognito::identitypool': 'aws.cognito.identity_pool',
};

/**
 * Get the ICE type for an AWS resource type.
 */
export function get_ice_type(aws_type: string): string {
  const normalized = aws_type.toLowerCase();
  const mapped = TYPE_MAP[normalized];

  if (mapped) {
    return mapped;
  }

  // Fallback: convert AWS type to ICE type format
  // e.g., "AWS::EC2::Instance" -> "aws.ec2.instance"
  const parts = normalized.replace('aws::', '').split('::');
  if (parts.length >= 2) {
    const service = parts[0];
    const resource = parts.slice(1).join('_').toLowerCase();
    return `aws.${service}.${resource}`;
  }

  return `aws.unknown.${normalized.replace(/::/g, '_')}`;
}

/**
 * Check if an AWS type is supported (has explicit mapping).
 */
export function is_type_supported(aws_type: string): boolean {
  return aws_type.toLowerCase() in TYPE_MAP;
}

/**
 * Get all supported AWS types.
 */
export function get_supported_types(): string[] {
  return Object.keys(TYPE_MAP);
}

/**
 * Map AWS properties to ICE properties (snake_case).
 */
export function map_properties(
  aws_type: string,
  properties: Record<string, unknown>
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(properties)) {
    // Convert camelCase/PascalCase to snake_case
    const ice_key = key
      .replace(/([A-Z])/g, '_$1')
      .toLowerCase()
      .replace(/^_/, '');

    result[ice_key] = value;
  }

  return result;
}
