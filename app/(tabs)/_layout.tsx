import { Tabs } from "expo-router";
import React, { useEffect, useRef } from "react";
import { Animated, Text, Pressable, useColorScheme, View, Easing } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import AnimatedRe, { withTiming, useAnimatedStyle } from "react-native-reanimated";




function TabChevron({
  focused,
  color,
}: {
  focused: boolean;
  color: string;
}) {
  const rotateAnim = useRef(new Animated.Value(focused ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(rotateAnim, {
      toValue: focused ? 1 : 0,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [focused, rotateAnim]);

  const rotate = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["180deg", "0deg"],
  });

  return (
    <Animated.View style={{ transform: [{ rotate }] }}>
      <Text style={{ color, fontSize: 16, fontWeight: "700" }}>⌃</Text>
    </Animated.View>
  );
}

function TabBarButton(props: any) {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = async () => {
    try {
      void await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch { }

    Animated.spring(scaleAnim, {
      toValue: 0.94,
      useNativeDriver: true,
      speed: 30,
      bounciness: 4,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      speed: 24,
      bounciness: 6,
    }).start();
  };



  return (
    <Animated.View style={{ flex: 1, transform: [{ scale: scaleAnim }] }}>
      <Pressable
        {...props}
        onPressIn={(e) => {
          handlePressIn();
          props.onPressIn?.(e);
        }}
        onPressOut={(e) => {
          handlePressOut();
          props.onPressOut?.(e);
        }}
        style={[props.style, { flex: 1 }]}
      />
    </Animated.View>
  );
}

export const unstable_settings = {
  initialRouteName: "(tabs)",
};

export default function TabsLayout() {
  const isDark = useColorScheme() === "dark";

  const bg = isDark ? "#071821" : "#f6f7f9";
  const card = isDark ? "#1a1d24" : "#ffffff";
  const text = isDark ? "#f4f5f7" : "#111111";
  const muted = isDark ? "#8b95a5" : "#7a7f88";
  const border = isDark ? "rgba(255,255,255,0.06)" : "#e5e7eb";
  const foregroundColor = isDark ? "#1a1d24" : "#ffffff";

  const appGradient: readonly [string, string, string, string] = isDark
    ? ["#071821", "#093641", "#093031", "#0c2420"]
    : ["#F7FBFA", "#EEF7F5", "#E5F3EF", "#D9EEE8"];
  const chromeGradient: readonly [string, string] = isDark
    ? ['rgba(26,29,36,0.92)', 'rgba(18,22,29,0.98)']
    : ['rgba(255,255,255,0.96)', 'rgba(245,247,250,0.98)'];

  return (
    <Tabs
      screenOptions={{
        lazy: false,


        headerShown: true,
        headerTransparent: true,

        headerBackground: () => (
          <View
            style={{
              flex: 1,
              backgroundColor: 'transparent',
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 8 },
              shadowOpacity: isDark ? 0.22 : 0.10,
              shadowRadius: 20,
            }}
          >
            <LinearGradient
              colors={chromeGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={{ flex: 1 }}
            />

            <View
              pointerEvents="none"
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                bottom: 0,
                height: 1,
                backgroundColor: isDark
                  ? "rgba(255,255,255,0.05)"
                  : "rgba(0,0,0,0.05)",
              }}
            />
          </View>
        ),
        headerStyle: {
          height: 75,
        },

        headerShadowVisible: true,

        headerTitleStyle: {
          color: text,
          fontSize: 20,
          fontWeight: "700",
          paddingBottom: 38,
        },


        headerTintColor: text,

        tabBarHideOnKeyboard: true,
        tabBarStyle: {
          backgroundColor: "transparent",
          borderTopWidth: 0,
          elevation: 0,
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: 70,

          shadowColor: "#000",
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: isDark ? 0.28 : 0.10,
          shadowRadius: 18,
        },

        tabBarLabelStyle: {
          fontSize: 13,
          fontWeight: "700",
          marginTop: -2,
        },

        tabBarActiveTintColor: text,
        tabBarInactiveTintColor: muted,

        tabBarItemStyle: {
          borderRadius: 18,
          marginHorizontal: 4,
          marginVertical: 6,
        },

        tabBarButton: (props) => <TabBarButton {...props} />,

        tabBarBackground: () => (
          <View style={{ flex: 1 }}>
            <LinearGradient
              colors={chromeGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={{
                flex: 1,
                borderTopLeftRadius: 22,
                borderTopRightRadius: 22,
              }}
            />

            <View
              pointerEvents="none"
              style={{
                position: "absolute",
                top: 14,
                bottom: 14,
                left: "33.33%",
                width: 1,
                backgroundColor: isDark
                  ? "rgba(255,255,255,0.06)"
                  : "rgba(0,0,0,0.05)",
              }}
            />
            <View
              pointerEvents="none"
              style={{
                position: "absolute",
                top: 14,
                bottom: 14,
                left: "66.66%",
                width: 1,
                backgroundColor: isDark
                  ? "rgba(255,255,255,0.06)"
                  : "rgba(0,0,0,0.05)",
              }}
            />
          </View>
        ),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Månad",
          headerTitle: "Månad",
          tabBarIcon: ({ focused, color }) => {
            const animatedStyle = useAnimatedStyle(() => ({
              opacity: withTiming(focused ? 1 : 0.3, { duration: 300 }),
            }));

            return (
              <AnimatedRe.View style={animatedStyle}>
                <TabChevron focused={focused} color={color} />
              </AnimatedRe.View>
            );
          },
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: "Översikt",
          headerTitle: "Översikt",
          tabBarIcon: ({ focused, color }) => {
            const animatedStyle = useAnimatedStyle(() => ({
              opacity: withTiming(focused ? 1 : 0.3, { duration: 300 }),
            }));

            return (
              <AnimatedRe.View style={animatedStyle}>
                <TabChevron focused={focused} color={color} />
              </AnimatedRe.View>
            );
          },
        }}
      />
      <Tabs.Screen
        name="household"
        options={{
          title: "Hushåll",
          headerTitle: "Hushåll",
          tabBarIcon: ({ focused, color }) => {
            const animatedStyle = useAnimatedStyle(() => ({
              opacity: withTiming(focused ? 1 : 0.3, { duration: 300 }),
            }));

            return (
              <AnimatedRe.View style={animatedStyle}>
                <TabChevron focused={focused} color={color} />
              </AnimatedRe.View>
            );
          },
        }}
      />
    </Tabs>
  );
}