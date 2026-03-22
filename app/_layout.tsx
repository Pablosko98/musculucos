import '@/global.css';
import { NAV_THEME } from '@/lib/theme';
import { ThemeProvider } from '@react-navigation/native';
import { PortalHost } from '@rn-primitives/portal';
import { Stack, router, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'nativewind';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { initDB } from '@/lib/db';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { restTimer } from '@/lib/rest-timer';
import { setNotificationCallbacks } from '@/lib/notifications';
import { Text } from '@/components/ui/text';
import { Timer } from 'lucide-react-native';

export {
  ErrorBoundary,
} from 'expo-router';

function useNotificationHandlers() {
  const pathname = usePathname();
  useEffect(() => {
    setNotificationCallbacks({
      onPress: () => {
        if (pathname.includes('exercise_block')) return;
        restTimer.navigate();
        router.push('/exercise_block');
      },
      onFinish: () => {
        const elapsed = Math.max(restTimer.elapsed(), 1);
        restTimer.finalizeForBlock(elapsed);
        restTimer.clear();
      },
    });
  }, [pathname]);
}

function RestBanner() {
  const pathname = usePathname();
  const [, setTick] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  if (pathname.includes('exercise_block')) return null;
  const active = restTimer.get();
  if (!active) return null;

  const elapsed = restTimer.elapsed();
  const target = restTimer.target();
  const progress = Math.min(elapsed / target, 1);

  return (
    <Pressable
      onPress={() => {
        if (pathname.includes('exercise_block')) return;
        restTimer.navigate();
        router.push('/exercise_block');
      }}
      style={{
        borderRadius: 16,
        borderWidth: 1,
        borderColor: 'rgba(168,85,247,0.4)',
        backgroundColor: 'rgba(20,10,40,0.92)',
        overflow: 'hidden',
        marginHorizontal: 16,
        marginBottom: 8,
      }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 11 }}>
        <Timer size={14} color="#a855f7" />
        <View style={{ flex: 1 }}>
          <Text style={{ color: '#a855f7', fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.7 }}>
            Resting
          </Text>
          {active.blockName ? (
            <Text style={{ color: '#d8b4fe', fontSize: 13, fontWeight: '700' }} numberOfLines={1}>
              {active.blockName}
            </Text>
          ) : null}
        </View>
        <Text style={{ color: '#e9d5ff', fontSize: 18, fontWeight: '900', letterSpacing: -0.5 }}>
          {elapsed}s
        </Text>
      </View>
      <View style={{ height: 3, backgroundColor: 'rgba(168,85,247,0.15)' }}>
        <View style={{ height: 3, width: `${progress * 100}%`, backgroundColor: '#a855f7' }} />
      </View>
    </Pressable>
  );
}

function AppShell() {
  const insets = useSafeAreaInsets();
  useNotificationHandlers();
  return (
    <View style={{ flex: 1, backgroundColor: 'black', paddingTop: insets.top }}>
      <RestBanner />
      <Stack style={{ flex: 1 }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="create_exercise" options={{ headerShown: false }} />
        <Stack.Screen name="exercise_history" options={{ headerShown: false }} />
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
          <QueryClientProvider client={queryClient}>
            <StatusBar />
            <AppShell />
            <PortalHost />
          </QueryClientProvider>
        </GestureHandlerRootView>
        <PortalHost />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
