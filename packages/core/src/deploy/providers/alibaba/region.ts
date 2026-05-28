/**
 * Alibaba region normalization.
 *
 * Alibaba uses region IDs like `cn-hangzhou`, `cn-shanghai`,
 * `ap-southeast-1`. Settings UI accepts both the ID and the
 * human-readable name; this module resolves either to the canonical
 * ID and exposes the endpoint suffix for SDK loaders.
 */

const REGION_ALIASES: Record<string, string> = {
  hangzhou: 'cn-hangzhou',
  shanghai: 'cn-shanghai',
  beijing: 'cn-beijing',
  shenzhen: 'cn-shenzhen',
  hongkong: 'cn-hongkong',
  singapore: 'ap-southeast-1',
  tokyo: 'ap-northeast-1',
  sydney: 'ap-southeast-2',
  jakarta: 'ap-southeast-5',
  mumbai: 'ap-south-1',
  frankfurt: 'eu-central-1',
  london: 'eu-west-1',
  dubai: 'me-east-1',
  virginia: 'us-east-1',
  silicon: 'us-west-1',
};

export function normalize_region(input: string | undefined): string {
  if (!input) return 'cn-hangzhou';
  const lower = input.toLowerCase().trim();
  return REGION_ALIASES[lower] ?? lower;
}

export function service_endpoint(service: string, region: string): string {
  const r = normalize_region(region);
  return `${service}.${r}.aliyuncs.com`;
}
