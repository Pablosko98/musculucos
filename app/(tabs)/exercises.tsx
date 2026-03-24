import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { View, ScrollView, FlatList, TouchableOpacity, TextInput, Animated } from 'react-native';
import { Text } from '@/components/ui/text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, router, useLocalSearchParams } from 'expo-router';
import { Search, Star, X, Plus, Pencil } from 'lucide-react-native';
import { Exercise, MUSCLE_GROUP_MAP, HEAD_LABELS } from '@/lib/exercises';
import { ExerciseDAL } from '@/lib/db';
import type { ExerciseStat } from '@/lib/db';

// ─── Constants ────────────────────────────────────────────────────────────────

const EQUIPMENT_ORDER = ['barbell', 'dumbbell', 'cable', 'machine', 'bodyweight', 'ez_bar'];
const EQUIPMENT_LABELS: Record<string, string> = {
  barbell: 'Barbell',
  dumbbell: 'Dumbbell',
  cable: 'Cable',
  machine: 'Machine',
  bodyweight: 'Bodyweight',
  ez_bar: 'EZ Bar',
};
const EQUIPMENT_COLORS: Record<string, { bg: string; text: string }> = {
  barbell: { bg: '#1c2e4a', text: '#60a5fa' },
  dumbbell: { bg: '#162d22', text: '#4ade80' },
  cable: { bg: '#2a1a3e', text: '#c084fc' },
  machine: { bg: '#2e1f0a', text: '#fb923c' },
  bodyweight: { bg: '#0f2e2e', text: '#2dd4bf' },
  ez_bar: { bg: '#2e1021', text: '#f472b6' },
};
const MUSCLE_ORDER = ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'legs', 'abs'];

// ─── Types ────────────────────────────────────────────────────────────────────

type SubMuscleFilter = { muscle: string; head?: string };
type ExerciseGroup = {
  key: string;
  name: string;
  variants: Exercise[];
  primaryMuscles: string[];
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
  return fmtEquipment(ex.equipment);
}
function fmtMuscle(muscle: string): string {
  return MUSCLE_GROUP_MAP[muscle]?.groupLabel ?? fmt(muscle);
}

function relativeTime(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  try {
    // SQLite may store as "YYYY-MM-DD HH:MM:SS" — normalize to ISO
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

function formatBest(stat: ExerciseStat | undefined, equipment: string): string {
  if (!stat || stat.maxWeightKg === null) return '—';
  const reps = stat.repsAtMaxWeight;
  if (stat.maxWeightKg === 0 || equipment === 'bodyweight') {
    return reps ? `BW × ${reps}` : 'Bodyweight';
  }
  const w = Number.isInteger(stat.maxWeightKg) ? `${stat.maxWeightKg}` : `${stat.maxWeightKg}`;
  return reps ? `${w} kg × ${reps}` : `${w} kg`;
}

// ─── FilterChip ───────────────────────────────────────────────────────────────

function FilterChip({
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

// ─── ExerciseGroupCard ────────────────────────────────────────────────────────

function ExerciseGroupCard({
  group,
  stats,
  onEditVariant,
}: {
  group: ExerciseGroup;
  stats: Record<string, ExerciseStat>;
  onEditVariant?: (exerciseId: string) => void;
}) {
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
      <View style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10 }}>
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
      </View>

      {/* Divider */}
      <View style={{ height: 1, backgroundColor: '#27272a' }} />

      {/* Variants */}
      {group.variants.map((variant, i) => {
        const stat = stats[variant.id];
        const trained = stat && stat.workoutCount > 0;
        const colors = EQUIPMENT_COLORS[variant.equipment] ?? { bg: '#27272a', text: '#a1a1aa' };
        const isCustom = !!variant.isCustom;
        const canEdit = !!onEditVariant;

        const rowContent = (
          <View
            style={{
              paddingHorizontal: 16,
              paddingVertical: 12,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
            }}>
            {/* Equipment pill + fav star */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, flexShrink: 0 }}>
              <View
                style={{
                  paddingHorizontal: 9,
                  paddingVertical: 4,
                  borderRadius: 7,
                  backgroundColor: colors.bg,
                  minWidth: 84,
                  alignItems: 'center',
                }}>
                <Text style={{ color: colors.text, fontSize: 12, fontWeight: '500' }}>
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

            {/* Edit icon (custom only) */}
            {canEdit && <Pencil size={15} color="#52525b" />}
          </View>
        );

        return (
          <React.Fragment key={variant.id}>
            {i > 0 && (
              <View style={{ height: 1, backgroundColor: '#27272a', marginHorizontal: 16 }} />
            )}
            {canEdit ? (
              <TouchableOpacity activeOpacity={0.6} onPress={() => onEditVariant!(variant.id)}>
                {rowContent}
              </TouchableOpacity>
            ) : (
              rowContent
            )}
          </React.Fragment>
        );
      })}
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function Exercises() {
  const insets = useSafeAreaInsets();
  const { focusName } = useLocalSearchParams<{ focusName?: string }>();
  const flatListRef = useRef<FlatList>(null);

  const [allExercises, setAllExercises] = useState<Exercise[]>([]);
  const [stats, setStats] = useState<Record<string, ExerciseStat>>({});
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const [activeSub, setActiveSub] = useState<SubMuscleFilter | null>(null);
  const [activeEquipment, setActiveEquipment] = useState<string | null>(null);
  const [showFavsOnly, setShowFavsOnly] = useState(false);

  const subAnim = useRef(new Animated.Value(0)).current;
  const subVisible = useRef(false);
  // Ref (not state) so it updates synchronously with no extra re-renders
  const lastGroupRef = useRef<string | null>(null);

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
          // Try loading just the exercise list without stats on failure
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

  useEffect(() => {
    const show = activeGroup !== null;
    if (show) lastGroupRef.current = activeGroup; // update ref synchronously — no re-render
    if (show !== subVisible.current) {
      subVisible.current = show;
      Animated.timing(subAnim, {
        toValue: show ? 1 : 0,
        duration: 200,
        useNativeDriver: false,
      }).start();
    }
  }, [activeGroup]);

  const muscleGroups = useMemo(
    () =>
      Object.entries(MUSCLE_GROUP_MAP)
        .map(([id, { groupLabel }]) => ({ id, label: groupLabel }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    []
  );

  // Precompute sub-options for every muscle group at load time — just a lookup on tap
  const allSubOptions = useMemo(() => {
    const result: Record<string, Array<SubMuscleFilter & { label: string }>> = {};
    for (const ex of allExercises) {
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
  }, [allExercises]);

  const subOptions = allSubOptions[activeGroup ?? lastGroupRef.current ?? ''] ?? [];

  const equipmentOptions = useMemo(() => {
    return Array.from(new Set(allExercises.map((e) => e.equipment))).sort((a, b) =>
      a.localeCompare(b)
    );
  }, [allExercises]);

  const filteredGroups = useMemo((): ExerciseGroup[] => {
    const nameMap = new Map<string, Exercise[]>();
    for (const ex of allExercises) {
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
      ).filter((m) => MUSCLE_GROUP_MAP[m]);

      groups.push({ key: nameKey, name: variants[0].name, variants: matching, primaryMuscles });
    }

    return groups;
  }, [allExercises, search, activeGroup, activeSub, activeEquipment, showFavsOnly]);

  // Scroll to newly created exercise when navigated here with focusName.
  // Use a ref so we only scroll once per focusName — not on every filter change.
  const scrolledForRef = useRef<string | null>(null);
  useEffect(() => {
    if (!focusName || loading || filteredGroups.length === 0) return;
    if (scrolledForRef.current === focusName) return; // already scrolled for this focusName
    const idx = filteredGroups.findIndex((g) => g.key === focusName.toLowerCase().trim());
    if (idx < 0) return;
    scrolledForRef.current = focusName;
    setTimeout(() => {
      try {
        flatListRef.current?.scrollToIndex({ index: idx, animated: true, viewPosition: 0.3 });
      } catch {}
    }, 100);
  }, [focusName, loading, filteredGroups]);

  const handleGroupPress = (id: string) => {
    const next = activeGroup === id ? null : id;
    setActiveGroup(next);
    setActiveSub(null);
  };

  const subHeight = subAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 50] });
  const subOpacity = subAnim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 0, 1] });

  const crumbs = [
    activeGroup ? MUSCLE_GROUP_MAP[activeGroup]?.groupLabel : null,
    activeSub?.head ? (HEAD_LABELS[activeSub.head] ?? fmt(activeSub.head)) : null,
    activeEquipment ? fmtEquipment(activeEquipment) : null,
  ].filter(Boolean);

  return (
    <View style={{ flex: 1, backgroundColor: '#09090b', paddingTop: insets.top }}>
      {/* ── Header ── */}
      <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 8 }}>
        <View
          style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
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
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: '#18181b',
            borderRadius: 12,
            paddingHorizontal: 12,
            paddingVertical: 8,
            borderWidth: 1,
            borderColor: '#3f3f46',
          }}>
          <Search size={17} color="#71717a" />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search exercises..."
            placeholderTextColor="#52525b"
            style={{ flex: 1, color: '#fafafa', fontSize: 15, marginLeft: 8 }}
          />
          {search.length > 0 && (
            <TouchableOpacity
              onPress={() => setSearch('')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <X size={17} color="#71717a" />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity
          onPress={() => setShowFavsOnly(!showFavsOnly)}
          activeOpacity={0.7}
          style={{
            marginTop: 8,
            alignSelf: 'flex-start',
            flexDirection: 'row',
            alignItems: 'center',
            gap: 5,
            paddingHorizontal: 12,
            paddingVertical: 5,
            borderRadius: 100,
            backgroundColor: showFavsOnly ? '#78350f' : '#27272a',
            borderWidth: 1,
            borderColor: showFavsOnly ? '#f59e0b' : '#3f3f46',
          }}>
          <Star size={12} color="#f59e0b" fill={showFavsOnly ? '#f59e0b' : 'transparent'} />
          <Text
            style={{
              color: showFavsOnly ? '#fbbf24' : '#a1a1aa',
              fontSize: 13,
              fontWeight: showFavsOnly ? '600' : '400',
            }}>
            Favourites
          </Text>
        </TouchableOpacity>
      </View>

      {/* ── Exercise list ── */}
      <FlatList
        ref={flatListRef}
        data={filteredGroups}
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
            onEditVariant={(exerciseId) =>
              router.push({ pathname: '/create_exercise', params: { exerciseId } })
            }
          />
        )}
        ListHeaderComponent={
          <View style={{ paddingBottom: 4, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={{ color: '#52525b', fontSize: 13 }}>
              {loading
                ? 'Loading…'
                : `${filteredGroups.length} ${filteredGroups.length === 1 ? 'exercise' : 'exercises'}`}
            </Text>
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

      {/* ── Filters (bottom) ── */}
      <View style={{ borderTopWidth: 1, borderTopColor: '#18181b' }}>
        {/* Row 1: Equipment */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: 16,
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

        {/* Row 2: Sub-muscles (animated, contextual) */}
        <Animated.View style={{ height: subHeight, opacity: subOpacity, overflow: 'hidden' }}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{
              paddingHorizontal: 16,
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
            paddingHorizontal: 16,
            paddingVertical: 4,
            paddingBottom: insets.bottom + 8,
            gap: 7,
            flexDirection: 'row',
          }}>
          <FilterChip
            label="All"
            active={activeGroup === null}
            onPress={() => {
              setActiveGroup(null);
              setActiveSub(null);
            }}
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
    </View>
  );
}
