import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Modal,
  Animated,
  Easing,
  Keyboard,
  LayoutChangeEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppContext } from '../../context/AppContext';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import TabFadeWrapper from '@/components/TabFadeWrapper';


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
    const height = event.nativeEvent.layout.height;
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
        {children}
      </View>
      <Animated.View style={{ height: animatedHeight, opacity: animatedOpacity, overflow: 'hidden' }}>
        <View>{children}</View>
      </Animated.View>
    </View>
  );
}

function Chip({
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
    <Pressable
      onPress={onPress}
      style={{
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 999,
        backgroundColor: active ? colors.chipActiveBg : colors.chipBg,
        marginRight: 8,
        marginBottom: 8,
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
  );
}

export default function HouseholdScreen() {
  const isDark = useColorScheme() === 'dark';

  const {
    meName,
    partnerName,
    setMeName,
    setPartnerName,
    categories = [],
    addCategory,
    removeCategory,
    resetCategories,
    calculationMode,
    setCalculationMode,
    mySharedPercent,
    partnerSharedPercent,
    setMySharedPercent,
    householdId,
    householdInviteCode,
    createHousehold,
    joinHousehold,
    leaveHousehold,
    forceSyncHousehold,
    periods,
    restorePeriod,
    authUserId,
    authEmail,
    sendOtpLogin,
    verifyOtpLogin,
    signOutAuth,
  } = useAppContext();
  const [joinModalVisible, setJoinModalVisible] = useState(false);
  const [inviteCodeInput, setInviteCodeInput] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [showCategories, setShowCategories] = useState(false);
  const [showCalculationSettings, setShowCalculationSettings] = useState(true);
  const [showHouseholdSection, setShowHouseholdSection] = useState(false);
  const [percentInput, setPercentInput] = useState(String(mySharedPercent));
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [authEmailInput, setAuthEmailInput] = useState('');
  const [otpCodeInput, setOtpCodeInput] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const archivedPeriods = periods
    .filter((period) => period.archived)
    .sort((a, b) => b.sortKey.localeCompare(a.sortKey));

  useEffect(() => {
    setPercentInput(String(mySharedPercent));
  }, [mySharedPercent]);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, (e) => {
      setKeyboardHeight(e.endCoordinates?.height ?? 0);
    });

    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const colors = {
    background: isDark ? '#0f1115' : '#f6f7f9',
    card: isDark ? '#1a1d24' : '#ffffff',
    text: isDark ? '#f4f5f7' : '#111111',
    muted: isDark ? '#9aa3af' : '#666666',
    placeholder: isDark ? '#7b8591' : '#999999',
    inputBg: isDark ? '#12151b' : '#f6f7f9',
    border: isDark ? '#2f3642' : '#e7e9ee',
    chipBg: isDark ? '#252a33' : '#f1f3f5',
    chipText: isDark ? '#d7dce2' : '#444444',
    chipActiveBg: isDark ? '#f4f5f7' : '#111111',
    chipActiveText: isDark ? '#111111' : '#ffffff',
    buttonPrimaryBg: isDark ? '#f4f5f7' : '#111111',
    buttonPrimaryText: isDark ? '#111111' : '#ffffff',
    buttonSecondaryBg: isDark ? '#252a33' : '#f1f3f5',
    buttonSecondaryText: isDark ? '#f4f5f7' : '#333333',
    dangerBg: isDark ? '#331c1c' : '#fdecec',
    dangerText: '#c0392b',
    infoBg: isDark ? '#16263f' : '#eaf2ff',
    infoText: isDark ? '#d9e7ff' : '#163b77',
  };

  async function handleCreateHousehold() {

    if (!authUserId) {
      Alert.alert('Logga in först', 'Du behöver logga in med e-post först.');
      return;
    }

    const code = await createHousehold();

    if (code) {
      Alert.alert('Hushåll skapat', `Kod: ${code}`);
    }
  }


  async function handleJoinHousehold() {

    if (!authUserId) {
      Alert.alert('Logga in först', 'Du behöver logga in med e-post först.');
      return;
    }

    const ok = await joinHousehold(inviteCodeInput);

    if (ok) {
      setJoinModalVisible(false);
      setInviteCodeInput('');
      Alert.alert('Ansluten', 'Du har gått med i hushållet.');
    }
  }

  function handleShowHouseholdCode() {
    if (!householdInviteCode) {
      Alert.alert('Ingen hushållskod', 'Det finns ingen kod ännu.');
      return;
    }

    Alert.alert(
      'Hushållskod',
      householdInviteCode,
      [
        {
          text: 'Kopiera',
          onPress: async () => {
            await Clipboard.setStringAsync(householdInviteCode);
            Alert.alert('Kopierad', 'Hushållskoden är kopierad.');
          },
        },
        {
          text: 'Stäng',
          style: 'cancel',
        },
      ]
    );
  }

  async function handleManualSync() {
    console.log("TRYING SYNC…");
    const ok = await forceSyncHousehold();
    console.log("SYNC RESULT:", ok);

    if (ok) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSyncStatus('Synkad');
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setSyncStatus('Kunde inte synka');
    }

    setTimeout(() => {
      setSyncStatus(null);
    }, 2000);
  }

  async function handleCopyHouseholdCode() {
    if (!householdInviteCode) {
      Alert.alert('Ingen hushållskod', 'Det finns ingen kod att kopiera ännu.');
      return;
    }

    await Clipboard.setStringAsync(householdInviteCode);
    Alert.alert('Kopierad', 'Hushållskoden är kopierad.');
  }

  function handleLeaveHousehold() {
    Alert.alert(
      'Gå ur hushåll',
      'Är du säker på att du vill lämna hushållet?',
      [
        { text: 'Avbryt', style: 'cancel' },
        {
          text: 'Gå ur',
          style: 'destructive',
          onPress: async () => {
            await leaveHousehold();
          },
        },
      ],
    );
  }

  function handleAddCategory() {
    const ok = addCategory(newCategory);

    if (!ok) {
      Alert.alert('Kunde inte lägga till kategori', 'Kategorin är tom eller finns redan.');
      return;
    }

    setNewCategory('');
    setShowCategories(true);
  }

  function handleDeleteCategory(category: string) {
    Alert.alert(
      'Ta bort kategori',
      `Vill du ta bort "${category}" från valbara kategorier?`,
      [
        { text: 'Avbryt', style: 'cancel' },
        {
          text: 'Ta bort',
          style: 'destructive',
          onPress: () => removeCategory(category),
        },
      ],
    );
  }

  function handleResetCategories() {
    Alert.alert(
      'Återställ kategorier',
      'Vill du återställa standardkategorierna?',
      [
        { text: 'Avbryt', style: 'cancel' },
        {
          text: 'Återställ',
          onPress: () => resetCategories(),
        },
      ],
    );
  }

  function handleSavePercent() {
    const parsed = Number(percentInput.replace(',', '.'));
    if (Number.isNaN(parsed) || parsed < 0 || parsed > 100) {
      Alert.alert('Ogiltig procent', 'Fyll i ett värde mellan 0 och 100.');
      return;
    }
    setMySharedPercent(parsed);
    Keyboard.dismiss();
  }

  function getModeLabel() {
    if (calculationMode === 'equal_leftover') return 'Lika kvar';
    return 'Tracker';
  }

  return (
    <TabFadeWrapper>
      <SafeAreaView edges={['left', 'right']} style={{ flex: 1, backgroundColor: colors.background }}>
        <ScrollView
          style={{ flex: 1 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            padding: 16,
            paddingTop: 90,
            paddingBottom: keyboardHeight > 0 ? keyboardHeight + 1 : 70,
          }}
        >
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.eyebrow, { color: colors.muted }]}>Hushåll</Text>
            <Text style={[styles.title, { color: colors.text }]}>Inställningar</Text>
            <Text style={[styles.subtitle, { color: colors.muted }]}>
              Hantera namn, kategorier och hur hushållet ska räknas.
            </Text>
          </View>

          {householdId ? (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Medlemmar</Text>

              <Text style={[styles.inputLabel, { color: colors.muted }]}>Ditt namn</Text>
              <TextInput
                value={meName}
                onChangeText={setMeName}
                placeholder="Ditt namn"
                placeholderTextColor={colors.placeholder}
                style={[styles.input, { backgroundColor: colors.inputBg, color: colors.text, borderColor: colors.border }]}
              />

              <Text style={[styles.inputLabel, { color: colors.muted }]}>Partners namn</Text>
              <TextInput
                value={partnerName}
                onChangeText={setPartnerName}
                placeholder="Partners namn"
                placeholderTextColor={colors.placeholder}
                style={[styles.input, { backgroundColor: colors.inputBg, color: colors.text, borderColor: colors.border }]}
              />
            </View>
          ) : null}

          {householdId ? (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Pressable onPress={() => setShowCalculationSettings((prev) => !prev)} style={styles.dropdownHeader}>
                <View style={{ flex: 1, marginRight: 12 }}>
                  <Text style={[styles.sectionTitle, { color: colors.text }]}>Beräkningsmodell</Text>
                  <Text style={[styles.dropdownSubtitle, { color: colors.muted }]}>
                    {getModeLabel()}
                  </Text>
                </View>
                <Chevron open={showCalculationSettings} color={colors.muted} />
              </Pressable>

              <CollapsibleSection open={showCalculationSettings}>
                <View style={{ marginTop: 12 }}>
                  <View style={[styles.infoBox, { backgroundColor: colors.infoBg }]}>
                    <Text style={[styles.infoText, { color: colors.infoText }]}>
                      Tracker visar bara hushållets ekonomi utan att räkna ut någon överföring.
                      "Lika kvar" räknar ut så att båda får lika mycket kvar efter räkningar och budget.
                    </Text>
                  </View>

                  <Text style={[styles.inputLabel, { color: colors.muted }]}>Modell</Text>
                  <View style={styles.rowWrap}>
                    <Chip
                      label="Tracker"
                      active={calculationMode !== 'equal_leftover'}
                      onPress={() => setCalculationMode('equal')}
                      colors={colors}
                    />
                    <Chip
                      label="Lika kvar"
                      active={calculationMode === 'equal_leftover'}
                      onPress={() => setCalculationMode('equal_leftover')}
                      colors={colors}
                    />
                  </View>
                </View>
              </CollapsibleSection>
            </View>
          ) : null}

          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Pressable onPress={() => setShowCategories((prev) => !prev)} style={styles.dropdownHeader}>
              <View style={{ flex: 1, marginRight: 12 }}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Kategorier</Text>
                <Text style={[styles.dropdownSubtitle, { color: colors.muted }]}>
                  {categories.length} valbara kategorier
                </Text>
              </View>
              <Chevron open={showCategories} color={colors.muted} />
            </Pressable>

            <CollapsibleSection open={showCategories}>
              <View style={{ marginTop: 12 }}>
                <Text style={[styles.inputLabel, { color: colors.muted }]}>Lägg till kategori</Text>
                <TextInput
                  value={newCategory}
                  onChangeText={setNewCategory}
                  placeholder="Ex. Barn, Resor, Husdjur"
                  placeholderTextColor={colors.placeholder}
                  style={[styles.input, { backgroundColor: colors.inputBg, color: colors.text, borderColor: colors.border }]}
                />

                <View style={styles.actionRow}>
                  <Pressable onPress={handleAddCategory} style={[styles.primaryButton, { backgroundColor: colors.buttonPrimaryBg }]}>
                    <Text style={[styles.primaryButtonText, { color: colors.buttonPrimaryText }]}>Lägg till</Text>
                  </Pressable>

                  <Pressable onPress={handleResetCategories} style={[styles.secondaryButton, { backgroundColor: colors.buttonSecondaryBg }]}>
                    <Text style={[styles.secondaryButtonText, { color: colors.buttonSecondaryText }]}>Återställ</Text>
                  </Pressable>
                </View>

                <View style={{ marginTop: 8 }}>
                  {categories.map((category: string) => (
                    <View key={category} style={[styles.categoryRow, { borderBottomColor: colors.border }]}>
                      <Text style={[styles.categoryText, { color: colors.text }]}>{category}</Text>
                      <Pressable onPress={() => handleDeleteCategory(category)} style={[styles.deleteButton, { backgroundColor: colors.dangerBg }]}>
                        <Text style={[styles.deleteButtonText, { color: colors.dangerText }]}>Ta bort</Text>
                      </Pressable>
                    </View>
                  ))}
                </View>
              </View>
            </CollapsibleSection>
          </View>
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Pressable onPress={() => setShowHouseholdSection((prev) => !prev)} style={styles.dropdownHeader}>
              <View style={{ flex: 1, marginRight: 12 }}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Hushåll</Text>
                <Text style={[styles.dropdownSubtitle, { color: colors.muted }]}>
                  {householdId
                    ? 'Hushållet är länkat'
                    : authUserId
                      ? 'Skapa eller gå med i hushåll'
                      : 'Logga in för att länka hushåll'}
                </Text>
              </View>
              <Chevron open={showHouseholdSection} color={colors.muted} />
            </Pressable>

            <CollapsibleSection open={showHouseholdSection}>
              <View style={{ marginTop: 12 }}>
                {!authUserId ? (
                  <View>
                    <Text style={{ color: colors.muted, marginBottom: 14 }}>
                      Logga in med e-post för att skapa eller gå med i hushåll.
                    </Text>

                    <TextInput
                      value={authEmailInput}
                      onChangeText={setAuthEmailInput}
                      placeholder="E-post"
                      placeholderTextColor={colors.placeholder}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      style={{
                        backgroundColor: colors.inputBg,
                        borderRadius: 14,
                        paddingHorizontal: 14,
                        paddingVertical: 14,
                        fontSize: 16,
                        color: colors.text,
                        marginBottom: 12,
                      }}
                    />

                    {!otpSent ? (
                      <Pressable
                        onPress={async () => {
                          setAuthLoading(true);
                          const result = await sendOtpLogin(authEmailInput);
                          setAuthLoading(false);

                          if (!result.ok) {
                            Alert.alert('Fel', result.error ?? 'Kunde inte skicka kod.');
                            return;
                          }

                          setOtpSent(true);
                          Alert.alert('Kod skickad', 'Kolla din e-post för verifieringskoden.');
                        }}
                        style={{
                          backgroundColor: colors.buttonPrimaryBg,
                          borderRadius: 14,
                          paddingVertical: 14,
                          alignItems: 'center',
                        }}
                      >
                        <Text style={{ fontSize: 16, fontWeight: '600', color: colors.buttonPrimaryText }}>
                          {authLoading ? 'Skickar...' : 'Skicka kod'}
                        </Text>
                      </Pressable>
                    ) : (
                      <>
                        <TextInput
                          value={otpCodeInput}
                          onChangeText={setOtpCodeInput}
                          placeholder="Kod från e-post"
                          placeholderTextColor={colors.placeholder}
                          autoCapitalize="none"
                          style={{
                            backgroundColor: colors.inputBg,
                            borderRadius: 14,
                            paddingHorizontal: 14,
                            paddingVertical: 14,
                            fontSize: 16,
                            color: colors.text,
                            marginBottom: 12,
                          }}
                        />

                        <View style={{ flexDirection: 'row', gap: 10 }}>
                          <Pressable
                            onPress={async () => {
                              setAuthLoading(true);
                              const result = await verifyOtpLogin(authEmailInput, otpCodeInput);
                              setAuthLoading(false);

                              if (!result.ok) {
                                Alert.alert('Fel', result.error ?? 'Kunde inte verifiera koden.');
                                return;
                              }

                              setOtpSent(false);
                              setOtpCodeInput('');
                              Alert.alert('Inloggad', 'Du är nu inloggad.');
                            }}
                            style={{
                              flex: 1,
                              backgroundColor: colors.buttonPrimaryBg,
                              borderRadius: 14,
                              paddingVertical: 14,
                              alignItems: 'center',
                            }}
                          >
                            <Text style={{ fontSize: 16, fontWeight: '600', color: colors.buttonPrimaryText }}>
                              {authLoading ? 'Verifierar...' : 'Verifiera kod'}
                            </Text>
                          </Pressable>

                          <Pressable
                            onPress={() => {
                              setOtpSent(false);
                              setOtpCodeInput('');
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
                              Börja om
                            </Text>
                          </Pressable>
                        </View>
                      </>
                    )}
                  </View>
                ) : !householdId ? (
                  <>
                    <View style={[styles.infoBox, { backgroundColor: colors.infoBg }]}>
                      <Text style={[styles.infoText, { color: colors.infoText }]}>
                        Inloggad som {authEmail ?? authEmailInput}. Nu kan du skapa eller gå med i hushåll.
                      </Text>
                    </View>

                    <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
                      <Pressable
                        onPress={handleCreateHousehold}
                        style={[
                          styles.primaryButton,
                          { backgroundColor: colors.buttonPrimaryBg, flex: 1 },
                        ]}
                      >
                        <Text style={[styles.primaryButtonText, { color: colors.buttonPrimaryText }]}>
                          Skapa hushåll
                        </Text>
                      </Pressable>

                      <Pressable
                        onPress={() => setJoinModalVisible(true)}
                        style={[
                          styles.secondaryButton,
                          { backgroundColor: colors.buttonSecondaryBg, flex: 1 },
                        ]}
                      >
                        <Text style={[styles.secondaryButtonText, { color: colors.buttonSecondaryText }]}>
                          Gå med
                        </Text>
                      </Pressable>
                    </View>

                    <Pressable
                      onPress={async () => {
                        await signOutAuth();
                        setOtpSent(false);
                        setOtpCodeInput('');
                      }}
                      style={[
                        styles.secondaryButton,
                        { backgroundColor: colors.buttonSecondaryBg, marginTop: 12 },
                      ]}
                    >
                      <Text style={[styles.secondaryButtonText, { color: colors.buttonSecondaryText }]}>
                        Logga ut
                      </Text>
                    </Pressable>
                  </>
                ) : (
                  <>
                    <View style={[styles.infoBox, { backgroundColor: colors.infoBg }]}>
                      <Text style={[styles.infoText, { color: colors.infoText }]}>
                        Hushållet är länkat. Tryck på knappen nedan för att visa hushållskoden.
                      </Text>
                    </View>

                    <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
                      <Pressable
                        onPress={handleShowHouseholdCode}
                        onLongPress={handleManualSync}
                        delayLongPress={400}
                        style={[
                          styles.primaryButton,
                          { backgroundColor: colors.buttonPrimaryBg, flex: 1 },
                        ]}
                      >
                        <Text style={[styles.primaryButtonText, { color: colors.buttonPrimaryText }]}>
                          Hushåll
                        </Text>
                      </Pressable>

                      <Pressable
                        onPress={handleLeaveHousehold}
                        style={[
                          styles.dangerButton,
                          { backgroundColor: colors.dangerBg, flex: 1 },
                        ]}
                      >
                        <Text style={[styles.dangerButtonText, { color: colors.dangerText }]}>
                          Gå ur
                        </Text>
                      </Pressable>
                    </View>

                    {syncStatus ? (
                      <Text style={[styles.syncStatusText, { color: colors.muted }]}>
                        {syncStatus}
                      </Text>
                    ) : null}
                  </>
                )}
              </View>
            </CollapsibleSection>
          </View>
          <Modal
            visible={joinModalVisible}
            transparent
            animationType="fade"
            onRequestClose={() => setJoinModalVisible(false)}
          >
            <View style={styles.modalOverlay}>
              <View
                style={[
                  styles.modalCard,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.border,
                  },
                ]}
              >
                <Text style={[styles.sectionTitle, { color: colors.text }]}>
                  Gå med i hushåll
                </Text>

                <Text
                  style={[
                    styles.subtitle,
                    { color: colors.muted, marginTop: 6, marginBottom: 12 },
                  ]}
                >
                  Ange hushållskoden du fått av din partner.
                </Text>

                <TextInput
                  value={inviteCodeInput}
                  onChangeText={setInviteCodeInput}
                  placeholder="Ange kod"
                  placeholderTextColor={colors.placeholder}
                  autoCapitalize="characters"
                  style={[
                    styles.input,
                    {
                      backgroundColor: colors.inputBg,
                      color: colors.text,
                      borderColor: colors.border,
                    },
                  ]}
                />

                <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
                  <Pressable
                    onPress={() => {
                      setJoinModalVisible(false);
                      setInviteCodeInput('');
                    }}
                    style={[
                      styles.secondaryButton,
                      { backgroundColor: colors.buttonSecondaryBg, flex: 1 },
                    ]}
                  >
                    <Text style={[styles.secondaryButtonText, { color: colors.buttonSecondaryText }]}>
                      Avbryt
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={handleJoinHousehold}
                    style={[
                      styles.primaryButton,
                      { backgroundColor: colors.buttonPrimaryBg, flex: 1 },
                    ]}
                  >
                    <Text style={[styles.primaryButtonText, { color: colors.buttonPrimaryText }]}>
                      Gå med
                    </Text>
                  </Pressable>
                </View>
              </View>
            </View>
          </Modal>
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Arkiverade perioder</Text>

            {archivedPeriods.length === 0 ? (
              <Text style={{ color: colors.muted, marginTop: 6 }}>
                Inga arkiverade perioder ännu.
              </Text>
            ) : (
              archivedPeriods.map((period) => (
                <View
                  key={period.id}
                  style={{
                    marginTop: 12,
                    padding: 12,
                    borderRadius: 12,
                    backgroundColor: colors.inputBg,
                    borderWidth: 1,
                    borderColor: colors.border,
                  }}
                >
                  <Text style={{ fontWeight: '700', color: colors.text }}>{period.label}</Text>

                  <Text style={{ color: colors.muted, fontSize: 12, marginTop: 4 }}>
                    {period.startDate?.slice(0, 10)} → {period.endDate?.slice(0, 10)}
                  </Text>

                  <Pressable
                    onPress={() => restorePeriod(period.id)}
                    style={{
                      marginTop: 10,
                      alignSelf: 'flex-start',
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      borderRadius: 999,
                      backgroundColor: colors.buttonSecondaryBg,
                    }}
                  >
                    <Text style={{ fontWeight: '600', color: colors.buttonSecondaryText }}>
                      Återställ
                    </Text>
                  </Pressable>
                </View>
              ))
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    </TabFadeWrapper>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 20, padding: 16, marginBottom: 16 },
  eyebrow: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 },
  title: { fontSize: 28, fontWeight: '800', marginBottom: 8 },
  subtitle: { fontSize: 14, lineHeight: 20 },
  sectionTitle: { fontSize: 20, fontWeight: '700' },
  inputLabel: { fontSize: 13, fontWeight: '600', marginBottom: 6, marginTop: 12 },
  input: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 14, fontSize: 16 },
  dropdownHeader: { flexDirection: 'row', alignItems: 'center' },
  dropdownSubtitle: { fontSize: 13, marginTop: 4 },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 12, marginBottom: 8 },
  primaryButton: { borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14, alignSelf: 'flex-start' },
  primaryButtonText: { fontSize: 14, fontWeight: '700' },
  secondaryButton: { borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14 },
  secondaryButtonText: { fontSize: 14, fontWeight: '700' },
  categoryRow: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 10,
  },
  categoryText: { flex: 1, fontSize: 15, fontWeight: '600' },
  deleteButton: { borderRadius: 12, paddingVertical: 8, paddingHorizontal: 12 },
  deleteButtonText: { fontSize: 13, fontWeight: '700' },
  helperInline: { fontSize: 12, lineHeight: 18, marginTop: 8 },
  infoBox: { borderRadius: 14, padding: 12, marginBottom: 4 },
  infoText: { fontSize: 13, lineHeight: 19 },
  rowWrap: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 },
  dangerButton: {
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    alignSelf: 'flex-start',
  },
  dangerButtonText: {
    fontSize: 14,
    fontWeight: '700',
  },
  syncStatusText: {
    marginTop: 10,
    fontSize: 13,
    textAlign: 'center',
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    padding: 20,
  },

  modalCard: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 18,
  },
});