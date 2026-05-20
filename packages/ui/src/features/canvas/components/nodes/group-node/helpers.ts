/** Convert hex color to tint with configurable opacity */
export function hexToTint(hex: string, alpha = 0.09): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Convert hex color to semi-transparent border */
export function hexToBorder(hex: string): string {
  return hex + '50';
}
