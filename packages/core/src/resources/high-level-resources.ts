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
  type: 'string' | 'number' | 'boolean' | 'select' | 'list';
  required: boolean;
  description: string;
  options?: string[];
  default?: unknown;
  /** Controls visibility in the properties panel */
  tier?: 'essential' | 'detailed' | 'advanced';
  /** Placeholder text for string/list inputs */
  placeholder?: string;
  /** For 'list' type: label for the add button (e.g. "Add queue") */
  addLabel?: string;
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
          { name: 'name', label: 'Name', type: 'string', required: true, tier: 'essential', description: 'A friendly name for this website', placeholder: 'My Website' },
          { name: 'purpose', label: 'What kind of site is this?', type: 'select', required: false, tier: 'essential', description: 'Pick the closest match — we set the best defaults', options: ['Marketing site', 'Web app (React, Vue, etc.)', 'Documentation site', 'Blog', 'Landing page'], default: 'Web app (React, Vue, etc.)' },
          { name: 'size', label: 'Size', type: 'select', required: false, tier: 'essential', description: 'How much traffic do you expect?', options: ['Small — dev & testing', 'Medium — moderate traffic', 'Large — production scale'], default: 'Small — dev & testing' },
          { name: 'custom_domain', label: 'Custom domain', type: 'string', required: false, tier: 'detailed', description: 'Use your own domain name instead of the default one', placeholder: 'e.g. app.example.com' },
          { name: 'fast_worldwide', label: 'Fast worldwide loading?', type: 'boolean', required: false, tier: 'detailed', description: 'Caches your site on servers around the world so visitors everywhere get fast load times', default: true },
          { name: 'framework', label: 'Framework', type: 'select', required: false, tier: 'advanced', description: 'What framework is your site built with?', options: ['React', 'Vue', 'Angular', 'Next.js', 'Static HTML'] },
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
          { name: 'name', label: 'Name', type: 'string', required: true, tier: 'essential', description: 'A friendly name for this API', placeholder: 'My API' },
          { name: 'purpose', label: 'What does this API do?', type: 'select', required: false, tier: 'essential', description: 'Pick the closest match — we set the best defaults', options: ['Web server', 'REST API', 'GraphQL API', 'Internal microservice', 'Webhook handler'], default: 'REST API' },
          { name: 'size', label: 'Size', type: 'select', required: false, tier: 'essential', description: 'How much traffic will this handle?', options: ['Small — dev & testing', 'Medium — moderate traffic', 'Large — production scale'], default: 'Small — dev & testing' },
          { name: 'language', label: 'Language', type: 'select', required: false, tier: 'detailed', description: 'What language is your code written in?', options: ['Node.js', 'Python', 'Go', 'Java', '.NET', 'Ruby'] },
          { name: 'login_required', label: 'Require login?', type: 'select', required: false, tier: 'detailed', description: 'How should users prove who they are?', options: ['No login needed', 'API key', 'Username & password tokens', 'Social login (Google, GitHub, etc.)'], default: 'No login needed' },
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
          { name: 'name', label: 'Name', type: 'string', required: true, tier: 'essential', description: 'A friendly name for this function', placeholder: 'My Function' },
          { name: 'purpose', label: 'What does this function do?', type: 'select', required: false, tier: 'essential', description: 'Pick the closest match — we configure the best settings', options: ['Handle web requests', 'Process uploaded files', 'Run on a schedule', 'React to database changes', 'Process queue messages'], default: 'Handle web requests' },
          { name: 'size', label: 'Size', type: 'select', required: false, tier: 'essential', description: 'How much work will this function do per call?', options: ['Small — quick tasks (< 1 sec)', 'Medium — moderate processing', 'Large — heavy computation'], default: 'Small — quick tasks (< 1 sec)' },
          { name: 'language', label: 'Language', type: 'select', required: false, tier: 'detailed', description: 'What language is your code written in?', options: ['Node.js', 'Python', 'Go', 'Java', '.NET'] },
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
          { name: 'name', label: 'Name', type: 'string', required: true, tier: 'essential', description: 'A friendly name for this function', placeholder: 'My Function' },
          { name: 'purpose', label: 'What does this function do?', type: 'select', required: false, tier: 'essential', description: 'Pick the closest match — we configure the best settings', options: ['Handle web requests', 'Process uploaded files', 'Run on a schedule', 'React to database changes', 'Process queue messages'], default: 'Handle web requests' },
          { name: 'size', label: 'Size', type: 'select', required: false, tier: 'essential', description: 'How much work will this function do per call?', options: ['Small — quick tasks (< 1 sec)', 'Medium — moderate processing', 'Large — heavy computation'], default: 'Small — quick tasks (< 1 sec)' },
          { name: 'language', label: 'Language', type: 'select', required: false, tier: 'detailed', description: 'What language is your code written in?', options: ['Node.js', 'Python', 'Java', 'Go'] },
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
          { name: 'name', label: 'Name', type: 'string', required: true, tier: 'essential', description: 'A friendly name for this function', placeholder: 'My Function' },
          { name: 'purpose', label: 'What does this function do?', type: 'select', required: false, tier: 'essential', description: 'Pick the closest match — we configure the best settings', options: ['Handle web requests', 'Process uploaded files', 'Run on a schedule', 'React to database changes', 'Process queue messages'], default: 'Handle web requests' },
          { name: 'size', label: 'Size', type: 'select', required: false, tier: 'essential', description: 'How much work will this function do per call?', options: ['Small — quick tasks (< 1 sec)', 'Medium — moderate processing', 'Large — heavy computation'], default: 'Small — quick tasks (< 1 sec)' },
          { name: 'language', label: 'Language', type: 'select', required: false, tier: 'detailed', description: 'What language is your code written in?', options: ['Node.js', 'Python', 'Java', 'Go'] },
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
          { name: 'name', label: 'Name', type: 'string', required: true, tier: 'essential', description: 'A friendly name for this app', placeholder: 'My App' },
          { name: 'purpose', label: 'What does this app do?', type: 'select', required: false, tier: 'essential', description: 'Pick the closest match — we set the best defaults', options: ['Web server', 'API backend', 'Background worker', 'Static site'], default: 'Web server' },
          { name: 'size', label: 'Size', type: 'select', required: false, tier: 'essential', description: 'How much traffic will this handle?', options: ['Small — dev & testing', 'Medium — moderate traffic', 'Large — production scale'], default: 'Small — dev & testing' },
          { name: 'language', label: 'Language', type: 'select', required: false, tier: 'detailed', description: 'What language is your code written in?', options: ['Node.js', 'Python', 'Go', 'Ruby', 'Docker'] },
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
          { name: 'name', label: 'Name', type: 'string', required: true, tier: 'essential', description: 'A friendly name for this service', placeholder: 'My Service' },
          { name: 'purpose', label: 'What does this service do?', type: 'select', required: false, tier: 'essential', description: 'Pick the closest match — we set the best defaults', options: ['Web server', 'API backend', 'Background worker', 'Scheduled job', 'Data pipeline'], default: 'API backend' },
          { name: 'size', label: 'Size', type: 'select', required: false, tier: 'essential', description: 'How much traffic will this handle?', options: ['Small — dev & testing', 'Medium — moderate traffic', 'Large — production scale'], default: 'Small — dev & testing' },
          { name: 'image', label: 'Container image', type: 'string', required: false, tier: 'detailed', description: 'The Docker image to run (leave blank if building from source)', placeholder: 'e.g. nginx:latest' },
          { name: 'env_vars', label: 'Environment variables', type: 'list', required: false, tier: 'detailed', description: 'Configuration values your app needs at startup', placeholder: 'e.g. DATABASE_URL=...', addLabel: 'Add a variable' },
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
          { name: 'name', label: 'Name', type: 'string', required: true, tier: 'essential', description: 'A friendly name for this worker', placeholder: 'My Worker' },
          { name: 'purpose', label: 'What does this worker do?', type: 'select', required: false, tier: 'essential', description: 'Pick the closest match — we set the best defaults', options: ['Process queue messages', 'Send emails & notifications', 'Run data imports', 'Generate reports', 'Process uploaded files', 'Other background task'], default: 'Process queue messages' },
          { name: 'size', label: 'Size', type: 'select', required: false, tier: 'essential', description: 'How heavy is the work this processes?', options: ['Small — dev & testing', 'Medium — steady processing', 'Large — heavy batch work'], default: 'Small — dev & testing' },
          { name: 'language', label: 'Language', type: 'select', required: false, tier: 'detailed', description: 'What language is your code written in?', options: ['Node.js', 'Python', 'Go', 'Java'] },
          { name: 'image', label: 'Container image', type: 'string', required: false, tier: 'advanced', description: 'Docker image to run (if using a container)', placeholder: 'e.g. my-worker:latest' },
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
          { name: 'name', label: 'Name', type: 'string', required: true, tier: 'essential', description: 'A friendly name for this web app', placeholder: 'My Web App' },
          { name: 'framework', label: 'Framework', type: 'select', required: false, tier: 'essential', description: 'Which framework is your app built with?', options: ['Next.js', 'Nuxt', 'Remix', 'SvelteKit', 'Astro'] },
          { name: 'size', label: 'Size', type: 'select', required: false, tier: 'essential', description: 'How much traffic will this handle?', options: ['Small — dev & testing', 'Medium — moderate traffic', 'Large — production scale'], default: 'Small — dev & testing' },
          { name: 'custom_domain', label: 'Custom domain', type: 'string', required: false, tier: 'detailed', description: 'Use your own domain name instead of the default one', placeholder: 'e.g. www.example.com' },
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
          { name: 'name', label: 'Name', type: 'string', required: true, tier: 'essential', description: 'A friendly name for this task', placeholder: 'Nightly Report' },
          { name: 'frequency', label: 'How often should this run?', type: 'select', required: true, tier: 'essential', description: 'Pick a schedule — you can fine-tune later', options: ['Every minute', 'Every 5 minutes', 'Every hour', 'Every day at midnight', 'Every Monday', 'Every 1st of the month', 'Custom schedule'], default: 'Every day at midnight' },
          { name: 'purpose', label: 'What does this task do?', type: 'select', required: false, tier: 'essential', description: 'Pick the closest match', options: ['Send reports', 'Clean up old data', 'Sync with external service', 'Run health checks', 'Process batch jobs', 'Other'], default: 'Other' },
          { name: 'timezone', label: 'Timezone', type: 'select', required: false, tier: 'detailed', description: 'Which timezone should the schedule follow?', options: ['UTC', 'US/Eastern', 'US/Pacific', 'Europe/London', 'Europe/Berlin', 'Asia/Tokyo'], default: 'UTC' },
          { name: 'schedule_expression', label: 'Custom schedule (cron)', type: 'string', required: false, tier: 'advanced', description: 'Advanced: a cron expression for precise scheduling', placeholder: 'e.g. 0 9 * * MON-FRI' },
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
          { name: 'name', label: 'Name', type: 'string', required: true, tier: 'essential', description: 'A friendly name for this AI gateway', placeholder: 'My AI Gateway' },
          { name: 'purpose', label: 'What will you use AI for?', type: 'select', required: false, tier: 'essential', description: 'Pick the closest match — we set the best defaults', options: ['Chatbot / assistant', 'Content generation', 'Code generation', 'Data analysis', 'Image generation', 'General purpose'], default: 'Chatbot / assistant' },
          { name: 'size', label: 'Size', type: 'select', required: false, tier: 'essential', description: 'How many AI requests do you expect?', options: ['Small — dev & testing', 'Medium — moderate usage', 'Large — production scale'], default: 'Small — dev & testing' },
          { name: 'providers', label: 'AI providers', type: 'list', required: false, tier: 'detailed', description: 'Which AI providers should this gateway connect to?', placeholder: 'e.g. OpenAI, Anthropic, Google', addLabel: 'Add a provider' },
          { name: 'fallback', label: 'Auto-switch if a provider is down?', type: 'boolean', required: false, tier: 'detailed', description: 'Automatically tries another AI provider if the first one fails', default: true },
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
          { name: 'name', label: 'Name', type: 'string', required: true, tier: 'essential', description: 'A friendly name for this model', placeholder: 'My ML Model' },
          { name: 'purpose', label: 'What kind of model is this?', type: 'select', required: false, tier: 'essential', description: 'Pick the closest match — we configure the best hardware', options: ['Text generation (LLM)', 'Image recognition', 'Recommendations', 'Predictions / forecasting', 'Custom model'], default: 'Custom model' },
          { name: 'size', label: 'Size', type: 'select', required: false, tier: 'essential', description: 'How powerful does the hardware need to be?', options: ['Small — no GPU, testing only', 'Medium — basic GPU', 'Large — high-end GPU for big models'], default: 'Small — no GPU, testing only' },
          { name: 'framework', label: 'ML framework', type: 'select', required: false, tier: 'detailed', description: 'What framework was your model built with?', options: ['PyTorch', 'TensorFlow', 'ONNX', 'vLLM', 'Ollama', 'Custom'] },
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
          { name: 'name', label: 'Name', type: 'string', required: true, tier: 'essential', description: 'A friendly name for this database', placeholder: 'My Database' },
          { name: 'purpose', label: 'What is this database for?', type: 'select', required: false, tier: 'essential', description: 'Pick the closest match — we set the best defaults', options: ['Web app data', 'API backend data', 'Analytics & reporting', 'User accounts & auth', 'General purpose'], default: 'General purpose' },
          { name: 'size', label: 'Size', type: 'select', required: false, tier: 'essential', description: 'How much data and traffic?', options: ['Small — dev & testing', 'Medium — startup workload', 'Large — production scale'], default: 'Small — dev & testing' },
          { name: 'production', label: 'Production-ready?', type: 'boolean', required: false, tier: 'detailed', description: 'Turns on automatic backups, high availability, and encryption', default: false },
          { name: 'version', label: 'Version', type: 'select', required: false, tier: 'advanced', description: 'PostgreSQL version', options: ['16', '15', '14', '13'], default: '16' },
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
          { name: 'name', label: 'Name', type: 'string', required: true, tier: 'essential', description: 'A friendly name for this database', placeholder: 'My Database' },
          { name: 'purpose', label: 'What is this database for?', type: 'select', required: false, tier: 'essential', description: 'Pick the closest match — we set the best defaults', options: ['Web app data', 'API backend data', 'WordPress / CMS', 'E-commerce', 'General purpose'], default: 'General purpose' },
          { name: 'size', label: 'Size', type: 'select', required: false, tier: 'essential', description: 'How much data and traffic?', options: ['Small — dev & testing', 'Medium — startup workload', 'Large — production scale'], default: 'Small — dev & testing' },
          { name: 'production', label: 'Production-ready?', type: 'boolean', required: false, tier: 'detailed', description: 'Turns on automatic backups, high availability, and encryption', default: false },
          { name: 'version', label: 'Version', type: 'select', required: false, tier: 'advanced', description: 'MySQL version', options: ['8.0', '5.7'], default: '8.0' },
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
          { name: 'name', label: 'Name', type: 'string', required: true, tier: 'essential', description: 'A friendly name for this database', placeholder: 'My Database' },
          { name: 'purpose', label: 'What is this database for?', type: 'select', required: false, tier: 'essential', description: 'Pick the closest match — we set the best defaults', options: ['App data (flexible schema)', 'Content management', 'IoT / sensor data', 'Mobile app backend', 'General purpose'], default: 'General purpose' },
          { name: 'size', label: 'Size', type: 'select', required: false, tier: 'essential', description: 'How much data and traffic?', options: ['Free tier — dev & testing', 'Small — light production', 'Medium — startup workload', 'Large — production scale'], default: 'Free tier — dev & testing' },
          { name: 'production', label: 'Production-ready?', type: 'boolean', required: false, tier: 'detailed', description: 'Turns on automatic backups, high availability, and encryption', default: false },
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
          { name: 'name', label: 'Name', type: 'string', required: true, tier: 'essential', description: 'A friendly name for this cache', placeholder: 'My Cache' },
          { name: 'purpose', label: 'What is this cache for?', type: 'select', required: false, tier: 'essential', description: 'Pick the closest match — we set the best defaults', options: ['Speed up page loads', 'Store user sessions', 'Rate limiting', 'Job queue', 'Real-time leaderboards', 'General caching'], default: 'General caching' },
          { name: 'size', label: 'Size', type: 'select', required: false, tier: 'essential', description: 'How much data will you cache?', options: ['Small — dev & testing', 'Medium — moderate data', 'Large — production scale'], default: 'Small — dev & testing' },
          { name: 'keep_data_safe', label: 'Keep data safe if server restarts?', type: 'boolean', required: false, tier: 'detailed', description: 'Saves cached data to disk so it survives restarts (slightly slower)', default: false },
        ],
      },
      {
        id: 'dynamodb',
        name: 'DynamoDB',
        description: 'NoSQL key-value and document database with single-digit millisecond performance',
        icon: 'Database',
        category: 'database',
        behavior: 'stateful' as NodeBehavior,
        providers: ['aws'],
        implementations: [{ provider: 'aws', resource_type: 'aws:dynamodb:Table', display_name: 'DynamoDB Table' }],
        keywords: ['dynamodb', 'dynamo', 'nosql', 'key-value', 'document'],
        properties: [
          { name: 'name', label: 'Name', type: 'string', required: true, tier: 'essential', description: 'A friendly name for this database', placeholder: 'My Table' },
          { name: 'purpose', label: 'What is this database for?', type: 'select', required: false, tier: 'essential', description: 'Pick the closest match — we set the best defaults', options: ['User profiles & sessions', 'Shopping cart / orders', 'IoT / sensor data', 'Real-time gaming data', 'General key-value storage'], default: 'General key-value storage' },
          { name: 'size', label: 'Size', type: 'select', required: false, tier: 'essential', description: 'How should billing work?', options: ['Pay per request — scales automatically', 'Reserved — predictable cost for steady traffic'], default: 'Pay per request — scales automatically' },
          { name: 'lookup_field', label: 'Main lookup field', type: 'string', required: false, tier: 'detailed', description: 'The main field you will use to look up records (e.g. user ID, order ID)', placeholder: 'e.g. userId' },
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
          { name: 'name', label: 'Name', type: 'string', required: true, tier: 'essential', description: 'A friendly name for this database', placeholder: 'My Database' },
          { name: 'purpose', label: 'What is this database for?', type: 'select', required: false, tier: 'essential', description: 'Pick the closest match — we set the best defaults', options: ['Mobile app data', 'Real-time chat or collaboration', 'User profiles', 'Content management', 'General purpose'], default: 'General purpose' },
          { name: 'size', label: 'Size', type: 'select', required: false, tier: 'essential', description: 'How much data and traffic?', options: ['Small — dev & testing', 'Medium — startup workload', 'Large — production scale'], default: 'Small — dev & testing' },
          { name: 'realtime', label: 'Live updates?', type: 'boolean', required: false, tier: 'detailed', description: 'Push changes instantly to connected apps (great for chat, dashboards)', default: true },
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
          { name: 'name', label: 'Name', type: 'string', required: true, tier: 'essential', description: 'A friendly name for this database', placeholder: 'My Database' },
          { name: 'purpose', label: 'What is this database for?', type: 'select', required: false, tier: 'essential', description: 'Pick the closest match — we set the best defaults', options: ['Document storage (like MongoDB)', 'Key-value lookups', 'Graph relationships', 'Wide-column data', 'General purpose'], default: 'Document storage (like MongoDB)' },
          { name: 'size', label: 'Size', type: 'select', required: false, tier: 'essential', description: 'How much data and traffic?', options: ['Small — dev & testing', 'Medium — startup workload', 'Large — production scale'], default: 'Small — dev & testing' },
          { name: 'global', label: 'Available worldwide?', type: 'boolean', required: false, tier: 'detailed', description: 'Copies your data to regions around the world for fast access everywhere', default: false },
          { name: 'data_safety', label: 'How important is data accuracy?', type: 'select', required: false, tier: 'advanced', description: 'Trade off between speed and data accuracy across regions', options: ['Maximum speed (data may be briefly stale)', 'Balanced (good for most apps)', 'Maximum accuracy (slightly slower)'], default: 'Balanced (good for most apps)' },
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
          { name: 'name', label: 'Name', type: 'string', required: true, tier: 'essential', description: 'A friendly name for this database', placeholder: 'My Database' },
          { name: 'purpose', label: 'What is this database for?', type: 'select', required: false, tier: 'essential', description: 'Pick the closest match — we set the best defaults', options: ['IoT / sensor data', 'Logs & time-series', 'User activity tracking', 'General key-value storage'], default: 'General key-value storage' },
          { name: 'size', label: 'Size', type: 'select', required: false, tier: 'essential', description: 'How should billing work?', options: ['Pay per request — scales automatically', 'Reserved — predictable cost for steady traffic'], default: 'Pay per request — scales automatically' },
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
          { name: 'name', label: 'Name', type: 'string', required: true, tier: 'essential', description: 'A friendly name for this database', placeholder: 'My Database' },
          { name: 'purpose', label: 'What is this database for?', type: 'select', required: false, tier: 'essential', description: 'Pick the closest match — we set the best defaults', options: ['Transaction processing (orders, accounts)', 'Analytics & reporting', 'JSON document storage', 'Low-code app development'], default: 'Transaction processing (orders, accounts)' },
          { name: 'size', label: 'Size', type: 'select', required: false, tier: 'essential', description: 'How much data and traffic?', options: ['Small — dev & testing', 'Medium — startup workload', 'Large — production scale'], default: 'Small — dev & testing' },
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
          { name: 'name', label: 'Name', type: 'string', required: true, tier: 'essential', description: 'A friendly name for this database', placeholder: 'My Database' },
          { name: 'engine', label: 'What type of database?', type: 'select', required: true, tier: 'essential', description: 'Choose the database engine', options: ['PostgreSQL', 'MySQL', 'Redis'], default: 'PostgreSQL' },
          { name: 'size', label: 'Size', type: 'select', required: false, tier: 'essential', description: 'How much data and traffic?', options: ['Small — dev & testing', 'Medium — startup workload', 'Large — production scale'], default: 'Small — dev & testing' },
          { name: 'production', label: 'Production-ready?', type: 'boolean', required: false, tier: 'detailed', description: 'Turns on automatic backups and failover so your data is safe', default: false },
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
        keywords: ['vector', 'embedding', 'pinecone', 'weaviate', 'qdrant', 'pgvector', 'chromadb', 'milvus'],
        properties: [
          { name: 'name', label: 'Name', type: 'string', required: true, tier: 'essential', description: 'A friendly name for this vector store', placeholder: 'My Vector Store' },
          { name: 'purpose', label: 'What will you search for?', type: 'select', required: false, tier: 'essential', description: 'Pick the closest match — we set the best defaults', options: ['Similar documents (RAG / AI search)', 'Image similarity', 'Product recommendations', 'Semantic code search', 'General vector search'], default: 'Similar documents (RAG / AI search)' },
          { name: 'size', label: 'Size', type: 'select', required: false, tier: 'essential', description: 'How many items will you store?', options: ['Small — up to 100K items', 'Medium — up to 1M items', 'Large — millions of items'], default: 'Small — up to 100K items' },
          { name: 'engine', label: 'Vector engine', type: 'select', required: false, tier: 'detailed', description: 'Which vector engine to use (we pick a good default)', options: ['Pinecone', 'Weaviate', 'Qdrant', 'pgvector', 'ChromaDB', 'Milvus'] },
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
        keywords: ['warehouse', 'redshift', 'bigquery', 'snowflake', 'clickhouse', 'analytics', 'olap'],
        properties: [
          { name: 'name', label: 'Name', type: 'string', required: true, tier: 'essential', description: 'A friendly name for this data warehouse', placeholder: 'My Warehouse' },
          { name: 'purpose', label: 'What kind of analysis?', type: 'select', required: false, tier: 'essential', description: 'Pick the closest match — we set the best defaults', options: ['Business intelligence dashboards', 'Ad-hoc data exploration', 'Machine learning pipelines', 'Log & event analytics', 'General analytics'], default: 'General analytics' },
          { name: 'size', label: 'Size', type: 'select', required: false, tier: 'essential', description: 'How much data will you analyze?', options: ['Small — gigabytes', 'Medium — terabytes', 'Large — petabytes'], default: 'Small — gigabytes' },
          { name: 'engine', label: 'Analytics engine', type: 'select', required: false, tier: 'detailed', description: 'Which analytics engine to use', options: ['BigQuery', 'Redshift', 'Snowflake', 'ClickHouse'] },
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
          { name: 'name', label: 'Name', type: 'string', required: true, tier: 'essential', description: 'A friendly name for this search engine', placeholder: 'My Search' },
          { name: 'purpose', label: 'What will people search for?', type: 'select', required: false, tier: 'essential', description: 'Pick the closest match — we set the best defaults', options: ['Product catalog', 'Help articles & docs', 'User-generated content', 'Log search & monitoring', 'General full-text search'], default: 'General full-text search' },
          { name: 'size', label: 'Size', type: 'select', required: false, tier: 'essential', description: 'How much content will you index?', options: ['Small — dev & testing', 'Medium — moderate data', 'Large — production scale'], default: 'Small — dev & testing' },
          { name: 'engine', label: 'Search engine', type: 'select', required: false, tier: 'advanced', description: 'Which search engine to use', options: ['OpenSearch', 'Elasticsearch', 'Algolia'] },
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
          { name: 'name', label: 'Name', type: 'string', required: true, tier: 'essential', description: 'A friendly name for this storage bucket', placeholder: 'My Files' },
          { name: 'purpose', label: 'What will you store?', type: 'select', required: false, tier: 'essential', description: 'Pick the closest match — we set the best defaults', options: ['User uploads (images, documents)', 'App assets (CSS, JS, images)', 'Backups', 'Data exports & reports', 'Video & media files', 'General file storage'], default: 'General file storage' },
          { name: 'public', label: 'Publicly accessible?', type: 'boolean', required: false, tier: 'essential', description: 'Allow anyone on the internet to view these files', default: false },
          { name: 'keep_old_versions', label: 'Keep old versions of files?', type: 'boolean', required: false, tier: 'detailed', description: 'Saves previous versions so you can recover accidentally overwritten files', default: false },
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
        implementations: [{ provider: 'alibaba', resource_type: 'alibaba:oss:Bucket', display_name: 'OSS Bucket' }],
        keywords: ['oss', 'object', 'storage', 'alibaba', 'bucket'],
        properties: [
          { name: 'name', label: 'Name', type: 'string', required: true, tier: 'essential', description: 'A friendly name for this storage bucket', placeholder: 'My Files' },
          { name: 'purpose', label: 'What will you store?', type: 'select', required: false, tier: 'essential', description: 'Pick the closest match — we set the best defaults', options: ['Frequently accessed files', 'Occasionally accessed files', 'Long-term archive', 'Rarely accessed cold storage'], default: 'Frequently accessed files' },
          { name: 'public', label: 'Publicly accessible?', type: 'boolean', required: false, tier: 'essential', description: 'Allow anyone on the internet to view these files', default: false },
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
          { name: 'name', label: 'Name', type: 'string', required: true, tier: 'essential', description: 'A friendly name for this storage bucket', placeholder: 'My Files' },
          { name: 'purpose', label: 'What will you store?', type: 'select', required: false, tier: 'essential', description: 'Pick the closest match — we set the best defaults', options: ['Frequently accessed files', 'Long-term archive', 'General file storage'], default: 'Frequently accessed files' },
          { name: 'public', label: 'Publicly accessible?', type: 'boolean', required: false, tier: 'essential', description: 'Allow anyone on the internet to view these files', default: false },
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
          { name: 'name', label: 'Name', type: 'string', required: true, tier: 'essential', description: 'A friendly name for this storage space', placeholder: 'My Files' },
          { name: 'purpose', label: 'What will you store?', type: 'select', required: false, tier: 'essential', description: 'Pick the closest match — we set the best defaults', options: ['User uploads (images, documents)', 'App assets (CSS, JS, images)', 'Backups', 'Video & media files', 'General file storage'], default: 'General file storage' },
          { name: 'location', label: 'Where should your data live?', type: 'select', required: false, tier: 'detailed', description: 'Pick the region closest to your users', options: ['New York', 'San Francisco', 'Amsterdam', 'Singapore', 'Frankfurt'] },
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
          { name: 'name', label: 'Name', type: 'string', required: true, tier: 'essential', description: 'A friendly name for this shared drive', placeholder: 'Shared Files' },
          { name: 'purpose', label: 'What is this shared drive for?', type: 'select', required: false, tier: 'essential', description: 'Pick the closest match — we set the best defaults', options: ['Shared config files', 'Media processing pipeline', 'Legacy app that needs a file system', 'Machine learning training data', 'General shared storage'], default: 'General shared storage' },
          { name: 'size', label: 'Size', type: 'select', required: false, tier: 'essential', description: 'How much storage and speed do you need?', options: ['Standard — cost-effective', 'Premium — high speed'], default: 'Standard — cost-effective' },
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
          { name: 'name', label: 'Name', type: 'string', required: true, tier: 'essential', description: 'A friendly name for this entry point', placeholder: 'User Traffic' },
          { name: 'domain', label: 'Domain', type: 'string', required: false, tier: 'essential', description: 'The web address users will visit', placeholder: 'e.g. www.example.com' },
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
          { name: 'name', label: 'Name', type: 'string', required: true, tier: 'essential', description: 'A friendly name for this network', placeholder: 'My Network' },
          { name: 'purpose', label: 'What is this network for?', type: 'select', required: false, tier: 'essential', description: 'Pick the closest match — we set the best defaults', options: ['Production environment', 'Development / staging', 'Isolated secure zone', 'General purpose'], default: 'General purpose' },
          { name: 'size', label: 'Size', type: 'select', required: false, tier: 'essential', description: 'How many services will live in this network?', options: ['Small — a few services', 'Medium — a typical app', 'Large — many services and teams'], default: 'Small — a few services' },
          { name: 'cidr', label: 'IP range', type: 'string', required: false, tier: 'advanced', description: 'Advanced: custom IP address range for this network', default: '10.0.0.0/16', placeholder: 'e.g. 10.0.0.0/16' },
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
          { name: 'name', label: 'Name', type: 'string', required: true, tier: 'essential', description: 'A friendly name for this subnet', placeholder: 'My Subnet' },
          { name: 'purpose', label: 'What goes in this subnet?', type: 'select', required: false, tier: 'essential', description: 'Pick the closest match — we set the best defaults', options: ['Public-facing services (web servers, APIs)', 'Internal services (databases, workers)', 'Isolated / secure zone'], default: 'Internal services (databases, workers)' },
          { name: 'internet_access', label: 'Can reach the internet?', type: 'boolean', required: false, tier: 'detailed', description: 'Allow resources in this subnet to access the internet', default: false },
          { name: 'cidr', label: 'IP range', type: 'string', required: false, tier: 'advanced', description: 'Advanced: custom IP address range for this subnet', default: '10.0.1.0/24', placeholder: 'e.g. 10.0.1.0/24' },
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
          { name: 'name', label: 'Name', type: 'string', required: true, tier: 'essential', description: 'A friendly name for this load balancer', placeholder: 'My Load Balancer' },
          { name: 'purpose', label: 'What kind of traffic?', type: 'select', required: false, tier: 'essential', description: 'Pick the closest match — we set the best defaults', options: ['Web traffic (websites & APIs)', 'Raw network traffic (TCP/UDP)'], default: 'Web traffic (websites & APIs)' },
          { name: 'internal_only', label: 'Internal only?', type: 'boolean', required: false, tier: 'detailed', description: 'Only accessible by other services in your network (not the public internet)', default: false },
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
          { name: 'name', label: 'Name', type: 'string', required: true, tier: 'essential', description: 'A friendly name for this CDN', placeholder: 'My CDN' },
          { name: 'purpose', label: 'What are you speeding up?', type: 'select', required: false, tier: 'essential', description: 'Pick the closest match — we set the best defaults', options: ['Website files (CSS, JS, images)', 'Video & media streaming', 'API responses', 'Software downloads'], default: 'Website files (CSS, JS, images)' },
          { name: 'custom_domain', label: 'Custom domain', type: 'string', required: false, tier: 'detailed', description: 'Use your own domain for the CDN', placeholder: 'e.g. cdn.example.com' },
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
          { name: 'name', label: 'Name', type: 'string', required: true, tier: 'essential', description: 'A friendly name for this gateway', placeholder: 'My API Gateway' },
          { name: 'purpose', label: 'What does this gateway do?', type: 'select', required: false, tier: 'essential', description: 'Pick the closest match — we set the best defaults', options: ['Route API requests to services', 'Real-time communication (WebSocket)', 'Public API for external developers'], default: 'Route API requests to services' },
          { name: 'routes', label: 'Routes', type: 'list', required: false, tier: 'detailed', description: 'URL paths this gateway should handle', placeholder: 'e.g. /api/users', addLabel: 'Add a route' },
          { name: 'login_required', label: 'Require login?', type: 'boolean', required: false, tier: 'detailed', description: 'Require authentication before requests reach your services', default: false },
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
          { name: 'name', label: 'Name', type: 'string', required: true, tier: 'essential', description: 'A friendly name for this DNS zone', placeholder: 'My Domain' },
          { name: 'domain', label: 'Domain name', type: 'string', required: true, tier: 'essential', description: 'The domain you want to manage', placeholder: 'e.g. example.com' },
          { name: 'subdomains', label: 'Subdomains', type: 'list', required: false, tier: 'detailed', description: 'Subdomains to set up (we will create the DNS records)', placeholder: 'e.g. api, www, app', addLabel: 'Add a subdomain' },
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
          { name: 'name', label: 'Name', type: 'string', required: true, tier: 'essential', description: 'A friendly name for this queue', placeholder: 'My Queue' },
          { name: 'purpose', label: 'What is this queue for?', type: 'select', required: false, tier: 'essential', description: 'Pick the closest match — we set the best defaults', options: ['Background jobs', 'Email & notifications', 'Order processing', 'Data pipeline', 'Task distribution', 'Other'], default: 'Background jobs' },
          { name: 'size', label: 'Size', type: 'select', required: false, tier: 'essential', description: 'How many messages per second?', options: ['Small — dev & testing', 'Medium — moderate traffic', 'Large — high volume production'], default: 'Small — dev & testing' },
          { name: 'order_matters', label: 'Order matters?', type: 'boolean', required: false, tier: 'detailed', description: 'Guarantee messages are processed in the exact order they were sent', default: false },
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
          { name: 'name', label: 'Name', type: 'string', required: true, tier: 'essential', description: 'A friendly name for this event bus', placeholder: 'My Events' },
          { name: 'purpose', label: 'What events will this carry?', type: 'select', required: false, tier: 'essential', description: 'Pick the closest match — we set the best defaults', options: ['Notify multiple services about changes', 'Fan out work to many workers', 'Real-time event streaming', 'Webhook delivery', 'Other'], default: 'Notify multiple services about changes' },
          { name: 'subscribers', label: 'Who listens to these events?', type: 'list', required: false, tier: 'essential', description: 'Services that should receive events from this bus', placeholder: 'e.g. email-service', addLabel: 'Add a subscriber' },
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
          { name: 'name', label: 'Name', type: 'string', required: true, tier: 'essential', description: 'A friendly name for this message broker', placeholder: 'My Message Broker' },
          { name: 'purpose', label: 'What is this queue for?', type: 'select', required: false, tier: 'essential', description: 'Pick the closest match — we configure the best settings', options: ['Background jobs', 'Notifications', 'Event streaming', 'Task distribution', 'Chat / real-time', 'Other'], default: 'Background jobs' },
          { name: 'size', label: 'Size', type: 'select', required: false, tier: 'essential', description: 'How much traffic will this handle?', options: ['Small — dev & testing', 'Medium — moderate traffic', 'Large — high-volume production'], default: 'Small — dev & testing' },
          { name: 'queues', label: 'Queues', type: 'list', required: false, tier: 'detailed', description: 'Add the queues this broker should manage', placeholder: 'e.g. order-processing', addLabel: 'Add a queue' },
          { name: 'keep_messages', label: 'Keep messages if broker restarts?', type: 'boolean', required: false, tier: 'detailed', description: 'Saves messages to disk so they survive restarts (recommended for production)', default: true },
          { name: 'always_available', label: 'Always available (production)?', type: 'boolean', required: false, tier: 'detailed', description: 'Runs in multiple zones so the broker stays up even if one goes down', default: false },
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
        implementations: [{ provider: 'gcp', resource_type: 'gcp:pubsub:Topic', display_name: 'Pub/Sub Topic' }],
        keywords: ['pubsub', 'pub/sub', 'gcp', 'topic', 'subscription', 'messaging'],
        properties: [
          { name: 'name', label: 'Name', type: 'string', required: true, tier: 'essential', description: 'A friendly name for this message channel', placeholder: 'My Channel' },
          { name: 'purpose', label: 'What is this for?', type: 'select', required: false, tier: 'essential', description: 'Pick the closest match — we set the best defaults', options: ['Event notifications', 'Data streaming', 'Background processing', 'Real-time updates', 'Other'], default: 'Event notifications' },
          { name: 'subscribers', label: 'Who listens?', type: 'list', required: false, tier: 'essential', description: 'Services that receive messages from this channel', placeholder: 'e.g. email-sender', addLabel: 'Add a listener' },
          { name: 'keep_messages', label: 'How long to keep undelivered messages?', type: 'select', required: false, tier: 'detailed', description: 'How long to hold messages if a listener is down', options: ['1 day', '3 days', '7 days', '30 days'], default: '7 days' },
          { name: 'order_matters', label: 'Order matters?', type: 'boolean', required: false, tier: 'detailed', description: 'Messages must arrive in the exact order they were sent', default: false },
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
          { name: 'name', label: 'Name', type: 'string', required: true, tier: 'essential', description: 'A friendly name for this message bus', placeholder: 'My Service Bus' },
          { name: 'purpose', label: 'What is this for?', type: 'select', required: false, tier: 'essential', description: 'Pick the closest match — we set the best defaults', options: ['Simple job queues', 'Enterprise event routing', 'Cross-service communication', 'Order processing pipeline'], default: 'Simple job queues' },
          { name: 'size', label: 'Size', type: 'select', required: false, tier: 'essential', description: 'How much messaging traffic?', options: ['Small — dev & testing', 'Medium — moderate traffic', 'Large — enterprise production'], default: 'Small — dev & testing' },
          { name: 'queues', label: 'Queues', type: 'list', required: false, tier: 'detailed', description: 'Named queues to set up', placeholder: 'e.g. orders', addLabel: 'Add a queue' },
          { name: 'topics', label: 'Topics', type: 'list', required: false, tier: 'detailed', description: 'Named topics for pub/sub messaging', placeholder: 'e.g. user-events', addLabel: 'Add a topic' },
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
          { name: 'name', label: 'Name', type: 'string', required: true, tier: 'essential', description: 'A friendly name for this event stream', placeholder: 'My Stream' },
          { name: 'purpose', label: 'What data is flowing through this?', type: 'select', required: false, tier: 'essential', description: 'Pick the closest match — we set the best defaults', options: ['Clickstream / user activity', 'IoT sensor data', 'Application logs', 'Financial transactions', 'Real-time analytics feed', 'General event streaming'], default: 'General event streaming' },
          { name: 'size', label: 'Size', type: 'select', required: false, tier: 'essential', description: 'How much data per second?', options: ['Small — dev & testing', 'Medium — thousands of events/sec', 'Large — massive data firehose'], default: 'Small — dev & testing' },
          { name: 'keep_data', label: 'How long to keep stream data?', type: 'select', required: false, tier: 'detailed', description: 'How far back can consumers replay data?', options: ['1 day', '3 days', '7 days', '30 days', '365 days'], default: '1 day' },
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
          { name: 'name', label: 'Name', type: 'string', required: true, tier: 'essential', description: 'A friendly name for this secret', placeholder: 'My Secret' },
          { name: 'purpose', label: 'What kind of secret is this?', type: 'select', required: false, tier: 'essential', description: 'Pick the closest match', options: ['API key', 'Database password', 'OAuth token', 'SSH key', 'Certificate', 'Other sensitive value'], default: 'API key' },
          { name: 'secrets', label: 'Secret values', type: 'list', required: false, tier: 'essential', description: 'The secret key-value pairs to store', placeholder: 'e.g. STRIPE_API_KEY', addLabel: 'Add a secret' },
          { name: 'auto_rotate', label: 'Auto-rotate?', type: 'boolean', required: false, tier: 'detailed', description: 'Automatically change this secret on a schedule for better security', default: false },
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
          { name: 'name', label: 'Name', type: 'string', required: true, tier: 'essential', description: 'A friendly name for this certificate', placeholder: 'My SSL Cert' },
          { name: 'domain', label: 'Domain', type: 'string', required: true, tier: 'essential', description: 'The domain this certificate secures', placeholder: 'e.g. example.com' },
          { name: 'extra_domains', label: 'Additional domains', type: 'list', required: false, tier: 'detailed', description: 'Other domains this certificate should cover', placeholder: 'e.g. www.example.com', addLabel: 'Add a domain' },
          { name: 'auto_renew', label: 'Auto-renew?', type: 'boolean', required: false, tier: 'detailed', description: 'Automatically renew before it expires (recommended)', default: true },
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
          { name: 'name', label: 'Name', type: 'string', required: true, tier: 'essential', description: 'A friendly name for this identity', placeholder: 'My Service Account' },
          { name: 'purpose', label: 'What will this identity be used for?', type: 'select', required: false, tier: 'essential', description: 'Pick the closest match — we assign the right permissions', options: ['Read data from storage', 'Read and write data', 'Manage all resources (admin)', 'Access secrets', 'Send messages'], default: 'Read data from storage' },
          { name: 'services', label: 'Which services use this identity?', type: 'list', required: false, tier: 'detailed', description: 'Services that will act as this identity', placeholder: 'e.g. backend-api', addLabel: 'Add a service' },
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
          { name: 'name', label: 'Name', type: 'string', required: true, tier: 'essential', description: 'A friendly name for this log group', placeholder: 'My Logs' },
          { name: 'purpose', label: 'What logs will this collect?', type: 'select', required: false, tier: 'essential', description: 'Pick the closest match — we set the best defaults', options: ['Application logs', 'API request logs', 'Error tracking', 'Security audit logs', 'All logs from a service'], default: 'Application logs' },
          { name: 'keep_logs', label: 'How long to keep logs?', type: 'select', required: false, tier: 'essential', description: 'Older logs are automatically deleted to save costs', options: ['7 days', '14 days', '30 days', '90 days', '1 year', 'Keep forever'], default: '30 days' },
          { name: 'sources', label: 'Which services send logs here?', type: 'list', required: false, tier: 'detailed', description: 'Services that should write to this log group', placeholder: 'e.g. backend-api', addLabel: 'Add a source' },
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
          { name: 'name', label: 'Name', type: 'string', required: true, tier: 'essential', description: 'A friendly name for this alert', placeholder: 'My Alert' },
          { name: 'watch_for', label: 'What should trigger this alert?', type: 'select', required: true, tier: 'essential', description: 'Pick what you want to be notified about', options: ['Service is down', 'Too many errors', 'Service is slow', 'Running out of storage', 'High resource usage', 'Custom condition'], default: 'Too many errors' },
          { name: 'severity', label: 'How urgent?', type: 'select', required: false, tier: 'essential', description: 'How urgently should you be notified?', options: ['Low — check when convenient', 'Medium — look into it soon', 'High — wake me up at 3am'], default: 'Medium — look into it soon' },
          { name: 'notify', label: 'Who to notify?', type: 'list', required: false, tier: 'detailed', description: 'Email addresses or channels to notify', placeholder: 'e.g. team@example.com', addLabel: 'Add a recipient' },
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
          { name: 'name', label: 'Name', type: 'string', required: true, tier: 'essential', description: 'A friendly name for this dashboard', placeholder: 'My Dashboard' },
          { name: 'purpose', label: 'What do you want to see?', type: 'select', required: false, tier: 'essential', description: 'Pick the closest match — we add the right charts', options: ['Service health overview', 'Performance & speed', 'Error tracking', 'Cost monitoring', 'Custom dashboard'], default: 'Service health overview' },
          { name: 'services', label: 'Which services to monitor?', type: 'list', required: false, tier: 'essential', description: 'Add the services you want to see on this dashboard', placeholder: 'e.g. backend-api', addLabel: 'Add a service' },
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
    resource.providers.includes(provider as 'aws' | 'gcp' | 'azure' | 'kubernetes'),
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
