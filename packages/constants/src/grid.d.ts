/**
 * Grid & Layout Constants
 *
 * Canvas card dimensions, container padding, spacing,
 * and derived group dimension helpers.
 */
export declare const CARD_WIDTH = 240;
export declare const CARD_HEIGHT = 160;
export declare const HEADER_HEIGHT = 36;
export declare const CONTAINER_PADDING = 20;
export declare const CHILD_GAP = 16;
export declare const GROUP_GAP = 30;
/** Horizontal gap between siblings on the same dagre rank. */
export declare const LAYOUT_NODE_SEP = 40;
/** Vertical gap between dagre ranks (layers). */
export declare const LAYOUT_RANK_SEP = 80;
/** marginx/marginy passed to `setGraph()`. */
export declare const LAYOUT_MARGIN = 40;
/** Every position + size produced by auto-layout snaps to a multiple of this. */
export declare const LAYOUT_GRID_STEP = 40;
/** Minimum rendered bounds of Network.PrivateNetwork (mirrored from its renderer). */
export declare const PRIVATE_NETWORK_MIN_WIDTH = 560;
export declare const PRIVATE_NETWORK_MIN_HEIGHT = 320;
export declare function groupWidth(cols: number): number;
export declare function groupHeight(rows: number): number;
