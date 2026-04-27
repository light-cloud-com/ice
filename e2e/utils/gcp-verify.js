/**
 * GCP Verification Utilities
 *
 * Uses gcloud CLI to verify deployed resources actually exist in Google Cloud.
 * Called after deploy tests to confirm resources were created/destroyed.
 */
import { execSync } from 'child_process';
function runGcloud(args) {
    try {
        const output = execSync(`gcloud ${args} --format=json`, {
            encoding: 'utf-8',
            timeout: 30000,
            stdio: ['pipe', 'pipe', 'pipe'],
        });
        const resource = JSON.parse(output);
        return { exists: true, resource, error: null };
    }
    catch (err) {
        const stderr = err.stderr?.toString() || err.message;
        if (stderr.includes('NOT_FOUND') || stderr.includes('was not found') || stderr.includes('could not be found')) {
            return { exists: false, resource: null, error: null };
        }
        return { exists: false, resource: null, error: stderr };
    }
}
/**
 * Verify a Cloud Run service exists.
 */
export function verifyCloudRunService(project, region, name) {
    return runGcloud(`run services describe ${name} --project=${project} --region=${region}`);
}
/**
 * Verify a Cloud Run service URL is reachable.
 */
export function verifyCloudRunReachable(url) {
    try {
        const output = execSync(`curl -s -o /dev/null -w "%{http_code}" ${url}`, {
            encoding: 'utf-8',
            timeout: 15000,
        });
        const status = parseInt(output.trim(), 10);
        return { status, ok: status >= 200 && status < 400 };
    }
    catch {
        return { status: 0, ok: false };
    }
}
/**
 * Verify a Cloud Storage bucket exists.
 */
export function verifyStorageBucket(name) {
    return runGcloud(`storage buckets describe gs://${name}`);
}
/**
 * Verify a Pub/Sub topic exists.
 */
export function verifyPubSubTopic(project, name) {
    return runGcloud(`pubsub topics describe ${name} --project=${project}`);
}
/**
 * Verify a Secret Manager secret exists.
 */
export function verifySecret(project, name) {
    return runGcloud(`secrets describe ${name} --project=${project}`);
}
/**
 * Verify a Cloud SQL instance exists.
 */
export function verifyCloudSqlInstance(project, name) {
    return runGcloud(`sql instances describe ${name} --project=${project}`);
}
/**
 * Verify a Firestore database exists.
 */
export function verifyFirestoreDatabase(project, name) {
    return runGcloud(`firestore databases describe --database=${name} --project=${project}`);
}
/**
 * Verify a Cloud Function exists.
 */
export function verifyCloudFunction(project, region, name) {
    return runGcloud(`functions describe ${name} --project=${project} --region=${region}`);
}
/**
 * Verify a BigQuery dataset exists.
 */
export function verifyBigQueryDataset(project, name) {
    return runGcloud(`bq show --project_id=${project} ${name} 2>/dev/null`);
}
/**
 * List all Cloud Run services in a project/region.
 */
export function listCloudRunServices(project, region) {
    try {
        const output = execSync(`gcloud run services list --project=${project} --region=${region} --format="value(name)"`, {
            encoding: 'utf-8',
            timeout: 30000,
        });
        return output.trim().split('\n').filter(Boolean);
    }
    catch {
        return [];
    }
}
/**
 * Get recent Cloud Run logs for a service.
 */
export function getCloudRunLogs(project, serviceName, limit = 20) {
    try {
        const output = execSync(`gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=${serviceName}" --project=${project} --limit=${limit} --format=json`, { encoding: 'utf-8', timeout: 30000 });
        return JSON.parse(output);
    }
    catch {
        return [];
    }
}
// ─── Additional Resource Verifiers ─────────────────────────────────────────
/**
 * Verify a Cloud Run job exists.
 */
export function verifyCloudRunJob(project, region, name) {
    return runGcloud(`run jobs describe ${name} --project=${project} --region=${region}`);
}
/**
 * Verify a Cloud Run domain mapping exists.
 */
export function verifyCloudRunDomainMapping(project, region, name) {
    return runGcloud(`run domain-mappings describe --domain=${name} --project=${project} --region=${region}`);
}
/**
 * Verify a Pub/Sub subscription exists.
 */
export function verifyPubSubSubscription(project, name) {
    return runGcloud(`pubsub subscriptions describe ${name} --project=${project}`);
}
/**
 * Verify a Memorystore Redis instance exists.
 */
export function verifyRedisInstance(project, region, name) {
    return runGcloud(`redis instances describe ${name} --project=${project} --region=${region}`);
}
/**
 * Verify a GKE cluster exists.
 */
export function verifyGKECluster(project, region, name) {
    return runGcloud(`container clusters describe ${name} --project=${project} --region=${region}`);
}
/**
 * Verify a Cloud Scheduler job exists.
 */
export function verifyCloudSchedulerJob(project, region, name) {
    return runGcloud(`scheduler jobs describe ${name} --project=${project} --location=${region}`);
}
/**
 * Verify an API Gateway exists.
 */
export function verifyApiGateway(project, name) {
    return runGcloud(`api-gateway apis describe ${name} --project=${project}`);
}
/**
 * Verify Identity Platform is configured.
 */
export function verifyIdentityPlatform(project) {
    return runGcloud(`identity-platform config describe --project=${project}`);
}
/**
 * Verify a Compute forwarding rule exists.
 */
export function verifyComputeForwardingRule(project, name) {
    return runGcloud(`compute forwarding-rules describe ${name} --project=${project} --global`);
}
/**
 * Verify a Cloud Logging sink exists.
 */
export function verifyLoggingSink(project, name) {
    return runGcloud(`logging sinks describe ${name} --project=${project}`);
}
/**
 * Verify a Vertex AI endpoint exists.
 */
export function verifyVertexAIEndpoint(project, region, name) {
    return runGcloud(`ai endpoints describe ${name} --project=${project} --region=${region}`);
}
/**
 * Verify a Vertex AI index exists.
 */
export function verifyVertexAIIndex(project, region, name) {
    return runGcloud(`ai indexes describe ${name} --project=${project} --region=${region}`);
}
/**
 * Verify a Discovery Engine search engine exists.
 */
export function verifyDiscoveryEngine(project, name) {
    return runGcloud(`discovery-engine engines describe ${name} --project=${project} --location=global`);
}
/**
 * Verify a Dataflow job exists.
 */
export function verifyDataflowJob(project, region, name) {
    return runGcloud(`dataflow jobs list --project=${project} --region=${region} --filter="name=${name}" --limit=1`);
}
// ─── Universal Resource Dispatcher ─────────────────────────────────────────
/**
 * Verify any GCP resource by dispatching to the correct verifier based on iceType.
 */
export function verifyGCPResource(project, region, resource) {
    const { name, type } = resource;
    switch (type) {
        case 'gcp.run.service':
            return verifyCloudRunService(project, region, name);
        case 'gcp.run.job':
            return verifyCloudRunJob(project, region, name);
        case 'gcp.run.domainMapping':
            return verifyCloudRunDomainMapping(project, region, name);
        case 'gcp.sql.databaseInstance':
            return verifyCloudSqlInstance(project, name);
        case 'gcp.storage.bucket':
            return verifyStorageBucket(name);
        case 'gcp.pubsub.topic':
            return verifyPubSubTopic(project, name);
        case 'gcp.pubsub.subscription':
            return verifyPubSubSubscription(project, name);
        case 'gcp.firestore.database':
            return verifyFirestoreDatabase(project, name || '(default)');
        case 'gcp.redis.instance':
            return verifyRedisInstance(project, region, name);
        case 'gcp.secretmanager.secret':
            return verifySecret(project, name);
        case 'gcp.bigquery.dataset':
            return verifyBigQueryDataset(project, name);
        case 'gcp.cloudfunctions.function':
            return verifyCloudFunction(project, region, name);
        case 'gcp.container.cluster':
            return verifyGKECluster(project, region, name);
        case 'gcp.cloudscheduler.job':
            return verifyCloudSchedulerJob(project, region, name);
        case 'gcp.apigateway.api':
            return verifyApiGateway(project, name);
        case 'gcp.identityplatform.config':
            return verifyIdentityPlatform(project);
        case 'gcp.compute.globalForwardingRule':
            return verifyComputeForwardingRule(project, name);
        case 'gcp.logging.sink':
            return verifyLoggingSink(project, name);
        case 'gcp.aiplatform.endpoint':
            return verifyVertexAIEndpoint(project, region, name);
        case 'gcp.aiplatform.index':
            return verifyVertexAIIndex(project, region, name);
        case 'gcp.discoveryengine.searchEngine':
            return verifyDiscoveryEngine(project, name);
        case 'gcp.dataflow.job':
            return verifyDataflowJob(project, region, name);
        default:
            return { exists: false, resource: null, error: `No verifier for resource type: ${type}` };
    }
}
