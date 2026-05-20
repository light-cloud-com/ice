/**
 * Pipeline service shared types and GitHub API constants.
 *
 * Extracted from `pipeline.service.ts` (rf-pipe-1) so that the rule
 * management, events, framework detection, and webhook helpers can
 * import without re-routing through the orchestrator shim.
 */

export interface CreateRuleInput {
  cardId: string;
  nodeId: string;
  repository: string; // "owner/repo"
  triggerType?: string; // "push" | "merge"
  branchPattern?: string; // "main" | "develop" | "feature/*"
  environment?: string; // "production" | "staging" | "development"
  buildCommand?: string;
  installCommand?: string;
  outputDir?: string;
  framework?: string;
}

export interface DeployStep {
  step: string;
  status: 'started' | 'completed' | 'failed';
  message: string;
  timestamp: string;
  duration_ms?: number;
}

export interface FrameworkDetection {
  framework: string | null;
  runtime: string | null;
  buildCommand: string | null;
  installCommand: string | null;
  outputDirectory: string | null;
  packageManager: string | null;
  confidence: 'high' | 'medium' | 'low';
  detectedFiles: string[];
}

export interface WebhookRegistrationResult {
  status: 'registered' | 'failed' | 'skipped';
  webhookId?: number;
  error?: string;
}

export const GITHUB_API = 'https://api.github.com';
export const GITHUB_HEADERS = {
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
};
