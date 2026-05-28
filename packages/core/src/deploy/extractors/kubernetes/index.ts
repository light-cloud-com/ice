/**
 * Property extractors for Kubernetes resources.
 *
 * Resources covered (P0):
 *   - k8s.core.namespace
 *   - k8s.core.secret
 *   - k8s.core.configmap
 *   - k8s.core.persistentvolumeclaim    (Storage.Bucket on K8s)
 *   - k8s.core.service                   (Network.LoadBalancer + ClusterIP)
 *   - k8s.apps.deployment                (Compute.Container/BackendAPI/Worker)
 *   - k8s.apps.statefulset               (Database.{Postgres,MySQL,Redis,Mongo})
 *   - k8s.batch.cronjob                  (Compute.CronJob)
 *   - k8s.networking.ingress             (Network.CustomDomain)
 */

export function extract_k8s_namespace_properties(
  data: Record<string, unknown>,
  _region: string,
): Record<string, unknown> {
  return {
    labels: data.labels as Record<string, string> | undefined,
    annotations: data.annotations as Record<string, string> | undefined,
  };
}

export function extract_k8s_secret_properties(data: Record<string, unknown>, _region: string): Record<string, unknown> {
  return {
    namespace: data.namespace as string | undefined,
    secret_type: (data.secret_type as string) || 'Opaque',
    data: data.data as Record<string, unknown> | undefined,
    string_data: data.string_data as Record<string, string> | undefined,
    labels: {},
  };
}

export function extract_k8s_configmap_properties(
  data: Record<string, unknown>,
  _region: string,
): Record<string, unknown> {
  return {
    namespace: data.namespace as string | undefined,
    data: data.data as Record<string, string> | undefined,
    labels: {},
  };
}

export function extract_k8s_pvc_properties(data: Record<string, unknown>, _region: string): Record<string, unknown> {
  return {
    namespace: data.namespace as string | undefined,
    size_gi: (data.size_gi as number) ?? (data.size as number) ?? 10,
    access_modes: (data.access_modes as string[]) ?? ['ReadWriteOnce'],
    storage_class: data.storage_class as string | undefined,
    labels: {},
  };
}

export function extract_k8s_service_properties(
  data: Record<string, unknown>,
  _region: string,
): Record<string, unknown> {
  // Network.LoadBalancer iceType flips type=LoadBalancer.
  const isLB = data.iceType === 'Network.LoadBalancer';
  return {
    namespace: data.namespace as string | undefined,
    service_type: (data.service_type as string) || (isLB ? 'LoadBalancer' : 'ClusterIP'),
    selector_app: data.selector_app as string | undefined,
    port: (data.port as number) ?? 80,
    target_port: (data.target_port as number) ?? (data.port as number) ?? 80,
    protocol: (data.protocol as string) || 'TCP',
    annotations: data.annotations as Record<string, string> | undefined,
    labels: {},
  };
}

export function extract_k8s_deployment_properties(
  data: Record<string, unknown>,
  _region: string,
): Record<string, unknown> {
  const isWorker = data.iceType === 'Compute.Worker' || data.service_type === 'worker';
  return {
    namespace: data.namespace as string | undefined,
    image: (data.image as string) || '',
    image_pull_policy: (data.image_pull_policy as string) || 'IfNotPresent',
    replicas: (data.replicas as number) ?? (isWorker ? 1 : 1),
    port: isWorker ? undefined : ((data.port as number) ?? 8080),
    env_vars: (data.env_vars as Record<string, string>) ?? (data.envVars as Record<string, string>) ?? {},
    cpu_request: (data.cpu_request as string) || '100m',
    memory_request: (data.memory_request as string) || '128Mi',
    cpu_limit: (data.cpu_limit as string) || '1',
    memory_limit: (data.memory_limit as string) || '512Mi',
    service_account: data.service_account as string | undefined,
    service_type: isWorker ? 'worker' : 'service',
    labels: {},
  };
}

/**
 * StatefulSet profile picker. Inspects iceType (Database.* / Messaging.*)
 * and picks image + port + data_path defaults. Operator overrides via
 * explicit properties.
 */
export function extract_k8s_statefulset_properties(
  data: Record<string, unknown>,
  _region: string,
): Record<string, unknown> {
  const iceType = (data.iceType as string) || '';
  const profiles: Record<string, { image: string; port: number; data_path: string }> = {
    'Database.PostgreSQL': { image: 'postgres:17-alpine', port: 5432, data_path: '/var/lib/postgresql/data' },
    'Database.MySQL': { image: 'mysql:9', port: 3306, data_path: '/var/lib/mysql' },
    'Database.Redis': { image: 'redis:7-alpine', port: 6379, data_path: '/data' },
    'Database.Cache': { image: 'redis:7-alpine', port: 6379, data_path: '/data' },
    'Database.MongoDB': { image: 'mongo:8', port: 27017, data_path: '/data/db' },
    'Messaging.RabbitMQ': { image: 'rabbitmq:3.13', port: 5672, data_path: '/var/lib/rabbitmq' },
    'Messaging.EventStream': { image: 'confluentinc/cp-kafka:7', port: 9092, data_path: '/var/lib/kafka' },
  };
  const profile = profiles[iceType] ?? { image: '', port: 5432, data_path: '/data' };
  return {
    namespace: data.namespace as string | undefined,
    image: (data.image as string) || profile.image,
    port: (data.port as number) ?? profile.port,
    data_path: (data.data_path as string) || profile.data_path,
    storage_size_gi: (data.storage_size_gi as number) ?? (data.storage as number) ?? 10,
    storage_class: data.storage_class as string | undefined,
    replicas: (data.replicas as number) ?? 1,
    env_vars: (data.env_vars as Record<string, string>) ?? {},
    cpu_request: (data.cpu_request as string) || '250m',
    memory_request: (data.memory_request as string) || '256Mi',
    cpu_limit: (data.cpu_limit as string) || '1',
    memory_limit: (data.memory_limit as string) || '1Gi',
    labels: {},
  };
}

export function extract_k8s_cronjob_properties(
  data: Record<string, unknown>,
  _region: string,
): Record<string, unknown> {
  const schedule_map: Record<string, string> = {
    daily: '0 0 * * *',
    hourly: '0 * * * *',
    weekly: '0 0 * * 0',
    monthly: '0 0 1 * *',
  };
  const sched = (data.schedule as string) || 'daily';
  return {
    namespace: data.namespace as string | undefined,
    schedule_expression: schedule_map[sched] || sched,
    image: (data.image as string) || '',
    command: data.command as string[] | undefined,
    args: data.args as string[] | undefined,
    env_vars: (data.env_vars as Record<string, string>) ?? {},
    concurrency_policy: (data.concurrency_policy as string) || 'Forbid',
    labels: {},
  };
}

export function extract_k8s_ingress_properties(
  data: Record<string, unknown>,
  _region: string,
): Record<string, unknown> {
  return {
    namespace: data.namespace as string | undefined,
    host: (data.host as string) || (data.domain as string) || '',
    service_name: data.service_name as string | undefined,
    service_port: (data.service_port as number) ?? 80,
    path: (data.path as string) || '/',
    path_type: (data.path_type as string) || 'Prefix',
    ingress_class: (data.ingress_class as string) || 'nginx',
    tls_secret_name: data.tls_secret_name as string | undefined,
    cert_manager_issuer: data.cert_manager_issuer as string | undefined,
    annotations: data.annotations as Record<string, string> | undefined,
    labels: {},
  };
}

export function extract_k8s_networkpolicy_properties(
  data: Record<string, unknown>,
  _region: string,
): Record<string, unknown> {
  return {
    namespace: data.namespace as string | undefined,
    pod_selector: data.pod_selector as Record<string, unknown> | undefined,
    policy_types: (data.policy_types as string[]) ?? ['Ingress', 'Egress'],
    ingress: data.ingress as unknown[] | undefined,
    egress: data.egress as unknown[] | undefined,
    labels: {},
  };
}

export function extract_k8s_job_properties(data: Record<string, unknown>, _region: string): Record<string, unknown> {
  return {
    namespace: data.namespace as string | undefined,
    image: (data.image as string) || '',
    command: data.command as string[] | undefined,
    args: data.args as string[] | undefined,
    env_vars: (data.env_vars as Record<string, string>) ?? {},
    backoff_limit: (data.backoff_limit as number) ?? 3,
    completions: (data.completions as number) ?? 1,
    parallelism: (data.parallelism as number) ?? 1,
    labels: {},
  };
}

export function extract_k8s_serviceaccount_properties(
  data: Record<string, unknown>,
  _region: string,
): Record<string, unknown> {
  return {
    namespace: data.namespace as string | undefined,
    automount_token: data.automount_token !== false,
    annotations: data.annotations as Record<string, string> | undefined,
    labels: {},
  };
}

export function extract_k8s_hpa_properties(data: Record<string, unknown>, _region: string): Record<string, unknown> {
  return {
    namespace: data.namespace as string | undefined,
    target_deployment: (data.target_deployment as string) || (data.target_name as string) || '',
    min_replicas: (data.min_replicas as number) ?? 1,
    max_replicas: (data.max_replicas as number) ?? 10,
    metrics: data.metrics as unknown[] | undefined,
    labels: {},
  };
}

export function extract_k8s_certmanager_certificate_properties(
  data: Record<string, unknown>,
  _region: string,
): Record<string, unknown> {
  return {
    namespace: data.namespace as string | undefined,
    secret_name: data.secret_name as string | undefined,
    dns_names: (data.dns_names as string[]) ?? (data.domain ? [data.domain as string] : []),
    duration: (data.duration as string) || '2160h',
    renew_before: (data.renew_before as string) || '360h',
    issuer_name: (data.issuer_name as string) || 'letsencrypt-prod',
    issuer_kind: (data.issuer_kind as string) || 'ClusterIssuer',
    labels: {},
  };
}

export function extract_k8s_knative_service_properties(
  data: Record<string, unknown>,
  _region: string,
): Record<string, unknown> {
  return {
    namespace: data.namespace as string | undefined,
    image: (data.image as string) || '',
    port: (data.port as number) ?? 8080,
    env_vars: (data.env_vars as Record<string, string>) ?? {},
    min_scale: (data.min_scale as number) ?? 0,
    max_scale: (data.max_scale as number) ?? 10,
    labels: {},
  };
}

export function extract_k8s_prometheus_rule_properties(
  data: Record<string, unknown>,
  _region: string,
): Record<string, unknown> {
  return {
    namespace: data.namespace as string | undefined,
    group_name: data.group_name as string | undefined,
    alert_name: data.alert_name as string | undefined,
    expr: (data.expr as string) || 'up == 0',
    for: (data.for as string) || '5m',
    severity: (data.severity as string) || 'warning',
    rules: data.rules as unknown[] | undefined,
    groups: data.groups as unknown[] | undefined,
    annotations: data.annotations as Record<string, string> | undefined,
    labels: {},
  };
}

export function extract_k8s_pdb_properties(data: Record<string, unknown>, _region: string): Record<string, unknown> {
  return {
    namespace: data.namespace as string | undefined,
    min_available: (data.min_available as number | string) ?? '50%',
    match_labels: data.match_labels as Record<string, string> | undefined,
    labels: {},
  };
}
