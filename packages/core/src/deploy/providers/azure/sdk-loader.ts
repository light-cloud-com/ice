/**
 * Azure SDK lazy loader.
 *
 * Centralised lazy loading of `@azure/arm-*` + `@azure/identity`
 * packages. Uses the `Function('m', 'return import(m)')` indirection
 * so bundlers don't try to resolve the optional SDK packages at
 * build time — missing packages fall through to `null` and the
 * caller emits a friendly "install …" message.
 *
 * Parallel to `../aws/sdk-loader.ts`.
 */

/**
 * Dynamically import an Azure SDK package. Returns null when the
 * package isn't installed (test harness intercepts the same pattern
 * via a Function-constructor stub).
 */
export async function load_azure_sdk(module_name: string): Promise<any | null> {
  try {
    return await Function('m', 'return import(m)')(module_name);
  } catch {
    return null;
  }
}

/**
 * Initialise every Azure ARM client that's installed.
 *
 * Per-service short-name → constructor in this table is the schema
 * the rest of the deployer reads. Handlers index the resulting Map
 * by short-name (`ctx.clients.get('compute')`). Missing SDK packages
 * are silently skipped — handlers detect absence and return a clean
 * "install the package" message.
 */
export async function initialize_azure_clients(
  subscription_id: string,
): Promise<{ credential: unknown; clients: Map<string, unknown> }> {
  const clients = new Map<string, unknown>();

  // The legacy monolith let identity load via the same indirection;
  // surface the underlying error verbatim when the package isn't
  // installed so the `Failed to initialize Azure SDK: <message>`
  // wrap in the deployer carries the original SDK-side text.
  const identity_module = '@azure/identity';
  const identity = await Function('m', 'return import(m)')(identity_module);
  const credential = new identity.DefaultAzureCredential();

  const compute = await load_azure_sdk('@azure/arm-compute');
  if (compute) clients.set('compute', new compute.ComputeManagementClient(credential, subscription_id));

  const storage = await load_azure_sdk('@azure/arm-storage');
  if (storage) clients.set('storage', new storage.StorageManagementClient(credential, subscription_id));

  const web = await load_azure_sdk('@azure/arm-appservice');
  if (web) clients.set('web', new web.WebSiteManagementClient(credential, subscription_id));

  const network = await load_azure_sdk('@azure/arm-network');
  if (network) clients.set('network', new network.NetworkManagementClient(credential, subscription_id));

  const resources = await load_azure_sdk('@azure/arm-resources');
  if (resources) clients.set('resources', new resources.ResourceManagementClient(credential, subscription_id));

  const keyvault = await load_azure_sdk('@azure/arm-keyvault');
  if (keyvault) clients.set('keyvault', new keyvault.KeyVaultManagementClient(credential, subscription_id));

  const servicebus = await load_azure_sdk('@azure/arm-servicebus');
  if (servicebus) clients.set('servicebus', new servicebus.ServiceBusManagementClient(credential, subscription_id));

  const cosmos = await load_azure_sdk('@azure/arm-cosmosdb');
  if (cosmos) clients.set('cosmosdb', new cosmos.CosmosDBManagementClient(credential, subscription_id));

  const postgres = await load_azure_sdk('@azure/arm-postgresql-flexible');
  if (postgres)
    clients.set('postgresql-flex', new postgres.PostgreSQLManagementFlexibleServerClient(credential, subscription_id));

  const mysql = await load_azure_sdk('@azure/arm-mysql-flexible');
  if (mysql) clients.set('mysql-flex', new mysql.MySQLManagementFlexibleServerClient(credential, subscription_id));

  const redis = await load_azure_sdk('@azure/arm-rediscache');
  if (redis) clients.set('redis', new redis.RedisManagementClient(credential, subscription_id));

  const monitor = await load_azure_sdk('@azure/arm-monitor');
  if (monitor) clients.set('monitor', new monitor.MonitorClient(credential, subscription_id));

  const loganalytics = await load_azure_sdk('@azure/arm-operationalinsights');
  if (loganalytics)
    clients.set('log-analytics', new loganalytics.OperationalInsightsManagementClient(credential, subscription_id));

  const appinsights = await load_azure_sdk('@azure/arm-appinsights');
  if (appinsights)
    clients.set('app-insights', new appinsights.ApplicationInsightsManagementClient(credential, subscription_id));

  const containerApps = await load_azure_sdk('@azure/arm-appcontainers');
  if (containerApps)
    clients.set('container-apps', new containerApps.ContainerAppsAPIClient(credential, subscription_id));

  const dns = await load_azure_sdk('@azure/arm-dns');
  if (dns) clients.set('dns', new dns.DnsManagementClient(credential, subscription_id));

  const aks = await load_azure_sdk('@azure/arm-containerservice');
  if (aks) clients.set('aks', new aks.ContainerServiceClient(credential, subscription_id));

  const acr = await load_azure_sdk('@azure/arm-containerregistry');
  if (acr) clients.set('acr', new acr.ContainerRegistryManagementClient(credential, subscription_id));

  const apim = await load_azure_sdk('@azure/arm-apimanagement');
  if (apim) clients.set('apim', new apim.ApiManagementClient(credential, subscription_id));

  const cdn = await load_azure_sdk('@azure/arm-cdn');
  if (cdn) clients.set('cdn', new cdn.CdnManagementClient(credential, subscription_id));

  const logic = await load_azure_sdk('@azure/arm-logic');
  if (logic) clients.set('logic', new logic.LogicManagementClient(credential, subscription_id));

  const eventgrid = await load_azure_sdk('@azure/arm-eventgrid');
  if (eventgrid) clients.set('eventgrid', new eventgrid.EventGridManagementClient(credential, subscription_id));

  const eventhub = await load_azure_sdk('@azure/arm-eventhub');
  if (eventhub) clients.set('eventhub', new eventhub.EventHubManagementClient(credential, subscription_id));

  const search = await load_azure_sdk('@azure/arm-search');
  if (search) clients.set('search', new search.SearchManagementClient(credential, subscription_id));

  const cognitiveservices = await load_azure_sdk('@azure/arm-cognitiveservices');
  if (cognitiveservices)
    clients.set(
      'cognitiveservices',
      new cognitiveservices.CognitiveServicesManagementClient(credential, subscription_id),
    );

  const ml = await load_azure_sdk('@azure/arm-machinelearning');
  if (ml) clients.set('ml', new ml.AzureMachineLearningServicesManagementClient(credential, subscription_id));

  const synapse = await load_azure_sdk('@azure/arm-synapse');
  if (synapse) clients.set('synapse', new synapse.SynapseManagementClient(credential, subscription_id));

  const kusto = await load_azure_sdk('@azure/arm-kusto');
  if (kusto) clients.set('kusto', new kusto.KustoManagementClient(credential, subscription_id));

  const aad = await load_azure_sdk('@azure/arm-aad');
  if (aad) clients.set('aad', new aad.ActiveDirectoryB2CManagementClient(credential, subscription_id));

  const sql = await load_azure_sdk('@azure/arm-sql');
  if (sql) clients.set('sql', new sql.SqlManagementClient(credential, subscription_id));

  return { credential, clients };
}
