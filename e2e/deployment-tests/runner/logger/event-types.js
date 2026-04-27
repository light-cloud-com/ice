/**
 * Deployment-test event types.
 *
 * Every line in events.jsonl is one of these. Discriminated union by `kind`.
 *
 * Common envelope fields are applied by RunLogger (ts, runId, scenarioId,
 * phase, step, seq) — callers only supply `kind` + payload.
 */
export {};
