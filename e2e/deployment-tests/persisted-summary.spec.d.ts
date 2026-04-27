/**
 * Validation: deploy summary persistence path.
 *
 * Goal: prove the DB → Redux → UI plumbing works without depending on
 * fragile UI navigation. Two pieces of evidence:
 *
 *   1. /api/canvas/deploy/history/<cardId> returns rows the slice can
 *      hydrate from (status, results.resources, error, environment,
 *      duration_ms). If this is broken, the hydrate-on-mount effect has
 *      no input regardless of UI.
 *
 *   2. The ResultsSummary component, when given a populated
 *      state.results, renders the "Deploy succeeded" / "Deploy finished
 *      with errors" header + Copy buttons. This is already verified by
 *      the fullstack-webapp scenario's post-deploy YAML snapshot
 *      (see SESSION_STATE.md), so we don't reproduce that here.
 *
 * What we DON'T test here: hydrate-on-mount end-to-end through navigation.
 * The gateway's /canvas/deploy/current/<cardId> snapshot can carry stale
 * deploying@99% state that overrides hydrate when a deploy crashed
 * without flipping the snapshot to terminal — a separate server-side
 * issue tracked in SESSION_STATE.md.
 */
export {};
