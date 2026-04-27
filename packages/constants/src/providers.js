/**
 * Provider Constants
 *
 * Provider identifiers, types, and display metadata.
 */
import { BRAND_COLORS } from './colors.js';
export const ALL_PROVIDERS = ['aws', 'gcp', 'azure', 'kubernetes', 'alibaba', 'oci', 'digitalocean'];
export const DEFAULT_TEMPLATE_PROVIDERS = ['gcp', 'aws', 'azure'];
/**
 * Short display label per provider — used in deploy panel headers,
 * status banners, and integration dots. Includes `github` because it's
 * shown alongside cloud providers in the integration UI.
 */
export const PROVIDER_LABELS = {
    aws: 'AWS',
    gcp: 'GCP',
    azure: 'Azure',
    kubernetes: 'Kubernetes',
    alibaba: 'Alibaba',
    digitalocean: 'DO',
    oci: 'Oracle',
    cloudflare: 'Cloudflare',
    github: 'GitHub',
};
/**
 * "Project" / scope field metadata per provider — different clouds use
 * different terminology (GCP project, AWS account, Azure subscription).
 */
export const PROVIDER_PROJECT_LABELS = {
    gcp: { label: 'GCP Project', placeholder: 'my-gcp-project' },
    aws: { label: 'AWS Account / Region', placeholder: '123456789012' },
    azure: { label: 'Azure Subscription', placeholder: 'my-subscription-id' },
    kubernetes: { label: 'Cluster Name', placeholder: 'my-k8s-cluster' },
};
/**
 * Provider console URL bases — used to build "open in cloud console"
 * deep-links from a resource row. URLs include the trailing slash so
 * callers can append a path fragment without having to add it.
 */
export const PROVIDER_CONSOLE_BASE = {
    aws: 'https://console.aws.amazon.com/',
    gcp: 'https://console.cloud.google.com/',
    azure: 'https://portal.azure.com/',
    alibaba: 'https://home.console.aliyun.com/',
    digitalocean: 'https://cloud.digitalocean.com/',
    oci: 'https://cloud.oracle.com/',
    cloudflare: 'https://dash.cloudflare.com/',
};
/**
 * OAuth scopes requested when connecting GCP via the browser code-flow.
 * Cloud-platform scope plus project listing — no openid/email/profile,
 * since the user has already authenticated to ICE separately.
 */
export const GCP_OAUTH_SCOPES = [
    'https://www.googleapis.com/auth/cloud-platform',
    'https://www.googleapis.com/auth/cloudplatformprojects.readonly',
];
export const CLOUD_PROVIDERS = [
    {
        id: 'aws',
        name: 'Amazon Web Services',
        shortName: 'AWS',
        description: 'The most widely adopted cloud platform with 200+ services.',
        icon: 'aws',
        color: BRAND_COLORS.aws,
    },
    {
        id: 'gcp',
        name: 'Google Cloud Platform',
        shortName: 'GCP',
        description: 'Google-grade infrastructure for compute, storage, and ML.',
        icon: 'gcp',
        color: BRAND_COLORS.gcp,
    },
    {
        id: 'azure',
        name: 'Microsoft Azure',
        shortName: 'Azure',
        description: 'Enterprise cloud with deep Microsoft ecosystem integration.',
        icon: 'azure',
        color: BRAND_COLORS.azure,
    },
    {
        id: 'kubernetes',
        name: 'Kubernetes',
        shortName: 'K8s',
        description: 'Container orchestration — runs on any cloud or bare metal.',
        icon: 'kubernetes',
        color: BRAND_COLORS.kubernetes,
    },
    {
        id: 'alibaba',
        name: 'Alibaba Cloud',
        shortName: 'Alibaba',
        description: 'Alibaba Cloud — dominant in Asia-Pacific.',
        icon: 'alibaba',
        color: BRAND_COLORS.alibaba,
    },
    {
        id: 'oci',
        name: 'Oracle Cloud',
        shortName: 'OCI',
        description: 'Oracle Cloud — enterprise workloads.',
        icon: 'oci',
        color: BRAND_COLORS.oci,
    },
    {
        id: 'digitalocean',
        name: 'DigitalOcean',
        shortName: 'DO',
        description: 'DigitalOcean — developer-friendly simplicity.',
        icon: 'digitalocean',
        color: BRAND_COLORS.digitalocean,
    },
];
