/**
 * Custom Domain Block
 *
 * Multi-subdomain DNS routing block. Distinct from `Network.PublicEndpoint`
 * (which compiles to a load balancer for VPC-private services). Custom
 * Domain wires a single root domain to one or more publicly-facing
 * services that ALREADY have their own public URL — Firebase Hosting,
 * AWS Amplify, Azure Static Web Apps, public Cloud Run, etc.
 *
 * ## Why it exists
 *
 * Firebase Hosting (and the equivalent on AWS/Azure) gives you a free
 * public URL out of the box plus a built-in custom-domain registration
 * flow. There is no need for a load balancer in front of it. The user
 * just wants to say "point example.com at this site, point api.example.com
 * at that one." That's what this block does.
 *
 * Compare:
 *   - `Network.PublicEndpoint` → load balancer + cert + URL map. Use for
 *     services without their own public ingress (containers in a VPC,
 *     internal Cloud Run, etc.).
 *   - `Network.CustomDomain` → just DNS routing. Use for services that
 *     ARE already public (Firebase Hosting, etc.).
 *
 * ## Data model
 *
 * - `domain`: the root domain (e.g. `example.com`). Required.
 *
 * ## Edge data model
 *
 * Every edge FROM this block to a public-facing target carries an
 * optional `subdomain` field on `edge.data`. Blank = root domain.
 * Each edge defines exactly one host → service mapping.
 *
 * Example:
 *   CustomDomain(example.com) → MarketingSite (Firebase)  edge.subdomain = ''     → example.com
 *   CustomDomain(example.com) → AppDashboard  (Firebase)  edge.subdomain = 'app'  → app.example.com
 *   CustomDomain(example.com) → MarketingBlog (Firebase)  edge.subdomain = 'blog' → blog.example.com
 *
 * ## What it compiles to
 *
 * Nothing on its own — `Network.CustomDomain` is a UI/routing-only block.
 * The translator's Pass 1.6 propagates each `<subdomain>.<domain>` host
 * onto the connected target's `domain` property. Provider handlers
 * (Firebase Hosting in particular) then register that domain through
 * their native custom-domain API and surface the DNS records the user
 * needs to add at their registrar.
 */

import type { BlockBlueprint } from '../../types';

export const customDomainBlueprint: BlockBlueprint = {
  iceType: 'Network.CustomDomain',
  resourceId: 'custom-domain',
  name: 'Custom Domain',
  description:
    'Route a root domain and its subdomains to publicly-facing services. ' +
    'Each outgoing edge carries a subdomain (blank = root). DNS records are ' +
    'surfaced after deploy so you can add them at your registrar.',
  icon: 'Globe',
  category: 'networking',
  providers: ['gcp', 'aws', 'azure'],
  nodeData: {
    iceType: 'Network.CustomDomain',
    behavior: 'connector',
    label: 'Custom Domain',
    // Root domain. The translator combines this with the per-edge
    // `subdomain` field to produce the full host (e.g. 'example.com',
    // 'api.example.com').
    domain: '',
    // Route slots — each row in the canvas node is one of these. Users
    // add a route, type a subdomain, then drag from the row's port to
    // a target service. Edges from this block carry `data.routeId`
    // referencing the route here, and the translator looks up the
    // subdomain by id at deploy time. Empty subdomain = root domain.
    //
    // The block starts with a single empty route so the user has
    // something to connect from immediately after dropping the block.
    routes: [{ id: 'route-default', subdomain: '' }] as Array<{ id: string; subdomain: string }>,
  },
};
