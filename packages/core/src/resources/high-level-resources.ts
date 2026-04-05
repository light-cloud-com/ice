/**
 * High-Level Resource Definitions
 *
 * User-friendly abstractions over low-level cloud resources.
 * Users work with these concepts, and ICE maps them to actual cloud resources.
 */

import { type NodeBehavior, BEHAVIOR_LABELS, BEHAVIOR_COLORS } from '@ice/constants';

export type { NodeBehavior };

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

/**
 * Rich option detail for select fields — replaces generic options with
 * real cloud values, descriptions, and per-provider filtering.
 */
export interface OptionDetail {
  /** Stored in node.data (e.g., "db.t3.micro") — the real cloud value */
  value: string;
  /** Display title (e.g., "db.t3.micro") */
  label: string;
  /** Subtitle (e.g., "2 vCPU · 1 GB RAM") */
  description?: string;
  /** Cost hint (e.g., "~$15/mo") */
  cost?: string;
  /** When set, only show for this provider (e.g., "aws", "gcp", "azure") */
  provider?: string;
  /** Detailed help text shown on hover */
  tooltip?: string;
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
  /** Rich option details — when present, renders a card picker instead of a plain dropdown.
   *  Takes precedence over `options` for rendering. */
  optionDetails?: OptionDetail[];
  /** Detailed help text shown on hover (info icon next to label) */
  tooltip?: string;
  /** Configuration for the inline input shown when 'custom' option is selected.
   *  Requires a { value: 'custom', ... } entry in optionDetails. */
  customInput?: {
    /** Input field type */
    type: 'number' | 'string';
    /** Unit label displayed after the input (e.g., 'GB', 'MB', 'days') */
    unit: string;
    /** Minimum allowed value (number type only) */
    min?: number;
    /** Maximum allowed value (number type only) */
    max?: number;
    /** Step increment (number type only) */
    step?: number;
    /** Placeholder text for the input */
    placeholder?: string;
  };
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
    id: 'compute',
    name: 'Compute',
    description: 'Web apps, APIs, and services',
    icon: 'Globe',
    resources: [
      {
        id: 'frontend-app',
        name: 'Frontend App',
        description: 'Static website or single-page application with CDN',
        icon: 'Layout',
        category: 'compute',
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
          { name: 'size', label: 'Hosting tier', type: 'select', required: true, tier: 'essential', description: 'Hosting plan — determines build minutes, bandwidth, and features', default: 'amplify-free', optionDetails: [
            { value: 'amplify-free', label: 'Amplify Free', description: '1,000 build min · 15 GB served/mo', cost: 'Free', provider: 'aws' },
            { value: 'amplify-standard', label: 'Amplify Standard', description: 'Unlimited builds · pay per GB', cost: '~$0.15/GB served', provider: 'aws' },
            { value: 'firebase-free', label: 'Spark (Free)', description: '10 GB hosting · 360 MB/day served', cost: 'Free', provider: 'gcp' },
            { value: 'firebase-blaze', label: 'Blaze (Pay-as-you-go)', description: 'Unlimited hosting · pay per GB', cost: '~$0.15/GB served', provider: 'gcp' },
            { value: 'azure-free', label: 'Free', description: '100 MB storage · 0.5 GB bandwidth', cost: 'Free', provider: 'azure' },
            { value: 'azure-standard', label: 'Standard', description: '250 MB storage · 100 GB bandwidth', cost: '~$9/mo', provider: 'azure' },
          ] },
          { name: 'framework', label: 'Framework', type: 'select', required: false, tier: 'essential', description: 'What framework is your site built with?', default: 'react', optionDetails: [
            { value: 'react', label: 'React', description: 'Component-based SPA' },
            { value: 'vue', label: 'Vue', description: 'Progressive framework' },
            { value: 'angular', label: 'Angular', description: 'Enterprise SPA framework' },
            { value: 'nextjs', label: 'Next.js', description: 'React with SSR/SSG' },
            { value: 'astro', label: 'Astro', description: 'Content-focused, zero JS by default' },
            { value: 'svelte', label: 'Svelte', description: 'Compiled framework, small bundles' },
            { value: 'static', label: 'Static HTML', description: 'Plain HTML/CSS/JS' },
          ] },
          { name: 'custom_domain', label: 'Custom domain', type: 'string', required: false, tier: 'detailed', description: 'Use your own domain name instead of the default one', placeholder: 'e.g. app.example.com' },
          { name: 'fast_worldwide', label: 'Fast worldwide loading?', type: 'boolean', required: false, tier: 'detailed', description: 'Caches your site on servers around the world so visitors everywhere get fast load times', default: true },
        ],
      },
      {
        id: 'backend-api',
        name: 'Backend API',
        description: 'REST or GraphQL API service',
        icon: 'Server',
        category: 'compute',
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
          { name: 'size', label: 'Container size', type: 'select', required: true, tier: 'essential', description: 'CPU and memory allocation per container', default: '0.25-512', optionDetails: [
            { value: '0.25-512', label: '0.25 vCPU / 512 MB', description: 'Lightweight APIs', cost: '~$9/mo', provider: 'aws' },
            { value: '0.5-1024', label: '0.5 vCPU / 1 GB', description: 'Light workloads', cost: '~$18/mo', provider: 'aws' },
            { value: '1-2048', label: '1 vCPU / 2 GB', description: 'Standard workloads', cost: '~$36/mo', provider: 'aws' },
            { value: '2-4096', label: '2 vCPU / 4 GB', description: 'Heavy workloads', cost: '~$73/mo', provider: 'aws' },
            { value: '4-8192', label: '4 vCPU / 8 GB', description: 'Compute-intensive', cost: '~$146/mo', provider: 'aws' },
            { value: 'gcp-1-512', label: '1 vCPU / 512 MB', description: 'Cloud Run minimum', cost: '~$10/mo', provider: 'gcp' },
            { value: 'gcp-2-1024', label: '2 vCPU / 1 GB', description: 'Light workloads', cost: '~$25/mo', provider: 'gcp' },
            { value: 'gcp-4-2048', label: '4 vCPU / 2 GB', description: 'Standard workloads', cost: '~$50/mo', provider: 'gcp' },
            { value: 'azure-0.25-0.5', label: '0.25 vCPU / 0.5 GB', description: 'Container Apps minimum', cost: '~$5/mo', provider: 'azure' },
            { value: 'azure-0.5-1', label: '0.5 vCPU / 1 GB', description: 'Light workloads', cost: '~$15/mo', provider: 'azure' },
            { value: 'azure-1-2', label: '1 vCPU / 2 GB', description: 'Standard workloads', cost: '~$36/mo', provider: 'azure' },
          ] },
          { name: 'runtime', label: 'Runtime', type: 'select', required: false, tier: 'essential', description: 'Language runtime for your API', default: 'nodejs22', optionDetails: [
            { value: 'nodejs22', label: 'Node.js 22', description: 'Latest LTS (recommended)' },
            { value: 'nodejs20', label: 'Node.js 20', description: 'Previous LTS' },
            { value: 'python3.12', label: 'Python 3.12', description: 'Latest stable' },
            { value: 'go1.22', label: 'Go 1.22', description: 'Latest stable' },
            { value: 'java21', label: 'Java 21', description: 'Latest LTS' },
            { value: 'dotnet8', label: '.NET 8', description: 'Latest LTS' },
            { value: 'ruby3.3', label: 'Ruby 3.3', description: 'Latest stable' },
          ] },
          { name: 'login_required', label: 'Require login?', type: 'select', required: false, tier: 'detailed', description: 'How should users prove who they are?', options: ['No login needed', 'API key', 'Username & password tokens', 'Social login (Google, GitHub, etc.)'], default: 'No login needed' },
          { name: 'minInstances', label: 'Min instances', type: 'number', required: false, tier: 'detailed', description: 'Minimum number of always-running instances (0 = scale to zero)', default: 1 },
          { name: 'maxInstances', label: 'Max instances', type: 'number', required: false, tier: 'detailed', description: 'Maximum number of instances during peak traffic', default: 3 },
          { name: 'scalingMetric', label: 'Scale on', type: 'select', required: false, tier: 'detailed', description: 'What metric triggers scaling', options: ['cpu', 'memory', 'requests', 'concurrency'], default: 'cpu' },
          { name: 'scalingThreshold', label: 'Threshold (%)', type: 'number', required: false, tier: 'detailed', description: 'Scale up when the metric exceeds this percentage', default: 70 },
        ],
      },
      {
        id: 'serverless-function',
        name: 'Serverless Function',
        description: 'Event-driven function that scales automatically',
        icon: 'Zap',
        category: 'compute',
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
          { name: 'memory', label: 'Memory', type: 'select', required: false, tier: 'essential', description: 'Memory allocation — also determines proportional CPU', default: '128', tooltip: 'AWS Lambda: 128 MB – 10,240 MB (10 GB) in 1 MB increments. CPU scales proportionally — at 1,769 MB you get 1 full vCPU, at 10,240 MB you get 6 vCPUs. GCP Cloud Functions: 128 MB – 32 GB (2nd gen). Azure Functions: up to 14 GB (Premium plan).', optionDetails: [
            { value: '128', label: '128 MB', description: 'Minimum — quick tasks', cost: '~$0.01/M invocations', provider: 'aws', tooltip: 'Smallest Lambda size. ~0.07 vCPU proportional. Good for simple API responses.' },
            { value: '256', label: '256 MB', description: 'Light processing', cost: '~$0.02/M', provider: 'aws' },
            { value: '512', label: '512 MB', description: 'Standard workloads', cost: '~$0.04/M', provider: 'aws' },
            { value: '1024', label: '1024 MB', description: 'Heavy processing', cost: '~$0.08/M', provider: 'aws' },
            { value: '1769', label: '1769 MB (1 vCPU)', description: 'Full vCPU threshold', cost: '~$0.14/M', provider: 'aws', tooltip: 'At 1,769 MB you get exactly 1 full vCPU. Best price/performance for CPU-bound work.' },
            { value: '2048', label: '2048 MB', description: 'Compute-intensive', cost: '~$0.17/M', provider: 'aws' },
            { value: '3072', label: '3072 MB', description: 'Heavy compute · ~1.7 vCPU', cost: '~$0.25/M', provider: 'aws' },
            { value: '4096', label: '4096 MB', description: 'Very heavy · ~2.3 vCPU', cost: '~$0.33/M', provider: 'aws' },
            { value: '8192', label: '8192 MB', description: 'Maximum compute · ~4.6 vCPU', cost: '~$0.67/M', provider: 'aws' },
            { value: '10240', label: '10240 MB (max)', description: 'Lambda maximum · 6 vCPU', cost: '~$0.83/M', provider: 'aws', tooltip: 'Maximum Lambda memory. Provides 6 vCPUs. Use for ML inference, video processing, etc.' },
            { value: '128-200mhz', label: '128 MB / 200 MHz', description: 'Minimum tier', provider: 'gcp' },
            { value: '256-400mhz', label: '256 MB / 400 MHz', description: 'Light processing', provider: 'gcp' },
            { value: '512-800mhz', label: '512 MB / 800 MHz', description: 'Standard workloads', provider: 'gcp' },
            { value: '1024-1400mhz', label: '1024 MB / 1.4 GHz', description: 'Heavy processing', provider: 'gcp' },
            { value: '2048-2800mhz', label: '2048 MB / 2.8 GHz', description: 'Compute-intensive', provider: 'gcp' },
            { value: '4096-4800mhz', label: '4096 MB / 4.8 GHz', description: 'Very heavy compute', provider: 'gcp' },
            { value: '8192-4800mhz', label: '8192 MB / 4.8 GHz', description: 'Maximum (1st gen)', provider: 'gcp' },
            { value: '16384-gcp', label: '16 GB', description: '2nd gen only · high-memory', provider: 'gcp', tooltip: 'Requires Cloud Functions 2nd gen (Cloud Run based)' },
            { value: '32768-gcp', label: '32 GB (max)', description: '2nd gen maximum', provider: 'gcp', tooltip: 'Maximum memory for Cloud Functions 2nd gen' },
            { value: 'custom', label: 'Custom', description: 'Enter memory (128–10,240 MB)', provider: 'aws' },
            { value: 'custom', label: 'Custom', description: 'Enter memory (128–32,768 MB)', provider: 'gcp' },
            { value: 'custom', label: 'Custom', description: 'Enter memory (128–14,336 MB)', provider: 'azure' },
          ], customInput: { type: 'number', unit: 'MB', min: 128, max: 32768, step: 64, placeholder: 'e.g. 1536' } },
          { name: 'timeout', label: 'Timeout', type: 'select', required: false, tier: 'essential', description: 'Maximum execution time before the function is killed', default: '3', tooltip: 'AWS Lambda: 1–900s (15 min). GCP Cloud Functions: 60s (1st gen), 3,600s (2nd gen). Azure Functions: 300s (Consumption), 1,800s (Premium).', optionDetails: [
            // AWS Lambda: 1–900 seconds
            { value: '3', label: '3 seconds', description: 'Default — fast API responses', provider: 'aws' },
            { value: '10', label: '10 seconds', description: 'Quick processing', provider: 'aws' },
            { value: '30', label: '30 seconds', description: 'Moderate processing', provider: 'aws' },
            { value: '60', label: '60 seconds', description: 'File processing / transforms', provider: 'aws' },
            { value: '300', label: '5 minutes', description: 'Heavy batch work', provider: 'aws' },
            { value: '900', label: '15 minutes', description: 'Maximum', provider: 'aws' },
            { value: 'custom', label: 'Custom', description: 'Enter timeout (1–900s)', provider: 'aws' },
            // GCP Cloud Functions: up to 60 minutes (2nd gen)
            { value: '60', label: '60 seconds', description: '1st gen default maximum', provider: 'gcp' },
            { value: '300', label: '5 minutes', description: 'Standard processing', provider: 'gcp' },
            { value: '540', label: '9 minutes', description: 'Extended processing', provider: 'gcp' },
            { value: '900', label: '15 minutes', description: 'Heavy processing', provider: 'gcp' },
            { value: '1800', label: '30 minutes', description: '2nd gen — long-running', provider: 'gcp' },
            { value: '3600', label: '60 minutes', description: '2nd gen maximum', provider: 'gcp' },
            { value: 'custom', label: 'Custom', description: 'Enter timeout (1–3,600s)', provider: 'gcp' },
            // Azure Functions: depends on plan
            { value: '30', label: '30 seconds', description: 'Quick processing', provider: 'azure' },
            { value: '300', label: '5 minutes', description: 'Consumption plan default max', provider: 'azure' },
            { value: '600', label: '10 minutes', description: 'Consumption plan extended max', provider: 'azure' },
            { value: '1800', label: '30 minutes', description: 'Premium plan maximum', provider: 'azure' },
            { value: 'custom', label: 'Custom', description: 'Enter timeout (1–1,800s)', provider: 'azure' },
          ], customInput: { type: 'number', unit: 'seconds', min: 1, max: 3600, step: 1, placeholder: 'e.g. 120' } },
          { name: 'runtime', label: 'Runtime', type: 'select', required: false, tier: 'essential', description: 'Language runtime for your function code', default: 'nodejs22.x', optionDetails: [
            { value: 'nodejs22.x', label: 'Node.js 22', description: 'Latest LTS (recommended)' },
            { value: 'nodejs20.x', label: 'Node.js 20', description: 'Previous LTS — widely supported' },
            { value: 'python3.12', label: 'Python 3.12', description: 'Latest stable' },
            { value: 'python3.11', label: 'Python 3.11', description: 'Previous stable' },
            { value: 'go1.x', label: 'Go 1.x', description: 'Fast cold starts' },
            { value: 'java21', label: 'Java 21', description: 'Latest LTS' },
            { value: 'java17', label: 'Java 17', description: 'Previous LTS' },
            { value: 'dotnet8', label: '.NET 8', description: 'Latest LTS' },
            { value: 'ruby3.3', label: 'Ruby 3.3', description: 'Latest stable' },
          ] },
        ],
      },
      {
        id: 'function-compute',
        name: 'Function Compute',
        description: 'Alibaba Cloud serverless functions with event-driven execution',
        icon: 'Zap',
        category: 'compute',
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
          { name: 'memory', label: 'Memory', type: 'select', required: false, tier: 'essential', description: 'Memory allocation — also determines proportional CPU', default: '512', optionDetails: [
            { value: '128', label: '128 MB', description: 'Minimum — quick tasks', cost: '~$0.01/M invocations', provider: 'alibaba' },
            { value: '256', label: '256 MB', description: 'Light processing', cost: '~$0.02/M', provider: 'alibaba' },
            { value: '512', label: '512 MB', description: 'Standard workloads', cost: '~$0.04/M', provider: 'alibaba' },
            { value: '1024', label: '1024 MB', description: 'Heavy processing', cost: '~$0.08/M', provider: 'alibaba' },
            { value: '3072', label: '3072 MB', description: 'Compute-intensive', cost: '~$0.24/M', provider: 'alibaba' },
          ] },
          { name: 'runtime', label: 'Runtime', type: 'select', required: false, tier: 'essential', description: 'Language runtime for your function', default: 'nodejs18', optionDetails: [
            { value: 'nodejs18', label: 'Node.js 18', description: 'Latest supported LTS' },
            { value: 'nodejs16', label: 'Node.js 16', description: 'Previous LTS' },
            { value: 'python3.10', label: 'Python 3.10', description: 'Latest stable' },
            { value: 'python3.9', label: 'Python 3.9', description: 'Previous stable' },
            { value: 'java11', label: 'Java 11', description: 'LTS' },
            { value: 'java17', label: 'Java 17', description: 'Latest LTS' },
            { value: 'go1.x', label: 'Go', description: 'Latest stable' },
          ] },
        ],
      },
      {
        id: 'oci-functions',
        name: 'OCI Functions',
        description: 'Oracle Cloud serverless functions based on Fn Project',
        icon: 'Zap',
        category: 'compute',
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
          { name: 'memory', label: 'Memory', type: 'select', required: false, tier: 'essential', description: 'Memory allocation for function execution', default: '256', optionDetails: [
            { value: '128', label: '128 MB', description: 'Minimum — simple tasks', cost: '~2M free invocations/mo', provider: 'oci' },
            { value: '256', label: '256 MB', description: 'Light processing', provider: 'oci' },
            { value: '512', label: '512 MB', description: 'Standard workloads', provider: 'oci' },
            { value: '1024', label: '1024 MB', description: 'Heavy processing', provider: 'oci' },
            { value: '2048', label: '2048 MB', description: 'Compute-intensive (max)', provider: 'oci' },
          ] },
          { name: 'runtime', label: 'Runtime', type: 'select', required: false, tier: 'essential', description: 'Language runtime (Fn Project based)', default: 'java17-jdk', optionDetails: [
            { value: 'java17-jdk', label: 'Java 17', description: 'Latest supported LTS' },
            { value: 'java11-jdk', label: 'Java 11', description: 'Previous LTS' },
            { value: 'python3.11', label: 'Python 3.11', description: 'Latest stable' },
            { value: 'python3.9', label: 'Python 3.9', description: 'Previous stable' },
            { value: 'nodejs18', label: 'Node.js 18', description: 'Latest supported' },
            { value: 'go1.21', label: 'Go 1.21', description: 'Latest stable' },
            { value: 'ruby3.1', label: 'Ruby 3.1', description: 'Supported via Fn' },
          ] },
        ],
      },
      {
        id: 'do-app-platform',
        name: 'App Platform',
        description: 'DigitalOcean PaaS with git-push deployment',
        icon: 'Server',
        category: 'compute',
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
          { name: 'size', label: 'Instance size', type: 'select', required: true, tier: 'essential', description: 'Container size for your app', default: 'basic-xxs', optionDetails: [
            { value: 'basic-xxs', label: 'Basic XXS', description: '1 vCPU · 512 MB RAM', cost: '~$5/mo', provider: 'digitalocean' },
            { value: 'basic-xs', label: 'Basic XS', description: '1 vCPU · 1 GB RAM', cost: '~$10/mo', provider: 'digitalocean' },
            { value: 'basic-s', label: 'Basic S', description: '1 vCPU · 2 GB RAM', cost: '~$20/mo', provider: 'digitalocean' },
            { value: 'pro-xs', label: 'Professional XS', description: '1 vCPU · 1 GB · auto-scale', cost: '~$12/mo', provider: 'digitalocean' },
            { value: 'pro-s', label: 'Professional S', description: '1 vCPU · 2 GB · auto-scale', cost: '~$25/mo', provider: 'digitalocean' },
            { value: 'pro-m', label: 'Professional M', description: '2 vCPU · 4 GB · auto-scale', cost: '~$50/mo', provider: 'digitalocean' },
          ] },
          { name: 'runtime', label: 'Runtime', type: 'select', required: false, tier: 'essential', description: 'Language runtime for your app', default: 'nodejs', optionDetails: [
            { value: 'nodejs', label: 'Node.js', description: 'Auto-detected from package.json' },
            { value: 'python', label: 'Python', description: 'Auto-detected from requirements.txt' },
            { value: 'go', label: 'Go', description: 'Auto-detected from go.mod' },
            { value: 'ruby', label: 'Ruby', description: 'Auto-detected from Gemfile' },
            { value: 'docker', label: 'Docker', description: 'Custom Dockerfile' },
          ] },
        ],
      },
      {
        id: 'container-service',
        name: 'Container Service',
        description: 'Dockerized application running in containers',
        icon: 'Box',
        category: 'compute',
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
          { name: 'size', label: 'Container size', type: 'select', required: true, tier: 'essential', description: 'CPU and memory allocation per container', default: '0.25-512', optionDetails: [
            { value: '0.25-512', label: '0.25 vCPU / 512 MB', description: 'Lightweight tasks', cost: '~$9/mo', provider: 'aws' },
            { value: '0.5-1024', label: '0.5 vCPU / 1 GB', description: 'Light workloads', cost: '~$18/mo', provider: 'aws' },
            { value: '1-2048', label: '1 vCPU / 2 GB', description: 'Standard workloads', cost: '~$36/mo', provider: 'aws' },
            { value: '2-4096', label: '2 vCPU / 4 GB', description: 'Heavy workloads', cost: '~$73/mo', provider: 'aws' },
            { value: '4-8192', label: '4 vCPU / 8 GB', description: 'Compute-intensive', cost: '~$146/mo', provider: 'aws' },
            { value: 'gcp-1-512', label: '1 vCPU / 512 MB', description: 'Cloud Run minimum', cost: '~$10/mo', provider: 'gcp' },
            { value: 'gcp-2-1024', label: '2 vCPU / 1 GB', description: 'Light workloads', cost: '~$25/mo', provider: 'gcp' },
            { value: 'gcp-4-2048', label: '4 vCPU / 2 GB', description: 'Standard workloads', cost: '~$50/mo', provider: 'gcp' },
            { value: 'azure-0.25-0.5', label: '0.25 vCPU / 0.5 GB', description: 'Container Apps minimum', cost: '~$5/mo', provider: 'azure' },
            { value: 'azure-0.5-1', label: '0.5 vCPU / 1 GB', description: 'Light workloads', cost: '~$15/mo', provider: 'azure' },
            { value: 'azure-1-2', label: '1 vCPU / 2 GB', description: 'Standard workloads', cost: '~$36/mo', provider: 'azure' },
          ] },
          { name: 'image', label: 'Container image', type: 'string', required: false, tier: 'detailed', description: 'The Docker image to run (leave blank if building from source)', placeholder: 'e.g. nginx:latest' },
          { name: 'runtime', label: 'Runtime', type: 'select', required: false, tier: 'detailed', description: 'Application runtime or base image', default: 'nodejs22', optionDetails: [
            { value: 'nodejs22', label: 'Node.js 22', description: 'Latest LTS (recommended)' },
            { value: 'nodejs20', label: 'Node.js 20', description: 'Previous LTS' },
            { value: 'python3.12', label: 'Python 3.12', description: 'Latest stable' },
            { value: 'go1.22', label: 'Go 1.22', description: 'Latest stable' },
            { value: 'java21', label: 'Java 21', description: 'Latest LTS' },
            { value: 'dotnet8', label: '.NET 8', description: 'Latest LTS' },
            { value: 'rust', label: 'Rust', description: 'Systems programming' },
            { value: 'custom', label: 'Custom Docker', description: 'Bring your own Dockerfile' },
          ] },
          { name: 'env_vars', label: 'Environment variables', type: 'list', required: false, tier: 'detailed', description: 'Configuration values your app needs at startup', placeholder: 'e.g. DATABASE_URL=...', addLabel: 'Add a variable' },
          { name: 'minInstances', label: 'Min instances', type: 'number', required: false, tier: 'detailed', description: 'Minimum number of always-running instances (0 = scale to zero)', default: 1 },
          { name: 'maxInstances', label: 'Max instances', type: 'number', required: false, tier: 'detailed', description: 'Maximum number of instances during peak traffic', default: 3 },
          { name: 'scalingMetric', label: 'Scale on', type: 'select', required: false, tier: 'detailed', description: 'What metric triggers scaling', options: ['cpu', 'memory', 'requests', 'concurrency'], default: 'cpu' },
          { name: 'scalingThreshold', label: 'Threshold (%)', type: 'number', required: false, tier: 'detailed', description: 'Scale up when the metric exceeds this percentage', default: 70 },
        ],
      },
      {
        id: 'worker',
        name: 'Worker',
        description: 'Long-running background processor for queues, events, and batch jobs',
        icon: 'Cog',
        category: 'compute',
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
          { name: 'size', label: 'Container size', type: 'select', required: true, tier: 'essential', description: 'CPU and memory allocation per worker', default: '0.5-1024', optionDetails: [
            { value: '0.25-512', label: '0.25 vCPU / 512 MB', description: 'Lightweight tasks', cost: '~$9/mo', provider: 'aws' },
            { value: '0.5-1024', label: '0.5 vCPU / 1 GB', description: 'Light processing', cost: '~$18/mo', provider: 'aws' },
            { value: '1-2048', label: '1 vCPU / 2 GB', description: 'Standard workloads', cost: '~$36/mo', provider: 'aws' },
            { value: '2-4096', label: '2 vCPU / 4 GB', description: 'Heavy batch work', cost: '~$73/mo', provider: 'aws' },
            { value: '4-8192', label: '4 vCPU / 8 GB', description: 'Compute-intensive', cost: '~$146/mo', provider: 'aws' },
            { value: 'gcp-1-512', label: '1 vCPU / 512 MB', description: 'Cloud Run Job minimum', cost: '~$10/mo', provider: 'gcp' },
            { value: 'gcp-2-1024', label: '2 vCPU / 1 GB', description: 'Light processing', cost: '~$25/mo', provider: 'gcp' },
            { value: 'gcp-4-2048', label: '4 vCPU / 2 GB', description: 'Standard workloads', cost: '~$50/mo', provider: 'gcp' },
            { value: 'azure-0.5-1', label: '0.5 vCPU / 1 GB', description: 'Container Apps minimum', cost: '~$15/mo', provider: 'azure' },
            { value: 'azure-1-2', label: '1 vCPU / 2 GB', description: 'Standard workloads', cost: '~$36/mo', provider: 'azure' },
            { value: 'azure-2-4', label: '2 vCPU / 4 GB', description: 'Heavy workloads', cost: '~$73/mo', provider: 'azure' },
          ] },
          { name: 'runtime', label: 'Runtime', type: 'select', required: false, tier: 'essential', description: 'Language runtime for your worker', default: 'nodejs22', optionDetails: [
            { value: 'nodejs22', label: 'Node.js 22', description: 'Latest LTS (recommended)' },
            { value: 'nodejs20', label: 'Node.js 20', description: 'Previous LTS' },
            { value: 'python3.12', label: 'Python 3.12', description: 'Latest stable' },
            { value: 'go1.22', label: 'Go 1.22', description: 'Latest stable' },
            { value: 'java21', label: 'Java 21', description: 'Latest LTS' },
            { value: 'custom', label: 'Custom Docker', description: 'Bring your own Dockerfile' },
          ] },
          { name: 'image', label: 'Container image', type: 'string', required: false, tier: 'detailed', description: 'Docker image to run (if using a container)', placeholder: 'e.g. my-worker:latest' },
          { name: 'minInstances', label: 'Min instances', type: 'number', required: false, tier: 'detailed', description: 'Minimum number of always-running workers', default: 1 },
          { name: 'maxInstances', label: 'Max instances', type: 'number', required: false, tier: 'detailed', description: 'Maximum number of workers during peak load', default: 3 },
          { name: 'scalingMetric', label: 'Scale on', type: 'select', required: false, tier: 'detailed', description: 'What metric triggers scaling', options: ['cpu', 'memory', 'queue-depth'], default: 'cpu' },
          { name: 'scalingThreshold', label: 'Threshold (%)', type: 'number', required: false, tier: 'detailed', description: 'Scale up when the metric exceeds this percentage', default: 70 },
        ],
      },
      {
        id: 'ssr-site',
        name: 'SSR Site',
        description: 'Server-rendered web application (Next.js, Nuxt, Remix)',
        icon: 'Monitor',
        category: 'compute',
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
          { name: 'framework', label: 'Framework', type: 'select', required: false, tier: 'essential', description: 'Which framework is your app built with?', default: 'nextjs', optionDetails: [
            { value: 'nextjs', label: 'Next.js', description: 'React SSR/SSG — most popular' },
            { value: 'nuxt', label: 'Nuxt', description: 'Vue SSR/SSG framework' },
            { value: 'remix', label: 'Remix', description: 'React full-stack web framework' },
            { value: 'sveltekit', label: 'SvelteKit', description: 'Svelte full-stack framework' },
            { value: 'astro', label: 'Astro', description: 'Content-focused with islands' },
          ] },
          { name: 'size', label: 'Hosting size', type: 'select', required: true, tier: 'essential', description: 'Server resources for rendering pages', default: 'amplify-standard', optionDetails: [
            { value: 'amplify-standard', label: 'Amplify Standard', description: 'Managed SSR · auto-scaling', cost: '~$0.15/GB served', provider: 'aws' },
            { value: '0.5-1024', label: '0.5 vCPU / 1 GB', description: 'Light traffic', cost: '~$18/mo', provider: 'aws' },
            { value: '1-2048', label: '1 vCPU / 2 GB', description: 'Standard traffic', cost: '~$36/mo', provider: 'aws' },
            { value: '2-4096', label: '2 vCPU / 4 GB', description: 'Heavy traffic', cost: '~$73/mo', provider: 'aws' },
            { value: 'gcp-1-512', label: '1 vCPU / 512 MB', description: 'Cloud Run minimum', cost: '~$10/mo', provider: 'gcp' },
            { value: 'gcp-2-1024', label: '2 vCPU / 1 GB', description: 'Standard traffic', cost: '~$25/mo', provider: 'gcp' },
            { value: 'gcp-4-2048', label: '4 vCPU / 2 GB', description: 'Heavy traffic', cost: '~$50/mo', provider: 'gcp' },
            { value: 'azure-B1', label: 'B1 (1 vCPU / 1.75 GB)', description: 'Basic tier', cost: '~$13/mo', provider: 'azure' },
            { value: 'azure-S1', label: 'S1 (1 vCPU / 1.75 GB)', description: 'Standard · auto-scale', cost: '~$73/mo', provider: 'azure' },
            { value: 'azure-P1v3', label: 'P1v3 (2 vCPU / 8 GB)', description: 'Premium · high perf', cost: '~$138/mo', provider: 'azure' },
          ] },
          { name: 'custom_domain', label: 'Custom domain', type: 'string', required: false, tier: 'detailed', description: 'Use your own domain name instead of the default one', placeholder: 'e.g. www.example.com' },
          { name: 'minInstances', label: 'Min instances', type: 'number', required: false, tier: 'detailed', description: 'Minimum number of always-running instances (0 = scale to zero)', default: 1 },
          { name: 'maxInstances', label: 'Max instances', type: 'number', required: false, tier: 'detailed', description: 'Maximum number of instances during peak traffic', default: 3 },
          { name: 'scalingMetric', label: 'Scale on', type: 'select', required: false, tier: 'detailed', description: 'What metric triggers scaling', options: ['cpu', 'memory', 'requests', 'concurrency'], default: 'cpu' },
          { name: 'scalingThreshold', label: 'Threshold (%)', type: 'number', required: false, tier: 'detailed', description: 'Scale up when the metric exceeds this percentage', default: 70 },
        ],
      },
      {
        id: 'scheduled-task',
        name: 'Scheduled Task',
        description: 'Run code on a schedule (cron jobs)',
        icon: 'Clock',
        category: 'compute',
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
          { name: 'timezone', label: 'Timezone', type: 'select', required: false, tier: 'essential', description: 'Which timezone should the schedule follow?', default: 'UTC', optionDetails: [
            { value: 'UTC', label: 'UTC', description: 'Coordinated Universal Time' },
            { value: 'US/Eastern', label: 'US/Eastern', description: 'New York (EST/EDT)' },
            { value: 'US/Pacific', label: 'US/Pacific', description: 'Los Angeles (PST/PDT)' },
            { value: 'Europe/London', label: 'Europe/London', description: 'London (GMT/BST)' },
            { value: 'Europe/Berlin', label: 'Europe/Berlin', description: 'Berlin (CET/CEST)' },
            { value: 'Asia/Tokyo', label: 'Asia/Tokyo', description: 'Tokyo (JST)' },
            { value: 'Asia/Shanghai', label: 'Asia/Shanghai', description: 'Shanghai (CST)' },
            { value: 'Australia/Sydney', label: 'Australia/Sydney', description: 'Sydney (AEST/AEDT)' },
          ] },
          { name: 'schedule_expression', label: 'Custom schedule (cron)', type: 'string', required: false, tier: 'advanced', description: 'Advanced: a cron expression for precise scheduling', placeholder: 'e.g. 0 9 * * MON-FRI' },
        ],
      },
      {
        id: 'llm-gateway',
        name: 'LLM Gateway',
        description: 'Proxy and route LLM API calls with rate limiting and fallbacks',
        icon: 'BrainCircuit',
        category: 'compute',
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
          { name: 'model', label: 'Primary model', type: 'select', required: false, tier: 'essential', description: 'Default LLM model to route requests to', default: 'claude-sonnet', optionDetails: [
            { value: 'claude-sonnet', label: 'Claude Sonnet', description: 'Fast, balanced — great for most tasks', cost: '~$3/$15 per M tokens in/out', provider: 'aws' },
            { value: 'claude-opus', label: 'Claude Opus', description: 'Most capable — complex reasoning', cost: '~$15/$75 per M tokens in/out', provider: 'aws' },
            { value: 'claude-haiku', label: 'Claude Haiku', description: 'Fastest, cheapest — simple tasks', cost: '~$0.25/$1.25 per M tokens in/out', provider: 'aws' },
            { value: 'gpt-4o', label: 'GPT-4o', description: 'OpenAI flagship — multimodal', cost: '~$2.50/$10 per M tokens in/out' },
            { value: 'gpt-4o-mini', label: 'GPT-4o mini', description: 'OpenAI fast — cost-efficient', cost: '~$0.15/$0.60 per M tokens in/out' },
            { value: 'gemini-pro', label: 'Gemini 2.5 Pro', description: 'Google flagship — long context', cost: '~$1.25/$10 per M tokens in/out', provider: 'gcp' },
            { value: 'gemini-flash', label: 'Gemini 2.5 Flash', description: 'Google fast — cost-efficient', cost: '~$0.15/$0.60 per M tokens in/out', provider: 'gcp' },
            { value: 'azure-gpt-4o', label: 'Azure OpenAI GPT-4o', description: 'GPT-4o via Azure endpoint', cost: '~$2.50/$10 per M tokens in/out', provider: 'azure' },
          ] },
          { name: 'providers', label: 'AI providers', type: 'list', required: false, tier: 'detailed', description: 'Which AI providers should this gateway connect to?', placeholder: 'e.g. OpenAI, Anthropic, Google', addLabel: 'Add a provider' },
          { name: 'fallback', label: 'Auto-switch if a provider is down?', type: 'boolean', required: false, tier: 'detailed', description: 'Automatically tries another AI provider if the first one fails', default: true },
        ],
      },
      {
        id: 'ml-model',
        name: 'ML Model Serving',
        description: 'Deploy and serve machine learning models with GPU support',
        icon: 'Brain',
        category: 'compute',
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
          { name: 'size', label: 'Instance type', type: 'select', required: true, tier: 'essential', description: 'Hardware for model inference — GPU type determines speed and cost', default: 'ml.g5.xlarge', optionDetails: [
            { value: 'ml.t3.medium', label: 'ml.t3.medium (CPU)', description: '2 vCPU · 4 GB RAM · No GPU', cost: '~$50/mo', provider: 'aws' },
            { value: 'ml.g5.xlarge', label: 'ml.g5.xlarge', description: '4 vCPU · 16 GB · 1x A10G (24 GB)', cost: '~$816/mo', provider: 'aws' },
            { value: 'ml.g5.2xlarge', label: 'ml.g5.2xlarge', description: '8 vCPU · 32 GB · 1x A10G (24 GB)', cost: '~$1,190/mo', provider: 'aws' },
            { value: 'ml.p3.2xlarge', label: 'ml.p3.2xlarge', description: '8 vCPU · 61 GB · 1x V100 (16 GB)', cost: '~$2,300/mo', provider: 'aws' },
            { value: 'ml.p4d.24xlarge', label: 'ml.p4d.24xlarge', description: '96 vCPU · 1.1 TB · 8x A100 (40 GB)', cost: '~$23,600/mo', provider: 'aws' },
            { value: 'n1-standard-4-t4', label: 'n1-std-4 + T4', description: '4 vCPU · 15 GB · 1x T4 (16 GB)', cost: '~$350/mo', provider: 'gcp' },
            { value: 'n1-standard-8-l4', label: 'n1-std-8 + L4', description: '8 vCPU · 30 GB · 1x L4 (24 GB)', cost: '~$670/mo', provider: 'gcp' },
            { value: 'a2-highgpu-1g', label: 'a2-highgpu-1g', description: '12 vCPU · 85 GB · 1x A100 (40 GB)', cost: '~$2,500/mo', provider: 'gcp' },
            { value: 'Standard_NC4as_T4_v3', label: 'NC4as T4 v3', description: '4 vCPU · 28 GB · 1x T4 (16 GB)', cost: '~$380/mo', provider: 'azure' },
            { value: 'Standard_NC24ads_A100_v4', label: 'NC24ads A100 v4', description: '24 vCPU · 220 GB · 1x A100 (80 GB)', cost: '~$3,670/mo', provider: 'azure' },
          ] },
          { name: 'framework', label: 'ML framework', type: 'select', required: false, tier: 'essential', description: 'What framework was your model built with?', default: 'pytorch', optionDetails: [
            { value: 'pytorch', label: 'PyTorch', description: 'Most popular — flexible and fast' },
            { value: 'tensorflow', label: 'TensorFlow', description: 'Production-grade — TF Serving' },
            { value: 'onnx', label: 'ONNX', description: 'Cross-framework portable format' },
            { value: 'vllm', label: 'vLLM', description: 'Optimized LLM serving' },
            { value: 'triton', label: 'Triton', description: 'NVIDIA multi-framework server' },
            { value: 'custom', label: 'Custom', description: 'Bring your own serving code' },
          ] },
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
          { name: 'size', label: 'Instance type', type: 'select', required: true, tier: 'essential', description: 'Database server size — determines CPU, memory, and performance', default: 'db.t3.micro', tooltip: 'AWS RDS: Burstable (t3) for dev/test, Memory-optimized (r6g) for production. GCP Cloud SQL: Custom machine types up to 96 vCPU / 624 GB. Azure: Burstable (B) for dev, General Purpose (D) for production.', optionDetails: [
            { value: 'db.t3.micro', label: 'db.t3.micro', description: '2 vCPU · 1 GB RAM', cost: '~$15/mo', provider: 'aws', tooltip: 'Burstable instance — good for dev/test with intermittent CPU needs' },
            { value: 'db.t3.small', label: 'db.t3.small', description: '2 vCPU · 2 GB RAM', cost: '~$29/mo', provider: 'aws' },
            { value: 'db.t3.medium', label: 'db.t3.medium', description: '2 vCPU · 4 GB RAM', cost: '~$58/mo', provider: 'aws' },
            { value: 'db.t3.large', label: 'db.t3.large', description: '2 vCPU · 8 GB RAM', cost: '~$116/mo', provider: 'aws', tooltip: 'Largest burstable instance — good for small production workloads' },
            { value: 'db.r6g.large', label: 'db.r6g.large', description: '2 vCPU · 16 GB RAM', cost: '~$175/mo', provider: 'aws', tooltip: 'Memory-optimized (Graviton2) — recommended for production databases' },
            { value: 'db.r6g.xlarge', label: 'db.r6g.xlarge', description: '4 vCPU · 32 GB RAM', cost: '~$350/mo', provider: 'aws' },
            { value: 'db.r6g.2xlarge', label: 'db.r6g.2xlarge', description: '8 vCPU · 64 GB RAM', cost: '~$700/mo', provider: 'aws' },
            { value: 'db.r6g.4xlarge', label: 'db.r6g.4xlarge', description: '16 vCPU · 128 GB RAM', cost: '~$1,400/mo', provider: 'aws' },
            { value: 'db-f1-micro', label: 'db-f1-micro', description: 'Shared vCPU · 0.6 GB RAM', cost: '~$10/mo', provider: 'gcp', tooltip: 'Shared-core instance — suitable for development and testing only' },
            { value: 'db-g1-small', label: 'db-g1-small', description: 'Shared vCPU · 1.7 GB RAM', cost: '~$25/mo', provider: 'gcp' },
            { value: 'db-custom-2-8192', label: 'db-custom-2-8192', description: '2 vCPU · 8 GB RAM', cost: '~$97/mo', provider: 'gcp' },
            { value: 'db-custom-4-16384', label: 'db-custom-4-16384', description: '4 vCPU · 16 GB RAM', cost: '~$190/mo', provider: 'gcp' },
            { value: 'db-custom-8-32768', label: 'db-custom-8-32768', description: '8 vCPU · 32 GB RAM', cost: '~$380/mo', provider: 'gcp' },
            { value: 'db-custom-16-65536', label: 'db-custom-16-65536', description: '16 vCPU · 64 GB RAM', cost: '~$760/mo', provider: 'gcp' },
            { value: 'B_Standard_B1ms', label: 'B1ms', description: '1 vCPU · 2 GB RAM', cost: '~$14/mo', provider: 'azure', tooltip: 'Burstable tier — for workloads that don\'t use the CPU continuously' },
            { value: 'B_Standard_B2s', label: 'B2s', description: '2 vCPU · 4 GB RAM', cost: '~$50/mo', provider: 'azure' },
            { value: 'GP_Standard_D2s_v3', label: 'D2s v3', description: '2 vCPU · 8 GB RAM', cost: '~$100/mo', provider: 'azure', tooltip: 'General Purpose — balanced compute and memory for most production workloads' },
            { value: 'GP_Standard_D4s_v3', label: 'D4s v3', description: '4 vCPU · 16 GB RAM', cost: '~$200/mo', provider: 'azure' },
            { value: 'GP_Standard_D8s_v3', label: 'D8s v3', description: '8 vCPU · 32 GB RAM', cost: '~$400/mo', provider: 'azure' },
            { value: 'GP_Standard_D16s_v3', label: 'D16s v3', description: '16 vCPU · 64 GB RAM', cost: '~$800/mo', provider: 'azure' },
            { value: 'db-s-1vcpu-1gb', label: '1 vCPU / 1 GB', description: '1 vCPU · 1 GB RAM · 10 GB disk', cost: '~$15/mo', provider: 'digitalocean' },
            { value: 'db-s-1vcpu-2gb', label: '1 vCPU / 2 GB', description: '1 vCPU · 2 GB RAM · 25 GB disk', cost: '~$30/mo', provider: 'digitalocean' },
            { value: 'db-s-2vcpu-4gb', label: '2 vCPU / 4 GB', description: '2 vCPU · 4 GB RAM · 38 GB disk', cost: '~$60/mo', provider: 'digitalocean' },
            { value: 'db-s-4vcpu-8gb', label: '4 vCPU / 8 GB', description: '4 vCPU · 8 GB RAM · 115 GB disk', cost: '~$120/mo', provider: 'digitalocean' },
          ] },
          { name: 'storage', label: 'Storage', type: 'select', required: false, tier: 'essential', description: 'Disk space for your data', default: '20', tooltip: 'AWS RDS: 20 GB – 64 TB (gp3/io1). GCP Cloud SQL: 10 GB – 64 TB. Azure: 32 GB – 32 TB. Storage can be increased later without downtime on most providers.', optionDetails: [
            { value: '20', label: '20 GB', description: 'Development and small apps' },
            { value: '50', label: '50 GB', description: 'Small production workload' },
            { value: '100', label: '100 GB', description: 'Medium production workload' },
            { value: '250', label: '250 GB', description: 'Growing production workload' },
            { value: '500', label: '500 GB', description: 'Large datasets' },
            { value: '1000', label: '1 TB', description: 'Very large datasets' },
            { value: '2000', label: '2 TB', description: 'Enterprise workload' },
            { value: '5000', label: '5 TB', description: 'Large enterprise workload' },
            { value: '10000', label: '10 TB', description: 'Data-intensive workload' },
            { value: 'custom', label: 'Custom', description: 'Enter a specific storage size' },
          ], customInput: { type: 'number', unit: 'GB', min: 10, max: 65536, step: 10, placeholder: 'e.g. 750' } },
          { name: 'version', label: 'Version', type: 'select', required: false, tier: 'essential', description: 'PostgreSQL engine version', default: '17', tooltip: 'Newer versions offer better performance, security patches, and features. Older versions are available for compatibility. Check your provider for exact version support.', optionDetails: [
            { value: '17', label: 'PostgreSQL 17', description: 'Latest — newest features and best performance' },
            { value: '16', label: 'PostgreSQL 16', description: 'Stable — widely supported (recommended)' },
            { value: '15', label: 'PostgreSQL 15', description: 'Mature — long-term support' },
            { value: '14', label: 'PostgreSQL 14', description: 'Older — long-term support until Nov 2026' },
            { value: '13', label: 'PostgreSQL 13', description: 'Legacy — end of life Nov 2025', tooltip: 'No longer receiving security updates. Upgrade recommended.' },
          ] },
          { name: 'production', label: 'Production-ready?', type: 'boolean', required: false, tier: 'detailed', description: 'Enables automatic backups, multi-AZ high availability, and encryption at rest', default: false, tooltip: 'AWS: Multi-AZ deployment with synchronous standby. GCP: Regional instance with automatic failover. Azure: Zone-redundant HA. Roughly doubles the cost but protects against outages.' },
          { name: 'backup_retention', label: 'Backup retention', type: 'select', required: false, tier: 'detailed', description: 'How many days to keep automated backups', default: '7', tooltip: 'AWS RDS: 0–35 days. GCP Cloud SQL: 1–365 days. Azure: 7–35 days. Longer retention uses more storage and increases cost.', optionDetails: [
            // AWS RDS: 0–35 days
            { value: '1', label: '1 day', description: 'Minimum — dev only', provider: 'aws' },
            { value: '7', label: '7 days', description: 'Standard (recommended)', provider: 'aws' },
            { value: '14', label: '14 days', description: 'Extended retention', provider: 'aws' },
            { value: '30', label: '30 days', description: 'Monthly compliance window', provider: 'aws' },
            { value: '35', label: '35 days', description: 'Maximum', provider: 'aws' },
            { value: 'custom', label: 'Custom', description: 'Enter retention (0–35 days)', provider: 'aws' },
            // GCP Cloud SQL: 1–365 days
            { value: '1', label: '1 day', description: 'Minimum — dev only', provider: 'gcp' },
            { value: '7', label: '7 days', description: 'Standard (recommended)', provider: 'gcp' },
            { value: '14', label: '14 days', description: 'Extended retention', provider: 'gcp' },
            { value: '30', label: '30 days', description: 'Monthly compliance window', provider: 'gcp' },
            { value: '90', label: '90 days', description: 'Quarterly compliance', provider: 'gcp' },
            { value: '365', label: '365 days', description: 'Maximum', provider: 'gcp' },
            { value: 'custom', label: 'Custom', description: 'Enter retention (1–365 days)', provider: 'gcp' },
            // Azure: 7–35 days
            { value: '7', label: '7 days', description: 'Minimum (recommended)', provider: 'azure' },
            { value: '14', label: '14 days', description: 'Extended retention', provider: 'azure' },
            { value: '30', label: '30 days', description: 'Monthly compliance window', provider: 'azure' },
            { value: '35', label: '35 days', description: 'Maximum', provider: 'azure' },
            { value: 'custom', label: 'Custom', description: 'Enter retention (7–35 days)', provider: 'azure' },
            // DigitalOcean: automatic backups (7 days included)
            { value: '7', label: '7 days', description: 'Included with backups', provider: 'digitalocean' },
          ], customInput: { type: 'number', unit: 'days', min: 1, max: 365, step: 1, placeholder: 'e.g. 21' } },
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
          { name: 'size', label: 'Instance type', type: 'select', required: true, tier: 'essential', description: 'Database server size — determines CPU, memory, and performance', default: 'db.t3.micro', tooltip: 'AWS RDS: Burstable (t3) for dev/test, Memory-optimized (r6g) for production. GCP Cloud SQL: Custom machine types up to 96 vCPU / 624 GB. Azure: Burstable (B) for dev, General Purpose (D) for production.', optionDetails: [
            { value: 'db.t3.micro', label: 'db.t3.micro', description: '2 vCPU · 1 GB RAM', cost: '~$15/mo', provider: 'aws' },
            { value: 'db.t3.small', label: 'db.t3.small', description: '2 vCPU · 2 GB RAM', cost: '~$29/mo', provider: 'aws' },
            { value: 'db.t3.medium', label: 'db.t3.medium', description: '2 vCPU · 4 GB RAM', cost: '~$58/mo', provider: 'aws' },
            { value: 'db.t3.large', label: 'db.t3.large', description: '2 vCPU · 8 GB RAM', cost: '~$116/mo', provider: 'aws' },
            { value: 'db.r6g.large', label: 'db.r6g.large', description: '2 vCPU · 16 GB RAM', cost: '~$175/mo', provider: 'aws' },
            { value: 'db.r6g.xlarge', label: 'db.r6g.xlarge', description: '4 vCPU · 32 GB RAM', cost: '~$350/mo', provider: 'aws' },
            { value: 'db.r6g.2xlarge', label: 'db.r6g.2xlarge', description: '8 vCPU · 64 GB RAM', cost: '~$700/mo', provider: 'aws' },
            { value: 'db.r6g.4xlarge', label: 'db.r6g.4xlarge', description: '16 vCPU · 128 GB RAM', cost: '~$1,400/mo', provider: 'aws' },
            { value: 'db-f1-micro', label: 'db-f1-micro', description: 'Shared vCPU · 0.6 GB RAM', cost: '~$10/mo', provider: 'gcp' },
            { value: 'db-g1-small', label: 'db-g1-small', description: 'Shared vCPU · 1.7 GB RAM', cost: '~$25/mo', provider: 'gcp' },
            { value: 'db-custom-2-8192', label: 'db-custom-2-8192', description: '2 vCPU · 8 GB RAM', cost: '~$97/mo', provider: 'gcp' },
            { value: 'db-custom-4-16384', label: 'db-custom-4-16384', description: '4 vCPU · 16 GB RAM', cost: '~$190/mo', provider: 'gcp' },
            { value: 'db-custom-8-32768', label: 'db-custom-8-32768', description: '8 vCPU · 32 GB RAM', cost: '~$380/mo', provider: 'gcp' },
            { value: 'db-custom-16-65536', label: 'db-custom-16-65536', description: '16 vCPU · 64 GB RAM', cost: '~$760/mo', provider: 'gcp' },
            { value: 'B_Standard_B1ms', label: 'B1ms', description: '1 vCPU · 2 GB RAM', cost: '~$14/mo', provider: 'azure' },
            { value: 'B_Standard_B2s', label: 'B2s', description: '2 vCPU · 4 GB RAM', cost: '~$50/mo', provider: 'azure' },
            { value: 'GP_Standard_D2s_v3', label: 'D2s v3', description: '2 vCPU · 8 GB RAM', cost: '~$100/mo', provider: 'azure' },
            { value: 'GP_Standard_D4s_v3', label: 'D4s v3', description: '4 vCPU · 16 GB RAM', cost: '~$200/mo', provider: 'azure' },
            { value: 'GP_Standard_D8s_v3', label: 'D8s v3', description: '8 vCPU · 32 GB RAM', cost: '~$400/mo', provider: 'azure' },
            { value: 'GP_Standard_D16s_v3', label: 'D16s v3', description: '16 vCPU · 64 GB RAM', cost: '~$800/mo', provider: 'azure' },
            { value: 'db-s-1vcpu-1gb', label: '1 vCPU / 1 GB', description: '1 vCPU · 1 GB RAM · 10 GB disk', cost: '~$15/mo', provider: 'digitalocean' },
            { value: 'db-s-1vcpu-2gb', label: '1 vCPU / 2 GB', description: '1 vCPU · 2 GB RAM · 25 GB disk', cost: '~$30/mo', provider: 'digitalocean' },
            { value: 'db-s-2vcpu-4gb', label: '2 vCPU / 4 GB', description: '2 vCPU · 4 GB RAM · 38 GB disk', cost: '~$60/mo', provider: 'digitalocean' },
            { value: 'db-s-4vcpu-8gb', label: '4 vCPU / 8 GB', description: '4 vCPU · 8 GB RAM · 115 GB disk', cost: '~$120/mo', provider: 'digitalocean' },
          ] },
          { name: 'storage', label: 'Storage', type: 'select', required: false, tier: 'essential', description: 'Disk space for your data', default: '20', tooltip: 'AWS RDS: 20 GB – 64 TB (gp3/io1). GCP Cloud SQL: 10 GB – 64 TB. Azure: 32 GB – 32 TB. Storage can be increased later without downtime on most providers.', optionDetails: [
            { value: '20', label: '20 GB', description: 'Development and small apps' },
            { value: '50', label: '50 GB', description: 'Small production workload' },
            { value: '100', label: '100 GB', description: 'Medium production workload' },
            { value: '250', label: '250 GB', description: 'Growing production workload' },
            { value: '500', label: '500 GB', description: 'Large datasets' },
            { value: '1000', label: '1 TB', description: 'Very large datasets' },
            { value: '2000', label: '2 TB', description: 'Enterprise workload' },
            { value: '5000', label: '5 TB', description: 'Large enterprise workload' },
            { value: '10000', label: '10 TB', description: 'Data-intensive workload' },
            { value: 'custom', label: 'Custom', description: 'Enter a specific storage size' },
          ], customInput: { type: 'number', unit: 'GB', min: 10, max: 65536, step: 10, placeholder: 'e.g. 750' } },
          { name: 'version', label: 'Version', type: 'select', required: false, tier: 'essential', description: 'MySQL engine version', default: '8.4', tooltip: 'MySQL 8.4 is the current LTS release. MySQL 8.0 remains widely supported. MySQL 5.7 reached end of life Oct 2023 — no security patches.', optionDetails: [
            { value: '8.4', label: 'MySQL 8.4 LTS', description: 'Latest LTS — recommended for new projects' },
            { value: '8.0', label: 'MySQL 8.0', description: 'Previous LTS — widely deployed' },
            { value: '5.7', label: 'MySQL 5.7', description: 'End of life Oct 2023 — upgrade recommended', tooltip: 'No longer receiving security updates. Migrate to 8.x as soon as possible.' },
          ] },
          { name: 'production', label: 'Production-ready?', type: 'boolean', required: false, tier: 'detailed', description: 'Enables automatic backups, multi-AZ high availability, and encryption at rest', default: false, tooltip: 'Roughly doubles the cost but protects against outages with automatic failover.' },
          { name: 'backup_retention', label: 'Backup retention', type: 'select', required: false, tier: 'detailed', description: 'How many days to keep automated backups', default: '7', tooltip: 'AWS RDS: 0–35 days. GCP Cloud SQL: 1–365 days. Azure: 7–35 days.', optionDetails: [
            // AWS RDS: 0–35 days
            { value: '1', label: '1 day', description: 'Minimum — dev only', provider: 'aws' },
            { value: '7', label: '7 days', description: 'Standard (recommended)', provider: 'aws' },
            { value: '14', label: '14 days', description: 'Extended retention', provider: 'aws' },
            { value: '30', label: '30 days', description: 'Monthly compliance window', provider: 'aws' },
            { value: '35', label: '35 days', description: 'Maximum', provider: 'aws' },
            { value: 'custom', label: 'Custom', description: 'Enter retention (0–35 days)', provider: 'aws' },
            // GCP Cloud SQL: 1–365 days
            { value: '1', label: '1 day', description: 'Minimum — dev only', provider: 'gcp' },
            { value: '7', label: '7 days', description: 'Standard (recommended)', provider: 'gcp' },
            { value: '14', label: '14 days', description: 'Extended retention', provider: 'gcp' },
            { value: '30', label: '30 days', description: 'Monthly compliance window', provider: 'gcp' },
            { value: '90', label: '90 days', description: 'Quarterly compliance', provider: 'gcp' },
            { value: '365', label: '365 days', description: 'Maximum', provider: 'gcp' },
            { value: 'custom', label: 'Custom', description: 'Enter retention (1–365 days)', provider: 'gcp' },
            // Azure: 7–35 days
            { value: '7', label: '7 days', description: 'Minimum (recommended)', provider: 'azure' },
            { value: '14', label: '14 days', description: 'Extended retention', provider: 'azure' },
            { value: '30', label: '30 days', description: 'Monthly compliance window', provider: 'azure' },
            { value: '35', label: '35 days', description: 'Maximum', provider: 'azure' },
            { value: 'custom', label: 'Custom', description: 'Enter retention (7–35 days)', provider: 'azure' },
            // DigitalOcean: automatic backups (7 days included)
            { value: '7', label: '7 days', description: 'Included with backups', provider: 'digitalocean' },
          ], customInput: { type: 'number', unit: 'days', min: 1, max: 365, step: 1, placeholder: 'e.g. 21' } },
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
          { name: 'size', label: 'Instance type', type: 'select', required: true, tier: 'essential', description: 'Database server size — determines CPU, memory, and performance', default: 'db.t3.medium', tooltip: 'AWS DocumentDB: r6g instances recommended for production. Azure Cosmos DB: measured in Request Units/s — 1 RU ≈ one 1 KB document read. DigitalOcean: fixed-size nodes.', optionDetails: [
            { value: 'db.t3.medium', label: 'db.t3.medium', description: '2 vCPU · 4 GB RAM', cost: '~$58/mo', provider: 'aws' },
            { value: 'db.r6g.large', label: 'db.r6g.large', description: '2 vCPU · 16 GB RAM', cost: '~$175/mo', provider: 'aws' },
            { value: 'db.r6g.xlarge', label: 'db.r6g.xlarge', description: '4 vCPU · 32 GB RAM', cost: '~$350/mo', provider: 'aws' },
            { value: 'db.r6g.2xlarge', label: 'db.r6g.2xlarge', description: '8 vCPU · 64 GB RAM', cost: '~$700/mo', provider: 'aws' },
            { value: 'db.r6g.4xlarge', label: 'db.r6g.4xlarge', description: '16 vCPU · 128 GB RAM', cost: '~$1,400/mo', provider: 'aws' },
            { value: 'cosmos-serverless', label: 'Serverless', description: 'MongoDB API · pay-per-request', cost: '~$0.25/M RUs', provider: 'azure', tooltip: 'Best for intermittent or unpredictable traffic — scales to zero' },
            { value: 'cosmos-400', label: '400 RU/s', description: 'MongoDB API · light workloads', cost: '~$24/mo', provider: 'azure' },
            { value: 'cosmos-1000', label: '1,000 RU/s', description: 'MongoDB API · standard', cost: '~$58/mo', provider: 'azure' },
            { value: 'cosmos-4000', label: '4,000 RU/s', description: 'MongoDB API · heavy workloads', cost: '~$233/mo', provider: 'azure' },
            { value: 'cosmos-autoscale', label: 'Autoscale (4,000 max)', description: 'MongoDB API · auto-scaling 400–4,000 RU/s', cost: '~$175/mo max', provider: 'azure' },
            { value: 'cosmos-autoscale-10k', label: 'Autoscale (10,000 max)', description: 'MongoDB API · auto-scaling 1,000–10,000 RU/s', cost: '~$438/mo max', provider: 'azure' },
            { value: 'db-s-1vcpu-1gb', label: '1 vCPU / 1 GB', description: '1 vCPU · 1 GB RAM · 10 GB disk', cost: '~$15/mo', provider: 'digitalocean' },
            { value: 'db-s-1vcpu-2gb', label: '1 vCPU / 2 GB', description: '1 vCPU · 2 GB RAM · 20 GB disk', cost: '~$30/mo', provider: 'digitalocean' },
            { value: 'db-s-2vcpu-4gb', label: '2 vCPU / 4 GB', description: '2 vCPU · 4 GB RAM · 38 GB disk', cost: '~$60/mo', provider: 'digitalocean' },
            { value: 'db-s-4vcpu-8gb', label: '4 vCPU / 8 GB', description: '4 vCPU · 8 GB RAM · 115 GB disk', cost: '~$120/mo', provider: 'digitalocean' },
          ] },
          { name: 'storage', label: 'Storage', type: 'select', required: false, tier: 'essential', description: 'Disk space for your data', default: '20', tooltip: 'AWS DocumentDB: storage auto-scales in 10 GB increments up to 128 TB. Azure Cosmos DB: storage is included with throughput. DigitalOcean: included with instance size.', optionDetails: [
            { value: '20', label: '20 GB', description: 'Development and small apps' },
            { value: '50', label: '50 GB', description: 'Small production workload' },
            { value: '100', label: '100 GB', description: 'Medium production workload' },
            { value: '250', label: '250 GB', description: 'Growing production workload' },
            { value: '500', label: '500 GB', description: 'Large datasets' },
            { value: '1000', label: '1 TB', description: 'Very large datasets' },
            { value: 'custom', label: 'Custom', description: 'Enter a specific storage size' },
          ], customInput: { type: 'number', unit: 'GB', min: 10, max: 131072, step: 10, placeholder: 'e.g. 300' } },
          { name: 'version', label: 'Version', type: 'select', required: false, tier: 'essential', description: 'MongoDB compatibility version', default: '7.0', tooltip: 'AWS DocumentDB supports MongoDB 4.0, 5.0, and 7.0 compatible APIs. Azure Cosmos DB supports MongoDB 4.2, 5.0, 6.0, 7.0 APIs.', optionDetails: [
            { value: '8.0', label: 'MongoDB 8.0', description: 'Latest — newest features', tooltip: 'Not yet supported on all managed providers — check availability' },
            { value: '7.0', label: 'MongoDB 7.0', description: 'Stable — best performance (recommended)' },
            { value: '6.0', label: 'MongoDB 6.0', description: 'Previous stable — widely supported' },
            { value: '5.0', label: 'MongoDB 5.0', description: 'Mature — long-term support' },
          ] },
          { name: 'production', label: 'Production-ready?', type: 'boolean', required: false, tier: 'detailed', description: 'Turns on automatic backups, high availability, and encryption', default: false, tooltip: 'AWS DocumentDB: multi-AZ with read replicas. Azure Cosmos DB: multi-region writes. DigitalOcean: standby node with automatic failover.' },
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
          { name: 'size', label: 'Node type', type: 'select', required: true, tier: 'essential', description: 'Cache node size — determines memory and performance', default: 'cache.t3.micro', tooltip: 'AWS ElastiCache: burstable (t3) for dev, memory-optimized (r6g) for production. GCP Memorystore: basic (M1-M5) with no HA, or standard with replica. Azure Cache: shared (C0) for dev, dedicated (C1+) for production.', optionDetails: [
            { value: 'cache.t3.micro', label: 'cache.t3.micro', description: '0.5 GB RAM', cost: '~$12/mo', provider: 'aws', tooltip: 'Burstable — good for dev/test with intermittent usage' },
            { value: 'cache.t3.small', label: 'cache.t3.small', description: '1.4 GB RAM', cost: '~$24/mo', provider: 'aws' },
            { value: 'cache.t3.medium', label: 'cache.t3.medium', description: '3.09 GB RAM', cost: '~$48/mo', provider: 'aws' },
            { value: 'cache.r6g.large', label: 'cache.r6g.large', description: '13.07 GB RAM', cost: '~$135/mo', provider: 'aws', tooltip: 'Memory-optimized — recommended for production caching' },
            { value: 'cache.r6g.xlarge', label: 'cache.r6g.xlarge', description: '26.32 GB RAM', cost: '~$270/mo', provider: 'aws' },
            { value: 'cache.r6g.2xlarge', label: 'cache.r6g.2xlarge', description: '52.82 GB RAM', cost: '~$540/mo', provider: 'aws' },
            { value: 'M1', label: 'M1 (1 GB)', description: '1 GB RAM · Basic tier', cost: '~$35/mo', provider: 'gcp' },
            { value: 'M2', label: 'M2 (4 GB)', description: '4 GB RAM · Basic tier', cost: '~$110/mo', provider: 'gcp' },
            { value: 'M3', label: 'M3 (10 GB)', description: '10 GB RAM · Basic tier', cost: '~$280/mo', provider: 'gcp' },
            { value: 'M4', label: 'M4 (35 GB)', description: '35 GB RAM · Basic tier', cost: '~$950/mo', provider: 'gcp' },
            { value: 'C0', label: 'C0', description: '250 MB · Shared', cost: '~$16/mo', provider: 'azure', tooltip: 'Shared infrastructure — not recommended for production' },
            { value: 'C1', label: 'C1', description: '1 GB · Dedicated', cost: '~$41/mo', provider: 'azure' },
            { value: 'C2', label: 'C2', description: '2.5 GB · Dedicated', cost: '~$68/mo', provider: 'azure' },
            { value: 'C3', label: 'C3', description: '6 GB · Dedicated', cost: '~$135/mo', provider: 'azure' },
            { value: 'P1', label: 'P1 (Premium)', description: '6 GB · Clustering + persistence', cost: '~$218/mo', provider: 'azure', tooltip: 'Premium tier enables clustering, geo-replication, and data persistence' },
            { value: 'db-s-1vcpu-1gb', label: '1 vCPU / 1 GB', description: '1 vCPU · 1 GB RAM', cost: '~$15/mo', provider: 'digitalocean' },
            { value: 'db-s-1vcpu-2gb', label: '1 vCPU / 2 GB', description: '1 vCPU · 2 GB RAM', cost: '~$30/mo', provider: 'digitalocean' },
            { value: 'db-s-2vcpu-4gb', label: '2 vCPU / 4 GB', description: '2 vCPU · 4 GB RAM', cost: '~$60/mo', provider: 'digitalocean' },
          ] },
          { name: 'max_memory_policy', label: 'When memory is full?', type: 'select', required: false, tier: 'detailed', description: 'What Redis does when it runs out of memory', default: 'allkeys-lru', tooltip: 'Controls eviction behavior. LRU (Least Recently Used) is best for caching. noeviction returns errors when full — use for persistent data.', optionDetails: [
            { value: 'allkeys-lru', label: 'Evict least recently used', description: 'Best for caching (default)' },
            { value: 'volatile-lru', label: 'Evict LRU with TTL only', description: 'Only evict keys with an expiration set' },
            { value: 'allkeys-random', label: 'Evict random keys', description: 'Random eviction — simple but unpredictable' },
            { value: 'noeviction', label: 'Return errors when full', description: 'Never evict — use for persistent data' },
          ] },
          { name: 'keep_data_safe', label: 'Keep data safe if server restarts?', type: 'boolean', required: false, tier: 'detailed', description: 'Saves cached data to disk so it survives restarts (slightly slower)', default: false, tooltip: 'AWS: append-only file (AOF) or RDB snapshots. GCP: Standard tier includes replica. Azure: Premium tier only. Adds latency to writes.' },
          { name: 'version', label: 'Version', type: 'select', required: false, tier: 'detailed', description: 'Redis engine version', default: '7.x', tooltip: 'Redis 7.x adds Redis Functions, ACLv2, and sharded pub/sub. Redis 6.x is in maintenance mode.', optionDetails: [
            { value: '7.x', label: 'Redis 7.x', description: 'Latest — best performance (recommended)' },
            { value: '6.x', label: 'Redis 6.x', description: 'Previous stable — maintenance mode' },
          ] },
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
          { name: 'capacity_mode', label: 'Capacity mode', type: 'select', required: false, tier: 'essential', description: 'How DynamoDB scales and bills for read/write throughput', default: 'on-demand', tooltip: 'On-demand: no capacity planning, pay per request, auto-scales instantly. Provisioned: you specify read/write capacity units — up to 77% cheaper for predictable workloads. You can switch modes once every 24 hours.', optionDetails: [
            { value: 'on-demand', label: 'On-demand', description: 'Pay per request · auto-scales instantly', cost: '~$1.25/M writes', provider: 'aws', tooltip: 'Best for unpredictable traffic. No capacity planning needed.' },
            { value: 'provisioned', label: 'Provisioned', description: 'Reserved capacity · lower cost for steady traffic', cost: 'from $0.00065/WCU/hr', provider: 'aws', tooltip: 'Set read/write capacity units. Enable auto-scaling for variable loads at lower cost.' },
            { value: 'provisioned-autoscale', label: 'Provisioned + Auto-scaling', description: 'Reserved baseline · auto-scales within limits', cost: 'from $0.00065/WCU/hr', provider: 'aws', tooltip: 'Combines cost savings of provisioned with flexibility. Set min/max capacity and target utilization.' },
          ] },
          { name: 'table_class', label: 'Table class', type: 'select', required: false, tier: 'essential', description: 'Table storage class — affects storage cost vs read/write cost', default: 'standard', tooltip: 'Standard: lower read/write cost, higher storage cost. Standard-IA: 60% lower storage cost, higher read/write cost — best when storage dominates.', optionDetails: [
            { value: 'standard', label: 'Standard', description: 'Default — lower read/write cost', cost: '~$0.25/GB/mo storage', provider: 'aws' },
            { value: 'standard-ia', label: 'Standard-IA', description: 'Infrequent access — 60% lower storage cost', cost: '~$0.10/GB/mo storage', provider: 'aws', tooltip: 'Best for tables where storage cost exceeds 50% of total cost. Higher per-request prices.' },
          ] },
          { name: 'lookup_field', label: 'Main lookup field', type: 'string', required: false, tier: 'detailed', description: 'The main field you will use to look up records (partition key)', placeholder: 'e.g. userId', tooltip: 'This becomes the DynamoDB partition key. Choose a field with high cardinality (many unique values) for best performance.' },
          { name: 'sort_field', label: 'Sort field', type: 'string', required: false, tier: 'detailed', description: 'Optional second key for range queries within a partition', placeholder: 'e.g. timestamp', tooltip: 'The sort key enables range queries like "all orders for user X between dates". Leave empty for simple key-value lookups.' },
          { name: 'enable_streams', label: 'Enable change streams?', type: 'boolean', required: false, tier: 'detailed', description: 'Capture a time-ordered sequence of item-level changes', default: false, tooltip: 'DynamoDB Streams captures inserts, updates, and deletes. Use to trigger Lambda functions, replicate data, or build event-driven architectures.' },
          { name: 'encryption', label: 'Encryption', type: 'select', required: false, tier: 'detailed', description: 'How data is encrypted at rest', default: 'aws-owned', tooltip: 'All DynamoDB data is encrypted at rest. Choose who manages the encryption key.', optionDetails: [
            { value: 'aws-owned', label: 'AWS owned key', description: 'Default — no extra cost', cost: 'Free', provider: 'aws' },
            { value: 'aws-managed', label: 'AWS managed key (KMS)', description: 'AWS manages the key in KMS', cost: '~$1/mo per key', provider: 'aws' },
            { value: 'customer-managed', label: 'Customer managed key', description: 'You manage the key in KMS', cost: '~$1/mo + API calls', provider: 'aws', tooltip: 'Full control over key rotation, deletion, and access policies' },
          ] },
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
          { name: 'size', label: 'Pricing plan', type: 'select', required: true, tier: 'essential', description: 'Firebase pricing plan — determines quotas and billing', default: 'spark', optionDetails: [
            { value: 'spark', label: 'Spark (Free)', description: '1 GB storage · 50K reads/day · 20K writes/day', cost: 'Free', provider: 'gcp' },
            { value: 'blaze', label: 'Blaze (Pay-as-you-go)', description: 'Unlimited · pay per operation', cost: '~$0.06/100K reads', provider: 'gcp' },
          ] },
          { name: 'mode', label: 'Database mode', type: 'select', required: false, tier: 'essential', description: 'Firestore operating mode', default: 'native', optionDetails: [
            { value: 'native', label: 'Native mode', description: 'Real-time sync, offline support, mobile SDKs', provider: 'gcp' },
            { value: 'datastore', label: 'Datastore mode', description: 'Server-side only, higher throughput', provider: 'gcp' },
          ] },
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
          { name: 'size', label: 'Throughput', type: 'select', required: true, tier: 'essential', description: 'Request Units per second — determines read/write capacity', default: 'serverless', tooltip: '1 RU = one 1 KB point read. A typical 4 KB document read costs ~4 RUs. Writes cost ~5x more than reads. Serverless is best for intermittent workloads. Provisioned autoscale is best for variable but continuous traffic.', optionDetails: [
            { value: 'serverless', label: 'Serverless', description: 'Pay per request · scales to zero', cost: '~$0.25/M RUs', provider: 'azure', tooltip: 'Max 5,000 RU/s burst. Best for dev/test and intermittent workloads. Cannot enable geo-replication.' },
            { value: '400', label: '400 RU/s', description: 'Provisioned minimum · light workloads', cost: '~$24/mo', provider: 'azure' },
            { value: '1000', label: '1,000 RU/s', description: 'Standard workloads', cost: '~$58/mo', provider: 'azure' },
            { value: '4000', label: '4,000 RU/s', description: 'Heavy workloads', cost: '~$233/mo', provider: 'azure' },
            { value: '10000', label: '10,000 RU/s', description: 'Very heavy workloads', cost: '~$583/mo', provider: 'azure' },
            { value: 'autoscale-4000', label: 'Autoscale (4,000 max)', description: 'Auto-scales 400–4,000 RU/s', cost: '~$175/mo max', provider: 'azure', tooltip: 'Scales between 10% and 100% of max. You pay for the highest RU/s reached each hour.' },
            { value: 'autoscale-10000', label: 'Autoscale (10,000 max)', description: 'Auto-scales 1,000–10,000 RU/s', cost: '~$438/mo max', provider: 'azure' },
            { value: 'autoscale-40000', label: 'Autoscale (40,000 max)', description: 'Auto-scales 4,000–40,000 RU/s', cost: '~$1,750/mo max', provider: 'azure' },
            { value: 'custom', label: 'Custom RU/s', description: 'Enter specific throughput', provider: 'azure' },
          ], customInput: { type: 'number', unit: 'RU/s', min: 400, max: 1000000, step: 100, placeholder: 'e.g. 2500' } },
          { name: 'global', label: 'Available worldwide?', type: 'boolean', required: false, tier: 'detailed', description: 'Copies your data to regions around the world for fast access everywhere', default: false, tooltip: 'Each additional region roughly doubles the throughput cost. Not available with Serverless mode. Enables multi-region writes for highest availability.' },
          { name: 'data_safety', label: 'How important is data accuracy?', type: 'select', required: false, tier: 'detailed', description: 'Trade off between speed and data accuracy across regions', default: 'session', tooltip: 'Consistency levels in order from fastest to most accurate: Eventual → Consistent Prefix → Session → Bounded Staleness → Strong. Stronger consistency uses more RUs per operation.', optionDetails: [
            { value: 'eventual', label: 'Eventual', description: 'Maximum speed — data may be briefly stale', provider: 'azure', tooltip: 'Lowest latency and cost. Reads may return out-of-order. Use for counters, likes, non-critical data.' },
            { value: 'session', label: 'Session', description: 'Balanced — consistent within a session (recommended)', provider: 'azure', tooltip: 'Default. A user always sees their own writes. Other users see eventual consistency. Best for most applications.' },
            { value: 'strong', label: 'Strong', description: 'Maximum accuracy — slightly slower', provider: 'azure', tooltip: 'Linearizable reads. Highest RU cost (2x reads). Only available in single-region or with specific multi-region config.' },
            { value: 'bounded-staleness', label: 'Bounded staleness', description: 'Reads lag behind writes by a set window', provider: 'azure', tooltip: 'Configurable staleness window (e.g., 5 seconds or 100 operations behind). Good compromise for multi-region.' },
            { value: 'consistent-prefix', label: 'Consistent prefix', description: 'Reads never see out-of-order writes', provider: 'azure', tooltip: 'Guarantees ordering but may be stale. Lower cost than bounded staleness.' },
          ] },
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
          { name: 'size', label: 'Capacity mode', type: 'select', required: true, tier: 'essential', description: 'Billing and throughput model', default: 'on-demand', tooltip: 'On-demand: best for unpredictable traffic, pay per Capacity Unit consumed. Reserved: pre-purchase CUs for steady workloads at lower per-unit cost. 1 read CU = one 4 KB read, 1 write CU = one 4 KB write.', optionDetails: [
            { value: 'on-demand', label: 'On-demand (CU)', description: 'Pay per Capacity Unit · auto-scales', cost: '~$0.007/10K CU', provider: 'alibaba', tooltip: 'Best for variable or unpredictable traffic. No upfront commitment.' },
            { value: 'reserved-50', label: 'Reserved 50 CU', description: '50 read/write CU · predictable cost', cost: '~$45/mo', provider: 'alibaba' },
            { value: 'reserved-100', label: 'Reserved 100 CU', description: '100 read/write CU · steady traffic', cost: '~$85/mo', provider: 'alibaba' },
            { value: 'reserved-200', label: 'Reserved 200 CU', description: '200 read/write CU · moderate workloads', cost: '~$160/mo', provider: 'alibaba' },
            { value: 'reserved-500', label: 'Reserved 500 CU', description: '500 read/write CU · heavy workloads', cost: '~$380/mo', provider: 'alibaba' },
            { value: 'reserved-1000', label: 'Reserved 1,000 CU', description: '1,000 read/write CU · high throughput', cost: '~$720/mo', provider: 'alibaba' },
            { value: 'custom', label: 'Custom CU', description: 'Enter specific capacity units' },
          ], customInput: { type: 'number', unit: 'CU', min: 1, max: 100000, step: 10, placeholder: 'e.g. 300' } },
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
          { name: 'purpose', label: 'Workload type', type: 'select', required: false, tier: 'essential', description: 'Workload type — determines optimization and features', default: 'atp', optionDetails: [
            { value: 'atp', label: 'Transaction Processing', description: 'OLTP — orders, accounts, real-time apps', provider: 'oci' },
            { value: 'adw', label: 'Data Warehouse', description: 'OLAP — analytics, reporting, BI', provider: 'oci' },
            { value: 'ajd', label: 'JSON Database', description: 'Document store — MongoDB-compatible', provider: 'oci' },
            { value: 'apex', label: 'APEX Service', description: 'Low-code Oracle APEX apps', provider: 'oci' },
          ] },
          { name: 'size', label: 'Compute', type: 'select', required: true, tier: 'essential', description: 'OCPU count and storage — determines query speed and capacity', default: '1-ocpu', optionDetails: [
            { value: 'always-free', label: 'Always Free', description: '1 OCPU · 20 GB storage', cost: 'Free forever', provider: 'oci' },
            { value: '1-ocpu', label: '1 OCPU', description: '1 OCPU · 1 TB storage', cost: '~$175/mo', provider: 'oci' },
            { value: '2-ocpu', label: '2 OCPU', description: '2 OCPU · 1 TB storage', cost: '~$350/mo', provider: 'oci' },
            { value: '4-ocpu', label: '4 OCPU', description: '4 OCPU · 2 TB storage', cost: '~$700/mo', provider: 'oci' },
            { value: '8-ocpu', label: '8 OCPU', description: '8 OCPU · 4 TB storage', cost: '~$1,400/mo', provider: 'oci' },
            { value: '16-ocpu', label: '16 OCPU', description: '16 OCPU · 8 TB storage', cost: '~$2,800/mo', provider: 'oci' },
          ] },
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
          { name: 'engine', label: 'What type of database?', type: 'select', required: true, tier: 'essential', description: 'Choose the database engine', default: 'pg', optionDetails: [
            { value: 'pg', label: 'PostgreSQL', description: 'Relational — most popular', provider: 'digitalocean' },
            { value: 'mysql', label: 'MySQL', description: 'Relational — widely used', provider: 'digitalocean' },
            { value: 'redis', label: 'Redis', description: 'In-memory cache & key-value', provider: 'digitalocean' },
            { value: 'mongodb', label: 'MongoDB', description: 'NoSQL document store', provider: 'digitalocean' },
            { value: 'kafka', label: 'Kafka', description: 'Event streaming', provider: 'digitalocean' },
          ] },
          { name: 'size', label: 'Instance size', type: 'select', required: true, tier: 'essential', description: 'Database node size', default: 'db-s-1vcpu-1gb', optionDetails: [
            { value: 'db-s-1vcpu-1gb', label: '1 vCPU / 1 GB', description: '1 vCPU · 1 GB RAM · 10 GB disk', cost: '~$15/mo', provider: 'digitalocean' },
            { value: 'db-s-1vcpu-2gb', label: '1 vCPU / 2 GB', description: '1 vCPU · 2 GB RAM · 25 GB disk', cost: '~$30/mo', provider: 'digitalocean' },
            { value: 'db-s-2vcpu-4gb', label: '2 vCPU / 4 GB', description: '2 vCPU · 4 GB RAM · 38 GB disk', cost: '~$60/mo', provider: 'digitalocean' },
            { value: 'db-s-4vcpu-8gb', label: '4 vCPU / 8 GB', description: '4 vCPU · 8 GB RAM · 115 GB disk', cost: '~$120/mo', provider: 'digitalocean' },
            { value: 'db-s-8vcpu-16gb', label: '8 vCPU / 16 GB', description: '8 vCPU · 16 GB RAM · 270 GB disk', cost: '~$240/mo', provider: 'digitalocean' },
          ] },
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
          { name: 'size', label: 'Cluster size', type: 'select', required: true, tier: 'essential', description: 'Cluster capacity — determines vectors stored and query speed', default: 'os-t3.small', optionDetails: [
            { value: 'os-t3.small', label: 't3.small.search', description: '2 vCPU · 2 GB · ~100K vectors', cost: '~$26/mo', provider: 'aws' },
            { value: 'os-m6g.large', label: 'm6g.large.search', description: '2 vCPU · 8 GB · ~1M vectors', cost: '~$97/mo', provider: 'aws' },
            { value: 'os-r6g.xlarge', label: 'r6g.xlarge.search', description: '4 vCPU · 32 GB · ~5M vectors', cost: '~$292/mo', provider: 'aws' },
            { value: 'gcp-basic', label: 'Basic', description: '2 vCPU · 8 GB · Vertex AI Search', cost: '~$50/mo', provider: 'gcp' },
            { value: 'gcp-standard', label: 'Standard', description: '4 vCPU · 16 GB · Vertex AI Search', cost: '~$150/mo', provider: 'gcp' },
            { value: 'azure-basic', label: 'Basic', description: '1 replica · 2 GB · ~50K vectors', cost: '~$75/mo', provider: 'azure' },
            { value: 'azure-s1', label: 'Standard S1', description: '1 replica · 25 GB · ~1M vectors', cost: '~$250/mo', provider: 'azure' },
            { value: 'azure-s2', label: 'Standard S2', description: '1 replica · 100 GB · ~5M vectors', cost: '~$1,000/mo', provider: 'azure' },
          ] },
          { name: 'engine', label: 'Vector engine', type: 'select', required: false, tier: 'essential', description: 'Which vector engine to use', default: 'pgvector', tooltip: 'pgvector requires no extra infra if you already have PostgreSQL. Pinecone is fully managed SaaS. Others are self-hosted open-source options with different performance characteristics.', optionDetails: [
            { value: 'pinecone', label: 'Pinecone', description: 'Managed SaaS — easiest to start', tooltip: 'Fully managed, no infrastructure to run. Serverless or pod-based pricing.' },
            { value: 'weaviate', label: 'Weaviate', description: 'Open-source — AI-native with modules', tooltip: 'Built-in vectorization modules. Supports hybrid search (vector + keyword).' },
            { value: 'qdrant', label: 'Qdrant', description: 'Open-source — Rust-based, fast', tooltip: 'High performance written in Rust. Good for large-scale similarity search.' },
            { value: 'pgvector', label: 'pgvector', description: 'PostgreSQL extension — no extra infra', tooltip: 'Add vector search to existing PostgreSQL. Simplest option if you already use Postgres.' },
            { value: 'chromadb', label: 'ChromaDB', description: 'Open-source — Python-first, simple', tooltip: 'Easy to get started. Best for prototyping and small-scale applications.' },
            { value: 'milvus', label: 'Milvus', description: 'Open-source — large-scale production', tooltip: 'Designed for billion-scale vector data. GPU-accelerated search available.' },
          ] },
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
          { name: 'size', label: 'Compute size', type: 'select', required: true, tier: 'essential', description: 'Cluster/compute capacity for queries', default: 'dc2.large', optionDetails: [
            { value: 'dc2.large', label: 'dc2.large (2-node)', description: '2 vCPU · 15 GB RAM · 160 GB SSD each', cost: '~$360/mo', provider: 'aws' },
            { value: 'dc2.large-4', label: 'dc2.large (4-node)', description: '4 nodes · 640 GB total', cost: '~$720/mo', provider: 'aws' },
            { value: 'ra3.xlplus', label: 'ra3.xlplus (2-node)', description: '4 vCPU · 32 GB · managed storage', cost: '~$1,560/mo', provider: 'aws' },
            { value: 'bq-on-demand', label: 'On-demand', description: 'Pay per query · $6.25/TB scanned', cost: '~$6.25/TB', provider: 'gcp' },
            { value: 'bq-flat-100', label: 'Flat-rate 100 slots', description: '100 compute slots · dedicated', cost: '~$2,000/mo', provider: 'gcp' },
            { value: 'bq-editions', label: 'Standard edition', description: 'Auto-scaling slots', cost: '~$0.04/slot-hr', provider: 'gcp' },
            { value: 'synapse-dw100', label: 'DW100c', description: '1 compute node · 60 TB storage', cost: '~$1.20/hr', provider: 'azure' },
            { value: 'synapse-dw200', label: 'DW200c', description: '2 compute nodes · 60 TB storage', cost: '~$2.40/hr', provider: 'azure' },
            { value: 'synapse-serverless', label: 'Serverless', description: 'Pay per TB processed', cost: '~$5/TB', provider: 'azure' },
          ] },
          { name: 'engine', label: 'Analytics engine', type: 'select', required: false, tier: 'essential', description: 'Which analytics engine to use', default: 'native', optionDetails: [
            { value: 'native', label: 'Provider native', description: 'Redshift / BigQuery / Synapse based on cloud' },
            { value: 'snowflake', label: 'Snowflake', description: 'Cross-cloud, auto-scaling warehouse' },
            { value: 'clickhouse', label: 'ClickHouse', description: 'Open-source columnar OLAP, self-hosted' },
            { value: 'databricks', label: 'Databricks', description: 'Unified analytics + ML lakehouse' },
          ] },
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
          { name: 'size', label: 'Cluster size', type: 'select', required: true, tier: 'essential', description: 'Node size — determines index capacity and query throughput', default: 'os-t3.small', optionDetails: [
            { value: 'os-t3.small', label: 't3.small.search', description: '2 vCPU · 2 GB RAM', cost: '~$26/mo', provider: 'aws' },
            { value: 'os-t3.medium', label: 't3.medium.search', description: '2 vCPU · 4 GB RAM', cost: '~$52/mo', provider: 'aws' },
            { value: 'os-m6g.large', label: 'm6g.large.search', description: '2 vCPU · 8 GB RAM', cost: '~$97/mo', provider: 'aws' },
            { value: 'os-r6g.xlarge', label: 'r6g.xlarge.search', description: '4 vCPU · 32 GB RAM', cost: '~$292/mo', provider: 'aws' },
            { value: 'gcp-basic', label: 'Basic', description: 'Up to 10K documents', cost: 'Free tier', provider: 'gcp' },
            { value: 'gcp-enterprise', label: 'Enterprise', description: 'Unlimited docs · advanced features', cost: '~$3/1K queries', provider: 'gcp' },
            { value: 'azure-free', label: 'Free', description: '50 MB storage · 3 indexes', cost: 'Free', provider: 'azure' },
            { value: 'azure-basic', label: 'Basic', description: '2 GB storage · 15 indexes', cost: '~$75/mo', provider: 'azure' },
            { value: 'azure-s1', label: 'Standard S1', description: '25 GB storage · 50 indexes', cost: '~$250/mo', provider: 'azure' },
          ] },
          { name: 'engine', label: 'Search engine', type: 'select', required: false, tier: 'essential', description: 'Which search engine to use', default: 'opensearch', optionDetails: [
            { value: 'opensearch', label: 'OpenSearch', description: 'AWS-managed — fork of Elasticsearch' },
            { value: 'elasticsearch', label: 'Elasticsearch', description: 'Original full-text engine — Elastic Cloud' },
            { value: 'algolia', label: 'Algolia', description: 'SaaS — instant search, easy setup' },
            { value: 'typesense', label: 'Typesense', description: 'Open-source — typo-tolerant, fast' },
            { value: 'meilisearch', label: 'Meilisearch', description: 'Open-source — developer-friendly' },
          ] },
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
          { name: 'public', label: 'Publicly accessible?', type: 'boolean', required: false, tier: 'essential', description: 'Allow anyone on the internet to view these files', default: false },
          { name: 'storage_class', label: 'Storage class', type: 'select', required: true, tier: 'essential', description: 'Access frequency — affects cost and retrieval speed', default: 'standard', optionDetails: [
            { value: 'standard', label: 'Standard', description: 'Frequently accessed data', cost: '~$0.023/GB/mo', provider: 'aws' },
            { value: 'standard-ia', label: 'Infrequent Access', description: 'Accessed < 1x/month · lower storage cost', cost: '~$0.0125/GB/mo', provider: 'aws' },
            { value: 'glacier', label: 'Glacier', description: 'Archive · minutes-to-hours retrieval', cost: '~$0.004/GB/mo', provider: 'aws' },
            { value: 'glacier-deep', label: 'Glacier Deep Archive', description: 'Long-term archive · 12-hour retrieval', cost: '~$0.00099/GB/mo', provider: 'aws' },
            { value: 'gcp-standard', label: 'Standard', description: 'Frequently accessed data', cost: '~$0.020/GB/mo', provider: 'gcp' },
            { value: 'gcp-nearline', label: 'Nearline', description: 'Accessed < 1x/month', cost: '~$0.010/GB/mo', provider: 'gcp' },
            { value: 'gcp-coldline', label: 'Coldline', description: 'Accessed < 1x/quarter', cost: '~$0.004/GB/mo', provider: 'gcp' },
            { value: 'gcp-archive', label: 'Archive', description: 'Accessed < 1x/year', cost: '~$0.0012/GB/mo', provider: 'gcp' },
            { value: 'azure-hot', label: 'Hot', description: 'Frequently accessed data', cost: '~$0.018/GB/mo', provider: 'azure' },
            { value: 'azure-cool', label: 'Cool', description: 'Infrequently accessed · 30-day min', cost: '~$0.010/GB/mo', provider: 'azure' },
            { value: 'azure-archive', label: 'Archive', description: 'Rarely accessed · hours to retrieve', cost: '~$0.002/GB/mo', provider: 'azure' },
          ] },
          { name: 'versioning', label: 'Keep old versions of files?', type: 'boolean', required: false, tier: 'detailed', description: 'Keep old versions of files — enables recovery from accidental deletes', default: false },
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
          { name: 'storage_class', label: 'Storage class', type: 'select', required: true, tier: 'essential', description: 'Access frequency — affects cost and retrieval speed', default: 'oss-standard', optionDetails: [
            { value: 'oss-standard', label: 'Standard', description: 'Frequently accessed data', cost: '~$0.02/GB/mo', provider: 'alibaba' },
            { value: 'oss-ia', label: 'Infrequent Access', description: 'Accessed < 1x/month · 30-day min', cost: '~$0.008/GB/mo', provider: 'alibaba' },
            { value: 'oss-archive', label: 'Archive', description: 'Rarely accessed · 1-minute restore', cost: '~$0.005/GB/mo', provider: 'alibaba' },
            { value: 'oss-cold-archive', label: 'Cold Archive', description: 'Long-term archive · hours to restore', cost: '~$0.002/GB/mo', provider: 'alibaba' },
          ] },
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
          { name: 'storage_class', label: 'Storage tier', type: 'select', required: true, tier: 'essential', description: 'Access frequency — affects cost and retrieval speed', default: 'oci-standard', optionDetails: [
            { value: 'oci-standard', label: 'Standard', description: 'Frequently accessed · hot data', cost: '~$0.0255/GB/mo', provider: 'oci' },
            { value: 'oci-infrequent', label: 'Infrequent Access', description: 'Accessed < 1x/month', cost: '~$0.01/GB/mo', provider: 'oci' },
            { value: 'oci-archive', label: 'Archive', description: 'Rarely accessed · 1-hour restore', cost: '~$0.004/GB/mo', provider: 'oci' },
          ] },
          { name: 'public', label: 'Publicly accessible?', type: 'boolean', required: false, tier: 'essential', description: 'Allow anyone on the internet to view these files', default: false },
          { name: 'auto_tiering', label: 'Auto-tiering?', type: 'boolean', required: false, tier: 'detailed', description: 'Automatically move objects to cheaper tiers based on access patterns', default: false },
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
          { name: 'location', label: 'Region', type: 'select', required: false, tier: 'essential', description: 'Pick the region closest to your users', default: 'nyc3', optionDetails: [
            { value: 'nyc3', label: 'New York (NYC3)', description: 'US East', provider: 'digitalocean' },
            { value: 'sfo3', label: 'San Francisco (SFO3)', description: 'US West', provider: 'digitalocean' },
            { value: 'ams3', label: 'Amsterdam (AMS3)', description: 'Europe', provider: 'digitalocean' },
            { value: 'sgp1', label: 'Singapore (SGP1)', description: 'Asia Pacific', provider: 'digitalocean' },
            { value: 'fra1', label: 'Frankfurt (FRA1)', description: 'Europe', provider: 'digitalocean' },
            { value: 'syd1', label: 'Sydney (SYD1)', description: 'Australia', provider: 'digitalocean' },
          ] },
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
          { name: 'size', label: 'Throughput mode', type: 'select', required: true, tier: 'essential', description: 'Performance tier — determines throughput and IOPS', default: 'efs-bursting', optionDetails: [
            { value: 'efs-bursting', label: 'EFS Bursting', description: 'Standard throughput · scales with size', cost: '~$0.30/GB/mo', provider: 'aws' },
            { value: 'efs-elastic', label: 'EFS Elastic', description: 'Auto-scaling throughput · pay per use', cost: '~$0.04/GB read', provider: 'aws' },
            { value: 'efs-provisioned', label: 'EFS Provisioned', description: 'Guaranteed throughput · predictable perf', cost: '~$6/MB/s/mo', provider: 'aws' },
            { value: 'gcp-basic-hdd', label: 'Basic HDD', description: '1 TB min · cost-effective', cost: '~$0.20/GB/mo', provider: 'gcp' },
            { value: 'gcp-basic-ssd', label: 'Basic SSD', description: '2.5 TB min · low-latency', cost: '~$0.55/GB/mo', provider: 'gcp' },
            { value: 'gcp-enterprise', label: 'Enterprise', description: 'Regional HA · high throughput', cost: '~$0.35/GB/mo', provider: 'gcp' },
            { value: 'azure-standard', label: 'Standard (GPv2)', description: 'HDD-backed · cost-effective', cost: '~$0.06/GB/mo', provider: 'azure' },
            { value: 'azure-premium', label: 'Premium', description: 'SSD-backed · low-latency', cost: '~$0.16/GB/mo', provider: 'azure' },
          ] },
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
          { name: 'size', label: 'Size', type: 'select', required: true, tier: 'essential', description: 'How many services will live in this network?', options: ['Small — a few services', 'Medium — a typical app', 'Large — many services and teams'], default: 'Small — a few services' },
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
          { name: 'type', label: 'Load balancer type', type: 'select', required: false, tier: 'essential', description: 'Type of load balancer — determines protocol support and features', default: 'alb', optionDetails: [
            { value: 'alb', label: 'Application LB (ALB)', description: 'HTTP/HTTPS · path routing · WebSocket', cost: '~$22/mo + LCU', provider: 'aws' },
            { value: 'nlb', label: 'Network LB (NLB)', description: 'TCP/UDP · ultra-low latency · static IP', cost: '~$22/mo + LCU', provider: 'aws' },
            { value: 'gcp-http', label: 'HTTP(S) LB', description: 'Global HTTP/HTTPS · URL maps', cost: '~$18/mo + data', provider: 'gcp' },
            { value: 'gcp-tcp', label: 'TCP/UDP LB', description: 'Regional · network traffic', cost: '~$18/mo + data', provider: 'gcp' },
            { value: 'azure-standard', label: 'Standard LB', description: 'TCP/UDP · zone-redundant', cost: '~$18/mo + rules', provider: 'azure' },
            { value: 'azure-app-gw', label: 'Application Gateway', description: 'HTTP/HTTPS · WAF · SSL offload', cost: '~$55/mo + data', provider: 'azure' },
            { value: 'k8s-service', label: 'K8s Service', description: 'LoadBalancer type service', provider: 'kubernetes' },
            { value: 'k8s-ingress', label: 'K8s Ingress', description: 'HTTP routing · path-based', provider: 'kubernetes' },
          ] },
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
          { name: 'tier', label: 'Price class', type: 'select', required: false, tier: 'essential', description: 'CDN edge locations — more locations = faster worldwide but costs more', default: 'cf-all', optionDetails: [
            { value: 'cf-100', label: 'Price Class 100', description: 'US, Canada, Europe only', cost: '~$0.085/GB', provider: 'aws' },
            { value: 'cf-200', label: 'Price Class 200', description: '+ Asia, Africa, Middle East', cost: '~$0.120/GB', provider: 'aws' },
            { value: 'cf-all', label: 'All Edge Locations', description: 'Global — all regions', cost: '~$0.085–0.170/GB', provider: 'aws' },
            { value: 'gcp-standard', label: 'Standard', description: 'Cloud CDN — cache at Google edge', cost: '~$0.08/GB', provider: 'gcp' },
            { value: 'gcp-premium', label: 'Premium', description: 'Cloud CDN — premium network tier', cost: '~$0.12/GB', provider: 'gcp' },
            { value: 'azure-standard', label: 'Standard Microsoft', description: 'Microsoft CDN network', cost: '~$0.081/GB', provider: 'azure' },
            { value: 'azure-premium-verizon', label: 'Premium Verizon', description: 'Advanced rules, analytics', cost: '~$0.150/GB', provider: 'azure' },
            { value: 'azure-afd', label: 'Azure Front Door', description: 'Global LB + CDN combined', cost: '~$35/mo + $0.08/GB', provider: 'azure' },
          ] },
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
          { name: 'protocol', label: 'Protocol', type: 'select', required: false, tier: 'essential', description: 'API protocol type — determines features and pricing', default: 'http', optionDetails: [
            { value: 'http', label: 'HTTP API', description: 'Simple, low-cost HTTP routing', cost: '~$1.00/M requests', provider: 'aws' },
            { value: 'rest', label: 'REST API', description: 'Full-featured · API keys, caching, WAF', cost: '~$3.50/M requests', provider: 'aws' },
            { value: 'websocket', label: 'WebSocket', description: 'Persistent bi-directional connections', cost: '~$1.00/M messages', provider: 'aws' },
            { value: 'gcp-api-gw', label: 'API Gateway', description: 'Managed API routing', cost: '~$3/M calls', provider: 'gcp' },
            { value: 'azure-consumption', label: 'Consumption', description: 'Pay-per-call · auto-scaling', cost: '~$3.50/M calls', provider: 'azure' },
            { value: 'azure-standard', label: 'Standard v2', description: 'Fixed capacity · full features', cost: '~$170/mo', provider: 'azure' },
          ] },
          { name: 'routes', label: 'Routes', type: 'list', required: false, tier: 'essential', description: 'URL paths this gateway should handle', placeholder: 'e.g. /api/users', addLabel: 'Add a route' },
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
          { name: 'queue_type', label: 'Queue type', type: 'select', required: false, tier: 'essential', description: 'Queue delivery model — affects ordering, throughput, and cost', default: 'standard', tooltip: 'AWS SQS: Standard (unlimited throughput, at-least-once) or FIFO (ordered, exactly-once, up to 70K msg/s). GCP Pub/Sub: Pull or Push delivery. Azure Service Bus: Basic (queues only), Standard (+ topics), Premium (dedicated, 100 MB messages).', optionDetails: [
            { value: 'standard', label: 'Standard', description: 'Unlimited throughput · at-least-once delivery', cost: '~$0.40/M msgs', provider: 'aws', tooltip: 'Messages may be delivered more than once and in any order. Use for workloads that can handle duplicates.' },
            { value: 'fifo', label: 'FIFO', description: 'Ordered · exactly-once · 3,000 msg/s', cost: '~$0.50/M msgs', provider: 'aws', tooltip: 'Guarantees message order and exactly-once processing. 3,000 messages/s without batching, 30,000 with batching.' },
            { value: 'fifo-high-throughput', label: 'FIFO High Throughput', description: 'Ordered · exactly-once · 70,000 msg/s', cost: '~$0.50/M msgs', provider: 'aws', tooltip: 'Same guarantees as FIFO but with higher throughput. Requires message group IDs.' },
            { value: 'pull', label: 'Pull subscription', description: 'Consumer polls for messages', provider: 'gcp', tooltip: 'Your application pulls messages when ready. Best for batch processing and when consumers need flow control.' },
            { value: 'push', label: 'Push subscription', description: 'HTTP push to endpoint', provider: 'gcp', tooltip: 'Pub/Sub pushes messages to an HTTP endpoint. Best for real-time processing with Cloud Run or Cloud Functions.' },
            { value: 'basic', label: 'Basic', description: '256 KB max · queues only', cost: '~$0.05/M ops', provider: 'azure', tooltip: 'Shared infrastructure. No topics, sessions, or dead-lettering. Best for simple queue workloads.' },
            { value: 'standard-azure', label: 'Standard', description: '256 KB max · topics + filters', cost: '~$10/mo', provider: 'azure', tooltip: 'Shared infrastructure. Adds topics, subscriptions, filters, sessions, and dead-letter queues.' },
            { value: 'premium', label: 'Premium', description: '100 MB max · dedicated resources', cost: '~$677/mo', provider: 'azure', tooltip: 'Dedicated resources with predictable performance. Up to 100 MB messages. Required for geo-disaster recovery.' },
          ] },
          { name: 'retention', label: 'Message retention', type: 'select', required: false, tier: 'detailed', description: 'How long unprocessed messages are kept before being discarded', default: '4d', tooltip: 'AWS SQS: 60 seconds – 14 days (default 4 days). GCP Pub/Sub: 10 minutes – 31 days (default 7 days). Azure Service Bus: 1 second – 14 days (Standard) or unlimited (Premium).', optionDetails: [
            // AWS SQS: 60 seconds – 14 days
            { value: '60s', label: '60 seconds', description: 'Minimum — very short-lived messages', provider: 'aws' },
            { value: '1h', label: '1 hour', description: 'Short-lived messages only', provider: 'aws' },
            { value: '4d', label: '4 days', description: 'Default — good for most workloads', provider: 'aws' },
            { value: '7d', label: '7 days', description: 'Extended retention', provider: 'aws' },
            { value: '14d', label: '14 days', description: 'Maximum', provider: 'aws' },
            { value: 'custom', label: 'Custom', description: 'Enter retention (60s – 14 days)', provider: 'aws' },
            // GCP Pub/Sub: 10 minutes – 31 days
            { value: '1h', label: '1 hour', description: 'Short-lived messages only', provider: 'gcp' },
            { value: '1d', label: '1 day', description: 'Daily processing window', provider: 'gcp' },
            { value: '7d', label: '7 days', description: 'Default — good for most workloads', provider: 'gcp' },
            { value: '14d', label: '14 days', description: 'Extended retention', provider: 'gcp' },
            { value: '31d', label: '31 days', description: 'Maximum', provider: 'gcp' },
            { value: 'custom', label: 'Custom', description: 'Enter retention (10 min – 31 days)', provider: 'gcp' },
            // Azure Service Bus: varies by tier
            { value: '1d', label: '1 day', description: 'Short retention', provider: 'azure' },
            { value: '7d', label: '7 days', description: 'Standard retention', provider: 'azure' },
            { value: '14d', label: '14 days', description: 'Maximum (Standard tier)', provider: 'azure' },
            { value: 'custom', label: 'Custom', description: 'Enter retention in days', provider: 'azure' },
          ], customInput: { type: 'number', unit: 'hours', min: 1, max: 744, step: 1, placeholder: 'e.g. 48' } },
          { name: 'max_message_size', label: 'Max message size', type: 'select', required: false, tier: 'detailed', description: 'Maximum size of a single message', default: '256', tooltip: 'AWS SQS: 1 byte – 256 KB (up to 2 GB via S3 Extended Client Library). GCP Pub/Sub: up to 10 MB per message. Azure Service Bus: 256 KB (Basic/Standard) or 100 MB (Premium).', optionDetails: [
            // AWS SQS: 1 byte – 256 KB
            { value: '1', label: '1 KB', description: 'Tiny messages — event signals', provider: 'aws' },
            { value: '16', label: '16 KB', description: 'Small — JSON payloads', provider: 'aws' },
            { value: '64', label: '64 KB', description: 'Medium — API responses', provider: 'aws' },
            { value: '256', label: '256 KB', description: 'Maximum', provider: 'aws', tooltip: 'For larger payloads, use the SQS Extended Client Library with S3 (up to 2 GB).' },
            // GCP Pub/Sub: up to 10 MB
            { value: '64', label: '64 KB', description: 'Small messages', provider: 'gcp' },
            { value: '256', label: '256 KB', description: 'Standard messages', provider: 'gcp' },
            { value: '1024', label: '1 MB', description: 'Large messages', provider: 'gcp' },
            { value: '5120', label: '5 MB', description: 'Very large messages', provider: 'gcp' },
            { value: '10240', label: '10 MB', description: 'Maximum', provider: 'gcp' },
            // Azure Service Bus: 256 KB (Basic/Standard) or 100 MB (Premium)
            { value: '64', label: '64 KB', description: 'Small messages', provider: 'azure' },
            { value: '256', label: '256 KB', description: 'Maximum (Basic/Standard tier)', provider: 'azure' },
            { value: '1024', label: '1 MB', description: 'Premium tier', provider: 'azure', tooltip: 'Requires Premium tier Service Bus' },
            { value: '102400', label: '100 MB', description: 'Maximum (Premium tier)', provider: 'azure', tooltip: 'Requires Premium tier Service Bus' },
          ], customInput: { type: 'number', unit: 'KB', min: 1, max: 1048576, step: 1, placeholder: 'e.g. 128' } },
          { name: 'dead_letter', label: 'Dead-letter queue?', type: 'boolean', required: false, tier: 'detailed', description: 'Automatically move failed messages to a separate queue for investigation', default: true, tooltip: 'Messages that fail processing after a set number of retries are moved to a dead-letter queue. Prevents poison messages from blocking the queue. Recommended for production.' },
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
          { name: 'topic_type', label: 'Topic type', type: 'select', required: false, tier: 'essential', description: 'Delivery model — affects ordering, deduplication, and throughput', default: 'standard', optionDetails: [
            { value: 'standard', label: 'Standard', description: 'Unlimited throughput · best-effort ordering', cost: '~$0.50/M msgs', provider: 'aws' },
            { value: 'fifo', label: 'FIFO', description: 'Strict ordering · exactly-once · 300 msg/s', cost: '~$0.50/M msgs', provider: 'aws' },
            { value: 'gcp-default', label: 'Default', description: 'Global, at-least-once delivery', provider: 'gcp' },
            { value: 'azure-standard', label: 'Standard', description: 'Event Grid standard tier', cost: '~$0.60/M ops', provider: 'azure' },
          ] },
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
          { name: 'size', label: 'Broker size', type: 'select', required: true, tier: 'essential', description: 'Broker instance size — determines throughput and connections', default: 'mq.m5.large', optionDetails: [
            { value: 'mq.t3.micro', label: 'mq.t3.micro', description: '2 vCPU · 1 GB · dev/test', cost: '~$22/mo', provider: 'aws' },
            { value: 'mq.m5.large', label: 'mq.m5.large', description: '2 vCPU · 8 GB · production', cost: '~$175/mo', provider: 'aws' },
            { value: 'mq.m5.xlarge', label: 'mq.m5.xlarge', description: '4 vCPU · 16 GB · heavy load', cost: '~$350/mo', provider: 'aws' },
            { value: 'mq.m5.2xlarge', label: 'mq.m5.2xlarge', description: '8 vCPU · 32 GB · high throughput', cost: '~$700/mo', provider: 'aws' },
            { value: 'lemur', label: 'Lemur', description: '1 vCPU · shared · dev only', cost: 'Free', provider: 'gcp' },
            { value: 'tiger', label: 'Tiger', description: '2 vCPU · 8 GB · production', cost: '~$99/mo', provider: 'gcp' },
            { value: 'lion', label: 'Lion', description: '4 vCPU · 16 GB · heavy load', cost: '~$399/mo', provider: 'gcp' },
            { value: 'k8s-1-2', label: '1 vCPU / 2 GB', description: 'K8s pod — light workload', provider: 'kubernetes' },
            { value: 'k8s-2-4', label: '2 vCPU / 4 GB', description: 'K8s pod — standard', provider: 'kubernetes' },
            { value: 'k8s-4-8', label: '4 vCPU / 8 GB', description: 'K8s pod — heavy load', provider: 'kubernetes' },
          ] },
          { name: 'version', label: 'Version', type: 'select', required: false, tier: 'essential', description: 'RabbitMQ engine version', default: '3.13', optionDetails: [
            { value: '3.13', label: 'RabbitMQ 3.13', description: 'Latest stable (recommended)' },
            { value: '3.12', label: 'RabbitMQ 3.12', description: 'Previous stable' },
          ] },
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
          { name: 'size', label: 'Tier', type: 'select', required: true, tier: 'essential', description: 'Service Bus tier — determines features, throughput, and isolation', default: 'standard', optionDetails: [
            { value: 'basic', label: 'Basic', description: 'Queues only · 256 KB messages', cost: '~$0.05/M ops', provider: 'azure' },
            { value: 'standard', label: 'Standard', description: 'Queues + topics · 256 KB messages', cost: '~$10/mo base', provider: 'azure' },
            { value: 'premium-1', label: 'Premium (1 MU)', description: 'Dedicated · 100 MB messages · 1 messaging unit', cost: '~$677/mo', provider: 'azure' },
            { value: 'premium-2', label: 'Premium (2 MU)', description: 'Dedicated · 100 MB messages · 2 messaging units', cost: '~$1,354/mo', provider: 'azure' },
            { value: 'premium-4', label: 'Premium (4 MU)', description: 'Dedicated · 100 MB messages · 4 messaging units', cost: '~$2,708/mo', provider: 'azure' },
          ] },
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
          { name: 'size', label: 'Throughput', type: 'select', required: true, tier: 'essential', description: 'Stream capacity — shards determine max throughput', default: 'on-demand', optionDetails: [
            { value: 'on-demand', label: 'On-demand', description: 'Auto-scales · up to 200 MB/s write', cost: '~$0.08/GB', provider: 'aws' },
            { value: '1-shard', label: '1 shard', description: '1 MB/s write · 2 MB/s read', cost: '~$11/mo', provider: 'aws' },
            { value: '2-shards', label: '2 shards', description: '2 MB/s write · 4 MB/s read', cost: '~$22/mo', provider: 'aws' },
            { value: '4-shards', label: '4 shards', description: '4 MB/s write · 8 MB/s read', cost: '~$44/mo', provider: 'aws' },
            { value: '10-shards', label: '10 shards', description: '10 MB/s write · 20 MB/s read', cost: '~$110/mo', provider: 'aws' },
            { value: 'gcp-default', label: 'Default', description: 'Auto-scales · unlimited throughput', cost: '~$40/TB ingested', provider: 'gcp' },
            { value: 'eh-basic', label: 'Basic (1 TU)', description: '1 MB/s ingress · 2 MB/s egress', cost: '~$11/mo', provider: 'azure' },
            { value: 'eh-standard', label: 'Standard (2 TU)', description: '2 MB/s ingress · 4 MB/s egress', cost: '~$22/mo', provider: 'azure' },
            { value: 'eh-standard-4', label: 'Standard (4 TU)', description: '4 MB/s ingress · 8 MB/s egress', cost: '~$44/mo', provider: 'azure' },
            { value: 'eh-premium', label: 'Premium (1 PU)', description: 'Dedicated · isolation', cost: '~$685/mo', provider: 'azure' },
          ] },
          { name: 'retention', label: 'Data retention', type: 'select', required: false, tier: 'essential', description: 'How far back consumers can replay data', default: '24h', tooltip: 'AWS Kinesis: 24 hours default, extendable up to 8,760 hours (365 days). GCP Pub/Sub: 10 minutes – 31 days. Azure Event Hubs: 1 – 90 days (Standard), up to 90 days (Premium/Dedicated).', optionDetails: [
            // AWS Kinesis: 24 hours – 365 days
            { value: '24h', label: '24 hours', description: 'Default (included free)', provider: 'aws', tooltip: 'Extended retention beyond 24h costs ~$0.02/shard/hr' },
            { value: '72h', label: '3 days', description: 'Extended replay window', provider: 'aws' },
            { value: '168h', label: '7 days', description: 'Standard extended retention', provider: 'aws' },
            { value: '720h', label: '30 days', description: 'Long retention', provider: 'aws' },
            { value: '8760h', label: '365 days', description: 'Maximum — compliance or full replay', provider: 'aws' },
            { value: 'custom', label: 'Custom', description: 'Enter retention (24h – 8,760h)', provider: 'aws' },
            // GCP Pub/Sub: 10 minutes – 31 days
            { value: '24h', label: '24 hours', description: 'Standard retention', provider: 'gcp' },
            { value: '72h', label: '3 days', description: 'Extended replay window', provider: 'gcp' },
            { value: '168h', label: '7 days', description: 'Default', provider: 'gcp' },
            { value: '720h', label: '30 days', description: 'Near-maximum', provider: 'gcp' },
            { value: 'custom', label: 'Custom', description: 'Enter retention (10 min – 31 days)', provider: 'gcp' },
            // Azure Event Hubs: 1 – 90 days
            { value: '24h', label: '24 hours', description: 'Standard retention', provider: 'azure' },
            { value: '72h', label: '3 days', description: 'Extended replay window', provider: 'azure' },
            { value: '168h', label: '7 days', description: 'Default', provider: 'azure' },
            { value: '720h', label: '30 days', description: 'Long retention', provider: 'azure' },
            { value: '2160h', label: '90 days', description: 'Maximum', provider: 'azure' },
            { value: 'custom', label: 'Custom', description: 'Enter retention (1 – 90 days)', provider: 'azure' },
          ], customInput: { type: 'number', unit: 'hours', min: 1, max: 8760, step: 1, placeholder: 'e.g. 48' } },
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
  return BEHAVIOR_LABELS[behavior];
}

/**
 * Get behavior color for UI
 */
export function getBehaviorColor(behavior: NodeBehavior): string {
  return BEHAVIOR_COLORS[behavior];
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
