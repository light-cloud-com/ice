/**
 * Per-iceType deploy classification flags.
 *
 * Cardinal-rule schema-driven dispatch. The edge classifier reads from
 * this table generically — no `if (iceType === 'X')` branches in the
 * classifier functions. Adding a new block whose iceType changes deploy
 * shape based on context (network isolation, parent nesting, metadata-
 * only behaviour) adds an entry here; classifier code stays unchanged.
 *
 * Why this lives in core/deploy and not on HighLevelResource: the
 * `Network.PrivateNetwork` and `Network.CustomDomain` iceTypes aren't
 * declared in `HIGH_LEVEL_CATEGORIES` (they're authored as blueprints
 * in `@ice/blocks`). Promoting them into HIGH_LEVEL_CATEGORIES is a
 * larger change with palette/properties side-effects; for the
 * classifier's narrow needs a sibling deploy-side table is the
 * smallest correct unit of schema declaration.
 */

export interface BlockDeployClassifiers {
  /**
   * The block represents a network-isolation boundary (a VPC, Private
   * Network, etc.). Services nested inside it should compile to the
   * internal-only variant of their underlying compute resource — see
   * the card-translator's ingress-override branch.
   */
  isolatesNetworkContext?: boolean;
  /**
   * The block has TWO deploy modes depending on parent context:
   *   - STANDALONE (no parent in an isolating container): metadata-only,
   *     consumed by downstream propagation passes but emits no cloud
   *     resource of its own.
   *   - NESTED inside an isolating container: compiles to a real cloud
   *     resource (its provider type-map entry).
   * Example: Network.CustomDomain — standalone = host propagation only,
   * nested inside Network.PrivateNetwork = LB ingress chain.
   */
  metadataOnlyWhenStandalone?: boolean;
}

export const BLOCK_DEPLOY_CLASSIFIERS: Record<string, BlockDeployClassifiers> = {
  'Network.PrivateNetwork': {
    isolatesNetworkContext: true,
  },
  'Network.CustomDomain': {
    metadataOnlyWhenStandalone: true,
  },
};

/** Convenience accessor — empty object for unknown iceTypes. */
export function getBlockDeployClassifiers(iceType: string): BlockDeployClassifiers {
  return BLOCK_DEPLOY_CLASSIFIERS[iceType] ?? {};
}
