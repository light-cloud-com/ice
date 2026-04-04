/**
 * Quick-Start Micro-Templates
 *
 * Minimal ComposedTemplate definitions for the empty canvas overlay.
 * Each archetype expands into 3-5 blocks + connections.
 * All blocks are real palette components.
 */

import type { ComposedTemplate } from './types';

/** SSR Site + Database: Server-rendered app with a managed database */
const quickStartWebsiteDb: ComposedTemplate = {
  id: 'qs-website-db',
  name: 'Website + Database',
  description: 'Server-rendered app with a managed database',
  icon: 'Globe',
  estimatedCost: '$30-60/mo',
  category: 'quick-start',
  provider: 'gcp',
  providers: ['gcp', 'aws', 'azure'],
  tags: ['Next.js', 'PostgreSQL'],
  securityLevel: 'basic',
  difficulty: 'starter',
  trust: 'official',
  featured: true,
  author: { name: 'ICE Team' },
  environmentPresets: [{ type: 'production', name: 'Production', region: 'us-central1', securityLevel: 'basic' }],
  blocks: [
    { iceType: 'Network.Internet', label: 'Public Traffic', position: { x: 100, y: 200 } },
    {
      iceType: 'Compute.SSRSite',
      label: 'SSR Site',
      position: { x: 380, y: 200 },
      data: { framework: 'nextjs', domain: 'mysite.com' },
    },
    { iceType: 'Database.PostgreSQL', label: 'Site Database', position: { x: 660, y: 200 }, data: { storage: '20', version: '17' } },
  ],
  connections: [
    { fromBlock: 0, toBlock: 1, relationship: 'connects_to', protocol: 'HTTPS', port: 443 },
    { fromBlock: 1, toBlock: 2, relationship: 'depends_on', protocol: 'TCP', port: 5432 },
  ],
};

/** Web App + API: Static frontend, gateway, API service, and database */
const quickStartWebAppApi: ComposedTemplate = {
  id: 'qs-webapp-api',
  name: 'Web App + API',
  description: 'Static frontend with a backend API and database',
  icon: 'Rocket',
  estimatedCost: '$40-80/mo',
  category: 'quick-start',
  provider: 'gcp',
  providers: ['gcp', 'aws', 'azure'],
  tags: ['React', 'API', 'PostgreSQL'],
  securityLevel: 'basic',
  difficulty: 'starter',
  trust: 'official',
  featured: true,
  author: { name: 'ICE Team' },
  environmentPresets: [{ type: 'production', name: 'Production', region: 'us-central1', securityLevel: 'basic' }],
  blocks: [
    { iceType: 'Network.Internet', label: 'Public Traffic', position: { x: 100, y: 200 } },
    {
      iceType: 'Compute.StaticSite',
      label: 'Web App',
      position: { x: 380, y: 100 },
      data: { framework: 'react', domain: 'app.mysite.com' },
    },
    { iceType: 'Network.Gateway', label: 'API Gateway', position: { x: 380, y: 300 }, data: { protocol: 'http' } },
    {
      iceType: 'Compute.Container',
      label: 'API Server',
      position: { x: 660, y: 300 },
      data: { runtime: 'nodejs20', domain: 'api.mysite.com', port: 8080 },
    },
    { iceType: 'Database.PostgreSQL', label: 'App Database', position: { x: 940, y: 300 }, data: { storage: '20', version: '17' } },
  ],
  connections: [
    { fromBlock: 0, toBlock: 1, relationship: 'connects_to', protocol: 'HTTPS', port: 443 },
    { fromBlock: 0, toBlock: 2, relationship: 'connects_to', protocol: 'HTTPS', port: 443 },
    { fromBlock: 2, toBlock: 3, relationship: 'connects_to', protocol: 'HTTP', port: 8080 },
    { fromBlock: 3, toBlock: 4, relationship: 'depends_on', protocol: 'TCP', port: 5432 },
  ],
};

/** API Only: Gateway, API service, and database */
const quickStartApiOnly: ComposedTemplate = {
  id: 'qs-api-only',
  name: 'API Only',
  description: 'Backend API with database — no frontend',
  icon: 'Server',
  estimatedCost: '$30-60/mo',
  category: 'quick-start',
  provider: 'gcp',
  providers: ['gcp', 'aws', 'azure'],
  tags: ['API', 'PostgreSQL'],
  securityLevel: 'basic',
  difficulty: 'starter',
  trust: 'official',
  author: { name: 'ICE Team' },
  environmentPresets: [{ type: 'production', name: 'Production', region: 'us-central1', securityLevel: 'basic' }],
  blocks: [
    { iceType: 'Network.Internet', label: 'Public Traffic', position: { x: 100, y: 200 } },
    { iceType: 'Network.Gateway', label: 'API Gateway', position: { x: 380, y: 200 }, data: { protocol: 'http' } },
    {
      iceType: 'Compute.Container',
      label: 'API Server',
      position: { x: 660, y: 200 },
      data: { runtime: 'nodejs20', domain: 'api.mysite.com', port: 8080 },
    },
    { iceType: 'Database.PostgreSQL', label: 'API Database', position: { x: 940, y: 200 }, data: { storage: '20', version: '17' } },
  ],
  connections: [
    { fromBlock: 0, toBlock: 1, relationship: 'connects_to', protocol: 'HTTPS', port: 443 },
    { fromBlock: 1, toBlock: 2, relationship: 'connects_to', protocol: 'HTTP', port: 8080 },
    { fromBlock: 2, toBlock: 3, relationship: 'depends_on', protocol: 'TCP', port: 5432 },
  ],
};

/** Data Pipeline: Queue, worker, database, and storage */
const quickStartDataPipeline: ComposedTemplate = {
  id: 'qs-data-pipeline',
  name: 'Data Pipeline',
  description: 'Queue-driven processing with storage',
  icon: 'Activity',
  estimatedCost: '$30-70/mo',
  category: 'quick-start',
  provider: 'gcp',
  providers: ['gcp', 'aws', 'azure'],
  tags: ['SQS', 'Worker', 'Storage'],
  securityLevel: 'basic',
  difficulty: 'starter',
  trust: 'official',
  author: { name: 'ICE Team' },
  environmentPresets: [{ type: 'production', name: 'Production', region: 'us-central1', securityLevel: 'basic' }],
  blocks: [
    { iceType: 'Messaging.SQS', label: 'Job Queue', position: { x: 200, y: 200 }, data: { queue_type: 'standard' } },
    { iceType: 'Compute.Worker', label: 'Job Worker', position: { x: 480, y: 200 }, data: { runtime: 'nodejs20' } },
    { iceType: 'Database.PostgreSQL', label: 'Job Database', position: { x: 760, y: 100 }, data: { storage: '20', version: '17' } },
    { iceType: 'Storage.Bucket', label: 'Output Storage', position: { x: 760, y: 300 } },
  ],
  connections: [
    { fromBlock: 0, toBlock: 1, relationship: 'connects_to' },
    { fromBlock: 1, toBlock: 2, relationship: 'depends_on', protocol: 'TCP', port: 5432 },
    { fromBlock: 1, toBlock: 3, relationship: 'depends_on' },
  ],
};

/** Static Site: Jamstack with CDN — simplest possible deploy */
const quickStartStaticSite: ComposedTemplate = {
  id: 'qs-static-site',
  name: 'Static Site',
  description: 'CDN-backed static site — the simplest deploy',
  icon: 'Globe',
  estimatedCost: '$0-5/mo',
  category: 'quick-start',
  provider: 'gcp',
  providers: ['gcp', 'aws', 'azure'],
  tags: ['Static', 'CDN', 'Jamstack'],
  securityLevel: 'basic',
  difficulty: 'starter',
  trust: 'official',
  author: { name: 'ICE Team' },
  environmentPresets: [{ type: 'production', name: 'Production', region: 'us-central1', securityLevel: 'basic' }],
  blocks: [
    { iceType: 'Network.Internet', label: 'Public Traffic', position: { x: 100, y: 200 } },
    {
      iceType: 'Compute.StaticSite',
      label: 'Static Site',
      position: { x: 380, y: 200 },
      data: { framework: 'react', domain: 'mysite.com' },
    },
  ],
  connections: [
    { fromBlock: 0, toBlock: 1, relationship: 'connects_to', protocol: 'HTTPS', port: 443 },
  ],
};

/** Serverless Function: Single function — simplest compute */
const quickStartFunction: ComposedTemplate = {
  id: 'qs-function',
  name: 'Serverless Function',
  description: 'Single serverless function behind an API gateway',
  icon: 'Zap',
  estimatedCost: '$0-10/mo',
  category: 'quick-start',
  provider: 'gcp',
  providers: ['gcp', 'aws', 'azure'],
  tags: ['Serverless', 'Lambda', 'Functions'],
  securityLevel: 'basic',
  difficulty: 'starter',
  trust: 'official',
  author: { name: 'ICE Team' },
  environmentPresets: [{ type: 'production', name: 'Production', region: 'us-central1', securityLevel: 'basic' }],
  blocks: [
    { iceType: 'Network.Internet', label: 'Public Traffic', position: { x: 100, y: 200 } },
    { iceType: 'Network.Gateway', label: 'API Gateway', position: { x: 380, y: 200 }, data: { protocol: 'http' } },
    {
      iceType: 'Compute.ServerlessFunction',
      label: 'Cloud Function',
      position: { x: 660, y: 200 },
      data: { memory: '256', timeout: '30', runtime: 'nodejs22.x' },
    },
  ],
  connections: [
    { fromBlock: 0, toBlock: 1, relationship: 'connects_to', protocol: 'HTTPS', port: 443 },
    { fromBlock: 1, toBlock: 2, relationship: 'connects_to', protocol: 'HTTP' },
  ],
};

/** All quick-start templates */
export const QUICK_STARTS: ComposedTemplate[] = [
  quickStartStaticSite,
  quickStartFunction,
  quickStartWebsiteDb,
  quickStartWebAppApi,
  quickStartApiOnly,
  quickStartDataPipeline,
];
