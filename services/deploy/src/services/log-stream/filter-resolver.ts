/**
 * Cloud Logging filter resolver.
 *
 * Pure module — given a canvas source-node iceType plus its deployed GCP
 * resource, return the GCP Cloud Logging "advanced" filter string the LT-3
 * streamer should pass to `entries.list` / `tailLogEntries`.
 *
 * No I/O. No SDK calls. Strings in, strings out. The caller is responsible
 * for adding the timestamp predicate (cursor) and any severity filtering;
 * v1 of the Log Terminal block does not expose level filtering.
 *
 * GCP-only for v1. AWS/Azure resolvers come later.
 */

export interface ResourceMappingEntry {
  /** GCP-side resource name (e.g. Cloud Run service name, Cloud SQL instance name). */
  name: string;
  /**
   * GCP resource type identifier as ICE writes it in `deployedResourceMapping`,
   * e.g. 'gcp.run.service', 'gcp.cloudfunctions.function'. Currently unused
   * by the resolver (we switch on `iceType`) but carried through so callers
   * can pass the mapping row unchanged.
   */
  type: string;
}

export interface SourceContext {
  /** ICE iceType of the source node (the thing the user wired their Log block to). */
  iceType: string;
  resource: ResourceMappingEntry;
  /** GCP project id from the canvas environment. */
  projectId: string;
  /**
   * Region for the deployed resource. Required-ish for `cloud_run_revision`
   * and `redis_instance` filters; the broader filter (no location label) is
   * still correct when omitted.
   */
  region?: string;
}

export interface ResolvedFilter {
  /** The advanced filter string passed to entries.list / tailLogEntries. */
  filter: string;
  /** Optional human-readable notes the panel surfaces above the log feed. */
  caveats?: string[];
}

const SERVERLESS_FUNCTION_CAVEAT = 'Cloud Functions v1 (legacy) is not supported.';
const MONGODB_GCE_CAVEAT =
  'MongoDB on GCE — only host-level VM logs are available; the MongoDB process does not emit to Cloud Logging.';

/**
 * Returns the Cloud Logging filter for the given source, or `null` if the
 * iceType is not supported (the panel will surface `unsupported-source`).
 *
 * Filter ordering is deterministic: `resource.type` first, then the primary
 * label (`service_name` / `job_name` / `instance_id` / `database_id`), then
 * `location` / `region` if applicable. Stable ordering keeps the LT-3 cursor
 * logic simple — the streamer can compare filter strings as identity.
 */
export function resolveLogFilter(ctx: SourceContext): ResolvedFilter | null {
  const { iceType, resource, projectId, region } = ctx;

  switch (iceType) {
    case 'Compute.Container':
    case 'Compute.SsrSite': {
      return {
        filter: cloudRunRevisionFilter(resource.name, region),
      };
    }

    case 'Compute.ServerlessFunction': {
      // Cloud Functions v2 runs on Cloud Run under the hood. v1 (legacy)
      // emits to a different resource type (`cloud_function`) and is not
      // supported in v1 of the Log Terminal block.
      return {
        filter: cloudRunRevisionFilter(resource.name, region),
        caveats: [SERVERLESS_FUNCTION_CAVEAT],
      };
    }

    case 'Compute.Worker': {
      return {
        filter: cloudRunJobFilter(resource.name, region),
      };
    }

    case 'Compute.StaticSite': {
      // Dropped per R2 — Firebase Hosting v1 sites typically emit zero
      // Cloud Logging entries; promising live tail there would be a false
      // advertisement. The frontend surfaces `unsupported-source`.
      return null;
    }

    case 'Database.PostgreSQL':
    case 'Database.MySQL': {
      return {
        filter: cloudSqlDatabaseFilter(projectId, resource.name),
      };
    }

    case 'Database.Redis': {
      return {
        filter: redisInstanceFilter(resource.name, region),
      };
    }

    case 'Database.MongoDB': {
      // The deployer puts MongoDB on a GCE instance, so only host-level
      // instance logs are available — the MongoDB daemon does not write
      // to Cloud Logging by default.
      return {
        filter: gceInstanceFilter(resource.name),
        caveats: [MONGODB_GCE_CAVEAT],
      };
    }

    default:
      return null;
  }
}

function cloudRunRevisionFilter(serviceName: string, region: string | undefined): string {
  const parts = [
    'resource.type="cloud_run_revision"',
    `resource.labels.service_name="${serviceName}"`,
  ];
  if (region) {
    parts.push(`resource.labels.location="${region}"`);
  }
  return parts.join(' AND ');
}

function cloudRunJobFilter(jobName: string, region: string | undefined): string {
  const parts = [
    'resource.type="cloud_run_job"',
    `resource.labels.job_name="${jobName}"`,
  ];
  if (region) {
    parts.push(`resource.labels.location="${region}"`);
  }
  return parts.join(' AND ');
}

function cloudSqlDatabaseFilter(projectId: string, instanceName: string): string {
  // GCP convention: database_id is `<projectId>:<instanceName>`. Don't
  // double-prefix; the caller already knows the project from the canvas
  // environment.
  return [
    'resource.type="cloudsql_database"',
    `resource.labels.database_id="${projectId}:${instanceName}"`,
  ].join(' AND ');
}

function redisInstanceFilter(instanceName: string, region: string | undefined): string {
  const parts = [
    'resource.type="redis_instance"',
    `resource.labels.instance_id="${instanceName}"`,
  ];
  if (region) {
    parts.push(`resource.labels.region="${region}"`);
  }
  return parts.join(' AND ');
}

function gceInstanceFilter(instanceName: string): string {
  return [
    'resource.type="gce_instance"',
    `resource.labels.instance_id="${instanceName}"`,
  ].join(' AND ');
}
