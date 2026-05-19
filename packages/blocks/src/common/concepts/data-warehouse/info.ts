import { defineSnippets } from '../_shared/code-snippets';
import type { InfoContent } from '../_shared/types';

export const dataWarehouseInfo: InfoContent = {
  overview: {
    markdown: `
# Data Warehouse

A columnar analytics database optimized for aggregating large volumes of data.
Run BI dashboards, run cohort analyses, train ML models off the same store
your application doesn't query at request time.

## When to use

- Slow analytical queries over millions to billions of rows
- BI / dashboarding (Looker, Metabase, Mode, Tableau)
- Centralized data lakehouse — events streamed from your app, joined with
  CRM / billing / product analytics

## When NOT to use

- OLTP request-path traffic → use **Postgres** / **MySQL**
- Cache-tier point lookups → use **Redis Cache**
- Document store / flexible schema → use **MongoDB**
- Embeddings / similarity search → use **Vector DB**

## Pricing models

Each provider exposes one of two billing shapes:

- **On-demand / per-TB-scanned** (BigQuery, Athena-mode Redshift): cheap to
  start, expensive at scale. Great for sporadic analytics.
- **Provisioned cluster / flat-rate** (Redshift, Synapse, BigQuery editions):
  predictable monthly cost, more efficient under sustained load.

The compute size dropdown picks one or the other per provider.
    `.trim(),
    markdownZh: `
# 数据仓库

针对大规模数据聚合而优化的列式分析数据库。基于同一份存储跑 BI 仪表盘、做用户队列分析、训练 ML 模型 — 而您的应用在请求路径上不会查询它。

## 适用场景

- 在百万到十亿级行数上的慢速分析查询
- BI / 仪表盘(Looker、Metabase、Mode、Tableau)
- 集中式 data lakehouse — 来自应用的事件流,与 CRM / 计费 / 产品分析数据连接

## 不适用场景

- OLTP 请求路径流量 → 使用 **Postgres** / **MySQL**
- 缓存层点查 → 使用 **Redis 缓存**
- 文档存储 / 灵活模式 → 使用 **MongoDB**
- 向量嵌入 / 相似度搜索 → 使用 **Vector DB**

## 计费模型

每家服务商提供以下两种计费形式之一:

- **按需 / 按扫描 TB 计费**(BigQuery、Athena 模式的 Redshift):起步便宜,规模一大就贵。适合零散的分析查询。
- **预置集群 / 包年包月**(Redshift、Synapse、BigQuery editions):月度成本可预测,在持续负载下效率更高。

计算规模下拉框会按服务商选择其中一种。
    `.trim(),
  },
  compilesTo: {
    aws: [
      { name: 'Redshift Cluster', type: 'aws_redshift_cluster' },
      { name: 'Subnet Group', type: 'aws_redshift_subnet_group', optional: true },
    ],
    gcp: [
      { name: 'BigQuery Dataset', type: 'google_bigquery_dataset' },
      { name: 'BigQuery Reservation', type: 'google_bigquery_reservation', optional: true },
    ],
    azure: [
      { name: 'Synapse Workspace', type: 'azurerm_synapse_workspace' },
      { name: 'SQL Pool', type: 'azurerm_synapse_sql_pool', optional: true },
    ],
  },
  snippets: defineSnippets({
    ts: `// BigQuery via @google-cloud/bigquery
import { BigQuery } from '@google-cloud/bigquery';
const bq = new BigQuery();
const [rows] = await bq.query({
  query: 'SELECT user_id, COUNT(*) AS hits FROM events.requests WHERE day = CURRENT_DATE() GROUP BY user_id',
});`,
    py: `# Redshift via psycopg
import psycopg
with psycopg.connect(os.environ['REDSHIFT_DSN']) as conn:
    rows = conn.execute(
        'SELECT product_id, SUM(amount) FROM orders WHERE day = CURRENT_DATE GROUP BY product_id'
    ).fetchall()`,
    go: `// BigQuery via cloud.google.com/go/bigquery
client, _ := bigquery.NewClient(ctx, projectID)
q := client.Query("SELECT id, COUNT(*) FROM events.signup GROUP BY id")
it, _ := q.Read(ctx)
for {
    var row struct { ID string; Count int64 }
    if err := it.Next(&row); err == iterator.Done { break }
}`,
  }),
  links: [
    { label: 'AWS Redshift', url: 'https://docs.aws.amazon.com/redshift/' },
    { label: 'Google BigQuery', url: 'https://cloud.google.com/bigquery/docs' },
    { label: 'Azure Synapse', url: 'https://learn.microsoft.com/en-us/azure/synapse-analytics/' },
  ],
  linksZh: ['AWS Redshift', 'Google BigQuery', 'Azure Synapse'],
  relatedConcepts: ['Database.PostgreSQL', 'Storage.ObjectStorage', 'Compute.Container'],
};
