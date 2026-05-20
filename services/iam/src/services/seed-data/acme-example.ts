/**
 * ACME Example — first-launch seed project
 *
 * The "what does a real SaaS look like in ICE" demo that gets seeded
 * into a fresh workspace and on reset. Generic enough to drop any
 * SaaS into without renaming much.
 *
 * This is NOT a user-visible template — it lives under the iam
 * service's seed-data and is consumed only by `seed-demo.service.ts`.
 * We re-use the `ComposedTemplate` shape from `@ice/templates` so the
 * same expansion engine (`expandComposedTemplate`) that powers the
 * gallery also produces the seed card's nodes + edges, without
 * surfacing the composition in the template gallery.
 *
 * IMPORTANT — every group iceType must be a real palette container.
 * `Network.PrivateNetwork` (behavior: 'container' with ingress/egress
 * controls) wraps the backend; `Group.Custom` is the user-facing
 * generic group block. Both render the right properties panel — never
 * fabricate a `Group.Frontend` subtype that isn't in the palette,
 * because the renderer falls back to placeholder UI.
 *
 * IMPORTANT — every `block.data` field below must already be in the
 * matching blueprint's `nodeData(Defaults)`. Renderers expect those
 * shapes — e.g. env-config's `variables` is `[{key, value}]`, not a
 * map. Passing a wrong shape crashes the canvas with `.map is not a
 * function`. When adding a new block, copy the blueprint's
 * `nodeData(Defaults)` first, override only what you need.
 *
 * Layout:
 *
 *   Custom Domain (ungrouped):
 *     [acme.com]
 *
 *   Frontend group (Group.Custom):
 *     [Main repo]  [Blog repo]  [App repo]
 *     [Main site]  [Blog site]  [App site]
 *
 *   Private Network (Network.PrivateNetwork):
 *     [Env Variables]
 *     [Users Service]  [Orders Service]
 *     [Users DB]       [Orders DB]
 *
 *   Observability (ungrouped):
 *     [Logs]
 *
 * Block indices:
 *   0  acme.com (Custom Domain)
 *   1  Main static site
 *   2  Main GitHub repo
 *   3  Blog static site
 *   4  Blog GitHub repo
 *   5  App static site
 *   6  App GitHub repo
 *   7  Users Service (container)
 *   8  Orders Service (container)
 *   9  Users PostgreSQL
 *   10 Orders PostgreSQL
 *   11 Env Variables
 *   12 Logs
 */

import type { ComposedTemplate } from '@ice/templates';

export const acmeExampleSeed: ComposedTemplate = {
  id: 'acme-example',
  name: 'ACME Example',
  description:
    'Generic SaaS scaffold — multi-subdomain frontend + private-network microservices with PostgreSQL. GCP-ready.',
  icon: 'Sparkles',
  estimatedCost: '$60-150/mo',
  category: 'saas',
  provider: 'gcp',
  providers: ['gcp'],
  tags: ['SaaS', 'Microservices', 'PostgreSQL', 'Custom Domain', 'Multi-site'],
  securityLevel: 'standard',
  difficulty: 'intermediate',
  trust: 'official',
  featured: false,
  author: { name: 'ICE Team' },
  environmentPresets: [{ type: 'production', name: 'Production', region: 'us-central1', securityLevel: 'standard' }],

  groups: [
    // [0] Frontend — generic Group.Custom wrapping the 3 sites + 3 repos.
    // Keeps the multi-site fan-out visually contained without claiming any
    // network semantics (it's just a visual group on the canvas).
    {
      subtype: 'Custom',
      iceType: 'Group.Custom',
      label: 'Frontend',
      position: { x: 30, y: 180 },
      width: 880,
      height: 420,
      blockIndices: [1, 2, 3, 4, 5, 6],
      color: '#3b82f6',
    },
    // [1] Private Network — real container block whose blueprint defines
    // behavior: 'container' along with ingress / egress / allowlists /
    // groupOpacity. The expander merges those defaults into the container
    // node so the properties panel shows the real network controls.
    {
      subtype: 'Custom',
      iceType: 'Network.PrivateNetwork',
      label: 'Private Network',
      position: { x: 30, y: 660 },
      width: 920,
      height: 540,
      blockIndices: [7, 8, 9, 10, 11],
      color: '#dc2626',
    },
  ],

  blocks: [
    // ── Custom Domain (ungrouped) ─────────────────────────────────────────
    // 0: Custom Domain — three routes (root / blog / app).
    {
      iceType: 'Network.CustomDomain',
      label: 'acme.com',
      position: { x: 50, y: 60 },
      data: {
        domain: 'acme.com',
        routes: [
          { id: 'route-main', subdomain: '' },
          { id: 'route-blog', subdomain: 'blog' },
          { id: 'route-app', subdomain: 'app' },
        ],
      },
    },

    // ── Frontend group children ──────────────────────────────────────────
    // 1: Main static site
    {
      iceType: 'Compute.StaticSite',
      label: 'Main Website',
      position: { x: 50, y: 400 },
      data: {
        domain: 'acme.com',
        framework: 'nextjs',
        buildCommand: 'pnpm build',
        outputDir: 'out',
      },
    },
    // 2: Main GitHub repo
    {
      iceType: 'Source.Repository',
      label: 'acme/website',
      position: { x: 50, y: 240 },
      data: {
        repository: 'acme/website',
        branch: 'main',
        autoDeploy: true,
      },
    },
    // 3: Blog static site
    {
      iceType: 'Compute.StaticSite',
      label: 'Blog',
      position: { x: 340, y: 400 },
      data: {
        domain: 'blog.acme.com',
        framework: 'astro',
        buildCommand: 'pnpm build',
        outputDir: 'dist',
      },
    },
    // 4: Blog GitHub repo
    {
      iceType: 'Source.Repository',
      label: 'acme/blog',
      position: { x: 340, y: 240 },
      data: {
        repository: 'acme/blog',
        branch: 'main',
        autoDeploy: true,
      },
    },
    // 5: App static site
    {
      iceType: 'Compute.StaticSite',
      label: 'App',
      position: { x: 630, y: 400 },
      data: {
        domain: 'app.acme.com',
        framework: 'vite',
        buildCommand: 'pnpm build',
        outputDir: 'dist',
      },
    },
    // 6: App GitHub repo
    {
      iceType: 'Source.Repository',
      label: 'acme/app',
      position: { x: 630, y: 240 },
      data: {
        repository: 'acme/app',
        branch: 'main',
        autoDeploy: true,
      },
    },

    // ── Private Network children ──────────────────────────────────────────
    // 7: Users Service
    {
      iceType: 'Compute.Container',
      label: 'Users Service',
      position: { x: 50, y: 870 },
      data: {
        runtime: 'node20',
        port: 8080,
        size: '0.5-1024',
        minInstances: 1,
        maxInstances: 10,
      },
    },
    // 8: Orders Service
    {
      iceType: 'Compute.Container',
      label: 'Orders Service',
      position: { x: 340, y: 870 },
      data: {
        runtime: 'node20',
        port: 8081,
        size: '0.5-1024',
        minInstances: 1,
        maxInstances: 10,
      },
    },
    // 9: Users PostgreSQL
    {
      iceType: 'Database.PostgreSQL',
      label: 'Users DB',
      position: { x: 50, y: 1040 },
      data: {
        version: '15',
        tier: 'small',
        storageGb: 20,
        backups: true,
      },
    },
    // 10: Orders PostgreSQL
    {
      iceType: 'Database.PostgreSQL',
      label: 'Orders DB',
      position: { x: 340, y: 1040 },
      data: {
        version: '15',
        tier: 'small',
        storageGb: 20,
        backups: true,
      },
    },
    // 11: Env Variables — `variables` is [{key, value}].
    {
      iceType: 'Config.Environment',
      label: 'Env Variables',
      position: { x: 630, y: 870 },
      data: {
        variables: [
          { key: 'NODE_ENV', value: 'production' },
          { key: 'DATABASE_POOL_SIZE', value: '20' },
          { key: 'CORS_ORIGIN', value: 'https://acme.com' },
          { key: 'JWT_AUDIENCE', value: 'acme.com' },
        ],
      },
    },

    // ── Observability — single log block, ungrouped ───────────────────────
    // 12: Logs
    {
      iceType: 'Monitoring.Log',
      label: 'Logs',
      position: { x: 50, y: 1280 },
      data: {
        retentionDays: 30,
      },
    },
  ],

  connections: [
    // Domain fans out to all 3 frontends
    { fromBlock: 0, toBlock: 1, relationship: 'connects_to', protocol: 'HTTPS', port: 443 },
    { fromBlock: 0, toBlock: 3, relationship: 'connects_to', protocol: 'HTTPS', port: 443 },
    { fromBlock: 0, toBlock: 5, relationship: 'connects_to', protocol: 'HTTPS', port: 443 },

    // Each static site sources from its GitHub repo
    { fromBlock: 2, toBlock: 1, relationship: 'connects_to' },
    { fromBlock: 4, toBlock: 3, relationship: 'connects_to' },
    { fromBlock: 6, toBlock: 5, relationship: 'connects_to' },

    // Each service → its own database
    { fromBlock: 7, toBlock: 9, relationship: 'depends_on', protocol: 'TCP', port: 5432 },
    { fromBlock: 8, toBlock: 10, relationship: 'depends_on', protocol: 'TCP', port: 5432 },

    // Services → shared env variables
    { fromBlock: 7, toBlock: 11, relationship: 'depends_on' },
    { fromBlock: 8, toBlock: 11, relationship: 'depends_on' },

    // Services → logs
    { fromBlock: 7, toBlock: 12, relationship: 'connects_to' },
    { fromBlock: 8, toBlock: 12, relationship: 'connects_to' },
  ],
};
