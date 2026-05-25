import type { SocketSchema } from '../socket-schema';

/**
 * Scalable backend (`Compute.Container`) gains a `pipeline-in` socket
 * only when the user has connected/configured a repository — until then,
 * the pipeline socket is noise. Similarly a `dns-in` socket appears only
 * when the block is set to receive public traffic via a domain.
 *
 * `hide` removes the default pipeline-in derived from `Repo → Service`
 * when no repository is configured, so the block doesn't dangle an
 * unused socket.
 */
export const scalableBackendSchema: SocketSchema = {
  iceType: 'Compute.Container',
  hide: [
    {
      keys: ['repository'],
      when: (data) => !data.repository,
      socketIds: ['pipeline-in'],
    },
    {
      keys: ['domain', 'custom_domain'],
      when: (data) => !data.domain && !data.custom_domain,
      socketIds: ['dns-in'],
    },
  ],
};
