import '@/lib/i18n';
import '@/global.css';
import { NAV_THEME } from '@/lib/theme';
import { ThemeProvider } from '@react-navigation/native';
import { PortalHost } from '@rn-primitives/portal';
import { Stack, router, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'nativewind';
import { createContext, useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, useSafeAreaInsets, initialWindowMetrics } from 'react-native-safe-area-context';
import { initDB, PrefsDAL } from '@/lib/db';
import { applyStoredLanguage } from '@/lib/i18n';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { restTimer } from '@/lib/rest-timer';
import type { ActiveRest } from '@/lib/rest-timer';
import { setNotificationCallbacks } from '@/lib/notifications';
import { Text } from '@/components/ui/text';
import { Timer } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

export {
  ErrorBoundary,
} from 'expo-router';

// Screens that sit behind the rest banner can consume this to add paddingTop.
export const RestBannerHeightContext = createContext(0);

function formatDuration(s: number): string {
  if (s <= 0) return '0s';
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m === 0) return `${rem}s`;
  return rem > 0 ? `${m}m ${rem}s` : `${m}m`;
}

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

// Rendered absolutely — out of layout flow so the Stack height never changes.
function RestBanner({ active, onHeight }: { active: ActiveRest | null; onHeight: (h: number) => void }) {
  const pathname = usePathname();
  const { t } = useTranslation();
  const [, setTick] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  if (!active) return null;

  const elapsed = restTimer.elapsed();
  const target = restTimer.target();
  const progress = Math.min(elapsed / target, 1);
  const isExerciseBlock = pathname.includes('exercise_block');

  return (
    <Pressable
      onPress={() => {
        if (isExerciseBlock) return;
        restTimer.navigate();
        router.push('/exercise_block');
      }}
      onLayout={(e) => onHeight(e.nativeEvent.layout.height)}
      style={{
        position: 'absolute',
        top: 0,
        left: 16,
        right: 16,
        zIndex: 10,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: 'rgba(168,85,247,0.4)',
        backgroundColor: 'rgba(20,10,40,0.92)',
        overflow: 'hidden',
      }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 11 }}>
        <Timer size={14} color="#a855f7" />
        <View style={{ flex: 1 }}>
          <Text style={{ color: '#a855f7', fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.7 }}>
            {t('banner.resting')}
          </Text>
          {active.blockName ? (
            <Text style={{ color: '#d8b4fe', fontSize: 13, fontWeight: '700' }} numberOfLines={1}>
              {active.blockName}
            </Text>
          ) : null}
        </View>
        <Text style={{ color: '#e9d5ff', fontSize: 18, fontWeight: '900', letterSpacing: -0.5 }}>
          {formatDuration(elapsed)}
        </Text>
      </View>
      <View style={{ height: 3, backgroundColor: 'rgba(168,85,247,0.15)' }}>
        <View style={{ height: 3, width: `${progress * 100}%`, backgroundColor: '#a855f7' }} />
      </View>
    </Pressable>
  );
}

function NotificationHandlers() {
  useNotificationHandlers();
  return null;
}

// The banner is absolutely positioned so the Stack height never changes —
// the tab bar's absolute Y position is therefore always constant.
// The measured banner height is broadcast via RestBannerHeightContext so
// individual screens can add their own paddingTop to avoid being obscured.
function BannerAwareStackShell() {
  const [active, setActive] = useState<ActiveRest | null>(() => restTimer.get());
  const [bannerHeight, setBannerHeight] = useState(0);

  useEffect(() => {
    restTimer.setOnActiveChange((next) => setActive(next));
    return () => restTimer.setOnActiveChange(null);
  }, []);

  const contextValue = active ? bannerHeight : 0;

  return (
    <RestBannerHeightContext.Provider value={contextValue}>
      <View style={{ flex: 1 }}>
        <RestBanner active={active} onHeight={setBannerHeight} />
        <Stack style={{ flex: 1 }}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="create_exercise" options={{ headerShown: false }} />
          <Stack.Screen name="exercise_history" options={{ headerShown: false }} />
          <Stack.Screen name="ai_import" options={{ headerShown: false }} />
          <Stack.Screen name="ai_export" options={{ headerShown: false }} />
        </Stack>
      </View>
    </RestBannerHeightContext.Provider>
  );
}

function AppShell() {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: 'black', paddingTop: insets.top }}>
      <NotificationHandlers />
      <BannerAwareStackShell />
    </View>
  );
}

export default function RootLayout() {
  useEffect(() => {
    initDB();
    PrefsDAL.get('language').then(applyStoredLanguage);
  }, []);

  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
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
