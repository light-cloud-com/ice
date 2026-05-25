import type { PortSchema } from '../types';

/**
 * Network.CustomDomain — one `domain-out` socket PER ROUTE.
 *
 * The block stores `data.routes: Array<{ id, subdomain }>`. Each route
 * is a distinct subdomain the user has configured (e.g. `api`,
 * `admin`, `app`) — and each gets its own typed socket so the user
 * can wire each subdomain to a different downstream service. Matches
 * the multi-port story of `Compute.Container` with `exposed_ports`.
 *
 * The base `domain-out` is the fallback for an unconfigured block
 * (no routes yet) so the user can still wire the root domain. When
 * any route exists, the fallback is hidden — only per-route sockets
 * show, identifying which subdomain is being wired.
 */
export const networkCustomDomainSchema: PortSchema = {
  iceType: 'Network.CustomDomain',
  base: [
    {
      id: 'domain-out',
      direction: 'out',
      role: 'domain',
      label: 'Custom domain',
      side: 'right',
      shape: 'square',
      peerStyle: 'Network',
      peerKind: 'service',
    },
  ],
  hide: [
    {
      keys: ['routes'],
      when: (data) => Array.isArray(data.routes) && (data.routes as Array<{ id: string }>).length > 0,
      portIds: ['domain-out'],
    },
  ],
  dynamic: (data) => {
    const routes = (data.routes as Array<{ id: string; subdomain: string }> | undefined) ?? [];
    return routes.map((r) => ({
      id: `domain-out-${r.id}`,
      direction: 'out' as const,
      role: 'domain' as const,
      // Label uses the subdomain when set so the tooltip + properties
      // panel both read as the same name the user typed.
      label: r.subdomain ? r.subdomain : 'Subdomain',
      side: 'right' as const,
      shape: 'square' as const,
      peerStyle: 'Network',
      peerKind: 'service' as const,
      removable: true,
    }));
  },
};

/**
 * Network.Gateway — exposes an `http-endpoint-out` (the gateway's public
 * URL) and consumes an `http-endpoint-in` (the backend it routes to).
 * Also accepts a `domain-in` so a custom domain can target the gateway.
 */
export const networkGatewaySchema: PortSchema = {
  iceType: 'Network.Gateway',
  base: [
    {
      id: 'domain-in',
      direction: 'in',
      role: 'domain',
      label: 'Custom domain',
      property: 'custom_domain',
      side: 'left',
      shape: 'square',
      peerStyle: 'Network',
    },
    {
      id: 'upstream-in',
      direction: 'in',
      role: 'http-endpoint',
      label: 'Backend',
      side: 'left',
      shape: 'circle',
      peerStyle: 'Compute',
    },
    {
      id: 'public-out',
      direction: 'out',
      role: 'http-endpoint',
      label: 'Public URL (HTTPS)',
      port: 443,
      protocol: 'https',
      side: 'right',
      shape: 'circle',
      peerStyle: 'Network',
    },
  ],
};

/**
 * Network.PrivateNetwork — pure container. No ports; children attach via
 * parentId. The schema is here for completeness so the registry's
 * iceType lookup is total.
 */
export const networkPrivateNetworkSchema: PortSchema = {
  iceType: 'Network.PrivateNetwork',
  base: [],
};
