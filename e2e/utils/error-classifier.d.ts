/**
 * Error Classifier — Categorizes GCP deploy errors
 *
 * Examines error messages, HTTP status codes, and GCP error codes
 * to produce classified errors with recovery suggestions.
 */
export type ErrorCategory = 'auth' | 'permission' | 'quota' | 'api_not_enabled' | 'config' | 'build' | 'network' | 'timeout' | 'conflict' | 'not_found' | 'unknown';
export interface ClassifiedError {
    resource?: string;
    phase: string;
    category: ErrorCategory;
    message: string;
    gcpErrorCode?: string;
    httpStatus?: number;
    suggestion?: string;
    consoleUrl?: string;
}
/**
 * Classify a GCP deploy error into a category with recovery suggestion.
 */
export declare function classifyDeployError(error: string, context?: {
    resource?: string;
    phase?: string;
    httpStatus?: number;
    gcpProject?: string;
}): ClassifiedError;
/**
 * Classify multiple errors from a deploy result.
 */
export declare function classifyDeployErrors(resources: Array<{
    name?: string;
    error?: string;
    type?: string;
}>, phase: string, gcpProject?: string): ClassifiedError[];
/**
 * Get a summary of error categories from a list of classified errors.
 */
export declare function summarizeErrors(errors: ClassifiedError[]): Record<ErrorCategory, number>;
