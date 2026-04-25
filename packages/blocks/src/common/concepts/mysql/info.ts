import type { InfoContent } from '../_shared/types';

export const mysqlInfo: InfoContent = {
  overview: {
    markdown: `
# MySQL

Managed MySQL. Mature, battle-tested, broadly supported. Pick this if your
app/framework expects MySQL (WordPress, older Rails, PHP stacks).

## When to use vs Postgres

- Your stack expects MySQL
- You need MySQL-specific features (replication topologies, specific storage engines)

Otherwise **Postgres** is a more feature-rich default.
    `.trim(),
  },
  compilesTo: {
    aws: [
      { name: 'RDS MySQL Instance', type: 'aws_db_instance' },
      { name: 'Security Group', type: 'aws_security_group' },
    ],
    gcp: [
      { name: 'Cloud SQL MySQL Instance', type: 'google_sql_database_instance' },
      { name: 'Database', type: 'google_sql_database' },
    ],
    azure: [{ name: 'MySQL Flexible Server', type: 'azurerm_mysql_flexible_server' }],
  },
  links: [{ label: 'MySQL docs', url: 'https://dev.mysql.com/doc/' }],
  relatedConcepts: ['Database.PostgreSQL', 'Database.Redis'],
};
