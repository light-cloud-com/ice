import type { PortDef, PortSchema } from '../types';

function dbBase(label = 'Database', shape: PortDef['shape'] = 'circle'): PortDef[] {
  return [
    {
      id: 'db-out',
      direction: 'out',
      role: 'database',
      label,
      side: 'right',
      shape,
      peerStyle: 'Database',
    },
  ];
}

/** Database.PostgreSQL — provides a database connection; gains `replica-out` when replication is enabled. */
export const databasePostgresSchema: PortSchema = {
  iceType: 'Database.PostgreSQL',
  base: dbBase('Database (Postgres)'),
};

export const databaseMysqlSchema: PortSchema = {
  iceType: 'Database.MySQL',
  base: dbBase('Database (MySQL)'),
};

export const databaseMongoSchema: PortSchema = {
  iceType: 'Database.MongoDB',
  base: dbBase('Database (Mongo)'),
};

export const databaseRedisSchema: PortSchema = {
  iceType: 'Database.Redis',
  base: [
    {
      id: 'cache-out',
      direction: 'out',
      role: 'cache',
      label: 'Cache (Redis)',
      side: 'right',
      shape: 'circle',
      peerStyle: 'Database',
    },
  ],
};

export const storageBucketSchema: PortSchema = {
  iceType: 'Storage.Bucket',
  base: [
    {
      id: 'storage-out',
      direction: 'out',
      role: 'storage',
      label: 'Object storage',
      side: 'right',
      shape: 'circle',
      peerStyle: 'Storage',
    },
  ],
};
