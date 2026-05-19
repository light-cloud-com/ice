/**
 * Skill detection — classify a user intent into one of the named AI
 * skills the system prompt swaps in.
 *
 * `detectSkill` returns 'cloud-architect' for end-to-end build/design
 * intents and 'default' otherwise. `isQuestionIntent` is a separate
 * read-state classifier used to decide whether the system prompt
 * should inject the deployment-context block.
 */

export type AiSkill = 'cloud-architect' | 'default';

/**
 * Regex triggers for the cloud-architect skill. Tuned to fire on
 * "I want to build", "what infra do I need", "design the platform",
 * "production-ready X", category nouns (saas, marketplace, fintech),
 * and similar end-to-end build/architecture phrasings.
 *
 * Ordering is not load-bearing — `detectSkill` short-circuits on the
 * first match, so the more specific patterns ("microservice
 * architecture", "production-ready") happily live alongside broad
 * ones ("saas|platform|marketplace") because both reach the same
 * 'cloud-architect' verdict.
 */
export const ARCHITECT_TRIGGERS = [
  /\b(?:i want to (?:build|create|make|launch|develop|design))\b/i,
  /\b(?:what (?:infra(?:structure)?|resources?|services?|cloud) (?:do i|would i|should i|will i) need)\b/i,
  /\b(?:design (?:the |a )?(?:cloud|infra(?:structure)?|architecture|platform|setup|system))\b/i,
  /\b(?:what (?:does|would) .+ (?:need|require|look like))\b/i,
  /\b(?:architect(?:ure)? for)\b/i,
  /\b(?:full (?:stack|infrastructure|architecture|setup))\b/i,
  /\b(?:platform (?:like|similar to|for))\b/i,
  /\b(?:saas|platform|marketplace|e-?commerce|social (?:media|network)|streaming|fintech|healthtech)\b/i,
  /\b(?:microservice(?:s)? architecture)\b/i,
  /\b(?:production[- ]ready|enterprise[- ]grade|scalable (?:system|app|platform))\b/i,
];

/**
 * Classify an intent into a named skill. Returns 'cloud-architect'
 * if any ARCHITECT_TRIGGERS pattern matches, 'default' otherwise.
 */
export function detectSkill(intent: string): AiSkill {
  for (const trigger of ARCHITECT_TRIGGERS) {
    if (trigger.test(intent)) return 'cloud-architect';
  }
  return 'default';
}

/**
 * Detects intents asking about current deployment state rather than building.
 * Matches question-shaped openers ("what is", "how many", "is X running") and
 * state-query phrases. Tight enough to avoid swallowing "add a deployed X".
 */
export function isQuestionIntent(intent: string): boolean {
  const trimmed = intent.trim();
  return (
    /^(?:what|when|why|how|is|are|does|did|show me|tell me|describe|list)\b/i.test(trimmed) ||
    /\b(?:deployment\s+status|current\s+state|last\s+deploy|health\s*check|instance\s+count|what's\s+deployed)\b/i.test(
      trimmed,
    )
  );
}
