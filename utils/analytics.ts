export type Bill = { id: number | string; name: string; amount: number; category?: string };
export type BudgetEntry = { id: number | string; name: string; amount: number; category?: string };
export type IncomeEntry = { id: number | string; name: string; amount: number };
export type Period = {
  id: string;
  label?: string;
  startDate?: string;
  endDate?: string;
  bills?: Bill[];
  budgetEntries?: BudgetEntry[];
  incomeEntries?: IncomeEntry[];
};

type RangeOption = { index: number; id: string; label: string };

type TopExpenseItem = { name: string; total: number; count: number; type: 'bill' | 'budget'; category?: string };
type CategoryTotalItem = { category: string; total: number };

type OverviewAnalytics = {
  totalIncome: number;
  totalBills: number;
  totalBudget: number;
  afterBills: number;
  afterBudget: number;
  topExpenses: TopExpenseItem[];
  categoryTotals: CategoryTotalItem[];
  periodCount: number;
};

const MONTHS = ['jan', 'feb', 'mars', 'apr', 'maj', 'juni', 'juli', 'aug', 'sep', 'okt', 'nov', 'dec'];

function formatDate(dateString?: string) {
  if (!dateString) return '';
  const d = new Date(dateString);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

function makeLabel(period: Period, fallbackIndex: number) {
  if (period.startDate && period.endDate) return `${formatDate(period.startDate)} – ${formatDate(period.endDate)}`;
  if (period.label) return period.label;
  return `Period ${fallbackIndex + 1}`;
}

export function getRangeOptions(periods: Period[]): RangeOption[] {
  return periods.map((period, index) => ({ index, id: period.id, label: makeLabel(period, index) }));
}

export function getPeriodsInRange(periods: Period[], startIndex: number, endIndex: number) {
  if (!periods.length) return [];
  const from = Math.min(startIndex, endIndex);
  const to = Math.max(startIndex, endIndex);
  return periods.slice(from, to + 1);
}

export function getDefaultYearToDateRange(periods: Period[]) {
  if (!periods.length) return { startIndex: 0, endIndex: 0 };
  const currentYear = new Date().getFullYear();
  let startIndex = 0;
  let endIndex = periods.length - 1;
  periods.forEach((period, index) => {
    if (period.startDate?.startsWith(`${currentYear}-01-`)) startIndex = index;
    if (period.startDate?.startsWith(`${currentYear}-`)) endIndex = index;
  });
  return { startIndex, endIndex };
}

export function getDisplayRangeLabel(periods: Period[]) {
  if (!periods.length) return '';
  const first = periods[0];
  const last = periods[periods.length - 1];
  if (first.startDate && last.endDate) {
    return `${formatDate(first.startDate)} – ${formatDate(last.endDate)}`;
  }
  return `${makeLabel(first, 0)} – ${makeLabel(last, periods.length - 1)}`;
}

function normalizeCategory(category?: string) {
  return category?.trim() || 'Övrigt';
}
function normalizeName(name?: string) {
  return name?.trim() || 'Okänd post';
}

export function calculateOverviewAnalyticsFromRange(periods: Period[], startIndex: number, endIndex: number, options?: { includeOneTimeExpenses?: boolean; topExpensesLimit?: number; }): OverviewAnalytics {
  const selected = getPeriodsInRange(periods, startIndex, endIndex);
  const includeOneTimeExpenses = options?.includeOneTimeExpenses ?? true;
  const topExpensesLimit = options?.topExpensesLimit ?? 10;

  let totalIncome = 0;
  let totalBills = 0;
  let totalBudget = 0;
  const expenseMap = new Map<string, TopExpenseItem>();
  const categoryMap = new Map<string, number>();

  selected.forEach((period) => {
    (period.incomeEntries || []).forEach((income) => { totalIncome += Number(income.amount) || 0; });
    (period.bills || []).forEach((bill) => {
      const amount = Number(bill.amount) || 0;
      totalBills += amount;
      const category = normalizeCategory(bill.category);
      categoryMap.set(category, (categoryMap.get(category) || 0) + amount);
      const name = normalizeName(bill.name);
      const key = `bill:${name.toLowerCase()}`;
      const existing = expenseMap.get(key);
      if (existing) { existing.total += amount; existing.count += 1; }
      else expenseMap.set(key, { name, total: amount, count: 1, type: 'bill', category });
    });
    (period.budgetEntries || []).forEach((entry) => {
      const amount = Number(entry.amount) || 0;
      totalBudget += amount;
      const category = normalizeCategory(entry.category);
      categoryMap.set(category, (categoryMap.get(category) || 0) + amount);
      const name = normalizeName(entry.name);
      const key = `budget:${name.toLowerCase()}`;
      const existing = expenseMap.get(key);
      if (existing) { existing.total += amount; existing.count += 1; }
      else expenseMap.set(key, { name, total: amount, count: 1, type: 'budget', category });
    });
  });

  let topExpenses = Array.from(expenseMap.values()).sort((a,b)=>b.total-a.total);
  if (!includeOneTimeExpenses) topExpenses = topExpenses.filter((item) => item.count > 1);

  const categoryTotals = Array.from(categoryMap.entries()).map(([category,total])=>({category,total})).sort((a,b)=>b.total-a.total);

  return {
    totalIncome,
    totalBills,
    totalBudget,
    afterBills: totalIncome - totalBills,
    afterBudget: totalIncome - totalBills - totalBudget,
    topExpenses: topExpenses.slice(0, topExpensesLimit),
    categoryTotals,
    periodCount: selected.length,
  };
}
