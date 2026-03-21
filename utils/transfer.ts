type Bill = {
  amount: number;
  owner: 'me' | 'partner' | 'shared';
  paidBy: 'me' | 'partner';
};

type BudgetEntry = {
  amount: number;
};

type IncomeEntry = {
  amount: number;
  owner: 'me' | 'partner';
};

type CalculationMode =
  | 'equal'
  | 'custom'
  | 'income_based'
  | 'equal_leftover';

export function formatCurrency(value: number) {
  return new Intl.NumberFormat('sv-SE', {
    style: 'currency',
    currency: 'SEK',
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function getSharedRatios({
  calculationMode,
  mySharedPercent,
  myIncome,
  partnerIncome,
}: {
  calculationMode: CalculationMode;
  mySharedPercent: number;
  myIncome: number;
  partnerIncome: number;
}) {
  if (calculationMode === 'custom') {
    const myRatio = Math.max(0, Math.min(1, mySharedPercent / 100));
    return {
      myRatio,
      partnerRatio: 1 - myRatio,
    };
  }

  if (calculationMode === 'income_based') {
    const totalIncome = myIncome + partnerIncome;
    const myRatio = totalIncome > 0 ? myIncome / totalIncome : 0.5;
    return {
      myRatio,
      partnerRatio: 1 - myRatio,
    };
  }

  return {
    myRatio: 0.5,
    partnerRatio: 0.5,
  };
}

export function calculateTransferSummary({
  bills,
  budgetEntries,
  incomes,
  meName,
  partnerName,
  calculationMode,
  mySharedPercent,
  includeBudget,
}: {
  bills: Bill[];
  budgetEntries: BudgetEntry[];
  incomes: IncomeEntry[];
  meName: string;
  partnerName: string;
  calculationMode: CalculationMode;
  mySharedPercent: number;
  includeBudget: boolean;
}) {
  const myIncome = incomes
    .filter((entry) => entry.owner === 'me')
    .reduce((sum, entry) => sum + (Number(entry.amount) || 0), 0);

  const partnerIncome = incomes
    .filter((entry) => entry.owner === 'partner')
    .reduce((sum, entry) => sum + (Number(entry.amount) || 0), 0);

  const totalBudget = budgetEntries.reduce(
    (sum, entry) => sum + (Number(entry.amount) || 0),
    0,
  );

  const myOwnBills = bills
    .filter((bill) => bill.owner === 'me')
    .reduce((sum, bill) => sum + (Number(bill.amount) || 0), 0);

  const partnerOwnBills = bills
    .filter((bill) => bill.owner === 'partner')
    .reduce((sum, bill) => sum + (Number(bill.amount) || 0), 0);

  const sharedBills = bills
    .filter((bill) => bill.owner === 'shared')
    .reduce((sum, bill) => sum + (Number(bill.amount) || 0), 0);

  const myPaidSharedBills = bills
    .filter((bill) => bill.owner === 'shared' && bill.paidBy === 'me')
    .reduce((sum, bill) => sum + (Number(bill.amount) || 0), 0);

  const partnerPaidSharedBills = bills
    .filter((bill) => bill.owner === 'shared' && bill.paidBy === 'partner')
    .reduce((sum, bill) => sum + (Number(bill.amount) || 0), 0);

  // =========================
  // Lika kvar
  // =========================
  if (calculationMode === 'equal_leftover') {
    const totalHouseholdOutflow =
      myOwnBills + partnerOwnBills + sharedBills + totalBudget;

    const targetLeftoverEach =
      (myIncome + partnerIncome - totalHouseholdOutflow) / 2;

    const myCurrentAfterPaidBills =
      myIncome - myOwnBills - myPaidSharedBills;

    const partnerCurrentAfterPaidBills =
      partnerIncome - partnerOwnBills - partnerPaidSharedBills;

    const myTransfer = myCurrentAfterPaidBills - targetLeftoverEach;

    if (Math.abs(myTransfer) < 1) {
      return {
        label: 'Att föra över',
        amountText: formatCurrency(0),
        helper: 'Ni har redan lika mycket kvar efter räkningar och budget.',
      };
    }

    if (myTransfer > 0) {
      return {
        label: 'Att föra över',
        amountText: `${meName} → ${partnerName}: ${formatCurrency(myTransfer)}`,
        helper: 'Baserat på lika mycket kvar efter räkningar och budget.',
      };
    }

    return {
      label: 'Att föra över',
      amountText: `${partnerName} → ${meName}: ${formatCurrency(Math.abs(myTransfer))}`,
      helper: 'Baserat på lika mycket kvar efter räkningar och budget.',
    };
  }

  // =========================
  // Delningsmodeller
  // =========================
  const { myRatio, partnerRatio } = getSharedRatios({
    calculationMode,
    mySharedPercent,
    myIncome,
    partnerIncome,
  });

  const includedBudget = includeBudget ? totalBudget : 0;
  const sharedCostPool = sharedBills + includedBudget;

  const myTargetShare = sharedCostPool * myRatio;
  const partnerTargetShare = sharedCostPool * partnerRatio;

  const myActualSharedContribution = myPaidSharedBills;
  const partnerActualSharedContribution = partnerPaidSharedBills;

  const myDiff = myActualSharedContribution - myTargetShare;
  const partnerDiff = partnerActualSharedContribution - partnerTargetShare;

  if (Math.abs(myDiff) < 1 && Math.abs(partnerDiff) < 1) {
    return {
      label: 'Att föra över',
      amountText: formatCurrency(0),
      helper: includeBudget
        ? 'Ingen överföring behövs just nu. Budgeten är redan rätt fördelad.'
        : 'Ingen överföring behövs just nu.',
    };
  }

  if (myDiff > 0) {
    return {
      label: 'Att föra över',
      amountText: `${partnerName} → ${meName}: ${formatCurrency(myDiff)}`,
      helper: includeBudget
        ? 'Baserat på gemensamma räkningar och budget.'
        : 'Baserat på gemensamma räkningar.',
    };
  }

  return {
    label: 'Att föra över',
    amountText: `${meName} → ${partnerName}: ${formatCurrency(Math.abs(myDiff))}`,
    helper: includeBudget
      ? 'Baserat på gemensamma räkningar och budget.'
      : 'Baserat på gemensamma räkningar.',
  };
}