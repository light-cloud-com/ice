export async function snapshotDailyUsage(_orgId: string) { return {}; }
export async function getCurrentUsage(_orgId: string) { return { builds: 0, deployments: 0 }; }
export async function getUsageSummary(_orgId: string) { return { builds: 0, deployments: 0 }; }
export async function getCurrentMonthUsage(_orgId: string) { return { builds: 0, deployments: 0, storage: 0 }; }
export async function getDailyUsageBreakdown(_orgId: string, _days?: number) { return []; }
