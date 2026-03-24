import React from 'react';
import { View, FlatList } from 'react-native';
import { Text } from '@/components/ui/text';
import { ChevronRight } from 'lucide-react-native';
import { Exercise } from '@/lib/exercises';
import type { ExerciseStat } from '@/lib/db';
import {
  useExerciseFilters,
  ExerciseGroupCard,
  ExerciseFilterBar,
  ExerciseSearchBar,
  FavouritesPill,
  ExerciseGroup,
} from '@/components/exercises/shared';

export type { ExerciseGroup };

export function ExercisesTab({
  exercises,
  stats,
  loading,
  bottomInset,
  onSelectVariant,
}: {
  exercises: Exercise[];
  stats: Record<string, ExerciseStat>;
  loading: boolean;
  bottomInset: number;
  onSelectVariant: (v: Exercise) => void;
}) {
  const filters = useExerciseFilters(exercises);

  return (
    <View style={{ flex: 1 }}>
      {/* Search + Favourites */}
      <ExerciseSearchBar
        value={filters.search}
        onChangeText={filters.setSearch}
        style={{ marginHorizontal: 16, marginBottom: 6 }}
      />
      <FavouritesPill
        active={filters.showFavsOnly}
        onPress={() => filters.setShowFavsOnly(!filters.showFavsOnly)}
        style={{ marginHorizontal: 16, marginBottom: 8 }}
      />

      {/* Exercise list */}
      <FlatList
        data={filters.filteredGroups}
        keyExtractor={(item) => item.key}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 16, gap: 8 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => (
          <ExerciseGroupCard
            group={item}
            stats={stats}
            onPressVariant={onSelectVariant}
            renderVariantRight={() => <ChevronRight size={15} color="#3f3f46" />}
          />
        )}
        ListHeaderComponent={
          <Text style={{ color: '#52525b', fontSize: 13, marginBottom: 10 }}>
            {loading
              ? 'Loading…'
              : `${filters.filteredGroups.length} exercise${filters.filteredGroups.length !== 1 ? 's' : ''}`}
          </Text>
        }
        ListEmptyComponent={
          loading ? null : (
            <View style={{ paddingTop: 60, alignItems: 'center' }}>
              <Text style={{ color: '#3f3f46', fontSize: 15 }}>No exercises found</Text>
            </View>
          )
        }
      />

      {/* Filter bar */}
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
        bottomInset={bottomInset}
      />
    </View>
  );
}
