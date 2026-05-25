import type { SocketSchema } from '../socket-schema';

/**
 * Postgres exposes a read-only replica output ONLY when the user has
 * turned on replication in the properties panel. Without it, the socket
 * is absent and edges that previously attached to it enter the dangling
 * state until cleaned up.
 *
 * `base` is empty — the default derivation already produces the standard
 * traffic-in (Backend → Database) and config-out (env-var injection)
 * sockets from `CONNECTION_RULES`. The schema only adds the conditional.
 */
export const postgresSchema: SocketSchema = {
  iceType: 'Database.PostgreSQL',
  conditional: [
    {
      keys: ['replication'],
      when: (data) => data.replication === true,
      sockets: [
        {
          id: 'replica-out',
          side: 'right',
          category: 'traffic',
          direction: 'out',
          label: 'Read replica',
          shape: 'circle',
          // Replica-out peers with backends/services that read it — color by Compute.
          peerStyle: 'Compute',
        },
      ],
    },
  ],
};
