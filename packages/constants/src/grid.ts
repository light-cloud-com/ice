/**
 * Grid & Layout Constants
 *
 * Canvas card dimensions, container padding, spacing,
 * and derived group dimension helpers.
 */

export const CARD_WIDTH = 240;
export const CARD_HEIGHT = 160;
export const HEADER_HEIGHT = 36;
export const CONTAINER_PADDING = 20;
export const CHILD_GAP = 16;
export const GROUP_GAP = 30;

export function groupWidth(cols: number): number {
  return CONTAINER_PADDING + cols * CARD_WIDTH + (cols - 1) * CHILD_GAP + CONTAINER_PADDING;
}

export function groupHeight(rows: number): number {
  return HEADER_HEIGHT + CONTAINER_PADDING + rows * CARD_HEIGHT + (rows - 1) * CHILD_GAP + CONTAINER_PADDING;
}
