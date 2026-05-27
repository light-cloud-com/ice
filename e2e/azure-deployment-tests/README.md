# Azure deployment tests — live-cloud, developer-run

Real-Azure round-trip tests for every handler in `packages/core/src/deploy/providers/azure/handlers/` (and the legacy three under `azure-deployer.ts` until B1 lands). Each test creates a resource, asserts the deployer's `provider_id` shape, then deletes it. The pass/fail is the cardinal-rule deploy gate for the handler.

**Not CI.** These tests touch real Azure, cost real money, take real time. They run on a developer's own subscription, on demand. No scheduled job. No PR gate.

## Setup (one-time)

1. Pick a sandbox Azure subscription dedicated to ICE testing.
2. Sign in:

   ```sh
   az login
   az account set --subscription <YOUR_SUBSCRIPTION_ID>
   ```

   Service-principal flow also works — set `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET` and `DefaultAzureCredential` picks them up.

3. Create the shared test resource group:

   ```sh
   az group create --name ice-test-rg --location eastus --tags ice:test-rg=true
   ```

   Override the name with `AZURE_TEST_RESOURCE_GROUP=<other-rg>` if `ice-test-rg` clashes.

## Run

```sh
export AZURE_SUBSCRIPTION_ID=<your-subscription-id>
export AZURE_LOCATION=eastus

# Run every Azure live test
pnpm test:live:azure

# Run one handler
pnpm test:live:azure storage-account

# Run several (substring match against the .live.test.ts file path)
pnpm test:live:azure storage-account web-app virtual-machine

# Pass vitest flags through
pnpm test:live:azure storage-account --reporter=verbose
```

Without `AZURE_SUBSCRIPTION_ID` or `AZURE_LOCATION` set, every test prints a one-line "skipped — set …" banner. Nothing runs, nothing costs.

## Output

Each run appends events to `runs/<runId>.jsonl`. One file per invocation. The `runId` includes today's date so the directory is human-scannable.

Append a row to the **Deploy verification log** at the bottom of `inprogress/progress.md` referencing the run path. The corresponding `(D)` checkbox in the progress tree flips to `[x]`.

## Resource tagging + cleanup

Every resource is tagged with `ice:test-run-id=<runId>`. If a test crashes hard, resources can leak. To sweep:

```sh
# Dry-run — list orphans older than 1 hour
pnpm tsx e2e/azure-deployment-tests/cleanup-orphans.ts

# Actually delete them
pnpm tsx e2e/azure-deployment-tests/cleanup-orphans.ts --delete
```

The script uses Azure Resource Manager to find anything tagged `ice:test-run-id=*` and deletes resources whose tag value points at a run that ended >1 hour ago. Resource groups tagged `ice:test-rg=true` are not auto-deleted — the shared test RG stays.

## Expected runtime + cost (per handler)

Rough order-of-magnitude estimates for `eastus`. Real numbers depend on subscription / quotas. Table will grow as B2 P0/P1/P2 handlers ship.

| Handler               | Runtime  | Cost notes                                                 |
| --------------------- | -------- | ---------------------------------------------------------- |
| azure-virtual-machine | 2–5 min  | Standard_B1s ~$0.01/hr; pennies per run                    |
| azure-storage-account | < 30s    | LRS Hot tier; free under 5GB                               |
| azure-web-app         | 1–3 min  | F1 Free tier — no charge                                   |
| azure-key-vault       | < 30s    | Standard tier; $0.03 per 10k operations                    |
| azure-service-bus     | 1–2 min  | Standard tier; ~$0.0135/hr; pennies                        |
| azure-cosmosdb        | 2–4 min  | Serverless mode; ~$0.008 per request unit; pennies per run |
| azure-postgresql-flex | 5–10 min | Burstable B1ms ~$0.013/hr; pennies                         |
| azure-mysql-flex      | 5–10 min | Burstable B1ms ~$0.013/hr; pennies                         |
| azure-redis-cache     | 5–10 min | Basic C0 ~$0.022/hr; pennies                               |
| azure-functions       | 1–3 min  | Consumption plan; free up to 1M execs                      |
| azure-container-apps  | 2–4 min  | Consumption; ~$0.000024/vCPU-sec; pennies                  |
| azure-static-web-apps | 1–2 min  | Free tier — no charge                                      |
| azure-log-analytics   | < 30s    | Pay-as-you-go ~$2.30/GB; free under 5GB/mo                 |
| azure-app-insights    | < 30s    | Backed by Log Analytics; same pricing                      |

Full-suite run end-to-end on a quiet subscription: 30–60 minutes, expected cost well under $0.50.

## Adding a new handler

1. Create `packages/core/src/deploy/providers/__tests__/live/azure-<service>.live.test.ts` following the template in [`_live-helpers.ts`](../../packages/core/src/deploy/providers/__tests__/live/_live-helpers.ts) header comments.
2. Add a row to this README's expected-cost table.
3. Run it once on a real subscription: `pnpm test:live:azure <service>`.
4. Append the run to `inprogress/progress.md` → Deploy verification log.
5. Tick the `(D)` checkbox for that handler in the progress tree.
