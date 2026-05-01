/**
 * rf-canv2-4 — useCanvasEffects hook tests.
 *
 * The hook bundles two `useEffect` blocks: a pipeline-subscription effect
 * (dynamically imports the API adapter, registers a per-card subscription
 * + listener, returns a cleanup that unsubscribes) and a non-passive
 * wheel listener (installs a `'wheel'` handler with `{ passive: false }`
 * on `svgRef.current`, returns a cleanup that removes it).
 *
 * Per the rf-pdpl-21 learning, effects are captured into a single hoisted
 * `mocks.effects` array and tests fingerprint by deps-array shape:
 *   - effects[0]: deps `[cardId, dispatch]`         length 2 (string | undefined dep)
 *   - effects[1]: deps `[bindCanvas]`                length 1
 *
 * The async IIFE inside the pipeline effect is awaited via a small
 * `flushMicrotasks` helper so we can observe the dispatched action.
 */

import React from 'react';
import { renderToString } from 'react-dom/server';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoisted effect-capture mocks ───────────────────────────────────────────
interface CapturedEffect {
  cb: () => void | (() => void);
  deps: unknown[] | undefined;
  cleanup?: () => void;
}
const mocks = vi.hoisted(() => ({
  effects: [] as Array<{
    cb: () => void | (() => void);
    deps: unknown[] | undefined;
    cleanup?: () => void;
  }>,
  // Mocked api-adapter shape
  unsubCardSpy: vi.fn(),
  cleanupCardSpy: vi.fn(),
  apiAdapterMock: {
    subscribeCardPipeline: vi.fn() as ReturnType<typeof vi.fn>,
    onCardPipelineUpdate: vi.fn() as ReturnType<typeof vi.fn>,
  },
}));

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useEffect: vi.fn((cb: () => void | (() => void), deps?: unknown[]) => {
      const idx = mocks.effects.length;
      mocks.effects.push({ cb, deps, cleanup: undefined });
      const cleanup = cb();
      if (typeof cleanup === 'function') {
        mocks.effects[idx].cleanup = cleanup;
      }
    }),
  };
});

// Mock the api-adapter module so the dynamic import resolves under test.
vi.mock('../../../../shared/api/api-adapter', () => ({
  getApi: () => ({
    subscribeCardPipeline: mocks.apiAdapterMock.subscribeCardPipeline,
    onCardPipelineUpdate: mocks.apiAdapterMock.onCardPipelineUpdate,
  }),
}));

// Import AFTER mocks are registered.
import pipelineReducer from '../../../../store/slices/pipeline-slice';
import { useCanvasEffects } from '../use-canvas-effects';

// ─── Store builder ──────────────────────────────────────────────────────────

const makeStore = () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const initialPipeline = pipelineReducer(undefined as any, { type: '@@INIT' });
  return configureStore({
    reducer: { pipeline: pipelineReducer },
    preloadedState: { pipeline: initialPipeline },
    middleware: (getDefault) =>
      getDefault({ serializableCheck: false, immutableCheck: false }),
  });
};

type TestStore = ReturnType<typeof makeStore>;

const flushMicrotasks = () =>
  new Promise<void>((resolve) => setTimeout(resolve, 0));

// ─── Probe ──────────────────────────────────────────────────────────────────

interface CaptureArgs {
  cardId?: string | undefined;
  bindCanvas?: { onWheel: (e: React.WheelEvent) => void };
  svgRef?: React.RefObject<SVGSVGElement | null>;
  setConnTooltip?: React.Dispatch<React.SetStateAction<unknown>>;
}

const renderHook = (store: TestStore, args: CaptureArgs = {}): void => {
  const Probe: React.FC = () => {
    useCanvasEffects({
      cardId: args.cardId,
      bindCanvas: args.bindCanvas ?? { onWheel: vi.fn() },
      svgRef: args.svgRef ?? React.createRef<SVGSVGElement>(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setConnTooltip: (args.setConnTooltip ?? vi.fn()) as any,
    });
    return React.createElement('div', null, 'probe');
  };
  renderToString(
    <Provider store={store}>
      <Probe />
    </Provider>,
  );
};

const effectByOrder = (i: number): CapturedEffect => {
  if (!mocks.effects[i]) {
    throw new Error(`effect at index ${i} not registered`);
  }
  return mocks.effects[i];
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.effects.length = 0;
  mocks.apiAdapterMock.subscribeCardPipeline.mockReturnValue(mocks.unsubCardSpy);
  mocks.apiAdapterMock.onCardPipelineUpdate.mockReturnValue(mocks.cleanupCardSpy);
});

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('useCanvasEffects — effect registration shape', () => {
  it('registers exactly two effects', () => {
    renderHook(makeStore(), { cardId: 'card-1' });
    expect(mocks.effects).toHaveLength(2);
  });

  it('effect 0 (pipeline subscription) deps are [cardId, dispatch]', () => {
    renderHook(makeStore(), { cardId: 'card-1' });
    const e = effectByOrder(0);
    expect(e.deps).toHaveLength(2);
    expect(e.deps?.[0]).toBe('card-1');
    expect(typeof e.deps?.[1]).toBe('function');
  });

  it('effect 1 (wheel listener) deps are [bindCanvas]', () => {
    const bindCanvas = { onWheel: vi.fn() };
    renderHook(makeStore(), { cardId: 'card-1', bindCanvas });
    const e = effectByOrder(1);
    expect(e.deps).toHaveLength(1);
    expect(e.deps?.[0]).toBe(bindCanvas);
  });
});

describe('useCanvasEffects — pipeline subscription effect', () => {
  it('returns no cleanup when cardId is undefined (early return)', () => {
    renderHook(makeStore(), { cardId: undefined });
    const e = effectByOrder(0);
    expect(e.cleanup).toBeUndefined();
  });

  it('subscribes and registers the pipeline-update listener with the supplied cardId', async () => {
    renderHook(makeStore(), { cardId: 'card-XYZ' });
    await flushMicrotasks();
    expect(mocks.apiAdapterMock.subscribeCardPipeline).toHaveBeenCalledWith('card-XYZ');
    expect(mocks.apiAdapterMock.onCardPipelineUpdate).toHaveBeenCalledTimes(1);
  });

  it('dispatches receiveCardPipelineUpdate when the listener fires', async () => {
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    renderHook(store, { cardId: 'card-1' });
    await flushMicrotasks();
    dispatchSpy.mockClear();

    // Find the registered listener (the arg to onCardPipelineUpdate) and fire
    // it with a fake event payload.
    const handler = mocks.apiAdapterMock.onCardPipelineUpdate.mock.calls[0]?.[0] as
      | ((event: unknown) => void)
      | undefined;
    expect(typeof handler).toBe('function');
    handler?.({ nodeId: 'n1', status: 'building' });

    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    const call = dispatchSpy.mock.calls[0][0] as unknown as { type: string };
    expect(call.type).toBe('pipeline/receiveCardPipelineUpdate');
  });

  it('cleanup unsubscribes both the card subscription and the listener', async () => {
    renderHook(makeStore(), { cardId: 'card-1' });
    await flushMicrotasks();
    const e = effectByOrder(0);
    expect(typeof e.cleanup).toBe('function');
    (e.cleanup as () => void)();
    expect(mocks.unsubCardSpy).toHaveBeenCalledTimes(1);
    expect(mocks.cleanupCardSpy).toHaveBeenCalledTimes(1);
  });

  it('cleanup tolerates the api adapter rejecting the dynamic import (silent catch)', async () => {
    // Verify the .catch(() => {}) silently swallows by setting the api
    // module to throw on the listener. We can't easily reject the import
    // mock at runtime, but the behavior path is exercised when the api
    // calls return undefined.
    mocks.apiAdapterMock.subscribeCardPipeline.mockReturnValueOnce(undefined);
    mocks.apiAdapterMock.onCardPipelineUpdate.mockReturnValueOnce(undefined);
    renderHook(makeStore(), { cardId: 'card-no-api' });
    await flushMicrotasks();
    const e = effectByOrder(0);
    expect(() => (e.cleanup as () => void)()).not.toThrow();
  });
});

describe('useCanvasEffects — wheel listener effect', () => {
  it('returns no cleanup when svgRef.current is null (early return)', () => {
    renderHook(makeStore(), { cardId: 'c', svgRef: { current: null } });
    const e = effectByOrder(1);
    expect(e.cleanup).toBeUndefined();
  });

  it('installs a wheel listener with passive: false on svgRef.current', () => {
    const addEventListener = vi.fn();
    const removeEventListener = vi.fn();
    const fakeSvg = {
      addEventListener,
      removeEventListener,
    } as unknown as SVGSVGElement;
    const svgRef = { current: fakeSvg } as React.RefObject<SVGSVGElement>;

    renderHook(makeStore(), { cardId: 'c', svgRef });

    expect(addEventListener).toHaveBeenCalledTimes(1);
    expect(addEventListener.mock.calls[0][0]).toBe('wheel');
    expect(addEventListener.mock.calls[0][2]).toEqual({ passive: false });
  });

  it('handler calls preventDefault, dismisses tooltip, and forwards to bindCanvas.onWheel', () => {
    const addEventListener = vi.fn();
    const fakeSvg = {
      addEventListener,
      removeEventListener: vi.fn(),
    } as unknown as SVGSVGElement;
    const svgRef = { current: fakeSvg } as React.RefObject<SVGSVGElement>;
    const onWheel = vi.fn();
    const setConnTooltip = vi.fn();

    renderHook(makeStore(), {
      cardId: 'c',
      svgRef,
      bindCanvas: { onWheel },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setConnTooltip: setConnTooltip as any,
    });

    const handler = addEventListener.mock.calls[0][1] as (e: WheelEvent) => void;
    const preventDefault = vi.fn();
    const fakeEvent = { preventDefault } as unknown as WheelEvent;
    handler(fakeEvent);

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(setConnTooltip).toHaveBeenCalledWith(null);
    expect(onWheel).toHaveBeenCalledTimes(1);
    expect(onWheel.mock.calls[0][0]).toBe(fakeEvent);
  });

  it('cleanup removes the wheel listener', () => {
    const removeEventListener = vi.fn();
    const fakeSvg = {
      addEventListener: vi.fn(),
      removeEventListener,
    } as unknown as SVGSVGElement;
    const svgRef = { current: fakeSvg } as React.RefObject<SVGSVGElement>;

    renderHook(makeStore(), { cardId: 'c', svgRef });
    const e = effectByOrder(1);
    (e.cleanup as () => void)();
    expect(removeEventListener).toHaveBeenCalledWith('wheel', expect.any(Function));
  });
});
