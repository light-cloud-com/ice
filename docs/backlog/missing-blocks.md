# Missing Blocks Backlog

## Current Inventory

| Provider | Blocks | Categories Covered |
|---|---|---|
| AWS | 27 | frontend, backend, compute, data, storage, networking, messaging, security, observability, ai, analytics |
| GCP | 26 | frontend, backend, compute, data, storage, networking, messaging, security, observability, ai, analytics |
| Azure | 25 | frontend, backend, compute, data, storage, networking, messaging, security, observability, ai, analytics |
| Kubernetes | 15 | frontend, backend, data, storage, networking, messaging, observability, ai, analytics |
| DigitalOcean | 12 | frontend, backend, compute, data, storage, networking, messaging |
| Alibaba | 11 | frontend, backend, compute, data, storage, networking, messaging |
| OCI | 11 | frontend, backend, compute, data, storage, networking, messaging |
| Common | 3 | source, config, networking |
| **Total** | **130** | |

### Categories missing from ALL providers
- **CI/CD** — No build pipeline, container registry, or deployment pipeline block exists anywhere
- **Networking-advanced** — No VPC, firewall rules, security groups, or DNS blocks
- **Workflow/orchestration** — No Step Functions, Cloud Workflows, Logic Apps, or Argo Workflows

---

## Structural Issues (P0)

### BLK-1: No `connections` field on `BlockBlueprint`
**File:** `packages/blocks/src/types.ts`

The `BlockBlueprint` interface has no `connections` or `ports` property. Canvas edges carry no semantic type information. There's nothing to validate that a backend connects to a database and not another backend.

**Fix:** Add `connections: { inputs: string[], outputs: string[] }` to the interface. Define which block types can connect to which.

### BLK-2: Sparse `nodeData` on most blocks
Security, storage, messaging, networking, and log blocks have only `iceType` as their data — no configurable properties. Users select a block and see an empty properties panel.

**Fix:** Add meaningful defaults: retention periods, size tiers, regions, access modes, etc.

---

## Factual Errors (P0)

### BLK-3: `gcp-event-stream` mislabeled as Dataflow
**File:** `packages/blocks/src/gcp/messaging/event-stream.ts`

Description says "Google Cloud Dataflow" but Dataflow is a processing engine, not a message broker. Should be Pub/Sub or Kafka-compatible streaming.

### BLK-4: `gcp-search` references non-existent "Google Elasticsearch Service"
**File:** `packages/blocks/src/gcp/analytics/search.ts`

GCP has no managed Elasticsearch. Should reference Vertex AI Search or be labeled as self-hosted.

### BLK-5: `azure-vector-db` and `azure-search` are the same service
**Files:** `packages/blocks/src/azure/ai/vector-db.ts`, `packages/blocks/src/azure/analytics/search.ts`

Both map to Azure AI Search. One should be removed or they should be differentiated.

### BLK-6: `aws-public-traffic` uses CloudFront instead of ALB
**File:** `packages/blocks/src/aws/networking/public-traffic.ts`

CloudFront is a CDN, not a load balancer. The internet entry point for backend services should be an Application Load Balancer.

### BLK-7: Azure missing `worker` block
Every other production provider (AWS, GCP, Kubernetes) has a worker block. Azure does not.

### BLK-8: Duplicate storage blocks on Alibaba, OCI, and DigitalOcean
- `alibaba-storage` + `oss` — same service
- `oci-storage` + `oci-object-storage` — same service
- `digitalocean-storage` + `do-spaces` — same service

Consolidate each pair into one block.

---

## GCP Missing Blocks (P1-P2)

### Networking
| Block | Service | Priority |
|---|---|---|
| `gcp-vpc` | Virtual Private Cloud | P1 |
| `gcp-firewall` | VPC Firewall Rules | P1 |
| `gcp-cloud-cdn` | Cloud CDN | P2 |
| `gcp-cloud-armor` | Cloud Armor (WAF/DDoS) | P2 |
| `gcp-cloud-dns` | Cloud DNS | P2 |
| `gcp-cloud-nat` | Cloud NAT | P3 |

### Compute
| Block | Service | Priority |
|---|---|---|
| `gcp-gke` | GKE (distinct from generic K8s) | P1 |
| `gcp-compute-engine` | Compute Engine VM | P2 |

### CI/CD
| Block | Service | Priority |
|---|---|---|
| `gcp-cloud-build` | Cloud Build | P1 |
| `gcp-artifact-registry` | Artifact Registry | P1 |
| `gcp-cloud-deploy` | Cloud Deploy | P3 |

### Data
| Block | Service | Priority |
|---|---|---|
| `gcp-spanner` | Cloud Spanner | P2 |
| `gcp-bigtable` | Cloud Bigtable | P2 |
| `gcp-alloydb` | AlloyDB | P3 |

### Workflow
| Block | Service | Priority |
|---|---|---|
| `gcp-cloud-tasks` | Cloud Tasks | P1 |
| `gcp-eventarc` | Eventarc | P1 |
| `gcp-workflows` | Cloud Workflows | P2 |

### Analytics
| Block | Service | Priority |
|---|---|---|
| `gcp-dataflow` | Dataflow (actual, not mislabeled) | P2 |
| `gcp-dataproc` | Dataproc (Spark/Hadoop) | P3 |
| `gcp-composer` | Cloud Composer (Airflow) | P3 |

### Security
| Block | Service | Priority |
|---|---|---|
| `gcp-iam` | Cloud IAM (service identity) | P2 |
| `gcp-certificate-manager` | Certificate Manager | P3 |

---

## AWS Missing Blocks (P1-P2)

### Networking
| Block | Service | Priority |
|---|---|---|
| `aws-vpc` | VPC | P1 |
| `aws-security-group` | Security Groups | P1 |
| `aws-alb` | Application Load Balancer | P1 |
| `aws-route53` | Route 53 DNS | P2 |
| `aws-waf` | AWS WAF | P2 |
| `aws-nlb` | Network Load Balancer | P3 |

### Compute
| Block | Service | Priority |
|---|---|---|
| `aws-eks` | EKS (distinct from generic K8s) | P1 |
| `aws-ec2` | EC2 instances | P2 |
| `aws-app-runner` | App Runner | P3 |

### CI/CD
| Block | Service | Priority |
|---|---|---|
| `aws-ecr` | Elastic Container Registry | P1 |
| `aws-codepipeline` | CodePipeline | P2 |
| `aws-codebuild` | CodeBuild | P2 |

### Data
| Block | Service | Priority |
|---|---|---|
| `aws-aurora` | Aurora (MySQL/PostgreSQL) | P1 |
| `aws-neptune` | Neptune (graph DB) | P3 |
| `aws-timestream` | Timestream (time-series) | P3 |

### Workflow
| Block | Service | Priority |
|---|---|---|
| `aws-step-functions` | Step Functions | P1 |
| `aws-eventbridge` | EventBridge (full event bus) | P1 |
| `aws-appsync` | AppSync (GraphQL) | P3 |

### Analytics
| Block | Service | Priority |
|---|---|---|
| `aws-glue` | Glue (ETL) | P2 |
| `aws-athena` | Athena (S3 SQL) | P3 |
| `aws-msk` | MSK (Managed Kafka) | P3 |

### Security
| Block | Service | Priority |
|---|---|---|
| `aws-iam-role` | IAM Role | P2 |
| `aws-kms` | KMS | P3 |
| `aws-certificate-manager` | ACM | P3 |

---

## Azure Missing Blocks (P1-P2)

### Networking
| Block | Service | Priority |
|---|---|---|
| `azure-vnet` | Virtual Network | P1 |
| `azure-nsg` | Network Security Group | P1 |
| `azure-app-gateway` | Application Gateway (L7 LB) | P2 |
| `azure-dns` | Azure DNS | P2 |
| `azure-firewall` | Azure Firewall | P3 |

### Compute
| Block | Service | Priority |
|---|---|---|
| `azure-aks` | AKS (distinct from generic K8s) | P1 |
| `azure-worker` | Container Apps worker | P1 |
| `azure-vm` | Virtual Machine | P2 |
| `azure-app-service` | App Service (PaaS) | P2 |

### CI/CD
| Block | Service | Priority |
|---|---|---|
| `azure-acr` | Container Registry | P1 |
| `azure-devops` | Azure DevOps Pipelines | P2 |

### Data
| Block | Service | Priority |
|---|---|---|
| `azure-sql` | Azure SQL Database | P1 |
| `azure-sql-mi` | SQL Managed Instance | P3 |

### Workflow
| Block | Service | Priority |
|---|---|---|
| `azure-logic-apps` | Logic Apps | P1 |
| `azure-data-factory` | Data Factory (ETL) | P2 |
| `azure-event-grid` | Event Grid | P2 |

### Analytics
| Block | Service | Priority |
|---|---|---|
| `azure-databricks` | Databricks | P2 |
| `azure-stream-analytics` | Stream Analytics | P3 |

---

## Kubernetes Missing Blocks (P2)

| Block | Category | Priority |
|---|---|---|
| `kubernetes-secret` | security | P2 |
| `kubernetes-rbac` | security | P2 |
| `kubernetes-postgresql` | data | P2 |
| `kubernetes-mysql` | data | P2 |
| `kubernetes-configmap` | config | P2 |
| `kubernetes-namespace` | networking | P3 |
| `kubernetes-network-policy` | security | P3 |
| `kubernetes-hpa` | compute | P3 |
| `kubernetes-service-mesh` | networking | P3 |

---

## Common Missing Blocks (P2-P3)

| Block | Category | Priority |
|---|---|---|
| `gitlab-repository` | source | P2 |
| `bitbucket-repository` | source | P2 |
| `container-registry` | source | P2 |
| `ssl-certificate` | security | P2 |
| `dns-record` | networking | P3 |
| `notification` | observability | P3 |
| `email-service` | messaging | P3 |
| `monitoring-apm` | observability | P3 |

---

## Minor Providers (Alibaba, OCI, DigitalOcean)

These providers are missing entire categories (security, observability, ai, analytics). Before adding individual blocks, decide whether these providers should reach parity with the big three or remain "design-only" with limited coverage.

### Minimum viable additions per provider:

**Alibaba:** scalable-backend (ECS), postgresql (ApsaraDB RDS), secrets (KMS), logs (SLS)
**OCI:** scalable-backend (Container Instances), worker, secrets (OCI Vault), logs (OCI Logging)
**DigitalOcean:** serverless-function (Functions standalone), secrets, logs (Monitoring)
