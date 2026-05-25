import type { SocketSchema } from '../socket-schema';

/**
 * Static site exposes a `dns-in` socket only when the user has opted in
 * to a custom domain; otherwise the block defaults to its provider-
 * managed URL and the DNS socket is hidden.
 */
export const staticSiteSchema: SocketSchema = {
  iceType: 'Compute.StaticSite',
  hide: [
    {
      keys: ['custom_domain', 'domain'],
      when: (data) => !data.custom_domain && !data.domain,
      socketIds: ['dns-in'],
    },
  ],
};
