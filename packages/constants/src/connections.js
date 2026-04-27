/**
 * Connection Constants
 *
 * Connection edge categories, colors, and relationship mapping.
 * Port/envVar data lives on the resource tree in ice-types.ts.
 */
import { COLORS } from './colors.js';
export const CATEGORY_COLORS = {
    traffic: COLORS.green,
    pipeline: COLORS.violet,
    config: COLORS.amber,
    dns: COLORS.cyanBright,
};
export const CATEGORY_TO_RELATIONSHIP = {
    traffic: 'connects_to',
    pipeline: 'connects_to',
    config: 'depends_on',
    dns: 'connects_to',
};
