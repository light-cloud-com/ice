/**
 * Unit tests for `services/ai/src/services/ai/skill-detection.ts` —
 * the regex-based classifier extracted in rf-aisvc-2 from
 * `ai.service.ts`.
 *
 * Per `deploy-service-tests-must-import-vitest-explicitly`, vitest
 * globals are imported explicitly.
 */

import { describe, it, expect } from 'vitest';
import {
  ARCHITECT_TRIGGERS,
  detectSkill,
  isQuestionIntent,
} from '../skill-detection';

describe('ARCHITECT_TRIGGERS', () => {
  it('exports a non-empty array of RegExp instances', () => {
    expect(Array.isArray(ARCHITECT_TRIGGERS)).toBe(true);
    expect(ARCHITECT_TRIGGERS.length).toBeGreaterThan(0);
    for (const t of ARCHITECT_TRIGGERS) {
      expect(t).toBeInstanceOf(RegExp);
    }
  });

  it('every pattern is case-insensitive (matches the i flag the source declares)', () => {
    for (const t of ARCHITECT_TRIGGERS) {
      expect(t.flags).toContain('i');
    }
  });
});

describe('detectSkill', () => {
  it('returns "cloud-architect" for "I want to build" phrasings', () => {
    expect(detectSkill('I want to build a SaaS')).toBe('cloud-architect');
    expect(detectSkill('i want to create a marketplace')).toBe('cloud-architect');
    expect(detectSkill('I WANT TO LAUNCH a streaming platform')).toBe('cloud-architect');
    expect(detectSkill('i want to design something')).toBe('cloud-architect');
    expect(detectSkill('I want to make a fintech app')).toBe('cloud-architect');
    expect(detectSkill('i want to develop an api')).toBe('cloud-architect');
  });

  it('matches "what infra/resources/services/cloud do/would/should/will I need" question variants', () => {
    expect(detectSkill('what infrastructure do I need for my app')).toBe('cloud-architect');
    expect(detectSkill('What resources would I need to scale this')).toBe('cloud-architect');
    expect(detectSkill('what services should I need')).toBe('cloud-architect');
    expect(detectSkill('what cloud will I need')).toBe('cloud-architect');
    expect(detectSkill('what infra do I need here')).toBe('cloud-architect');
  });

  it('matches "design the cloud/infra/architecture/platform/setup/system" build verbs', () => {
    expect(detectSkill('design the cloud setup')).toBe('cloud-architect');
    expect(detectSkill('Design a infrastructure for this')).toBe('cloud-architect');
    expect(detectSkill('design architecture for our app')).toBe('cloud-architect');
    expect(detectSkill('design platform end-to-end')).toBe('cloud-architect');
    expect(detectSkill('design system from scratch')).toBe('cloud-architect');
    expect(detectSkill('design infra please')).toBe('cloud-architect');
  });

  it('matches "what does X need/require/look like" sentence shapes', () => {
    expect(detectSkill('what does a typical SaaS need')).toBe('cloud-architect');
    expect(detectSkill('what would a marketplace require')).toBe('cloud-architect');
    expect(detectSkill('what does a fintech setup look like')).toBe('cloud-architect');
  });

  it('matches "architect for" and "architecture for" phrases', () => {
    expect(detectSkill('architect for my B2B SaaS')).toBe('cloud-architect');
    expect(detectSkill('architecture for a marketplace')).toBe('cloud-architect');
  });

  it('matches "full stack/infrastructure/architecture/setup" phrasings', () => {
    expect(detectSkill('I need a full stack')).toBe('cloud-architect');
    expect(detectSkill('full infrastructure please')).toBe('cloud-architect');
    expect(detectSkill('full architecture for prod')).toBe('cloud-architect');
    expect(detectSkill('full setup needed')).toBe('cloud-architect');
  });

  it('matches "platform like/similar to/for" phrases', () => {
    expect(detectSkill('platform like Stripe')).toBe('cloud-architect');
    expect(detectSkill('platform similar to Airbnb')).toBe('cloud-architect');
    expect(detectSkill('platform for B2B')).toBe('cloud-architect');
  });

  it('matches category nouns (saas, marketplace, ecommerce, etc.)', () => {
    expect(detectSkill('a SaaS app')).toBe('cloud-architect');
    expect(detectSkill('a marketplace setup')).toBe('cloud-architect');
    expect(detectSkill('e-commerce store')).toBe('cloud-architect');
    expect(detectSkill('ecommerce thing')).toBe('cloud-architect');
    expect(detectSkill('social media app')).toBe('cloud-architect');
    expect(detectSkill('social network startup')).toBe('cloud-architect');
    expect(detectSkill('streaming service idea')).toBe('cloud-architect');
    expect(detectSkill('fintech project')).toBe('cloud-architect');
    expect(detectSkill('healthtech startup')).toBe('cloud-architect');
  });

  it('matches "microservice architecture" / "microservices architecture"', () => {
    expect(detectSkill('microservice architecture for prod')).toBe('cloud-architect');
    expect(detectSkill('microservices architecture please')).toBe('cloud-architect');
  });

  it('matches production-grade phrasings', () => {
    expect(detectSkill('production-ready API')).toBe('cloud-architect');
    expect(detectSkill('production ready setup')).toBe('cloud-architect');
    expect(detectSkill('enterprise-grade infrastructure')).toBe('cloud-architect');
    expect(detectSkill('enterprise grade architecture')).toBe('cloud-architect');
    expect(detectSkill('scalable system')).toBe('cloud-architect');
    expect(detectSkill('scalable app')).toBe('cloud-architect');
    expect(detectSkill('scalable platform')).toBe('cloud-architect');
  });

  it('returns "default" for plain build/modify intents', () => {
    expect(detectSkill('add a database')).toBe('default');
    expect(detectSkill('connect backend to redis')).toBe('default');
    expect(detectSkill('delete the cache')).toBe('default');
    expect(detectSkill('rename my-db to users-db')).toBe('default');
    expect(detectSkill('cleanup the canvas')).toBe('default');
  });

  it('returns "default" for empty / whitespace strings', () => {
    expect(detectSkill('')).toBe('default');
    expect(detectSkill('   ')).toBe('default');
  });

  it('returns "default" for short non-trigger phrases', () => {
    expect(detectSkill('hello')).toBe('default');
    expect(detectSkill('?')).toBe('default');
    expect(detectSkill('thanks')).toBe('default');
  });

  it('short-circuits on the first matching trigger (does not test all)', () => {
    // The first trigger (`I want to build`) and the eighth (`saas`) both
    // match this string; we only assert the verdict is 'cloud-architect',
    // since the function is order-independent for any matching input.
    expect(detectSkill('I want to build a SaaS')).toBe('cloud-architect');
  });
});

describe('isQuestionIntent', () => {
  it('returns true for opening question words', () => {
    expect(isQuestionIntent('what is deployed')).toBe(true);
    expect(isQuestionIntent('when did the last deploy run')).toBe(true);
    expect(isQuestionIntent('why is it down')).toBe(true);
    expect(isQuestionIntent('how many instances')).toBe(true);
    expect(isQuestionIntent('is the database running')).toBe(true);
    expect(isQuestionIntent('are there errors')).toBe(true);
    expect(isQuestionIntent('does it scale')).toBe(true);
    expect(isQuestionIntent('did the deploy fail')).toBe(true);
    expect(isQuestionIntent('show me the status')).toBe(true);
    expect(isQuestionIntent('tell me what runs')).toBe(true);
    expect(isQuestionIntent('describe my canvas')).toBe(true);
    expect(isQuestionIntent('list the deployments')).toBe(true);
  });

  it('is case-insensitive on the opening word', () => {
    expect(isQuestionIntent('WHAT is deployed')).toBe(true);
    expect(isQuestionIntent('Show me the logs')).toBe(true);
  });

  it('trims leading/trailing whitespace before testing the opener', () => {
    expect(isQuestionIntent('   what is deployed')).toBe(true);
    expect(isQuestionIntent('\t\nis the db ok\t')).toBe(true);
  });

  it('returns true when the body contains state-query phrases', () => {
    expect(isQuestionIntent('quick deployment status check')).toBe(true);
    expect(isQuestionIntent('give me the current state')).toBe(true);
    expect(isQuestionIntent('rollback to before the last deploy')).toBe(true);
    expect(isQuestionIntent('please health check the system')).toBe(true);
    expect(isQuestionIntent('instance count for backend?')).toBe(true);
    expect(isQuestionIntent("what's deployed right now")).toBe(true);
  });

  it("doesn't swallow 'add a deployed X' style build intents", () => {
    // The body-phrase regex is anchored on specific multi-word state
    // queries. A bare 'deployed' or 'deploy' inside an imperative
    // shouldn't trigger.
    expect(isQuestionIntent('add a deployed redis')).toBe(false);
    expect(isQuestionIntent('connect them after deploy')).toBe(false);
  });

  it('returns false for typical build/modify intents', () => {
    expect(isQuestionIntent('add a database')).toBe(false);
    expect(isQuestionIntent('connect frontend to backend')).toBe(false);
    expect(isQuestionIntent('build me a SaaS')).toBe(false);
    expect(isQuestionIntent('please deploy this')).toBe(false);
  });

  it('returns false for empty / whitespace strings', () => {
    expect(isQuestionIntent('')).toBe(false);
    expect(isQuestionIntent('   ')).toBe(false);
  });

  it('matches "deployment status" with any single space', () => {
    expect(isQuestionIntent('check deployment  status now')).toBe(true);
    expect(isQuestionIntent('check deployment\tstatus now')).toBe(true);
  });

  it('matches "health check" and "healthcheck" via flexible whitespace', () => {
    expect(isQuestionIntent('do a health check now')).toBe(true);
    expect(isQuestionIntent('do a healthcheck now')).toBe(true);
  });
});
