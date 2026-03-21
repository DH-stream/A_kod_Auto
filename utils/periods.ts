import type { Bill, PeriodData } from '../context/AppContext';
import { createId, createPeriodId, createSortKey } from './ids';

const MONTHS = ['jan', 'feb', 'mars', 'apr', 'maj', 'juni', 'juli', 'aug', 'sep', 'okt', 'nov', 'dec'];

function formatLabel(start: Date, end: Date) {
  return `${start.getDate()} ${MONTHS[start.getMonth()]} – ${end.getDate()} ${MONTHS[end.getMonth()]}`;
}

function addMonthsSafe(date: Date, months: number) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

export function createNextPeriodFromCurrent(current: PeriodData): PeriodData {
  const currentEnd = new Date(current.endDate);
  const nextStart = new Date(currentEnd);
  nextStart.setDate(nextStart.getDate() + 1);

  const nextEnd = addMonthsSafe(nextStart, 1);
  nextEnd.setDate(nextEnd.getDate() - 1);

  const nextStartIso = nextStart.toISOString().slice(0, 10);
  const nextEndIso = nextEnd.toISOString().slice(0, 10);

  const recurringBills = current.bills
    .filter((bill) => bill.recurring)
    .map<Bill>((bill) => ({
      ...bill,
      id: createId('bill'),
      paid: false,
    }));

  return {
    id: createPeriodId(nextStartIso),
    label: formatLabel(nextStart, nextEnd),
    sortKey: createSortKey(nextStartIso),
    startDate: nextStartIso,
    endDate: nextEndIso,
    bills: recurringBills,
    budgetEntries: [],
    incomeEntries: [],
  };
}

export function formatPeriodRange(startDate?: string, endDate?: string) {
  if (!startDate || !endDate) return '';
  const start = new Date(startDate);
  const end = new Date(endDate);
  return `${start.getDate()} ${MONTHS[start.getMonth()]} – ${end.getDate()} ${MONTHS[end.getMonth()]}`;
}
