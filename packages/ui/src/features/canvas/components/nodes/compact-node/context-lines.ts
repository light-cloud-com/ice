import { truncate, shortRepo, shortDomain, ph, listCount } from './helpers';
import type { ContextResult } from './types';

/**
 * Returns the most relevant context lines per block type.
 * Reads from ACTUAL schema field names (purpose, size, order_matters, etc.)
 * so that property panel edits immediately reflect on the card.
 */
export function getContextLines(data: Record<string, unknown>, iceType: string): ContextResult {
  const lines: string[] = [];
  let repoLineIndex = -1;

  // ── Schema field readers (prefer _display companion fields for enriched options) ──
  const purpose = (data.purpose_display as string) || (data.purpose as string) || '';
  const size = (data.size_display as string) || (data.size as string) || '';
  const domain = (data.custom_domain as string) || (data.domain as string) || '';
  const framework = (data.framework_display as string) || (data.framework as string) || '';
  const frequency = (data.frequency_display as string) || (data.frequency as string) || '';
  const production = data.production;
  const orderMatters = data.order_matters;
  const keepData = (data.retention_display as string) || (data.keep_data as string) || (data.retention as string) || '';
  const engine = (data.engine_display as string) || (data.engine as string) || '';
  const lookupField = (data.lookup_field as string) || '';
  const isPublic = data.public;
  const repository = (data.repository as string) || (data.github as string) || (data.repo as string) || '';
  const branch = (data.branch as string) || '';

  const resourceId = (data.resourceId as string) || '';

  switch (resourceId) {
    // ── Frontend ──
    case 'frontend-app':
      lines.push(domain ? truncate(shortDomain(domain), 32) : ph('app.example.com'));
      if (framework) lines.push(framework);
      break;

    case 'ssr-site':
      lines.push(domain ? truncate(shortDomain(domain), 32) : ph('www.example.com'));
      if (framework) lines.push(framework);
      break;

    // ── Compute ──
    case 'backend-api':
    case 'container-service':
      if (purpose) lines.push(purpose);
      if (size) lines.push(size);
      break;

    case 'worker':
      if (purpose) lines.push(purpose);
      if (size) lines.push(size);
      break;

    case 'serverless-function':
    case 'function-compute':
    case 'oci-functions':
      if (purpose) lines.push(purpose);
      if (size) lines.push(size);
      break;

    case 'do-app-platform':
      if (purpose) lines.push(purpose);
      if (size) lines.push(size);
      break;

    case 'scheduled-task':
      lines.push(frequency || ph('Every day at midnight'));
      break;

    // ── Database ──
    case 'postgres-db':
    case 'mysql-db':
      if (size) lines.push(size);
      lines.push(production ? 'Production-ready' : ph('Dev mode'));
      break;

    case 'mongodb':
      if (size) lines.push(size);
      lines.push(production ? 'Production-ready' : ph('Dev mode'));
      break;

    case 'redis-cache':
      if (purpose) lines.push(purpose);
      if (size) lines.push(size);
      break;

    case 'dynamodb':
      if (size) lines.push(size);
      if (lookupField) lines.push(`key: ${lookupField}`);
      break;

    case 'firestore':
      if (purpose) lines.push(purpose);
      if (size) lines.push(size);
      break;

    case 'cosmosdb':
      if (purpose) lines.push(purpose);
      if (size) lines.push(size);
      break;

    case 'vector-db':
      if (purpose) lines.push(purpose);
      if (engine) lines.push(engine);
      break;

    case 'data-warehouse':
      if (purpose) lines.push(purpose);
      if (engine) lines.push(engine);
      break;

    case 'search-engine':
      if (purpose) lines.push(purpose);
      if (engine) lines.push(engine);
      break;

    // ── Messaging ──
    case 'message-queue':
      if (purpose) lines.push(purpose);
      lines.push(orderMatters ? 'FIFO (ordered)' : 'Standard');
      break;

    case 'event-bus': {
      if (purpose) lines.push(purpose);
      const subCount = listCount(data.subscribers);
      lines.push(subCount > 0 ? `${subCount} subscribers` : ph('No subscribers'));
      break;
    }

    case 'rabbitmq': {
      if (purpose) lines.push(purpose);
      const qCount = listCount(data.queues);
      if (qCount > 0) lines.push(`${qCount} queues`);
      break;
    }

    case 'cloud-pubsub': {
      if (purpose) lines.push(purpose);
      const listeners = listCount(data.subscribers);
      if (listeners > 0) lines.push(`${listeners} listeners`);
      break;
    }

    case 'service-bus': {
      if (purpose) lines.push(purpose);
      const qs = listCount(data.queues);
      const ts = listCount(data.topics);
      const parts = [];
      if (qs > 0) parts.push(`${qs} queues`);
      if (ts > 0) parts.push(`${ts} topics`);
      if (parts.length) lines.push(parts.join(' \u00B7 '));
      break;
    }

    case 'event-stream':
      if (purpose) lines.push(purpose);
      if (keepData) lines.push(`retain: ${keepData}`);
      break;

    // ── Storage ──
    case 'object-storage':
    case 'oss':
    case 'oci-object-storage':
    case 'do-spaces':
      if (purpose) lines.push(purpose);
      lines.push(isPublic ? 'Public access' : 'Private');
      break;

    case 'file-storage':
      if (purpose) lines.push(purpose);
      if (size) lines.push(size);
      break;

    // ── Network ──
    case 'api-gateway': {
      if (purpose) lines.push(purpose);
      const routeCount = listCount(data.routes);
      if (routeCount > 0) lines.push(`${routeCount} routes`);
      break;
    }

    case 'dns-zone': {
      lines.push(domain || ph('example.com'));
      const subCount = listCount(data.subdomains);
      if (subCount > 0) lines.push(`${subCount} subdomains`);
      break;
    }

    case 'public-traffic':
      if (domain) lines.push(truncate(shortDomain(domain), 32));
      break;

    case 'load-balancer':
      if (purpose) lines.push(purpose);
      break;

    case 'cdn':
      if (purpose) lines.push(purpose);
      if (domain) lines.push(truncate(shortDomain(domain), 32));
      break;

    // ── Security ──
    case 'secret-store': {
      if (purpose) lines.push(purpose);
      const secretCount = listCount(data.secrets);
      lines.push(secretCount > 0 ? `${secretCount} secrets` : ph('No secrets yet'));
      break;
    }

    case 'ssl-certificate':
      if (domain) lines.push(domain);
      break;

    case 'service-account':
      if (purpose) lines.push(purpose);
      break;

    // ── AI ──
    case 'llm-gateway':
      if (purpose) lines.push(purpose);
      if (size) lines.push(size);
      break;

    case 'ml-model':
      if (purpose) lines.push(purpose);
      if (framework) lines.push(framework);
      break;

    // ── Source / fallback ──
    default:
      if (iceType === 'Source.Repository') {
        repoLineIndex = lines.length;
        lines.push(repository ? truncate(shortRepo(repository), 30) : ph('owner/repo'));
        lines.push(branch ? `\u2192 ${branch}` : ph('\u2192 main'));
      } else if (iceType === 'Config.Environment') {
        const varCount = listCount(data.variables);
        lines.push(varCount > 0 ? `${varCount} variables` : ph('No variables'));
      } else if (purpose) {
        lines.push(purpose);
        if (size) lines.push(size);
      }
      break;
  }

  return { lines, repoLineIndex };
}
