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
  relatedConcepts: ['Database.PostgreSQL', 'Storage.ObjectStorage', 'Compute.Container'],
};
