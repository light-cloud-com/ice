/**
 * Custom Domain Panel — root-domain field + per-route subdomain editor +
 * post-deploy DNS-records preview for `Network.CustomDomain` blocks.
 *
 * Mirrors the canvas renderer ONE-TO-ONE: shows the same routes, in the
 * same order, with the same subdomain edits. Both views read and write
 * `selectedNode.data.routes` so editing in either place updates both.
 *
 * Layout:
 *   - Root domain field — writes to `node.data.domain`
 *   - Routes list — one row per route (NOT per edge); each row is:
 *       · subdomain input (writes back to `routes[i].subdomain`)
 *       · live host preview
 *       · connected target label (or "—" if unconnected)
 *       · delete button (only if more than one route)
 *   - + Add subdomain route — appends a new route
 *   - DNS records — pulled from any connected target's deploy outputs
 *
 * **Behavior-risk discipline (rf-props-15):** rendered TWICE in the
 * orchestrator — once in the domain tab (primary), once in the config tab
 * (mirror) — with byte-identical props. Identical-prop discipline is
 * load-bearing: the route subdomain `<input>` preserves cursor position
 * during typing only because both instances read the same `selectedNode`
 * reference. A selector reshuffle that gives the two instances different
 * `selectedNode` references would re-mount the inputs and lose the cursor.
 *
 * The `dispatch` prop is destructured as `dispatch: _dispatch` and is
 * currently unused inside the component. The prop is preserved as part of
 * the public shape for forward-compat with future actions — removing it
 * would change the prop shape.
 *
 * Extracted verbatim from `properties-panel.tsx` lines 909-1158 during
 * rf-props-15. The `routes.slice()` shallow copy, the `routeViews` map,
 * the DNS-records IIFE, and every callsite-attached `data-prop-key` /
 * `data-route-id` are preserved exactly.
 */

import React from 'react';
import { t } from '../../../../i18n';
import { cn } from '../../../../shared/utils/cn';
import { normalizeSubdomain } from '../../utils/normalize-subdomain';
import { Section } from '../fields';
import type { AppDispatch } from '../../../../store';

export interface CustomDomainRoute {
  id: string;
  subdomain: string;
}

export const CustomDomainPanel: React.FC<{
  selectedNode: any;
  outgoingEdges: any[];
  activeCard: any;
  updateNodeField: (field: string, value: unknown) => void;
  dispatch: AppDispatch;
}> = ({ selectedNode, outgoingEdges, activeCard, updateNodeField, dispatch: _dispatch }) => {
  const rootDomain = (selectedNode?.data?.domain as string) || '';
  const routes = ((selectedNode?.data?.routes as CustomDomainRoute[] | undefined) || []).slice();

  // Build a per-route view: route + the connected edge (if any) + the
  // connected target node (if any) + DNS records from the target.
  const routeViews = routes.map((route) => {
    const matchingEdge = outgoingEdges.find((e) => (e.data as any)?.routeId === route.id);
    let targetNode: any = null;
    if (matchingEdge) {
      const targetId = matchingEdge.source === selectedNode.id ? matchingEdge.target : matchingEdge.source;
      targetNode = (activeCard.nodes || []).find((n: any) => n.id === targetId) || null;
    }
    const targetIce = (targetNode?.data?.iceType as string) || '';
    const targetLabel = (targetNode?.data?.label as string) || targetNode?.id?.slice(0, 8) || '';
    const targetId = targetNode?.id || '';
    const subdomain = (route.subdomain || '').trim();
    const host = subdomain && rootDomain ? `${subdomain}.${rootDomain}` : rootDomain;
    const dnsRecords = targetNode
      ? (((targetNode.data as any)?.custom_domain_dns_records ||
          (targetNode.data as any)?.deploy_outputs?.custom_domain_dns_records ||
          []) as Array<{ type: string; domain: string; value: string }>)
      : [];
    return { route, edge: matchingEdge, targetNode, targetIce, targetLabel, targetId, subdomain, host, dnsRecords };
  });

  const updateRouteSubdomain = (routeId: string, value: string) => {
    const next = routes.map((r) => (r.id === routeId ? { ...r, subdomain: normalizeSubdomain(value) } : r));
    updateNodeField('routes', next);
  };

  const addRoute = () => {
    const newId = `route-${Math.random().toString(36).slice(2, 10)}`;
    updateNodeField('routes', [...routes, { id: newId, subdomain: '' }]);
  };

  const deleteRoute = (routeId: string) => {
    updateNodeField(
      'routes',
      routes.filter((r) => r.id !== routeId),
    );
  };

  return (
    <div className="space-y-3">
      {/* Root domain field */}
      <Section title={t('canvas.properties.customDomain.rootDomainTitle')}>
        <input
          type="text"
          value={rootDomain}
          placeholder={t('canvas.properties.customDomain.rootDomainPlaceholder')}
          onChange={(e) => updateNodeField('domain', e.target.value.toLowerCase().trim())}
          data-prop-key="domain"
          className="w-full px-2 py-1.5 text-ice-sm rounded border border-ice-border bg-ice-base text-ice-text-1 font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <p className="mt-1 text-ice-2xs text-ice-text-3 leading-relaxed">
          {t('canvas.properties.customDomain.rootDomainHint')}
        </p>
      </Section>

      {/* Routes — same data the canvas block reads from */}
      <Section title={t('canvas.properties.customDomain.routesTitle', { count: routeViews.length })}>
        {routeViews.length === 0 && (
          <p className="text-ice-2xs text-ice-text-3 leading-relaxed py-2">
            {t('canvas.properties.customDomain.routesEmpty')}
          </p>
        )}
        {routeViews.length > 0 && (
          <div className="space-y-2">
            {routeViews.map(({ route, edge, targetIce, targetLabel, targetId, subdomain, host }) => (
              <div key={route.id} className="rounded border border-ice-border bg-ice-base/40 px-2 py-2 space-y-1.5">
                {/* Top row: target label + live host preview */}
                <div className="flex items-center justify-between gap-2">
                  <span
                    className="text-ice-2xs text-ice-text-3 truncate"
                    title={targetIce ? `${targetIce} · ${targetId}` : 'unconnected'}
                  >
                    {edge && targetId ? (
                      <>
                        → {targetLabel} <span className="text-ice-text-3/60">({targetId.slice(0, 8)})</span>
                      </>
                    ) : (
                      <span className="italic">{t('canvas.properties.customDomain.routeUnconnected')}</span>
                    )}
                  </span>
                  <span
                    className="text-ice-2xs font-mono text-blue-400 truncate"
                    title={host || t('canvas.properties.customDomain.noDomain')}
                  >
                    {host || t('canvas.properties.customDomain.noDomain')}
                  </span>
                </div>

                {/* Bottom row: subdomain editor + delete */}
                <div className="flex items-center gap-1.5">
                  <span className="text-ice-2xs text-ice-text-3 shrink-0">
                    {t('canvas.properties.customDomain.subdomainLabel')}
                  </span>
                  <input
                    type="text"
                    value={subdomain}
                    placeholder={t('canvas.properties.customDomain.subdomainPlaceholder')}
                    onChange={(e) => updateRouteSubdomain(route.id, e.target.value)}
                    data-prop-key="routes.subdomain"
                    data-route-id={route.id}
                    className="flex-1 min-w-0 px-1.5 py-1 text-ice-xs rounded border border-ice-border bg-ice-base text-ice-text-1 font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  {routes.length > 1 && (
                    <button
                      onClick={() => deleteRoute(route.id)}
                      title={t('canvas.properties.customDomain.deleteRouteTitle')}
                      className="shrink-0 w-6 h-6 flex items-center justify-center text-ice-text-3 hover:text-red-400 hover:bg-red-500/10 rounded"
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        <button
          onClick={addRoute}
          className="mt-2 w-full px-3 py-1.5 text-ice-xs text-ice-text-2 border border-dashed border-ice-border rounded hover:bg-ice-base/40"
        >
          {t('canvas.properties.customDomain.addRoute')}
        </button>
      </Section>

      {/* DNS records (post-deploy) — split into ADD and REMOVE sections */}
      {(() => {
        type DnsRow = {
          type: string;
          domain: string;
          value: string;
          required_action?: string;
          host: string;
          targetLabel: string;
        };
        const allDnsRows: DnsRow[] = routeViews.flatMap((rv) =>
          rv.dnsRecords.map((rec) => ({
            ...(rec as any),
            host: rv.host || (rec as any).domain,
            targetLabel: rv.targetLabel,
          })),
        );
        const addRows = allDnsRows.filter((r) => (r.required_action || 'add') !== 'remove');
        const removeRows = allDnsRows.filter((r) => r.required_action === 'remove');

        if (allDnsRows.length === 0) {
          return (
            <Section title={t('canvas.properties.customDomain.dnsRecordsTitle')}>
              <p className="text-ice-2xs text-ice-text-3 leading-relaxed">
                {t('canvas.properties.customDomain.dnsRecordsEmpty')}
              </p>
            </Section>
          );
        }

        const renderHeader = () => (
          <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-ice-text-3 px-2 pb-1">
            <span className="w-10 shrink-0">{t('canvas.properties.customDomain.dnsHeaderType')}</span>
            <span className="flex-shrink min-w-0">{t('canvas.properties.customDomain.dnsHeaderDomain')}</span>
            <span className="flex-1 min-w-0">{t('canvas.properties.customDomain.dnsHeaderValue')}</span>
            <span className="w-10 shrink-0" />
          </div>
        );

        const renderRow = (rec: DnsRow, i: number, palette: { bg: string; type: string; chip: string }) => (
          <div
            key={i}
            className={cn(
              'flex items-center gap-2 text-ice-2xs font-mono border border-ice-border px-2 py-1.5 rounded',
              palette.bg,
            )}
          >
            <span className={cn('font-semibold w-10 shrink-0', palette.type)}>{rec.type}</span>
            <span className="text-ice-text-3 truncate flex-shrink min-w-0" title={rec.host}>
              {rec.host}
            </span>
            <span className="text-ice-text-1 truncate flex-1 min-w-0" title={rec.value}>
              {rec.value}
            </span>
            <button
              onClick={() => {
                navigator.clipboard.writeText(rec.value).catch(() => undefined);
              }}
              className={cn('shrink-0 px-1.5 py-0.5 text-[10px] rounded', palette.chip)}
              title={t('canvas.properties.customDomain.dnsCopyTitle')}
            >
              {t('canvas.properties.customDomain.dnsCopyButton')}
            </button>
          </div>
        );

        return (
          <Section title={t('canvas.properties.customDomain.dnsRecordsTitleCount', { count: allDnsRows.length })}>
            {addRows.length > 0 && (
              <div className="space-y-1">
                <div className="text-ice-2xs text-blue-400 leading-relaxed">
                  {t('canvas.properties.customDomain.dnsAddBanner')}
                </div>
                {renderHeader()}
                {addRows.map((rec, i) =>
                  renderRow(rec, i, {
                    bg: 'bg-ice-base/40',
                    type: 'text-blue-400',
                    chip: 'bg-blue-500/20 hover:bg-blue-500/30 text-blue-300',
                  }),
                )}
              </div>
            )}

            {removeRows.length > 0 && (
              <div className="space-y-1 mt-3">
                <div className="text-ice-2xs text-amber-400 leading-relaxed">
                  {t('canvas.properties.customDomain.dnsRemoveBanner')}
                </div>
                {renderHeader()}
                {removeRows.map((rec, i) =>
                  renderRow(rec, i, {
                    bg: 'bg-amber-500/5',
                    type: 'text-amber-400',
                    chip: 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-300',
                  }),
                )}
              </div>
            )}

            <p className="mt-2 text-ice-2xs text-ice-text-3 leading-relaxed">
              {t('canvas.properties.customDomain.dnsPropagationHint')}
            </p>
          </Section>
        );
      })()}
    </div>
  );
};
