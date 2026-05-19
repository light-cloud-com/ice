/**
 * Unit tests for `services/ai/src/services/ai/response-parsing.ts`
 * — the parseAiResponse + repairJson helpers extracted in rf-aisvc-5
 * from `ai.service.ts`.
 *
 * Per the `rf-lstream-split-stream-lifecycle-by-dependency-surface`
 * learning, the runPostProcessing helper that originally lived in
 * the same source block was split into its own
 * `post-processing.ts` so this test file does NOT have to mock
 * audit/validateCanvas/dryRunDeploy. The only dep we touch
 * transitively is operation-validation, which is pure.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { parseAiResponse, repairJson } from '../response-parsing';

describe('repairJson', () => {
  it('returns null when input is already canonical (no fixes needed)', () => {
    expect(repairJson('{"a":1}')).toBeNull();
    expect(repairJson('[]')).toBeNull();
    expect(repairJson('{"explanation":"hi","operations":[]}')).toBeNull();
  });

  it('inserts a missing { before "op": after a }, comma', () => {
    const repaired = repairJson('{"operations":[{"op":"a"},"op":"b"}]}');
    expect(repaired).not.toBeNull();
    expect(repaired).toContain('{"op":"b"');
  });

  it('inserts a missing { before "op": after a ], comma', () => {
    const repaired = repairJson('{"operations":[],"op":"b"}');
    expect(repaired).not.toBeNull();
    expect(repaired).toContain('],{"op":"b"');
  });

  it('strips trailing commas before } and ]', () => {
    expect(repairJson('{"a":1,}')).toBe('{"a":1}');
    expect(repairJson('[1,2,3,]')).toBe('[1,2,3]');
    expect(repairJson('{"a":[1,2,]}')).toBe('{"a":[1,2]}');
  });

  it('closes unclosed objects (truncated response)', () => {
    expect(repairJson('{"a":1')).toBe('{"a":1}');
    expect(repairJson('{"a":{"b":2')).toBe('{"a":{"b":2}}');
  });

  it('closes unclosed arrays (truncated response)', () => {
    expect(repairJson('[1,2')).toBe('[1,2]');
  });

  it('closes mixed unclosed brackets in the right order (arrays first, then braces)', () => {
    // Source closes brackets BEFORE braces, regardless of nesting depth.
    expect(repairJson('{"a":[1,2')).toBe('{"a":[1,2]}');
  });

  it('does not count brackets inside strings', () => {
    // The string `"a }] string"` should NOT bump bracket counters.
    expect(repairJson('{"a":"a }] string"}')).toBeNull();
  });

  it('honors backslash-escaped quotes inside strings', () => {
    // Strings can contain `\"`; the escape should not flip the inString
    // state. After `"hi\\"` the parser stays inString=true; after the
    // CLOSING `"`, inString flips back to false. Brackets balanced.
    expect(repairJson('{"a":"hi\\""}')).toBeNull();
  });

  it('returns null when only changes are no-ops', () => {
    // The replace patterns only fire on specific shapes. Plain
    // canonical JSON exits with s === text → returns null.
    expect(repairJson('{}')).toBeNull();
  });
});

describe('parseAiResponse', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.restoreAllMocks();
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('parses a clean JSON object with operations + explanation', () => {
    const out = parseAiResponse('{"explanation":"ok","operations":[{"op":"autoOrganize"}]}');
    expect(out.explanation).toBe('ok');
    expect(out.operations).toEqual([{ op: 'autoOrganize' }]);
    expect(out.suggestions).toBeUndefined();
    expect(out.clarification).toBeUndefined();
  });

  it('returns the suggestions array when present', () => {
    const out = parseAiResponse('{"explanation":"a","operations":[],"suggestions":["one","two"]}');
    expect(out.suggestions).toEqual(['one', 'two']);
  });

  it('returns the clarification object when present', () => {
    const out = parseAiResponse(
      '{"explanation":"a","operations":[],"clarification":{"question":"Which?","options":["AWS","GCP"]}}',
    );
    expect(out.clarification).toEqual({ question: 'Which?', options: ['AWS', 'GCP'] });
  });

  it('strips fenced ```json blocks before parsing', () => {
    const wrapped = '```json\n{"explanation":"hi","operations":[]}\n```';
    const out = parseAiResponse(wrapped);
    expect(out.explanation).toBe('hi');
  });

  it('strips bare ``` fences (no json language tag)', () => {
    const wrapped = '```\n{"explanation":"hi","operations":[]}\n```';
    const out = parseAiResponse(wrapped);
    expect(out.explanation).toBe('hi');
  });

  it('strips <think>...</think> reasoning tags before parsing', () => {
    const wrapped = '<think>thinking aloud</think>\n{"explanation":"hi","operations":[]}';
    const out = parseAiResponse(wrapped);
    expect(out.explanation).toBe('hi');
  });

  it('strips multiple <think> blocks (case-insensitive, dot-all)', () => {
    const wrapped = '<THINK>a</THINK>\n<think>b</think>\n{"explanation":"hi","operations":[]}';
    const out = parseAiResponse(wrapped);
    expect(out.explanation).toBe('hi');
  });

  it('finds an embedded JSON object inside a preamble (text-before-{)', () => {
    const noisy = 'Sure thing! Here you go:\n{"explanation":"hi","operations":[]}';
    const out = parseAiResponse(noisy);
    expect(out.explanation).toBe('hi');
  });

  it('returns the empty-string explanation when parsed.explanation is missing', () => {
    const out = parseAiResponse('{"operations":[]}');
    expect(out.explanation).toBe('');
  });

  it('returns the suggestions field as undefined when not an array', () => {
    const out = parseAiResponse('{"operations":[],"suggestions":"not an array"}');
    expect(out.suggestions).toBeUndefined();
  });

  it('returns operations: [] when parsed.operations is missing or not an array', () => {
    expect(parseAiResponse('{"explanation":"ok"}').operations).toEqual([]);
    expect(parseAiResponse('{"explanation":"ok","operations":"x"}').operations).toEqual([]);
  });

  it('runs validateOperations against allowedBlockTypes (drops unknown iceTypes)', () => {
    const out = parseAiResponse(
      '{"explanation":"a","operations":[{"op":"addBlueprint","iceType":"BadOne"},{"op":"addBlueprint","iceType":"Database.PostgreSQL"}]}',
      new Set(['Database.PostgreSQL']),
    );
    expect(out.operations).toHaveLength(1);
    expect((out.operations[0] as { iceType: string }).iceType).toBe('Database.PostgreSQL');
    // The "filtered by validation" warn fires AFTER validateOperations'
    // own per-rejection warn, so warnSpy fires twice for one filter.
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('1/2 operations filtered by validation'));
  });

  it('does NOT log the "filtered" message when validateOperations passes everything', () => {
    parseAiResponse('{"explanation":"a","operations":[{"op":"autoOrganize"}]}', new Set([]));
    expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining('operations filtered by validation'));
  });

  it('repairs a missing { before "op" via repairJson and logs success', () => {
    // Note: the source's repair path triggers when the FIRST JSON.parse
    // throws AND repairJson returns a non-null repaired string AND the
    // SECOND JSON.parse succeeds. Use a string with a missing { but
    // otherwise well-formed shape after repair.
    const broken = '{"explanation":"a","operations":[{"op":"autoOrganize"},"op":"deleteEdge","edgeId":"e1"}]}';
    const out = parseAiResponse(broken);
    expect(out.explanation).toBe('a');
    expect(logSpy).toHaveBeenCalledWith('[AI] JSON repaired successfully');
  });

  it('repairs trailing commas via repairJson', () => {
    const broken = '{"explanation":"a","operations":[],}';
    const out = parseAiResponse(broken);
    expect(out.explanation).toBe('a');
    expect(out.operations).toEqual([]);
    expect(logSpy).toHaveBeenCalledWith('[AI] JSON repaired successfully');
  });

  it('falls through to text-only when even the repair fails', () => {
    const broken = '{"explanation":"a","operations":[NotEvenJson{nope';
    const out = parseAiResponse(broken);
    // The fallback returns the first 200 chars as the explanation.
    expect(out.explanation).toBe(broken.slice(0, 200));
    expect(out.operations).toEqual([]);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to parse AI response as JSON'),
      expect.any(String),
    );
  });

  it('truncates the final fallback explanation to 200 chars', () => {
    const garbage = 'x'.repeat(500);
    const out = parseAiResponse(garbage);
    expect(out.explanation).toHaveLength(200);
    expect(out.explanation).toBe('x'.repeat(200));
  });

  it('truncates the error-log preview to 300 chars (raw text snippet)', () => {
    const garbage = 'y'.repeat(500);
    parseAiResponse(garbage);
    // The error spy should have received a string at most 300 chars long.
    const arg = errorSpy.mock.calls[0]?.[1] as string;
    expect(arg.length).toBeLessThanOrEqual(300);
  });

  it('handles a response that is already a JSON array ([) shape (no { fallback)', () => {
    // The source: `if (!startsWith('{') && !startsWith('[')) try preamble`.
    // An array-only top level isn't a valid AiResponse shape but the
    // first JSON.parse runs and succeeds; the resulting `parsed` is an
    // array, NOT a Record — so the `parsed` check is truthy (non-null
    // array), and the function attempts to read .operations off the
    // array — which is undefined. The output is explanation: '' and
    // operations: [].
    const out = parseAiResponse('[1,2,3]');
    expect(out.operations).toEqual([]);
    expect(out.explanation).toBe('');
  });
});
