import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  LayoutAnimation,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  UIManager,
  useColorScheme,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppContext } from '../../context/AppContext';
import {
  calculateOverviewAnalyticsFromRange,
  getDisplayRangeLabel,
  getPeriodsInRange,
  getRangeOptions,
} from '../../utils/analytics';

import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import TabFadeWrapper from "@/components/TabFadeWrapper";




if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('sv-SE', {
    style: 'currency',
    currency: 'SEK',
    maximumFractionDigits: 0,
  }).format(value || 0);

const formatSignedCurrency = (value: number) => {
  const abs = formatCurrency(Math.abs(value));
  return value < 0 ? `- ${abs}` : abs;
};

type PickerMode = 'start' | 'end';
type MetricKey =
  | 'income'
  | 'bills'
  | 'budget'
  | 'afterBills'
  | 'afterBudget'
  | 'categories';

type CategoryDetailItem = {
  name: string;
  total: number;
  count: number;
  type: 'bill' | 'budget';
};

type ChartPoint = {
  id: string;
  label: string;
  value: number;
  periodId?: string;
};

function getYearFromSortKey(sortKey?: string) {
  if (!sortKey || sortKey.length < 4) return null;
  const year = Number(sortKey.slice(0, 4));
  return Number.isFinite(year) ? year : null;
}

function getCurrentYearRange(periods: any[]) {
  if (!periods.length) return { startIndex: 0, endIndex: 0 };

  const nowYear = new Date().getFullYear();

  const indices = periods
    .map((period, index) => ({
      index,
      year: getYearFromSortKey(period.sortKey),
    }))
    .filter((item) => item.year === nowYear)
    .map((item) => item.index);

  if (indices.length === 0) {
    return {
      startIndex: Math.max(0, periods.length - 1),
      endIndex: Math.max(0, periods.length - 1),
    };
  }

  return {
    startIndex: indices[0],
    endIndex: indices[indices.length - 1],
  };
}

function shortenLabel(label: string) {
  const trimmed = (label || '').trim();
  if (!trimmed) return '';

  if (trimmed.length <= 8) return trimmed;
  return trimmed.slice(0, 8);
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

  const rotate = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '90deg'],
  });

  return (
    <Animated.Text style={{ fontSize: 18, color, transform: [{ rotate }] }}>
      ›
    </Animated.Text>
  );
}

function Collapsible({ open, children }: { open: boolean; children: React.ReactNode }) {
  const [contentHeight, setContentHeight] = useState(0);
  const animatedHeight = useRef(new Animated.Value(0)).current;
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

  return (
    <View>
      <View
        style={{ position: 'absolute', left: 0, right: 0, opacity: 0, zIndex: -1 }}
        pointerEvents="none"
        onLayout={(e) => {
          const nextHeight = e.nativeEvent.layout.height;
          if (nextHeight !== contentHeight) {
            setContentHeight(nextHeight);
            if (open) animatedHeight.setValue(nextHeight);
          }
        }}
      >
        {children}
      </View>

      <Animated.View
        style={{
          height: animatedHeight,
          opacity: animatedOpacity,
          overflow: 'hidden',
        }}
      >
        <View>{children}</View>
      </Animated.View>
    </View>
  );
}

function MiniBarChart({
  data,
  theme,
  signed = false,
  onPointPress,
}: {
  data: ChartPoint[];
  theme: any;
  signed?: boolean;
  onPointPress?: (point: ChartPoint) => void;
}) {
  const [pressedId, setPressedId] = useState<string | null>(null);

  if (!data.length) return null;

  const maxAbsValue = Math.max(...data.map((item) => Math.abs(item.value)), 1);
  const barWidth = 64;
  const chartWidth = Math.max(data.length * barWidth, 320);

  const handleBarPress = async (item: ChartPoint) => {
    setPressedId(item.id);

    try {
      await Haptics.selectionAsync();
    } catch { }

    setTimeout(() => {
      onPointPress?.(item);
      setPressedId((current) => (current === item.id ? null : current));
    }, 110);
  };

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingTop: 80, paddingRight: 8, paddingBottom: 80 }}
    >
      <View style={[styles.chartWrap, { width: chartWidth }]}>
        <View style={styles.chartBarsRow}>
          {data.map((item) => {
            const ratio = Math.abs(item.value) / maxAbsValue;
            const height = Math.max(14, ratio * 120);
            const isNegative = signed && item.value < 0;
            const isPressed = pressedId === item.id;

            return (
              <Pressable
                key={item.id}
                style={({ pressed }) => [
                  styles.chartBarCol,
                  (pressed || isPressed) && {
                    transform: [{ scale: 0.96 }],
                    opacity: 0.92,
                  },
                ]}
                onPress={() => {
                  handleBarPress(item);
                }}
              >
                <Text
                  numberOfLines={1}
                  style={[
                    styles.chartValueLabel,
                    { color: isNegative ? theme.danger : theme.textMuted },
                  ]}
                >
                  {signed
                    ? formatSignedCurrency(item.value)
                    : formatCurrency(item.value)}
                </Text>

                <View style={styles.chartBarTrack}>
                  <View
                    style={[
                      styles.chartBarFill,
                      {
                        height,
                        backgroundColor: isNegative
                          ? theme.danger
                          : theme.accent,
                      },
                      isPressed && {
                        opacity: 0.9,
                      },
                    ]}
                  />
                </View>

                <Text
                  numberOfLines={1}
                  style={[styles.chartXAxisLabel, { color: theme.textMuted }]}
                >
                  {shortenLabel(item.label)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </ScrollView>
  );
}

function SummaryExpandableCard({
  label,
  value,
  averageText,
  open,
  onToggle,
  children,
  theme,
  valueColor,
}: {
  label: string;
  value: string;
  averageText: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  theme: any;
  valueColor?: string;
}) {
  return (
    <View
      style={[
        styles.summaryExpandableCard,
        {
          backgroundColor: theme.cardStrong,

          shadowColor: '#000',
          shadowOffset: { width: 0, height: 10 },
          shadowOpacity: theme.isDark ? 0.5 : 0.15,
          shadowRadius: 18,
          elevation: 8,
        },
      ]}
    >
      <Pressable onPress={onToggle} style={styles.summaryExpandableHeader}>
        <View style={{ flex: 1, marginRight: 12 }}>
          <Text style={[styles.summaryLabel, { color: theme.textMuted }]}>{label}</Text>
          <Text style={[styles.summaryValue, { color: valueColor ?? theme.text }]}>{value}</Text>
          <Text style={[styles.summaryHint, { color: theme.textMuted }]}>
            Snitt: {averageText}
          </Text>
        </View>
        <Chevron open={open} color={theme.textMuted} />
      </Pressable>

      <Collapsible open={open}>
        <View style={{ paddingTop: 12 }}>{children}</View>
      </Collapsible>
    </View>
  );
}

export default function ExploreScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const appContext = useAppContext() as any;
  const router = useRouter();
  const appGradient: readonly [string, string, string, string] = isDark
    ? ['#071821', '#093641', '#093031', '#0c2420']
    : ['#F7FBFA', '#EEF7F5', '#E5F3EF', '#D9EEE8'];


  const periods = useMemo(
    () =>
      (Array.isArray(appContext?.periods) ? appContext.periods : []).slice().sort((a: any, b: any) =>
        (a.sortKey || '').localeCompare(b.sortKey || ''),
      ),
    [appContext],
  );

  const openPeriodFromChart = (periodId?: string) => {
    if (!periodId) return;

    appContext.setSelectedPeriodId(periodId);

    setTimeout(() => {
      router.push('/');
    }, 120);
  };

  const rangeOptions = useMemo(() => getRangeOptions(periods), [periods]);

  const [startIndex, setStartIndex] = useState(0);
  const [endIndex, setEndIndex] = useState(0);
  const [includeOneTimeExpenses, setIncludeOneTimeExpenses] = useState(true);
  const [pickerMode, setPickerMode] = useState<PickerMode>('start');
  const [showRangeEditor, setShowRangeEditor] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [openMetric, setOpenMetric] = useState<MetricKey | null>(null);

  useEffect(() => {
    if (!periods.length) return;
    const currentYearRange = getCurrentYearRange(periods);
    setStartIndex(currentYearRange.startIndex);
    setEndIndex(currentYearRange.endIndex);
  }, [periods]);

  const defaultRange = useMemo(
    () => (!periods.length ? { startIndex: 0, endIndex: 0 } : getCurrentYearRange(periods)),
    [periods],
  );

  const selectedPeriods = useMemo(
    () => (periods.length ? getPeriodsInRange(periods, startIndex, endIndex) : []),
    [periods, startIndex, endIndex],
  );

  const analytics = useMemo(
    () =>
      calculateOverviewAnalyticsFromRange(periods, startIndex, endIndex, {
        includeOneTimeExpenses,
        topExpensesLimit: 10,
      }),
    [periods, startIndex, endIndex, includeOneTimeExpenses],
  );

  const categoryDetailsMap = useMemo(() => {
    const map = new Map<string, CategoryDetailItem[]>();

    analytics.categoryTotals.forEach((categoryItem: any) => {
      const tempMap = new Map<string, CategoryDetailItem>();

      selectedPeriods.forEach((period: any) => {
        (period.bills || []).forEach((bill: any) => {
          const category = bill.category?.trim() || 'Övrigt';
          if (category !== categoryItem.category) return;

          const name = bill.name?.trim() || 'Okänd post';
          const key = `bill:${name.toLowerCase()}`;
          const existing = tempMap.get(key);

          if (existing) {
            existing.total += Number(bill.amount) || 0;
            existing.count += 1;
          } else {
            tempMap.set(key, {
              name,
              total: Number(bill.amount) || 0,
              count: 1,
              type: 'bill',
            });
          }
        });

        (period.budgetEntries || []).forEach((entry: any) => {
          const category = entry.category?.trim() || 'Övrigt';
          if (category !== categoryItem.category) return;

          const name = entry.name?.trim() || 'Okänd post';
          const key = `budget:${name.toLowerCase()}`;
          const existing = tempMap.get(key);

          if (existing) {
            existing.total += Number(entry.amount) || 0;
            existing.count += 1;
          } else {
            tempMap.set(key, {
              name,
              total: Number(entry.amount) || 0,
              count: 1,
              type: 'budget',
            });
          }
        });
      });

      map.set(
        categoryItem.category,
        Array.from(tempMap.values()).sort((a, b) => b.total - a.total),
      );
    });

    return map;
  }, [analytics.categoryTotals, selectedPeriods]);

  const metricData = useMemo(() => {
    const income: ChartPoint[] = [];
    const bills: ChartPoint[] = [];
    const budget: ChartPoint[] = [];
    const afterBills: ChartPoint[] = [];
    const afterBudget: ChartPoint[] = [];

    selectedPeriods.forEach((period: any, index: number) => {
      const totalIncome = (period.incomeEntries || []).reduce(
        (sum: number, entry: any) => sum + (Number(entry.amount) || 0),
        0,
      );
      const totalBills = (period.bills || []).reduce(
        (sum: number, bill: any) => sum + (Number(bill.amount) || 0),
        0,
      );
      const totalBudget = (period.budgetEntries || []).reduce(
        (sum: number, entry: any) => sum + (Number(entry.amount) || 0),
        0,
      );

      const label = period.label?.trim() || `Period ${index + 1}`;

      income.push({ id: `${period.id}-income`, label, value: totalIncome, periodId: period.id });
      bills.push({ id: `${period.id}-bills`, label, value: totalBills, periodId: period.id });
      budget.push({ id: `${period.id}-budget`, label, value: totalBudget, periodId: period.id });
      afterBills.push({
        id: `${period.id}-after-bills`,
        periodId: period.id,
        label,
        value: totalIncome - totalBills,
      });
      afterBudget.push({
        id: `${period.id}-after-budget`,
        periodId: period.id,
        label,
        value: totalIncome - totalBills - totalBudget,
      });
    });

    return { income, bills, budget, afterBills, afterBudget };
  }, [selectedPeriods]);

  const categoryChartData = useMemo<ChartPoint[]>(
    () =>
      analytics.categoryTotals.map((item: any, index: number) => ({
        id: `${item.category}-${index}`,
        label: item.category,
        value: item.total,
      })),
    [analytics.categoryTotals],
  );

  const averages = useMemo(() => {
    const average = (values: number[]) =>
      values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;

    return {
      income: average(metricData.income.map((item) => item.value)),
      bills: average(metricData.bills.map((item) => item.value)),
      budget: average(metricData.budget.map((item) => item.value)),
      afterBills: average(metricData.afterBills.map((item) => item.value)),
      afterBudget: average(metricData.afterBudget.map((item) => item.value)),
      categories: average(categoryChartData.map((item) => item.value)),
    };
  }, [metricData, categoryChartData]);

  const selectedStartLabel = rangeOptions[startIndex]?.label ?? 'Ingen startperiod';
  const selectedEndLabel = rangeOptions[endIndex]?.label ?? 'Ingen slutperiod';
  const isCurrentYear =
    startIndex === defaultRange.startIndex && endIndex === defaultRange.endIndex;
  const titleText = isCurrentYear ? 'Hittills i år' : getDisplayRangeLabel(selectedPeriods as any);

  const applyRangeSelection = (index: number) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);

    if (pickerMode === 'start') {
      setStartIndex(index);
      if (index > endIndex) setEndIndex(index);
    } else {
      setEndIndex(index);
      if (index < startIndex) setStartIndex(index);
    }
  };

  const resetToCurrentYear = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setStartIndex(defaultRange.startIndex);
    setEndIndex(defaultRange.endIndex);
    setShowRangeEditor(false);
  };

  const toggleCategory = (category: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setSelectedCategory((prev) => (prev === category ? null : category));
  };

  const toggleMetric = (metric: MetricKey) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpenMetric((prev) => (prev === metric ? null : metric));
  };

  const theme = {
    isDark,
    bg: isDark ? '#0F1115' : '#F3F5F8',
    card: isDark ? '#171A21' : '#F7F9FC',
    cardStrong: isDark ? '#1D212B' : '#FFFFFF',
    text: isDark ? '#F4F7FB' : '#141922',
    textMuted: isDark ? '#AAB3C2' : '#667085',
    border: isDark ? '#2A3140' : '#D9E0EA',
    accent: '#4CAF50',
    accentSoft: isDark ? '#193322' : '#E7F6EA',
    danger: '#D9534F',
    shadow: isDark ? 'transparent' : '#AAB7C633',
    chipActive: isDark ? '#253247' : '#E8F0FB',
    subCard: isDark ? '#141821' : '#F8FAFD',
  };

  return (
    <TabFadeWrapper>
      <LinearGradient
        colors={appGradient}
        start={{ x: 0.15, y: 0 }}
        end={{ x: 0.85, y: 1 }}
        style={{ flex: 1 }}
      >
        <SafeAreaView
          edges={['left', 'right']}
          style={{ flex: 1, backgroundColor: 'transparent' }}
        >
          <ScrollView
            style={{ flex: 1, backgroundColor: 'transparent' }}
            contentContainerStyle={{
              ...styles.content,
              paddingTop: 90, paddingBottom: 80,
            }}
            showsVerticalScrollIndicator={false}
          >
            <View
              style={[
                styles.heroCard,
                {
                  backgroundColor: theme.cardStrong,

                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 14 },
                  shadowOpacity: isDark ? 0.6 : 0.2,
                  shadowRadius: 25,
                  elevation: 10,
                },
              ]}
            >
              <Text style={[styles.eyebrow, { color: theme.textMuted }]}>Översikt</Text>
              <Text style={[styles.heroTitle, { color: theme.text }]}>{titleText}</Text>
              <Text style={[styles.heroSubtitle, { color: theme.textMuted }]}>
                {selectedPeriods.length} perioder valda
              </Text>

              <View style={styles.compactActionsRow}>
                <Pressable
                  onPress={() => setShowRangeEditor((prev) => !prev)}
                  style={[
                    styles.compactButton,
                    {
                      backgroundColor: showRangeEditor ? theme.chipActive : theme.card,
                      borderColor: theme.border,
                    },
                  ]}
                >
                  <Text style={[styles.compactButtonText, { color: theme.text }]}>
                    {showRangeEditor ? 'Dölj periodval' : 'Ändra period'}
                  </Text>
                </Pressable>

                {!isCurrentYear && (
                  <Pressable
                    onPress={resetToCurrentYear}
                    style={[
                      styles.compactButton,
                      { backgroundColor: theme.card, borderColor: theme.border },
                    ]}
                  >
                    <Text style={[styles.compactButtonText, { color: theme.text }]}>
                      Hittills i år
                    </Text>
                  </Pressable>
                )}
              </View>

              {showRangeEditor && (
                <View
                  style={[
                    styles.rangeEditorCard,
                    { backgroundColor: theme.card, borderColor: theme.border },
                  ]}
                >
                  <View style={styles.rangeRow}>
                    <Pressable
                      onPress={() => setPickerMode('start')}
                      style={[
                        styles.rangeButton,
                        {
                          backgroundColor:
                            pickerMode === 'start' ? theme.chipActive : theme.cardStrong,
                          borderColor: theme.border,
                        },
                      ]}
                    >
                      <Text style={[styles.rangeLabel, { color: theme.textMuted }]}>Från</Text>
                      <Text style={[styles.rangeValue, { color: theme.text }]}>
                        {selectedStartLabel}
                      </Text>
                    </Pressable>

                    <Pressable
                      onPress={() => setPickerMode('end')}
                      style={[
                        styles.rangeButton,
                        {
                          backgroundColor:
                            pickerMode === 'end' ? theme.chipActive : theme.cardStrong,
                          borderColor: theme.border,
                        },
                      ]}
                    >
                      <Text style={[styles.rangeLabel, { color: theme.textMuted }]}>Till</Text>
                      <Text style={[styles.rangeValue, { color: theme.text }]}>
                        {selectedEndLabel}
                      </Text>
                    </Pressable>
                  </View>

                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.monthChips}
                  >
                    {rangeOptions.map((option, index) => {
                      const isSelected =
                        pickerMode === 'start' ? index === startIndex : index === endIndex;

                      return (
                        <Pressable
                          key={option.id || `${option.label}-${index}`}
                          onPress={() => applyRangeSelection(index)}
                          style={[
                            styles.monthChip,
                            {
                              backgroundColor: isSelected ? theme.chipActive : theme.cardStrong,
                              borderColor: theme.border,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.monthChipText,
                              { color: isSelected ? theme.text : theme.textMuted },
                            ]}
                          >
                            {option.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                </View>
              )}
            </View>

            <View style={styles.cardsGrid}>
              <SummaryExpandableCard
                label="Total inkomst"
                value={formatCurrency(analytics.totalIncome)}
                averageText={formatCurrency(averages.income)}
                open={openMetric === 'income'}
                onToggle={() => toggleMetric('income')}
                theme={theme}
              >
                <MiniBarChart
                  data={metricData.income}
                  theme={theme}
                  onPointPress={(item) => openPeriodFromChart(item.periodId)}
                />
              </SummaryExpandableCard>

              <SummaryExpandableCard
                label="Totala räkningar"
                value={formatCurrency(analytics.totalBills)}
                averageText={formatCurrency(averages.bills)}
                open={openMetric === 'bills'}
                onToggle={() => toggleMetric('bills')}
                theme={theme}
              >
                <MiniBarChart
                  data={metricData.income}
                  theme={theme}
                  onPointPress={(item) => openPeriodFromChart(item.periodId)}
                />
              </SummaryExpandableCard>

              <SummaryExpandableCard
                label="Total budget"
                value={formatCurrency(analytics.totalBudget)}
                averageText={formatCurrency(averages.budget)}
                open={openMetric === 'budget'}
                onToggle={() => toggleMetric('budget')}
                theme={theme}
              >
                <MiniBarChart
                  data={metricData.budget}
                  theme={theme}
                  onPointPress={(item) => openPeriodFromChart(item.periodId)}
                />
              </SummaryExpandableCard>

              <SummaryExpandableCard
                label="Efter räkningar"
                value={formatSignedCurrency(analytics.afterBills)}
                averageText={formatSignedCurrency(averages.afterBills)}
                valueColor={analytics.afterBills < 0 ? theme.danger : theme.text}
                open={openMetric === 'afterBills'}
                onToggle={() => toggleMetric('afterBills')}
                theme={theme}
              >
                <MiniBarChart
                  data={metricData.afterBills}
                  theme={theme}
                  onPointPress={(item) => openPeriodFromChart(item.periodId)}
                />
              </SummaryExpandableCard>

              <SummaryExpandableCard
                label="Efter budget"
                value={formatSignedCurrency(analytics.afterBudget)}
                averageText={formatSignedCurrency(averages.afterBudget)}
                valueColor={analytics.afterBudget < 0 ? theme.danger : theme.text}
                open={openMetric === 'afterBudget'}
                onToggle={() => toggleMetric('afterBudget')}
                theme={theme}
              >
                <MiniBarChart
                  data={metricData.afterBudget}
                  theme={theme}
                  onPointPress={(item) => openPeriodFromChart(item.periodId)}
                />
              </SummaryExpandableCard>

              <SummaryExpandableCard
                label="Kategorier"
                value={formatCurrency(
                  analytics.categoryTotals.reduce((sum: number, item: any) => sum + item.total, 0),
                )}
                averageText={formatCurrency(averages.categories)}
                open={openMetric === 'categories'}
                onToggle={() => toggleMetric('categories')}
                theme={theme}
              >
                <MiniBarChart data={categoryChartData} theme={theme} />
              </SummaryExpandableCard>
            </View>

            <SectionCard
              title="Största utgifter"
              theme={theme}
              rightContent={
                <Pressable
                  onPress={() => setIncludeOneTimeExpenses((prev) => !prev)}
                  style={[
                    styles.miniToggle,
                    {
                      backgroundColor: includeOneTimeExpenses ? theme.accentSoft : theme.card,
                      borderColor: includeOneTimeExpenses ? theme.accent : theme.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.miniToggleText,
                      { color: includeOneTimeExpenses ? theme.accent : theme.textMuted },
                    ]}
                  >
                    Engång: {includeOneTimeExpenses ? 'På' : 'Av'}
                  </Text>
                </Pressable>
              }
            >
              {analytics.topExpenses.length === 0 ? (
                <EmptyState text="Inga utgifter hittades i vald period." theme={theme} />
              ) : (
                analytics.topExpenses.map((item: any, index: number) => (
                  <View
                    key={`${item.type}-${item.name}-${index}`}
                    style={[styles.listRow, { borderBottomColor: theme.border }]}
                  >
                    <View style={styles.listLeft}>
                      <Text style={[styles.listIndex, { color: theme.textMuted }]}>{index + 1}</Text>
                      <View style={styles.listTextWrap}>
                        <Text style={[styles.listTitle, { color: theme.text }]}>{item.name}</Text>
                        <Text style={[styles.listSubtitle, { color: theme.textMuted }]}>
                          {item.type === 'bill' ? 'Räkning' : 'Budget'}
                          {item.category ? ` • ${item.category}` : ''}
                          {` • ${item.count} st`}
                        </Text>
                      </View>
                    </View>
                    <Text style={[styles.listAmount, { color: theme.text }]}>
                      {formatCurrency(item.total)}
                    </Text>
                  </View>
                ))
              )}
            </SectionCard>

            <SectionCard
              title="Kategoriöversikt"
              theme={theme}
              subtitle="Tryck på en kategori för att se vad som ingår."
            >
              {analytics.categoryTotals.length === 0 ? (
                <EmptyState text="Inga kategorier hittades i vald period." theme={theme} />
              ) : (
                analytics.categoryTotals.map((item: any, index: number) => {
                  const isActive = selectedCategory === item.category;
                  const details = categoryDetailsMap.get(item.category) ?? [];

                  return (
                    <View
                      key={`${item.category}-${index}`}
                      style={[styles.categoryBlock, { borderBottomColor: theme.border }]}
                    >
                      <Pressable
                        onPress={() => toggleCategory(item.category)}
                        style={[
                          styles.categoryRow,
                          { backgroundColor: isActive ? theme.chipActive : 'transparent' },
                        ]}
                      >
                        <Text style={[styles.categoryName, { color: theme.text }]}>
                          {item.category}
                        </Text>
                        <View style={styles.categoryRight}>
                          <Text style={[styles.categoryAmount, { color: theme.text }]}>
                            {formatCurrency(item.total)}
                          </Text>
                          <Text style={[styles.categoryChevron, { color: theme.textMuted }]}>
                            {isActive ? '−' : '+'}
                          </Text>
                        </View>
                      </Pressable>

                      {isActive && (
                        <View
                          style={[
                            styles.categoryExpanded,
                            { backgroundColor: theme.subCard, borderColor: theme.border },
                          ]}
                        >
                          {details.length === 0 ? (
                            <Text style={[styles.categoryEmptyText, { color: theme.textMuted }]}>
                              Inga poster hittades i denna kategori.
                            </Text>
                          ) : (
                            details.map((detail, detailIndex) => (
                              <View
                                key={`${detail.type}-${detail.name}-${detailIndex}`}
                                style={[
                                  styles.categoryDetailRow,
                                  { borderBottomColor: theme.border },
                                ]}
                              >
                                <View style={styles.listTextWrap}>
                                  <Text style={[styles.listTitle, { color: theme.text }]}>
                                    {detail.name}
                                  </Text>
                                  <Text style={[styles.listSubtitle, { color: theme.textMuted }]}>
                                    {detail.type === 'bill' ? 'Räkning' : 'Budget'} • {detail.count} st
                                  </Text>
                                </View>
                                <Text style={[styles.listAmount, { color: theme.text }]}>
                                  {formatCurrency(detail.total)}
                                </Text>
                              </View>
                            ))
                          )}
                        </View>
                      )}
                    </View>
                  );
                })
              )}
            </SectionCard>
          </ScrollView>
        </SafeAreaView>
      </LinearGradient>
    </TabFadeWrapper>
  );
}

function SectionCard({
  title,
  children,
  theme,
  subtitle,
  rightContent,
}: {
  title: string;
  children: React.ReactNode;
  theme: any;
  subtitle?: string;
  rightContent?: React.ReactNode;
}) {
  return (
    <View
      style={[
        styles.sectionCard,
        {
          backgroundColor: theme.cardStrong,

          shadowColor: '#000',
          shadowOffset: { width: 0, height: 12 },
          shadowOpacity: theme.isDark ? 0.5 : 0.18,
          shadowRadius: 20,
          elevation: 10,
        },
      ]}
    >
      <View style={styles.sectionHeader}>
        <View style={styles.sectionHeaderText}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>{title}</Text>
          {subtitle ? (
            <Text style={[styles.sectionSubtitle, { color: theme.textMuted }]}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {rightContent}
      </View>
      {children}
    </View>
  );
}

function EmptyState({ text, theme }: { text: string; theme: any }) {
  return (
    <View style={styles.emptyWrap}>
      <Text style={[styles.emptyText, { color: theme.textMuted }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 16, paddingBottom: 32, gap: 16 },

  heroCard: {
    borderRadius: 26,
    padding: 20,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  heroTitle: { fontSize: 24, fontWeight: '800', marginBottom: 6 },
  heroSubtitle: { fontSize: 14, lineHeight: 20, marginBottom: 14 },

  compactActionsRow: { flexDirection: 'row', gap: 10 },
  compactButton: {
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  compactButtonText: { fontSize: 13, fontWeight: '700' },

  rangeEditorCard: {
    marginTop: 14,
    borderWidth: 1,
    borderRadius: 18,
    padding: 12,
    gap: 12,
  },
  rangeRow: { flexDirection: 'row', gap: 10 },
  rangeButton: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  rangeLabel: { fontSize: 11, marginBottom: 4 },
  rangeValue: { fontSize: 14, fontWeight: '700' },

  monthChips: { paddingRight: 12, gap: 8 },
  monthChip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
  },
  monthChipText: { fontSize: 13, fontWeight: '600' },

  cardsGrid: {
    gap: 12,
  },
  summaryExpandableCard: {
    borderRadius: 20,
    padding: 14,
  },
  summaryExpandableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  summaryLabel: { fontSize: 12, fontWeight: '600', marginBottom: 6 },
  summaryValue: { fontSize: 22, fontWeight: '800', marginBottom: 4 },
  summaryHint: { fontSize: 12, fontWeight: '600' },

  sectionCard: {
    borderRadius: 24,
    padding: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 12,
  },
  sectionHeaderText: { flex: 1 },
  sectionTitle: { fontSize: 18, fontWeight: '800' },
  sectionSubtitle: { marginTop: 4, fontSize: 12, lineHeight: 18 },

  chartWrap: {
    paddingTop: 4,
    paddingBottom: 4,
  },
  chartBarsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    minHeight: 180,
  },
  chartBarCol: {
    width: 56,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  chartValueLabel: {
    fontSize: 10,
    fontWeight: '700',
    marginBottom: 8,
    width: 56,
    textAlign: 'center',
  },
  chartBarTrack: {
    width: '100%',
    height: 126,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  chartBarFill: {
    width: '82%',
    borderRadius: 10,
    minHeight: 14,
  },
  chartXAxisLabel: {
    fontSize: 11,
    marginTop: 8,
    fontWeight: '600',
    textAlign: 'center',
    width: 56,
  },

  miniToggle: {
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  miniToggleText: { fontSize: 12, fontWeight: '700' },

  listRow: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  listLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  listIndex: { width: 22, fontSize: 14, fontWeight: '700' },
  listTextWrap: { flex: 1 },
  listTitle: { fontSize: 15, fontWeight: '700', marginBottom: 3 },
  listSubtitle: { fontSize: 12 },
  listAmount: { fontSize: 15, fontWeight: '800' },

  categoryBlock: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 2,
  },
  categoryRow: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRadius: 14,
  },
  categoryName: { flex: 1, fontSize: 15, fontWeight: '700' },
  categoryRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  categoryAmount: { fontSize: 15, fontWeight: '800' },
  categoryChevron: {
    width: 16,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '700',
  },
  categoryExpanded: {
    marginTop: 8,
    marginBottom: 10,
    marginHorizontal: 6,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  categoryDetailRow: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  categoryEmptyText: { fontSize: 13, lineHeight: 18, paddingVertical: 10 },

  emptyWrap: { paddingVertical: 12 },
  emptyText: { fontSize: 14, lineHeight: 20 },
});