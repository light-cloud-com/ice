/**
 * Stable resource-name generation for the card-to-graph translator.
 *
 * Produces deterministic, short, collision-resistant names from canvas
 * node ids. The hash seed (`project::env::node_id`) is the identity
 * anchor for every deployed resource — changing the seed format causes
 * destroy-recreate on every existing deployment, so the format here is
 * load-bearing and verbatim from the original orchestrator implementation.
 */

import { createHash } from 'crypto';
import { sanitize_name } from './name-utils';

/**
 * Generate a stable resource name from the canvas node id, the concrete
 * resource type, and the owning project + environment. Deterministic,
 * short, collision-resistant. Renaming a block doesn't change the name;
 * a node moved to a different project / env DOES change because the
 * project+env are part of the seed and the human-readable slug.
 *
 * Resulting form: `ice-<projectSlug>-<envSlug>-<typeSlug>-<hash>` capped
 * at 40 chars — Memorystore Redis is the strictest GCP resource at 40,
 * and the Compute load balancer chain appends suffixes like `-backend`
 * to the forwarding rule's base name (eating ~8 chars of the 63-char
 * Compute budget). 40 fits everywhere; resource budgets above can absorb
 * the 8-char suffix.
 *
 * Slug budgets (sums to 38 incl. 3-char `ice` and 4 dashes):
 *   ice (3) + project (8) + env (4) + type (10) + hash (8) + 4 dashes
 *
 * Project+env in the slug make ownership obvious in the GCP console
 * without them every resource looks like `ice-instance-abc123` and you
 * can't tell which project deployed it.
 */
export const ENV_SHORT: Record<string, string> = {
  production: 'prod',
  staging: 'stage',
  development: 'dev',
};

export function generate_stable_name(
  resource_type: string,
  node_id: string,
  project_name: string,
  environment: string,
): string {
  const type_slug_full = resource_type.split('.').pop() || 'resource';
  // Hash incorporates project+env so the same node_id in different
  // projects produces different names (avoids accidental collisions
  // when projects are duplicated or templates are re-instantiated).
  const seed = `${project_name}::${environment}::${node_id}`;
  const hash = createHash('sha256').update(seed).digest('hex').slice(0, 8);

  // Tight per-segment caps so the assembled name fits Memorystore's
  // 40-char limit even for the longest plausible project name. Slugs
  // sanitized to GCP-safe form (lowercase, dash-separated, no leading
  // digit). Trailing dashes from truncation get stripped so we don't
  // end up with `ice-myproject--prod-…`.
  const project_slug = sanitize_name(project_name).slice(0, 8).replace(/-+$/, '') || 'p';
  const env_short = ENV_SHORT[environment] || sanitize_name(environment).slice(0, 4) || 'env';
  const env_slug = env_short.replace(/-+$/, '') || 'env';
  const t_slug = sanitize_name(type_slug_full).slice(0, 10).replace(/-+$/, '') || 'res';

  return sanitize_name(`ice-${project_slug}-${env_slug}-${t_slug}-${hash}`);
}
