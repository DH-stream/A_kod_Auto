import { supabase } from '@/utils/supabase';
import React, {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { createId, createPeriodId, createSortKey } from '../utils/ids';
import { loadPersistedState, savePersistedState } from '../utils/storage';
import { Alert, AppState as RNAppState } from 'react-native';
import { getCurrentSession, sendEmailOtp, signOutUser, verifyEmailOtp } from '@/lib/auth';


export type Owner = 'me' | 'partner' | 'shared';
export type Payer = 'me' | 'partner';

export type CalculationMode =
  | 'equal'
  | 'custom'
  | 'income_based'
  | 'equal_leftover';

export type Bill = {
  id: string;
  name: string;
  amount: number;
  paid: boolean;
  owner: Owner;
  paidBy: Payer;
  category: string;
  recurring: boolean;
};

export type BudgetEntry = {
  id: string;
  name: string;
  amount: number;
  category: string;
};

export type IncomeEntry = {
  id: string;
  name: string;
  amount: number;
  owner: Payer;
};

export type PeriodData = {
  id: string;
  label: string;
  sortKey: string;
  startDate: string;
  endDate: string;
  archived?: boolean;
  bills: Bill[];
  budgetEntries: BudgetEntry[];
  incomeEntries: IncomeEntry[];
};

export type AppState = {
  meName: string;
  partnerName: string;
  categories: string[];
  periods: PeriodData[];
  selectedPeriodId: string;
  mySharedPercent: number;
  calculationMode: CalculationMode;
  householdId: string | null;
  householdInviteCode: string | null;
};

type AppContextType = {
  isHydrated: boolean;

  meName: string;
  partnerName: string;
  setMeName: (value: string) => void;
  setPartnerName: (value: string) => void;

  categories: string[];
  addCategory: (name: string) => boolean;
  removeCategory: (name: string) => void;
  resetCategories: () => void;

  periods: PeriodData[];
  selectedPeriodId: string;
  setSelectedPeriodId: (value: string) => void;
  selectedPeriod: PeriodData;

  mySharedPercent: number;
  partnerSharedPercent: number;
  setMySharedPercent: (value: number) => void;

  calculationMode: CalculationMode;
  setCalculationMode: (value: CalculationMode) => void;

  householdId: string | null;
  householdInviteCode: string | null;
  setHouseholdId: (value: string | null) => void;
  createHousehold: () => Promise<string | null>;
  joinHousehold: (code: string) => Promise<boolean>;
  leaveHousehold: () => Promise<void>;
  forceSyncHousehold: () => Promise<boolean>;

  updateSelectedPeriod: (updater: (period: PeriodData) => PeriodData) => void;
  createNextPeriod: () => void;
  goToLatestPeriod: () => void;

  renamePeriod: (periodId: string, nextLabel: string) => void;
  archivePeriod: (periodId: string) => boolean;
  restorePeriod: (periodId: string) => void;
  deletePeriod: (periodId: string) => boolean;
  upsertRecurringBill: (bill: Bill, shouldBeRecurring: boolean) => void;
  authUserId: string | null;
  authEmail: string | null;
  sendOtpLogin: (email: string) => Promise<{ ok: boolean; error?: string }>;
  verifyOtpLogin: (email: string, token: string) => Promise<{ ok: boolean; error?: string }>;
  signOutAuth: () => Promise<void>;
  presenceText: string | null;
  activityNotice: { id: string; text: string } | null;
  notifyBillPaid: (billName: string) => void;
};

const DEFAULT_CATEGORIES = [
  'Boende',
  'Mat',
  'Bil',
  'Abonnemang',
  'Försäkring',
  'Nöje',
  'Telefon',
  'Sparande',
  'Övrigt',
];

function isoDate(year: number, monthIndex: number, day: number) {
  return new Date(Date.UTC(year, monthIndex, day)).toISOString();
}

function formatPeriodLabel(startIso: string, endIso: string) {
  const start = new Date(startIso);
  const end = new Date(endIso);

  const startDay = start.getUTCDate();
  const endDay = end.getUTCDate();

  const startMonth = start.toLocaleDateString('sv-SE', {
    month: 'short',
    timeZone: 'UTC',
  });

  const endMonth = end.toLocaleDateString('sv-SE', {
    month: 'short',
    timeZone: 'UTC',
  });

  return `${startDay} ${startMonth} – ${endDay} ${endMonth}`;
}

function addMonthsUTC(date: Date, months: number) {
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth() + months,
      date.getUTCDate(),
    ),
  );
}

function addDaysUTC(date: Date, days: number) {
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate() + days,
    ),
  );
}

function normalizeCategory(value: string) {
  return value.trim();
}

function clampPercent(value: number) {
  if (Number.isNaN(value)) return 50;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function normalizeMoney(value: unknown) {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
}

function normalizeBill(input: any): Bill {
  return {
    id: String(input?.id ?? createId('bill')),
    name: String(input?.name ?? ''),
    amount: normalizeMoney(input?.amount),
    paid: Boolean(input?.paid),
    owner: input?.owner === 'partner' || input?.owner === 'shared' ? input.owner : 'me',
    paidBy: input?.paidBy === 'partner' ? 'partner' : 'me',
    category: String(input?.category ?? 'Övrigt'),
    recurring: Boolean(input?.recurring),
  };
}

function normalizeBudgetEntry(input: any): BudgetEntry {
  return {
    id: String(input?.id ?? createId('budget')),
    name: String(input?.name ?? ''),
    amount: normalizeMoney(input?.amount),
    category: String(input?.category ?? 'Övrigt'),
  };
}

function normalizeIncomeEntry(input: any): IncomeEntry {
  return {
    id: String(input?.id ?? createId('income')),
    name: String(input?.name ?? ''),
    amount: normalizeMoney(input?.amount),
    owner: input?.owner === 'partner' ? 'partner' : 'me',
  };
}

function normalizeCalculationMode(input: any): CalculationMode {
  if (input?.calculationMode === 'equal_leftover') return 'equal_leftover';
  if (input?.calculationMode === 'income_based') return 'income_based';
  if (input?.calculationMode === 'custom') return 'custom';
  if (input?.calculationMode === 'equal') return 'equal';

  // migration from older model
  if (input?.transferMode === 'equal_leftover') return 'equal_leftover';
  if (input?.sharedSplitMode === 'income_based') return 'income_based';
  if (input?.sharedSplitMode === 'custom') return 'custom';

  return 'equal';
}

function normalizePeriod(input: any, fallbackIndex: number): PeriodData {
  const startDate =
    typeof input?.startDate === 'string'
      ? input.startDate
      : isoDate(2026, fallbackIndex, 1);

  const endDate =
    typeof input?.endDate === 'string'
      ? input.endDate
      : isoDate(2026, fallbackIndex, 28);

  const safeStartDate =
    startDate.length >= 10 ? startDate : new Date(startDate).toISOString();

  const safeEndDate =
    endDate.length >= 10 ? endDate : new Date(endDate).toISOString();

  return {
    id: typeof input?.id === 'string' && input.id ? input.id : createPeriodId(safeStartDate),
    label:
      typeof input?.label === 'string' && input.label.trim()
        ? input.label.trim()
        : formatPeriodLabel(safeStartDate, safeEndDate),
    sortKey:
      typeof input?.sortKey === 'string' && input.sortKey
        ? input.sortKey
        : createSortKey(safeStartDate),
    startDate: safeStartDate,
    endDate: safeEndDate,
    archived: Boolean(input?.archived),
    bills: Array.isArray(input?.bills) ? input.bills.map(normalizeBill) : [],
    budgetEntries: Array.isArray(input?.budgetEntries)
      ? input.budgetEntries.map(normalizeBudgetEntry)
      : [],
    incomeEntries: Array.isArray(input?.incomeEntries)
      ? input.incomeEntries.map(normalizeIncomeEntry)
      : [],
  };
}

function normalizeState(input: Partial<AppState> | null | undefined): AppState {
  const periods =
    Array.isArray(input?.periods) && input.periods.length
      ? input.periods
        .map((period, index) => normalizePeriod(period, index))
        .sort((a, b) => a.sortKey.localeCompare(b.sortKey))
      : DEFAULT_STATE.periods;

  const selectedPeriodId =
    typeof input?.selectedPeriodId === 'string' &&
      periods.some((period) => period.id === input.selectedPeriodId)
      ? input.selectedPeriodId
      : periods[periods.length - 1]?.id ?? DEFAULT_STATE.selectedPeriodId;

  return {
    meName:
      typeof input?.meName === 'string' && input.meName.trim()
        ? input.meName
        : DEFAULT_STATE.meName,
    partnerName:
      typeof input?.partnerName === 'string' && input.partnerName.trim()
        ? input.partnerName
        : DEFAULT_STATE.partnerName,
    categories:
      Array.isArray(input?.categories) && input.categories.length
        ? input.categories.map((category) => String(category)).filter(Boolean)
        : DEFAULT_CATEGORIES,
    periods,
    selectedPeriodId,
    mySharedPercent: clampPercent(Number((input as any)?.mySharedPercent ?? DEFAULT_STATE.mySharedPercent)),
    calculationMode: normalizeCalculationMode(input),
    householdId:
      typeof input?.householdId === 'string' || input?.householdId === null
        ? input.householdId ?? null
        : null,
    householdInviteCode:
      typeof (input as any)?.householdInviteCode === 'string' ||
        (input as any)?.householdInviteCode === null
        ? (input as any).householdInviteCode ?? null
        : null,
  };
}

const DEFAULT_STATE: AppState = {
  meName: 'Max',
  partnerName: 'Felicia',
  categories: DEFAULT_CATEGORIES,
  mySharedPercent: 50,
  calculationMode: 'equal',
  householdId: null,
  householdInviteCode: null,
  selectedPeriodId: createPeriodId(isoDate(2026, 1, 25)),
  periods: [
    {
      id: createPeriodId(isoDate(2026, 0, 25)),
      label: '25 jan – 24 feb',
      sortKey: createSortKey(isoDate(2026, 0, 25)),
      startDate: isoDate(2026, 0, 25),
      endDate: isoDate(2026, 1, 24),
      bills: [],
      budgetEntries: [],
      incomeEntries: [],
    },
    {
      id: createPeriodId(isoDate(2026, 1, 25)),
      label: '25 feb – 24 mars',
      sortKey: createSortKey(isoDate(2026, 1, 25)),
      startDate: isoDate(2026, 1, 25),
      endDate: isoDate(2026, 2, 24),
      bills: [],
      budgetEntries: [],
      incomeEntries: [],
    },
  ],
};

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const [isHydrated, setIsHydrated] = useState(false);

  const [meName, setMeName] = useState(DEFAULT_STATE.meName);
  const [partnerName, setPartnerName] = useState(DEFAULT_STATE.partnerName);
  const [categories, setCategories] = useState<string[]>(DEFAULT_STATE.categories);
  const [periods, setPeriods] = useState<PeriodData[]>(DEFAULT_STATE.periods);
  const [selectedPeriodId, setSelectedPeriodId] = useState(DEFAULT_STATE.selectedPeriodId);
  const [mySharedPercent, setMySharedPercentState] = useState(DEFAULT_STATE.mySharedPercent);
  const [calculationMode, setCalculationMode] = useState<CalculationMode>(DEFAULT_STATE.calculationMode);
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [householdInviteCode, setHouseholdInviteCode] = useState<string | null>(null);
  const isApplyingCloudStateRef = useRef(false);
  const skipNextCloudSaveRef = useRef(false);
  const lastCloudStateJsonRef = useRef<string | null>(null);
  const lastSavedStateJsonRef = useRef<string | null>(null);
  const skipNextPeriodPressRef = useRef(false);
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [authEmail, setAuthEmail] = useState<string | null>(null);
  const [presenceText, setPresenceText] = useState<string | null>(null);
  const [activityNotice, setActivityNotice] = useState<{ id: string; text: string } | null>(null);

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const activityTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hasLoadedRef = useRef(false);
  const persistTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function serializeStateForSync(state: AppState) {
    return JSON.stringify(state);
  }

  function showActivityNotice(text: string) {
    if (activityTimeoutRef.current) {
      clearTimeout(activityTimeoutRef.current);
    }

    setActivityNotice({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      text,
    });

    activityTimeoutRef.current = setTimeout(() => {
      setActivityNotice(null);
    }, 2600);
  }

  async function broadcastToHousehold(
    targetHouseholdId: string,
    event: 'bill_paid' | 'member_joined',
    payload: Record<string, any>,
  ) {
    if (!targetHouseholdId) return;

    if (channelRef.current && householdId === targetHouseholdId) {
      await channelRef.current.send({ type: 'broadcast', event, payload });
      return;
    }

    const tempChannel = supabase.channel(`household-room-${targetHouseholdId}`, {
      config: { broadcast: { self: false } },
    });

    await new Promise<void>((resolve) => {
      tempChannel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await tempChannel.send({ type: 'broadcast', event, payload });
          resolve();
        }
      });
    });

    setTimeout(() => {
      supabase.removeChannel(tempChannel);
    }, 300);
  }

  function notifyBillPaid(billName: string) {
    if (!householdId) return;

    broadcastToHousehold(householdId, 'bill_paid', {
      user: meName,
      bill: billName,
    });
  }

  async function trackPresence(channel: ReturnType<typeof supabase.channel>) {
    try {
      await channel.track({
        userId: authUserId ?? meName,
        name: meName,
        online_at: new Date().toISOString(),
      });
      console.log('TRACKED PRESENCE AS', meName);
    } catch (error) {
      console.log('TRACK PRESENCE ERROR', error);
    }
  }

  async function forceSyncHousehold(): Promise<boolean> {
    try {
      const targetHouseholdId = householdId;
      if (!targetHouseholdId) return false;

      skipNextCloudSaveRef.current = true;
      await loadBudgetFromCloud(targetHouseholdId);
      return true;
    } catch (error) {
      console.log('forceSyncHousehold error', error);
      return false;
    }
  }

  useEffect(() => {
    let mounted = true;

    async function loadState() {
      try {
        const parsed = await loadPersistedState();
        if (!mounted) return;

        const normalized = normalizeState(parsed);

        setMeName(normalized.meName);
        setHouseholdId(normalized.householdId);
        setHouseholdInviteCode(normalized.householdInviteCode);
        setPartnerName(normalized.partnerName);
        setCategories(normalized.categories);
        setPeriods(normalized.periods);
        setSelectedPeriodId(normalized.selectedPeriodId);
        setMySharedPercentState(normalized.mySharedPercent);
        setCalculationMode(normalized.calculationMode);
      } catch (error) {
        console.warn('Could not load app state from AsyncStorage', error);
      } finally {
        if (mounted) {
          hasLoadedRef.current = true;
          setIsHydrated(true);
        }
      }
    }

    loadState();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    async function bootstrapAuth() {
      const { data, error } = await getCurrentSession();

      if (!mounted) return;

      if (error) {
        console.log('getSession error', error);
        return;
      }

      setAuthUserId(data.session?.user?.id ?? null);
      setAuthEmail(data.session?.user?.email ?? null);
    }

    bootstrapAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthUserId(session?.user?.id ?? null);
      setAuthEmail(session?.user?.email ?? null);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);


  async function saveBudgetToCloud(state: any) {
    console.log('saveBudgetToCloud called');
    console.log('householdId:', householdId);

    if (!householdId) {
      console.log('No householdId -> skipping save');
      return;
    }

    const cloudState = { ...state, selectedPeriodId: DEFAULT_STATE.selectedPeriodId };
    const stateJson = serializeStateForSync(cloudState);

    if (isApplyingCloudStateRef.current) {
      console.log('Applying cloud state -> skipping save');
      return;
    }

    if (lastCloudStateJsonRef.current === stateJson) {
      console.log('State matches latest cloud state -> skipping save');
      return;
    }

    if (lastSavedStateJsonRef.current === stateJson) {
      console.log('State already saved -> skipping save');
      return;
    }

    if (skipNextCloudSaveRef.current) {
      console.log('Skipping one cloud save after cloud load');
      skipNextCloudSaveRef.current = false;
      return;
    }

    const { error } = await supabase
      .from('household_states')
      .upsert({
        household_id: householdId,
        data: cloudState,
        updated_at: new Date().toISOString(),
      });

    if (error) {
      console.log('Supabase save error:', error);
      Alert.alert('Supabase error', error.message);
    } else {
      console.log('Cloud save success');
      lastSavedStateJsonRef.current = stateJson;
      lastCloudStateJsonRef.current = stateJson;
    }
  }

  useEffect(() => {
    if (!hasLoadedRef.current) return;

    const stateToPersist: AppState = {
      meName,
      partnerName,
      categories,
      periods,
      selectedPeriodId: DEFAULT_STATE.selectedPeriodId,
      mySharedPercent,
      calculationMode,
      householdId,
      householdInviteCode,
    };

    if (persistTimeoutRef.current) {
      clearTimeout(persistTimeoutRef.current);
    }

    persistTimeoutRef.current = setTimeout(() => {
      saveBudgetToCloud(stateToPersist);

      savePersistedState(stateToPersist).catch((error) => {
        console.warn('Could not save app state to AsyncStorage', error);
      });
    }, 450);

    return () => {
      if (persistTimeoutRef.current) {
        clearTimeout(persistTimeoutRef.current);
      }
    };
  }, [
    meName,
    partnerName,
    categories,
    periods,
    selectedPeriodId,
    mySharedPercent,
    calculationMode,
    householdId,
    householdInviteCode,
  ]);

  const selectedPeriod =
    periods.find((period) => period.id === selectedPeriodId) ??
    periods[periods.length - 1] ??
    DEFAULT_STATE.periods[0];

  function updateSelectedPeriod(updater: (period: PeriodData) => PeriodData) {
    setPeriods((prev) =>
      prev.map((period) => (period.id === selectedPeriodId ? updater(period) : period)),
    );
  }

  async function loadBudgetFromCloud(targetHouseholdId?: string) {
    const resolvedHouseholdId = targetHouseholdId ?? householdId;
    console.log('loadBudgetFromCloud resolvedHouseholdId:', resolvedHouseholdId);
    if (!resolvedHouseholdId) return;

    const result = await supabase
      .from('household_states')
      .select('*')
      .eq('household_id', resolvedHouseholdId)
      .single();

    if (result.error) {
      console.log('supabase load error', result.error);
      return;
    }

    if (!result.data?.data) return;

    const cloudState = result.data.data as Partial<AppState>;

    const normalizedCloudState = normalizeState({
      ...cloudState,
      householdId: resolvedHouseholdId,
      householdInviteCode: cloudState.householdInviteCode ?? householdInviteCode ?? null,
      selectedPeriodId,
    });

    const localSelectedPeriodId = normalizedCloudState.periods.some(
      (period) => period.id === selectedPeriodId,
    )
      ? selectedPeriodId
      : normalizedCloudState.periods[normalizedCloudState.periods.length - 1]?.id ??
        DEFAULT_STATE.selectedPeriodId;

    const mergedCloudState: AppState = {
      ...normalizedCloudState,
      selectedPeriodId: localSelectedPeriodId,
    };

    const comparableCloudState = {
      ...mergedCloudState,
      selectedPeriodId: DEFAULT_STATE.selectedPeriodId,
    };

    isApplyingCloudStateRef.current = true;
    lastCloudStateJsonRef.current = serializeStateForSync(comparableCloudState);
    lastSavedStateJsonRef.current = serializeStateForSync(comparableCloudState);

    try {
      setMeName(mergedCloudState.meName);
      setPartnerName(mergedCloudState.partnerName);
      setCategories(mergedCloudState.categories);
      setPeriods(mergedCloudState.periods);
      if (selectedPeriodId !== mergedCloudState.selectedPeriodId) {
        setSelectedPeriodId(mergedCloudState.selectedPeriodId);
      }
      setMySharedPercentState(mergedCloudState.mySharedPercent);
      setCalculationMode(mergedCloudState.calculationMode);
      setHouseholdId(mergedCloudState.householdId);
      setHouseholdInviteCode(mergedCloudState.householdInviteCode);
    } finally {
      setTimeout(() => {
        isApplyingCloudStateRef.current = false;
      }, 0);
    }
  }

  useEffect(() => {
    if (!isHydrated) return;
    if (!householdId) return;

    loadBudgetFromCloud(householdId);
  }, [isHydrated, householdId]);

  useEffect(() => {
    if (!householdId) {
      setPresenceText(null);
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      return;
    }

    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    const channel = supabase.channel(`household-room-${householdId}`, {
      config: {
        presence: { key: authUserId ?? meName },
        broadcast: { self: false },
      },
    });

    channelRef.current = channel;

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        console.log('PRESENCE STATE', JSON.stringify(state));

        const others = Object.values(state)
          .flat()
          .map((entry: any) => ({
            userId: entry?.userId ?? entry?.presence?.userId,
            name: entry?.name ?? entry?.presence?.name,
          }))
          .filter((entry: any) => Boolean(entry.name))
          .filter((entry: any) => entry.userId !== (authUserId ?? meName));

        console.log('PRESENCE OTHERS', others);

        if (others.length > 0) {
          setPresenceText(`${others[0].name} är inne i appen`);
        } else {
          setTimeout(() => {
            setPresenceText((current) =>
              current && current.includes('är inne i appen') ? null : current,
            );
          }, 1200);
        }
      })
      .on('broadcast', { event: 'bill_paid' }, ({ payload }) => {
        console.log('BILL PAID EVENT', payload);
        if (!payload?.user || !payload?.bill) return;
        showActivityNotice(`${payload.user} betalade ${payload.bill}`);
      })
      .on('broadcast', { event: 'member_joined' }, ({ payload }) => {
        console.log('MEMBER JOINED EVENT', payload);
        if (!payload?.email) return;
        showActivityNotice(`${payload.email} gick med i hushållet!`);
      })
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'household_states',
          filter: `household_id=eq.${householdId}`,
        },
        (payload) => {
          if (isApplyingCloudStateRef.current) return;
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            loadBudgetFromCloud(householdId);
          }
        },
      )
      .subscribe(async (status) => {
        console.log('CHANNEL STATUS', status);

        if (status === 'SUBSCRIBED') {
          await trackPresence(channel);
        }
      });

    const appStateSubscription = RNAppState.addEventListener('change', async (nextState) => {
      if (nextState === 'active') {
        console.log('APPSTATE ACTIVE -> retrack presence');
        await trackPresence(channel);
      }
    });

    return () => {
      appStateSubscription.remove();
      if (channelRef.current === channel) {
        channelRef.current = null;
      }
      supabase.removeChannel(channel);
    };
  }, [householdId, authUserId, meName]);

  function makeInviteCode() {
    return Math.random().toString(36).slice(2, 8).toUpperCase();
  }

  async function createHousehold(): Promise<string | null> {
    if (!authUserId) {
      Alert.alert('Logga in först', 'Du behöver logga in med e-post innan du skapar hushåll.');
      return null;
    }

    const inviteCode = makeInviteCode();

    const result = await supabase
      .from('households')
      .insert({
        invite_code: inviteCode,
        created_by: authUserId,
      })
      .select('id, invite_code')
      .single();

    if (result.error || !result.data) {
      Alert.alert('Fel', result.error?.message ?? 'Kunde inte skapa hushåll');
      return null;
    }

    const newHouseholdId = result.data.id;
    const newInviteCode = result.data.invite_code ?? inviteCode;

    const memberInsert = await supabase.from('household_members').upsert(
      {
        household_id: newHouseholdId,
        user_id: authUserId,
      },
      {
        onConflict: 'household_id,user_id',
      }
    );

    if (memberInsert.error) {
      Alert.alert('Fel', memberInsert.error.message ?? 'Kunde inte lägga till medlem i hushållet.');
      return null;
    }

    const stateToPersist: AppState = {
      meName,
      partnerName,
      categories,
      periods,
      selectedPeriodId,
      mySharedPercent,
      calculationMode,
      householdId: newHouseholdId,
      householdInviteCode: newInviteCode,
    };

    const saveResult = await supabase
      .from('household_states')
      .upsert({
        household_id: newHouseholdId,
        data: stateToPersist,
        updated_at: new Date().toISOString(),
      });

    if (saveResult.error) {
      Alert.alert('Fel', saveResult.error.message ?? 'Kunde inte spara hushållets data');
      return null;
    }

    const initialStateJson = serializeStateForSync(stateToPersist);
    lastSavedStateJsonRef.current = initialStateJson;
    lastCloudStateJsonRef.current = initialStateJson;

    setHouseholdId(newHouseholdId);
    setHouseholdInviteCode(newInviteCode);

    return newInviteCode;
  }

  async function joinHousehold(code: string): Promise<boolean> {
    const cleanedCode = code.trim().toUpperCase();

    if (!cleanedCode) {
      Alert.alert('Saknar kod', 'Fyll i en hushållskod.');
      return false;
    }

    if (!authUserId) {
      Alert.alert('Logga in först', 'Du behöver logga in med e-post innan du går med i hushåll.');
      return false;
    }

    const result = await supabase.rpc('join_household_by_code', {
      p_code: cleanedCode,
    });

    console.log('joinHousehold rpc result', result);
    console.log('joinHousehold rpc result error', result.error);

    if (result.error || !result.data || !result.data.length) {
      Alert.alert('Fel', result.error?.message ?? 'Koden finns inte.');
      return false;
    }

    const joinedHouseholdId = result.data[0].out_household_id;
    const joinedInviteCode = result.data[0].out_invite_code ?? cleanedCode;

    console.log('joinedHouseholdId:', joinedHouseholdId);
    console.log('joinedInviteCode:', joinedInviteCode);

    isApplyingCloudStateRef.current = true;

    setHouseholdId(joinedHouseholdId);
    setHouseholdInviteCode(joinedInviteCode);

    await loadBudgetFromCloud(joinedHouseholdId);

    setTimeout(() => {
      isApplyingCloudStateRef.current = false;
    }, 0);

    const joiningIdentity = authEmail?.trim() || meName;
    setTimeout(() => {
      broadcastToHousehold(joinedHouseholdId, 'member_joined', { email: joiningIdentity });
    }, 500);

    return true;
  }

  async function sendOtpLogin(email: string): Promise<{ ok: boolean; error?: string }> {
    const cleanedEmail = email.trim().toLowerCase();

    if (!cleanedEmail) {
      return { ok: false, error: 'Fyll i en e-postadress.' };
    }

    const { error } = await sendEmailOtp(cleanedEmail);

    if (error) {
      return { ok: false, error: error.message };
    }

    return { ok: true };
  }

  async function verifyOtpLogin(
    email: string,
    token: string,
  ): Promise<{ ok: boolean; error?: string }> {
    const cleanedEmail = email.trim().toLowerCase();
    const cleanedToken = token.trim();

    if (!cleanedEmail) {
      return { ok: false, error: 'E-post saknas.' };
    }

    if (!cleanedToken) {
      return { ok: false, error: 'Kod saknas.' };
    }

    const { data, error } = await verifyEmailOtp(cleanedEmail, cleanedToken);

    if (error) {
      return { ok: false, error: error.message };
    }

    setAuthUserId(data.session?.user?.id ?? null);
    setAuthEmail(data.session?.user?.email ?? null);

    return { ok: true };
  }

  async function signOutAuth() {
    await signOutUser();
    setAuthUserId(null);
    setAuthEmail(null);
  }

  useEffect(() => {
    return () => {
      if (activityTimeoutRef.current) {
        clearTimeout(activityTimeoutRef.current);
      }
    };
  }, []);

  async function leaveHousehold(): Promise<void> {
    setHouseholdId(null);
    setHouseholdInviteCode(null);
  }

  function addCategory(name: string) {
    const trimmed = normalizeCategory(name);
    if (!trimmed) return false;

    const exists = categories.some(
      (category) => category.toLowerCase() === trimmed.toLowerCase(),
    );
    if (exists) return false;

    setCategories((prev) => [trimmed, ...prev]);
    return true;
  }

  function removeCategory(name: string) {
    setCategories((prev) => prev.filter((category) => category !== name));
  }

  function resetCategories() {
    setCategories(DEFAULT_CATEGORIES);
  }

  function setMySharedPercent(value: number) {
    setMySharedPercentState(clampPercent(value));
  }

  function renamePeriod(periodId: string, nextLabel: string) {
    const trimmed = nextLabel.trim();

    setPeriods((prev) =>
      prev.map((period) => {
        if (period.id !== periodId) return period;

        return {
          ...period,
          label: trimmed || formatPeriodLabel(period.startDate, period.endDate),
        };
      }),
    );
  }

  function archivePeriod(periodId: string) {
    const activePeriods = periods.filter((period) => !period.archived);

    if (activePeriods.length <= 1) {
      Alert.alert('Kan inte arkivera', 'Minst en aktiv period måste finnas kvar.');
      return false;
    }

    const nextActivePeriods = periods
      .map((period) =>
        period.id === periodId ? { ...period, archived: true } : period
      )
      .filter((period) => !period.archived)
      .sort((a, b) => a.sortKey.localeCompare(b.sortKey));

    const nextSelectedId =
      selectedPeriodId === periodId
        ? nextActivePeriods[nextActivePeriods.length - 1]?.id ?? selectedPeriodId
        : selectedPeriodId;

    setPeriods((prev) =>
      prev.map((period) =>
        period.id === periodId ? { ...period, archived: true } : period
      )
    );

    if (nextSelectedId !== selectedPeriodId) {
      setSelectedPeriodId(nextSelectedId);
    }

    return true;
  }

  function restorePeriod(periodId: string) {
    setPeriods((prev) =>
      prev.map((period) =>
        period.id === periodId ? { ...period, archived: false } : period
      )
    );
  }

  function deletePeriod(periodId: string) {
    const activePeriods = periods.filter((period) => !period.archived);

    if (activePeriods.length <= 1 && activePeriods.some((period) => period.id === periodId)) {
      Alert.alert('Kan inte ta bort', 'Minst en aktiv period måste finnas kvar.');
      return false;
    }

    const remainingActive = periods
      .filter((period) => period.id !== periodId && !period.archived)
      .sort((a, b) => a.sortKey.localeCompare(b.sortKey));

    const nextSelectedId =
      selectedPeriodId === periodId
        ? remainingActive[remainingActive.length - 1]?.id ?? selectedPeriodId
        : selectedPeriodId;

    setPeriods((prev) => prev.filter((period) => period.id !== periodId));

    if (nextSelectedId !== selectedPeriodId && remainingActive.length > 0) {
      setSelectedPeriodId(nextSelectedId);
    }

    return true;
  }

  function upsertRecurringBill(bill: Bill, shouldBeRecurring: boolean) {
    setPeriods((prev) =>
      prev.map((period) => {
        if (period.id !== selectedPeriodId) return period;

        return {
          ...period,
          bills: period.bills.map((existing) =>
            existing.id === bill.id
              ? { ...existing, recurring: shouldBeRecurring }
              : existing,
          ),
        };
      }),
    );
  }

  function createNextPeriod() {
    setPeriods((prev) => {
      const latest = [...prev].sort((a, b) => a.sortKey.localeCompare(b.sortKey))[prev.length - 1];
      if (!latest) return prev;

      const latestEnd = new Date(latest.endDate);
      const nextStart = addDaysUTC(latestEnd, 1);
      const nextEnd = addDaysUTC(addMonthsUTC(nextStart, 1), -1);

      const nextStartIso = nextStart.toISOString();
      const nextEndIso = nextEnd.toISOString();
      const nextId = createPeriodId(nextStartIso);

      if (prev.some((period) => period.id === nextId)) return prev;

      const nextBills = latest.bills
        .filter((bill) => bill.recurring)
        .map((bill) => ({
          ...bill,
          id: createId('bill'),
          paid: false,
        }));

      const newPeriod: PeriodData = {
        id: nextId,
        label: formatPeriodLabel(nextStartIso, nextEndIso),
        sortKey: createSortKey(nextStartIso),
        startDate: nextStartIso,
        endDate: nextEndIso,
        bills: nextBills,
        budgetEntries: [],
        incomeEntries: [],
      };

      return [...prev, newPeriod].sort((a, b) => a.sortKey.localeCompare(b.sortKey));
    });
  }

  function goToLatestPeriod() {
    const sorted = [...periods].sort((a, b) => a.sortKey.localeCompare(b.sortKey));
    const latest = sorted[sorted.length - 1];
    if (latest) setSelectedPeriodId(latest.id);
  }

  const partnerSharedPercent = 100 - mySharedPercent;

  const value = useMemo<AppContextType>(
    () => ({
      isHydrated,
      meName,
      partnerName,
      setMeName,
      setPartnerName,
      categories,
      addCategory,
      removeCategory,
      resetCategories,
      periods,
      selectedPeriodId,
      setSelectedPeriodId,
      selectedPeriod,
      mySharedPercent,
      partnerSharedPercent,
      setMySharedPercent,
      calculationMode,
      setCalculationMode,
      updateSelectedPeriod,
      createNextPeriod,
      goToLatestPeriod,
      renamePeriod,
      archivePeriod,
      restorePeriod,
      deletePeriod,
      upsertRecurringBill,
      householdId,
      householdInviteCode,
      setHouseholdId,
      createHousehold,
      joinHousehold,
      leaveHousehold,
      forceSyncHousehold,
      authUserId,
      authEmail,
      sendOtpLogin,
      verifyOtpLogin,
      signOutAuth,
      presenceText,
      activityNotice,
      notifyBillPaid,
    }),
    [
      isHydrated,
      meName,
      partnerName,
      categories,
      periods,
      selectedPeriodId,
      selectedPeriod,
      mySharedPercent,
      partnerSharedPercent,
      calculationMode,
      householdId,
      householdInviteCode,
      authUserId,
      authEmail,
      presenceText,
      activityNotice,
      forceSyncHousehold,
      notifyBillPaid,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppContext() {
  const context = useContext(AppContext);

  if (!context) {
    throw new Error('useAppContext must be used inside AppProvider');
  }

  return context;
}