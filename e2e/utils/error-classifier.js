/**
 * Error Classifier — Categorizes GCP deploy errors
 *
 * Examines error messages, HTTP status codes, and GCP error codes
 * to produce classified errors with recovery suggestions.
 */
const PATTERNS = [
    // API not enabled — highest priority, very common on fresh projects
    {
        test: (msg) => /api.*not.*enabled|service.*not.*enabled|has not been used|is disabled|PERMISSION_DENIED.*serviceusage/i.test(msg),
        category: 'api_not_enabled',
        gcpCode: 'SERVICE_DISABLED',
        suggestion: (msg) => {
            const apiMatch = msg.match(/(?:googleapis\.com\/)?([a-z][a-z0-9-]*\.googleapis\.com)/i);
            const api = apiMatch?.[1] || 'the required API';
            return `Enable ${api} in the GCP Console or run: gcloud services enable ${api}`;
        },
        consoleUrl: (_msg, project) => project ? `https://console.cloud.google.com/apis/dashboard?project=${project}` : undefined,
    },
    // Authentication / token issues
    {
        test: (msg, status) => status === 401 || /UNAUTHENTICATED|token.*expired|invalid.*credentials|auth.*fail/i.test(msg),
        category: 'auth',
        gcpCode: 'UNAUTHENTICATED',
        suggestion: 'Check service account key validity. The key may be expired or revoked.',
    },
    // Permission denied (not API-related)
    {
        test: (msg, status) => (status === 403 || /PERMISSION_DENIED|forbidden|access denied/i.test(msg)) &&
            !/serviceusage|api.*not.*enabled/i.test(msg),
        category: 'permission',
        gcpCode: 'PERMISSION_DENIED',
        suggestion: (msg) => {
            const roleMatch = msg.match(/requires.*?(roles\/[\w.]+)/);
            if (roleMatch)
                return `Grant ${roleMatch[1]} to the service account.`;
            return 'Grant the required IAM role to the service account. Check the error details for the specific permission needed.';
        },
        consoleUrl: (_msg, project) => project ? `https://console.cloud.google.com/iam-admin/iam?project=${project}` : undefined,
    },
    // Quota exceeded
    {
        test: (msg, status) => status === 429 || /QUOTA_EXCEEDED|RESOURCE_EXHAUSTED|resourceExhausted|rate.*limit|too many requests/i.test(msg),
        category: 'quota',
        gcpCode: 'RESOURCE_EXHAUSTED',
        suggestion: 'GCP quota exceeded. Wait and retry, or request a quota increase in the GCP Console.',
        consoleUrl: (_msg, project) => project ? `https://console.cloud.google.com/iam-admin/quotas?project=${project}` : undefined,
    },
    // Resource conflict (ALREADY_EXISTS)
    {
        test: (msg, status) => status === 409 || /ALREADY_EXISTS|already exists|conflict/i.test(msg),
        category: 'conflict',
        gcpCode: 'ALREADY_EXISTS',
        suggestion: 'Resource already exists. This is usually safe — the deploy engine treats it as a no-op.',
    },
    // Resource not found (on update/delete)
    {
        test: (msg, status) => status === 404 || /NOT_FOUND|not found|could not be found|was not found/i.test(msg),
        category: 'not_found',
        gcpCode: 'NOT_FOUND',
        suggestion: 'Resource not found. It may have been deleted externally or never created.',
    },
    // Build failures (Cloud Build / Docker)
    {
        test: (msg) => /build.*fail|cloudbuild|dockerfile|docker.*build|COPY failed|npm.*ERR|pip.*install.*fail|build step.*fail/i.test(msg),
        category: 'build',
        suggestion: 'Build failed. Check the Dockerfile and source code. Review Cloud Build logs for details.',
        consoleUrl: (_msg, project) => project ? `https://console.cloud.google.com/cloud-build/builds?project=${project}` : undefined,
    },
    // Timeout
    {
        test: (msg) => /DEADLINE_EXCEEDED|timed? ?out|timeout|operation.*not.*complet/i.test(msg),
        category: 'timeout',
        gcpCode: 'DEADLINE_EXCEEDED',
        suggestion: 'Operation timed out. Some resources (Cloud SQL, GKE) take several minutes. Try increasing the timeout.',
    },
    // Network errors
    {
        test: (msg) => /UNAVAILABLE|ECONNREFUSED|ENOTFOUND|ECONNRESET|getaddrinfo|network.*error|socket.*hang.*up|fetch.*fail/i.test(msg),
        category: 'network',
        gcpCode: 'UNAVAILABLE',
        suggestion: 'Network error reaching GCP APIs. Check internet connectivity and DNS resolution.',
    },
    // Invalid configuration
    {
        test: (msg, status) => status === 400 || /INVALID_ARGUMENT|FAILED_PRECONDITION|invalid.*value|bad request|validation.*fail/i.test(msg),
        category: 'config',
        gcpCode: 'INVALID_ARGUMENT',
        suggestion: (msg) => {
            const fieldMatch = msg.match(/field\s+"?(\w+)"?/i);
            if (fieldMatch)
                return `Invalid value for field "${fieldMatch[1]}". Check the resource configuration.`;
            return 'Invalid resource configuration. Review the error message for the specific field.';
        },
    },
];
// ─── Classifier ────────────────────────────────────────────────────────────
/**
 * Classify a GCP deploy error into a category with recovery suggestion.
 */
export function classifyDeployError(error, context) {
    const msg = error || '';
    const status = context?.httpStatus;
    const project = context?.gcpProject;
    for (const pattern of PATTERNS) {
        if (pattern.test(msg, status)) {
            return {
                resource: context?.resource,
                phase: context?.phase || 'unknown',
                category: pattern.category,
                message: msg,
                gcpErrorCode: pattern.gcpCode,
                httpStatus: status,
                suggestion: typeof pattern.suggestion === 'function' ? pattern.suggestion(msg, project) : pattern.suggestion,
                consoleUrl: pattern.consoleUrl?.(msg, project),
            };
        }
    }
    return {
        resource: context?.resource,
        phase: context?.phase || 'unknown',
        category: 'unknown',
        message: msg,
        httpStatus: status,
        suggestion: 'An unexpected error occurred. Check the full error message for details.',
    };
}
/**
 * Classify multiple errors from a deploy result.
 */
export function classifyDeployErrors(resources, phase, gcpProject) {
    const errors = [];
    for (const r of resources) {
        if (r.error) {
            errors.push(classifyDeployError(r.error, {
                resource: r.name,
                phase,
                gcpProject,
            }));
        }
    }
    return errors;
}
/**
 * Get a summary of error categories from a list of classified errors.
 */
export function summarizeErrors(errors) {
    const summary = {};
    for (const e of errors) {
        summary[e.category] = (summary[e.category] || 0) + 1;
    }
    return summary;
}
