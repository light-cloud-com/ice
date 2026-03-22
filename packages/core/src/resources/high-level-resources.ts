/**
 * High-Level Resource Definitions
 *
 * User-friendly abstractions over low-level cloud resources.
 * Users work with these concepts, and ICE maps them to actual cloud resources.
 */

/**
 * Node behavior type - how the node behaves in the infrastructure
 */
export type NodeBehavior =
  | 'scalable' // Can scale horizontally (containers, functions, instances)
  | 'container' // Wraps/contains other resources (VPC, subnet, resource group)
  | 'singleton' // Single instance (DNS zone, secret store)
  | 'streaming' // Continuous data flow (logs, event streams, queues)
  | 'stateful' // Holds persistent data (databases, storage)
  | 'connector'; // Connects other resources (load balancer, API gateway)

/**
 * Provider-specific implementation of a high-level resource
 */
export interface ProviderImplementation {
  provider: 'aws' | 'gcp' | 'azure' | 'kubernetes' | 'alibaba' | 'oci' | 'digitalocean';
  resource_type: string; // e.g., 'aws:s3:Bucket', 'gcp:storage:Bucket'
  display_name: string; // e.g., 'S3 Bucket', 'Cloud Storage Bucket'
}

export interface HighLevelResource {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  // Node behavior type
  behavior: NodeBehavior;
  // Which providers support this resource
  providers: Array<'aws' | 'gcp' | 'azure' | 'kubernetes' | 'alibaba' | 'oci' | 'digitalocean'>;
  // Provider-specific implementations
  implementations: ProviderImplementation[];
  // Keywords to match against low-level resources
  keywords: string[];
  // Common properties users care about
  properties: HighLevelProperty[];
}

export interface HighLevelProperty {
  name: string;
  label: string;
  type: 'string' | 'number' | 'boolean' | 'select';
  required: boolean;
  description: string;
  options?: string[];
  default?: any;
}

export interface HighLevelCategory {
  id: string;
  name: string;
  description: string;
  icon: string;
  resources: HighLevelResource[];
}

/**
 * High-level resource categories that make sense to developers
 */
export const HIGH_LEVEL_CATEGORIES: HighLevelCategory[] = [
  {
    id: 'application',
    name: 'Application',
    description: 'Web apps, APIs, and services',
    icon: 'Globe',
    resources: [
      {
        id: 'frontend-app',
        name: 'Frontend App',
        description: 'Static website or single-page application with CDN',
        icon: 'Layout',
        category: 'application',
        behavior: 'singleton' as NodeBehavior,
        providers: ['aws', 'gcp', 'azure'],
        implementations: [
          {
            provider: 'aws',
            resource_type: 'aws:s3:BucketWebsiteConfiguration',
            display_name: 'S3 Static Website',
          },
          {
            provider: 'gcp',
            resource_type: 'gcp:storage:Bucket',
            display_name: 'Cloud Storage Static Site',
          },
          {
            provider: 'azure',
            resource_type: 'azure:storage:StaticWebsite',
            display_name: 'Azure Static Web App',
          },
        ],
        keywords: ['static', 'website', 's3', 'bucket', 'cloudfront', 'cdn', 'blob', 'storage'],
        properties: [
          {
            name: 'name',
            label: 'App Name',
            type: 'string',
            required: true,
            description: 'Name of your frontend application',
          },
          {
            name: 'framework',
            label: 'Framework',
            type: 'select',
            required: false,
            description: 'Frontend framework',
            options: ['React', 'Vue', 'Angular', 'Next.js', 'Static HTML'],
          },
          {
            name: 'custom_domain',
            label: 'Custom Domain',
            type: 'string',
            required: false,
            description: 'Custom domain name (e.g., app.example.com)',
          },
          {
            name: 'enable_cdn',
            label: 'Enable CDN',
            type: 'boolean',
            required: false,
            description: 'Use CDN for faster global delivery',
            default: true,
          },
        ],
      },
      {
        id: 'backend-api',
        name: 'Backend API',
        description: 'REST or GraphQL API service',
        icon: 'Server',
        category: 'application',
        behavior: 'scalable' as NodeBehavior,
        providers: ['aws', 'gcp', 'azure', 'kubernetes'],
        implementations: [
          { provider: 'aws', resource_type: 'aws:apigatewayv2:Api', display_name: 'API Gateway' },
          { provider: 'gcp', resource_type: 'gcp:cloudrun:Service', display_name: 'Cloud Run' },
          {
            provider: 'azure',
            resource_type: 'azure:apimanagement:Api',
            display_name: 'API Management',
          },
          {
            provider: 'kubernetes',
            resource_type: 'kubernetes:apps/v1:Deployment',
            display_name: 'K8s Deployment',
          },
        ],
        keywords: ['api', 'gateway', 'lambda', 'function', 'app', 'service', 'ecs', 'container'],
        properties: [
          {
            name: 'name',
            label: 'API Name',
            type: 'string',
            required: true,
            description: 'Name of your API',
          },
          {
            name: 'runtime',
            label: 'Runtime',
            type: 'select',
            required: true,
            description: 'Programming language',
            options: ['Node.js', 'Python', 'Go', 'Java', '.NET', 'Ruby'],
          },
          {
            name: 'type',
            label: 'API Type',
            type: 'select',
            required: false,
            description: 'Type of API',
            options: ['REST', 'GraphQL', 'gRPC'],
          },
          {
            name: 'auth',
            label: 'Authentication',
            type: 'select',
            required: false,
            description: 'Auth method',
            options: ['None', 'API Key', 'JWT', 'OAuth'],
          },
        ],
      },
      {
        id: 'serverless-function',
        name: 'Serverless Function',
        description: 'Event-driven function that scales automatically',
        icon: 'Zap',
        category: 'application',
        behavior: 'scalable' as NodeBehavior,
        providers: ['aws', 'gcp', 'azure'],
        implementations: [
          {
            provider: 'aws',
            resource_type: 'aws:lambda:Function',
            display_name: 'Lambda Function',
          },
          {
            provider: 'gcp',
            resource_type: 'gcp:cloudfunctions:Function',
            display_name: 'Cloud Function',
          },
          {
            provider: 'azure',
            resource_type: 'azure:web:Function',
            display_name: 'Azure Function',
          },
        ],
        keywords: ['lambda', 'function', 'serverless', 'cloud function'],
        properties: [
          {
            name: 'name',
            label: 'Function Name',
            type: 'string',
            required: true,
            description: 'Name of your function',
          },
          {
            name: 'runtime',
            label: 'Runtime',
            type: 'select',
            required: true,
            description: 'Programming language',
            options: ['Node.js 20', 'Python 3.12', 'Go 1.x', 'Java 21', '.NET 8'],
          },
          {
            name: 'memory',
            label: 'Memory (MB)',
            type: 'number',
            required: false,
            description: 'Memory allocation',
            default: 256,
          },
          {
            name: 'timeout',
            label: 'Timeout (sec)',
            type: 'number',
            required: false,
            description: 'Max execution time',
            default: 30,
          },
        ],
      },
      {
        id: 'function-compute',
        name: 'Function Compute',
        description: 'Alibaba Cloud serverless functions with event-driven execution',
        icon: 'Zap',
        category: 'application',
        behavior: 'scalable' as NodeBehavior,
        providers: ['alibaba'],
        implementations: [
          {
            provider: 'alibaba',
            resource_type: 'alibaba:fc:Function',
            display_name: 'Function Compute',
          },
        ],
        keywords: ['function', 'compute', 'serverless', 'alibaba', 'fc'],
        properties: [
          {
            name: 'name',
            label: 'Function Name',
            type: 'string',
            required: true,
            description: 'Name of your function',
          },
          {
            name: 'runtime',
            label: 'Runtime',
            type: 'select',
            required: true,
            description: 'Programming language',
            options: ['Node.js 20', 'Python 3.10', 'Java 11', 'Go 1.x'],
            default: 'Node.js 20',
          },
          {
            name: 'memory',
            label: 'Memory (MB)',
            type: 'number',
            required: false,
            description: 'Memory allocation',
            default: 256,
          },
          {
            name: 'timeout',
            label: 'Timeout (sec)',
            type: 'number',
            required: false,
            description: 'Max execution time',
            default: 60,
          },
        ],
      },
      {
        id: 'oci-functions',
        name: 'OCI Functions',
        description: 'Oracle Cloud serverless functions based on Fn Project',
        icon: 'Zap',
        category: 'application',
        behavior: 'scalable' as NodeBehavior,
        providers: ['oci'],
        implementations: [
          {
            provider: 'oci',
            resource_type: 'oci:functions:Function',
            display_name: 'OCI Function',
          },
        ],
        keywords: ['functions', 'serverless', 'oci', 'oracle', 'fn'],
        properties: [
          {
            name: 'name',
            label: 'Function Name',
            type: 'string',
            required: true,
            description: 'Name of your function',
          },
          {
            name: 'runtime',
            label: 'Runtime',
            type: 'select',
            required: true,
            description: 'Programming language',
            options: ['Node.js 18', 'Python 3.9', 'Java 17', 'Go 1.x'],
            default: 'Node.js 18',
          },
          {
            name: 'memory',
            label: 'Memory (MB)',
            type: 'number',
            required: false,
            description: 'Memory allocation',
            default: 256,
          },
          {
            name: 'timeout',
            label: 'Timeout (sec)',
            type: 'number',
            required: false,
            description: 'Max execution time',
            default: 30,
          },
        ],
      },
      {
        id: 'do-app-platform',
        name: 'App Platform',
        description: 'DigitalOcean PaaS with git-push deployment',
        icon: 'Server',
        category: 'application',
        behavior: 'scalable' as NodeBehavior,
        providers: ['digitalocean'],
        implementations: [
          {
            provider: 'digitalocean',
            resource_type: 'digitalocean:app:App',
            display_name: 'App Platform App',
          },
        ],
        keywords: ['app', 'platform', 'paas', 'digitalocean', 'deploy'],
        properties: [
          {
            name: 'name',
            label: 'App Name',
            type: 'string',
            required: true,
            description: 'Name of your application',
          },
          {
            name: 'runtime',
            label: 'Runtime',
            type: 'select',
            required: true,
            description: 'Runtime environment',
            options: ['Node.js', 'Python', 'Go', 'Ruby', 'Docker'],
            default: 'Node.js',
          },
          {
            name: 'instances',
            label: 'Instances',
            type: 'number',
            required: false,
            description: 'Number of instances',
            default: 1,
          },
        ],
      },
      {
        id: 'container-service',
        name: 'Container Service',
        description: 'Dockerized application running in containers',
        icon: 'Box',
        category: 'application',
        behavior: 'scalable' as NodeBehavior,
        providers: ['aws', 'gcp', 'azure', 'kubernetes'],
        implementations: [
          { provider: 'aws', resource_type: 'aws:ecs:Service', display_name: 'ECS Service' },
          { provider: 'gcp', resource_type: 'gcp:cloudrun:Service', display_name: 'Cloud Run' },
          {
            provider: 'azure',
            resource_type: 'azure:containerapp:ContainerApp',
            display_name: 'Container App',
          },
          {
            provider: 'kubernetes',
            resource_type: 'kubernetes:apps/v1:Deployment',
            display_name: 'K8s Deployment',
          },
        ],
        keywords: ['container', 'docker', 'ecs', 'kubernetes', 'k8s', 'fargate', 'aks', 'gke'],
        properties: [
          {
            name: 'name',
            label: 'Service Name',
            type: 'string',
            required: true,
            description: 'Name of your container service',
          },
          {
            name: 'image',
            label: 'Docker Image',
            type: 'string',
            required: true,
            description: 'Container image (e.g., nginx:latest)',
          },
          {
            name: 'port',
            label: 'Port',
            type: 'number',
            required: true,
            description: 'Container port',
            default: 80,
          },
          {
            name: 'replicas',
            label: 'Replicas',
            type: 'number',
            required: false,
            description: 'Number of instances',
            default: 2,
          },
          {
            name: 'cpu',
            label: 'CPU Units',
            type: 'number',
            required: false,
            description: 'CPU allocation',
            default: 256,
          },
          {
            name: 'memory',
            label: 'Memory (MB)',
            type: 'number',
            required: false,
            description: 'Memory allocation',
            default: 512,
          },
        ],
      },
      {
        id: 'worker',
        name: 'Worker',
        description: 'Long-running background processor for queues, events, and batch jobs',
        icon: 'Cog',
        category: 'application',
        behavior: 'scalable' as NodeBehavior,
        providers: ['aws', 'gcp', 'azure', 'kubernetes'],
        implementations: [
          { provider: 'aws', resource_type: 'aws:ecs:Service', display_name: 'ECS Task (Worker)' },
          { provider: 'gcp', resource_type: 'gcp:cloudrun:Job', display_name: 'Cloud Run Job' },
          {
            provider: 'azure',
            resource_type: 'azure:containerapp:ContainerApp',
            display_name: 'Container App Job',
          },
          {
            provider: 'kubernetes',
            resource_type: 'kubernetes:batch/v1:Job',
            display_name: 'K8s Job',
          },
        ],
        keywords: ['worker', 'consumer', 'processor', 'background', 'async', 'batch'],
        properties: [
          {
            name: 'name',
            label: 'Worker Name',
            type: 'string',
            required: true,
            description: 'Name of your worker',
          },
          {
            name: 'runtime',
            label: 'Runtime',
            type: 'select',
            required: true,
            description: 'Programming language',
            options: ['Node.js 20', 'Python 3.12', 'Go 1.22', 'Java 21'],
          },
          {
            name: 'concurrency',
            label: 'Concurrency',
            type: 'number',
            required: false,
            description: 'Max concurrent tasks',
            default: 5,
          },
          {
            name: 'image',
            label: 'Docker Image',
            type: 'string',
            required: false,
            description: 'Container image',
          },
        ],
      },
      {
        id: 'ssr-site',
        name: 'SSR Site',
        description: 'Server-rendered web application (Next.js, Nuxt, Remix)',
        icon: 'Monitor',
        category: 'application',
        behavior: 'scalable' as NodeBehavior,
        providers: ['aws', 'gcp', 'azure'],
        implementations: [
          { provider: 'aws', resource_type: 'aws:amplify:App', display_name: 'Amplify Hosting' },
          { provider: 'gcp', resource_type: 'gcp:cloudrun:Service', display_name: 'Cloud Run' },
          { provider: 'azure', resource_type: 'azure:web:AppService', display_name: 'App Service' },
        ],
        keywords: ['ssr', 'nextjs', 'nuxt', 'remix', 'sveltekit', 'server', 'rendered'],
        properties: [
          {
            name: 'name',
            label: 'App Name',
            type: 'string',
            required: true,
            description: 'Name of your SSR application',
          },
          {
            name: 'framework',
            label: 'Framework',
            type: 'select',
            required: true,
            description: 'SSR framework',
            options: ['Next.js 14', 'Next.js 15', 'Nuxt 3', 'Remix', 'SvelteKit', 'Astro'],
          },
          {
            name: 'custom_domain',
            label: 'Custom Domain',
            type: 'string',
            required: false,
            description: 'Custom domain name',
          },
          {
            name: 'port',
            label: 'Port',
            type: 'number',
            required: false,
            description: 'Application port',
            default: 3000,
          },
        ],
      },
      {
        id: 'scheduled-task',
        name: 'Scheduled Task',
        description: 'Run code on a schedule (cron jobs)',
        icon: 'Clock',
        category: 'application',
        behavior: 'singleton' as NodeBehavior,
        providers: ['aws', 'gcp', 'azure'],
        implementations: [
          {
            provider: 'aws',
            resource_type: 'aws:scheduler:Schedule',
            display_name: 'EventBridge Scheduler',
          },
          {
            provider: 'gcp',
            resource_type: 'gcp:cloudscheduler:Job',
            display_name: 'Cloud Scheduler',
          },
          {
            provider: 'azure',
            resource_type: 'azure:logic:Workflow',
            display_name: 'Logic App Schedule',
          },
        ],
        keywords: ['cron', 'schedule', 'scheduler', 'timer', 'job', 'task', 'periodic'],
        properties: [
          {
            name: 'name',
            label: 'Task Name',
            type: 'string',
            required: true,
            description: 'Name of your scheduled task',
          },
          {
            name: 'schedule',
            label: 'Schedule (Cron)',
            type: 'string',
            required: true,
            description: 'Cron expression (e.g., 0 * * * *)',
          },
          {
            name: 'timezone',
            label: 'Timezone',
            type: 'string',
            required: false,
            description: 'Timezone for schedule',
            default: 'UTC',
          },
        ],
      },
      {
        id: 'llm-gateway',
        name: 'LLM Gateway',
        description: 'Proxy and route LLM API calls with rate limiting and fallbacks',
        icon: 'BrainCircuit',
        category: 'application',
        behavior: 'connector' as NodeBehavior,
        providers: ['aws', 'gcp', 'azure'],
        implementations: [
          {
            provider: 'aws',
            resource_type: 'aws:bedrock:InferenceProfile',
            display_name: 'Bedrock',
          },
          {
            provider: 'gcp',
            resource_type: 'gcp:aiplatform:Endpoint',
            display_name: 'Vertex AI Endpoint',
          },
          {
            provider: 'azure',
            resource_type: 'azure:cognitiveservices:Account',
            display_name: 'Azure OpenAI',
          },
        ],
        keywords: ['llm', 'openai', 'bedrock', 'anthropic', 'ai', 'gpt', 'claude', 'inference'],
        properties: [
          {
            name: 'name',
            label: 'Gateway Name',
            type: 'string',
            required: true,
            description: 'Name of your LLM gateway',
          },
          {
            name: 'router',
            label: 'Router',
            type: 'select',
            required: false,
            description: 'Routing strategy',
            options: ['LiteLLM', 'OpenRouter', 'Custom Proxy'],
          },
          {
            name: 'port',
            label: 'Port',
            type: 'number',
            required: false,
            description: 'Gateway port',
            default: 4000,
          },
        ],
      },
      {
        id: 'ml-model',
        name: 'ML Model Serving',
        description: 'Deploy and serve machine learning models with GPU support',
        icon: 'Brain',
        category: 'application',
        behavior: 'scalable' as NodeBehavior,
        providers: ['aws', 'gcp', 'azure'],
        implementations: [
          {
            provider: 'aws',
            resource_type: 'aws:sagemaker:Endpoint',
            display_name: 'SageMaker Endpoint',
          },
          {
            provider: 'gcp',
            resource_type: 'gcp:aiplatform:Endpoint',
            display_name: 'Vertex AI Endpoint',
          },
          {
            provider: 'azure',
            resource_type: 'azure:machinelearningservices:OnlineEndpoint',
            display_name: 'Azure ML Endpoint',
          },
        ],
        keywords: ['ml', 'model', 'sagemaker', 'vertex', 'inference', 'serving', 'gpu'],
        properties: [
          {
            name: 'name',
            label: 'Endpoint Name',
            type: 'string',
            required: true,
            description: 'Name of your model endpoint',
          },
          {
            name: 'framework',
            label: 'Framework',
            type: 'select',
            required: false,
            description: 'Serving framework',
            options: ['TorchServe', 'TFServing', 'Triton', 'vLLM', 'Ollama', 'BentoML'],
          },
          {
            name: 'gpu',
            label: 'GPU Type',
            type: 'select',
            required: false,
            description: 'GPU acceleration',
            options: ['None', 'T4', 'A10G', 'A100', 'H100', 'L4'],
          },
          {
            name: 'port',
            label: 'Port',
            type: 'number',
            required: false,
            description: 'Serving port',
            default: 8080,
          },
        ],
      },
    ],
  },
  {
    id: 'database',
    name: 'Database',
    description: 'Relational, NoSQL, and cache databases',
    icon: 'Database',
    resources: [
      {
        id: 'postgres-db',
        name: 'PostgreSQL',
        description: 'Managed PostgreSQL relational database',
        icon: 'Database',
        category: 'database',
        behavior: 'stateful' as NodeBehavior,
        providers: ['aws', 'gcp', 'azure', 'digitalocean'],
        implementations: [
          { provider: 'aws', resource_type: 'aws:rds:Instance', display_name: 'RDS PostgreSQL' },
          {
            provider: 'gcp',
            resource_type: 'gcp:sql:DatabaseInstance',
            display_name: 'Cloud SQL PostgreSQL',
          },
          {
            provider: 'azure',
            resource_type: 'azure:postgresql:Server',
            display_name: 'Azure PostgreSQL',
          },
          {
            provider: 'digitalocean',
            resource_type: 'digitalocean:database:Cluster',
            display_name: 'DO Managed PostgreSQL',
          },
        ],
        keywords: ['postgres', 'postgresql', 'rds', 'sql', 'database', 'cloudsql'],
        properties: [
          {
            name: 'name',
            label: 'Database Name',
            type: 'string',
            required: true,
            description: 'Name of your database',
          },
          {
            name: 'version',
            label: 'Version',
            type: 'select',
            required: false,
            description: 'PostgreSQL version',
            options: ['16', '15', '14', '13'],
            default: '16',
          },
          {
            name: 'size',
            label: 'Instance Size',
            type: 'select',
            required: true,
            description: 'Database size',
            options: ['Small (2 vCPU, 4GB)', 'Medium (4 vCPU, 8GB)', 'Large (8 vCPU, 16GB)'],
          },
          {
            name: 'storage_gb',
            label: 'Storage (GB)',
            type: 'number',
            required: true,
            description: 'Storage size',
            default: 20,
          },
          {
            name: 'high_availability',
            label: 'High Availability',
            type: 'boolean',
            required: false,
            description: 'Enable multi-AZ deployment',
            default: false,
          },
        ],
      },
      {
        id: 'mysql-db',
        name: 'MySQL',
        description: 'Managed MySQL relational database',
        icon: 'Database',
        category: 'database',
        behavior: 'stateful' as NodeBehavior,
        providers: ['aws', 'gcp', 'azure', 'digitalocean'],
        implementations: [
          { provider: 'aws', resource_type: 'aws:rds:Instance', display_name: 'RDS MySQL' },
          {
            provider: 'gcp',
            resource_type: 'gcp:sql:DatabaseInstance',
            display_name: 'Cloud SQL MySQL',
          },
          { provider: 'azure', resource_type: 'azure:mysql:Server', display_name: 'Azure MySQL' },
          {
            provider: 'digitalocean',
            resource_type: 'digitalocean:database:Cluster',
            display_name: 'DO Managed MySQL',
          },
        ],
        keywords: ['mysql', 'rds', 'sql', 'database', 'aurora', 'mariadb'],
        properties: [
          {
            name: 'name',
            label: 'Database Name',
            type: 'string',
            required: true,
            description: 'Name of your database',
          },
          {
            name: 'version',
            label: 'Version',
            type: 'select',
            required: false,
            description: 'MySQL version',
            options: ['8.0', '5.7'],
            default: '8.0',
          },
          {
            name: 'size',
            label: 'Instance Size',
            type: 'select',
            required: true,
            description: 'Database size',
            options: ['Small (2 vCPU, 4GB)', 'Medium (4 vCPU, 8GB)', 'Large (8 vCPU, 16GB)'],
          },
          {
            name: 'storage_gb',
            label: 'Storage (GB)',
            type: 'number',
            required: true,
            description: 'Storage size',
            default: 20,
          },
        ],
      },
      {
        id: 'mongodb',
        name: 'MongoDB',
        description: 'Managed NoSQL document database',
        icon: 'Database',
        category: 'database',
        behavior: 'stateful' as NodeBehavior,
        providers: ['aws', 'azure', 'digitalocean'],
        implementations: [
          { provider: 'aws', resource_type: 'aws:docdb:Cluster', display_name: 'DocumentDB' },
          { provider: 'azure', resource_type: 'azure:cosmosdb:Account', display_name: 'Cosmos DB' },
          {
            provider: 'digitalocean',
            resource_type: 'digitalocean:database:Cluster',
            display_name: 'DO Managed MongoDB',
          },
        ],
        keywords: ['mongo', 'mongodb', 'nosql', 'documentdb', 'cosmos'],
        properties: [
          {
            name: 'name',
            label: 'Cluster Name',
            type: 'string',
            required: true,
            description: 'Name of your MongoDB cluster',
          },
          {
            name: 'size',
            label: 'Instance Size',
            type: 'select',
            required: true,
            description: 'Cluster size',
            options: ['Shared (Free)', 'Small', 'Medium', 'Large'],
          },
        ],
      },
      {
        id: 'redis-cache',
        name: 'Redis Cache',
        description: 'In-memory cache for fast data access',
        icon: 'Zap',
        category: 'database',
        behavior: 'stateful' as NodeBehavior,
        providers: ['aws', 'gcp', 'azure', 'digitalocean'],
        implementations: [
          {
            provider: 'aws',
            resource_type: 'aws:elasticache:Cluster',
            display_name: 'ElastiCache Redis',
          },
          {
            provider: 'gcp',
            resource_type: 'gcp:redis:Instance',
            display_name: 'Memorystore Redis',
          },
          {
            provider: 'azure',
            resource_type: 'azure:redis:Cache',
            display_name: 'Azure Cache for Redis',
          },
          {
            provider: 'digitalocean',
            resource_type: 'digitalocean:database:Cluster',
            display_name: 'DO Managed Redis',
          },
        ],
        keywords: ['redis', 'cache', 'elasticache', 'memorystore', 'memory'],
        properties: [
          {
            name: 'name',
            label: 'Cache Name',
            type: 'string',
            required: true,
            description: 'Name of your cache',
          },
          {
            name: 'size',
            label: 'Node Size',
            type: 'select',
            required: true,
            description: 'Cache size',
            options: ['Small (1.5GB)', 'Medium (3GB)', 'Large (6GB)'],
          },
          {
            name: 'cluster_mode',
            label: 'Cluster Mode',
            type: 'boolean',
            required: false,
            description: 'Enable cluster mode for scaling',
            default: false,
          },
        ],
      },
      {
        id: 'dynamodb',
        name: 'DynamoDB',
        description:
          'NoSQL key-value and document database with single-digit millisecond performance',
        icon: 'Database',
        category: 'database',
        behavior: 'stateful' as NodeBehavior,
        providers: ['aws'],
        implementations: [
          { provider: 'aws', resource_type: 'aws:dynamodb:Table', display_name: 'DynamoDB Table' },
        ],
        keywords: ['dynamodb', 'dynamo', 'nosql', 'key-value', 'document'],
        properties: [
          {
            name: 'name',
            label: 'Table Name',
            type: 'string',
            required: true,
            description: 'Name of your DynamoDB table',
          },
          {
            name: 'billing_mode',
            label: 'Billing Mode',
            type: 'select',
            required: false,
            description: 'Capacity billing mode',
            options: ['On-Demand', 'Provisioned'],
            default: 'On-Demand',
          },
          {
            name: 'partition_key',
            label: 'Partition Key',
            type: 'string',
            required: true,
            description: 'Primary partition key',
          },
        ],
      },
      {
        id: 'firestore',
        name: 'Firestore',
        description: 'Document database with real-time sync and offline support',
        icon: 'Database',
        category: 'database',
        behavior: 'stateful' as NodeBehavior,
        providers: ['gcp'],
        implementations: [
          {
            provider: 'gcp',
            resource_type: 'gcp:firestore:Database',
            display_name: 'Firestore Database',
          },
        ],
        keywords: ['firestore', 'firebase', 'document', 'realtime', 'nosql'],
        properties: [
          {
            name: 'name',
            label: 'Database Name',
            type: 'string',
            required: true,
            description: 'Name of your Firestore database',
          },
          {
            name: 'mode',
            label: 'Mode',
            type: 'select',
            required: false,
            description: 'Database mode',
            options: ['Native', 'Datastore'],
            default: 'Native',
          },
        ],
      },
      {
        id: 'cosmosdb',
        name: 'Cosmos DB',
        description: 'Multi-model database with global distribution and guaranteed low latency',
        icon: 'Database',
        category: 'database',
        behavior: 'stateful' as NodeBehavior,
        providers: ['azure'],
        implementations: [
          {
            provider: 'azure',
            resource_type: 'azure:cosmosdb:Account',
            display_name: 'Cosmos DB Account',
          },
        ],
        keywords: ['cosmosdb', 'cosmos', 'multi-model', 'global', 'nosql'],
        properties: [
          {
            name: 'name',
            label: 'Account Name',
            type: 'string',
            required: true,
            description: 'Name of your Cosmos DB account',
          },
          {
            name: 'api',
            label: 'API',
            type: 'select',
            required: false,
            description: 'Database API',
            options: ['NoSQL', 'MongoDB', 'Cassandra', 'Gremlin', 'Table'],
            default: 'NoSQL',
          },
          {
            name: 'consistency',
            label: 'Consistency',
            type: 'select',
            required: false,
            description: 'Consistency level',
            options: ['Strong', 'Bounded Staleness', 'Session', 'Eventual'],
            default: 'Session',
          },
        ],
      },
      {
        id: 'tablestore',
        name: 'Tablestore',
        description: 'NoSQL wide-column store with serverless auto-scaling',
        icon: 'Database',
        category: 'database',
        behavior: 'stateful' as NodeBehavior,
        providers: ['alibaba'],
        implementations: [
          {
            provider: 'alibaba',
            resource_type: 'alibaba:ots:Instance',
            display_name: 'Tablestore Instance',
          },
        ],
        keywords: ['tablestore', 'ots', 'wide-column', 'nosql', 'alibaba'],
        properties: [
          {
            name: 'name',
            label: 'Instance Name',
            type: 'string',
            required: true,
            description: 'Name of your Tablestore instance',
          },
          {
            name: 'capacity',
            label: 'Capacity',
            type: 'select',
            required: false,
            description: 'Capacity mode',
            options: ['Reserved', 'On-demand'],
            default: 'On-demand',
          },
        ],
      },
      {
        id: 'autonomous-db',
        name: 'Autonomous Database',
        description: 'Self-managing Oracle database with automated tuning and patching',
        icon: 'Database',
        category: 'database',
        behavior: 'stateful' as NodeBehavior,
        providers: ['oci'],
        implementations: [
          {
            provider: 'oci',
            resource_type: 'oci:database:AutonomousDatabase',
            display_name: 'Autonomous Database',
          },
        ],
        keywords: ['autonomous', 'oracle', 'adb', 'self-managing', 'oci'],
        properties: [
          {
            name: 'name',
            label: 'Database Name',
            type: 'string',
            required: true,
            description: 'Name of your Autonomous Database',
          },
          {
            name: 'workload',
            label: 'Workload',
            type: 'select',
            required: false,
            description: 'Workload type',
            options: ['OLTP', 'DW', 'JSON', 'APEX'],
            default: 'OLTP',
          },
          {
            name: 'ocpus',
            label: 'OCPUs',
            type: 'number',
            required: false,
            description: 'Number of OCPUs',
            default: 1,
          },
        ],
      },
      {
        id: 'do-managed-db',
        name: 'Managed Database',
        description: 'Simple managed database with automatic failover',
        icon: 'Database',
        category: 'database',
        behavior: 'stateful' as NodeBehavior,
        providers: ['digitalocean'],
        implementations: [
          {
            provider: 'digitalocean',
            resource_type: 'digitalocean:database:Cluster',
            display_name: 'Managed Database Cluster',
          },
        ],
        keywords: ['managed', 'database', 'digitalocean', 'postgres', 'mysql', 'redis'],
        properties: [
          {
            name: 'name',
            label: 'Cluster Name',
            type: 'string',
            required: true,
            description: 'Name of your database cluster',
          },
          {
            name: 'engine',
            label: 'Engine',
            type: 'select',
            required: true,
            description: 'Database engine',
            options: ['PostgreSQL', 'MySQL', 'Redis'],
            default: 'PostgreSQL',
          },
          {
            name: 'size',
            label: 'Size',
            type: 'select',
            required: false,
            description: 'Node size',
            options: ['db-s-1vcpu-1gb', 'db-s-1vcpu-2gb', 'db-s-2vcpu-4gb'],
            default: 'db-s-1vcpu-1gb',
          },
        ],
      },
      {
        id: 'vector-db',
        name: 'Vector Database',
        description: 'Store and search vector embeddings for AI/ML applications',
        icon: 'Compass',
        category: 'database',
        behavior: 'stateful' as NodeBehavior,
        providers: ['aws', 'gcp', 'azure'],
        implementations: [
          {
            provider: 'aws',
            resource_type: 'aws:opensearch:Domain',
            display_name: 'OpenSearch (k-NN)',
          },
          {
            provider: 'gcp',
            resource_type: 'gcp:aiplatform:FeaturestoreEntitytype',
            display_name: 'Vertex AI Vector Search',
          },
          {
            provider: 'azure',
            resource_type: 'azure:search:Service',
            display_name: 'Azure AI Search',
          },
        ],
        keywords: [
          'vector',
          'embedding',
          'pinecone',
          'weaviate',
          'qdrant',
          'pgvector',
          'chromadb',
          'milvus',
        ],
        properties: [
          {
            name: 'name',
            label: 'Store Name',
            type: 'string',
            required: true,
            description: 'Name of your vector store',
          },
          {
            name: 'engine',
            label: 'Engine',
            type: 'select',
            required: true,
            description: 'Vector engine',
            options: ['Pinecone', 'Weaviate', 'Qdrant', 'pgvector', 'ChromaDB', 'Milvus'],
          },
          {
            name: 'dimensions',
            label: 'Dimensions',
            type: 'number',
            required: false,
            description: 'Vector dimensions',
            default: 1536,
          },
        ],
      },
      {
        id: 'data-warehouse',
        name: 'Data Warehouse',
        description: 'Columnar analytics database for large-scale queries',
        icon: 'Warehouse',
        category: 'database',
        behavior: 'stateful' as NodeBehavior,
        providers: ['aws', 'gcp', 'azure'],
        implementations: [
          { provider: 'aws', resource_type: 'aws:redshift:Cluster', display_name: 'Redshift' },
          { provider: 'gcp', resource_type: 'gcp:bigquery:Dataset', display_name: 'BigQuery' },
          {
            provider: 'azure',
            resource_type: 'azure:synapse:Workspace',
            display_name: 'Synapse Analytics',
          },
        ],
        keywords: [
          'warehouse',
          'redshift',
          'bigquery',
          'snowflake',
          'clickhouse',
          'analytics',
          'olap',
        ],
        properties: [
          {
            name: 'name',
            label: 'Warehouse Name',
            type: 'string',
            required: true,
            description: 'Name of your data warehouse',
          },
          {
            name: 'engine',
            label: 'Engine',
            type: 'select',
            required: true,
            description: 'Warehouse engine',
            options: ['BigQuery', 'Redshift', 'Snowflake', 'ClickHouse'],
          },
        ],
      },
      {
        id: 'search-engine',
        name: 'Search Engine',
        description: 'Full-text search and analytics engine',
        icon: 'Search',
        category: 'database',
        behavior: 'stateful' as NodeBehavior,
        providers: ['aws', 'gcp', 'azure'],
        implementations: [
          { provider: 'aws', resource_type: 'aws:opensearch:Domain', display_name: 'OpenSearch' },
          {
            provider: 'gcp',
            resource_type: 'gcp:discoveryengine:SearchEngine',
            display_name: 'Vertex AI Search',
          },
          {
            provider: 'azure',
            resource_type: 'azure:search:Service',
            display_name: 'Azure Cognitive Search',
          },
        ],
        keywords: ['search', 'elasticsearch', 'opensearch', 'algolia', 'fulltext'],
        properties: [
          {
            name: 'name',
            label: 'Cluster Name',
            type: 'string',
            required: true,
            description: 'Name of your search cluster',
          },
          {
            name: 'engine',
            label: 'Engine',
            type: 'select',
            required: true,
            description: 'Search engine',
            options: ['OpenSearch 2.11', 'Elasticsearch 8', 'Algolia'],
          },
          {
            name: 'port',
            label: 'Port',
            type: 'number',
            required: false,
            description: 'Cluster port',
            default: 9200,
          },
        ],
      },
    ],
  },
  {
    id: 'storage',
    name: 'Storage',
    description: 'File and object storage',
    icon: 'HardDrive',
    resources: [
      {
        id: 'object-storage',
        name: 'Object Storage',
        description: 'Store files, images, videos, and backups',
        icon: 'Archive',
        category: 'storage',
        behavior: 'stateful' as NodeBehavior,
        providers: ['aws', 'gcp', 'azure', 'alibaba', 'oci', 'digitalocean'],
        implementations: [
          { provider: 'aws', resource_type: 'aws:s3:Bucket', display_name: 'S3 Bucket' },
          {
            provider: 'gcp',
            resource_type: 'gcp:storage:Bucket',
            display_name: 'Cloud Storage Bucket',
          },
          {
            provider: 'azure',
            resource_type: 'azure:storage:Container',
            display_name: 'Azure Blob Container',
          },
          { provider: 'alibaba', resource_type: 'alibaba:oss:Bucket', display_name: 'OSS Bucket' },
          {
            provider: 'oci',
            resource_type: 'oci:objectstorage:Bucket',
            display_name: 'OCI Object Storage',
          },
          {
            provider: 'digitalocean',
            resource_type: 'digitalocean:spaces:Bucket',
            display_name: 'Spaces Bucket',
          },
        ],
        keywords: ['s3', 'bucket', 'blob', 'storage', 'gcs', 'object'],
        properties: [
          {
            name: 'name',
            label: 'Bucket Name',
            type: 'string',
            required: true,
            description: 'Globally unique bucket name',
          },
          {
            name: 'public',
            label: 'Public Access',
            type: 'boolean',
            required: false,
            description: 'Allow public read access',
            default: false,
          },
          {
            name: 'versioning',
            label: 'Versioning',
            type: 'boolean',
            required: false,
            description: 'Enable file versioning',
            default: false,
          },
        ],
      },
      {
        id: 'oss',
        name: 'OSS',
        description: 'Alibaba Cloud object storage with China-optimized CDN',
        icon: 'HardDrive',
        category: 'storage',
        behavior: 'stateful' as NodeBehavior,
        providers: ['alibaba'],
        implementations: [
          { provider: 'alibaba', resource_type: 'alibaba:oss:Bucket', display_name: 'OSS Bucket' },
        ],
        keywords: ['oss', 'object', 'storage', 'alibaba', 'bucket'],
        properties: [
          {
            name: 'name',
            label: 'Bucket Name',
            type: 'string',
            required: true,
            description: 'Globally unique bucket name',
          },
          {
            name: 'storageClass',
            label: 'Storage Class',
            type: 'select',
            required: false,
            description: 'Storage class',
            options: ['Standard', 'IA', 'Archive', 'Cold Archive'],
            default: 'Standard',
          },
        ],
      },
      {
        id: 'oci-object-storage',
        name: 'OCI Object Storage',
        description: 'Enterprise object storage with automatic tiering',
        icon: 'HardDrive',
        category: 'storage',
        behavior: 'stateful' as NodeBehavior,
        providers: ['oci'],
        implementations: [
          {
            provider: 'oci',
            resource_type: 'oci:objectstorage:Bucket',
            display_name: 'OCI Object Storage Bucket',
          },
        ],
        keywords: ['oci', 'object', 'storage', 'oracle', 'bucket'],
        properties: [
          {
            name: 'name',
            label: 'Bucket Name',
            type: 'string',
            required: true,
            description: 'Bucket name within your namespace',
          },
          {
            name: 'tier',
            label: 'Storage Tier',
            type: 'select',
            required: false,
            description: 'Storage tier',
            options: ['Standard', 'Archive'],
            default: 'Standard',
          },
        ],
      },
      {
        id: 'do-spaces',
        name: 'Spaces',
        description: 'S3-compatible object storage with built-in CDN',
        icon: 'HardDrive',
        category: 'storage',
        behavior: 'stateful' as NodeBehavior,
        providers: ['digitalocean'],
        implementations: [
          {
            provider: 'digitalocean',
            resource_type: 'digitalocean:spaces:Bucket',
            display_name: 'Spaces Bucket',
          },
        ],
        keywords: ['spaces', 'object', 'storage', 'digitalocean', 's3'],
        properties: [
          {
            name: 'name',
            label: 'Space Name',
            type: 'string',
            required: true,
            description: 'Globally unique space name',
          },
          {
            name: 'region',
            label: 'Region',
            type: 'select',
            required: false,
            description: 'Region',
            options: ['nyc3', 'sfo3', 'ams3', 'sgp1', 'fra1'],
          },
        ],
      },
      {
        id: 'file-storage',
        name: 'File Storage',
        description: 'Network file system for shared access',
        icon: 'Folder',
        category: 'storage',
        behavior: 'stateful' as NodeBehavior,
        providers: ['aws', 'gcp', 'azure'],
        implementations: [
          { provider: 'aws', resource_type: 'aws:efs:FileSystem', display_name: 'EFS File System' },
          { provider: 'gcp', resource_type: 'gcp:filestore:Instance', display_name: 'Filestore' },
          {
            provider: 'azure',
            resource_type: 'azure:storage:FileShare',
            display_name: 'Azure Files',
          },
        ],
        keywords: ['efs', 'nfs', 'file', 'filestore', 'shared'],
        properties: [
          {
            name: 'name',
            label: 'File System Name',
            type: 'string',
            required: true,
            description: 'Name of your file system',
          },
          {
            name: 'performance',
            label: 'Performance',
            type: 'select',
            required: false,
            description: 'Performance mode',
            options: ['Standard', 'Premium'],
          },
        ],
      },
    ],
  },
  {
    id: 'networking',
    name: 'Networking',
    description: 'Load balancers, CDN, DNS, and VPC',
    icon: 'Network',
    resources: [
      {
        id: 'public-traffic',
        name: 'Public Traffic',
        description: 'Internet entry point — represents users hitting your infrastructure',
        icon: 'Globe',
        category: 'networking',
        behavior: 'connector' as NodeBehavior,
        providers: ['aws', 'gcp', 'azure'],
        implementations: [
          {
            provider: 'aws',
            resource_type: 'aws:ec2:InternetGateway',
            display_name: 'Internet Gateway',
          },
          { provider: 'gcp', resource_type: 'gcp:compute:Address', display_name: 'External IP' },
          {
            provider: 'azure',
            resource_type: 'azure:network:PublicIPAddress',
            display_name: 'Public IP',
          },
        ],
        keywords: ['internet', 'public', 'traffic', 'ingress', 'entry', 'users'],
        properties: [
          {
            name: 'domain',
            label: 'Domain',
            type: 'string',
            required: false,
            description: 'Public domain name',
          },
        ],
      },
      {
        id: 'vpc-network',
        name: 'Virtual Network',
        description: 'Isolated network that contains subnets and resources',
        icon: 'Network',
        category: 'networking',
        behavior: 'container' as NodeBehavior,
        providers: ['aws', 'gcp', 'azure'],
        implementations: [
          { provider: 'aws', resource_type: 'aws:ec2:Vpc', display_name: 'VPC' },
          { provider: 'gcp', resource_type: 'gcp:compute:Network', display_name: 'VPC Network' },
          {
            provider: 'azure',
            resource_type: 'azure:network:VirtualNetwork',
            display_name: 'Virtual Network',
          },
        ],
        keywords: ['vpc', 'vnet', 'network', 'virtual', 'subnet'],
        properties: [
          {
            name: 'name',
            label: 'Network Name',
            type: 'string',
            required: true,
            description: 'Name of your network',
          },
          {
            name: 'cidr',
            label: 'CIDR Block',
            type: 'string',
            required: true,
            description: 'IP range (e.g., 10.0.0.0/16)',
            default: '10.0.0.0/16',
          },
        ],
      },
      {
        id: 'subnet',
        name: 'Subnet',
        description: 'Network subdivision within a VPC',
        icon: 'Layers',
        category: 'networking',
        behavior: 'container' as NodeBehavior,
        providers: ['aws', 'gcp', 'azure'],
        implementations: [
          { provider: 'aws', resource_type: 'aws:ec2:Subnet', display_name: 'Subnet' },
          { provider: 'gcp', resource_type: 'gcp:compute:Subnetwork', display_name: 'Subnetwork' },
          { provider: 'azure', resource_type: 'azure:network:Subnet', display_name: 'Subnet' },
        ],
        keywords: ['subnet', 'subnetwork', 'az', 'availability'],
        properties: [
          {
            name: 'name',
            label: 'Subnet Name',
            type: 'string',
            required: true,
            description: 'Name of your subnet',
          },
          {
            name: 'cidr',
            label: 'CIDR Block',
            type: 'string',
            required: true,
            description: 'IP range (e.g., 10.0.1.0/24)',
            default: '10.0.1.0/24',
          },
          {
            name: 'public',
            label: 'Public Subnet',
            type: 'boolean',
            required: false,
            description: 'Has internet access',
            default: false,
          },
        ],
      },
      {
        id: 'load-balancer',
        name: 'Load Balancer',
        description: 'Distribute traffic across multiple targets',
        icon: 'GitBranch',
        category: 'networking',
        behavior: 'connector' as NodeBehavior,
        providers: ['aws', 'gcp', 'azure', 'kubernetes'],
        implementations: [
          {
            provider: 'aws',
            resource_type: 'aws:elasticloadbalancingv2:LoadBalancer',
            display_name: 'ALB/NLB',
          },
          {
            provider: 'gcp',
            resource_type: 'gcp:compute:ForwardingRule',
            display_name: 'Cloud Load Balancer',
          },
          {
            provider: 'azure',
            resource_type: 'azure:network:LoadBalancer',
            display_name: 'Azure Load Balancer',
          },
          {
            provider: 'kubernetes',
            resource_type: 'kubernetes:core/v1:Service',
            display_name: 'K8s Service (LoadBalancer)',
          },
        ],
        keywords: ['load', 'balancer', 'alb', 'elb', 'nlb', 'lb'],
        properties: [
          {
            name: 'name',
            label: 'Name',
            type: 'string',
            required: true,
            description: 'Load balancer name',
          },
          {
            name: 'type',
            label: 'Type',
            type: 'select',
            required: true,
            description: 'Load balancer type',
            options: ['Application (HTTP/HTTPS)', 'Network (TCP/UDP)'],
          },
          {
            name: 'internal',
            label: 'Internal Only',
            type: 'boolean',
            required: false,
            description: 'Only accessible within VPC',
            default: false,
          },
        ],
      },
      {
        id: 'cdn',
        name: 'CDN',
        description: 'Content delivery network for global distribution',
        icon: 'Globe',
        category: 'networking',
        behavior: 'connector' as NodeBehavior,
        providers: ['aws', 'gcp', 'azure'],
        implementations: [
          {
            provider: 'aws',
            resource_type: 'aws:cloudfront:Distribution',
            display_name: 'CloudFront',
          },
          {
            provider: 'gcp',
            resource_type: 'gcp:compute:GlobalForwardingRule',
            display_name: 'Cloud CDN',
          },
          { provider: 'azure', resource_type: 'azure:cdn:Endpoint', display_name: 'Azure CDN' },
        ],
        keywords: ['cdn', 'cloudfront', 'cloudflare', 'fastly', 'akamai'],
        properties: [
          {
            name: 'name',
            label: 'Distribution Name',
            type: 'string',
            required: true,
            description: 'CDN distribution name',
          },
          {
            name: 'origins',
            label: 'Origin',
            type: 'string',
            required: true,
            description: 'Origin server or bucket',
          },
        ],
      },
      {
        id: 'api-gateway',
        name: 'API Gateway',
        description: 'Managed API endpoint with routing and auth',
        icon: 'Server',
        category: 'networking',
        behavior: 'connector' as NodeBehavior,
        providers: ['aws', 'gcp', 'azure'],
        implementations: [
          { provider: 'aws', resource_type: 'aws:apigatewayv2:Api', display_name: 'API Gateway' },
          { provider: 'gcp', resource_type: 'gcp:apigateway:Gateway', display_name: 'API Gateway' },
          {
            provider: 'azure',
            resource_type: 'azure:apimanagement:Api',
            display_name: 'API Management',
          },
        ],
        keywords: ['api', 'gateway', 'rest', 'http', 'websocket'],
        properties: [
          {
            name: 'name',
            label: 'Gateway Name',
            type: 'string',
            required: true,
            description: 'API Gateway name',
          },
          {
            name: 'protocol',
            label: 'Protocol',
            type: 'select',
            required: true,
            description: 'Protocol type',
            options: ['HTTP', 'WebSocket'],
          },
        ],
      },
      {
        id: 'dns-zone',
        name: 'DNS Zone',
        description: 'Manage DNS records for your domain',
        icon: 'Globe',
        category: 'networking',
        behavior: 'singleton' as NodeBehavior,
        providers: ['aws', 'gcp', 'azure'],
        implementations: [
          {
            provider: 'aws',
            resource_type: 'aws:route53:Zone',
            display_name: 'Route 53 Hosted Zone',
          },
          { provider: 'gcp', resource_type: 'gcp:dns:ManagedZone', display_name: 'Cloud DNS Zone' },
          { provider: 'azure', resource_type: 'azure:dns:Zone', display_name: 'Azure DNS Zone' },
        ],
        keywords: ['dns', 'route53', 'domain', 'zone', 'cloudflare'],
        properties: [
          {
            name: 'domain',
            label: 'Domain Name',
            type: 'string',
            required: true,
            description: 'Your domain (e.g., example.com)',
          },
        ],
      },
    ],
  },
  {
    id: 'messaging',
    name: 'Messaging',
    description: 'Queues, pub/sub, and event streaming',
    icon: 'MessageSquare',
    resources: [
      {
        id: 'message-queue',
        name: 'Message Queue',
        description: 'Reliable async message delivery',
        icon: 'List',
        category: 'messaging',
        behavior: 'streaming' as NodeBehavior,
        providers: ['aws', 'gcp', 'azure'],
        implementations: [
          { provider: 'aws', resource_type: 'aws:sqs:Queue', display_name: 'SQS Queue' },
          {
            provider: 'gcp',
            resource_type: 'gcp:pubsub:Subscription',
            display_name: 'Pub/Sub Subscription',
          },
          {
            provider: 'azure',
            resource_type: 'azure:servicebus:Queue',
            display_name: 'Service Bus Queue',
          },
        ],
        keywords: ['sqs', 'queue', 'rabbitmq', 'message', 'pubsub'],
        properties: [
          {
            name: 'name',
            label: 'Queue Name',
            type: 'string',
            required: true,
            description: 'Name of your queue',
          },
          {
            name: 'fifo',
            label: 'FIFO Queue',
            type: 'boolean',
            required: false,
            description: 'Guarantee message ordering',
            default: false,
          },
        ],
      },
      {
        id: 'event-bus',
        name: 'Event Bus',
        description: 'Publish-subscribe event routing',
        icon: 'Radio',
        category: 'messaging',
        behavior: 'streaming' as NodeBehavior,
        providers: ['aws', 'gcp', 'azure'],
        implementations: [
          { provider: 'aws', resource_type: 'aws:sns:Topic', display_name: 'SNS Topic' },
          { provider: 'gcp', resource_type: 'gcp:pubsub:Topic', display_name: 'Pub/Sub Topic' },
          {
            provider: 'azure',
            resource_type: 'azure:eventgrid:Topic',
            display_name: 'Event Grid Topic',
          },
        ],
        keywords: ['eventbridge', 'sns', 'topic', 'pubsub', 'event'],
        properties: [
          {
            name: 'name',
            label: 'Event Bus Name',
            type: 'string',
            required: true,
            description: 'Name of your event bus',
          },
        ],
      },
      {
        id: 'rabbitmq',
        name: 'RabbitMQ',
        description: 'Open-source message broker with advanced routing',
        icon: 'Inbox',
        category: 'messaging',
        behavior: 'streaming' as NodeBehavior,
        providers: ['aws', 'gcp', 'azure', 'kubernetes'],
        implementations: [
          { provider: 'aws', resource_type: 'aws:mq:Broker', display_name: 'Amazon MQ (RabbitMQ)' },
          { provider: 'gcp', resource_type: 'gcp:cloudamqp:Instance', display_name: 'CloudAMQP' },
          {
            provider: 'azure',
            resource_type: 'azure:servicebus:Namespace',
            display_name: 'Service Bus',
          },
          {
            provider: 'kubernetes',
            resource_type: 'kubernetes:apps/v1:StatefulSet',
            display_name: 'RabbitMQ Operator',
          },
        ],
        keywords: ['rabbitmq', 'amqp', 'mq', 'broker', 'rabbit'],
        properties: [
          {
            name: 'name',
            label: 'Broker Name',
            type: 'string',
            required: true,
            description: 'Name of your message broker',
          },
          {
            name: 'version',
            label: 'Version',
            type: 'select',
            required: false,
            description: 'RabbitMQ version',
            options: ['3.13', '3.12', '3.11'],
          },
          {
            name: 'port',
            label: 'Port',
            type: 'number',
            required: false,
            description: 'AMQP port',
            default: 5672,
          },
        ],
      },
      {
        id: 'cloud-pubsub',
        name: 'Cloud Pub/Sub',
        description: 'Global managed pub/sub messaging service',
        icon: 'Radio',
        category: 'messaging',
        behavior: 'streaming' as NodeBehavior,
        providers: ['gcp'],
        implementations: [
          { provider: 'gcp', resource_type: 'gcp:pubsub:Topic', display_name: 'Pub/Sub Topic' },
        ],
        keywords: ['pubsub', 'pub/sub', 'gcp', 'topic', 'subscription', 'messaging'],
        properties: [
          {
            name: 'name',
            label: 'Topic Name',
            type: 'string',
            required: true,
            description: 'Name of your Pub/Sub topic',
          },
          {
            name: 'retention',
            label: 'Retention (days)',
            type: 'number',
            required: false,
            description: 'Message retention period',
            default: 7,
          },
        ],
      },
      {
        id: 'service-bus',
        name: 'Service Bus',
        description: 'Enterprise messaging with queues and topics',
        icon: 'List',
        category: 'messaging',
        behavior: 'streaming' as NodeBehavior,
        providers: ['azure'],
        implementations: [
          {
            provider: 'azure',
            resource_type: 'azure:servicebus:Namespace',
            display_name: 'Service Bus Namespace',
          },
        ],
        keywords: ['servicebus', 'service-bus', 'azure', 'queue', 'topic', 'enterprise'],
        properties: [
          {
            name: 'name',
            label: 'Namespace Name',
            type: 'string',
            required: true,
            description: 'Name of your Service Bus namespace',
          },
          {
            name: 'tier',
            label: 'Tier',
            type: 'select',
            required: false,
            description: 'Pricing tier',
            options: ['Basic', 'Standard', 'Premium'],
            default: 'Standard',
          },
        ],
      },
      {
        id: 'event-stream',
        name: 'Event Stream',
        description: 'High-throughput event streaming',
        icon: 'Activity',
        category: 'messaging',
        behavior: 'streaming' as NodeBehavior,
        providers: ['aws', 'gcp', 'azure'],
        implementations: [
          {
            provider: 'aws',
            resource_type: 'aws:kinesis:Stream',
            display_name: 'Kinesis Data Stream',
          },
          {
            provider: 'gcp',
            resource_type: 'gcp:pubsub:Topic',
            display_name: 'Pub/Sub (Streaming)',
          },
          {
            provider: 'azure',
            resource_type: 'azure:eventhub:EventHub',
            display_name: 'Event Hubs',
          },
        ],
        keywords: ['kinesis', 'kafka', 'stream', 'event', 'data'],
        properties: [
          {
            name: 'name',
            label: 'Stream Name',
            type: 'string',
            required: true,
            description: 'Name of your stream',
          },
          {
            name: 'shards',
            label: 'Shards',
            type: 'number',
            required: false,
            description: 'Number of shards',
            default: 1,
          },
        ],
      },
    ],
  },
  {
    id: 'security',
    name: 'Security',
    description: 'IAM, secrets, and certificates',
    icon: 'Shield',
    resources: [
      {
        id: 'secret-store',
        name: 'Secret Store',
        description: 'Securely store API keys and credentials',
        icon: 'Key',
        category: 'security',
        behavior: 'singleton' as NodeBehavior,
        providers: ['aws', 'gcp', 'azure', 'kubernetes'],
        implementations: [
          {
            provider: 'aws',
            resource_type: 'aws:secretsmanager:Secret',
            display_name: 'Secrets Manager',
          },
          {
            provider: 'gcp',
            resource_type: 'gcp:secretmanager:Secret',
            display_name: 'Secret Manager',
          },
          {
            provider: 'azure',
            resource_type: 'azure:keyvault:Secret',
            display_name: 'Key Vault Secret',
          },
          {
            provider: 'kubernetes',
            resource_type: 'kubernetes:core/v1:Secret',
            display_name: 'K8s Secret',
          },
        ],
        keywords: ['secret', 'vault', 'ssm', 'parameter', 'credential'],
        properties: [
          {
            name: 'name',
            label: 'Secret Name',
            type: 'string',
            required: true,
            description: 'Name of your secret',
          },
          {
            name: 'value',
            label: 'Secret Value',
            type: 'string',
            required: true,
            description: 'The secret value',
          },
        ],
      },
      {
        id: 'ssl-certificate',
        name: 'SSL Certificate',
        description: 'HTTPS certificates for your domains',
        icon: 'Lock',
        category: 'security',
        behavior: 'singleton' as NodeBehavior,
        providers: ['aws', 'gcp', 'azure'],
        implementations: [
          {
            provider: 'aws',
            resource_type: 'aws:acm:Certificate',
            display_name: 'ACM Certificate',
          },
          {
            provider: 'gcp',
            resource_type: 'gcp:compute:ManagedSslCertificate',
            display_name: 'Managed SSL Certificate',
          },
          {
            provider: 'azure',
            resource_type: 'azure:keyvault:Certificate',
            display_name: 'Key Vault Certificate',
          },
        ],
        keywords: ['ssl', 'tls', 'certificate', 'acm', 'https'],
        properties: [
          {
            name: 'domain',
            label: 'Domain',
            type: 'string',
            required: true,
            description: 'Domain for the certificate',
          },
          {
            name: 'auto_renew',
            label: 'Auto Renew',
            type: 'boolean',
            required: false,
            description: 'Automatically renew certificate',
            default: true,
          },
        ],
      },
      {
        id: 'service-account',
        name: 'Service Account',
        description: 'Identity for your services',
        icon: 'User',
        category: 'security',
        behavior: 'singleton' as NodeBehavior,
        providers: ['aws', 'gcp', 'azure', 'kubernetes'],
        implementations: [
          { provider: 'aws', resource_type: 'aws:iam:Role', display_name: 'IAM Role' },
          {
            provider: 'gcp',
            resource_type: 'gcp:serviceaccount:Account',
            display_name: 'Service Account',
          },
          {
            provider: 'azure',
            resource_type: 'azure:managedidentity:UserAssignedIdentity',
            display_name: 'Managed Identity',
          },
          {
            provider: 'kubernetes',
            resource_type: 'kubernetes:core/v1:ServiceAccount',
            display_name: 'K8s Service Account',
          },
        ],
        keywords: ['iam', 'role', 'service', 'account', 'identity'],
        properties: [
          {
            name: 'name',
            label: 'Account Name',
            type: 'string',
            required: true,
            description: 'Name of the service account',
          },
          {
            name: 'permissions',
            label: 'Permissions',
            type: 'select',
            required: true,
            description: 'Permission level',
            options: ['Read Only', 'Read/Write', 'Admin'],
          },
        ],
      },
    ],
  },
  {
    id: 'monitoring',
    name: 'Monitoring',
    description: 'Logs, metrics, and alerts',
    icon: 'Activity',
    resources: [
      {
        id: 'log-group',
        name: 'Log Group',
        description: 'Centralized application logging with real-time streaming',
        icon: 'FileText',
        category: 'monitoring',
        behavior: 'streaming' as NodeBehavior,
        providers: ['aws', 'gcp', 'azure'],
        implementations: [
          {
            provider: 'aws',
            resource_type: 'aws:cloudwatch:LogGroup',
            display_name: 'CloudWatch Logs',
          },
          { provider: 'gcp', resource_type: 'gcp:logging:Sink', display_name: 'Cloud Logging' },
          {
            provider: 'azure',
            resource_type: 'azure:operationalinsights:Workspace',
            display_name: 'Log Analytics',
          },
        ],
        keywords: ['log', 'cloudwatch', 'logging', 'stackdriver'],
        properties: [
          {
            name: 'name',
            label: 'Log Group Name',
            type: 'string',
            required: true,
            description: 'Name of your log group',
          },
          {
            name: 'retention_days',
            label: 'Retention (days)',
            type: 'number',
            required: false,
            description: 'Log retention period',
            default: 30,
          },
        ],
      },
      {
        id: 'alert',
        name: 'Alert',
        description: 'Get notified when things go wrong',
        icon: 'Bell',
        category: 'monitoring',
        behavior: 'singleton' as NodeBehavior,
        providers: ['aws', 'gcp', 'azure'],
        implementations: [
          {
            provider: 'aws',
            resource_type: 'aws:cloudwatch:MetricAlarm',
            display_name: 'CloudWatch Alarm',
          },
          {
            provider: 'gcp',
            resource_type: 'gcp:monitoring:AlertPolicy',
            display_name: 'Cloud Monitoring Alert',
          },
          {
            provider: 'azure',
            resource_type: 'azure:monitor:MetricAlert',
            display_name: 'Azure Monitor Alert',
          },
        ],
        keywords: ['alarm', 'alert', 'cloudwatch', 'notification', 'pagerduty'],
        properties: [
          {
            name: 'name',
            label: 'Alert Name',
            type: 'string',
            required: true,
            description: 'Name of your alert',
          },
          {
            name: 'metric',
            label: 'Metric',
            type: 'select',
            required: true,
            description: 'What to monitor',
            options: ['CPU Usage', 'Memory Usage', 'Error Rate', 'Latency', 'Custom'],
          },
          {
            name: 'threshold',
            label: 'Threshold',
            type: 'number',
            required: true,
            description: 'Alert threshold value',
          },
        ],
      },
      {
        id: 'dashboard',
        name: 'Dashboard',
        description: 'Visualize your infrastructure metrics',
        icon: 'BarChart',
        category: 'monitoring',
        behavior: 'singleton' as NodeBehavior,
        providers: ['aws', 'gcp', 'azure'],
        implementations: [
          {
            provider: 'aws',
            resource_type: 'aws:cloudwatch:Dashboard',
            display_name: 'CloudWatch Dashboard',
          },
          {
            provider: 'gcp',
            resource_type: 'gcp:monitoring:Dashboard',
            display_name: 'Cloud Monitoring Dashboard',
          },
          {
            provider: 'azure',
            resource_type: 'azure:portal:Dashboard',
            display_name: 'Azure Dashboard',
          },
        ],
        keywords: ['dashboard', 'grafana', 'cloudwatch', 'metrics', 'datadog'],
        properties: [
          {
            name: 'name',
            label: 'Dashboard Name',
            type: 'string',
            required: true,
            description: 'Name of your dashboard',
          },
        ],
      },
    ],
  },
];

/**
 * Get all high-level resources flattened
 */
export function getAllHighLevelResources(): HighLevelResource[] {
  return HIGH_LEVEL_CATEGORIES.flatMap((cat) => cat.resources);
}

/**
 * Get resources formatted for the palette
 */
export function getHighLevelResourcesForPalette() {
  return HIGH_LEVEL_CATEGORIES.map((category) => ({
    category: category.name,
    categoryId: category.id,
    categoryIcon: category.icon,
    categoryDescription: category.description,
    resources: category.resources.map((resource) => ({
      ice_type: resource.id,
      display_name: resource.name,
      description: resource.description,
      category: category.name,
      icon: resource.icon,
      behavior: resource.behavior,
      providers: resource.providers,
      implementations: resource.implementations,
      properties: resource.properties,
    })),
  }));
}

/**
 * Filter resources by provider
 */
export function filterResourcesByProvider(provider: string): HighLevelResource[] {
  if (provider === 'all') {
    return getAllHighLevelResources();
  }
  return getAllHighLevelResources().filter((resource) =>
    resource.providers.includes(provider as 'aws' | 'gcp' | 'azure' | 'kubernetes')
  );
}

/**
 * Get behavior label for display
 */
export function getBehaviorLabel(behavior: NodeBehavior): string {
  const labels: Record<NodeBehavior, string> = {
    scalable: 'Scales horizontally',
    container: 'Contains resources',
    singleton: 'Single instance',
    streaming: 'Data flow',
    stateful: 'Persistent data',
    connector: 'Routes traffic',
  };
  return labels[behavior];
}

/**
 * Get behavior color for UI
 */
export function getBehaviorColor(behavior: NodeBehavior): string {
  const colors: Record<NodeBehavior, string> = {
    scalable: 'blue',
    container: 'purple',
    singleton: 'gray',
    streaming: 'green',
    stateful: 'orange',
    connector: 'cyan',
  };
  return colors[behavior];
}

// =============================================================================
// Cloud Asset API Type Mapping
// =============================================================================

/**
 * Map Pulumi GCP resource types to Cloud Asset API types.
 * Pulumi: gcp:cloudrun:Service -> Cloud Asset: run.googleapis.com/Service
 */
const PULUMI_TO_CLOUD_ASSET: Record<string, string> = {
  // Applications
  'gcp:cloudrun:Service': 'run.googleapis.com/Service',
  'gcp:cloudfunctions:Function': 'cloudfunctions.googleapis.com/CloudFunction',
  'gcp:appengine:StandardAppVersion': 'appengine.googleapis.com/Service',

  // Container
  'gcp:container:Cluster': 'container.googleapis.com/Cluster',

  // Databases
  'gcp:sql:DatabaseInstance': 'sqladmin.googleapis.com/Instance',
  'gcp:spanner:Instance': 'spanner.googleapis.com/Instance',
  'gcp:redis:Instance': 'redis.googleapis.com/Instance',
  'gcp:firestore:Database': 'firestore.googleapis.com/Database',

  // Storage
  'gcp:storage:Bucket': 'storage.googleapis.com/Bucket',
  'gcp:filestore:Instance': 'file.googleapis.com/Instance',

  // Messaging
  'gcp:pubsub:Topic': 'pubsub.googleapis.com/Topic',
  'gcp:pubsub:Subscription': 'pubsub.googleapis.com/Subscription',

  // Networking
  'gcp:compute:Network': 'compute.googleapis.com/Network',
  'gcp:compute:Subnetwork': 'compute.googleapis.com/Subnetwork',
  'gcp:compute:ForwardingRule': 'compute.googleapis.com/ForwardingRule',
  'gcp:compute:GlobalForwardingRule': 'compute.googleapis.com/GlobalForwardingRule',
  'gcp:apigateway:Gateway': 'apigateway.googleapis.com/Gateway',
  'gcp:dns:ManagedZone': 'dns.googleapis.com/ManagedZone',

  // Security
  'gcp:secretmanager:Secret': 'secretmanager.googleapis.com/Secret',
  'gcp:compute:ManagedSslCertificate': 'compute.googleapis.com/SslCertificate',
  'gcp:serviceaccount:Account': 'iam.googleapis.com/ServiceAccount',

  // Monitoring
  'gcp:logging:Sink': 'logging.googleapis.com/LogSink',
  'gcp:monitoring:AlertPolicy': 'monitoring.googleapis.com/AlertPolicy',
  'gcp:monitoring:Dashboard': 'monitoring.googleapis.com/Dashboard',

  // Scheduled Jobs
  'gcp:cloudscheduler:Job': 'cloudscheduler.googleapis.com/Job',

  // BigQuery
  'gcp:bigquery:Dataset': 'bigquery.googleapis.com/Dataset',
};

/**
 * Get Cloud Asset API types for all GCP high-level resources.
 * These are the business-relevant resources we want to import.
 */
export function getGCPCloudAssetTypes(): string[] {
  const assetTypes = new Set<string>();

  for (const resource of getAllHighLevelResources()) {
    for (const impl of resource.implementations) {
      if (impl.provider === 'gcp') {
        const assetType = PULUMI_TO_CLOUD_ASSET[impl.resource_type];
        if (assetType) {
          assetTypes.add(assetType);
        }
      }
    }
  }

  return Array.from(assetTypes);
}

/**
 * Map Cloud Asset type to high-level resource ID.
 */
export function cloudAssetToHighLevelType(cloudAssetType: string): string | null {
  // Reverse lookup
  for (const [pulumiType, assetType] of Object.entries(PULUMI_TO_CLOUD_ASSET)) {
    if (assetType === cloudAssetType) {
      // Find the high-level resource that uses this Pulumi type
      for (const resource of getAllHighLevelResources()) {
        for (const impl of resource.implementations) {
          if (impl.resource_type === pulumiType) {
            return resource.id;
          }
        }
      }
    }
  }
  return null;
}
