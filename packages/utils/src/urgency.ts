const MS_PER_DAY = 24 * 60 * 60 * 1000;

const SURFACE_THRESHOLD = 40;

export function computeUrgency(
  priority: number,
  dueDate: number | null,
  now: number = Date.now(),
): number {
  const daysUntilDue = dueDate != null ? (dueDate - now) / MS_PER_DAY : null;

  if (priority <= 1) {
    return 100;
  }
  if (priority === 2) {
    if (daysUntilDue != null && daysUntilDue <= 0) return 95;
    return 85;
  }
  if (priority === 3) {
    if (daysUntilDue != null && daysUntilDue <= 0) return 80;
    if (daysUntilDue != null && daysUntilDue <= 3) return 65;
    return 30;
  }
  // priority 4 (Low)
  if (daysUntilDue != null && daysUntilDue <= 0) return 60;
  if (daysUntilDue != null && daysUntilDue <= 1) return 45;
  return 20;
}

export function shouldSurface(urgencyScore: number): boolean {
  return urgencyScore >= SURFACE_THRESHOLD;
}
