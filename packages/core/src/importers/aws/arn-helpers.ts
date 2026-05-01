/**
 * AWS ARN Helpers
 *
 * Pure helpers for parsing components out of an AWS ARN, plus the
 * provider-specific tag-array normalisation used when AWS Resource
 * Explorer returns tags as either `Tags: [{Key, Value}]` or
 * `tags: { ... }`.
 *
 * ARN format:  arn:<partition>:<service>:<region>:<account>:<resource>
 * (the resource portion may itself contain `/` or `:` separators).
 */

/**
 * Extract a name from the trailing resource portion of an ARN.
 *
 * Splits on `/` or `:` once past the 5th `:`; falls back to returning
 * the joined resource portion when there's no separator, or the original
 * ARN when the input doesn't have at least 6 colon-separated segments.
 */
export function extract_name_from_arn(arn: string): string {
  // ARN format: arn:partition:service:region:account:resource
  const parts = arn.split(':');
  if (parts.length >= 6) {
    const resource = parts.slice(5).join(':');
    // Handle resource/name or resource:name formats
    const name_parts = resource.split(/[/:]/);
    return name_parts[name_parts.length - 1] || resource;
  }
  return arn;
}

/**
 * Extract the AWS account id from an ARN.
 *
 * Returns the empty string when the ARN has fewer than 5 segments or
 * the account slot is empty (which is legal for some service ARNs).
 */
export function extract_account_from_arn(arn: string): string {
  const parts = arn.split(':');
  return parts[4] || '';
}

/**
 * Extract the region from an ARN, defaulting to `'global'` when absent.
 *
 * AWS uses an empty region for global services (IAM, CloudFront).  We
 * remap that to the literal string `'global'` because the importer
 * downstream needs a non-empty region label.
 */
export function extract_region_from_arn(arn: string): string {
  const parts = arn.split(':');
  return parts[3] || 'global';
}

/**
 * Parse tags from an AWS Resource Explorer property bag.
 *
 * Two formats are supported:
 *   - `Tags: [{Key, Value}, ...]`  — Resource Explorer's wire format
 *   - `tags: { key: value, ... }`  — already-normalised maps from Config
 *
 * Returns an empty object when neither format is present or `properties`
 * is null/non-object.  Both Key and Value are coerced to string via
 * `String()` to absorb any numeric tag values.
 */
export function parse_tags(properties: unknown): Record<string, string> {
  if (!properties || typeof properties !== 'object') {
    return {};
  }

  const props = properties as Record<string, unknown>;
  const tags: Record<string, string> = {};

  // Try different tag formats
  if (Array.isArray(props.Tags)) {
    for (const tag of props.Tags) {
      if (tag && typeof tag === 'object' && 'Key' in tag && 'Value' in tag) {
        tags[String(tag.Key)] = String(tag.Value);
      }
    }
  } else if (props.tags && typeof props.tags === 'object') {
    Object.assign(tags, props.tags);
  }

  return tags;
}
