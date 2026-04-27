/**
 * GCP Verification Utilities
 *
 * Uses gcloud CLI to verify deployed resources actually exist in Google Cloud.
 * Called after deploy tests to confirm resources were created/destroyed.
 */
export interface VerifyResult {
    exists: boolean;
    resource: Record<string, unknown> | null;
    error: string | null;
}
/**
 * Verify a Cloud Run service exists.
 */
export declare function verifyCloudRunService(project: string, region: string, name: string): VerifyResult;
/**
 * Verify a Cloud Run service URL is reachable.
 */
export declare function verifyCloudRunReachable(url: string): {
    status: number;
    ok: boolean;
};
/**
 * Verify a Cloud Storage bucket exists.
 */
export declare function verifyStorageBucket(name: string): VerifyResult;
/**
 * Verify a Pub/Sub topic exists.
 */
export declare function verifyPubSubTopic(project: string, name: string): VerifyResult;
/**
 * Verify a Secret Manager secret exists.
 */
export declare function verifySecret(project: string, name: string): VerifyResult;
/**
 * Verify a Cloud SQL instance exists.
 */
export declare function verifyCloudSqlInstance(project: string, name: string): VerifyResult;
/**
 * Verify a Firestore database exists.
 */
export declare function verifyFirestoreDatabase(project: string, name: string): VerifyResult;
/**
 * Verify a Cloud Function exists.
 */
export declare function verifyCloudFunction(project: string, region: string, name: string): VerifyResult;
/**
 * Verify a BigQuery dataset exists.
 */
export declare function verifyBigQueryDataset(project: string, name: string): VerifyResult;
/**
 * List all Cloud Run services in a project/region.
 */
export declare function listCloudRunServices(project: string, region: string): string[];
/**
 * Get recent Cloud Run logs for a service.
 */
export declare function getCloudRunLogs(project: string, serviceName: string, limit?: number): Record<string, unknown>[];
/**
 * Verify a Cloud Run job exists.
 */
export declare function verifyCloudRunJob(project: string, region: string, name: string): VerifyResult;
/**
 * Verify a Cloud Run domain mapping exists.
 */
export declare function verifyCloudRunDomainMapping(project: string, region: string, name: string): VerifyResult;
/**
 * Verify a Pub/Sub subscription exists.
 */
export declare function verifyPubSubSubscription(project: string, name: string): VerifyResult;
/**
 * Verify a Memorystore Redis instance exists.
 */
export declare function verifyRedisInstance(project: string, region: string, name: string): VerifyResult;
/**
 * Verify a GKE cluster exists.
 */
export declare function verifyGKECluster(project: string, region: string, name: string): VerifyResult;
/**
 * Verify a Cloud Scheduler job exists.
 */
export declare function verifyCloudSchedulerJob(project: string, region: string, name: string): VerifyResult;
/**
 * Verify an API Gateway exists.
 */
export declare function verifyApiGateway(project: string, name: string): VerifyResult;
/**
 * Verify Identity Platform is configured.
 */
export declare function verifyIdentityPlatform(project: string): VerifyResult;
/**
 * Verify a Compute forwarding rule exists.
 */
export declare function verifyComputeForwardingRule(project: string, name: string): VerifyResult;
/**
 * Verify a Cloud Logging sink exists.
 */
export declare function verifyLoggingSink(project: string, name: string): VerifyResult;
/**
 * Verify a Vertex AI endpoint exists.
 */
export declare function verifyVertexAIEndpoint(project: string, region: string, name: string): VerifyResult;
/**
 * Verify a Vertex AI index exists.
 */
export declare function verifyVertexAIIndex(project: string, region: string, name: string): VerifyResult;
/**
 * Verify a Discovery Engine search engine exists.
 */
export declare function verifyDiscoveryEngine(project: string, name: string): VerifyResult;
/**
 * Verify a Dataflow job exists.
 */
export declare function verifyDataflowJob(project: string, region: string, name: string): VerifyResult;
/**
 * Verify any GCP resource by dispatching to the correct verifier based on iceType.
 */
export declare function verifyGCPResource(project: string, region: string, resource: {
    name: string;
    type: string;
    provider_id?: string;
}): VerifyResult;
