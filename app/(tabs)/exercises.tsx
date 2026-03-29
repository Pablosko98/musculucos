import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Text } from '@/components/ui/text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, router, useLocalSearchParams } from 'expo-router';
import { Plus, Pencil } from 'lucide-react-native';
import { Exercise, MUSCLE_GROUP_MAP, HEAD_LABELS } from '@/lib/exercises';
import { ExerciseDAL } from '@/lib/db';
import type { ExerciseStat } from '@/lib/db';
import {
  useExerciseFilters,
  ExerciseGroupCard,
  ExerciseFilterBar,
  ExerciseSearchBar,
  FavouritesPill,
  fmtEquipment,
  fmt,
} from '@/components/exercises/shared';

export default function Exercises() {
  const insets = useSafeAreaInsets();
  const { focusName } = useLocalSearchParams<{ focusName?: string }>();
  const flatListRef = useRef<FlatList>(null);

  const [allExercises, setAllExercises] = useState<Exercise[]>([]);
  const [stats, setStats] = useState<Record<string, ExerciseStat>>({});
  const [loading, setLoading] = useState(true);

  const filters = useExerciseFilters(allExercises);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        setLoading(true);
        try {
          const [exs, s] = await Promise.all([
            ExerciseDAL.getAll(),
            ExerciseDAL.getExerciseStats(),
          ]);
          if (!cancelled) {
            setAllExercises(exs);
            setStats(s);
          }
        } catch (e) {
          console.error('Exercises load error:', e);
          try {
            const exs = await ExerciseDAL.getAll();
            if (!cancelled) setAllExercises(exs);
          } catch {}
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [])
  );

  // Reload list when returning from create_exercise (focusName param is set)
  useEffect(() => {
    if (!focusName) return;
    Promise.all([ExerciseDAL.getAll(), ExerciseDAL.getExerciseStats()]).then(([exs, s]) => {
      setAllExercises(exs);
      setStats(s);
    });
  }, [focusName]);

  // Scroll to newly created exercise when navigated here with focusName
  const scrolledForRef = useRef<string | null>(null);
  useEffect(() => {
    if (!focusName || loading || filters.filteredGroups.length === 0) return;
    if (scrolledForRef.current === focusName) return;
    const idx = filters.filteredGroups.findIndex((g) => g.key === focusName.toLowerCase().trim());
    if (idx < 0) return;
    scrolledForRef.current = focusName;
    setTimeout(() => {
      try {
        flatListRef.current?.scrollToIndex({ index: idx, animated: true, viewPosition: 0.3 });
      } catch {}
    }, 100);
  }, [focusName, loading, filters.filteredGroups]);

  const crumbs = [
    filters.activeGroup ? MUSCLE_GROUP_MAP[filters.activeGroup]?.groupLabel : null,
    filters.activeSub?.head ? (HEAD_LABELS[filters.activeSub.head] ?? fmt(filters.activeSub.head)) : null,
    filters.activeEquipment ? fmtEquipment(filters.activeEquipment) : null,
  ].filter(Boolean);

  return (
    <View style={{ flex: 1, backgroundColor: '#09090b', paddingTop: insets.top }}>
      {/* Header */}
      <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 8 }}>
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 8,
          }}>
          <Text style={{ fontSize: 28, fontWeight: '700', color: '#fafafa', letterSpacing: -0.5 }}>
            Exercises
          </Text>
          <TouchableOpacity
            onPress={() => router.push('/create_exercise')}
            style={{
              padding: 8,
              backgroundColor: '#18181b',
              borderRadius: 10,
              borderWidth: 1,
              borderColor: '#27272a',
            }}>
            <Plus size={19} color="#ea580c" />
          </TouchableOpacity>
        </View>
        <ExerciseSearchBar value={filters.search} onChangeText={filters.setSearch} />
        <FavouritesPill
          active={filters.showFavsOnly}
          onPress={() => filters.setShowFavsOnly(!filters.showFavsOnly)}
          style={{ marginTop: 8 }}
        />
      </View>

      {/* Exercise list */}
      <FlatList
        ref={flatListRef}
        data={filters.filteredGroups}
        keyExtractor={(item) => item.key}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 8,
          paddingBottom: 16,
          gap: 8,
        }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        onScrollToIndexFailed={() => {}}
        renderItem={({ item }) => (
          <ExerciseGroupCard
            group={item}
            stats={stats}
            onPressVariant={(variant) =>
              router.push({ pathname: '/create_exercise', params: { exerciseId: variant.id } })
            }
            renderVariantRight={() => <Pencil size={15} color="#52525b" />}
          />
        )}
        ListHeaderComponent={
          <View style={{ paddingBottom: 4, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {loading
              ? <ActivityIndicator size="small" color="#ea580c" />
              : <Text style={{ color: '#52525b', fontSize: 13 }}>{filters.filteredGroups.length} {filters.filteredGroups.length === 1 ? 'exercise' : 'exercises'}</Text>
            }
            {crumbs.map((c, i) => (
              <React.Fragment key={i}>
                <Text style={{ color: '#3f3f46', fontSize: 13 }}>·</Text>
                <Text style={{ color: '#52525b', fontSize: 13 }}>{c}</Text>
              </React.Fragment>
            ))}
          </View>
        }
        ListEmptyComponent={
          loading ? null : (
            <View style={{ paddingTop: 60, alignItems: 'center' }}>
              <Text style={{ color: '#3f3f46', fontSize: 15 }}>No exercises found</Text>
            </View>
          )
        }
      />

      {/* Filters (bottom) */}
      <ExerciseFilterBar
        equipmentOptions={filters.equipmentOptions}
        activeEquipment={filters.activeEquipment}
        setActiveEquipment={filters.setActiveEquipment}
        subHeight={filters.subHeight}
        subOpacity={filters.subOpacity}
        subOptions={filters.subOptions}
        activeSub={filters.activeSub}
        setActiveSub={filters.setActiveSub}
        activeGroup={filters.activeGroup}
        lastGroupRef={filters.lastGroupRef}
        muscleGroups={filters.muscleGroups}
        handleGroupPress={filters.handleGroupPress}
        bottomInset={insets.bottom}
      />
    </View>
  );
}
