/**
 * Phase 5 — in-panel destroy confirmation.
 *
 * Replaces the old browser `confirm()` dialog with a modal that:
 *   - shows every deployed resource by name and type (users know exactly
 *     what's about to go away),
 *   - requires the user to type the card name to unlock the red button
 *     (deliberate high-friction for a destructive action),
 *   - is keyboard accessible (Esc cancels).
 */

import { Trash2, AlertCircle } from 'lucide-react';
import React from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../../shared/utils/cn';

export const DestroyConfirmModal: React.FC<{
  cardName: string;
  resources: Array<{ name: string; type: string }>;
  onCancel: () => void;
  onConfirm: (destroyEverything: boolean) => void;
}> = ({ cardName, resources, onCancel, onConfirm }) => {
  const [typed, setTyped] = React.useState('');
  // DE3 — default to the SAFE single-deploy scope, even when nothing is tracked.
  // "Destroy everything" (which walks all history incl. failed/partial deploys
  // and deletes every ICE-managed resource it finds) must be an explicit opt-in,
  // never the default — the empty-tracked-list case shows guidance to enable it.
  const [destroyEverything, setDestroyEverything] = React.useState(false);
  const canConfirm = typed.trim() === cardName;

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return createPortal(
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        className="w-[560px] max-h-[85vh] bg-background rounded-lg shadow-xl overflow-hidden flex flex-col border border-red-500/30"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-3 border-b border-border flex items-center gap-2 bg-red-50 dark:bg-red-950/20">
          <Trash2 className="w-4 h-4 text-red-500" />
          <h2 className="text-base font-semibold text-red-700 dark:text-red-300">
            {destroyEverything ? 'Destroy all infrastructure?' : 'Destroy deployment?'}
          </h2>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {!destroyEverything && resources.length > 0 && (
            <>
              <p className="text-sm text-muted-foreground">
                This will permanently delete the following {resources.length} resource
                {resources.length === 1 ? '' : 's'} from the cloud:
              </p>
              <div className="rounded-md border border-border divide-y divide-border max-h-40 overflow-y-auto">
                {resources.map((r, i) => (
                  <div key={i} className="px-3 py-2 text-sm flex items-center gap-2">
                    <span className="font-medium">{r.name}</span>
                    <span className="text-xs text-muted-foreground font-mono ml-auto">{r.type}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          {destroyEverything && (
            <>
              <p className="text-sm text-muted-foreground">
                This will scan every historical deployment for this card — including{' '}
                <span className="font-medium">failed and partial deploys</span> — and delete every ICE-managed resource
                it finds in GCP. Use this when a normal destroy can't find orphaned leftovers or you've hit a GCP quota
                from accumulated resources.
              </p>
              <div className="rounded-md border border-amber-500/30 bg-amber-50 dark:bg-amber-950/20 p-3 text-xs text-amber-700 dark:text-amber-300">
                Deletes in dependency order: forwarding rules → target proxies → URL maps → backend buckets → backend
                services → storage buckets → SSL certificates. Resources are destroyed in reverse creation order to
                avoid "still in use" errors.
              </div>
            </>
          )}

          {!destroyEverything && resources.length === 0 && (
            <div className="rounded-md border border-border p-3 text-sm text-muted-foreground">
              No resources tracked for this card. If you previously ran a deploy that failed, enable "Destroy
              everything" to scan for orphaned leftovers.
            </div>
          )}

          {/* Scope toggle */}
          <label className="flex items-start gap-2 p-3 rounded-md border border-border bg-muted/30 cursor-pointer">
            <input
              type="checkbox"
              checked={destroyEverything}
              onChange={(e) => setDestroyEverything(e.target.checked)}
              className="mt-0.5"
            />
            <div className="text-xs">
              <div className="font-medium text-foreground">Destroy everything for this project</div>
              <div className="text-muted-foreground mt-0.5">
                Walks every historical deployment (success, partial, failed) and the resource mapping table. Useful when
                the normal destroy misses orphans from failed deploys.
              </div>
            </div>
          </label>

          <div className="flex items-start gap-2 p-3 rounded-md bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/30">
            <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-red-700 dark:text-red-300">
              This cannot be undone. Any data stored in these resources will be lost.
            </p>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Type <span className="font-mono font-semibold text-foreground">{cardName}</span> to confirm:
            </label>
            <input
              autoFocus
              type="text"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              className="w-full px-3 py-1.5 text-sm rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-red-500/40"
              placeholder={cardName}
            />
          </div>
        </div>
        <div className="px-5 py-3 border-t border-border bg-muted/30 flex items-center justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-1.5 text-sm rounded-md border border-border hover:bg-muted transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(destroyEverything)}
            disabled={!canConfirm}
            className={cn(
              'px-4 py-1.5 text-sm rounded-md font-medium transition-colors',
              'bg-red-600 text-white hover:bg-red-700',
              'disabled:opacity-40 disabled:cursor-not-allowed',
            )}
          >
            {destroyEverything ? 'Destroy everything' : 'Destroy'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};
