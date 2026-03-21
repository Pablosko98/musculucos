import React, { useEffect, useRef, useState } from 'react';
import { View, FlatList, ActivityIndicator, TouchableOpacity, ScrollView } from 'react-native';
import { Text } from '@/components/ui/text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { ExerciseDAL } from '@/lib/db';
import type { HistoryWorkout } from '@/lib/db';
import type { Exercise } from '@/lib/exercises';
import { setPendingWorkoutDate } from '@/lib/navigation-state';

const PAGE_SIZE = 50;
const PREFETCH_THRESHOLD = 25;

const EQUIPMENT_LABELS: Record<string, string> = {
  barbell: 'Barbell',
  dumbbell: 'Dumbbell',
  cable: 'Cable',
  machine: 'Machine',
  bodyweight: 'Bodyweight',
  ez_bar: 'EZ Bar',
};
const EQUIPMENT_COLORS: Record<string, { bg: string; text: string; activeBg: string }> = {
  barbell: { bg: '#1c2e4a', text: '#60a5fa', activeBg: '#1d4ed8' },
  dumbbell: { bg: '#162d22', text: '#4ade80', activeBg: '#16a34a' },
  cable: { bg: '#2a1a3e', text: '#c084fc', activeBg: '#7c3aed' },
  machine: { bg: '#2e1f0a', text: '#fb923c', activeBg: '#ea580c' },
  bodyweight: { bg: '#0f2e2e', text: '#2dd4bf', activeBg: '#0d9488' },
  ez_bar: { bg: '#2e1021', text: '#f472b6', activeBg: '#db2777' },
};

function fmt(s: string) {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
function fmtEquipment(eq: string): string {
  return EQUIPMENT_LABELS[eq] ?? fmt(eq);
}
function variantLabel(ex: {
  id: string;
  baseId: string;
  equipment: string;
  equipmentVariant?: string | null;
}): string {
  if (ex.equipmentVariant) {
    return `${fmt(ex.equipmentVariant)} ${EQUIPMENT_LABELS[ex.equipment] ?? fmt(ex.equipment)}`.trim();
  }
  const suffix = ex.id.startsWith(`${ex.baseId}_`) ? ex.id.slice(ex.baseId.length + 1) : '';
  if (suffix) {
    return suffix
      .replace('ez_bar', 'EZ Bar')
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return EQUIPMENT_LABELS[ex.equipment] ?? fmt(ex.equipment);
}
function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
  const abs = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  if (diffDays === 0) return `Today · ${abs}`;
  if (diffDays === 1) return `Yesterday · ${abs}`;
  if (diffDays < 7) return `${diffDays} days ago · ${abs}`;
  return abs;
}

function WorkoutCard({
  workout,
  equipment,
  onPressDate,
}: {
  workout: HistoryWorkout;
  equipment?: string;
  onPressDate: (date: string) => void;
}) {
  const setGroups: string[] = [];
  const seenParents = new Set<string>();
  for (const s of workout.sets) {
    if (!seenParents.has(s.parentEventId)) {
      seenParents.add(s.parentEventId);
      setGroups.push(s.parentEventId);
    }
  }

  return (
    <View
      style={{
        backgroundColor: '#18181b',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#27272a',
        marginBottom: 10,
        overflow: 'hidden',
      }}>
      {/* Date header — tappable */}
      <TouchableOpacity
        onPress={() => onPressDate(workout.date)}
        activeOpacity={0.7}
        style={{
          paddingHorizontal: 16,
          paddingVertical: 12,
          borderBottomWidth: 1,
          borderBottomColor: '#27272a',
          flexDirection: 'row',
          alignItems: 'center',
        }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: '#fafafa', fontSize: 14, fontWeight: '600' }}>
            {formatDate(workout.date)}
          </Text>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 3 }}>
            {workout.workingSets > 0 && (
              <Text style={{ color: '#52525b', fontSize: 12 }}>
                {workout.workingSets} {workout.workingSets === 1 ? 'set' : 'sets'}
              </Text>
            )}
            {workout.maxWeightKg > 0 && (
              <Text style={{ color: '#52525b', fontSize: 12 }}>· {workout.maxWeightKg}kg max</Text>
            )}
            {workout.totalVolume > 0 && (
              <Text style={{ color: '#52525b', fontSize: 12 }}>
                · {workout.totalVolume.toLocaleString()}kg vol
              </Text>
            )}
          </View>
        </View>
        <ChevronRight size={16} color="#3f3f46" />
      </TouchableOpacity>

      {/* Sets */}
      <View style={{ paddingHorizontal: 16, paddingVertical: 10, gap: 6 }}>
        {workout.sets.map((s, i) => {
          const setNum = setGroups.indexOf(s.parentEventId) + 1;
          const isWarmup = s.rep_type === 'warmup';
          const isBodyweight = s.weightKg === 0 || equipment === 'bodyweight';
          return (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Text style={{ color: '#3f3f46', fontSize: 12, width: 18, textAlign: 'right' }}>
                {setNum}
              </Text>
              <Text
                style={{
                  color: isWarmup ? '#52525b' : '#f4f4f5',
                  fontSize: 15,
                  fontWeight: '600',
                  flex: 1,
                }}>
                {isBodyweight ? 'BW' : `${s.weightKg}`}
                {!isBodyweight && (
                  <Text style={{ color: '#71717a', fontSize: 12, fontWeight: '400' }}> kg</Text>
                )}
                {' × '}
                {s.reps}
              </Text>
              {s.rpe != null && (
                <Text style={{ color: '#22c55e', fontSize: 11, fontWeight: '600' }}>
                  @{s.rpe % 1 === 0 ? s.rpe : s.rpe.toFixed(1)}
                </Text>
              )}
              {isWarmup && (
                <View
                  style={{
                    backgroundColor: '#27272a',
                    borderRadius: 4,
                    paddingHorizontal: 5,
                    paddingVertical: 1,
                  }}>
                  <Text
                    style={{
                      color: '#71717a',
                      fontSize: 9,
                      textTransform: 'uppercase',
                      letterSpacing: 0.5,
                    }}>
                    warmup
                  </Text>
                </View>
              )}
              {!isWarmup && s.rep_type !== 'full' && (
                <View
                  style={{
                    backgroundColor: '#1c1c1f',
                    borderRadius: 4,
                    paddingHorizontal: 5,
                    paddingVertical: 1,
                  }}>
                  <Text
                    style={{
                      color: '#71717a',
                      fontSize: 9,
                      textTransform: 'uppercase',
                      letterSpacing: 0.5,
                    }}>
                    {s.rep_type}
                  </Text>
                </View>
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}

export default function ExerciseHistory() {
  const insets = useSafeAreaInsets();
  const {
    exerciseId: initialExerciseId,
    exerciseName,
    baseId,
  } = useLocalSearchParams<{
    exerciseId: string;
    exerciseName?: string;
    baseId?: string;
  }>();

  const [variants, setVariants] = useState<Exercise[]>([]);
  const [activeId, setActiveId] = useState(initialExerciseId);

  const [history, setHistory] = useState<HistoryWorkout[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const offsetRef = useRef(0);
  const loadingMoreRef = useRef(false);

  // Load sibling variants for tab strip
  useEffect(() => {
    const id = baseId || initialExerciseId;
    ExerciseDAL.getByBaseId(id).then((vs) => {
      // If baseId wasn't passed, try using the exerciseId's baseId from results
      if (vs.length > 0) setVariants(vs);
      else setVariants([]);
    });
  }, [baseId, initialExerciseId]);

  const activeVariant = variants.find((v) => v.id === activeId);

  const loadPage = async (id: string, reset = false) => {
    if (!reset && loadingMoreRef.current) return;
    if (!reset && !hasMore) return;

    loadingMoreRef.current = true;
    const offset = reset ? 0 : offsetRef.current;
    if (reset) setLoading(true);
    else setLoadingMore(true);

    try {
      const results = await ExerciseDAL.getExerciseHistory(id, PAGE_SIZE, offset);
      if (reset) {
        setHistory(results);
        offsetRef.current = results.length;
      } else {
        setHistory((prev) => [...prev, ...results]);
        offsetRef.current += results.length;
      }
      setHasMore(results.length === PAGE_SIZE);
    } catch (e) {
      console.error('History load error', e);
    } finally {
      if (reset) setLoading(false);
      else setLoadingMore(false);
      loadingMoreRef.current = false;
    }
  };

  useEffect(() => {
    setHasMore(true);
    loadPage(activeId, true);
  }, [activeId]);

  const handleEndReached = () => {
    if (hasMore && !loadingMoreRef.current) loadPage(activeId, false);
  };

  const handlePressDate = (date: string) => {
    setPendingWorkoutDate(date);
    router.navigate('/(tabs)/(home)');
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#09090b', paddingTop: insets.top }}>
      {/* Header */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 16,
          paddingVertical: 14,
          borderBottomWidth: 1,
          borderBottomColor: '#18181b',
        }}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <ChevronLeft size={24} color="#a1a1aa" />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 8 }}>
          <Text style={{ color: '#fafafa', fontSize: 18, fontWeight: '700' }}>
            {exerciseName ?? 'Exercise History'}
          </Text>
        </View>
      </View>

      {/* Variant tabs */}
      {variants.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 10, gap: 8 }}
          style={{ flexGrow: 0, borderBottomWidth: 1, borderBottomColor: '#18181b' }}>
          {variants.map((v) => {
            const isActive = v.id === activeId;
            const colors = EQUIPMENT_COLORS[v.equipment] ?? {
              bg: '#27272a',
              text: '#a1a1aa',
              activeBg: '#3f3f46',
            };
            return (
              <TouchableOpacity
                key={v.id}
                onPress={() => setActiveId(v.id)}
                activeOpacity={0.7}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 7,
                  borderRadius: 10,
                  backgroundColor: isActive ? colors.activeBg : colors.bg,
                  borderWidth: 1,
                  borderColor: isActive ? 'transparent' : '#27272a',
                }}>
                <Text
                  style={{
                    color: isActive ? '#fff' : colors.text,
                    fontSize: 13,
                    fontWeight: isActive ? '700' : '500',
                  }}>
                  {variantLabel(v)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {loading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator color="#ea580c" />
        </View>
      ) : (
        <FlatList
          data={history}
          keyExtractor={(item) => item.date}
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}
          showsVerticalScrollIndicator={false}
          onEndReached={handleEndReached}
          onEndReachedThreshold={PREFETCH_THRESHOLD / PAGE_SIZE}
          renderItem={({ item }) => (
            <WorkoutCard
              workout={item}
              equipment={activeVariant?.equipment}
              onPressDate={handlePressDate}
            />
          )}
          ListHeaderComponent={
            history.length > 0 ? (
              <Text style={{ color: '#52525b', fontSize: 13, marginBottom: 12 }}>
                {history.length} workout{history.length !== 1 ? 's' : ''}
                {hasMore ? '+' : ''}
                {variants.length > 1 && activeVariant ? ` · ${variantLabel(activeVariant)}` : ''}
              </Text>
            ) : null
          }
          ListEmptyComponent={
            <View style={{ paddingTop: 80, alignItems: 'center' }}>
              <Text style={{ color: '#3f3f46', fontSize: 15 }}>No history yet</Text>
              <Text style={{ color: '#27272a', fontSize: 13, marginTop: 6 }}>
                Log a set to see it here
              </Text>
            </View>
          }
          ListFooterComponent={
            loadingMore ? (
              <View style={{ paddingVertical: 20, alignItems: 'center' }}>
                <ActivityIndicator color="#52525b" size="small" />
              </View>
            ) : null
          }
        />
      )}
    </View>
  );
}
