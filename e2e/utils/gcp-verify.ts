/**
 * GCP Verification Utilities
 *
 * Uses gcloud CLI to verify deployed resources actually exist in Google Cloud.
 * Called after deploy tests to confirm resources were created/destroyed.
 */

import { execSync } from 'child_process';

export interface VerifyResult {
  exists: boolean;
  resource: Record<string, unknown> | null;
  error: string | null;
}

function runGcloud(args: string): VerifyResult {
  try {
    const output = execSync(`gcloud ${args} --format=json`, {
      encoding: 'utf-8',
      timeout: 30000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const resource = JSON.parse(output);
    return { exists: true, resource, error: null };
  } catch (err: any) {
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
export function verifyCloudRunService(project: string, region: string, name: string): VerifyResult {
  return runGcloud(`run services describe ${name} --project=${project} --region=${region}`);
}

/**
 * Verify a Cloud Run service URL is reachable.
 */
export function verifyCloudRunReachable(url: string): { status: number; ok: boolean } {
  try {
    const output = execSync(`curl -s -o /dev/null -w "%{http_code}" ${url}`, {
      encoding: 'utf-8',
      timeout: 15000,
    });
    const status = parseInt(output.trim(), 10);
    return { status, ok: status >= 200 && status < 400 };
  } catch {
    return { status: 0, ok: false };
  }
}

/**
 * Verify a Cloud Storage bucket exists.
 */
export function verifyStorageBucket(name: string): VerifyResult {
  return runGcloud(`storage buckets describe gs://${name}`);
}

/**
 * Verify a Pub/Sub topic exists.
 */
export function verifyPubSubTopic(project: string, name: string): VerifyResult {
  return runGcloud(`pubsub topics describe ${name} --project=${project}`);
}

/**
 * Verify a Secret Manager secret exists.
 */
export function verifySecret(project: string, name: string): VerifyResult {
  return runGcloud(`secrets describe ${name} --project=${project}`);
}

/**
 * Verify a Cloud SQL instance exists.
 */
export function verifyCloudSqlInstance(project: string, name: string): VerifyResult {
  return runGcloud(`sql instances describe ${name} --project=${project}`);
}

/**
 * Verify a Firestore database exists.
 */
export function verifyFirestoreDatabase(project: string, name: string): VerifyResult {
  return runGcloud(`firestore databases describe --database=${name} --project=${project}`);
}

/**
 * Verify a Cloud Function exists.
 */
export function verifyCloudFunction(project: string, region: string, name: string): VerifyResult {
  return runGcloud(`functions describe ${name} --project=${project} --region=${region}`);
}

/**
 * Verify a BigQuery dataset exists.
 */
export function verifyBigQueryDataset(project: string, name: string): VerifyResult {
  return runGcloud(`bq show --project_id=${project} ${name} 2>/dev/null`);
}

/**
 * List all Cloud Run services in a project/region.
 */
export function listCloudRunServices(project: string, region: string): string[] {
  try {
    const output = execSync(`gcloud run services list --project=${project} --region=${region} --format="value(name)"`, {
      encoding: 'utf-8',
      timeout: 30000,
    });
    return output.trim().split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Get recent Cloud Run logs for a service.
 */
export function getCloudRunLogs(project: string, serviceName: string, limit = 20): Record<string, unknown>[] {
  try {
    const output = execSync(
      `gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=${serviceName}" --project=${project} --limit=${limit} --format=json`,
      { encoding: 'utf-8', timeout: 30000 },
    );
    return JSON.parse(output);
  } catch {
    return [];
  }
}
