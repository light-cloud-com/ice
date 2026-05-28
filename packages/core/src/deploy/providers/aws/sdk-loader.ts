/**
 * AWS SDK Lazy Loader
 *
 * Centralised lazy loading of `@aws-sdk/client-*` packages. Uses the
 * `Function('m', 'return import(m)')` indirection so bundlers don't
 * try to resolve the optional SDK packages at build time — packages
 * absent from the install footprint fall through to `null` and the
 * caller emits a friendly "SDK not installed" message.
 *
 * Parallel to `../gcp/sdk-loader.ts`. New SDK packages get an entry
 * in `initialize_aws_clients` keyed by AWS service short-name; that
 * key is what handlers ask for via `ctx.clients.get('<service>')`.
 */

/**
 * Dynamically import an AWS SDK package. Returns null when the
 * package isn't installed (the cross-cloud test harness intercepts
 * this same pattern via a Function-constructor stub).
 */
export async function load_aws_sdk(module_name: string): Promise<any | null> {
  try {
    return await Function('m', 'return import(m)')(module_name);
  } catch {
    return null;
  }
}

/**
 * Initialise every AWS SDK client that's installed.
 *
 * Per-service short-name → constructor in this table is the schema
 * the rest of the deployer reads. Handlers index the resulting Map
 * by short-name (`ctx.clients.get('s3')`). Missing SDK packages are
 * silently skipped — handlers detect absence and return a clean
 * "install the package" message.
 */
export async function initialize_aws_clients(region: string): Promise<Map<string, unknown>> {
  const clients = new Map<string, unknown>();

  const ec2 = await load_aws_sdk('@aws-sdk/client-ec2');
  if (ec2) clients.set('ec2', new ec2.EC2Client({ region }));

  const s3 = await load_aws_sdk('@aws-sdk/client-s3');
  if (s3) clients.set('s3', new s3.S3Client({ region }));

  const lambda = await load_aws_sdk('@aws-sdk/client-lambda');
  if (lambda) clients.set('lambda', new lambda.LambdaClient({ region }));

  const cwl = await load_aws_sdk('@aws-sdk/client-cloudwatch-logs');
  if (cwl) clients.set('cloudwatch-logs', new cwl.CloudWatchLogsClient({ region }));

  const sm = await load_aws_sdk('@aws-sdk/client-secrets-manager');
  if (sm) clients.set('secrets-manager', new sm.SecretsManagerClient({ region }));

  const sqs = await load_aws_sdk('@aws-sdk/client-sqs');
  if (sqs) clients.set('sqs', new sqs.SQSClient({ region }));

  const sns = await load_aws_sdk('@aws-sdk/client-sns');
  if (sns) clients.set('sns', new sns.SNSClient({ region }));

  const dynamo = await load_aws_sdk('@aws-sdk/client-dynamodb');
  if (dynamo) clients.set('dynamodb', new dynamo.DynamoDBClient({ region }));

  const ec = await load_aws_sdk('@aws-sdk/client-elasticache');
  if (ec) clients.set('elasticache', new ec.ElastiCacheClient({ region }));

  const rds = await load_aws_sdk('@aws-sdk/client-rds');
  if (rds) clients.set('rds', new rds.RDSClient({ region }));

  const docdb = await load_aws_sdk('@aws-sdk/client-docdb');
  if (docdb) clients.set('docdb', new docdb.DocDBClient({ region }));

  const cognito = await load_aws_sdk('@aws-sdk/client-cognito-identity-provider');
  if (cognito) clients.set('cognito', new cognito.CognitoIdentityProviderClient({ region }));

  const cf = await load_aws_sdk('@aws-sdk/client-cloudfront');
  if (cf) clients.set('cloudfront', new cf.CloudFrontClient({ region }));

  const elb = await load_aws_sdk('@aws-sdk/client-elastic-load-balancing-v2');
  if (elb) clients.set('elbv2', new elb.ElasticLoadBalancingV2Client({ region }));

  const api = await load_aws_sdk('@aws-sdk/client-api-gateway');
  if (api) clients.set('apigateway', new api.APIGatewayClient({ region }));

  const ev = await load_aws_sdk('@aws-sdk/client-eventbridge');
  if (ev) clients.set('eventbridge', new ev.EventBridgeClient({ region }));

  const ecs = await load_aws_sdk('@aws-sdk/client-ecs');
  if (ecs) clients.set('ecs', new ecs.ECSClient({ region }));

  const os = await load_aws_sdk('@aws-sdk/client-opensearch');
  if (os) clients.set('opensearch', new os.OpenSearchClient({ region }));

  const bedrock = await load_aws_sdk('@aws-sdk/client-bedrock');
  if (bedrock) clients.set('bedrock', new bedrock.BedrockClient({ region }));

  const sagemaker = await load_aws_sdk('@aws-sdk/client-sagemaker');
  if (sagemaker) clients.set('sagemaker', new sagemaker.SageMakerClient({ region }));

  const redshift = await load_aws_sdk('@aws-sdk/client-redshift');
  if (redshift) clients.set('redshift', new redshift.RedshiftClient({ region }));

  // ACM is pinned to us-east-1 for CloudFront certs; the handler
  // creates its own client when it needs a different region. The
  // shared instance lives in the operator's deploy region.
  const acm = await load_aws_sdk('@aws-sdk/client-acm');
  if (acm) clients.set('acm', new acm.ACMClient({ region }));

  const route53 = await load_aws_sdk('@aws-sdk/client-route-53');
  if (route53) clients.set('route53', new route53.Route53Client({ region }));

  const codebuild = await load_aws_sdk('@aws-sdk/client-codebuild');
  if (codebuild) clients.set('codebuild', new codebuild.CodeBuildClient({ region }));

  const amplify = await load_aws_sdk('@aws-sdk/client-amplify');
  if (amplify) clients.set('amplify', new amplify.AmplifyClient({ region }));

  const mq = await load_aws_sdk('@aws-sdk/client-mq');
  if (mq) clients.set('mq', new mq.MqClient({ region }));

  const wafv2 = await load_aws_sdk('@aws-sdk/client-wafv2');
  if (wafv2) clients.set('wafv2', new wafv2.WAFV2Client({ region }));

  const opensearchServerless = await load_aws_sdk('@aws-sdk/client-opensearchserverless');
  if (opensearchServerless)
    clients.set('opensearch-serverless', new opensearchServerless.OpenSearchServerlessClient({ region }));

  const kinesis = await load_aws_sdk('@aws-sdk/client-kinesis');
  if (kinesis) clients.set('kinesis', new kinesis.KinesisClient({ region }));

  const ecr = await load_aws_sdk('@aws-sdk/client-ecr');
  if (ecr) clients.set('ecr', new ecr.ECRClient({ region }));

  const cloudwatch = await load_aws_sdk('@aws-sdk/client-cloudwatch');
  if (cloudwatch) clients.set('cloudwatch', new cloudwatch.CloudWatchClient({ region }));

  const timestreamWrite = await load_aws_sdk('@aws-sdk/client-timestream-write');
  if (timestreamWrite) clients.set('timestream', new timestreamWrite.TimestreamWriteClient({ region }));

  return clients;
}

/**
 * Tear down every client in `clients` that exposes a `.destroy()`
 * method. Idempotent; safe to call when some clients never received
 * SDK loading.
 */
export function destroy_aws_clients(clients: Map<string, unknown>): void {
  for (const client of clients.values()) {
    if (client && typeof (client as { destroy?: () => void }).destroy === 'function') {
      (client as { destroy: () => void }).destroy();
    }
  }
}
