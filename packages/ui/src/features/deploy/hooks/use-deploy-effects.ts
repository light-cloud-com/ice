/**
 * useDeployEffects — orchestrator-level side-effects for the deploy panel.
 *
 * Bundles the four `useEffect` blocks lifted from `deploy-panel.tsx`:
 *
 *   1. **Auto-scroll logs**: scrolls `logEndRef.current` into view whenever
 *      `deploy.logs.length` changes. Unconditional — must run even while
 *      the panel is closed (RISK #6 from the rf-pdpl blueprint).
 *   2. **Auto-detect provider + load deployed resources + auto-fill GCP
 *      project**: fires when the panel opens or the active card changes.
 *      Detects the dominant provider from canvas resource nodes, picks a
 *      sensible default region, fetches existing deployed resources from
 *      the API, and (if not already set) auto-fills `gcpProject` from the
 *      first connected GCP project.
 *   3. **Listen for `requirement_verified` events**: subscribes to
 *      `getApi().onDeployEvent` while the panel is open and an active
 *      card exists, refreshing the requirements section whenever the
 *      background poller flips a requirement to verified.
 *   4. **Hydrate deploy results from history**: on every active-card
 *      change, fetches the most-recent terminal apply (or rollback) and
 *      dispatches `hydrateDeployFromHistory` so the results summary is
 *      visible immediately, not just for the session that ran the deploy.
 *
 * Returns the `logEndRef` so the orchestrator can pass it to `<LogPanel>`.
 *
 * RISK #1 (rf-pdpl blueprint): four effects in one hook with overlapping
 * deps. Effect order is observable — the auto-detect effect must run
 * before the requirement listener so the slice's provider/region match
 * the canvas before any verification arrives. The "Don't gate on slice
 * status here" docstring in effect 4 is load-bearing — see the comment
 * inline. None of the four eslint-disable comments are removable; the
 * exhaustive-deps reasoning is intentional in each case.
 *
 * RISK #6 (rf-pdpl blueprint): the auto-scroll effect must remain
 * unconditional. Gating it on `isOpen` would let logs accumulate without
 * scrolling while the panel is collapsed, then jump-scroll on reopen —
 * a regression the original implementation specifically avoided.
 */

import { useEffect, useRef } from 'react';
import { useDispatch } from 'react-redux';
import { getApi } from '../../../shared/api/api-adapter';
import {
  hydrateDeployFromHistory,
  setDeployedResources,
  setGcpProject,
  setProvider,
  setRegion,
  type DeployResourceResult,
  type DeployState,
} from '../../../store/slices/deploy-slice';
import type { Card } from '../../../store/slices/cards-slice';
import { PROVIDER_REGIONS, detectDominantProvider } from '../utils/provider-regions';
import type { AppDispatch } from '../../../store';

export interface UseDeployEffectsArgs {
  isOpen: boolean;
  activeCard: Card | null;
  deploy: DeployState;
  fetchRequirements: () => Promise<void>;
}

export interface UseDeployEffectsReturn {
  logEndRef: React.RefObject<HTMLDivElement>;
}

export function useDeployEffects(args: UseDeployEffectsArgs): UseDeployEffectsReturn {
  const { isOpen, activeCard, deploy, fetchRequirements } = args;
  const dispatch = useDispatch<AppDispatch>();
  const logEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll logs
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [deploy.logs.length]);

  // Auto-detect provider + load deployed resources + auto-fill project from connected provider
  useEffect(() => {
    if (!isOpen || !activeCard) return;

    // Detect dominant provider from canvas nodes
    const detected = detectDominantProvider(activeCard.nodes);
    dispatch(setProvider(detected));

    // Set a sensible default region for the detected provider
    const regions = PROVIDER_REGIONS[detected];
    if (regions && !regions.includes(deploy.region)) {
      dispatch(setRegion(regions[0]));
    }

    (async () => {
      try {
        // Load deployed resources
        const res = await getApi().deploy.getResources(activeCard.id);
        if (res.success && res.resources) {
          dispatch(setDeployedResources(res.resources));
        }
      } catch {
        // silently ignore — non-critical
      }

      // Auto-fill GCP project from connected provider if not already set
      if (!deploy.gcpProject) {
        try {
          const isConnected = await getApi().provider.isConnected(detected);
          if (isConnected) {
            const projects = await getApi().provider.getProjects(detected);
            if (projects?.length > 0) {
              dispatch(setGcpProject(projects[0].id));
            }
          }
        } catch {
          // non-critical
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- use activeCard?.id to avoid re-firing on card object reference changes
  }, [isOpen, activeCard?.id, deploy.gcpProject, deploy.region, dispatch]);

  // The deploy socket subscription and global progress listener now live
  // in `useDeploySubscription` at the app level (`packages/web/src/app/app.tsx`).
  // That hook runs whenever a card is active, regardless of whether this
  // panel is open — which is the whole point, because a new tab / closed
  // panel used to silently drop all progress events. The panel still
  // listens for `requirement_verified` events locally to refresh the
  // requirements section when the background poller flips one.
  useEffect(() => {
    if (!isOpen || !activeCard) return;
    const cleanup = getApi().onDeployEvent((event) => {
      if (event.type === 'requirement_verified') {
        fetchRequirements().catch(() => undefined);
      }
    });
    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, activeCard?.id]);

  // ─── Persist deploy results across reloads ──────────────────────────
  //
  // Deploy results live in canvas_deployment server-side. Without this
  // effect, opening the app after a deploy showed an empty deploy panel
  // because state.results is in-memory only. On every active-card change
  // we fetch the most-recent terminal apply for that card and hydrate
  // the slice — so the summary header (Copy summary / Copy errors) is
  // visible immediately, not just for the session that ran the deploy.
  //
  // Skip when a deploy is mid-flight (the slice's hydrate reducer also
  // guards this) and when the card hasn't actually changed (avoid a
  // network round-trip on every layout re-render).
  useEffect(() => {
    if (!activeCard) return;
    // Don't gate on slice status here. The app-level
    // useDeploySubscription's Phase 2 effect can flip the slice to
    // 'deploying' from a stale gateway snapshot (a deploy that crashed
    // without finalizing the in-memory snapshot looks live forever),
    // which would otherwise prevent hydrate from running and leave the
    // panel forever showing 99% with no results. The DB row is the
    // source of truth — the slice's hydrate reducer ignores non-terminal
    // statuses anyway, so it's safe to dispatch unconditionally and let
    // the reducer decide.
    let cancelled = false;
    (async () => {
      try {
        const history = (await getApi().deploy.getDeployments(activeCard.id)) as Array<{
          id: string;
          status: string;
          action_type: string;
          environment?: string;
          duration_ms?: number | null;
          error?: string | null;
          results?: { resources?: DeployResourceResult[] } | null;
        }>;
        if (cancelled) return;
        // eslint-disable-next-line no-console -- diagnostic: helps the user verify hydrate fired
        console.log('[deploy-panel] hydrate fetch', {
          cardId: activeCard.id,
          historyLen: Array.isArray(history) ? history.length : 0,
        });
        if (!Array.isArray(history) || history.length === 0) return;
        // Most-recent terminal apply (skip plan-only entries and any
        // mid-flight ones the gateway might report).
        const latest = history.find(
          (d) =>
            (d.action_type === 'apply' || d.action_type === 'rollback') &&
            ['success', 'partial', 'failed', 'cancelled'].includes(d.status),
        );
        if (!latest) {
          // eslint-disable-next-line no-console
          console.log('[deploy-panel] hydrate: no terminal apply in history', {
            statuses: history.map((d) => `${d.action_type}:${d.status}`),
          });
          return;
        }
        const resources = Array.isArray(latest.results?.resources) ? latest.results!.resources : [];
        // eslint-disable-next-line no-console
        console.log('[deploy-panel] hydrate dispatch', {
          status: latest.status,
          resourcesLen: resources.length,
          environment: latest.environment,
          duration_ms: latest.duration_ms,
          hasError: !!latest.error,
        });
        dispatch(
          hydrateDeployFromHistory({
            cardId: activeCard.id,
            status: latest.status,
            results: resources,
            error: latest.error,
            duration_ms: latest.duration_ms ?? undefined,
            environment: latest.environment ?? undefined,
          }),
        );
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[deploy-panel] hydrate failed', err);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only refetch
    //   when the active card actually changes; deploy.status flipping to
    //   'deploying' inside this effect would re-fetch unnecessarily.
  }, [activeCard?.id, dispatch]);

  return { logEndRef };
}
