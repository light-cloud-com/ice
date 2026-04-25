import { defineSnippets } from '../_shared/code-snippets';
import type { InfoContent } from '../_shared/types';

export const postgresInfo: InfoContent = {
  overview: {
    markdown: `
# Postgres

Managed PostgreSQL. The default relational database for most apps — SQL,
transactions, JSON columns, strong constraints, full-text search.

## When to use

- Any app that needs a real relational database
- Multi-row transactions, foreign keys, joins
- Mixed relational + document data (JSONB columns)

## When NOT to use

- Sub-millisecond lookups → **Redis Cache** in front of Postgres
- Massive document store → **MongoDB**
- Embeddings / vector search → **Vector DB**
- Analytics warehouses → a specialized warehouse (deferred from this palette)

## Backups

Managed providers handle daily backups automatically. PITR (point-in-time
recovery) is typically available on larger tiers.
    `.trim(),
  },
  compilesTo: {
    aws: [
      { name: 'RDS Postgres Instance', type: 'aws_db_instance' },
      { name: 'DB Subnet Group', type: 'aws_db_subnet_group', optional: true },
      { name: 'Security Group', type: 'aws_security_group' },
    ],
    gcp: [
      { name: 'Cloud SQL Postgres Instance', type: 'google_sql_database_instance' },
      { name: 'Database', type: 'google_sql_database' },
    ],
    azure: [{ name: 'Azure Database for PostgreSQL Flexible Server', type: 'azurerm_postgresql_flexible_server' }],
  },
  snippets: defineSnippets({
    ts: `// node-postgres
import { Pool } from 'pg';
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const result = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);`,
    py: `# psycopg with connection pooling
import psycopg
with psycopg.connect(os.environ['DATABASE_URL']) as conn:
    rows = conn.execute('SELECT * FROM users WHERE id = %s', (user_id,)).fetchall()`,
    go: `import (
    "database/sql"
    _ "github.com/lib/pq"
)
db, _ := sql.Open("postgres", os.Getenv("DATABASE_URL"))
rows, _ := db.Query("SELECT * FROM users WHERE id = $1", userID)`,
  }),
  links: [
    { label: 'PostgreSQL docs', url: 'https://www.postgresql.org/docs/' },
    { label: 'AWS RDS Postgres', url: 'https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/CHAP_PostgreSQL.html' },
    { label: 'GCP Cloud SQL', url: 'https://cloud.google.com/sql/docs/postgres' },
  ],
  relatedConcepts: ['Database.Redis', 'Compute.Container', 'Security.SecretStore'],
};
