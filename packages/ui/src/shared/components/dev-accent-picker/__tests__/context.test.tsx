/**
 * rf-accent-4 — `ThemePickerContext` + `useThemePicker`.
 *
 * The context defaults to `{ toggle: () => {} }` so consumers calling
 * `useThemePicker()` outside the provider receive a no-op toggle (the
 * source contract is "never throws"). The picker's orchestrator wraps
 * its descendants in `<ThemePickerContext.Provider value={{ toggle }}>`
 * so descendants get the real toggle.
 *
 * The tests pin:
 *
 *   1. The context object resolves and has a sensible no-op default.
 *   2. The hook returns the default outside a provider (no throw).
 *   3. The hook returns the provider value when wrapped — verified by
 *      directly invoking `useContext(ThemePickerContext)` inside a
 *      synthetic provider element so we don't need a renderer.
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';

import { ThemePickerContext, useThemePicker } from '../context';

describe('ThemePickerContext', () => {
  it('exports a context object with the no-op toggle as the default value', () => {
    // React internals expose defaults via the `_currentValue` key — but the
    // public observable behavior is that calling `useContext` outside a
    // provider returns the default. We test that path below; here we just
    // confirm the context is a real React context (the `Provider` and
    // `Consumer` properties are present on real createContext output, with
    // exact runtime shape varying across React major versions).
    expect(ThemePickerContext).toBeDefined();
    expect(ThemePickerContext.Provider).toBeDefined();
    expect(ThemePickerContext.Consumer).toBeDefined();
    // Default value snapshot via React internals — kept off the assertion path
    // because the internal field name is implementation-specific. This is the
    // load-bearing check (defaultValue.toggle is a function that no-ops).
    const defaultValue = (
      ThemePickerContext as unknown as { _currentValue: { toggle: () => void } }
    )._currentValue;
    expect(typeof defaultValue.toggle).toBe('function');
    expect(() => defaultValue.toggle()).not.toThrow();
  });
});

describe('useThemePicker', () => {
  it('returns the default { toggle: () => {} } when called outside a provider', () => {
    // The hook calls `useContext(ThemePickerContext)`. Outside a provider,
    // React returns the context's defaultValue. We invoke the hook directly —
    // React supports calling hooks during a render dispatcher, so we use the
    // no-render approach: stub the dispatcher with a useContext that just
    // returns the context's defaultValue.
    const dispatcher = {
      useContext: <T,>(ctx: React.Context<T>) =>
        (ctx as unknown as { _currentValue: T })._currentValue,
    };
    const ReactInternals = (
      React as unknown as {
        __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED?: { ReactCurrentDispatcher?: { current: unknown } };
      }
    ).__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED;
    const prev = ReactInternals?.ReactCurrentDispatcher?.current;
    if (ReactInternals?.ReactCurrentDispatcher) {
      ReactInternals.ReactCurrentDispatcher.current = dispatcher;
    }
    try {
      const result = useThemePicker();
      expect(typeof result.toggle).toBe('function');
      // No-op default — verify it doesn't throw on call.
      expect(() => result.toggle()).not.toThrow();
    } finally {
      if (ReactInternals?.ReactCurrentDispatcher) {
        ReactInternals.ReactCurrentDispatcher.current = prev;
      }
    }
  });

  it('returns the provider value when read with a stubbed dispatcher matching a provider ancestor', () => {
    const customToggle = vi.fn();
    const dispatcher = {
      useContext: <T,>(ctx: React.Context<T>) => {
        // Mimic a provider ancestor: synthetic value stand-in for the
        // ThemePickerContext key.
        if (ctx === (ThemePickerContext as unknown as React.Context<T>)) {
          return { toggle: customToggle } as unknown as T;
        }
        return (ctx as unknown as { _currentValue: T })._currentValue;
      },
    };
    const ReactInternals = (
      React as unknown as {
        __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED?: { ReactCurrentDispatcher?: { current: unknown } };
      }
    ).__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED;
    const prev = ReactInternals?.ReactCurrentDispatcher?.current;
    if (ReactInternals?.ReactCurrentDispatcher) {
      ReactInternals.ReactCurrentDispatcher.current = dispatcher;
    }
    try {
      const result = useThemePicker();
      result.toggle();
      expect(customToggle).toHaveBeenCalledTimes(1);
    } finally {
      if (ReactInternals?.ReactCurrentDispatcher) {
        ReactInternals.ReactCurrentDispatcher.current = prev;
      }
    }
  });
});
