/**
 * Shared types and constants for the inline table view. Extracted from
 * `inline-table-view.tsx` (rf-itab-1) so subcomponents and helper
 * modules can import them without pulling the orchestrator's runtime.
 */
import type { RowStatus } from '../inline-table-view-helpers';

export type SortCol = 'label' | 'typeLabel' | 'provider' | 'status' | 'providerId' | 'updatedAt';
export type SortDir = 'asc' | 'desc';
export type GroupBy = 'none' | 'status' | 'provider' | 'family' | 'group';
export type Density = 'compact' | 'comfortable';

/**
 * Display order for the status filter chips and the footer mini-counts.
 * Matches the canvas pipeline status priority — failed/drifted bubble
 * to the top so an issue is the first thing the user sees.
 */
export const ALL_STATUSES: RowStatus[] = ['live', 'drifted', 'deploying', 'building', 'queued', 'failed', 'idle'];

/**
 * Sort weight used when the user clicks the status column header.
 * Lower = higher priority — failed first, then drifted, then in-flight,
 * then live, then idle.
 */
export const STATUS_ORDER: Record<RowStatus, number> = {
  failed: 0,
  drifted: 1,
  deploying: 2,
  building: 3,
  queued: 4,
  live: 5,
  idle: 6,
};
