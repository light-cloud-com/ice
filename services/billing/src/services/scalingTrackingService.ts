// Scaling tracking service — calculates billable hours based on Cloud Run scaling events
export async function pollAndRecordScalingEvents() { return { polled: 0, scaledUp: 0, scaledDown: 0 }; }

export function calculateBillableHours(
  _serviceId: string,
  _from: Date,
  _to: Date,
): number {
  // Default: assume always running (full hours in period)
  return Math.ceil((_to.getTime() - _from.getTime()) / (1000 * 60 * 60));
}

export async function hasScalingData(_serviceId: string): Promise<boolean> {
  return false;
}
