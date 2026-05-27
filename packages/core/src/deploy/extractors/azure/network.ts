/**
 * Property extractors for Azure network services.
 *
 * Resources covered:
 *   - azure.network.virtualNetwork              (Network.VPC)
 *   - azure.network.subnet                      (Network.Subnet)
 *   - azure.network.networkSecurityGroup        (Network.SecurityGroup)
 *   - azure.network.privateEndpoint             (Network.PrivateNetwork)
 *   - azure.network.dnsZone                     (Network.CustomDomain)
 *   - azure.network.applicationGateway          (Network.LoadBalancer — regional)
 *   - azure.network.frontDoor                   (Network.LoadBalancer — global)
 *   - azure.network.webApplicationFirewallPolicy (Security.WAF)
 *   - azure.apimanagement.service               (Network.Gateway)
 *   - azure.containerservice.managedCluster     (Compute.Kubernetes)
 *   - azure.containerregistry.registry          (Compute.ContainerRegistry)
 */

/** Virtual Network. Default address space matches AWS / GCP defaults. */
export function extract_azure_vnet_properties(data: Record<string, unknown>, region: string): Record<string, unknown> {
  return {
    region,
    location: (data.location as string) || region,
    address_prefixes:
      (data.address_prefixes as string[]) || (data.cidr_block ? [data.cidr_block as string] : ['10.0.0.0/16']),
    tags: {},
  };
}

/** Subnet. Parent vnet is supplied via canvas wiring or properties. */
export function extract_azure_subnet_properties(
  data: Record<string, unknown>,
  region: string,
): Record<string, unknown> {
  return {
    region,
    location: (data.location as string) || region,
    virtual_network_name: (data.virtual_network_name as string) || (data.vnet_name as string) || '',
    cidr_block: (data.cidr_block as string) || '10.0.1.0/24',
    tags: {},
  };
}

/** Network Security Group. Rules come from canvas ingress/egress entries. */
export function extract_azure_nsg_properties(data: Record<string, unknown>, region: string): Record<string, unknown> {
  return {
    region,
    location: (data.location as string) || region,
    rules: (data.rules as unknown[]) || (data.security_rules as unknown[]) || [],
    tags: {},
  };
}

/** Private Endpoint. Targets a sub-resource of an existing service. */
export function extract_azure_private_endpoint_properties(
  data: Record<string, unknown>,
  region: string,
): Record<string, unknown> {
  return {
    region,
    location: (data.location as string) || region,
    subnet_id: (data.subnet_id as string) || '',
    private_link_service_id: (data.private_link_service_id as string) || (data.target_resource_id as string) || '',
    group_ids: (data.group_ids as string[]) || (data.sub_resource_names as string[]) || [],
    tags: {},
  };
}

/** DNS Zone. Public DNS by default; private flag flips to privateZones. */
export function extract_azure_dns_zone_properties(
  data: Record<string, unknown>,
  region: string,
): Record<string, unknown> {
  return {
    region,
    location: (data.location as string) || region || 'global',
    zone_name: (data.zone_name as string) || (data.domain as string) || '',
    private: data.private === true,
    tags: {},
  };
}

/** Application Gateway. Regional L7 load balancer. */
export function extract_azure_app_gateway_properties(
  data: Record<string, unknown>,
  region: string,
): Record<string, unknown> {
  return {
    region,
    location: (data.location as string) || region,
    sku_name: (data.sku_name as string) || (data.tier as string) || 'Standard_v2',
    sku_tier: (data.sku_tier as string) || 'Standard_v2',
    capacity: (data.capacity as number) ?? 2,
    subnet_id: (data.subnet_id as string) || '',
    tags: {},
  };
}

/** Front Door (Standard/Premium). Global L7. */
export function extract_azure_front_door_properties(
  data: Record<string, unknown>,
  region: string,
): Record<string, unknown> {
  return {
    region,
    location: (data.location as string) || 'global',
    sku_name: (data.sku_name as string) || (data.tier as string) || 'Standard_AzureFrontDoor',
    tags: {},
  };
}

/** WAF policy. Detection mode by default — operators flip to Prevention. */
export function extract_azure_waf_properties(data: Record<string, unknown>, region: string): Record<string, unknown> {
  return {
    region,
    location: (data.location as string) || region,
    mode: (data.mode as string) || 'Detection',
    managed_rules: (data.managed_rules as unknown[]) || [],
    custom_rules: (data.custom_rules as unknown[]) || [],
    tags: {},
  };
}

/** API Management. Developer tier by default (cheapest, no SLA). */
export function extract_azure_apim_properties(data: Record<string, unknown>, region: string): Record<string, unknown> {
  return {
    region,
    location: (data.location as string) || region,
    sku_name: (data.sku_name as string) || (data.tier as string) || 'Developer',
    sku_capacity: (data.sku_capacity as number) ?? 1,
    publisher_email: (data.publisher_email as string) || 'admin@example.com',
    publisher_name: (data.publisher_name as string) || 'ice',
    tags: {},
  };
}

/** AKS managed cluster. Small node pool by default. */
export function extract_azure_aks_properties(data: Record<string, unknown>, region: string): Record<string, unknown> {
  return {
    region,
    location: (data.location as string) || region,
    kubernetes_version: (data.kubernetes_version as string) || (data.version as string) || undefined,
    node_count: (data.node_count as number) ?? 1,
    vm_size: (data.vm_size as string) || 'Standard_D2s_v3',
    dns_prefix: (data.dns_prefix as string) || 'icek8s',
    tags: {},
  };
}

/** Container Registry. Basic SKU by default. */
export function extract_azure_acr_properties(data: Record<string, unknown>, region: string): Record<string, unknown> {
  return {
    region,
    location: (data.location as string) || region,
    sku_name: (data.sku_name as string) || (data.tier as string) || 'Basic',
    admin_user_enabled: data.admin_user_enabled === true,
    tags: {},
  };
}
