/**
 * Mock Server for External Services
 *
 * Lightweight Express server (port 4100) that intercepts calls
 * the backend makes to GCP, GitHub, Stripe APIs.
 */
export declare function setDeployResult(result: 'success' | 'failure'): void;
export declare function getRequests(path: string): any[];
export declare function clearRequests(): void;
export declare function startMockServer(): Promise<void>;
export declare function stopMockServer(): Promise<void>;
