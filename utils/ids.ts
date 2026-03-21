export function createId(prefix: string) {
  const random = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now()}_${random}`;
}

export function createPeriodId(startDateIso: string) {
  return `period_${startDateIso.slice(0, 10)}`;
}

export function createSortKey(dateIso?: string) {
  if (!dateIso) return '0000-00';
  return dateIso.slice(0, 7);
}
