/**
 * Infrastructure Pattern Suggestions
 *
 * Analyzes the current canvas and suggests missing architectural patterns.
 * Used in the AI chat panel empty state to show contextual suggestions.
 */

interface CanvasNode {
  id: string;
  type: string;
  data?: Record<string, unknown>;
}

interface CanvasEdge {
  source: string;
  target: string;
}

interface PatternSuggestion {
  label: string;
  intent: string;
}

/**
 * Analyze the canvas and return contextual infrastructure suggestions.
 * Returns 3 most relevant suggestions based on what's missing.
 */
export function suggestPatterns(nodes: CanvasNode[], _edges: CanvasEdge[]): PatternSuggestion[] {
  if (nodes.length === 0) {
    // Empty canvas — suggest starting architectures
    return [
      {
        label: 'Build a web app with database',
        intent: 'Build me a web application with a backend, database, and API gateway',
      },
      {
        label: 'Create a microservices setup',
        intent: 'Create a microservices architecture with 3 services, a gateway, and shared database',
      },
      { label: 'Add a serverless API', intent: 'Build a serverless API with a function, database, and auth' },
    ];
  }

  const iceTypes = new Set(nodes.map((n) => (n.data?.iceType as string) || '').filter(Boolean));
  const behaviors = new Set(nodes.map((n) => (n.data?.behavior as string) || '').filter(Boolean));
  const suggestions: PatternSuggestion[] = [];

  const hasBackend =
    [...iceTypes].some(
      (t) => t.includes('Backend') || t.includes('Container') || t.includes('Function') || t.includes('Worker'),
    ) || behaviors.has('scalable');

  const hasDatabase = [...iceTypes].some(
    (t) =>
      t.startsWith('Database.') ||
      t.includes('PostgreSQL') ||
      t.includes('MySQL') ||
      t.includes('MongoDB') ||
      t.includes('Warehouse'),
  );

  const hasCache = [...iceTypes].some((t) => t.includes('Redis') || t.includes('Cache') || t.includes('Memcache'));

  const hasAuth = [...iceTypes].some((t) => t.includes('Auth') || t.includes('IAM'));

  const hasMonitoring = [...iceTypes].some(
    (t) => t.includes('Log') || t.includes('Monitor') || t.includes('Observability'),
  );

  const hasGateway = [...iceTypes].some((t) => t.includes('Gateway') || t.includes('LoadBalancer'));

  const hasQueue = [...iceTypes].some(
    (t) => t.includes('Queue') || t.includes('RabbitMQ') || t.includes('Kafka') || t.includes('Event'),
  );

  const hasSecrets = [...iceTypes].some((t) => t.includes('Secret') || t.includes('Vault'));

  const hasRepo =
    [...iceTypes].some((t) => t === 'Source.Repository' || t.includes('Repository')) || behaviors.has('source');

  const hasVPC = [...iceTypes].some((t) => t === 'Network.VPC' || t.includes('VPC'));

  // Backend + Database but no cache → suggest cache
  if (hasBackend && hasDatabase && !hasCache) {
    suggestions.push({
      label: 'Add a Redis cache for performance',
      intent: 'Add a Redis cache between my backend and database for better read performance',
    });
  }

  // Has services but no monitoring → suggest monitoring
  if (hasBackend && !hasMonitoring) {
    suggestions.push({
      label: 'Add monitoring and logging',
      intent: 'Add logging and monitoring connected to my services',
    });
  }

  // Has public services but no auth → suggest auth
  if (hasBackend && !hasAuth) {
    suggestions.push({
      label: 'Add authentication',
      intent: 'Add an auth service for user authentication and connect it to my backend',
    });
  }

  // Has backend but no API gateway → suggest gateway
  if (hasBackend && !hasGateway && nodes.length > 2) {
    suggestions.push({
      label: 'Add an API gateway',
      intent: 'Add an API gateway in front of my backend services',
    });
  }

  // Has backend but no message queue → suggest async processing
  if (hasBackend && hasDatabase && !hasQueue && nodes.length >= 3) {
    suggestions.push({
      label: 'Add a message queue for async tasks',
      intent: 'Add a message queue for background job processing connected to my backend',
    });
  }

  // Has services but no secrets → suggest secrets management
  if (hasBackend && hasDatabase && !hasSecrets) {
    suggestions.push({
      label: 'Add secrets management',
      intent: 'Add a secrets manager to store database credentials and API keys securely',
    });
  }

  // Has services but no CI/CD → suggest repo
  if (hasBackend && !hasRepo) {
    suggestions.push({
      label: 'Connect a GitHub repository for CI/CD',
      intent: 'Add a GitHub repository block and connect it to my backend for CI/CD deployment',
    });
  }

  // Has multiple services but no VPC → suggest networking
  if (nodes.length >= 4 && !hasVPC) {
    suggestions.push({
      label: 'Add VPC and network security',
      intent: 'Improve security by wrapping my services in a VPC with public and private subnets',
    });
  }

  // Has database but no backend → suggest backend
  if (hasDatabase && !hasBackend) {
    suggestions.push({
      label: 'Add a backend service',
      intent: 'Add a scalable backend service connected to my database',
    });
  }

  // Return top 3 most relevant
  return suggestions.slice(0, 3);
}
