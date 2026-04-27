/**
 * Color Palette
 *
 * Named hue tokens used across the ICE UI. These are the base palette
 * (Tailwind 400/500-level swatches) — semantic maps like
 * `STATUS_COLORS`, `BLOCK_ACCENT_COLORS`, `EDGE_COLORS`, etc. should
 * reference these tokens instead of inlining raw hex literals so the
 * "what color is `success` / `Frontend` / `selected`?" question has one
 * answer and we can retune the palette globally.
 *
 * Brand-specific colors (AWS orange, GCP blue, the various block-accent
 * colors that don't match a Tailwind hue) stay inline at their call site
 * — those aren't palette colors, they're brand colors.
 */
/**
 * Cloud-provider brand colors. Live in the same module as `COLORS` so the
 * "every named color is here" rule holds, but kept in a separate map
 * because they're brand identity, not palette tokens — no
 * `BRAND_COLORS.aws` should ever leak into a non-AWS context.
 */
export declare const BRAND_COLORS: {
    readonly aws: "#ff9900";
    readonly gcp: "#4285f4";
    readonly azure: "#0078d4";
    readonly kubernetes: "#326ce5";
    readonly alibaba: "#ff6a00";
    readonly oci: "#f80000";
    readonly digitalocean: "#0080ff";
};
export type BrandColorToken = keyof typeof BRAND_COLORS;
export declare const COLORS: {
    readonly blue: "#3b82f6";
    readonly blueDeep: "#2563eb";
    readonly blueLight: "#60a5fa";
    readonly blueDark: "#1e3a5f";
    readonly sky: "#0ea5e9";
    readonly green: "#22c55e";
    readonly emerald: "#10b981";
    readonly lime: "#84cc16";
    readonly cyan: "#06b6d4";
    readonly cyanBright: "#22d3ee";
    readonly teal: "#14b8a6";
    readonly amber: "#f59e0b";
    readonly yellow: "#eab308";
    readonly red: "#ef4444";
    readonly orange: "#f97316";
    readonly pink: "#ec4899";
    readonly rose: "#f43f5e";
    readonly violet: "#8b5cf6";
    readonly indigo: "#6366f1";
    readonly purple: "#a855f7";
    readonly slate400: "#94a3b8";
    readonly slate500: "#64748b";
    readonly slate600: "#475569";
    readonly zinc400: "#a1a1aa";
    readonly zinc500: "#71717a";
    readonly gray500: "#6b7280";
    readonly stone500: "#78716c";
};
export type ColorToken = keyof typeof COLORS;
