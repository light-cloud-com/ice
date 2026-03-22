/** Deploy API contracts */

export interface DeployPlanRequest {
  cardId: string;
  nodes: any[];
  edges: any[];
  options: DeployOptions;
}

export interface DeployOptions {
  provider?: string;
  region?: string;
  environment?: string;
  projectName?: string;
  gcpProject?: string;
}

export interface DeployPlanResponse {
  success: boolean;
  plan: DeployPlan;
  deploymentId?: string;
}

export interface DeployPlan {
  creates: number;
  deployable_count: number;
  skipped: Array<{ nodeId?: string; label: string; reason: string }>;
  warnings: string[];
  graph_summary?: { nodes: number; edges: number };
}

export interface DeployApplyRequest {
  cardId: string;
  nodes: any[];
  edges: any[];
  options: DeployOptions;
}

export interface DeployProgress {
  type: 'log' | 'progress' | 'complete';
  message?: string;
  resource?: string;
  action?: string;
  status?: string;
  progress?: number;
  success?: boolean;
  results?: DeployResult;
}

export interface DeployResult {
  success: boolean;
  resources: ResourceDeployResult[];
  summary: {
    total: number;
    created: number;
    updated: number;
    deleted: number;
    skipped: number;
    failed: number;
  };
  provider: string;
  started_at: string;
  completed_at: string;
  duration_ms: number;
  errors: Array<{ message: string; resource?: string }>;
  warnings: Array<{ message: string; resource?: string }>;
}

export interface ResourceDeployResult {
  resource_id: string;
  name: string;
  type: string;
  action: 'create' | 'update' | 'delete' | 'skip';
  success: boolean;
  error?: string;
  provider_id?: string;
  duration_ms: number;
  outputs?: Record<string, unknown>;
}

export interface DeploymentRecord {
  id: string;
  card_id: string;
  user_id?: string;
  status: string;
  provider: string;
  region: string;
  environment: string;
  plan?: any;
  results?: any;
  duration_ms?: number;
  error?: string;
  created_at: string;
  updated_at: string;
}
