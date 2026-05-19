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
    markdownZh: `
# MySQL

托管的 MySQL。成熟、久经考验、广泛支持。如果您的应用 / 框架默认使用 MySQL(WordPress、旧版 Rails、PHP 技术栈),请选择此项。

## 与 Postgres 的对比

- 您的技术栈预期使用 MySQL
- 您需要 MySQL 特有的功能(复制拓扑、特定存储引擎)

否则,**Postgres** 是功能更丰富的默认选择。
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
  linksZh: ['MySQL 文档'],
  relatedConcepts: ['Database.PostgreSQL', 'Database.Redis'],
};
