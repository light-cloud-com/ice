/**
 * Smoke tests for the Kubernetes P0/P1 handlers.
 *
 * Each handler dispatches to a typed `@kubernetes/client-node` API
 * client (CoreV1Api / AppsV1Api / BatchV1Api / NetworkingV1Api /
 * AutoscalingV2Api). The harness stubs these with vi.fn() and verifies
 * the dispatcher routes each `k8s.<group>.<kind>` to the right method.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KubernetesDeployer } from '../kubernetes/kubernetes-deployer';

function setup_mocks() {
  const create_ns = vi.fn().mockResolvedValue({});
  const read_ns = vi.fn().mockResolvedValue({ metadata: { name: 'ice-deploy' } });
  const list_ns = vi.fn().mockResolvedValue({ items: [] });
  const create_secret = vi.fn().mockResolvedValue({});
  const create_configmap = vi.fn().mockResolvedValue({});
  const create_pvc = vi.fn().mockResolvedValue({});
  const create_service = vi.fn().mockResolvedValue({});
  const create_sa = vi.fn().mockResolvedValue({});
  const create_deployment = vi.fn().mockResolvedValue({});
  const create_statefulset = vi.fn().mockResolvedValue({});
  const create_cronjob = vi.fn().mockResolvedValue({});
  const create_job = vi.fn().mockResolvedValue({});
  const create_ingress = vi.fn().mockResolvedValue({});
  const create_netpol = vi.fn().mockResolvedValue({});
  const create_hpa = vi.fn().mockResolvedValue({});

  class CoreV1Api {
    createNamespace = create_ns;
    readNamespace = read_ns;
    listNamespace = list_ns;
    createNamespacedSecret = create_secret;
    createNamespacedConfigMap = create_configmap;
    createNamespacedPersistentVolumeClaim = create_pvc;
    createNamespacedService = create_service;
    createNamespacedServiceAccount = create_sa;
  }
  class AppsV1Api {
    createNamespacedDeployment = create_deployment;
    createNamespacedStatefulSet = create_statefulset;
  }
  class BatchV1Api {
    createNamespacedCronJob = create_cronjob;
    createNamespacedJob = create_job;
  }
  class NetworkingV1Api {
    createNamespacedIngress = create_ingress;
    createNamespacedNetworkPolicy = create_netpol;
  }
  class AutoscalingV2Api {
    createNamespacedHorizontalPodAutoscaler = create_hpa;
  }
  class KubeConfig {
    loadFromDefault() {}
    loadFromString() {}
    loadFromFile() {}
    loadFromCluster() {}
    getCurrentContext() {
      return 'test-context';
    }
    makeApiClient(cls: any) {
      return new cls();
    }
  }

  const sdk = { CoreV1Api, AppsV1Api, BatchV1Api, NetworkingV1Api, AutoscalingV2Api, KubeConfig };

  const original_function = globalThis.Function;
  const stub = function (...args: unknown[]) {
    if (args.length === 2 && args[0] === 'm' && typeof args[1] === 'string' && args[1].includes('return import')) {
      return async (mod: string) => {
        if (mod === '@kubernetes/client-node') return sdk;
        return null;
      };
    }
    return (original_function as unknown as (...a: unknown[]) => unknown).apply(original_function, args);
  };
  (globalThis as { Function: unknown }).Function = stub;
  return {
    restore: () => {
      (globalThis as { Function: unknown }).Function = original_function;
    },
    create_ns,
    create_secret,
    create_configmap,
    create_pvc,
    create_service,
    create_sa,
    create_deployment,
    create_statefulset,
    create_cronjob,
    create_job,
    create_ingress,
    create_netpol,
    create_hpa,
  };
}

async function deployer(): Promise<KubernetesDeployer> {
  const d = new KubernetesDeployer();
  await d.initialize({ provider: 'kubernetes', namespaces: ['ice-deploy'] });
  return d;
}

describe('Kubernetes P0/P1 handlers — dispatch + minimal create path', () => {
  let stub: ReturnType<typeof setup_mocks>;
  beforeEach(() => {
    stub = setup_mocks();
  });
  afterEach(() => stub.restore());

  it('namespace creates via CoreV1Api.createNamespace', async () => {
    const d = await deployer();
    const out = await d.create('k8s.core.namespace', 'ns1', {}, {});
    expect(out.success).toBe(true);
    expect(stub.create_ns).toHaveBeenCalled();
  });

  it('secret creates via createNamespacedSecret with base64 data', async () => {
    const d = await deployer();
    const out = await d.create('k8s.core.secret', 's1', { data: { password: 'hunter2' } }, {});
    expect(out.success).toBe(true);
    const arg = stub.create_secret.mock.calls[0][0];
    expect(arg.body.data.password).toBe(Buffer.from('hunter2').toString('base64'));
  });

  it('configmap creates with literal data', async () => {
    const d = await deployer();
    const out = await d.create('k8s.core.configmap', 'cm1', { data: { LOG_LEVEL: 'info' } }, {});
    expect(out.success).toBe(true);
    const arg = stub.create_configmap.mock.calls[0][0];
    expect(arg.body.data).toEqual({ LOG_LEVEL: 'info' });
  });

  it('pvc creates with default 10Gi when size_gi unset', async () => {
    const d = await deployer();
    const out = await d.create('k8s.core.persistentvolumeclaim', 'pv1', {}, {});
    expect(out.success).toBe(true);
    const arg = stub.create_pvc.mock.calls[0][0];
    expect(arg.body.spec.resources.requests.storage).toBe('10Gi');
  });

  it('service creates with ClusterIP by default', async () => {
    const d = await deployer();
    const out = await d.create('k8s.core.service', 'svc1', { port: 8080 }, {});
    expect(out.success).toBe(true);
    const arg = stub.create_service.mock.calls[0][0];
    expect(arg.body.spec.type).toBe('ClusterIP');
    expect(arg.body.spec.ports[0].port).toBe(8080);
  });

  it('deployment refuses without image', async () => {
    const d = await deployer();
    const out = await d.create('k8s.apps.deployment', 'dep1', {}, {});
    expect(out.success).toBe(false);
    expect(out.error).toMatch(/image/);
  });

  it('deployment creates with image + replicas', async () => {
    const d = await deployer();
    const out = await d.create('k8s.apps.deployment', 'dep1', { image: 'nginx:1.27', replicas: 3 }, {});
    expect(out.success).toBe(true);
    const arg = stub.create_deployment.mock.calls[0][0];
    expect(arg.body.spec.replicas).toBe(3);
    expect(arg.body.spec.template.spec.containers[0].image).toBe('nginx:1.27');
  });

  it('statefulset creates with postgres image + 5432 port + 10Gi PVC template', async () => {
    const d = await deployer();
    const out = await d.create(
      'k8s.apps.statefulset',
      'pg1',
      { image: 'postgres:17-alpine', port: 5432, data_path: '/var/lib/postgresql/data' },
      {},
    );
    expect(out.success).toBe(true);
    const arg = stub.create_statefulset.mock.calls[0][0];
    expect(arg.body.spec.template.spec.containers[0].image).toBe('postgres:17-alpine');
    expect(arg.body.spec.volumeClaimTemplates[0].spec.resources.requests.storage).toBe('10Gi');
  });

  it('cronjob creates with normalized schedule expression', async () => {
    const d = await deployer();
    const out = await d.create(
      'k8s.batch.cronjob',
      'cron1',
      { schedule_expression: '0 0 * * *', image: 'alpine:3' },
      {},
    );
    expect(out.success).toBe(true);
    const arg = stub.create_cronjob.mock.calls[0][0];
    expect(arg.body.spec.schedule).toBe('0 0 * * *');
  });

  it('job creates with backoff_limit + parallelism defaults', async () => {
    const d = await deployer();
    const out = await d.create('k8s.batch.job', 'job1', { image: 'alpine:3', command: ['echo', 'hi'] }, {});
    expect(out.success).toBe(true);
    const arg = stub.create_job.mock.calls[0][0];
    expect(arg.body.spec.backoffLimit).toBe(3);
  });

  it('ingress creates with nginx class + host + service-port mapping', async () => {
    const d = await deployer();
    const out = await d.create(
      'k8s.networking.ingress',
      'ing1',
      { host: 'app.example.com', service_name: 'svc1', service_port: 8080 },
      {},
    );
    expect(out.success).toBe(true);
    const arg = stub.create_ingress.mock.calls[0][0];
    expect(arg.body.spec.ingressClassName).toBe('nginx');
    expect(arg.body.spec.rules[0].host).toBe('app.example.com');
  });

  it('networkpolicy creates with default deny-all', async () => {
    const d = await deployer();
    const out = await d.create('k8s.networking.networkpolicy', 'np1', {}, {});
    expect(out.success).toBe(true);
    const arg = stub.create_netpol.mock.calls[0][0];
    expect(arg.body.spec.policyTypes).toEqual(['Ingress', 'Egress']);
  });

  it('serviceaccount creates with automount=true by default', async () => {
    const d = await deployer();
    const out = await d.create('k8s.core.serviceaccount', 'sa1', {}, {});
    expect(out.success).toBe(true);
    const arg = stub.create_sa.mock.calls[0][0];
    expect(arg.body.automountServiceAccountToken).toBe(true);
  });

  it('hpa creates with autoscaling/v2 + CPU 70% target', async () => {
    const d = await deployer();
    const out = await d.create('k8s.autoscaling.hpa', 'hpa1', { max_replicas: 5 }, {});
    expect(out.success).toBe(true);
    const arg = stub.create_hpa.mock.calls[0][0];
    expect(arg.body.spec.maxReplicas).toBe(5);
    expect(arg.body.spec.scaleTargetRef.kind).toBe('Deployment');
  });
});
