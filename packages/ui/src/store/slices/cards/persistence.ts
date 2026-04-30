/**
 * Cards slice — localStorage persistence loader.
 *
 * `loadPersistedCards` is called once at module load to seed the slice's
 * `initialState`. It reads the stored payload, runs `migrateCardNodes` over
 * each card's nodes, and writes the migrated payload back when the stored
 * data version is older than the current `CARDS_DATA_VERSION` — so version
 * mismatches MIGRATE the user's canvas, never wipe it (see learning
 * `data-version-bump-migrates-not-wipes`).
 *
 * The 3 storage-key constants are module-private; no consumer outside this
 * file references them.
 *
 * @see rf-cards-4
 */

import { migrateCardNodes } from './migration';
import type { CardsState } from './types';

// =============================================================================
// Persistence
// =============================================================================

const CARDS_STORAGE_KEY = 'ice-cards';

/**
 * Data version — bumped whenever the persisted node shape changes. The
 * loader runs `migrateCardNodes` over the stored payload before bumping
 * the version key, so a version-mismatch is a *migrate* event, never a
 * wipe (see learning `data-version-bump-migrates-not-wipes`). Every
 * ingestion reducer that accepts external nodes (addNodeToCard,
 * importToActiveCard, addToActiveCard, expandBlueprintToCard) also runs
 * the migrator so backend-saved canvases / clipboard imports / AI
 * tool-use writes pick up the same fixes the localStorage loader does.
 *
 * v5: Removed hardcoded demo card — cards now come from backend.
 * v6: Monitoring.Terminal → Monitoring.Log consolidation.
 */
const CARDS_DATA_VERSION = 6;
const CARDS_VERSION_KEY = 'ice-cards-version';

export function loadPersistedCards(): CardsState {
  try {
    const storedVersion = parseInt(localStorage.getItem(CARDS_VERSION_KEY) || '0', 10);
    const raw = localStorage.getItem(CARDS_STORAGE_KEY);

    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.cards && parsed.cards.length > 0) {
        const cards = parsed.cards
          .filter((c: any) => c.id !== 'demo') // drop legacy demo card
          .map((c: any) => ({ ...c, nodes: migrateCardNodes(c.nodes || []) }));

        // Persist the migrated payload back so we don't re-migrate on
        // every load, and bump the version key. We MIGRATE, never wipe —
        // a version mismatch is the trigger for migration, not for
        // discarding the user's canvas.
        if (storedVersion < CARDS_DATA_VERSION) {
          try {
            localStorage.setItem(
              CARDS_STORAGE_KEY,
              JSON.stringify({ ...parsed, cards }),
            );
            localStorage.setItem(CARDS_VERSION_KEY, String(CARDS_DATA_VERSION));
          } catch {
            /* localStorage write failed (quota, private mode); leave the
             * in-memory migrated payload — next session will re-migrate. */
          }
        }

        return {
          cards,
          activeCardId: parsed.activeCardId === 'demo' ? cards[0]?.id || null : parsed.activeCardId || null,
          history: {},
        };
      }
    }

    // No prior payload — just record the current data version for
    // future migrations.
    if (storedVersion < CARDS_DATA_VERSION) {
      try {
        localStorage.setItem(CARDS_VERSION_KEY, String(CARDS_DATA_VERSION));
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore corrupt data */
  }
  return { cards: [], activeCardId: null, history: {} };
}
