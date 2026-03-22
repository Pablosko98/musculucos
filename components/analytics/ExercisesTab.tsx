import React, { useState, useMemo } from 'react';
import { View, FlatList, TouchableOpacity, TextInput } from 'react-native';
import { Text } from '@/components/ui/text';
import { Search, X, Star } from 'lucide-react-native';
import type { Exercise } from '@/lib/exercises';
import { EQUIPMENT_COLORS, variantLabel, fmtEquipment, fmt } from './analyticsUtils';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ExerciseGroup = { key: string; name: string; variants: Exercise[] };

export function buildGroups(exs: Exercise[]): ExerciseGroup[] {
  const map = new Map<string, Exercise[]>();
  for (const ex of exs) {
    const key = ex.name.toLowerCase().trim();
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(ex);
  }
  return Array.from(map.entries()).map(([key, variants]) => ({
    key,
    name: variants[0].name,
    variants,
  }));
}

// ─── GroupCard ────────────────────────────────────────────────────────────────

function GroupCard({
  group,
  onSelectVariant,
}: {
  group: ExerciseGroup;
  onSelectVariant: (v: Exercise) => void;
}) {
  return (
    <View
      style={{
        backgroundColor: '#18181b',
        borderRadius: 14,
        borderWidth: 1,
        borderColor: '#27272a',
        marginBottom: 8,
        overflow: 'hidden',
      }}>
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
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 5,
                }}>
                <Text style={{ color: colors.text, fontSize: 13, fontWeight: '500' }}>
                  {variantLabel(v)}
                </Text>
                {!!v.isFavourite && <Star size={11} color="#f59e0b" fill="#f59e0b" />}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </View>
  );
}

// ─── ExercisesTab ─────────────────────────────────────────────────────────────

export function ExercisesTab({
  groups,
  loading,
  bottomInset,
  onSelectVariant,
}: {
  groups: ExerciseGroup[];
  loading: boolean;
  bottomInset: number;
  onSelectVariant: (v: Exercise) => void;
}) {
  const [search, setSearch] = useState('');
  const [showFavsOnly, setShowFavsOnly] = useState(false);

  const filtered = useMemo(() => {
    let result = search.trim()
      ? groups.filter((g) => g.name.toLowerCase().includes(search.trim().toLowerCase()))
      : groups;
    if (showFavsOnly) {
      result = result
        .map((g) => ({ ...g, variants: g.variants.filter((v) => v.isFavourite === 1) }))
        .filter((g) => g.variants.length > 0);
    }
    return result;
  }, [groups, search, showFavsOnly]);

  return (
    <>
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
        }}>
        <Search size={17} color="#71717a" />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search exercises…"
          placeholderTextColor="#52525b"
          style={{ flex: 1, color: '#fafafa', fontSize: 15, marginLeft: 8 }}
        />
        {search.length > 0 && (
          <TouchableOpacity
            onPress={() => setSearch('')}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <X size={16} color="#71717a" />
          </TouchableOpacity>
        )}
      </View>
      <TouchableOpacity
        onPress={() => setShowFavsOnly(!showFavsOnly)}
        activeOpacity={0.7}
        style={{
          marginHorizontal: 16,
          marginBottom: 10,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          alignSelf: 'flex-start',
          paddingHorizontal: 12,
          paddingVertical: 5,
          borderRadius: 100,
          backgroundColor: showFavsOnly ? '#78350f' : '#27272a',
          borderWidth: 1,
          borderColor: showFavsOnly ? '#f59e0b' : '#3f3f46',
        }}>
        <Star size={12} color="#f59e0b" fill={showFavsOnly ? '#f59e0b' : 'transparent'} />
        <Text style={{ color: showFavsOnly ? '#fbbf24' : '#a1a1aa', fontSize: 13, fontWeight: showFavsOnly ? '600' : '400' }}>
          Favourites
        </Text>
      </TouchableOpacity>
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.key}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: bottomInset + 16 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => (
          <GroupCard group={item} onSelectVariant={onSelectVariant} />
        )}
        ListHeaderComponent={
          <Text style={{ color: '#52525b', fontSize: 13, marginBottom: 10 }}>
            {loading
              ? 'Loading…'
              : `${filtered.length} exercise${filtered.length !== 1 ? 's' : ''} — tap a variant to view history`}
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
    </>
  );
}
