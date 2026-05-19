/**
 * rf-props-5 — deploy-history-format util.
 *
 * Constants (`ACTION_LABELS`, `ACTION_COLORS`) and the per-row derivation
 * (`formatDeployRow`) are preserved verbatim from `properties-panel.tsx`.
 * Tests pin every branch: the duration truthy-gate, all status string sets,
 * the action-type fallback (missing → 'apply'), the action-label/-color
 * fallbacks (unknown action → raw type / slate color), and the summary
 * filter (only positive counts join with ' · ').
 *
 * The `time` test asserts equality against `Date#toLocaleString` with the
 * documented options rather than a hard-coded literal so it stays portable
 * across CI locales/timezones — the contract is "defer to toLocaleString
 * with these options," not a specific output string.
 */

import { describe, it, expect } from 'vitest';
import { ACTION_COLORS, ACTION_LABELS, formatDeployRow } from '../deploy-history-format';

const FIXED_DATE = '2026-04-29T12:34:00Z';

describe('ACTION_LABELS', () => {
  it('exposes the four documented action keys with verbatim labels', () => {
    expect(ACTION_LABELS).toEqual({
      plan: 'Plan',
      apply: 'Deploy',
      destroy: 'Destroy',
      rollback: 'Rollback',
    });
  });
});

describe('ACTION_COLORS', () => {
  it('exposes the same four keys as ACTION_LABELS with verbatim color classes', () => {
    expect(Object.keys(ACTION_COLORS).sort()).toEqual(Object.keys(ACTION_LABELS).sort());
    expect(ACTION_COLORS).toEqual({
      plan: 'text-slate-400 bg-slate-950/30',
      apply: 'text-blue-400 bg-blue-950/30',
      destroy: 'text-orange-400 bg-orange-950/30',
      rollback: 'text-purple-400 bg-purple-950/30',
    });
  });
});

describe('formatDeployRow', () => {
  describe('time', () => {
    it('formats created_at via toLocaleString with month/day/hour/minute options', () => {
      const expected = new Date(FIXED_DATE).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
      expect(formatDeployRow({ created_at: FIXED_DATE }).time).toBe(expected);
    });

    it('accepts a Date instance for created_at', () => {
      const date = new Date(FIXED_DATE);
      const expected = date.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
      expect(formatDeployRow({ created_at: date }).time).toBe(expected);
    });
  });

  describe('duration', () => {
    it("formats 5450ms as '5.5s' with one decimal", () => {
      expect(formatDeployRow({ created_at: FIXED_DATE, duration_ms: 5450 }).duration).toBe('5.5s');
    });

    it("returns '' when duration_ms is missing", () => {
      expect(formatDeployRow({ created_at: FIXED_DATE }).duration).toBe('');
    });

    it("returns '' when duration_ms is 0 (truthy gate)", () => {
      expect(formatDeployRow({ created_at: FIXED_DATE, duration_ms: 0 }).duration).toBe('');
    });
  });

  describe('isSuccess', () => {
    it("is true for status 'success'", () => {
      expect(formatDeployRow({ created_at: FIXED_DATE, status: 'success' }).isSuccess).toBe(true);
    });

    it('is false for any other status', () => {
      for (const status of [
        'failed',
        'cancelled',
        'partial',
        'deploying',
        'planning',
        'planned',
        'queued',
        'unknown',
        '',
      ]) {
        expect(formatDeployRow({ created_at: FIXED_DATE, status }).isSuccess).toBe(false);
      }
    });

    it('is false when status is missing', () => {
      expect(formatDeployRow({ created_at: FIXED_DATE }).isSuccess).toBe(false);
    });
  });

  describe('isFailed', () => {
    it("is true for 'failed'", () => {
      expect(formatDeployRow({ created_at: FIXED_DATE, status: 'failed' }).isFailed).toBe(true);
    });

    it("is true for 'cancelled'", () => {
      expect(formatDeployRow({ created_at: FIXED_DATE, status: 'cancelled' }).isFailed).toBe(true);
    });

    it('is false for non-failed statuses', () => {
      for (const status of ['success', 'partial', 'deploying', 'planning', 'planned', '']) {
        expect(formatDeployRow({ created_at: FIXED_DATE, status }).isFailed).toBe(false);
      }
    });
  });

  describe('isPartial', () => {
    it("is true for 'partial'", () => {
      expect(formatDeployRow({ created_at: FIXED_DATE, status: 'partial' }).isPartial).toBe(true);
    });

    it('is false for non-partial statuses', () => {
      for (const status of ['success', 'failed', 'cancelled', 'deploying', 'planning', 'planned', '']) {
        expect(formatDeployRow({ created_at: FIXED_DATE, status }).isPartial).toBe(false);
      }
    });
  });

  describe('isPending', () => {
    it("is true for 'deploying'", () => {
      expect(formatDeployRow({ created_at: FIXED_DATE, status: 'deploying' }).isPending).toBe(true);
    });

    it("is true for 'planning'", () => {
      expect(formatDeployRow({ created_at: FIXED_DATE, status: 'planning' }).isPending).toBe(true);
    });

    it("is true for 'planned'", () => {
      expect(formatDeployRow({ created_at: FIXED_DATE, status: 'planned' }).isPending).toBe(true);
    });

    it('is false for non-pending statuses', () => {
      for (const status of ['success', 'failed', 'cancelled', 'partial', '']) {
        expect(formatDeployRow({ created_at: FIXED_DATE, status }).isPending).toBe(false);
      }
    });
  });

  describe('actionType', () => {
    it("falls back to 'apply' when action_type is missing", () => {
      expect(formatDeployRow({ created_at: FIXED_DATE }).actionType).toBe('apply');
    });

    it("falls back to 'apply' when action_type is an empty string", () => {
      expect(formatDeployRow({ created_at: FIXED_DATE, action_type: '' }).actionType).toBe('apply');
    });

    it('passes through a known action_type verbatim', () => {
      expect(formatDeployRow({ created_at: FIXED_DATE, action_type: 'destroy' }).actionType).toBe('destroy');
    });
  });

  describe('actionLabel', () => {
    it("maps 'plan' to 'Plan'", () => {
      expect(formatDeployRow({ created_at: FIXED_DATE, action_type: 'plan' }).actionLabel).toBe('Plan');
    });

    it("maps 'apply' to 'Deploy'", () => {
      expect(formatDeployRow({ created_at: FIXED_DATE, action_type: 'apply' }).actionLabel).toBe('Deploy');
    });

    it("maps 'destroy' to 'Destroy'", () => {
      expect(formatDeployRow({ created_at: FIXED_DATE, action_type: 'destroy' }).actionLabel).toBe('Destroy');
    });

    it("maps 'rollback' to 'Rollback'", () => {
      expect(formatDeployRow({ created_at: FIXED_DATE, action_type: 'rollback' }).actionLabel).toBe('Rollback');
    });

    it('returns the raw action_type when unknown (no label mapping)', () => {
      expect(formatDeployRow({ created_at: FIXED_DATE, action_type: 'mystery' }).actionLabel).toBe('mystery');
    });
  });

  describe('actionColor', () => {
    it("maps 'plan' to the slate color class", () => {
      expect(formatDeployRow({ created_at: FIXED_DATE, action_type: 'plan' }).actionColor).toBe(
        'text-slate-400 bg-slate-950/30',
      );
    });

    it("maps 'apply' to the blue color class", () => {
      expect(formatDeployRow({ created_at: FIXED_DATE, action_type: 'apply' }).actionColor).toBe(
        'text-blue-400 bg-blue-950/30',
      );
    });

    it("maps 'destroy' to the orange color class", () => {
      expect(formatDeployRow({ created_at: FIXED_DATE, action_type: 'destroy' }).actionColor).toBe(
        'text-orange-400 bg-orange-950/30',
      );
    });

    it("maps 'rollback' to the purple color class", () => {
      expect(formatDeployRow({ created_at: FIXED_DATE, action_type: 'rollback' }).actionColor).toBe(
        'text-purple-400 bg-purple-950/30',
      );
    });

    it("falls back to the slate color class for unknown action types (matches 'plan')", () => {
      expect(formatDeployRow({ created_at: FIXED_DATE, action_type: 'mystery' }).actionColor).toBe(
        'text-slate-400 bg-slate-950/30',
      );
    });
  });

  describe('summaryText', () => {
    it('joins all four counts with ` · ` when each is positive', () => {
      const out = formatDeployRow({
        created_at: FIXED_DATE,
        summary: { created: 3, updated: 1, deleted: 2, failed: 1 },
      });
      expect(out.summaryText).toBe('3 created · 1 updated · 2 deleted · 1 failed');
    });

    it('omits zero-count entries (only joins the positive ones)', () => {
      const out = formatDeployRow({
        created_at: FIXED_DATE,
        summary: { created: 3, updated: 0, deleted: 2, failed: 0 },
      });
      expect(out.summaryText).toBe('3 created · 2 deleted');
    });

    it("returns '' when every count is zero", () => {
      const out = formatDeployRow({
        created_at: FIXED_DATE,
        summary: { created: 0, updated: 0, deleted: 0, failed: 0 },
      });
      expect(out.summaryText).toBe('');
    });

    it("returns '' when summary is missing", () => {
      expect(formatDeployRow({ created_at: FIXED_DATE }).summaryText).toBe('');
    });

    it("returns '' when summary is null (explicit null)", () => {
      expect(formatDeployRow({ created_at: FIXED_DATE, summary: null }).summaryText).toBe('');
    });
  });
});
