/**
 * Demo Microservices Infrastructure
 *
 * Showcase architecture demonstrating a modern e-commerce platform
 * with multiple services, databases, caching, and event-driven patterns.
 */

export interface DemoNode {
  id: string;
  type: 'block' | 'resource' | 'container';
  position: { x: number; y: number };
  width: number;
  height: number;
  parentId?: string;
  data: Record<string, unknown>;
}

export interface DemoEdge {
  id: string;
  source: string;
  target: string;
  data?: {
    relationship: string;
    port?: string | number;
    protocol?: string;
    latency?: string;
    throughput?: string;
    [key: string]: unknown;
  };
}

export const DEMO_NODES: DemoNode[] = [
  // =============================================================================
  // NETWORK INFRASTRUCTURE (VPC / Subnets — visible as region tints at L2)
  // =============================================================================
  {
    id: 'main-vpc',
    type: 'resource',
    position: { x: 30, y: 200 },
    width: 1220,
    height: 650,
    data: {
      label: 'Production VPC',
      iceType: 'Network.VPC',
      behavior: 'container',
      status: 'active',
      provider: 'aws',
      cidr: '10.0.0.0/16',
      region: 'us-east-1',
    },
  },
  {
    id: 'public-subnet',
    type: 'resource',
    position: { x: 40, y: 220 },
    width: 580,
    height: 310,
    parentId: 'main-vpc',
    data: {
      label: 'Public Subnet',
      iceType: 'Network.Subnet',
      behavior: 'container',
      status: 'active',
      provider: 'aws',
      cidr: '10.0.1.0/24',
      zone: 'us-east-1a',
    },
  },
  {
    id: 'private-subnet',
    type: 'resource',
    position: { x: 640, y: 220 },
    width: 600,
    height: 620,
    parentId: 'main-vpc',
    data: {
      label: 'Private Subnet',
      iceType: 'Network.Subnet',
      behavior: 'container',
      status: 'active',
      provider: 'aws',
      cidr: '10.0.2.0/24',
      zone: 'us-east-1b',
    },
  },

  // =============================================================================
  // INTERNET / ENTRY POINT
  // =============================================================================
  {
    id: 'cdn',
    type: 'resource',
    position: { x: 50, y: 50 },
    width: 200,
    height: 120,
    data: {
      label: 'CloudFront CDN',
      iceType: 'Network.CDN',
      behavior: 'singleton',
      status: 'active',
      provider: 'aws',
      domain: 'cdn.acme.io',
    },
  },

  {
    id: 'waf',
    type: 'resource',
    position: { x: 300, y: 50 },
    width: 200,
    height: 120,
    data: {
      label: 'Web App Firewall',
      iceType: 'Security.WAF',
      behavior: 'singleton',
      status: 'active',
      provider: 'aws',
      description: 'DDoS & threat protection',
    },
  },

  // =============================================================================
  // API GATEWAY LAYER
  // =============================================================================
  {
    id: 'api-gateway',
    type: 'resource',
    position: { x: 550, y: 50 },
    width: 220,
    height: 120,
    data: {
      label: 'API Gateway',
      iceType: 'Network.APIGateway',
      behavior: 'connector',
      status: 'active',
      provider: 'aws',
      domain: 'api.acme.io',
      port: 443,
    },
  },

  // =============================================================================
  // FRONTEND CLUSTER
  // =============================================================================
  {
    id: 'frontend-cluster',
    type: 'container',
    position: { x: 50, y: 220 },
    width: 450,
    height: 280,
    data: {
      label: 'Frontend Services',
      iceType: 'Group.Frontend',
      behavior: 'container',
      status: 'active',
      provider: 'aws',
      folded: false,
    },
  },

  {
    id: 'web-app',
    type: 'resource',
    position: { x: 30, y: 60 },
    width: 180,
    height: 100,
    parentId: 'frontend-cluster',
    data: {
      label: 'Web App',
      iceType: 'Application.StaticSite',
      behavior: 'scalable',
      status: 'active',
      provider: 'aws',
      runtime: 'React 18',
      replicas: 3,
      repository: 'acme-corp/web-app',
      domain: 'app.acme.io',
    },
  },

  {
    id: 'mobile-bff',
    type: 'resource',
    position: { x: 240, y: 60 },
    width: 180,
    height: 100,
    parentId: 'frontend-cluster',
    data: {
      label: 'Mobile BFF',
      iceType: 'Application.Container',
      behavior: 'scalable',
      status: 'active',
      provider: 'aws',
      runtime: 'Node.js 20',
      replicas: 2,
      repository: 'acme-corp/mobile-bff',
      image: 'acme/mobile-bff:v1.8',
      port: 3000,
    },
  },

  {
    id: 'admin-portal',
    type: 'resource',
    position: { x: 30, y: 170 },
    width: 180,
    height: 100,
    parentId: 'frontend-cluster',
    data: {
      label: 'Admin Portal',
      iceType: 'Application.StaticSite',
      behavior: 'singleton',
      status: 'active',
      provider: 'aws',
      runtime: 'Vue 3',
      repository: 'acme-corp/admin-portal',
      domain: 'admin.acme.io',
    },
  },

  // =============================================================================
  // CORE SERVICES CLUSTER
  // =============================================================================
  {
    id: 'core-services',
    type: 'container',
    position: { x: 530, y: 220 },
    width: 700,
    height: 400,
    data: {
      label: 'Core Microservices',
      iceType: 'Group.Services',
      behavior: 'container',
      status: 'active',
      provider: 'kubernetes',
      folded: false,
    },
  },

  {
    id: 'user-service',
    type: 'resource',
    position: { x: 30, y: 60 },
    width: 180,
    height: 100,
    parentId: 'core-services',
    data: {
      label: 'User Service',
      iceType: 'Application.Container',
      behavior: 'scalable',
      status: 'active',
      provider: 'kubernetes',
      runtime: 'Go 1.21',
      replicas: 3,
      repository: 'acme-corp/user-service',
      image: 'acme/user-svc:v2.4',
      port: 8080,
    },
  },

  {
    id: 'product-service',
    type: 'resource',
    position: { x: 240, y: 60 },
    width: 180,
    height: 100,
    parentId: 'core-services',
    data: {
      label: 'Product Service',
      iceType: 'Application.Container',
      behavior: 'scalable',
      status: 'active',
      provider: 'kubernetes',
      runtime: 'Java 21',
      replicas: 4,
      repository: 'acme-corp/product-service',
      image: 'acme/product-svc:v3.1',
      port: 8080,
    },
  },

  {
    id: 'order-service',
    type: 'resource',
    position: { x: 450, y: 60 },
    width: 180,
    height: 100,
    parentId: 'core-services',
    data: {
      label: 'Order Service',
      iceType: 'Application.Container',
      behavior: 'scalable',
      status: 'active',
      provider: 'kubernetes',
      runtime: 'Python 3.12',
      replicas: 3,
      repository: 'acme-corp/order-service',
      image: 'acme/order-svc:v1.9',
      port: 8000,
    },
  },

  {
    id: 'payment-service',
    type: 'resource',
    position: { x: 30, y: 180 },
    width: 180,
    height: 100,
    parentId: 'core-services',
    data: {
      label: 'Payment Service',
      iceType: 'Application.Container',
      behavior: 'scalable',
      status: 'active',
      provider: 'kubernetes',
      runtime: 'Node.js 20',
      replicas: 2,
      repository: 'acme-corp/payment-service',
      image: 'acme/payment-svc:v2.0',
      port: 3000,
    },
  },

  {
    id: 'inventory-service',
    type: 'resource',
    position: { x: 240, y: 180 },
    width: 180,
    height: 100,
    parentId: 'core-services',
    data: {
      label: 'Inventory Service',
      iceType: 'Application.Container',
      behavior: 'scalable',
      status: 'active',
      provider: 'kubernetes',
      runtime: 'Rust',
      replicas: 2,
      repository: 'acme-corp/inventory-service',
      image: 'acme/inventory-svc:v1.5',
      port: 8080,
    },
  },

  {
    id: 'notification-service',
    type: 'resource',
    position: { x: 450, y: 180 },
    width: 180,
    height: 100,
    parentId: 'core-services',
    data: {
      label: 'Notification Service',
      iceType: 'Application.Container',
      behavior: 'scalable',
      status: 'active',
      provider: 'kubernetes',
      runtime: 'Go 1.21',
      replicas: 2,
      repository: 'acme-corp/notification-service',
      image: 'acme/notif-svc:v1.3',
      port: 8080,
    },
  },

  {
    id: 'search-service',
    type: 'resource',
    position: { x: 140, y: 290 },
    width: 180,
    height: 100,
    parentId: 'core-services',
    data: {
      label: 'Search Service',
      iceType: 'Application.Container',
      behavior: 'scalable',
      status: 'active',
      provider: 'kubernetes',
      runtime: 'Java 21',
      replicas: 3,
      repository: 'acme-corp/search-service',
      image: 'acme/search-svc:v2.2',
      port: 8080,
    },
  },

  {
    id: 'recommendation-service',
    type: 'resource',
    position: { x: 350, y: 290 },
    width: 180,
    height: 100,
    parentId: 'core-services',
    data: {
      label: 'Recommendations',
      iceType: 'Application.Container',
      behavior: 'scalable',
      status: 'active',
      provider: 'kubernetes',
      runtime: 'Python 3.12',
      replicas: 2,
      repository: 'acme-corp/recommendation-engine',
      image: 'acme/rec-engine:v1.1',
      port: 8000,
    },
  },

  // =============================================================================
  // DATA LAYER
  // =============================================================================
  {
    id: 'data-layer',
    type: 'container',
    position: { x: 50, y: 540 },
    width: 700,
    height: 280,
    data: {
      label: 'Data Layer',
      iceType: 'Group.Data',
      behavior: 'container',
      status: 'active',
      provider: 'aws',
      folded: false,
    },
  },

  {
    id: 'users-db',
    type: 'resource',
    position: { x: 30, y: 60 },
    width: 180,
    height: 100,
    parentId: 'data-layer',
    data: {
      label: 'Users DB',
      iceType: 'Database.PostgreSQL',
      behavior: 'stateful',
      status: 'active',
      provider: 'aws',
      version: 'PostgreSQL 16',
      size: '500GB',
      replicas: 2,
      domain: 'users-db.internal.acme.io',
      port: 5432,
    },
  },

  {
    id: 'products-db',
    type: 'resource',
    position: { x: 240, y: 60 },
    width: 180,
    height: 100,
    parentId: 'data-layer',
    data: {
      label: 'Products DB',
      iceType: 'Database.MongoDB',
      behavior: 'stateful',
      status: 'active',
      provider: 'aws',
      version: 'MongoDB 7',
      size: '2TB',
      replicas: 3,
      domain: 'products-db.internal.acme.io',
      port: 27017,
    },
  },

  {
    id: 'orders-db',
    type: 'resource',
    position: { x: 450, y: 60 },
    width: 180,
    height: 100,
    parentId: 'data-layer',
    data: {
      label: 'Orders DB',
      iceType: 'Database.PostgreSQL',
      behavior: 'stateful',
      status: 'active',
      provider: 'aws',
      version: 'PostgreSQL 16',
      size: '1TB',
      replicas: 2,
      domain: 'orders-db.internal.acme.io',
      port: 5432,
    },
  },

  {
    id: 'redis-cache',
    type: 'resource',
    position: { x: 30, y: 170 },
    width: 180,
    height: 100,
    parentId: 'data-layer',
    data: {
      label: 'Redis Cache',
      iceType: 'Database.Redis',
      behavior: 'stateful',
      status: 'active',
      provider: 'aws',
      version: 'Redis 7',
      memory: '32GB',
      replicas: 3,
      domain: 'cache.internal.acme.io',
      port: 6379,
    },
  },

  {
    id: 'elasticsearch',
    type: 'resource',
    position: { x: 240, y: 170 },
    width: 180,
    height: 100,
    parentId: 'data-layer',
    data: {
      label: 'Elasticsearch',
      iceType: 'Database.Elasticsearch',
      behavior: 'stateful',
      status: 'active',
      provider: 'aws',
      version: 'ES 8.11',
      size: '500GB',
    },
  },

  {
    id: 'session-store',
    type: 'resource',
    position: { x: 450, y: 170 },
    width: 180,
    height: 100,
    parentId: 'data-layer',
    data: {
      label: 'Session Store',
      iceType: 'Database.Redis',
      behavior: 'stateful',
      status: 'active',
      provider: 'aws',
      version: 'Redis 7',
      memory: '16GB',
    },
  },

  // =============================================================================
  // EVENT / MESSAGING LAYER
  // =============================================================================
  {
    id: 'messaging-layer',
    type: 'container',
    position: { x: 780, y: 660 },
    width: 450,
    height: 160,
    data: {
      label: 'Event Bus',
      iceType: 'Group.Messaging',
      behavior: 'container',
      status: 'active',
      provider: 'aws',
      folded: false,
    },
  },

  {
    id: 'kafka',
    type: 'resource',
    position: { x: 30, y: 50 },
    width: 180,
    height: 100,
    parentId: 'messaging-layer',
    data: {
      label: 'Kafka Cluster',
      iceType: 'Messaging.Kafka',
      behavior: 'streaming',
      status: 'active',
      provider: 'aws',
      partitions: 24,
      replicas: 3,
      domain: 'kafka.internal.acme.io',
      port: 9092,
    },
  },

  {
    id: 'sqs-queue',
    type: 'resource',
    position: { x: 240, y: 50 },
    width: 180,
    height: 100,
    parentId: 'messaging-layer',
    data: {
      label: 'Task Queue',
      iceType: 'Messaging.Queue',
      behavior: 'streaming',
      status: 'active',
      provider: 'aws',
      type: 'SQS FIFO',
    },
  },

  // =============================================================================
  // OBSERVABILITY
  // =============================================================================
  {
    id: 'monitoring',
    type: 'container',
    position: { x: 1270, y: 50 },
    width: 220,
    height: 400,
    data: {
      label: 'Observability',
      iceType: 'Group.Monitoring',
      behavior: 'container',
      status: 'active',
      provider: 'aws',
      folded: false,
    },
  },

  {
    id: 'prometheus',
    type: 'resource',
    position: { x: 20, y: 50 },
    width: 180,
    height: 90,
    parentId: 'monitoring',
    data: {
      label: 'Prometheus',
      iceType: 'Observability.Metrics',
      behavior: 'singleton',
      status: 'active',
      provider: 'kubernetes',
    },
  },

  {
    id: 'grafana',
    type: 'resource',
    position: { x: 20, y: 150 },
    width: 180,
    height: 90,
    parentId: 'monitoring',
    data: {
      label: 'Grafana',
      iceType: 'Observability.Dashboard',
      behavior: 'singleton',
      status: 'active',
      provider: 'kubernetes',
    },
  },

  {
    id: 'jaeger',
    type: 'resource',
    position: { x: 20, y: 250 },
    width: 180,
    height: 90,
    parentId: 'monitoring',
    data: {
      label: 'Jaeger Tracing',
      iceType: 'Observability.Tracing',
      behavior: 'singleton',
      status: 'active',
      provider: 'kubernetes',
    },
  },

  // =============================================================================
  // EXTERNAL SERVICES (3rd party — grouped as a block)
  // =============================================================================
  {
    id: 'external-services',
    type: 'container',
    position: { x: 1270, y: 500 },
    width: 460,
    height: 280,
    data: {
      label: 'External Services',
      iceType: 'Group.External',
      behavior: 'container',
      status: 'active',
      provider: 'external',
      folded: false,
    },
  },

  {
    id: 'stripe',
    type: 'resource',
    position: { x: 20, y: 56 },
    width: 180,
    height: 100,
    parentId: 'external-services',
    data: {
      label: 'Stripe',
      iceType: 'External.Payment',
      behavior: 'connector',
      status: 'active',
      provider: 'external',
      description: 'Payment processing',
    },
  },

  {
    id: 'sendgrid',
    type: 'resource',
    position: { x: 220, y: 56 },
    width: 180,
    height: 100,
    parentId: 'external-services',
    data: {
      label: 'SendGrid',
      iceType: 'External.Email',
      behavior: 'connector',
      status: 'active',
      provider: 'external',
      description: 'Email delivery',
    },
  },

  {
    id: 'twilio',
    type: 'resource',
    position: { x: 20, y: 170 },
    width: 180,
    height: 100,
    parentId: 'external-services',
    data: {
      label: 'Twilio',
      iceType: 'External.SMS',
      behavior: 'connector',
      status: 'active',
      provider: 'external',
      description: 'SMS notifications',
    },
  },

  // =============================================================================
  // LOG TERMINALS
  // =============================================================================
  {
    id: 'order-logs',
    type: 'resource',
    position: { x: 50, y: 860 },
    width: 420,
    height: 260,
    data: {
      label: 'Order Service',
      iceType: 'Log.Terminal',
      behavior: 'singleton',
      status: 'active',
      provider: 'aws',
      serviceName: 'order-service',
    },
  },

  {
    id: 'payment-logs',
    type: 'resource',
    position: { x: 500, y: 860 },
    width: 420,
    height: 260,
    data: {
      label: 'Payment Service',
      iceType: 'Log.Terminal',
      behavior: 'singleton',
      status: 'active',
      provider: 'aws',
      serviceName: 'payment-service',
    },
  },

  {
    id: 'gateway-logs',
    type: 'resource',
    position: { x: 950, y: 860 },
    width: 420,
    height: 260,
    data: {
      label: 'API Gateway',
      iceType: 'Log.Terminal',
      behavior: 'singleton',
      status: 'active',
      provider: 'aws',
      serviceName: 'api-gateway',
    },
  },
];

export const DEMO_EDGES: DemoEdge[] = [
  // Entry flow
  {
    id: 'e-cdn-waf',
    source: 'cdn',
    target: 'waf',
    data: { relationship: 'connects_to', protocol: 'HTTPS', port: 443, latency: '2ms' },
  },
  {
    id: 'e-waf-gateway',
    source: 'waf',
    target: 'api-gateway',
    data: { relationship: 'connects_to', protocol: 'HTTPS', port: 443, latency: '1ms' },
  },

  // Gateway to frontend
  {
    id: 'e-gw-web',
    source: 'api-gateway',
    target: 'web-app',
    data: { relationship: 'connects_to', protocol: 'HTTP', port: 3000, latency: '4ms' },
  },
  {
    id: 'e-gw-mobile',
    source: 'api-gateway',
    target: 'mobile-bff',
    data: { relationship: 'connects_to', protocol: 'HTTP', port: 3001, latency: '5ms' },
  },
  {
    id: 'e-gw-admin',
    source: 'api-gateway',
    target: 'admin-portal',
    data: { relationship: 'connects_to', protocol: 'HTTP', port: 3002, latency: '4ms' },
  },

  // Gateway to services
  {
    id: 'e-gw-user',
    source: 'api-gateway',
    target: 'user-service',
    data: {
      relationship: 'connects_to',
      protocol: 'gRPC',
      port: 50051,
      latency: '3ms',
      throughput: '1.2k rps',
    },
  },
  {
    id: 'e-gw-product',
    source: 'api-gateway',
    target: 'product-service',
    data: {
      relationship: 'connects_to',
      protocol: 'gRPC',
      port: 50052,
      latency: '4ms',
      throughput: '3.4k rps',
    },
  },
  {
    id: 'e-gw-order',
    source: 'api-gateway',
    target: 'order-service',
    data: {
      relationship: 'connects_to',
      protocol: 'gRPC',
      port: 50053,
      latency: '5ms',
      throughput: '800 rps',
    },
  },
  {
    id: 'e-gw-search',
    source: 'api-gateway',
    target: 'search-service',
    data: {
      relationship: 'connects_to',
      protocol: 'HTTP',
      port: 8080,
      latency: '12ms',
      throughput: '2.1k rps',
    },
  },

  // Service interconnections
  {
    id: 'e-order-payment',
    source: 'order-service',
    target: 'payment-service',
    data: { relationship: 'depends_on', protocol: 'gRPC', port: 50054, latency: '8ms' },
  },
  {
    id: 'e-order-inventory',
    source: 'order-service',
    target: 'inventory-service',
    data: { relationship: 'depends_on', protocol: 'gRPC', port: 50055, latency: '3ms' },
  },
  {
    id: 'e-order-notif',
    source: 'order-service',
    target: 'notification-service',
    data: { relationship: 'connects_to', protocol: 'AMQP', latency: '1ms' },
  },
  {
    id: 'e-product-inventory',
    source: 'product-service',
    target: 'inventory-service',
    data: { relationship: 'depends_on', protocol: 'gRPC', port: 50055, latency: '2ms' },
  },
  {
    id: 'e-product-search',
    source: 'product-service',
    target: 'search-service',
    data: { relationship: 'connects_to', protocol: 'HTTP', port: 9200, latency: '6ms' },
  },
  {
    id: 'e-product-rec',
    source: 'product-service',
    target: 'recommendation-service',
    data: { relationship: 'connects_to', protocol: 'gRPC', port: 50056, latency: '15ms' },
  },
  {
    id: 'e-user-notif',
    source: 'user-service',
    target: 'notification-service',
    data: { relationship: 'connects_to', protocol: 'AMQP', latency: '1ms' },
  },

  // Services to databases
  {
    id: 'e-user-db',
    source: 'user-service',
    target: 'users-db',
    data: {
      relationship: 'depends_on',
      protocol: 'TCP',
      port: 5432,
      latency: '1ms',
      throughput: '450 qps',
    },
  },
  {
    id: 'e-product-db',
    source: 'product-service',
    target: 'products-db',
    data: {
      relationship: 'depends_on',
      protocol: 'TCP',
      port: 5432,
      latency: '1ms',
      throughput: '1.8k qps',
    },
  },
  {
    id: 'e-order-db',
    source: 'order-service',
    target: 'orders-db',
    data: {
      relationship: 'depends_on',
      protocol: 'TCP',
      port: 5432,
      latency: '1ms',
      throughput: '620 qps',
    },
  },
  {
    id: 'e-inventory-db',
    source: 'inventory-service',
    target: 'products-db',
    data: { relationship: 'depends_on', protocol: 'TCP', port: 5432, latency: '1ms' },
  },
  {
    id: 'e-search-es',
    source: 'search-service',
    target: 'elasticsearch',
    data: {
      relationship: 'depends_on',
      protocol: 'HTTP',
      port: 9200,
      latency: '5ms',
      throughput: '2k qps',
    },
  },
  {
    id: 'e-rec-es',
    source: 'recommendation-service',
    target: 'elasticsearch',
    data: { relationship: 'depends_on', protocol: 'HTTP', port: 9200, latency: '8ms' },
  },

  // Cache connections
  {
    id: 'e-user-cache',
    source: 'user-service',
    target: 'redis-cache',
    data: {
      relationship: 'depends_on',
      protocol: 'TCP',
      port: 6379,
      latency: '<1ms',
      throughput: '12k ops',
    },
  },
  {
    id: 'e-product-cache',
    source: 'product-service',
    target: 'redis-cache',
    data: {
      relationship: 'depends_on',
      protocol: 'TCP',
      port: 6379,
      latency: '<1ms',
      throughput: '8k ops',
    },
  },
  {
    id: 'e-session-cache',
    source: 'api-gateway',
    target: 'session-store',
    data: { relationship: 'depends_on', protocol: 'TCP', port: 6379, latency: '<1ms' },
  },

  // Event bus connections
  {
    id: 'e-order-kafka',
    source: 'order-service',
    target: 'kafka',
    data: { relationship: 'connects_to', protocol: 'TCP', port: 9092, throughput: '500 msg/s' },
  },
  {
    id: 'e-payment-kafka',
    source: 'payment-service',
    target: 'kafka',
    data: { relationship: 'connects_to', protocol: 'TCP', port: 9092, throughput: '200 msg/s' },
  },
  {
    id: 'e-inventory-kafka',
    source: 'inventory-service',
    target: 'kafka',
    data: { relationship: 'connects_to', protocol: 'TCP', port: 9092, throughput: '350 msg/s' },
  },
  {
    id: 'e-notif-kafka',
    source: 'notification-service',
    target: 'kafka',
    data: { relationship: 'connects_to', protocol: 'TCP', port: 9092, throughput: '1.2k msg/s' },
  },
  {
    id: 'e-notif-sqs',
    source: 'notification-service',
    target: 'sqs-queue',
    data: { relationship: 'connects_to', protocol: 'HTTPS', port: 443, throughput: '400 msg/s' },
  },

  // External services
  {
    id: 'e-payment-stripe',
    source: 'payment-service',
    target: 'stripe',
    data: { relationship: 'connects_to', protocol: 'HTTPS', port: 443, latency: '120ms' },
  },
  {
    id: 'e-notif-sendgrid',
    source: 'notification-service',
    target: 'sendgrid',
    data: { relationship: 'connects_to', protocol: 'HTTPS', port: 443, latency: '85ms' },
  },
  {
    id: 'e-notif-twilio',
    source: 'notification-service',
    target: 'twilio',
    data: { relationship: 'connects_to', protocol: 'HTTPS', port: 443, latency: '95ms' },
  },

  // Monitoring connections
  {
    id: 'e-prom-grafana',
    source: 'prometheus',
    target: 'grafana',
    data: { relationship: 'connects_to', protocol: 'HTTP', port: 9090 },
  },

  // Containment edges
  {
    id: 'c-frontend-web',
    source: 'frontend-cluster',
    target: 'web-app',
    data: { relationship: 'contains' },
  },
  {
    id: 'c-frontend-mobile',
    source: 'frontend-cluster',
    target: 'mobile-bff',
    data: { relationship: 'contains' },
  },
  {
    id: 'c-frontend-admin',
    source: 'frontend-cluster',
    target: 'admin-portal',
    data: { relationship: 'contains' },
  },

  {
    id: 'c-core-user',
    source: 'core-services',
    target: 'user-service',
    data: { relationship: 'contains' },
  },
  {
    id: 'c-core-product',
    source: 'core-services',
    target: 'product-service',
    data: { relationship: 'contains' },
  },
  {
    id: 'c-core-order',
    source: 'core-services',
    target: 'order-service',
    data: { relationship: 'contains' },
  },
  {
    id: 'c-core-payment',
    source: 'core-services',
    target: 'payment-service',
    data: { relationship: 'contains' },
  },
  {
    id: 'c-core-inventory',
    source: 'core-services',
    target: 'inventory-service',
    data: { relationship: 'contains' },
  },
  {
    id: 'c-core-notif',
    source: 'core-services',
    target: 'notification-service',
    data: { relationship: 'contains' },
  },
  {
    id: 'c-core-search',
    source: 'core-services',
    target: 'search-service',
    data: { relationship: 'contains' },
  },
  {
    id: 'c-core-rec',
    source: 'core-services',
    target: 'recommendation-service',
    data: { relationship: 'contains' },
  },

  {
    id: 'c-data-users',
    source: 'data-layer',
    target: 'users-db',
    data: { relationship: 'contains' },
  },
  {
    id: 'c-data-products',
    source: 'data-layer',
    target: 'products-db',
    data: { relationship: 'contains' },
  },
  {
    id: 'c-data-orders',
    source: 'data-layer',
    target: 'orders-db',
    data: { relationship: 'contains' },
  },
  {
    id: 'c-data-redis',
    source: 'data-layer',
    target: 'redis-cache',
    data: { relationship: 'contains' },
  },
  {
    id: 'c-data-es',
    source: 'data-layer',
    target: 'elasticsearch',
    data: { relationship: 'contains' },
  },
  {
    id: 'c-data-session',
    source: 'data-layer',
    target: 'session-store',
    data: { relationship: 'contains' },
  },

  {
    id: 'c-msg-kafka',
    source: 'messaging-layer',
    target: 'kafka',
    data: { relationship: 'contains' },
  },
  {
    id: 'c-msg-sqs',
    source: 'messaging-layer',
    target: 'sqs-queue',
    data: { relationship: 'contains' },
  },

  {
    id: 'c-mon-prom',
    source: 'monitoring',
    target: 'prometheus',
    data: { relationship: 'contains' },
  },
  {
    id: 'c-mon-grafana',
    source: 'monitoring',
    target: 'grafana',
    data: { relationship: 'contains' },
  },
  {
    id: 'c-mon-jaeger',
    source: 'monitoring',
    target: 'jaeger',
    data: { relationship: 'contains' },
  },

  {
    id: 'c-ext-stripe',
    source: 'external-services',
    target: 'stripe',
    data: { relationship: 'contains' },
  },
  {
    id: 'c-ext-sendgrid',
    source: 'external-services',
    target: 'sendgrid',
    data: { relationship: 'contains' },
  },
  {
    id: 'c-ext-twilio',
    source: 'external-services',
    target: 'twilio',
    data: { relationship: 'contains' },
  },

  // Log terminal connections
  {
    id: 'e-order-logs',
    source: 'order-service',
    target: 'order-logs',
    data: { relationship: 'logs_to' },
  },
  {
    id: 'e-payment-logs',
    source: 'payment-service',
    target: 'payment-logs',
    data: { relationship: 'logs_to' },
  },
  {
    id: 'e-gateway-logs',
    source: 'api-gateway',
    target: 'gateway-logs',
    data: { relationship: 'logs_to' },
  },
];
