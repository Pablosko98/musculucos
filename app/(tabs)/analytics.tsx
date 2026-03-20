import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { View, FlatList, TouchableOpacity, TextInput } from 'react-native';
import { Text } from '@/components/ui/text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, router } from 'expo-router';
import { Search, X } from 'lucide-react-native';
import { ExerciseDAL } from '@/lib/db';
import type { Exercise } from '@/lib/exercises';

const EQUIPMENT_LABELS: Record<string, string> = {
  barbell: 'Barbell',
  dumbbell: 'Dumbbell',
  cable: 'Cable',
  machine: 'Machine',
  bodyweight: 'Bodyweight',
  ez_bar: 'EZ Bar',
};
const EQUIPMENT_COLORS: Record<string, { bg: string; text: string }> = {
  barbell:    { bg: '#1c2e4a', text: '#60a5fa' },
  dumbbell:   { bg: '#162d22', text: '#4ade80' },
  cable:      { bg: '#2a1a3e', text: '#c084fc' },
  machine:    { bg: '#2e1f0a', text: '#fb923c' },
  bodyweight: { bg: '#0f2e2e', text: '#2dd4bf' },
  ez_bar:     { bg: '#2e1021', text: '#f472b6' },
};

function fmt(s: string) {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
function fmtEquipment(eq: string): string {
  return EQUIPMENT_LABELS[eq] ?? fmt(eq);
}
function variantLabel(ex: Exercise): string {
  if (ex.equipmentVariant) {
    return `${fmt(ex.equipmentVariant)} ${fmtEquipment(ex.equipment)}`.trim();
  }
  const suffix = ex.id.startsWith(`${ex.baseId}_`) ? ex.id.slice(ex.baseId.length + 1) : '';
  if (suffix) {
    return suffix.replace('ez_bar', 'EZ Bar').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return fmtEquipment(ex.equipment);
}

type ExerciseGroup = { baseId: string; name: string; variants: Exercise[] };

function buildGroups(exs: Exercise[]): ExerciseGroup[] {
  const map = new Map<string, Exercise[]>();
  for (const ex of exs) {
    if (!map.has(ex.baseId)) map.set(ex.baseId, []);
    map.get(ex.baseId)!.push(ex);
  }
  return Array.from(map.entries()).map(([baseId, variants]) => ({
    baseId,
    name: variants[0].name,
    variants,
  }));
}

function GroupCard({ group, onSelectVariant }: { group: ExerciseGroup; onSelectVariant: (v: Exercise) => void }) {
  return (
    <View
      style={{
        backgroundColor: '#18181b',
        borderRadius: 14,
        borderWidth: 1,
        borderColor: '#27272a',
        marginBottom: 8,
        overflow: 'hidden',
      }}
    >
      <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10 }}>
        <Text style={{ color: '#fafafa', fontSize: 16, fontWeight: '600' }}>{group.name}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 8 }}>
          {group.variants.map((v) => {
            const colors = EQUIPMENT_COLORS[v.equipment] ?? { bg: '#27272a', text: '#a1a1aa' };
            return (
              <TouchableOpacity
                key={v.id}
                onPress={() => onSelectVariant(v)}
                activeOpacity={0.7}
                style={{
                  backgroundColor: colors.bg,
                  borderRadius: 8,
                  paddingHorizontal: 11,
                  paddingVertical: 5,
                }}
              >
                <Text style={{ color: colors.text, fontSize: 13, fontWeight: '500' }}>
                  {variantLabel(v)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </View>
  );
}

export default function Analytics() {
  const insets = useSafeAreaInsets();
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      ExerciseDAL.getAll().then((exs) => {
        setExercises(exs);
        setLoading(false);
      });
    }, [])
  );

  const allGroups = useMemo(() => buildGroups(exercises), [exercises]);

  const filteredGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allGroups;
    return allGroups.filter((g) => g.name.toLowerCase().includes(q));
  }, [allGroups, search]);

  const handleSelectVariant = (v: Exercise) => {
    router.push({
      pathname: '/exercise_history',
      params: {
        exerciseId: v.id,
        exerciseName: v.name,
        baseId: v.baseId,
      },
    });
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#09090b', paddingTop: insets.top }}>
      {/* Header */}
      <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 10 }}>
        <Text style={{ fontSize: 28, fontWeight: '700', color: '#fafafa', letterSpacing: -0.5 }}>
          Analytics
        </Text>
      </View>

      {/* Search */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          marginHorizontal: 16,
          marginBottom: 12,
          backgroundColor: '#18181b',
          borderRadius: 12,
          paddingHorizontal: 12,
          paddingVertical: 10,
          borderWidth: 1,
          borderColor: '#27272a',
        }}
      >
        <Search size={17} color="#71717a" />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search exercises…"
          placeholderTextColor="#52525b"
          style={{ flex: 1, color: '#fafafa', fontSize: 15, marginLeft: 8 }}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <X size={16} color="#71717a" />
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={filteredGroups}
        keyExtractor={(item) => item.baseId}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingBottom: insets.bottom + 16,
        }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => (
          <GroupCard group={item} onSelectVariant={handleSelectVariant} />
        )}
        ListHeaderComponent={
          <Text style={{ color: '#52525b', fontSize: 13, marginBottom: 10 }}>
            {loading ? 'Loading…' : `${filteredGroups.length} exercise${filteredGroups.length !== 1 ? 's' : ''} — tap a variant to view history`}
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
    </View>
  );
}
