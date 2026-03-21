import { Stack } from "expo-router";
import { AppProvider } from "../context/AppContext";
import { ThemeProvider, DarkTheme, DefaultTheme } from "@react-navigation/native";
import { useColorScheme, View } from "react-native";

export default function RootLayout() {
  const scheme = useColorScheme();


  const dark = {
    ...DarkTheme,
    colors: {
      ...DarkTheme.colors,
      background: "#071821",   
      card: "#071821",
      border: "#071821",
    },
  };


  const light = {
    ...DefaultTheme,
    colors: {
      ...DefaultTheme.colors,
      background: "#f6f7f9",   
      card: "#f6f7f9",
      border: "#f6f7f9",
    },
  };

  return (
    <AppProvider>
      <ThemeProvider value={scheme === "dark" ? dark : light}>
        <View
          style={{
            flex: 1,
            backgroundColor: scheme === "dark" ? "#071821" : "#f6f7f9",
          }}
        >
          <Stack
            screenOptions={{
              headerShown: false,

              contentStyle: {
                backgroundColor: scheme === "dark" ? "#071821" : "#f6f7f9",
              },
            }}
          >
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="+not-found" />
          </Stack>
        </View>

      </ThemeProvider>
    </AppProvider>
  );
}
