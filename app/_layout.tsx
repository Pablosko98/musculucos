import '@/global.css';
import { NAV_THEME } from '@/lib/theme';
import { ThemeProvider } from '@react-navigation/native';
import { PortalHost } from '@rn-primitives/portal';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'nativewind';
import { useEffect } from 'react';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { initDB } from '@/lib/db';

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from 'expo-router';

function AppShell() {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: 'black', paddingTop: insets.top }}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>
    </View>
  );
}

export default function RootLayout() {
  useEffect(() => {
    initDB();
  }, []);

  return (
    <SafeAreaProvider>
      <ThemeProvider value={NAV_THEME['dark']}>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <StatusBar />
          <AppShell />
          <PortalHost />
        </GestureHandlerRootView>
        <PortalHost />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
