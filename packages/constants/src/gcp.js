/**
 * GCP Constants
 *
 * GCP-specific shared values: which APIs each iceType needs enabled,
 * which APIs to enable for every deploy, and the patterns we use to
 * recognize "API not yet enabled" errors. The deploy service uses these
 * for preflight enablement; the UI uses the patterns for surfacing a
 * helpful "click to enable" CTA on errors.
 */
/**
 * Always-enabled APIs for any GCP deployment. The deploy service unions
 * these with the per-iceType list before calling Service Usage.
 */
export const GCP_BASE_APIS = [
    'serviceusage.googleapis.com',
    'cloudresourcemanager.googleapis.com',
];
/**
 * iceType → required GCP APIs. Every block type that hits a Google API
 * during deploy or preflight requirements MUST appear here, otherwise
 * the user sees a cryptic SERVICE_DISABLED error mid-deploy.
 */
export const GCP_ICE_TYPE_API_MAP = {
    // Compute
    'Compute.StaticSite': ['firebase.googleapis.com', 'firebasehosting.googleapis.com'],
    'Compute.SSRSite': ['run.googleapis.com', 'artifactregistry.googleapis.com', 'cloudbuild.googleapis.com'],
    'Compute.Container': ['run.googleapis.com', 'artifactregistry.googleapis.com', 'cloudbuild.googleapis.com'],
    'Compute.BackendAPI': ['run.googleapis.com', 'artifactregistry.googleapis.com', 'cloudbuild.googleapis.com'],
    'Compute.Worker': ['run.googleapis.com', 'artifactregistry.googleapis.com', 'cloudbuild.googleapis.com'],
    'Compute.ServerlessFunction': [
        'cloudfunctions.googleapis.com',
        'cloudbuild.googleapis.com',
        'artifactregistry.googleapis.com',
        'run.googleapis.com',
    ],
    'Compute.CronJob': ['cloudscheduler.googleapis.com', 'run.googleapis.com'],
    'Compute.GKE': ['container.googleapis.com'],
    // Storage
    'Storage.Bucket': ['storage.googleapis.com'],
    'Storage.ObjectStorage': ['storage.googleapis.com'],
    // Database
    'Database.PostgreSQL': ['sqladmin.googleapis.com'],
    'Database.MySQL': ['sqladmin.googleapis.com'],
    'Database.Firestore': ['firestore.googleapis.com'],
    'Database.Redis': ['redis.googleapis.com'],
    // Network
    'Network.PublicEndpoint': ['compute.googleapis.com', 'siteverification.googleapis.com'],
    'Network.LoadBalancer': ['compute.googleapis.com'],
    'Network.Gateway': ['apigateway.googleapis.com', 'servicecontrol.googleapis.com', 'servicemanagement.googleapis.com'],
    'Network.VPC': ['compute.googleapis.com'],
    'Network.Subnet': ['compute.googleapis.com'],
    // Messaging
    'Messaging.CloudPubSub': ['pubsub.googleapis.com'],
    'Messaging.Queue': ['pubsub.googleapis.com'],
    'Messaging.Topic': ['pubsub.googleapis.com'],
    // Security
    'Security.Secret': ['secretmanager.googleapis.com'],
    'Security.Identity': ['identitytoolkit.googleapis.com'],
    // Monitoring
    'Monitoring.Log': ['logging.googleapis.com'],
    // AI / Analytics
    'AI.VectorDB': ['aiplatform.googleapis.com'],
    'AI.LLMGateway': ['aiplatform.googleapis.com'],
    'AI.ModelServing': ['aiplatform.googleapis.com'],
    'Analytics.DataWarehouse': ['bigquery.googleapis.com'],
    'Analytics.Search': ['discoveryengine.googleapis.com'],
};
/**
 * Substring patterns that identify "this GCP API isn't enabled yet"
 * errors — used by the UI to attach an enable-CTA to the error banner.
 */
export const GCP_API_NOT_ENABLED_PATTERNS = [
    'has not been used in project',
    'it is disabled',
    'API has not been enabled',
    'PERMISSION_DENIED',
    'SERVICE_DISABLED',
    'accessNotConfigured',
    'must be enabled',
];
