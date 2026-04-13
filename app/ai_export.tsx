import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Share,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Text } from '@/components/ui/text';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, Copy, Share2, TriangleAlert } from 'lucide-react-native';
import { ExerciseDAL, RoutineDAL } from '@/lib/db';
import type { Exercise } from '@/lib/exercises';
import type { Routine } from '@/lib/types';
import {
  PASTE_CHAR_LIMIT,
  exDisplayName,
  exportAnalyticsAI,
  exportExercisesAI,
  exportRoutinesAI,
} from '@/lib/ai-format';
import { CheckRow, SelectAllBar, SelectionSearch } from '@/components/AiSelection';

type Tab = 'exercises' | 'routines' | 'analytics';

const TIMEFRAMES: { label: string; days: number | null }[] = [
  { label: '7d', days: 7 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
  { label: '6mo', days: 180 },
  { label: '1yr', days: 365 },
  { label: 'All', days: null },
];

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function AIExport() {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>('exercises');
  const [loading, setLoading] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [copying, setCopying] = useState(false);

  const [allExercises, setAllExercises] = useState<Exercise[]>([]);
  const [allRoutines, setAllRoutines] = useState<Routine[]>([]);

  // Exercises tab
  const [exSearch, setExSearch] = useState('');
  const [selectedExIds, setSelectedExIds] = useState<Set<string>>(new Set());

  // Routines tab
  const [routineSearch, setRoutineSearch] = useState('');
  const [selectedRoutineIds, setSelectedRoutineIds] = useState<Set<string>>(new Set());

  // Analytics tab
  const [daysBack, setDaysBack] = useState<number | null>(28);
  const [analyticsSearch, setAnalyticsSearch] = useState('');
  const [selectedAnalyticsIds, setSelectedAnalyticsIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    Promise.all([ExerciseDAL.getAll(), RoutineDAL.getAll()]).then(([exs, routines]) => {
      setAllExercises(exs);
      setAllRoutines(routines);
      setSelectedExIds(new Set(exs.map((e) => e.id)));
      setSelectedRoutineIds(new Set(routines.map((r) => r.id)));
      setSelectedAnalyticsIds(new Set(exs.map((e) => e.id)));
      setLoading(false);
    });
  }, []);

  // ─── Filtered lists ──────────────────────────────────────────────────────

  const filteredExercises = useMemo(() => {
    const q = exSearch.toLowerCase().trim();
    if (!q) return allExercises;
    return allExercises.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        e.equipment.toLowerCase().includes(q) ||
        (e.equipmentVariant ?? '').toLowerCase().includes(q)
    );
  }, [allExercises, exSearch]);

  const filteredRoutines = useMemo(() => {
    const q = routineSearch.toLowerCase().trim();
    if (!q) return allRoutines;
    return allRoutines.filter((r) => r.name.toLowerCase().includes(q));
  }, [allRoutines, routineSearch]);

  const filteredAnalyticsExercises = useMemo(() => {
    const q = analyticsSearch.toLowerCase().trim();
    if (!q) return allExercises;
    return allExercises.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        e.equipment.toLowerCase().includes(q) ||
        (e.equipmentVariant ?? '').toLowerCase().includes(q)
    );
  }, [allExercises, analyticsSearch]);

  // ─── Toggle helpers ──────────────────────────────────────────────────────

  function toggleEx(id: string) {
    setSelectedExIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleRoutine(id: string) {
    setSelectedRoutineIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleAnalytics(id: string) {
    setSelectedAnalyticsIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  // ─── Share ───────────────────────────────────────────────────────────────

  async function buildExport(): Promise<string> {
    if (tab === 'exercises') return exportExercisesAI([...selectedExIds]);
    if (tab === 'routines') return exportRoutinesAI([...selectedRoutineIds]);
    return exportAnalyticsAI({ exerciseIds: [...selectedAnalyticsIds], daysBack });
  }

  async function handleShare() {
    setSharing(true);
    try {
      await Share.share({ message: await buildExport() });
    } catch (e: any) {
      Alert.alert('Export failed', e?.message ?? 'Unknown error');
    } finally {
      setSharing(false);
    }
  }

  async function handleCopy() {
    setCopying(true);
    try {
      await Clipboard.setStringAsync(await buildExport());
    } catch (e: any) {
      Alert.alert('Copy failed', e?.message ?? 'Unknown error');
    } finally {
      setCopying(false);
    }
  }

  // ─── Render helpers ──────────────────────────────────────────────────────

  const renderExercise = useCallback(
    ({ item }: { item: Exercise }) => (
      <CheckRow
        label={item.name}
        sub={exDisplayName(item).match(/\((.+)\)/)?.[1]}
        checked={selectedExIds.has(item.id)}
        onToggle={() => toggleEx(item.id)}
      />
    ),
    [selectedExIds]
  );

  const renderRoutine = useCallback(
    ({ item }: { item: Routine }) => (
      <CheckRow
        label={item.name}
        sub={item.description || `${item.exercises.length} slot${item.exercises.length !== 1 ? 's' : ''}`}
        checked={selectedRoutineIds.has(item.id)}
        onToggle={() => toggleRoutine(item.id)}
      />
    ),
    [selectedRoutineIds]
  );

  const renderAnalyticsEx = useCallback(
    ({ item }: { item: Exercise }) => (
      <CheckRow
        label={item.name}
        sub={exDisplayName(item).match(/\((.+)\)/)?.[1]}
        checked={selectedAnalyticsIds.has(item.id)}
        onToggle={() => toggleAnalytics(item.id)}
      />
    ),
    [selectedAnalyticsIds]
  );

  // ─── Share button label ──────────────────────────────────────────────────

  const shareCount =
    tab === 'exercises'
      ? selectedExIds.size
      : tab === 'routines'
      ? selectedRoutineIds.size
      : selectedAnalyticsIds.size;

  // Per-item size estimates (chars): exercise JSON ≈ 250, routine JSON ≈ 500, analytics entry ≈ 350
  const estimatedChars = useMemo(() => {
    if (tab === 'exercises') return selectedExIds.size * 250 + 30;
    if (tab === 'routines') return selectedRoutineIds.size * 500 + 30;
    return selectedAnalyticsIds.size * 350 + 100;
  }, [tab, selectedExIds.size, selectedRoutineIds.size, selectedAnalyticsIds.size]);

  const exportTooLarge = estimatedChars > PASTE_CHAR_LIMIT;
  const actionDisabled = sharing || copying || shareCount === 0;

  // ─── Layout ──────────────────────────────────────────────────────────────

  const BOTTOM_BAR_HEIGHT = insets.bottom + 72;

  return (
    <View style={{ flex: 1, backgroundColor: '#09090b', paddingTop: insets.top }}>
      {/* Header */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          paddingHorizontal: 16,
          paddingTop: 10,
          paddingBottom: 12,
        }}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10}>
          <ChevronLeft size={22} color="#a1a1aa" />
        </TouchableOpacity>
        <Text style={{ color: '#fafafa', fontSize: 20, fontWeight: '700', flex: 1 }}>
          Export for AI
        </Text>
      </View>

      {/* Tab selector */}
      <View
        style={{
          flexDirection: 'row',
          marginHorizontal: 16,
          marginBottom: 16,
          backgroundColor: '#18181b',
          borderRadius: 10,
          padding: 3,
          gap: 3,
        }}>
        {(['exercises', 'routines', 'analytics'] as Tab[]).map((t) => (
          <TouchableOpacity
            key={t}
            onPress={() => setTab(t)}
            style={{
              flex: 1,
              paddingVertical: 8,
              borderRadius: 7,
              alignItems: 'center',
              backgroundColor: tab === t ? '#27272a' : 'transparent',
            }}>
            <Text
              style={{
                color: tab === t ? '#fafafa' : '#71717a',
                fontWeight: '600',
                fontSize: 13,
                textTransform: 'capitalize',
              }}>
              {t}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Content */}
      {loading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator color="#ea580c" />
        </View>
      ) : tab === 'exercises' ? (
        <FlatList
          data={filteredExercises}
          keyExtractor={(item) => item.id}
          renderItem={renderExercise}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingBottom: BOTTOM_BAR_HEIGHT,
          }}
          ListHeaderComponent={
            <View style={{ paddingBottom: 4 }}>
              <SelectionSearch value={exSearch} onChangeText={setExSearch} />
              <SelectAllBar
                total={allExercises.length}
                selected={selectedExIds.size}
                onSelectAll={() => setSelectedExIds(new Set(allExercises.map((e) => e.id)))}
                onDeselectAll={() => setSelectedExIds(new Set())}
              />
            </View>
          }
          ItemSeparatorComponent={() => (
            <View style={{ height: 1, backgroundColor: '#18181b' }} />
          )}
        />
      ) : tab === 'routines' ? (
        <FlatList
          data={filteredRoutines}
          keyExtractor={(item) => item.id}
          renderItem={renderRoutine}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingBottom: BOTTOM_BAR_HEIGHT,
          }}
          ListHeaderComponent={
            <View style={{ paddingBottom: 4 }}>
              {allRoutines.length > 4 && (
                <SelectionSearch value={routineSearch} onChangeText={setRoutineSearch} />
              )}
              <SelectAllBar
                total={allRoutines.length}
                selected={selectedRoutineIds.size}
                onSelectAll={() => setSelectedRoutineIds(new Set(allRoutines.map((r) => r.id)))}
                onDeselectAll={() => setSelectedRoutineIds(new Set())}
              />
            </View>
          }
          ListEmptyComponent={
            <Text style={{ color: '#3f3f46', fontSize: 14, textAlign: 'center', paddingTop: 40 }}>
              No routines found
            </Text>
          }
          ItemSeparatorComponent={() => (
            <View style={{ height: 1, backgroundColor: '#18181b' }} />
          )}
        />
      ) : (
        // Analytics tab
        <FlatList
          data={filteredAnalyticsExercises}
          keyExtractor={(item) => item.id}
          renderItem={renderAnalyticsEx}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingBottom: BOTTOM_BAR_HEIGHT,
          }}
          ListHeaderComponent={
            <View>
              {/* Timeframe picker */}
              <Text
                style={{
                  color: '#71717a',
                  fontSize: 11,
                  textTransform: 'uppercase',
                  letterSpacing: 1,
                  marginBottom: 8,
                }}>
                Timeframe
              </Text>
              <View
                style={{
                  flexDirection: 'row',
                  gap: 6,
                  marginBottom: 20,
                  flexWrap: 'wrap',
                }}>
                {TIMEFRAMES.map(({ label, days }) => {
                  const active =
                    days === daysBack || (days === null && daysBack === null);
                  return (
                    <TouchableOpacity
                      key={label}
                      onPress={() => setDaysBack(days)}
                      style={{
                        paddingHorizontal: 14,
                        paddingVertical: 7,
                        borderRadius: 8,
                        borderWidth: 1,
                        borderColor: active ? '#ea580c' : '#27272a',
                        backgroundColor: active ? '#431407' : 'transparent',
                      }}>
                      <Text
                        style={{
                          color: active ? '#fb923c' : '#71717a',
                          fontWeight: '600',
                          fontSize: 13,
                        }}>
                        {label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Exercise filter for analytics */}
              <Text
                style={{
                  color: '#71717a',
                  fontSize: 11,
                  textTransform: 'uppercase',
                  letterSpacing: 1,
                  marginBottom: 8,
                }}>
                Exercises
              </Text>
              <SelectionSearch value={analyticsSearch} onChangeText={setAnalyticsSearch} />
              <SelectAllBar
                total={allExercises.length}
                selected={selectedAnalyticsIds.size}
                onSelectAll={() =>
                  setSelectedAnalyticsIds(new Set(allExercises.map((e) => e.id)))
                }
                onDeselectAll={() => setSelectedAnalyticsIds(new Set())}
              />
            </View>
          }
          ItemSeparatorComponent={() => (
            <View style={{ height: 1, backgroundColor: '#18181b' }} />
          )}
        />
      )}

      {/* Share button */}
      <View
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          paddingHorizontal: 16,
          paddingTop: 12,
          paddingBottom: insets.bottom + 16,
          backgroundColor: '#09090b',
          borderTopWidth: 1,
          borderTopColor: '#18181b',
          gap: 8,
        }}>
        {exportTooLarge && (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'flex-start',
              gap: 8,
              backgroundColor: '#2d1a06',
              borderWidth: 1,
              borderColor: '#92400e',
              borderRadius: 8,
              padding: 10,
            }}>
            <TriangleAlert size={14} color="#fb923c" style={{ marginTop: 1 }} />
            <Text style={{ color: '#fb923c', fontSize: 13, flex: 1, lineHeight: 18 }}>
              Too large to copy (~{Math.round(estimatedChars / 1000)}K chars). Use Share or deselect items to bring it under {PASTE_CHAR_LIMIT / 1000}K.
            </Text>
          </View>
        )}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {!exportTooLarge && (
            <TouchableOpacity
              onPress={handleCopy}
              disabled={actionDisabled}
              style={{
                flex: 1,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 7,
                backgroundColor: actionDisabled ? '#27272a' : '#18181b',
                borderWidth: 1,
                borderColor: actionDisabled ? '#27272a' : '#3f3f46',
                paddingVertical: 14,
                borderRadius: 10,
              }}>
              {copying ? (
                <ActivityIndicator color="#ea580c" />
              ) : (
                <>
                  <Copy size={15} color={actionDisabled ? '#52525b' : '#ea580c'} />
                  <Text style={{ color: actionDisabled ? '#52525b' : '#ea580c', fontWeight: '700', fontSize: 15 }}>
                    Copy
                  </Text>
                </>
              )}
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={handleShare}
            disabled={actionDisabled}
            style={{
              flex: 1,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 7,
              backgroundColor: actionDisabled ? '#27272a' : '#ea580c',
              paddingVertical: 14,
              borderRadius: 10,
            }}>
            {sharing ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Share2 size={15} color={actionDisabled ? '#52525b' : '#fff'} />
                <Text style={{ color: actionDisabled ? '#52525b' : '#fff', fontWeight: '700', fontSize: 15 }}>
                  {shareCount > 0
                    ? `Share ${shareCount} ${tab === 'analytics' ? 'exercise' : tab.slice(0, -1)}${shareCount !== 1 ? 's' : ''}`
                    : 'Nothing selected'}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}
