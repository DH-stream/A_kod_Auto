import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Easing,
  Keyboard,
  LayoutChangeEvent,
  Modal,
  PanResponder,
  Platform,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  FlatList,
  StatusBar,
  Switch,
  Text,
  TextInput,
  View,
  useColorScheme,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  useAppContext,
  Bill,
  BudgetEntry,
  IncomeEntry,
  Owner,
  Payer,
} from '../../context/AppContext';
import { calculateTransferSummary, formatCurrency } from '../../utils/transfer';
import { createId } from '../../utils/ids';
import ConfettiCannon from 'react-native-confetti-cannon';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import TabFadeWrapper from "@/components/TabFadeWrapper";

type BillFilter = 'all' | 'me' | 'partner';
type EntryType = 'budget' | 'income';

function cardShadow() {
  return {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.22,
    shadowRadius: 24,
    elevation: 10,
  };
}

function pillShadow(active: boolean) {
  return {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: active ? 6 : 3 },
    shadowOpacity: active ? 0.24 : 0.12,
    shadowRadius: active ? 12 : 6,
    elevation: active ? 6 : 3,
  };
}

function Chevron({ open, color }: { open: boolean; color: string }) {
  const rotateAnim = useRef(new Animated.Value(open ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(rotateAnim, {
      toValue: open ? 1 : 0,
      duration: 220,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start();
  }, [open, rotateAnim]);
  const rotate = rotateAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '90deg'] });
  return <Animated.Text style={{ fontSize: 18, color, transform: [{ rotate }] }}>›</Animated.Text>;
}

function CollapsibleSection({ open, children }: { open: boolean; children: React.ReactNode }) {
  const [contentHeight, setContentHeight] = useState(0);
  const animatedHeight = useRef(new Animated.Value(open ? 0 : 0)).current;
  const animatedOpacity = useRef(new Animated.Value(open ? 1 : 0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(animatedHeight, {
        toValue: open ? contentHeight : 0,
        duration: 260,
        easing: Easing.out(Easing.ease),
        useNativeDriver: false,
      }),
      Animated.timing(animatedOpacity, {
        toValue: open ? 1 : 0,
        duration: 180,
        useNativeDriver: false,
      }),
    ]).start();
  }, [open, contentHeight, animatedHeight, animatedOpacity]);

  const handleLayout = (event: LayoutChangeEvent) => {
    const height = event.nativeEvent.layout.height + 20;
    if (height !== contentHeight) {
      setContentHeight(height);
      if (open) animatedHeight.setValue(height);
    }
  };

  return (
    <View>
      <View
        style={{ position: 'absolute', left: 0, right: 0, opacity: 0, zIndex: -1 }}
        pointerEvents="none"
        onLayout={handleLayout}
      >
        <View style={{ paddingTop: 8, paddingBottom: 8, paddingHorizontal: 4 }}>
          {children}
        </View>
      </View>

      <Animated.View
        style={{
          height: animatedHeight,
          opacity: animatedOpacity,
          overflow: 'hidden',
        }}
      >
        <View style={{ paddingTop: 8, paddingBottom: 8, paddingHorizontal: 4 }}>
          {children}
        </View>
      </Animated.View>
    </View>
  );
}

function OwnerChip({
  label,
  active,
  onPress,
  colors,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  colors: any;
}) {
  return (
    <View
      style={{
        marginRight: 8,
        marginBottom: 8,
        borderRadius: 999,
        backgroundColor: active ? colors.chipActiveBg : colors.chipBg,
        borderWidth: 1,
        borderColor: active
          ? 'rgba(255,255,255,0.18)'
          : 'rgba(255,255,255,0.10)',
        shadowColor: active ? '#ffffff' : '#000',
        shadowOffset: { width: 0, height: active ? 4 : 2 },
        shadowOpacity: active ? 0.12 : 0.08,
        shadowRadius: active ? 10 : 5,
      }}
    >
      <Pressable
        onPress={onPress}
        style={{
          paddingHorizontal: 12,
          paddingVertical: 10,
          borderRadius: 999,
        }}
      >
        <Text
          style={{
            fontSize: 13,
            fontWeight: '600',
            color: active ? colors.chipActiveText : colors.chipText,
          }}
        >
          {label}
        </Text>
      </Pressable>
    </View>
  );
}

function FilterChip({
  label,
  active,
  onPress,
  colors,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  colors: any;
}) {
  return (
    <View
      style={{
        marginRight: 8,
        borderRadius: 999,
        backgroundColor: active ? colors.chipActiveBg : colors.chipBg,
        borderWidth: 1,
        borderColor: active
          ? 'rgba(255,255,255,0.18)'
          : 'rgba(255,255,255,0.10)',
        shadowColor: active ? '#ffffff' : '#000',
        shadowOffset: { width: 0, height: active ? 4 : 2 },
        shadowOpacity: active ? 0.12 : 0.08,
        shadowRadius: active ? 10 : 5,
      }}
    >
      <Pressable
        onPress={onPress}
        style={{
          paddingHorizontal: 12,
          paddingVertical: 8,
          borderRadius: 999,
        }}
      >
        <Text
          style={{
            fontSize: 13,
            fontWeight: '600',
            color: active ? colors.chipActiveText : colors.chipText,
          }}
        >
          {label}
        </Text>
      </Pressable>
    </View>
  );
}

function CategoryChip({
  label,
  active,
  onPress,
  colors,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  colors: any;
}) {
  return (
    <View
      style={{
        marginRight: 8,
        marginBottom: 8,
        borderRadius: 999,
        backgroundColor: active ? colors.chipActiveBg : colors.chipBg,
        borderWidth: 1,
        borderColor: active
          ? 'rgba(255,255,255,0.18)'
          : 'rgba(255,255,255,0.10)',
        shadowColor: active ? '#ffffff' : '#000',
        shadowOffset: { width: 0, height: active ? 4 : 2 },
        shadowOpacity: active ? 0.12 : 0.08,
        shadowRadius: active ? 10 : 5,
      }}
    >
      <Pressable
        onPress={onPress}
        style={{
          paddingHorizontal: 12,
          paddingVertical: 10,
          borderRadius: 999,
        }}
      >
        <Text
          style={{
            fontSize: 13,
            fontWeight: '600',
            color: active ? colors.chipActiveText : colors.chipText,
          }}
        >
          {label}
        </Text>
      </Pressable>
    </View>
  );
}

function SectionHeader({
  title,
  open,
  onPress,
  totalText,
  rightAction,
  colors,
}: {
  title: string;
  open: boolean;
  onPress: () => void;
  totalText?: string;
  rightAction?: React.ReactNode;
  colors: any;
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 12,
      }}
    >
      <Pressable
        onPress={onPress}
        style={{ flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 10 }}
      >
        <Text style={{ fontSize: 20, fontWeight: '700', color: colors.text, marginRight: 10 }}>
          {title}
        </Text>
        <Chevron open={open} color={colors.muted} />
      </Pressable>
      {open && totalText ? (
        <Text style={{ fontSize: 13, fontWeight: '600', color: colors.muted, marginRight: 10 }}>
          Totalt: {totalText}
        </Text>
      ) : null}
      {rightAction}
    </View>
  );
}

function SoftEntryRow({
  entry,
  onLongPress,
  colors,
  showOwner = true,
}: {
  entry: BudgetEntry | IncomeEntry;
  onLongPress: (entry: BudgetEntry | IncomeEntry) => void;
  colors: any;
  showOwner?: boolean;
}) {
  const category = 'category' in entry ? entry.category : undefined;

  return (
    <Pressable
      onLongPress={() => onLongPress(entry)}
      delayLongPress={320}
      onPress={() => { }}
      style={{ marginBottom: 10 }}
    >
      <View
        style={{
          backgroundColor: colors.softRowBg,
          borderRadius: 16,
          padding: 14,
          borderWidth: 1,
          borderColor: colors.softRowBorder,
        }}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View style={{ flex: 1, marginRight: 10 }}>
            <Text style={{ fontSize: 16, color: colors.text }}>{entry.name}</Text>
            {category ? (
              <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>{category}</Text>
            ) : null}
          </View>
          <Text style={{ fontSize: 16, color: colors.text, fontWeight: '600' }}>
            {formatCurrency(entry.amount)}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

const BillRow = React.memo(function BillRow({
  bill,
  onToggleDone,
  onLongPress,
  meName,
  partnerName,
  colors,
}: {
  bill: Bill;
  onToggleDone: (id: Bill['id']) => void;
  onLongPress: (bill: Bill) => void;
  meName: string;
  partnerName: string;
  colors: any;
}) {
  const paidOverlayOpacity = useRef(new Animated.Value(bill.paid ? 1 : 0)).current;
  const checkScaleAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.timing(paidOverlayOpacity, {
      toValue: bill.paid ? 1 : 0,
      duration: bill.paid ? 140 : 110,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start();
  }, [bill.paid, paidOverlayOpacity]);

  useEffect(() => {
    if (!bill.paid) {
      checkScaleAnim.setValue(1);
      return;
    }

    checkScaleAnim.setValue(0.9);
    Animated.spring(checkScaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      speed: 20,
      bounciness: 7,
    }).start();
  }, [bill.paid, checkScaleAnim]);

  const handlePress = useCallback(() => {

    if (bill.paid) {
      Haptics.selectionAsync();
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    onToggleDone(bill.id);

  }, [bill.id, bill.paid, onToggleDone]);

  const handleLongPress = useCallback(() => {
    Haptics.selectionAsync();
    onLongPress(bill);
  }, [bill, onLongPress]);

  const ownerLabel = bill.owner === 'me' ? meName : bill.owner === 'partner' ? partnerName : 'Gemensam';
  const paidByLabel = bill.paidBy === 'me' ? meName : partnerName;

  return (
    <Pressable
      onPress={handlePress}
      onLongPress={handleLongPress}
      delayLongPress={320}
      style={{ marginBottom: 10 }}
    >
      <View
        style={{
          overflow: 'hidden',
          borderRadius: 12,
          backgroundColor: colors.card,
          ...cardShadow(),
        }}
      >
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 0,
            bottom: 0,
            backgroundColor: '#c9f2d5',
            opacity: paidOverlayOpacity,
          }}
        />
        <View
          style={{
            padding: 14,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 12 }}>
            <Animated.View
              style={{
                transform: [{ scale: checkScaleAnim }],
                width: 24,
                height: 24,
                borderRadius: 12,
                borderWidth: 1.5,
                borderColor: bill.paid ? '#2e8b57' : colors.checkboxBorder,
                backgroundColor: bill.paid ? '#2e8b57' : colors.checkboxBg,
                justifyContent: 'center',
                alignItems: 'center',
                marginRight: 12,
              }}
            >
              {bill.paid && (
                <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700', lineHeight: 14 }}>
                  ✓
                </Text>
              )}
            </Animated.View>

            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontSize: 16,
                  color: bill.paid ? colors.muted : colors.text,
                  textDecorationLine: bill.paid ? 'line-through' : 'none',
                  marginBottom: 2,
                }}
              >
                {bill.name}
              </Text>
              <Text style={{ fontSize: 12, color: colors.muted }}>
                {ownerLabel}
                {bill.owner === 'shared' ? ` • Betald av ${paidByLabel}` : ''}
                {bill.recurring ? ' • Återkommande' : ''}
                {' • '}
                {bill.category}
              </Text>
            </View>
          </View>

          <Text style={{ fontSize: 16, color: bill.paid ? colors.muted : colors.text }}>
            {formatCurrency(bill.amount)}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}, (prev, next) => {
  return (
    prev.bill === next.bill &&
    prev.meName === next.meName &&
    prev.partnerName === next.partnerName &&
    prev.colors === next.colors &&
    prev.onToggleDone === next.onToggleDone &&
    prev.onLongPress === next.onLongPress
  );
});


function BottomSheet({
  visible,
  onClose,
  children,
  colors,
  minHeight = 220,
}: {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  colors: any;
  minHeight?: number;
}) {
  const insets = useSafeAreaInsets();
  const dragY = useRef(new Animated.Value(0)).current;
  const isClosingRef = useRef(false);

  function closeSheet() {
    if (isClosingRef.current) return;
    isClosingRef.current = true;

    Keyboard.dismiss();

    Animated.timing(dragY, {
      toValue: 900,
      duration: 160,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start(() => {
      onClose();
    });
  }


  useEffect(() => {
    if (!visible) {
      const timeout = setTimeout(() => {
        dragY.setValue(0);
        isClosingRef.current = false;
      }, 220);

      return () => clearTimeout(timeout);
    }

    dragY.setValue(0);
    isClosingRef.current = false;
  }, [visible]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gesture) =>
        gesture.dy > 5 && Math.abs(gesture.dy) > Math.abs(gesture.dx),

      onPanResponderMove: (_, gesture) => {
        if (isClosingRef.current) return;

        if (gesture.dy > 0) {
          dragY.setValue(gesture.dy);
        }
      },

      onPanResponderRelease: (_, gesture) => {
        if (isClosingRef.current) return;

        if (gesture.dy > 120 || gesture.vy > 1.2) {
          closeSheet();
          return;
        }

        Animated.spring(dragY, {
          toValue: 0,
          useNativeDriver: true,
          tension: 90,
          friction: 11,
        }).start();
      },

      onPanResponderTerminate: () => {
        if (isClosingRef.current) return;

        Animated.spring(dragY, {
          toValue: 0,
          useNativeDriver: true,
          tension: 90,
          friction: 11,
        }).start();
      },
    })
  ).current;

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      presentationStyle="overFullScreen"
      statusBarTranslucent
      onRequestClose={closeSheet}
    >
      <View style={{ flex: 1 }}>
        <Pressable
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
            backgroundColor: 'rgba(0,0,0,0.34)',
          }}
          onPress={closeSheet}
        />

        <KeyboardAvoidingView
          style={{ flex: 1, justifyContent: 'flex-end' }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={0}
        >
          <Animated.View
            style={{
              transform: [{ translateY: dragY }],
              maxHeight: '78%',
              minHeight,
              backgroundColor: colors.modalBg,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              overflow: 'hidden',
              paddingBottom: Math.max(insets.bottom, 10),
            }}
          >
            <View
              {...panResponder.panHandlers}
              style={{
                paddingTop: 12,
                paddingBottom: 16,
                alignItems: 'center',
              }}
            >
              <View
                style={{
                  width: 42,
                  height: 5,
                  borderRadius: 999,
                  backgroundColor: colors.muted,
                  opacity: 0.55,
                }}
              />
            </View>

            <ScrollView
              bounces={true}
              alwaysBounceVertical={false}
              overScrollMode='never'
              automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="interactive"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{
                padding: 20,
                paddingTop: 10,
                paddingBottom: Math.max(insets.bottom, 12),
                minHeight: Math.max(minHeight - 28, 0),
                flexGrow: 1,
              }}
            >
              {children}
            </ScrollView>
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

export default function MonthScreen() {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';

  const {
    meName,
    partnerName,
    periods,
    selectedPeriod,
    selectedPeriodId,
    setSelectedPeriodId,
    updateSelectedPeriod,
    createNextPeriod,
    categories,
    calculationMode,
    mySharedPercent,
    renamePeriod,
    archivePeriod,
    deletePeriod,
    householdId,
    presenceText,
    activityNotice,
    notifyBillPaid,
  } = useAppContext();

  const showPartnerSection = !!householdId;
  const showTransferSection =
    !!householdId && calculationMode === 'equal_leftover';

  const isSingleMode = !householdId;

  const colors = useMemo(
    () => ({
      background: isDark ? '#0f1115' : '#f6f7f9',
      card: isDark ? '#1a1d24' : '#ffffff',
      border: isDark ? '#2f3642' : '#e5e8ec',
      text: isDark ? '#f4f5f7' : '#111111',
      muted: isDark ? '#9aa3af' : '#666666',
      placeholder: isDark ? '#7b8591' : '#999999',
      inputBg: isDark ? '#12151b' : '#f6f7f9',
      modalBg: isDark ? '#1a1d24' : '#ffffff',
      softRowBg: isDark ? '#232832' : '#eef1f5',
      softRowBorder: isDark ? '#2f3642' : '#e5e8ec',
      chipBg: isDark ? '#2B313B' : '#f1f3f5',
      chipText: isDark ? '#E4E8EE' : '#444444',
      chipActiveBg: isDark ? '#F8FAFC' : '#111111',
      chipActiveText: isDark ? '#111111' : '#ffffff',
      buttonPrimaryBg: isDark ? '#f4f5f7' : '#111111',
      buttonPrimaryText: isDark ? '#111111' : '#ffffff',
      buttonSecondaryBg: isDark ? '#252a33' : '#f1f3f5',
      buttonSecondaryText: isDark ? '#f4f5f7' : '#333333',
      checkboxBorder: isDark ? '#4b5563' : '#c7c7c7',
      checkboxBg: isDark ? '#12151b' : '#ffffff',
      transferBg: isDark ? '#1b3150' : '#eaf2ff',
      transferLabel: isDark ? '#99b6e8' : '#4d648d',
      transferText: isDark ? '#d9e7ff' : '#163b77',
      successBg: isDark ? '#173122' : '#eefaf1',
      successText: isDark ? '#a7e0ba' : '#1f7a3d',
      greenClosedBg: isDark ? '#16251a' : '#f6fbf7',
      greenClosedTop: isDark ? '#5ea978' : '#8dd3a2',
    }),
    [isDark],
  );

  const sortedPeriods = useMemo(
    () =>
      [...periods]
        .filter((period) => !period.archived)
        .sort((a, b) => a.sortKey.localeCompare(b.sortKey)),
    [periods],
  );

  const periodIndex = sortedPeriods.findIndex((period) => period.id === selectedPeriodId);
  const periodArrowButtonStyle = {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.card,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: isDark ? 0.35 : 0.12,
    shadowRadius: 12,
    elevation: 6,
  };

  const bills = selectedPeriod.bills;
  const budgetEntries = selectedPeriod.budgetEntries;
  const incomeEntries = selectedPeriod.incomeEntries;

  const [showBills, setShowBills] = useState(true);
  const [showBudget, setShowBudget] = useState(false);
  const [showIncome, setShowIncome] = useState(false);
  const [billFilter, setBillFilter] = useState<BillFilter>('all');

  const [showAddBillModal, setShowAddBillModal] = useState(false);
  const [showAddBudgetModal, setShowAddBudgetModal] = useState(false);
  const [showAddIncomeModal, setShowAddIncomeModal] = useState(false);
  const [showEditBillModal, setShowEditBillModal] = useState(false);
  const [showEditEntryModal, setShowEditEntryModal] = useState(false);
  const [showBillActionsModal, setShowBillActionsModal] = useState(false);
  const [showEntryActionsModal, setShowEntryActionsModal] = useState(false);
  const [showPeriodPickerModal, setShowPeriodPickerModal] = useState(false);

  const [showRenamePeriodModal, setShowRenamePeriodModal] = useState(false);
  const [periodNameInput, setPeriodNameInput] = useState('');

  const [newBillName, setNewBillName] = useState('');
  const [newBillAmount, setNewBillAmount] = useState('');
  const [newBillCategory, setNewBillCategory] = useState('');
  const [newBillOwner, setNewBillOwner] = useState<Owner>('me');
  const [newBillPaidBy, setNewBillPaidBy] = useState<Payer>('me');
  const [newBillRecurring, setNewBillRecurring] = useState(false);

  const [newBudgetName, setNewBudgetName] = useState('');
  const [newBudgetAmount, setNewBudgetAmount] = useState('');
  const [newBudgetCategory, setNewBudgetCategory] = useState('');

  const [newIncomeName, setNewIncomeName] = useState('');
  const [newIncomeAmount, setNewIncomeAmount] = useState('');
  const [newIncomeOwner, setNewIncomeOwner] = useState<Payer>('me');

  const [selectedBill, setSelectedBill] = useState<Bill | null>(null);
  const [editBillName, setEditBillName] = useState('');
  const [editBillAmount, setEditBillAmount] = useState('');
  const [editBillCategory, setEditBillCategory] = useState('');
  const [editBillOwner, setEditBillOwner] = useState<Owner>('me');
  const [editBillPaidBy, setEditBillPaidBy] = useState<Payer>('me');
  const [editBillRecurring, setEditBillRecurring] = useState(false);
  const appGradient: readonly [string, string, string, string] = isDark
    ? ['#071821', '#093641', '#093031', '#0c2420']
    : ['#F7FBFA', '#EEF7F5', '#E5F3EF', '#D9EEE8'];

  const [selectedEntry, setSelectedEntry] = useState<BudgetEntry | IncomeEntry | null>(null);
  const [selectedEntryType, setSelectedEntryType] = useState<EntryType>('budget');
  const [editEntryName, setEditEntryName] = useState('');
  const [editEntryAmount, setEditEntryAmount] = useState('');
  const [editEntryCategory, setEditEntryCategory] = useState('');
  const [editIncomeOwner, setEditIncomeOwner] = useState<Payer>('me');
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [displayPresenceText, setDisplayPresenceText] = useState('');
  const [displayActivityText, setDisplayActivityText] = useState('');

  const [showConfetti, setShowConfetti] = useState(false);
  const celebratedPeriodsRef = useRef<Set<string>>(new Set());
  const [showIntroSplash, setShowIntroSplash] = useState(true);
  const hasUserInteractedRef = useRef(false);

  const introOverlayOpacity = useRef(new Animated.Value(1)).current;
  const bagScale = useRef(new Animated.Value(0.72)).current;
  const bagOpacity = useRef(new Animated.Value(0)).current;

  const money1Y = useRef(new Animated.Value(0)).current;
  const money1X = useRef(new Animated.Value(0)).current;
  const money1Rotate = useRef(new Animated.Value(0)).current;
  const money1Opacity = useRef(new Animated.Value(0)).current;

  const money2Y = useRef(new Animated.Value(0)).current;
  const money2X = useRef(new Animated.Value(0)).current;
  const money2Rotate = useRef(new Animated.Value(0)).current;
  const money2Opacity = useRef(new Animated.Value(0)).current;

  const money3Y = useRef(new Animated.Value(0)).current;
  const money3X = useRef(new Animated.Value(0)).current;
  const money3Rotate = useRef(new Animated.Value(0)).current;
  const money3Opacity = useRef(new Animated.Value(0)).current;

  const money4Y = useRef(new Animated.Value(0)).current;
  const money4X = useRef(new Animated.Value(0)).current;
  const money4Rotate = useRef(new Animated.Value(0)).current;
  const money4Opacity = useRef(new Animated.Value(0)).current;

  const money5Y = useRef(new Animated.Value(0)).current;
  const money5X = useRef(new Animated.Value(0)).current;
  const money5Rotate = useRef(new Animated.Value(0)).current;
  const money5Opacity = useRef(new Animated.Value(0)).current;

  const money6Y = useRef(new Animated.Value(0)).current;
  const money6X = useRef(new Animated.Value(0)).current;
  const money6Rotate = useRef(new Animated.Value(0)).current;
  const money6Opacity = useRef(new Animated.Value(0)).current;


  const totalBills = bills.length;
  const paidBills = bills.filter((b) => b.paid).length;
  const totalBillsAmount = bills.reduce((sum, b) => sum + b.amount, 0);
  const unpaidAmount = bills.filter((b) => !b.paid).reduce((sum, b) => sum + b.amount, 0);
  const totalBudget = budgetEntries.reduce((sum, entry) => sum + entry.amount, 0);
  const totalIncome = incomeEntries.reduce((sum, entry) => sum + entry.amount, 0);
  const afterBills = totalIncome - totalBillsAmount;
  const afterBudget = totalIncome - totalBillsAmount - totalBudget;

  const visibleBills = bills.filter((bill) => {
    if (billFilter === 'all') return true;
    if (billFilter === 'me') return bill.owner === 'me';
    if (billFilter === 'partner') return bill.owner === 'partner';
    return true;
  });

  useEffect(() => {
    if (!householdId && billFilter === 'partner') {
      setBillFilter('me');
    }
  }, [householdId, billFilter]);

  useEffect(() => {
    if (!householdId && newBillOwner !== 'me') {
      setNewBillOwner('me');
    }
    if (!householdId && newBillPaidBy !== 'me') {
      setNewBillPaidBy('me');
    }
    if (!householdId && editBillOwner !== 'me') {
      setEditBillOwner('me');
    }
    if (!householdId && editBillPaidBy !== 'me') {
      setEditBillPaidBy('me');
    }
    if (!householdId && newIncomeOwner !== 'me') {
      setNewIncomeOwner('me');
    }
    if (!householdId && editIncomeOwner !== 'me') {
      setEditIncomeOwner('me');
    }
  }, [
    householdId,
    newBillOwner,
    newBillPaidBy,
    editBillOwner,
    editBillPaidBy,
    newIncomeOwner,
    editIncomeOwner,
  ]);
  const progress = totalBills > 0 ? (paidBills / totalBills) * 100 : 0;
  const progressAnim = useRef(new Animated.Value(progress)).current;
  const skipNextPeriodPressRef = useRef(false);

  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: progress,
      duration: 350,
      useNativeDriver: false,
    }).start();
  }, [progress, progressAnim]);

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%'],
  });

  const presenceOpacity = useRef(new Animated.Value(0)).current;
  const presencePulse = useRef(new Animated.Value(1)).current;
  const activityOpacity = useRef(new Animated.Value(0)).current;
  const activityTranslateY = useRef(new Animated.Value(-4)).current;

  useEffect(() => {
    if (presenceText) {
      setDisplayPresenceText(presenceText);
      Animated.timing(presenceOpacity, {
        toValue: 1,
        duration: 700,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(presenceOpacity, {
        toValue: 0,
        duration: 700,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setDisplayPresenceText('');
      });
    }
  }, [presenceOpacity, presenceText]);

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | null = null;

    return () => {
      if (timeout) clearTimeout(timeout);
    };
  }, [activityNotice]);

  useEffect(() => {
    if (!presenceText) {
      presencePulse.stopAnimation();
      presencePulse.setValue(1);
      return;
    }

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(presencePulse, {
          toValue: 1.03,
          duration: 1200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(presencePulse, {
          toValue: 1,
          duration: 1200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );

    loop.start();

    return () => {
      loop.stop();
      presencePulse.setValue(1);
    };
  }, [presencePulse, presenceText]);

  useEffect(() => {
    if (activityNotice?.text) {
      setDisplayActivityText(activityNotice.text);

      activityOpacity.setValue(0);
      activityTranslateY.setValue(-4);

      Animated.parallel([
        Animated.timing(activityOpacity, {
          toValue: 1,
          duration: 700,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(activityTranslateY, {
          toValue: 0,
          duration: 700,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.sequence([
        Animated.delay(180),
        Animated.parallel([
          Animated.timing(activityOpacity, {
            toValue: 0,
            duration: 700,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(activityTranslateY, {
            toValue: -4,
            duration: 700,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      ]).start(({ finished }) => {
        if (finished) setDisplayActivityText('');
      });
    }
  }, [activityNotice, activityOpacity, activityTranslateY]);

  const categoryOptions = useMemo(() => {
    const set = new Set<string>(categories);
    bills.forEach((bill) => bill.category?.trim() && set.add(bill.category.trim()));
    budgetEntries.forEach((entry) => entry.category?.trim() && set.add(entry.category.trim()));
    return Array.from(set);
  }, [categories, bills, budgetEntries]);

  const transferSummary = useMemo(
    () =>
      calculateTransferSummary({
        bills,
        budgetEntries,
        incomes: incomeEntries,
        meName,
        partnerName,
        calculationMode,
        mySharedPercent,
        includeBudget: true,
      }),
    [
      bills,
      budgetEntries,
      incomeEntries,
      meName,
      partnerName,
      mySharedPercent,
      calculationMode,
    ],
  );

  const transferExplanation =
    calculationMode === 'equal_leftover'
      ? 'Appen räknar ut hur ni får lika mycket kvar efter räkningar och budget.'
      : 'Överföring visas bara i modellen Lika kvar.';

  function parseAmount(value: string) {
    return Number(value.replace(',', '.'));
  }

  function normalizeCategory(value: string) {
    return value.trim() || 'Övrigt';
  }

  function nextBillId() {
    return createId('bill');
  }

  function nextBudgetId() {
    return createId('budget');
  }

  function nextIncomeId() {
    return createId('income');
  }

  function resolvePaidBy(owner: Owner, paidBy: Payer) {
    return owner === 'me' ? 'me' : owner === 'partner' ? 'partner' : paidBy;
  }

  const toggleBill = useCallback((id: Bill['id']) => {
    hasUserInteractedRef.current = true;
    const updatedAt = new Date().toISOString();

    const targetBill = bills.find((b) => b.id === id);
    if (!targetBill) return;

    const nextPaid = !targetBill.paid;

    updateSelectedPeriod((period) => ({
      ...period,
      updatedAt,
      bills: period.bills.map((bill) =>
        bill.id === id ? { ...bill, paid: nextPaid, updatedAt } : bill,
      ),
    }));

    if (nextPaid) {
      notifyBillPaid(targetBill.name);
    }
  }, [bills, notifyBillPaid, updateSelectedPeriod]);

  function addBill() {
    const trimmedName = newBillName.trim();
    const parsedAmount = parseAmount(newBillAmount);

    if (!trimmedName) return Alert.alert('Saknar namn', 'Fyll i ett namn på räkningen.');
    if (!newBillAmount || Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      return Alert.alert('Ogiltig summa', 'Fyll i en giltig summa.');
    }

    const updatedAt = new Date().toISOString();

    updateSelectedPeriod((period) => ({
      ...period,
      updatedAt,
      bills: [
        ...period.bills,
        {
          id: nextBillId(),
          name: trimmedName,
          amount: parsedAmount,
          paid: false,
          owner: newBillOwner,
          paidBy: resolvePaidBy(newBillOwner, newBillPaidBy),
          category: normalizeCategory(newBillCategory),
          recurring: newBillRecurring,
          updatedAt,
        },
      ],
    }));

    setNewBillName('');
    setNewBillAmount('');
    setNewBillCategory('');
    setNewBillOwner('me');
    setNewBillPaidBy('me');
    setNewBillRecurring(false);
    setShowBills(true);
    setShowAddBillModal(false);
  }

  function addBudgetEntry() {
    const trimmedName = newBudgetName.trim();
    const parsedAmount = parseAmount(newBudgetAmount);

    if (!trimmedName) return Alert.alert('Saknar namn', 'Fyll i ett namn på budgetposten.');
    if (!newBudgetAmount || Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      return Alert.alert('Ogiltig summa', 'Fyll i en giltig summa.');
    }

    const updatedAt = new Date().toISOString();

    updateSelectedPeriod((period) => ({
      ...period,
      updatedAt,
      budgetEntries: [
        ...period.budgetEntries,
        {
          id: nextBudgetId(),
          name: trimmedName,
          amount: parsedAmount,
          category: normalizeCategory(newBudgetCategory),
          updatedAt,
        },
      ],
    }));

    setNewBudgetName('');
    setNewBudgetAmount('');
    setNewBudgetCategory('');
    setShowBudget(true);
    setShowAddBudgetModal(false);
  }

  function addIncomeEntry() {
    const trimmedName = newIncomeName.trim();
    const parsedAmount = parseAmount(newIncomeAmount);

    if (!trimmedName) return Alert.alert('Saknar namn', 'Fyll i ett namn på inkomsten.');
    if (!newIncomeAmount || Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      return Alert.alert('Ogiltig summa', 'Fyll i en giltig summa.');
    }

    const updatedAt = new Date().toISOString();

    updateSelectedPeriod((period) => ({
      ...period,
      updatedAt,
      incomeEntries: [
        ...period.incomeEntries,
        {
          id: nextIncomeId(),
          name: trimmedName,
          amount: parsedAmount,
          owner: newIncomeOwner,
          updatedAt,
        },
      ],
    }));

    setNewIncomeName('');
    setNewIncomeAmount('');
    setNewIncomeOwner('me');
    setShowIncome(true);
    setShowAddIncomeModal(false);
  }

  const openBillActions = useCallback((bill: Bill) => {
    setSelectedBill(bill);
    setShowBillActionsModal(true);
  }, []);

  function openEditBill() {
    if (!selectedBill) return;

    setEditBillName(selectedBill.name);
    setEditBillAmount(String(selectedBill.amount));
    setEditBillCategory(selectedBill.category);
    setEditBillOwner(selectedBill.owner);
    setEditBillPaidBy(selectedBill.paidBy);
    setEditBillRecurring(selectedBill.recurring);
    setShowBillActionsModal(false);
    setShowEditBillModal(true);
  }

  function saveEditedBill() {
    if (!selectedBill) return;

    const trimmedName = editBillName.trim();
    const parsedAmount = parseAmount(editBillAmount);

    if (!trimmedName) return Alert.alert('Saknar namn', 'Fyll i ett namn på räkningen.');
    if (!editBillAmount || Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      return Alert.alert('Ogiltig summa', 'Fyll i en giltig summa.');
    }

    const updatedAt = new Date().toISOString();

    updateSelectedPeriod((period) => ({
      ...period,
      updatedAt,
      bills: period.bills.map((bill) =>
        bill.id === selectedBill.id
          ? {
            ...bill,
            name: trimmedName,
            amount: parsedAmount,
            owner: editBillOwner,
            paidBy: resolvePaidBy(editBillOwner, editBillPaidBy),
            category: normalizeCategory(editBillCategory),
            recurring: editBillRecurring,
            updatedAt,
          }
          : bill,
      ),
    }));

    setShowEditBillModal(false);
    setSelectedBill(null);
  }

  function deleteSelectedBill() {
    if (!selectedBill) return;

    Alert.alert('Ta bort räkning', `Vill du ta bort "${selectedBill.name}"?`, [
      { text: 'Avbryt', style: 'cancel' },
      {
        text: 'Ta bort',
        style: 'destructive',
        onPress: () => {
          const updatedAt = new Date().toISOString();
          updateSelectedPeriod((period) => ({
            ...period,
            updatedAt,
            bills: period.bills.filter((bill) => bill.id !== selectedBill.id),
          }));
          setShowBillActionsModal(false);
          setSelectedBill(null);
        },
      },
    ]);
  }

  const openEntryActions = useCallback((entry: BudgetEntry | IncomeEntry, type: EntryType) => {
    setSelectedEntry(entry);
    setSelectedEntryType(type);
    setShowEntryActionsModal(true);
  }, []);

  function openEditEntry() {
    if (!selectedEntry) return;

    setEditEntryName(selectedEntry.name);
    setEditEntryAmount(String(selectedEntry.amount));
    setEditEntryCategory('category' in selectedEntry ? selectedEntry.category : '');
    setEditIncomeOwner('owner' in selectedEntry ? (selectedEntry as any).owner : 'me');
    setShowEntryActionsModal(false);
    setShowEditEntryModal(true);
  }

  function saveEditedEntry() {
    if (!selectedEntry) return;

    const trimmedName = editEntryName.trim();
    const parsedAmount = parseAmount(editEntryAmount);

    if (!trimmedName) return Alert.alert('Saknar namn', 'Fyll i ett namn.');
    if (!editEntryAmount || Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      return Alert.alert('Ogiltig summa', 'Fyll i en giltig summa.');
    }

    const updatedAt = new Date().toISOString();

    updateSelectedPeriod((period) => {
      if (selectedEntryType === 'budget') {
        return {
          ...period,
          updatedAt,
          budgetEntries: period.budgetEntries.map((entry) =>
            entry.id === selectedEntry.id
              ? {
                ...entry,
                name: trimmedName,
                amount: parsedAmount,
                category: normalizeCategory(editEntryCategory),
                updatedAt,
              }
              : entry,
          ),
        };
      }

      return {
        ...period,
        updatedAt,
        incomeEntries: period.incomeEntries.map((entry: any) =>
          entry.id === selectedEntry.id
            ? {
              ...entry,
              name: trimmedName,
              amount: parsedAmount,
              owner: editIncomeOwner,
              updatedAt,
            }
            : entry,
        ),
      };
    });

    setShowEditEntryModal(false);
    setSelectedEntry(null);
  }

  function deleteSelectedEntry() {
    if (!selectedEntry) return;

    const label = selectedEntryType === 'budget' ? 'budgetpost' : 'inkomst';

    Alert.alert(`Ta bort ${label}`, `Vill du ta bort "${selectedEntry.name}"?`, [
      { text: 'Avbryt', style: 'cancel' },
      {
        text: 'Ta bort',
        style: 'destructive',
        onPress: () => {
          const updatedAt = new Date().toISOString();
          updateSelectedPeriod((period) =>
            selectedEntryType === 'budget'
              ? {
                ...period,
                updatedAt,
                budgetEntries: period.budgetEntries.filter(
                  (entry) => entry.id !== selectedEntry.id,
                ),
              }
              : {
                ...period,
                updatedAt,
                incomeEntries: period.incomeEntries.filter(
                  (entry) => entry.id !== selectedEntry.id,
                ),
              },
          );
          setShowEntryActionsModal(false);
          setSelectedEntry(null);
        },
      },
    ]);
  }

  function openRenamePeriod() {
    setShowPeriodPickerModal(false);
    setPeriodNameInput(selectedPeriod.label);
    setShowRenamePeriodModal(true);
  }

  function savePeriodName() {
    renamePeriod(selectedPeriod.id, periodNameInput);
    setShowRenamePeriodModal(false);
  }

  const allBillsPaid = useMemo(
    () => unpaidAmount === 0 && bills.length > 0,
    [unpaidAmount, bills.length],
  );

  useEffect(() => {
    if (showIntroSplash) return;
    if (!hasUserInteractedRef.current) return;
    if (!allBillsPaid) return;
    if (celebratedPeriodsRef.current.has(selectedPeriodId)) return;

    celebratedPeriodsRef.current.add(selectedPeriodId);
    setShowConfetti(true);

    const timeout = setTimeout(() => setShowConfetti(false), 2600);
    return () => clearTimeout(timeout);
  }, [showIntroSplash, allBillsPaid, selectedPeriodId]);

  const money1RotateDeg = money1Rotate.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '-18deg'],
  });

  const money2RotateDeg = money2Rotate.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '10deg'],
  });

  const money3RotateDeg = money3Rotate.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '18deg'],
  });

  const money4RotateDeg = money4Rotate.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '-28deg'],
  });

  const money5RotateDeg = money5Rotate.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '22deg'],
  });

  const money6RotateDeg = money6Rotate.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '-12deg'],
  });

  useEffect(() => {
    if (!showIntroSplash) return;

    bagScale.setValue(0.72);
    bagOpacity.setValue(0);
    introOverlayOpacity.setValue(1);

    for (const v of [
      money1Y, money1X, money1Rotate, money1Opacity,
      money2Y, money2X, money2Rotate, money2Opacity,
      money3Y, money3X, money3Rotate, money3Opacity,
      money4Y, money4X, money4Rotate, money4Opacity,
      money5Y, money5X, money5Rotate, money5Opacity,
      money6Y, money6X, money6Rotate, money6Opacity,
    ]) {
      v.setValue(0);
    }

    Animated.sequence([
      Animated.sequence([
        Animated.parallel([
          Animated.timing(bagOpacity, {
            toValue: 1,
            duration: 70,
            useNativeDriver: true,
          }),
          Animated.timing(bagScale, {
            toValue: 1.12,
            duration: 140,
            easing: Easing.out(Easing.back(2.4)),
            useNativeDriver: true,
          }),
        ]),
        Animated.timing(bagScale, {
          toValue: 1,
          duration: 140,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
      ]),

      Animated.delay(70),

      Animated.parallel([
        Animated.sequence([
          Animated.timing(money1Opacity, {
            toValue: 1,
            duration: 60,
            useNativeDriver: true,
          }),
          Animated.delay(220),
          Animated.timing(money1Opacity, {
            toValue: 0,
            duration: 300,
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.delay(18),
          Animated.timing(money2Opacity, {
            toValue: 1,
            duration: 60,
            useNativeDriver: true,
          }),
          Animated.delay(220),
          Animated.timing(money2Opacity, {
            toValue: 0,
            duration: 300,
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.delay(35),
          Animated.timing(money3Opacity, {
            toValue: 1,
            duration: 60,
            useNativeDriver: true,
          }),
          Animated.delay(220),
          Animated.timing(money3Opacity, {
            toValue: 0,
            duration: 300,
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.delay(52),
          Animated.timing(money4Opacity, {
            toValue: 1,
            duration: 60,
            useNativeDriver: true,
          }),
          Animated.delay(220),
          Animated.timing(money4Opacity, {
            toValue: 0,
            duration: 300,
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.delay(70),
          Animated.timing(money5Opacity, {
            toValue: 1,
            duration: 60,
            useNativeDriver: true,
          }),
          Animated.delay(220),
          Animated.timing(money5Opacity, {
            toValue: 0,
            duration: 300,
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.delay(92),
          Animated.timing(money6Opacity, {
            toValue: 1,
            duration: 60,
            useNativeDriver: true,
          }),
          Animated.delay(220),
          Animated.timing(money6Opacity, {
            toValue: 0,
            duration: 300,
            useNativeDriver: true,
          }),
        ]),

        Animated.sequence([
          Animated.parallel([
            Animated.timing(money1Y, {
              toValue: -300,
              duration: 380,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: true,
            }),
            Animated.timing(money1X, {
              toValue: -140,
              duration: 700,
              easing: Easing.out(Easing.quad),
              useNativeDriver: true,
            }),
            Animated.timing(money1Rotate, {
              toValue: 0.7,
              duration: 420,
              easing: Easing.out(Easing.quad),
              useNativeDriver: true,
            }),
          ]),
          Animated.parallel([
            Animated.timing(money1Y, {
              toValue: -235,
              duration: 260,
              easing: Easing.in(Easing.quad),
              useNativeDriver: true,
            }),
            Animated.timing(money1Rotate, {
              toValue: 1,
              duration: 260,
              easing: Easing.out(Easing.quad),
              useNativeDriver: true,
            }),
          ]),
        ]),

        Animated.sequence([
          Animated.delay(18),
          Animated.parallel([
            Animated.timing(money2Y, {
              toValue: -340,
              duration: 390,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: true,
            }),
            Animated.timing(money2X, {
              toValue: -95,
              duration: 730,
              easing: Easing.out(Easing.quad),
              useNativeDriver: true,
            }),
            Animated.timing(money2Rotate, {
              toValue: 0.7,
              duration: 430,
              easing: Easing.out(Easing.quad),
              useNativeDriver: true,
            }),
          ]),
          Animated.parallel([
            Animated.timing(money2Y, {
              toValue: -255,
              duration: 270,
              easing: Easing.in(Easing.quad),
              useNativeDriver: true,
            }),
            Animated.timing(money2Rotate, {
              toValue: 1,
              duration: 270,
              easing: Easing.out(Easing.quad),
              useNativeDriver: true,
            }),
          ]),
        ]),

        Animated.sequence([
          Animated.delay(35),
          Animated.parallel([
            Animated.timing(money3Y, {
              toValue: -365,
              duration: 400,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: true,
            }),
            Animated.timing(money3X, {
              toValue: -20,
              duration: 740,
              easing: Easing.out(Easing.quad),
              useNativeDriver: true,
            }),
            Animated.timing(money3Rotate, {
              toValue: 0.7,
              duration: 440,
              easing: Easing.out(Easing.quad),
              useNativeDriver: true,
            }),
          ]),
          Animated.parallel([
            Animated.timing(money3Y, {
              toValue: -285,
              duration: 280,
              easing: Easing.in(Easing.quad),
              useNativeDriver: true,
            }),
            Animated.timing(money3Rotate, {
              toValue: 1,
              duration: 280,
              easing: Easing.out(Easing.quad),
              useNativeDriver: true,
            }),
          ]),
        ]),

        Animated.sequence([
          Animated.delay(52),
          Animated.parallel([
            Animated.timing(money4Y, {
              toValue: -325,
              duration: 385,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: true,
            }),
            Animated.timing(money4X, {
              toValue: 70,
              duration: 720,
              easing: Easing.out(Easing.quad),
              useNativeDriver: true,
            }),
            Animated.timing(money4Rotate, {
              toValue: 0.7,
              duration: 430,
              easing: Easing.out(Easing.quad),
              useNativeDriver: true,
            }),
          ]),
          Animated.parallel([
            Animated.timing(money4Y, {
              toValue: -245,
              duration: 265,
              easing: Easing.in(Easing.quad),
              useNativeDriver: true,
            }),
            Animated.timing(money4Rotate, {
              toValue: 1,
              duration: 265,
              easing: Easing.out(Easing.quad),
              useNativeDriver: true,
            }),
          ]),
        ]),

        Animated.sequence([
          Animated.delay(70),
          Animated.parallel([
            Animated.timing(money5Y, {
              toValue: -295,
              duration: 375,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: true,
            }),
            Animated.timing(money5X, {
              toValue: 145,
              duration: 700,
              easing: Easing.out(Easing.quad),
              useNativeDriver: true,
            }),
            Animated.timing(money5Rotate, {
              toValue: 0.7,
              duration: 420,
              easing: Easing.out(Easing.quad),
              useNativeDriver: true,
            }),
          ]),
          Animated.parallel([
            Animated.timing(money5Y, {
              toValue: -225,
              duration: 255,
              easing: Easing.in(Easing.quad),
              useNativeDriver: true,
            }),
            Animated.timing(money5Rotate, {
              toValue: 1,
              duration: 255,
              easing: Easing.out(Easing.quad),
              useNativeDriver: true,
            }),
          ]),
        ]),

        Animated.sequence([
          Animated.delay(92),
          Animated.parallel([
            Animated.timing(money6Y, {
              toValue: -275,
              duration: 365,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: true,
            }),
            Animated.timing(money6X, {
              toValue: 210,
              duration: 690,
              easing: Easing.out(Easing.quad),
              useNativeDriver: true,
            }),
            Animated.timing(money6Rotate, {
              toValue: 0.7,
              duration: 410,
              easing: Easing.out(Easing.quad),
              useNativeDriver: true,
            }),
          ]),
          Animated.parallel([
            Animated.timing(money6Y, {
              toValue: -215,
              duration: 245,
              easing: Easing.in(Easing.quad),
              useNativeDriver: true,
            }),
            Animated.timing(money6Rotate, {
              toValue: 1,
              duration: 245,
              easing: Easing.out(Easing.quad),
              useNativeDriver: true,
            }),
          ]),
        ]),

        Animated.sequence([
          Animated.delay(350),
          Animated.parallel([
            Animated.timing(bagOpacity, {
              toValue: 0,
              duration: 220,
              useNativeDriver: true,
            }),
            Animated.timing(bagScale, {
              toValue: 0.86,
              duration: 220,
              useNativeDriver: true,
            }),
            Animated.timing(introOverlayOpacity, {
              toValue: 0,
              duration: 450,
              easing: Easing.out(Easing.quad),
              useNativeDriver: true,
            }),
          ]),
        ]),
      ]),
    ]).start(() => {
      setShowIntroSplash(false);
    });
  }, [
    showIntroSplash,
  ]);

  const billsSectionStyle =
    !showBills && allBillsPaid
      ? {
        backgroundColor: colors.greenClosedBg,
        borderTopWidth: 4,
        borderTopColor: colors.greenClosedTop,
      }
      : {};

  useEffect(() => {
    if (!showIntroSplash) return;

    // Vänta tills splash-animationerna hunnit starta
    const timeout = setTimeout(() => {
      Animated.timing(introOverlayOpacity, {
        toValue: 0,
        duration: 600,
        useNativeDriver: true,
      }).start(() => {
        setShowIntroSplash(false);
      });
    }, 2000); // ändra tiden om du vill

    return () => clearTimeout(timeout);
  }, [showIntroSplash]);


  return (
    <TabFadeWrapper>
      <SafeAreaView
        edges={['left', 'right']}
        style={{ flex: 1, backgroundColor: '#071821' }}
      >
        <StatusBar
          barStyle={isDark ? 'light-content' : 'dark-content'}
          backgroundColor="#071821"
        />

        <LinearGradient
          pointerEvents="none"
          colors={appGradient}
          start={{ x: 0.15, y: 0 }}
          end={{ x: 0.85, y: 1 }}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
          }}
        />

        {showIntroSplash && (
          <Animated.View
            pointerEvents={showIntroSplash ? "auto" : "none"}
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 100,
              backgroundColor: 'rgba(0,0,0,0.18)',
              opacity: introOverlayOpacity,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <View style={{ width: 320, height: 320, alignItems: 'center', justifyContent: 'center' }}>
              <Animated.Image
                source={require('../../assets/splashscreen.png')}
                resizeMode="contain"
                style={{
                  position: 'absolute',
                  width: 180,
                  height: 180,
                  opacity: bagOpacity,
                  transform: [{ scale: bagScale }],
                }}
              />

              <Animated.Text
                style={{
                  position: 'absolute',
                  fontSize: 38,
                  opacity: money1Opacity,
                  transform: [
                    { translateX: money1X },
                    { translateY: money1Y },
                    { rotate: money1RotateDeg },
                  ],
                }}
              >
                💵
              </Animated.Text>

              <Animated.Text
                style={{
                  position: 'absolute',
                  fontSize: 42,
                  opacity: money2Opacity,
                  transform: [
                    { translateX: money2X },
                    { translateY: money2Y },
                    { rotate: money2RotateDeg },
                  ],
                }}
              >
                💶
              </Animated.Text>

              <Animated.Text
                style={{
                  position: 'absolute',
                  fontSize: 40,
                  opacity: money3Opacity,
                  transform: [
                    { translateX: money3X },
                    { translateY: money3Y },
                    { rotate: money3RotateDeg },
                  ],
                }}
              >
                💷
              </Animated.Text>

              <Animated.Text
                style={{
                  position: 'absolute',
                  fontSize: 37,
                  opacity: money4Opacity,
                  transform: [
                    { translateX: money4X },
                    { translateY: money4Y },
                    { rotate: money4RotateDeg },
                  ],
                }}
              >
                💴
              </Animated.Text>

              <Animated.Text
                style={{
                  position: 'absolute',
                  fontSize: 41,
                  opacity: money5Opacity,
                  transform: [
                    { translateX: money5X },
                    { translateY: money5Y },
                    { rotate: money5RotateDeg },
                  ],
                }}
              >
                💵
              </Animated.Text>

              <Animated.Text
                style={{
                  position: 'absolute',
                  fontSize: 39,
                  opacity: money6Opacity,
                  transform: [
                    { translateX: money6X },
                    { translateY: money6Y },
                    { rotate: money6RotateDeg },
                  ],
                }}
              >
                💶
              </Animated.Text>


            </View>
          </Animated.View>
        )}

        {showConfetti ? (
          <View pointerEvents="none" style={{ position: 'absolute', inset: 0, zIndex: 50 }}>
            <ConfettiCannon
              count={140}
              origin={{ x: 200, y: 0 }}
              fallSpeed={2600}
              fadeOut
              autoStart
              explosionSpeed={320}
            />
          </View>
        ) : null}

        <ScrollView
          style={{ flex: 1, backgroundColor: 'transparent' }}
          contentContainerStyle={{ paddingTop: 70, padding: 16, paddingBottom: 60 }}
          keyboardShouldPersistTaps="handled"
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginTop: 8,
              marginBottom: 18,
            }}
          >
            <Pressable
              onPress={() => {
                if (periodIndex > 0) {
                  Haptics.selectionAsync();
                  setSelectedPeriodId(sortedPeriods[periodIndex - 1].id);
                }
              }}
              style={({ pressed }) => [
                periodArrowButtonStyle,
                {
                  opacity: periodIndex === 0 ? 0.45 : 1,
                },
                pressed && periodIndex !== 0 && {
                  transform: [{ scale: 0.94 }],
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: isDark ? 0.22 : 0.08,
                  shadowRadius: 8,
                },
              ]}
              disabled={periodIndex === 0}
            >
              <Text style={{ fontSize: 22, color: colors.text }}>‹</Text>
            </Pressable>

            <View style={{ alignItems: 'center', flex: 1 }}>
              <Pressable
                onPress={() => {
                  if (skipNextPeriodPressRef.current) {
                    skipNextPeriodPressRef.current = false;
                    return;
                  }
                  setShowPeriodPickerModal(true);
                }}
                onLongPress={() => {
                  skipNextPeriodPressRef.current = true;

                  Alert.alert('Period', 'Vad vill du göra?', [
                    {
                      text: 'Byt namn',
                      onPress: openRenamePeriod,
                    },
                    {
                      text: 'Arkivera period',
                      onPress: () => {
                        const didArchive = archivePeriod(selectedPeriod.id);
                        if (didArchive) {
                          Alert.alert('Klart', 'Perioden arkiverades.');
                        }
                      },
                    },
                    {
                      text: 'Ta bort period',
                      style: 'destructive',
                      onPress: () => {
                        Alert.alert(
                          'Ta bort period?',
                          'Perioden och allt innehåll i den tas bort permanent.',
                          [
                            { text: 'Avbryt', style: 'cancel' },
                            {
                              text: 'Ta bort',
                              style: 'destructive',
                              onPress: () => {
                                const didDelete = deletePeriod(selectedPeriod.id);
                                if (didDelete) {
                                  Alert.alert('Borttagen', 'Perioden togs bort.');
                                }
                              },
                            },
                          ]
                        );
                      },
                    },
                    {
                      text: 'Avbryt',
                      style: 'cancel',
                    },
                  ]);
                }}
                delayLongPress={260}
                style={{ alignItems: 'center' }}
              >

                <View style={{ height: 20, justifyContent: 'center', marginBottom: 4, minWidth: 220 }}>
                  <Animated.Text
                    pointerEvents="none"
                    style={{
                      position: 'absolute',
                      alignSelf: 'center',
                      fontSize: 12,
                      fontWeight: '600',
                      color: '#22c55e',
                      opacity: displayActivityText ? 0 : presenceOpacity,
                      transform: [{ scale: presencePulse }],
                    }}
                  >
                    {displayActivityText ? '' : presenceText ?? ''}
                  </Animated.Text>

                  <Animated.Text
                    pointerEvents="none"
                    style={{
                      position: 'absolute',
                      alignSelf: 'center',
                      fontSize: 12,
                      fontWeight: '600',
                      color: isDark ? '#86efac' : '#15803d',
                      opacity: activityOpacity,
                      transform: [{ translateY: activityTranslateY }],
                    }}
                  >
                    {displayActivityText}
                  </Animated.Text>
                </View>

                <View style={{ position: 'relative' }}>

                  {/* Highlight (emboss top light) */}
                  <Text
                    style={{
                      position: 'absolute',
                      top: -1,
                      left: 0,
                      right: 0,
                      textAlign: 'center',
                      fontSize: 26,
                      fontWeight: '800',
                      color: 'rgba(255,255,255,0.25)',
                    }}
                  >
                    {selectedPeriod.label}
                  </Text>

                  {/* Main text */}
                  <Text
                    style={{
                      fontSize: 26,
                      fontWeight: '800',
                      color: colors.text,
                      textAlign: 'center',

                      textShadowColor: isDark
                        ? 'rgba(0,0,0,0.7)'
                        : 'rgba(0,0,0,0.18)',

                      textShadowOffset: { width: 0, height: isDark ? 3 : 1 },
                      textShadowRadius: isDark ? 6 : 3,
                    }}
                  >
                    {selectedPeriod.label}
                  </Text>

                </View>
              </Pressable>

              <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                {periodIndex < sortedPeriods.length - 1 && (
                  <Pressable
                    onPress={() => setSelectedPeriodId(sortedPeriods[sortedPeriods.length - 1].id)}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      borderRadius: 999,
                      backgroundColor: colors.chipBg,
                      shadowColor: '#000',
                      shadowOffset: { width: 0, height: 4 },
                      shadowOpacity: 0.25,
                      shadowRadius: 6,
                      elevation: 5,
                    }}
                  >
                    <Text style={{ fontSize: 13, fontWeight: '600', color: colors.chipText }}>
                      Gå till senaste
                    </Text>
                  </Pressable>
                )}

                {periodIndex === sortedPeriods.length - 1 && (
                  <Pressable
                    onPress={() => {
                      createNextPeriod();
                      Alert.alert(
                        'Ny period skapad',
                        'Nästa period skapades från återkommande räkningar.',
                      );
                    }}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      borderRadius: 999,
                      backgroundColor: colors.chipBg,
                      shadowColor: '#000',
                      shadowOffset: { width: 0, height: 4 },
                      shadowOpacity: 0.25,
                      shadowRadius: 6,
                      elevation: 5,
                    }}
                  >
                    <Text style={{ fontSize: 13, fontWeight: '600', color: colors.chipText }}>
                      Skapa nästa period
                    </Text>
                  </Pressable>
                )}
              </View>
            </View>

            <Pressable
              onPress={() => {
                if (periodIndex < sortedPeriods.length - 1) {
                  Haptics.selectionAsync();
                  setSelectedPeriodId(sortedPeriods[periodIndex + 1].id);
                }
              }}
              style={({ pressed }) => [
                periodArrowButtonStyle,
                {
                  opacity: periodIndex === sortedPeriods.length - 1 ? 0.45 : 1,
                },
                pressed && periodIndex !== sortedPeriods.length - 1 && {
                  transform: [{ scale: 0.94 }],
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: isDark ? 0.22 : 0.08,
                  shadowRadius: 8,
                },
              ]}
              disabled={periodIndex === sortedPeriods.length - 1}
            >
              <Text style={{ fontSize: 22, color: colors.text }}>›</Text>
            </Pressable>
          </View>

          <Text style={{ fontSize: 15, fontWeight: '600', color: colors.muted, marginBottom: 10, shadowColor: isDark ? '#000' : '#fff', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.25, shadowRadius: 5, elevation: 10 }}>
            Pengar kvar:
          </Text>

          <View style={{ flexDirection: 'row', gap: 12, marginBottom: 12 }}>
            <View
              style={{
                flex: 1,
                backgroundColor: colors.card,
                borderRadius: 18,
                padding: 16,
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.06)',

                shadowColor: '#000',
                shadowOffset: { width: 0, height: 14 },
                shadowOpacity: 0.60,
                shadowRadius: 25,
                elevation: 10,
              }}
            >
              <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 6 }}>
                Efter räkningar
              </Text>
              <Text style={{ fontSize: 22, fontWeight: '700', color: colors.text }}>
                {formatCurrency(afterBills)}
              </Text>
            </View>

            <View
              style={{
                flex: 1,
                backgroundColor: colors.card,
                borderRadius: 18,
                padding: 16,
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.06)',

                shadowColor: '#000',
                shadowOffset: { width: 0, height: 14 },
                shadowOpacity: 0.60,
                shadowRadius: 25,
                elevation: 10,
              }}
            >
              <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 6 }}>
                Efter budget
              </Text>
              <Text style={{ fontSize: 22, fontWeight: '700', color: colors.text }}>
                {formatCurrency(afterBudget)}
              </Text>
            </View>
          </View>

          {showTransferSection ? (
            <View
              style={{
                backgroundColor: colors.transferBg,
                borderRadius: 18,
                padding: 16,
                marginBottom: 20,

                shadowColor: '#000',
                shadowOffset: { width: 0, height: 14 },
                shadowOpacity: 0.75,
                shadowRadius: 25,
                elevation: 10,
              }}
            >
              <Text style={{ fontSize: 14, color: colors.transferLabel, marginBottom: 6 }}>
                {transferSummary.label}
              </Text>
              <Text
                style={{
                  fontSize: 28,
                  fontWeight: '700',
                  color: colors.transferText,
                  marginBottom: 6,
                }}
              >
                {transferSummary.amountText}
              </Text>

              <Text style={{ fontSize: 13, color: colors.transferLabel, marginBottom: 8 }}>
                {transferExplanation}
              </Text>

              <Text style={{ fontSize: 12, color: colors.transferLabel }}>
                {transferSummary.helper}
              </Text>
            </View>
          ) : null}

          <View
            style={{
              borderRadius: 18,
              padding: 16,
              marginBottom: 16,
              backgroundColor: colors.card,

              shadowColor: '#000',
              shadowOffset: { width: 0, height: 14 },
              shadowOpacity: 0.75,
              shadowRadius: 25,
              elevation: 10,

              ...billsSectionStyle,
            }}
          >
            <SectionHeader
              title="Räkningar"
              open={showBills}
              onPress={() => setShowBills((prev) => !prev)}
              totalText={formatCurrency(totalBillsAmount)}
              colors={colors}
              rightAction={
                <Pressable
                  onPress={() => setShowAddBillModal(true)}
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                    borderRadius: 999,
                    backgroundColor: colors.chipBg,
                  }}
                >
                  <Text style={{ fontSize: 13, fontWeight: '600', color: colors.chipText }}>Ny</Text>
                </Pressable>
              }
            />

            <CollapsibleSection open={showBills}>
              <View style={{ flexDirection: 'row', marginBottom: 12 }}>
                {showPartnerSection ? (
                  <>
                    <FilterChip
                      label="Alla"
                      active={billFilter === 'all'}
                      onPress={() => setBillFilter('all')}
                      colors={colors}
                    />

                    <FilterChip
                      label="Mina"
                      active={billFilter === 'me'}
                      onPress={() => setBillFilter('me')}
                      colors={colors}
                    />

                    <FilterChip
                      label={partnerName}
                      active={billFilter === 'partner'}
                      onPress={() => setBillFilter('partner')}
                      colors={colors}
                    />
                  </>
                ) : (
                  <FilterChip
                    label="Räkningar"
                    active
                    onPress={() => { }}
                    colors={colors}
                  />
                )}
              </View>

              <Text style={{ fontSize: 14, color: colors.muted, marginBottom: 12 }}>
                {paidBills} / {totalBills} betalda
              </Text>

              <View
                style={{
                  height: 10,
                  backgroundColor: isDark ? '#2a2f39' : '#e5e7eb',
                  borderRadius: 999,
                  overflow: 'hidden',
                  marginBottom: 12,
                }}
              >
                <Animated.View
                  style={{
                    width: progressWidth,
                    height: '100%',
                    backgroundColor: '#5b8def',
                    borderRadius: 999,
                  }}
                />
              </View>

              <Text style={{ fontSize: 14, color: colors.muted, marginBottom: 16 }}>
                Obetalda räkningar: {formatCurrency(unpaidAmount)}
              </Text>

              {allBillsPaid && (
                <View
                  style={{
                    backgroundColor: colors.successBg,
                    borderRadius: 14,
                    padding: 12,
                    marginBottom: 14,
                  }}
                >
                  <Text style={{ fontSize: 15, fontWeight: '600', color: colors.successText }}>
                    🎉 Alla räkningar betalda
                  </Text>
                </View>
              )}

              <FlatList
                data={visibleBills}
                keyExtractor={(item) => item.id}
                scrollEnabled={false}
                nestedScrollEnabled={false}
                removeClippedSubviews={false}
                initialNumToRender={12}
                maxToRenderPerBatch={10}
                windowSize={7}
                renderItem={({ item }) => (
                  <BillRow
                    bill={item}
                    onToggleDone={toggleBill}
                    onLongPress={openBillActions}
                    meName={meName}
                    partnerName={partnerName}
                    colors={colors}
                  />
                )}
                ListEmptyComponent={
                  <View
                    style={{
                      borderRadius: 16,
                      padding: 16,
                      backgroundColor: colors.inputBg,
                      borderWidth: 1,
                      borderColor: colors.softRowBorder,
                    }}
                  >
                    <Text style={{ color: colors.muted, fontSize: 14 }}>
                      Inga räkningar att visa här ännu.
                    </Text>
                  </View>
                }
              />
            </CollapsibleSection>
          </View>

          <View
            style={{
              borderRadius: 18,
              padding: 16,
              marginBottom: 16,
              backgroundColor: colors.card,

              shadowColor: '#000',
              shadowOffset: { width: 0, height: 14 },
              shadowOpacity: 0.75,
              shadowRadius: 25,
              elevation: 10,
            }}
          >
            <SectionHeader
              title="Budget"
              open={showBudget}
              onPress={() => setShowBudget((prev) => !prev)}
              totalText={formatCurrency(totalBudget)}
              colors={colors}
              rightAction={
                <Pressable
                  onPress={() => setShowAddBudgetModal(true)}
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                    borderRadius: 999,
                    backgroundColor: colors.chipBg,
                  }}
                >
                  <Text style={{ fontSize: 13, fontWeight: '600', color: colors.chipText }}>Ny</Text>
                </Pressable>
              }
            />

            <CollapsibleSection open={showBudget}>
              <Text
                style={{
                  fontSize: 13,
                  color: colors.muted,
                  marginBottom: 12,
                  textTransform: 'uppercase',
                  letterSpacing: 0.6,
                }}
              >
                Planerade utgifter
              </Text>
              {budgetEntries.map((entry) => (
                <SoftEntryRow
                  key={entry.id}
                  entry={entry}
                  onLongPress={(item) => openEntryActions(item, 'budget')}
                  colors={colors}
                />
              ))}
            </CollapsibleSection>
          </View>

          <View
            style={{
              borderRadius: 18,
              padding: 16,
              marginBottom: 16,
              backgroundColor: colors.card,

              shadowColor: '#000',
              shadowOffset: { width: 0, height: 14 },
              shadowOpacity: 0.75,
              shadowRadius: 25,
              elevation: 10,
            }}
          >
            <SectionHeader
              title="Inkomster"
              open={showIncome}
              onPress={() => setShowIncome((prev) => !prev)}
              totalText={formatCurrency(totalIncome)}
              colors={colors}
              rightAction={
                <Pressable
                  onPress={() => setShowAddIncomeModal(true)}
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                    borderRadius: 999,
                    backgroundColor: colors.chipBg,
                  }}
                >
                  <Text style={{ fontSize: 13, fontWeight: '600', color: colors.chipText }}>Ny</Text>
                </Pressable>
              }
            />

            <CollapsibleSection open={showIncome}>
              <Text
                style={{
                  fontSize: 13,
                  color: colors.muted,
                  marginBottom: 12,
                  textTransform: 'uppercase',
                  letterSpacing: 0.6,
                }}
              >
                Registrerade inkomster
              </Text>
              {incomeEntries.map((entry) => (
                <SoftEntryRow
                  key={entry.id}
                  entry={entry}
                  onLongPress={(item) => openEntryActions(item, 'income')}
                  colors={colors}
                  showOwner={showPartnerSection}
                />
              ))}
            </CollapsibleSection>
          </View>
        </ScrollView>

        <BottomSheet
          visible={showPeriodPickerModal}
          onClose={() => setShowPeriodPickerModal(false)}
          colors={colors}
          minHeight={300}
        >
          <Text style={{ fontSize: 22, fontWeight: '700', color: colors.text, marginBottom: 18 }}>
            Välj period
          </Text>

          {sortedPeriods.length === 0 ? (
            <View
              style={{
                paddingVertical: 18,
                paddingHorizontal: 16,
                borderRadius: 16,
                backgroundColor: colors.inputBg,
                borderWidth: 1,
                borderColor: colors.softRowBorder,
              }}
            >
              <Text style={{ fontSize: 15, fontWeight: '600', color: colors.text, marginBottom: 6 }}>
                Inga perioder ännu
              </Text>
              <Text style={{ fontSize: 13, color: colors.muted, lineHeight: 20 }}>
                Skapa nästa period först, så dyker den upp här direkt.
              </Text>
            </View>
          ) : (
            sortedPeriods
              .slice()
              .reverse()
              .map((period) => {
                const active = period.id === selectedPeriodId;

                return (
                  <Pressable
                    key={period.id}
                    onPress={() => {
                      setSelectedPeriodId(period.id);
                      setShowPeriodPickerModal(false);
                    }}
                    style={{
                      paddingVertical: 14,
                      paddingHorizontal: 14,
                      borderRadius: 16,
                      marginBottom: 10,
                      backgroundColor: active ? colors.chipActiveBg : colors.inputBg,
                      borderWidth: 1,
                      borderColor: active ? colors.chipActiveBg : colors.softRowBorder,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 16,
                        fontWeight: '700',
                        color: active ? colors.chipActiveText : colors.text,
                      }}
                    >
                      {period.label}
                    </Text>

                    <Text
                      style={{
                        fontSize: 12,
                        marginTop: 4,
                        color: active ? colors.chipActiveText : colors.muted,
                        opacity: active ? 0.85 : 1,
                      }}
                    >
                      {period.startDate?.slice(0, 10)} → {period.endDate?.slice(0, 10)}
                    </Text>
                  </Pressable>
                );
              })
          )}
        </BottomSheet>

        <Modal
          visible={showRenamePeriodModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowRenamePeriodModal(false)}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={{ flex: 1 }}
          >
            <Pressable
              style={{
                flex: 1,
                backgroundColor: 'rgba(0,0,0,0.45)',
                justifyContent: 'center',
                alignItems: 'center',
                paddingHorizontal: 24,
                paddingBottom: 12,
                paddingTop: 250,
                marginBottom: 0,
              }}
              onPress={() => setShowRenamePeriodModal(false)}
            >
              <Pressable
                onPress={(e) => e.stopPropagation()}
                style={{
                  width: '100%',
                  maxWidth: 420,
                  backgroundColor: colors.card,
                  borderRadius: 20,
                  padding: 18,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              >
                <Text style={{ fontSize: 22, fontWeight: '700', color: colors.text, marginBottom: 18 }}>
                  Byt periodnamn
                </Text>

                <Text style={{ fontSize: 14, color: colors.muted, marginBottom: 6 }}>
                  Namn
                </Text>

                <TextInput
                  value={periodNameInput}
                  onChangeText={setPeriodNameInput}
                  placeholder="Ex. Marslönen"
                  placeholderTextColor={colors.placeholder}
                  autoFocus
                  returnKeyType="done"
                  onSubmitEditing={savePeriodName}
                  style={{
                    backgroundColor: colors.inputBg,
                    borderRadius: 14,
                    paddingHorizontal: 14,
                    paddingVertical: 14,
                    fontSize: 16,
                    color: colors.text,
                    marginBottom: 20,
                  }}
                />

                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <Pressable
                    onPress={() => setShowRenamePeriodModal(false)}
                    style={{
                      flex: 1,
                      backgroundColor: colors.buttonSecondaryBg,
                      borderRadius: 14,
                      paddingVertical: 14,
                      alignItems: 'center',
                    }}
                  >
                    <Text style={{ fontSize: 16, fontWeight: '600', color: colors.buttonSecondaryText }}>
                      Avbryt
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={savePeriodName}
                    style={{
                      flex: 1,
                      backgroundColor: colors.buttonPrimaryBg,
                      borderRadius: 14,
                      paddingVertical: 14,
                      alignItems: 'center',
                    }}
                  >
                    <Text style={{ fontSize: 16, fontWeight: '600', color: colors.buttonPrimaryText }}>
                      Spara
                    </Text>
                  </Pressable>
                </View>
              </Pressable>
            </Pressable>
          </KeyboardAvoidingView>
        </Modal>

        <BottomSheet visible={showAddBillModal} onClose={() => setShowAddBillModal(false)} colors={colors}>
          <Text style={{ fontSize: 22, fontWeight: '700', color: colors.text, marginBottom: 18 }}>
            Ny räkning
          </Text>
          <Text style={{ fontSize: 14, color: colors.muted, marginBottom: 6 }}>Namn</Text>
          <TextInput
            value={newBillName}
            onChangeText={setNewBillName}
            placeholder="Skriv namn"
            placeholderTextColor={colors.placeholder}
            style={{
              backgroundColor: colors.inputBg,
              borderRadius: 14,
              paddingHorizontal: 14,
              paddingVertical: 14,
              fontSize: 16,
              color: colors.text,
              marginBottom: 14,
            }}
          />
          <Text style={{ fontSize: 14, color: colors.muted, marginBottom: 6 }}>Belopp</Text>
          <TextInput
            value={newBillAmount}
            onChangeText={setNewBillAmount}
            placeholder="Ex. 1299"
            placeholderTextColor={colors.placeholder}
            keyboardType="numeric"
            style={{
              backgroundColor: colors.inputBg,
              borderRadius: 14,
              paddingHorizontal: 14,
              paddingVertical: 14,
              fontSize: 16,
              color: colors.text,
              marginBottom: 14,
            }}
          />
          <Text style={{ fontSize: 14, color: colors.muted, marginBottom: 8 }}>Kategori</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 }}>
            {categoryOptions.map((category) => (
              <CategoryChip
                key={category}
                label={category}
                active={newBillCategory === category}
                onPress={() => setNewBillCategory(category)}
                colors={colors}
              />
            ))}
          </View>
          <TextInput
            value={newBillCategory}
            onChangeText={setNewBillCategory}
            placeholder="Eller skriv egen kategori"
            placeholderTextColor={colors.placeholder}
            style={{
              backgroundColor: colors.inputBg,
              borderRadius: 14,
              paddingHorizontal: 14,
              paddingVertical: 14,
              fontSize: 16,
              color: colors.text,
              marginBottom: 14,
            }}
          />
          {showPartnerSection ? (
            <>
              <Text style={{ fontSize: 14, color: colors.muted, marginBottom: 8 }}>Tillhör</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 14 }}>
                <OwnerChip label={meName} active={newBillOwner === 'me'} onPress={() => setNewBillOwner('me')} colors={colors} />
                <OwnerChip label={partnerName} active={newBillOwner === 'partner'} onPress={() => setNewBillOwner('partner')} colors={colors} />
                <OwnerChip label="Gemensam" active={newBillOwner === 'shared'} onPress={() => setNewBillOwner('shared')} colors={colors} />
              </View>
            </>
          ) : null}

          {showPartnerSection && newBillOwner === 'shared' ? (
            <>
              <Text style={{ fontSize: 14, color: colors.muted, marginBottom: 8 }}>Betald av</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 14 }}>
                <OwnerChip label={meName} active={newBillPaidBy === 'me'} onPress={() => setNewBillPaidBy('me')} colors={colors} />
                <OwnerChip label={partnerName} active={newBillPaidBy === 'partner'} onPress={() => setNewBillPaidBy('partner')} colors={colors} />
              </View>
            </>
          ) : null}

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
            <Text style={{ fontSize: 15, color: colors.text, fontWeight: '600' }}>
              Återkommande varje period
            </Text>
            <Switch value={newBillRecurring} onValueChange={setNewBillRecurring} />
          </View>

          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Pressable
              onPress={() => setShowAddBillModal(false)}
              style={{
                flex: 1,
                backgroundColor: colors.buttonSecondaryBg,
                borderRadius: 14,
                paddingVertical: 14,
                alignItems: 'center',
              }}
            >
              <Text style={{ fontSize: 16, fontWeight: '600', color: colors.buttonSecondaryText }}>
                Avbryt
              </Text>
            </Pressable>
            <Pressable
              onPress={addBill}
              style={{
                flex: 1,
                backgroundColor: colors.buttonPrimaryBg,
                borderRadius: 14,
                paddingVertical: 14,
                alignItems: 'center',
              }}
            >
              <Text style={{ fontSize: 16, fontWeight: '600', color: colors.buttonPrimaryText }}>
                Spara
              </Text>
            </Pressable>
          </View>
        </BottomSheet>

        <BottomSheet visible={showAddBudgetModal} onClose={() => setShowAddBudgetModal(false)} colors={colors}>
          <Text style={{ fontSize: 22, fontWeight: '700', color: colors.text, marginBottom: 18 }}>
            Ny budget
          </Text>
          <Text style={{ fontSize: 14, color: colors.muted, marginBottom: 6 }}>Namn</Text>
          <TextInput
            value={newBudgetName}
            onChangeText={setNewBudgetName}
            placeholder="Skriv namn"
            placeholderTextColor={colors.placeholder}
            style={{
              backgroundColor: colors.inputBg,
              borderRadius: 14,
              paddingHorizontal: 14,
              paddingVertical: 14,
              fontSize: 16,
              color: colors.text,
              marginBottom: 14,
            }}
          />
          <Text style={{ fontSize: 14, color: colors.muted, marginBottom: 6 }}>Belopp</Text>
          <TextInput
            value={newBudgetAmount}
            onChangeText={setNewBudgetAmount}
            placeholder="Ex. 8000"
            placeholderTextColor={colors.placeholder}
            keyboardType="numeric"
            style={{
              backgroundColor: colors.inputBg,
              borderRadius: 14,
              paddingHorizontal: 14,
              paddingVertical: 14,
              fontSize: 16,
              color: colors.text,
              marginBottom: 14,
            }}
          />
          <Text style={{ fontSize: 14, color: colors.muted, marginBottom: 8 }}>Kategori</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 }}>
            {categoryOptions.map((category) => (
              <CategoryChip
                key={category}
                label={category}
                active={newBudgetCategory === category}
                onPress={() => setNewBudgetCategory(category)}
                colors={colors}
              />
            ))}
          </View>
          <TextInput
            value={newBudgetCategory}
            onChangeText={setNewBudgetCategory}
            placeholder="Eller skriv egen kategori"
            placeholderTextColor={colors.placeholder}
            style={{
              backgroundColor: colors.inputBg,
              borderRadius: 14,
              paddingHorizontal: 14,
              paddingVertical: 14,
              fontSize: 16,
              color: colors.text,
              marginBottom: 20,
            }}
          />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Pressable
              onPress={() => setShowAddBudgetModal(false)}
              style={{
                flex: 1,
                backgroundColor: colors.buttonSecondaryBg,
                borderRadius: 14,
                paddingVertical: 14,
                alignItems: 'center',
              }}
            >
              <Text style={{ fontSize: 16, fontWeight: '600', color: colors.buttonSecondaryText }}>
                Avbryt
              </Text>
            </Pressable>
            <Pressable
              onPress={addBudgetEntry}
              style={{
                flex: 1,
                backgroundColor: colors.buttonPrimaryBg,
                borderRadius: 14,
                paddingVertical: 14,
                alignItems: 'center',
              }}
            >
              <Text style={{ fontSize: 16, fontWeight: '600', color: colors.buttonPrimaryText }}>
                Spara
              </Text>
            </Pressable>
          </View>
        </BottomSheet>

        <BottomSheet visible={showAddIncomeModal} onClose={() => setShowAddIncomeModal(false)} colors={colors}>
          <Text style={{ fontSize: 22, fontWeight: '700', color: colors.text, marginBottom: 18 }}>
            Ny inkomst
          </Text>
          <Text style={{ fontSize: 14, color: colors.muted, marginBottom: 6 }}>Namn</Text>
          <TextInput
            value={newIncomeName}
            onChangeText={setNewIncomeName}
            placeholder="Skriv namn"
            placeholderTextColor={colors.placeholder}
            style={{
              backgroundColor: colors.inputBg,
              borderRadius: 14,
              paddingHorizontal: 14,
              paddingVertical: 14,
              fontSize: 16,
              color: colors.text,
              marginBottom: 14,
            }}
          />
          <Text style={{ fontSize: 14, color: colors.muted, marginBottom: 6 }}>Belopp</Text>
          <TextInput
            value={newIncomeAmount}
            onChangeText={setNewIncomeAmount}
            placeholder="Ex. 12000"
            placeholderTextColor={colors.placeholder}
            keyboardType="numeric"
            style={{
              backgroundColor: colors.inputBg,
              borderRadius: 14,
              paddingHorizontal: 14,
              paddingVertical: 14,
              fontSize: 16,
              color: colors.text,
              marginBottom: 14,
            }}
          />
          {showPartnerSection ? (
            <>
              <Text style={{ fontSize: 14, color: colors.muted, marginBottom: 8 }}>Tillhör</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 20 }}>
                <OwnerChip label={meName} active={newIncomeOwner === 'me'} onPress={() => setNewIncomeOwner('me')} colors={colors} />
                <OwnerChip label={partnerName} active={newIncomeOwner === 'partner'} onPress={() => setNewIncomeOwner('partner')} colors={colors} />
              </View>
            </>
          ) : null}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Pressable
              onPress={() => setShowAddIncomeModal(false)}
              style={{
                flex: 1,
                backgroundColor: colors.buttonSecondaryBg,
                borderRadius: 14,
                paddingVertical: 14,
                alignItems: 'center',
              }}
            >
              <Text style={{ fontSize: 16, fontWeight: '600', color: colors.buttonSecondaryText }}>
                Avbryt
              </Text>
            </Pressable>
            <Pressable
              onPress={addIncomeEntry}
              style={{
                flex: 1,
                backgroundColor: colors.buttonPrimaryBg,
                borderRadius: 14,
                paddingVertical: 14,
                alignItems: 'center',
              }}
            >
              <Text style={{ fontSize: 16, fontWeight: '600', color: colors.buttonPrimaryText }}>
                Spara
              </Text>
            </Pressable>
          </View>
        </BottomSheet>

        <Modal
          visible={showBillActionsModal}
          animationType="fade"
          transparent
          onRequestClose={() => setShowBillActionsModal(false)}
        >
          <Pressable
            style={{
              flex: 1,
              backgroundColor: 'rgba(0,0,0,0.28)',
              justifyContent: 'center',
              alignItems: 'center',
              padding: 24,
            }}
            onPress={() => setShowBillActionsModal(false)}
          >
            <Pressable
              onPress={() => { }}
              style={{
                width: '100%',
                maxWidth: 360,
                backgroundColor: colors.modalBg,
                borderRadius: 20,
                padding: 16,
                ...cardShadow(),
              }}
            >
              <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: 16 }}>
                {selectedBill?.name || 'Räkning'}
              </Text>

              <Pressable onPress={openEditBill} style={{ paddingVertical: 14 }}>
                <Text style={{ fontSize: 16, color: colors.text }}>Redigera</Text>
              </Pressable>

              <View style={{ height: 1, backgroundColor: isDark ? '#2f3642' : '#ececec' }} />

              <Pressable onPress={deleteSelectedBill} style={{ paddingVertical: 14 }}>
                <Text style={{ fontSize: 16, color: '#c0392b' }}>Ta bort</Text>
              </Pressable>

              <View style={{ height: 1, backgroundColor: isDark ? '#2f3642' : '#ececec' }} />

              <Pressable onPress={() => setShowBillActionsModal(false)} style={{ paddingVertical: 14 }}>
                <Text style={{ fontSize: 16, color: colors.muted }}>Avbryt</Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </Modal>

        <Modal
          visible={showEntryActionsModal}
          animationType="fade"
          transparent
          onRequestClose={() => setShowEntryActionsModal(false)}
        >
          <Pressable
            style={{
              flex: 1,
              backgroundColor: 'rgba(0,0,0,0.28)',
              justifyContent: 'center',
              alignItems: 'center',
              padding: 24,
            }}
            onPress={() => setShowEntryActionsModal(false)}
          >
            <Pressable
              onPress={() => { }}
              style={{
                width: '100%',
                maxWidth: 360,
                backgroundColor: colors.modalBg,
                borderRadius: 20,
                padding: 16,
                ...cardShadow(),
              }}
            >
              <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: 16 }}>
                {selectedEntry?.name || 'Post'}
              </Text>

              <Pressable onPress={openEditEntry} style={{ paddingVertical: 14 }}>
                <Text style={{ fontSize: 16, color: colors.text }}>Redigera</Text>
              </Pressable>

              <View style={{ height: 1, backgroundColor: isDark ? '#2f3642' : '#ececec' }} />

              <Pressable onPress={deleteSelectedEntry} style={{ paddingVertical: 14 }}>
                <Text style={{ fontSize: 16, color: '#c0392b' }}>Ta bort</Text>
              </Pressable>

              <View style={{ height: 1, backgroundColor: isDark ? '#2f3642' : '#ececec' }} />

              <Pressable onPress={() => setShowEntryActionsModal(false)} style={{ paddingVertical: 14 }}>
                <Text style={{ fontSize: 16, color: colors.muted }}>Avbryt</Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </Modal>

        <BottomSheet
          visible={showEditBillModal}
          onClose={() => {
            setShowEditBillModal(false);
            setSelectedBill(null);
          }}
          colors={colors}
        >
          <Text style={{ fontSize: 22, fontWeight: '700', color: colors.text, marginBottom: 18 }}>
            Redigera räkning
          </Text>

          <Text style={{ fontSize: 14, color: colors.muted, marginBottom: 6 }}>Namn</Text>
          <TextInput
            value={editBillName}
            onChangeText={setEditBillName}
            placeholder="Skriv namn"
            placeholderTextColor={colors.placeholder}
            style={{
              backgroundColor: colors.inputBg,
              borderRadius: 14,
              paddingHorizontal: 14,
              paddingVertical: 14,
              fontSize: 16,
              color: colors.text,
              marginBottom: 14,
            }}
          />

          <Text style={{ fontSize: 14, color: colors.muted, marginBottom: 6 }}>Belopp</Text>
          <TextInput
            value={editBillAmount}
            onChangeText={setEditBillAmount}
            placeholder="Ex. 1299"
            placeholderTextColor={colors.placeholder}
            keyboardType="numeric"
            style={{
              backgroundColor: colors.inputBg,
              borderRadius: 14,
              paddingHorizontal: 14,
              paddingVertical: 14,
              fontSize: 16,
              color: colors.text,
              marginBottom: 14,
            }}
          />

          <Text style={{ fontSize: 14, color: colors.muted, marginBottom: 8 }}>Kategori</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 }}>
            {categoryOptions.map((category) => (
              <CategoryChip
                key={category}
                label={category}
                active={editBillCategory === category}
                onPress={() => setEditBillCategory(category)}
                colors={colors}
              />
            ))}
          </View>

          <TextInput
            value={editBillCategory}
            onChangeText={setEditBillCategory}
            placeholder="Eller skriv egen kategori"
            placeholderTextColor={colors.placeholder}
            style={{
              backgroundColor: colors.inputBg,
              borderRadius: 14,
              paddingHorizontal: 14,
              paddingVertical: 14,
              fontSize: 16,
              color: colors.text,
              marginBottom: 14,
            }}
          />

          {showPartnerSection && (
            <>
              <Text style={{ fontSize: 14, color: colors.muted, marginBottom: 8 }}>
                Tillhör
              </Text>

              <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 14 }}>
                <OwnerChip
                  label={meName}
                  active={editBillOwner === 'me'}
                  onPress={() => setEditBillOwner('me')}
                  colors={colors}
                />
                <OwnerChip
                  label={partnerName}
                  active={editBillOwner === 'partner'}
                  onPress={() => setEditBillOwner('partner')}
                  colors={colors}
                />
                <OwnerChip
                  label="Gemensam"
                  active={editBillOwner === 'shared'}
                  onPress={() => setEditBillOwner('shared')}
                  colors={colors}
                />
              </View>
            </>
          )}

          {showPartnerSection && editBillOwner === 'shared' ? (
            <>
              <Text style={{ fontSize: 14, color: colors.muted, marginBottom: 8 }}>Betald av</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 14 }}>
                <OwnerChip
                  label={meName}
                  active={editBillPaidBy === 'me'}
                  onPress={() => setEditBillPaidBy('me')}
                  colors={colors}
                />
                <OwnerChip
                  label={partnerName}
                  active={editBillPaidBy === 'partner'}
                  onPress={() => setEditBillPaidBy('partner')}
                  colors={colors}
                />
              </View>
            </>
          ) : null}

          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 18,
            }}
          >
            <Text style={{ fontSize: 15, color: colors.text, fontWeight: '600' }}>
              Återkommande varje period
            </Text>
            <Switch value={editBillRecurring} onValueChange={setEditBillRecurring} />
          </View>

          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Pressable
              onPress={() => {
                setShowEditBillModal(false);
                setSelectedBill(null);
              }}
              style={{
                flex: 1,
                backgroundColor: colors.buttonSecondaryBg,
                borderRadius: 14,
                paddingVertical: 14,
                alignItems: 'center',
              }}
            >
              <Text style={{ fontSize: 16, fontWeight: '600', color: colors.buttonSecondaryText }}>
                Avbryt
              </Text>
            </Pressable>

            <Pressable
              onPress={saveEditedBill}
              style={{
                flex: 1,
                backgroundColor: colors.buttonPrimaryBg,
                borderRadius: 14,
                paddingVertical: 14,
                alignItems: 'center',
              }}
            >
              <Text style={{ fontSize: 16, fontWeight: '600', color: colors.buttonPrimaryText }}>
                Spara
              </Text>
            </Pressable>
          </View>
        </BottomSheet>

        <BottomSheet
          visible={showEditEntryModal}
          onClose={() => {
            setShowEditEntryModal(false);
            setSelectedEntry(null);
          }}
          colors={colors}
        >
          <Text style={{ fontSize: 22, fontWeight: '700', color: colors.text, marginBottom: 18 }}>
            {selectedEntryType === 'budget' ? 'Redigera budget' : 'Redigera inkomst'}
          </Text>

          <Text style={{ fontSize: 14, color: colors.muted, marginBottom: 6 }}>Namn</Text>
          <TextInput
            value={editEntryName}
            onChangeText={setEditEntryName}
            placeholder="Skriv namn"
            placeholderTextColor={colors.placeholder}
            style={{
              backgroundColor: colors.inputBg,
              borderRadius: 14,
              paddingHorizontal: 14,
              paddingVertical: 14,
              fontSize: 16,
              color: colors.text,
              marginBottom: 14,
            }}
          />

          <Text style={{ fontSize: 14, color: colors.muted, marginBottom: 6 }}>Belopp</Text>
          <TextInput
            value={editEntryAmount}
            onChangeText={setEditEntryAmount}
            placeholder="Ex. 12000"
            placeholderTextColor={colors.placeholder}
            keyboardType="numeric"
            style={{
              backgroundColor: colors.inputBg,
              borderRadius: 14,
              paddingHorizontal: 14,
              paddingVertical: 14,
              fontSize: 16,
              color: colors.text,
              marginBottom: 14,
            }}
          />

          {selectedEntryType === 'budget' ? (
            <>
              <Text style={{ fontSize: 14, color: colors.muted, marginBottom: 8 }}>Kategori</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 }}>
                {categoryOptions.map((category) => (
                  <CategoryChip
                    key={category}
                    label={category}
                    active={editEntryCategory === category}
                    onPress={() => setEditEntryCategory(category)}
                    colors={colors}
                  />
                ))}
              </View>

              <TextInput
                value={editEntryCategory}
                onChangeText={setEditEntryCategory}
                placeholder="Eller skriv egen kategori"
                placeholderTextColor={colors.placeholder}
                style={{
                  backgroundColor: colors.inputBg,
                  borderRadius: 14,
                  paddingHorizontal: 14,
                  paddingVertical: 14,
                  fontSize: 16,
                  color: colors.text,
                  marginBottom: 20,
                }}
              />
            </>
          ) : showPartnerSection ? (
            <>
              <Text style={{ fontSize: 14, color: colors.muted, marginBottom: 8 }}>Tillhör</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 20 }}>
                <OwnerChip
                  label={meName}
                  active={editIncomeOwner === 'me'}
                  onPress={() => setEditIncomeOwner('me')}
                  colors={colors}
                />
                <OwnerChip
                  label={partnerName}
                  active={editIncomeOwner === 'partner'}
                  onPress={() => setEditIncomeOwner('partner')}
                  colors={colors}
                />
              </View>
            </>
          ) : null}

          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Pressable
              onPress={() => {
                setShowEditEntryModal(false);
                setSelectedEntry(null);
              }}
              style={{
                flex: 1,
                backgroundColor: colors.buttonSecondaryBg,
                borderRadius: 14,
                paddingVertical: 14,
                alignItems: 'center',
              }}
            >
              <Text style={{ fontSize: 16, fontWeight: '600', color: colors.buttonSecondaryText }}>
                Avbryt
              </Text>
            </Pressable>

            <Pressable
              onPress={saveEditedEntry}
              style={{
                flex: 1,
                backgroundColor: colors.buttonPrimaryBg,
                borderRadius: 14,
                paddingVertical: 14,
                alignItems: 'center',
              }}
            >
              <Text style={{ fontSize: 16, fontWeight: '600', color: colors.buttonPrimaryText }}>
                Spara
              </Text>
            </Pressable>
          </View>
        </BottomSheet>
      </SafeAreaView>
    </TabFadeWrapper>
  );
}