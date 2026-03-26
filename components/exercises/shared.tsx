import React, { useState, useMemo, useEffect, useRef } from 'react';
import { View, TouchableOpacity, TextInput, ScrollView, Animated, Alert } from 'react-native';
import { Text } from '@/components/ui/text';
import { Search, Star, X } from 'lucide-react-native';
import type { Exercise } from '@/lib/exercises';
import { MUSCLE_GROUP_MAP, HEAD_LABELS } from '@/lib/exercises';
import type { ExerciseStat } from '@/lib/db';
import { EQUIPMENT_COLORS, fmtEquipment, variantLabel, fmt } from '@/components/analytics/analyticsUtils';

// ─── Types ────────────────────────────────────────────────────────────────────

export type SubMuscleFilter = { muscle: string; head?: string };
export type ExerciseGroup = {
  key: string;
  name: string;
  variants: Exercise[];
  primaryMuscles: string[];
};

// ─── Re-exports for consumers ─────────────────────────────────────────────────

export { EQUIPMENT_COLORS, fmtEquipment, variantLabel, fmt };

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function fmtMuscle(muscle: string): string {
  return MUSCLE_GROUP_MAP[muscle]?.groupLabel ?? fmt(muscle);
}

export function relativeTime(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  try {
    const d = new Date(dateStr.replace(' ', 'T'));
    if (isNaN(d.getTime())) return 'Never';
    const diffDays = Math.floor((Date.now() - d.getTime()) / 86_400_000);
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
    if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;
    return `${Math.floor(diffDays / 365)}y ago`;
  } catch {
    return 'Never';
  }
}

export function formatBest(stat: ExerciseStat | undefined, equipment: string): string {
  if (!stat || stat.maxWeightKg === null) return '—';
  const reps = stat.repsAtMaxWeight;
  if (stat.maxWeightKg === 0 || equipment === 'bodyweight') {
    return reps ? `BW × ${reps}` : 'Bodyweight';
  }
  const w = `${stat.maxWeightKg}`;
  return reps ? `${w} kg × ${reps}` : `${w} kg`;
}

// ─── FilterChip ───────────────────────────────────────────────────────────────

export function FilterChip({
  label,
  active,
  onPress,
  accent,
  compact,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  accent: string;
  compact?: boolean;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={{
        paddingHorizontal: compact ? 11 : 14,
        paddingVertical: compact ? 5 : 8,
        borderRadius: 100,
        backgroundColor: active ? accent : '#27272a',
        borderWidth: 1,
        borderColor: active ? accent : '#3f3f46',
      }}>
      <Text
        style={{
          color: active ? '#fff' : '#a1a1aa',
          fontSize: compact ? 13 : 14,
          fontWeight: active ? '600' : '400',
        }}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

// ─── FavouritesPill ───────────────────────────────────────────────────────────

export function FavouritesPill({
  active,
  onPress,
  style,
}: {
  active: boolean;
  onPress: () => void;
  style?: object;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={[
        {
          alignSelf: 'flex-start',
          flexDirection: 'row',
          alignItems: 'center',
          gap: 5,
          paddingHorizontal: 12,
          paddingVertical: 5,
          borderRadius: 100,
          backgroundColor: active ? '#78350f' : '#27272a',
          borderWidth: 1,
          borderColor: active ? '#f59e0b' : '#3f3f46',
        },
        style,
      ]}>
      <Star size={12} color="#f59e0b" fill={active ? '#f59e0b' : 'transparent'} />
      <Text
        style={{
          color: active ? '#fbbf24' : '#a1a1aa',
          fontSize: 13,
          fontWeight: active ? '600' : '400',
        }}>
        Favourites
      </Text>
    </TouchableOpacity>
  );
}

// ─── ExerciseSearchBar ────────────────────────────────────────────────────────

export function ExerciseSearchBar({
  value,
  onChangeText,
  style,
}: {
  value: string;
  onChangeText: (text: string) => void;
  style?: object;
}) {
  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: '#18181b',
          borderRadius: 12,
          paddingHorizontal: 12,
          paddingVertical: 8,
          borderWidth: 1,
          borderColor: '#3f3f46',
        },
        style,
      ]}>
      <Search size={17} color="#71717a" />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder="Search exercises…"
        placeholderTextColor="#52525b"
        style={{ flex: 1, color: '#fafafa', fontSize: 15, marginLeft: 8 }}
      />
      {value.length > 0 && (
        <TouchableOpacity
          onPress={() => onChangeText('')}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <X size={17} color="#71717a" />
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── useExerciseFilters ───────────────────────────────────────────────────────

export function useExerciseFilters(exercises: Exercise[]) {
  const [search, setSearch] = useState('');
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const [activeSub, setActiveSub] = useState<SubMuscleFilter | null>(null);
  const [activeEquipment, setActiveEquipment] = useState<string | null>(null);
  const [showFavsOnly, setShowFavsOnly] = useState(false);

  const subAnim = useRef(new Animated.Value(0)).current;
  const subVisible = useRef(false);
  const lastGroupRef = useRef<string | null>(null);

  useEffect(() => {
    const show = activeGroup !== null;
    if (show) lastGroupRef.current = activeGroup;
    if (show !== subVisible.current) {
      subVisible.current = show;
      Animated.timing(subAnim, {
        toValue: show ? 1 : 0,
        duration: 200,
        useNativeDriver: false,
      }).start();
    }
  }, [activeGroup]);

  const muscleGroups = useMemo(() => {
    const seen = new Map<string, string>();
    for (const ex of exercises) {
      for (const em of ex.muscleEmphasis) {
        if (em.role === 'primary' && !seen.has(em.muscle)) {
          seen.set(em.muscle, MUSCLE_GROUP_MAP[em.muscle]?.groupLabel ?? fmt(em.muscle));
        }
      }
    }
    return Array.from(seen.entries())
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [exercises]);

  const allSubOptions = useMemo(() => {
    const result: Record<string, Array<SubMuscleFilter & { label: string }>> = {};
    for (const ex of exercises) {
      for (const em of ex.muscleEmphasis) {
        if (em.role !== 'primary') continue;
        if (!result[em.muscle]) result[em.muscle] = [];
        const key = em.head ? `${em.muscle}:${em.head}` : em.muscle;
        if (!result[em.muscle].some((s) => (s.head ? `${s.muscle}:${s.head}` : s.muscle) === key)) {
          result[em.muscle].push({
            label: em.head ? (HEAD_LABELS[em.head] ?? fmt(em.head)) : fmtMuscle(em.muscle),
            muscle: em.muscle,
            head: em.head,
          });
        }
      }
    }
    return result;
  }, [exercises]);

  const subOptions = allSubOptions[activeGroup ?? lastGroupRef.current ?? ''] ?? [];

  const equipmentOptions = useMemo(
    () => Array.from(new Set(exercises.map((e) => e.equipment))).sort((a, b) => a.localeCompare(b)),
    [exercises]
  );

  const filteredGroups = useMemo((): ExerciseGroup[] => {
    const nameMap = new Map<string, Exercise[]>();
    for (const ex of exercises) {
      const key = ex.name.toLowerCase().trim();
      if (!nameMap.has(key)) nameMap.set(key, []);
      nameMap.get(key)!.push(ex);
    }

    const groups: ExerciseGroup[] = [];
    const q = search.trim().toLowerCase();

    for (const [nameKey, variants] of nameMap) {
      const matching = variants.filter((ex) => {
        if (q && !ex.name.toLowerCase().includes(q) && !ex.equipment.toLowerCase().includes(q))
          return false;
        if (activeGroup) {
          if (!ex.muscleEmphasis.some((em) => em.role === 'primary' && em.muscle === activeGroup))
            return false;
        }
        if (activeSub) {
          if (
            !ex.muscleEmphasis.some(
              (em) =>
                em.role === 'primary' &&
                em.muscle === activeSub.muscle &&
                (activeSub.head ? em.head === activeSub.head : true)
            )
          )
            return false;
        }
        if (activeEquipment && ex.equipment !== activeEquipment) return false;
        if (showFavsOnly && !(ex.isFavourite === 1)) return false;
        return true;
      });

      if (matching.length === 0) continue;

      const primaryMuscles = Array.from(
        new Set(
          variants.flatMap((v) =>
            v.muscleEmphasis.filter((e) => e.role === 'primary').map((e) => e.muscle)
          )
        )
      );

      groups.push({ key: nameKey, name: variants[0].name, variants: matching, primaryMuscles });
    }

    return groups;
  }, [exercises, search, activeGroup, activeSub, activeEquipment, showFavsOnly]);

  const subHeight = subAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 50] });
  const subOpacity = subAnim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 0, 1] });

  const handleGroupPress = (id: string | null) => {
    if (id === null) {
      setActiveGroup(null);
      setActiveSub(null);
      return;
    }
    const next = activeGroup === id ? null : id;
    setActiveGroup(next);
    setActiveSub(null);
  };

  return {
    search, setSearch,
    activeGroup, setActiveGroup,
    activeSub, setActiveSub,
    activeEquipment, setActiveEquipment,
    showFavsOnly, setShowFavsOnly,
    filteredGroups,
    muscleGroups,
    subOptions,
    equipmentOptions,
    subHeight,
    subOpacity,
    lastGroupRef,
    handleGroupPress,
  };
}

// ─── ExerciseFilterBar ────────────────────────────────────────────────────────

export function ExerciseFilterBar({
  equipmentOptions,
  activeEquipment,
  setActiveEquipment,
  subHeight,
  subOpacity,
  subOptions,
  activeSub,
  setActiveSub,
  activeGroup,
  lastGroupRef,
  muscleGroups,
  handleGroupPress,
  bottomInset = 0,
}: {
  equipmentOptions: string[];
  activeEquipment: string | null;
  setActiveEquipment: (v: string | null) => void;
  subHeight: Animated.AnimatedInterpolation<number>;
  subOpacity: Animated.AnimatedInterpolation<number>;
  subOptions: Array<SubMuscleFilter & { label: string }>;
  activeSub: SubMuscleFilter | null;
  setActiveSub: (v: SubMuscleFilter | null) => void;
  activeGroup: string | null;
  lastGroupRef: React.MutableRefObject<string | null>;
  muscleGroups: Array<{ id: string; label: string }>;
  handleGroupPress: (id: string | null) => void;
  bottomInset?: number;
}) {
  return (
    <View style={{ borderTopWidth: 1, borderTopColor: '#18181b', marginHorizontal: 16 }}>
      {/* Row 1: Equipment */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: 8,
          paddingBottom: 4,
          gap: 7,
          flexDirection: 'row',
        }}>
        <FilterChip
          label="Any"
          active={activeEquipment === null}
          onPress={() => setActiveEquipment(null)}
          accent="#2563eb"
          compact
        />
        {equipmentOptions.map((eq) => (
          <FilterChip
            key={eq}
            label={fmtEquipment(eq)}
            active={activeEquipment === eq}
            onPress={() => setActiveEquipment(activeEquipment === eq ? null : eq)}
            accent="#2563eb"
            compact
          />
        ))}
      </ScrollView>

      {/* Row 2: Sub-muscles (animated) */}
      <Animated.View style={{ height: subHeight, opacity: subOpacity, overflow: 'hidden' }}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{
            paddingVertical: 4,
            gap: 7,
            flexDirection: 'row',
          }}>
          <FilterChip
            label={`All ${MUSCLE_GROUP_MAP[activeGroup ?? lastGroupRef.current ?? '']?.groupLabel ?? ''}`}
            active={activeSub === null}
            onPress={() => setActiveSub(null)}
            accent="#d97706"
            compact
          />
          {subOptions.map((sf, i) => (
            <FilterChip
              key={i}
              label={sf.label}
              active={activeSub?.muscle === sf.muscle && activeSub?.head === sf.head}
              onPress={() =>
                setActiveSub(
                  activeSub?.muscle === sf.muscle && activeSub?.head === sf.head
                    ? null
                    : { muscle: sf.muscle, head: sf.head }
                )
              }
              accent="#d97706"
              compact
            />
          ))}
        </ScrollView>
      </Animated.View>

      {/* Row 3: Muscle groups */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          paddingVertical: 4,
          paddingBottom: bottomInset + 8,
          gap: 7,
          flexDirection: 'row',
        }}>
        <FilterChip
          label="All"
          active={activeGroup === null}
          onPress={() => handleGroupPress(null)}
          accent="#ea580c"
        />
        {muscleGroups.map((g) => (
          <FilterChip
            key={g.id}
            label={g.label}
            active={activeGroup === g.id}
            onPress={() => handleGroupPress(g.id)}
            accent="#ea580c"
          />
        ))}
      </ScrollView>
    </View>
  );
}

// ─── ExerciseGroupCard ────────────────────────────────────────────────────────

export function ExerciseGroupCard({
  group,
  stats,
  onPressVariant,
  onPressHeader,
  renderVariantRight,
  isVariantDisabled,
  getVariantRowStyle,
  getPillOverride,
}: {
  group: ExerciseGroup;
  stats: Record<string, ExerciseStat>;
  onPressVariant: (ex: Exercise) => void;
  onPressHeader?: (group: ExerciseGroup) => void;
  renderVariantRight?: (ex: Exercise) => React.ReactNode;
  isVariantDisabled?: (ex: Exercise) => boolean;
  getVariantRowStyle?: (ex: Exercise) => object;
  getPillOverride?: (ex: Exercise) => { bg: string; text: string } | null;
}) {
  const HeaderWrapper = onPressHeader ? TouchableOpacity : View;
  const headerProps = onPressHeader
    ? { activeOpacity: 0.7, onPress: () => onPressHeader(group) }
    : {};

  return (
    <View
      style={{
        backgroundColor: '#18181b',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#27272a',
        overflow: 'hidden',
      }}>
      {/* Card header */}
      <HeaderWrapper {...(headerProps as any)} style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10 }}>
        <Text style={{ color: '#fafafa', fontSize: 17, fontWeight: '600', letterSpacing: -0.3 }}>
          {group.name}
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 5 }}>
          {group.primaryMuscles.map((m) => (
            <View
              key={m}
              style={{
                paddingHorizontal: 7,
                paddingVertical: 2,
                borderRadius: 100,
                backgroundColor: '#27272a',
              }}>
              <Text style={{ color: '#71717a', fontSize: 11 }}>{fmtMuscle(m)}</Text>
            </View>
          ))}
        </View>
      </HeaderWrapper>

      {/* Divider */}
      <View style={{ height: 1, backgroundColor: '#27272a' }} />

      {/* Variants */}
      {group.variants.map((variant, i) => {
        const stat = stats[variant.id];
        const trained = stat && stat.workoutCount > 0;
        const baseColors = EQUIPMENT_COLORS[variant.equipment] ?? { bg: '#27272a', text: '#a1a1aa' };
        const pillColors = getPillOverride?.(variant) ?? baseColors;
        const disabled = isVariantDisabled?.(variant) ?? false;
        const rowStyle = getVariantRowStyle?.(variant) ?? {};

        return (
          <React.Fragment key={variant.id}>
            {i > 0 && (
              <View style={{ height: 1, backgroundColor: '#27272a', marginHorizontal: 16 }} />
            )}
            <TouchableOpacity
              activeOpacity={disabled ? 1 : 0.6}
              disabled={disabled}
              onPress={() => !disabled && onPressVariant(variant)}
              style={[
                {
                  paddingHorizontal: 16,
                  paddingVertical: 12,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                },
                rowStyle,
              ]}>
              {/* Equipment pill + fav star */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                <View
                  style={{
                    paddingHorizontal: 9,
                    paddingVertical: 4,
                    borderRadius: 7,
                    backgroundColor: pillColors.bg,
                    minWidth: 84,
                    alignItems: 'center',
                  }}>
                  <Text style={{ color: pillColors.text, fontSize: 12, fontWeight: '500' }}>
                    {variantLabel(variant)}
                  </Text>
                </View>
                {!!variant.isFavourite && <Star size={13} color="#f59e0b" fill="#f59e0b" />}
              </View>

              {/* Stats */}
              <View style={{ flex: 1 }}>
                {trained ? (
                  <>
                    <Text style={{ color: '#f4f4f5', fontSize: 14, fontWeight: '500' }}>
                      Best: {formatBest(stat, variant.equipment)}
                    </Text>
                    <Text style={{ color: '#52525b', fontSize: 12, marginTop: 2 }}>
                      {stat.workoutCount} {stat.workoutCount === 1 ? 'session' : 'sessions'}
                      {'  ·  '}
                      {relativeTime(stat.lastTrainedAt)}
                    </Text>
                  </>
                ) : (
                  <Text style={{ color: '#3f3f46', fontSize: 13, fontStyle: 'italic' }}>
                    Not started
                  </Text>
                )}
              </View>

              {/* Right element */}
              {renderVariantRight?.(variant)}
            </TouchableOpacity>
          </React.Fragment>
        );
      })}
    </View>
  );
}
