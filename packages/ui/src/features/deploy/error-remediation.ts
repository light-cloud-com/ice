/**
 * GCP Error → User-Facing Remediation Mapping
 *
 * Matches raw GCP error messages to short, actionable remediation entries so
 * the deploy panel can show users "here's what to do" instead of cryptic
 * API codes. The raw message is always available via the error row's copy
 * button — the remediation is an overlay, not a replacement.
 *
 * Add a new entry to REMEDIATIONS whenever a new error pattern becomes a
 * common user friction point. Keep patterns specific (use distinct phrases,
 * not just the bare code) so misclassification is rare.
 */

export interface RemediationAction {
  label: string;
  /** External URL the user should visit. */
  href?: string;
  /** Internal action hint the UI can wire up: `retry`, `authenticate`, `openConfig`. */
  onClick?: 'retry' | 'authenticate' | 'openConfig';
}

export interface RemediationEntry {
  /** Stable id, so future code can look one up directly. */
  id: string;
  /** Short title rendered in the error card. */
  title: string;
  /** One to two sentence plain-language explanation. */
  explanation: string;
  /** Actions the user can take (buttons). */
  actions: RemediationAction[];
}

interface RemediationPattern extends RemediationEntry {
  pattern: RegExp;
}

const REMEDIATIONS: RemediationPattern[] = [
  {
    id: 'billing-not-enabled',
    pattern: /billing account|billing is not enabled|BILLING_DISABLED/i,
    title: 'Billing account not linked',
    explanation:
      'This GCP project does not have an active billing account. You need to link one before deploying paid resources.',
    actions: [
      {
        label: 'Open billing console',
        href: 'https://console.cloud.google.com/billing',
      },
      { label: 'Retry deploy', onClick: 'retry' },
    ],
  },
  {
    id: 'permission-denied',
    pattern: /PERMISSION_DENIED|Resource not accessible by personal access token|does not have permission|required 'serviceusage/i,
    title: 'Permission denied',
    explanation:
      "The credentials you're using don't have permission for this operation. Grant the required IAM role or reconnect with a different service account.",
    actions: [
      {
        label: 'Open IAM settings',
        href: 'https://console.cloud.google.com/iam-admin/iam',
      },
      { label: 'Reconnect provider', onClick: 'authenticate' },
    ],
  },
  {
    id: 'api-not-enabled',
    pattern: /SERVICE_DISABLED|API has not been used|has not been enabled/i,
    title: 'API not enabled',
    explanation: 'A required Google Cloud API is not enabled for this project. ICE will try to enable it automatically on retry.',
    actions: [
      {
        label: 'Open API library',
        href: 'https://console.cloud.google.com/apis/library',
      },
      { label: 'Retry deploy', onClick: 'retry' },
    ],
  },
  {
    id: 'quota-exceeded',
    pattern: /QUOTA_EXCEEDED|quota.*exceeded|exceeded quota/i,
    title: 'Quota exceeded',
    explanation:
      "You've hit a GCP quota limit for this resource type or region. Request a quota increase or try a different region.",
    actions: [
      {
        label: 'Request quota increase',
        href: 'https://console.cloud.google.com/iam-admin/quotas',
      },
    ],
  },
  {
    id: 'already-exists',
    pattern: /ALREADY_EXISTS|already in use|resource already exists/i,
    title: 'Resource already exists',
    explanation:
      "A resource with this name already exists in GCP. If you deployed it outside ICE, ICE can't safely manage it without first importing it. Try a different name or delete the existing resource.",
    actions: [
      {
        label: 'Open GCP console',
        href: 'https://console.cloud.google.com/',
      },
    ],
  },
  {
    id: 'invalid-argument',
    pattern: /INVALID_ARGUMENT|invalid value|is not a valid/i,
    title: 'Invalid configuration',
    explanation:
      'GCP rejected one of the values in your configuration. Check the per-resource error below for the specific field and value.',
    actions: [],
  },
  {
    id: 'cert-required',
    pattern: /Certificate Map or at least 1 SSL certificate must be specified/i,
    title: 'SSL certificate required',
    explanation:
      'Creating a TargetHttpsProxy needs at least one SSL certificate, or ICE must fall back to HTTP. If you didn\'t intend to use HTTPS, remove the protocol override.',
    actions: [],
  },
  {
    id: 'deadline-exceeded',
    pattern: /DEADLINE_EXCEEDED|deadline exceeded|operation timed out/i,
    title: 'Operation timed out',
    explanation: 'The GCP operation took longer than expected. This is usually transient. Retry and it will likely succeed.',
    actions: [{ label: 'Retry deploy', onClick: 'retry' }],
  },
  {
    id: 'network-error',
    pattern: /ECONNRESET|ETIMEDOUT|ENOTFOUND|network error|unexpected end of json/i,
    title: 'Network error',
    explanation: 'Transient network failure talking to GCP. Retry — the request will succeed once the connection recovers.',
    actions: [{ label: 'Retry deploy', onClick: 'retry' }],
  },
];

/**
 * Classify a raw error message into a remediation entry, or return null if
 * nothing matches.
 */
export function classifyError(rawMessage: string | undefined | null): RemediationEntry | null {
  if (!rawMessage) return null;
  for (const entry of REMEDIATIONS) {
    if (entry.pattern.test(rawMessage)) {
      const { pattern: _pattern, ...rest } = entry;
      void _pattern;
      return rest;
    }
  }
  return null;
}
