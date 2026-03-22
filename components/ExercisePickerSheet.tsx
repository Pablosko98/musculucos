import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  View,
  FlatList,
  TouchableOpacity,
  TextInput,
  Animated,
  Dimensions,
} from 'react-native';
import { Text } from '@/components/ui/text';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Search, X, Plus, Star } from 'lucide-react-native';
import type { Exercise } from '@/lib/exercises';
import { MUSCLE_GROUP_MAP, HEAD_LABELS } from '@/lib/exercises';
import { ExerciseDAL } from '@/lib/db';
import type { ExerciseStat } from '@/lib/db';
import { router } from 'expo-router';
import { setPendingExerciseCallback } from '@/lib/pending-exercise-add';

const { width, height: screenHeight } = Dimensions.get('window');

// ─── Constants (mirrored from exercises tab) ──────────────────────────────────

const EQUIPMENT_LABELS: Record<string, string> = {
  barbell: 'Barbell', dumbbell: 'Dumbbell', cable: 'Cable',
  machine: 'Machine', bodyweight: 'Bodyweight', ez_bar: 'EZ Bar',
};
const EQUIPMENT_COLORS: Record<string, { bg: string; text: string }> = {
  barbell: { bg: '#1c2e4a', text: '#60a5fa' },
  dumbbell: { bg: '#162d22', text: '#4ade80' },
  cable: { bg: '#2a1a3e', text: '#c084fc' },
  machine: { bg: '#2e1f0a', text: '#fb923c' },
  bodyweight: { bg: '#0f2e2e', text: '#2dd4bf' },
  ez_bar: { bg: '#2e1021', text: '#f472b6' },
};
const EQUIPMENT_ORDER = ['barbell', 'dumbbell', 'cable', 'machine', 'bodyweight', 'ez_bar'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(s: string) {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
function fmtEquipment(eq: string) {
  return EQUIPMENT_LABELS[eq] ?? fmt(eq);
}
function fmtMuscle(muscle: string) {
  return MUSCLE_GROUP_MAP[muscle]?.groupLabel ?? fmt(muscle);
}
function variantLabel(ex: Exercise) {
  if (ex.equipmentVariant) {
    return `${fmt(ex.equipmentVariant)} ${fmtEquipment(ex.equipment)}`.trim();
  }
  return fmtEquipment(ex.equipment);
}
function relativeTime(dateStr: string | null): string {
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
  } catch { return 'Never'; }
}
function formatBest(stat: ExerciseStat | undefined, equipment: string): string {
  if (!stat || stat.maxWeightKg === null) return '';
  if (stat.maxWeightKg === 0 || equipment === 'bodyweight') {
    return stat.repsAtMaxWeight ? `BW × ${stat.repsAtMaxWeight}` : '';
  }
  const w = `${stat.maxWeightKg}`;
  return stat.repsAtMaxWeight ? `${w} kg × ${stat.repsAtMaxWeight}` : `${w} kg`;
}

// ─── Types ────────────────────────────────────────────────────────────────────

type SubMuscleFilter = { muscle: string; head?: string };
type ExerciseGroup = {
  key: string;
  name: string;
  variants: Exercise[];
  primaryMuscles: string[];
};

// ─── FilterChip ───────────────────────────────────────────────────────────────

function FilterChip({
  label, active, onPress, accent, compact,
}: {
  label: string; active: boolean; onPress: () => void; accent: string; compact?: boolean;
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
      <Text style={{ color: active ? '#fff' : '#a1a1aa', fontSize: compact ? 13 : 14, fontWeight: active ? '600' : '400' }}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

// ─── PickerGroupCard ──────────────────────────────────────────────────────────

function PickerGroupCard({
  group,
  stats,
  stagedIds,
  excludeIds,
  onSelect,
}: {
  group: ExerciseGroup;
  stats: Record<string, ExerciseStat>;
  stagedIds: Set<string>;
  excludeIds?: Set<string>;
  onSelect: (ex: Exercise) => void;
}) {
  return (
    <View style={{
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
            <View key={m} style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 100, backgroundColor: '#27272a' }}>
              <Text style={{ color: '#71717a', fontSize: 11 }}>{fmtMuscle(m)}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={{ height: 1, backgroundColor: '#27272a' }} />

      {/* Variants */}
      {group.variants.map((variant, i) => {
        const stat = stats[variant.id];
        const best = formatBest(stat, variant.equipment);
        const colors = EQUIPMENT_COLORS[variant.equipment] ?? { bg: '#27272a', text: '#a1a1aa' };
        const isStaged = stagedIds.has(variant.id);
        const isExcluded = excludeIds?.has(variant.id) ?? false;

        return (
          <React.Fragment key={variant.id}>
            {i > 0 && <View style={{ height: 1, backgroundColor: '#27272a', marginHorizontal: 16 }} />}
            <TouchableOpacity
              activeOpacity={isExcluded ? 1 : 0.6}
              disabled={isExcluded}
              onPress={() => !isExcluded && onSelect(variant)}
              style={{
                paddingHorizontal: 16,
                paddingVertical: 12,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                opacity: isExcluded ? 0.35 : 1,
                backgroundColor: isStaged ? 'rgba(234,88,12,0.12)' : 'transparent',
              }}>
              {/* Equipment pill */}
              <View style={{
                paddingHorizontal: 9, paddingVertical: 4, borderRadius: 7,
                backgroundColor: isStaged ? '#ea580c' : colors.bg,
                minWidth: 84, alignItems: 'center',
              }}>
                <Text style={{ color: isStaged ? 'white' : colors.text, fontSize: 12, fontWeight: '500' }}>
                  {variantLabel(variant)}
                </Text>
              </View>
              {!!variant.isFavourite && <Star size={13} color="#f59e0b" fill="#f59e0b" />}

              {/* Stats */}
              <View style={{ flex: 1 }}>
                {best ? (
                  <>
                    <Text style={{ color: '#f4f4f5', fontSize: 14, fontWeight: '500' }}>
                      Best: {best}
                    </Text>
                    {stat && (
                      <Text style={{ color: '#52525b', fontSize: 12, marginTop: 2 }}>
                        {stat.workoutCount} {stat.workoutCount === 1 ? 'session' : 'sessions'}
                        {'  ·  '}{relativeTime(stat.lastTrainedAt)}
                      </Text>
                    )}
                  </>
                ) : (
                  <Text style={{ color: '#3f3f46', fontSize: 13, fontStyle: 'italic' }}>Not started</Text>
                )}
              </View>

              {/* Staged indicator */}
              {isStaged && (
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#ea580c' }} />
              )}
            </TouchableOpacity>
          </React.Fragment>
        );
      })}
    </View>
  );
}

// ─── ExercisePickerSheet ──────────────────────────────────────────────────────

export type ExercisePickerSheetProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  /** Called on single-select (tap a variant). If undefined, multi-select only. */
  onSelect?: (ex: Exercise) => void;
  /** Called when superset staged list is confirmed. Enables superset mode toggle. */
  onSelectMultiple?: (exs: Exercise[]) => void;
  /** These variant IDs are dimmed and unselectable (already in slot). */
  excludeIds?: Set<string>;
  /**
   * If set, "+ Create exercise" navigates to /create_exercise and, on save, the new
   * exercise is passed back via callback. For workout flows pass the dateString; for
   * other flows pass any unique string and the callback handles delivery.
   * If undefined, create button navigates without auto-add callback.
   */
  createContext?: { type: 'workout'; dateString: string } | { type: 'callback'; onCreated: (ex: Exercise) => void };
};

export function ExercisePickerSheet({
  open,
  onClose,
  title = 'Select Exercise',
  onSelect,
  onSelectMultiple,
  excludeIds,
  createContext,
}: ExercisePickerSheetProps) {
  const [allExercises, setAllExercises] = useState<Exercise[]>([]);
  const [stats, setStats] = useState<Record<string, ExerciseStat>>({});
  const [groupMap, setGroupMap] = useState<Record<string, { groupId: string; groupLabel: string }>>({});

  const [search, setSearch] = useState('');
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const [activeSub, setActiveSub] = useState<SubMuscleFilter | null>(null);
  const [activeEquipment, setActiveEquipment] = useState<string | null>(null);
  const [showFavsOnly, setShowFavsOnly] = useState(false);
  const [isSupersetMode, setIsSupersetMode] = useState(false);
  const [staged, setStaged] = useState<Exercise[]>([]);

  const subAnim = useRef(new Animated.Value(0)).current;
  const subVisible = useRef(false);
  const lastGroupRef = useRef<string | null>(null);

  // Load exercises + stats when opened
  useEffect(() => {
    if (!open) return;
    Promise.all([ExerciseDAL.getAll(), ExerciseDAL.getExerciseStats(), ExerciseDAL.getMuscleGroupMap()])
      .then(([exs, st, map]) => {
        setAllExercises(exs);
        setStats(st);
        setGroupMap(map);
      });
  }, [open]);

  // Reset state on close
  useEffect(() => {
    if (!open) {
      setSearch('');
      setActiveGroup(null);
      setActiveSub(null);
      setActiveEquipment(null);
      setShowFavsOnly(false);
      setIsSupersetMode(false);
      setStaged([]);
    }
  }, [open]);

  // Sub-muscle row animation
  useEffect(() => {
    const show = activeGroup !== null;
    if (show) lastGroupRef.current = activeGroup;
    if (show !== subVisible.current) {
      subVisible.current = show;
      Animated.timing(subAnim, { toValue: show ? 1 : 0, duration: 200, useNativeDriver: false }).start();
    }
  }, [activeGroup]);

  // ── Derived data ──

  const filteredGroups = useMemo((): ExerciseGroup[] => {
    const nameMap = new Map<string, Exercise[]>();
    for (const ex of allExercises) {
      const key = ex.name.toLowerCase().trim();
      if (!nameMap.has(key)) nameMap.set(key, []);
      nameMap.get(key)!.push(ex);
    }
    const groups: ExerciseGroup[] = [];
    const q = search.trim().toLowerCase();
    for (const [, variants] of nameMap) {
      const matching = variants.filter((ex) => {
        if (q && !ex.name.toLowerCase().includes(q) && !ex.equipment.toLowerCase().includes(q)) return false;
        if (activeGroup) {
          if (!ex.muscleEmphasis.some((em) => em.role === 'primary' && (groupMap[em.muscle]?.groupId ?? em.muscle) === activeGroup)) return false;
        }
        if (activeSub) {
          if (!ex.muscleEmphasis.some((em) => em.role === 'primary' && em.muscle === activeSub.muscle && (activeSub.head ? em.head === activeSub.head : true))) return false;
        }
        if (activeEquipment && ex.equipment !== activeEquipment) return false;
        if (showFavsOnly && !(ex.isFavourite === 1)) return false;
        return true;
      });
      if (matching.length === 0) continue;
      const primaryMuscles = Array.from(new Set(
        variants.flatMap((v) => v.muscleEmphasis.filter((e) => e.role === 'primary').map((e) => e.muscle))
      )).filter((m) => MUSCLE_GROUP_MAP[m]);
      groups.push({ key: variants[0].name.toLowerCase().trim(), name: variants[0].name, variants: matching, primaryMuscles });
    }
    return groups;
  }, [allExercises, search, activeGroup, activeSub, activeEquipment, showFavsOnly, groupMap]);

  const muscleGroups = useMemo(() => {
    const ids = new Set<string>();
    for (const ex of allExercises) {
      for (const em of ex.muscleEmphasis) {
        if (em.role === 'primary') ids.add(groupMap[em.muscle]?.groupId ?? em.muscle);
      }
    }
    return Array.from(ids)
      .map((id) => ({ id, label: Object.values(groupMap).find((v) => v.groupId === id)?.groupLabel ?? fmt(id) }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [allExercises, groupMap]);

  const allSubOptions = useMemo(() => {
    const result: Record<string, Array<SubMuscleFilter & { label: string }>> = {};
    for (const ex of allExercises) {
      for (const em of ex.muscleEmphasis) {
        if (em.role !== 'primary') continue;
        const gid = groupMap[em.muscle]?.groupId ?? em.muscle;
        if (!result[gid]) result[gid] = [];
        const key = em.head ? `${em.muscle}:${em.head}` : em.muscle;
        if (!result[gid].some((s) => (s.head ? `${s.muscle}:${s.head}` : s.muscle) === key)) {
          result[gid].push({ label: em.head ? (HEAD_LABELS[em.head] ?? fmt(em.head)) : fmtMuscle(em.muscle), muscle: em.muscle, head: em.head });
        }
      }
    }
    return result;
  }, [allExercises, groupMap]);

  const subOptions = allSubOptions[activeGroup ?? lastGroupRef.current ?? ''] ?? [];

  const equipmentOptions = useMemo(() =>
    Array.from(new Set(filteredGroups.flatMap((g) => g.variants.map((v) => v.equipment))))
      .sort((a, b) => {
        const ia = EQUIPMENT_ORDER.indexOf(a);
        const ib = EQUIPMENT_ORDER.indexOf(b);
        return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
      }),
    [filteredGroups]
  );

  const stagedIds = useMemo(() => new Set(staged.map((e) => e.id)), [staged]);

  // ── Handlers ──

  const handleSelect = useCallback((ex: Exercise) => {
    if (isSupersetMode) {
      setStaged((prev) =>
        prev.some((s) => s.id === ex.id) ? prev.filter((s) => s.id !== ex.id) : [...prev, ex]
      );
    } else {
      onSelect?.(ex);
      onClose();
    }
  }, [isSupersetMode, onSelect, onClose]);

  const handleConfirmSuperset = useCallback(() => {
    if (staged.length < 2) return;
    onSelectMultiple?.(staged);
    onClose();
  }, [staged, onSelectMultiple, onClose]);

  const handleCreateExercise = useCallback(() => {
    if (createContext?.type === 'workout') {
      // Existing mechanism: navigate with dateString, auto-add fires via useFocusEffect
      onClose();
      setTimeout(() => router.push({
        pathname: '/create_exercise',
        params: { autoAdd: 'true', dateString: createContext.dateString },
      }), 350);
    } else if (createContext?.type === 'callback') {
      const { onCreated } = createContext;
      setPendingExerciseCallback((ids) => {
        ExerciseDAL.getAll().then((all) => {
          const ex = all.find((e) => e.id === ids[0]);
          if (ex) onCreated(ex);
        });
      });
      onClose();
      setTimeout(() => router.push({ pathname: '/create_exercise', params: { autoAdd: 'true' } }), 350);
    } else {
      onClose();
      setTimeout(() => router.push('/create_exercise'), 350);
    }
  }, [createContext, onClose]);

  const subHeight = subAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 48] });
  const subOpacity = subAnim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 0, 1] });

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent
        className="gap-0 p-0"
        style={{
          backgroundColor: '#09090b',
          width,
          height: screenHeight * 0.92,
          marginTop: 'auto',
          padding: 0,
          gap: 0,
        }}>
        <View style={{ flex: 1 }}>
          {/* ── Header ── */}
          <View style={{
            flexDirection: 'row', alignItems: 'center',
            paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10,
            borderBottomWidth: 1, borderBottomColor: '#1c1c1e',
          }}>
            <DialogTitle style={{ color: '#fafafa', fontSize: 20, fontWeight: '700', flex: 1, letterSpacing: -0.3 }}>
              {title}
            </DialogTitle>
            {onSelectMultiple && (
              <TouchableOpacity
                onPress={() => { setIsSupersetMode((v) => !v); setStaged([]); }}
                style={{
                  paddingHorizontal: 10, paddingVertical: 5, borderRadius: 100, marginRight: 10,
                  backgroundColor: isSupersetMode ? '#ea580c' : '#27272a',
                  borderWidth: 1, borderColor: isSupersetMode ? '#ea580c' : '#3f3f46',
                }}>
                <Text style={{ color: 'white', fontSize: 13, fontWeight: '600' }}>
                  {isSupersetMode ? 'Superset ON' : 'Superset'}
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={handleCreateExercise}
              style={{ padding: 8, backgroundColor: '#18181b', borderRadius: 10, borderWidth: 1, borderColor: '#27272a', marginRight: 8 }}>
              <Plus size={18} color="#ea580c" />
            </TouchableOpacity>
            <TouchableOpacity onPress={onClose} style={{ padding: 8 }}>
              <X size={20} color="#71717a" />
            </TouchableOpacity>
          </View>

          {/* ── Search ── */}
          <View style={{
            flexDirection: 'row', alignItems: 'center',
            backgroundColor: '#18181b', marginHorizontal: 16, marginVertical: 10,
            borderRadius: 12, paddingHorizontal: 12, borderWidth: 1, borderColor: '#27272a',
          }}>
            <Search size={16} color="#71717a" />
            <TextInput
              placeholder="Search exercises…"
              placeholderTextColor="#52525b"
              value={search}
              onChangeText={setSearch}
              style={{ flex: 1, color: 'white', paddingVertical: 10, paddingLeft: 8, fontSize: 15 }}
            />
            {search !== '' && (
              <TouchableOpacity onPress={() => setSearch('')}>
                <X size={16} color="#71717a" />
              </TouchableOpacity>
            )}
          </View>

          {/* ── Exercise list ── */}
          <FlatList
            data={filteredGroups}
            keyExtractor={(item) => item.key}
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16, gap: 8 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={{ paddingTop: 60, alignItems: 'center' }}>
                <Text style={{ color: '#3f3f46', fontSize: 15 }}>No exercises found</Text>
              </View>
            }
            renderItem={({ item }) => (
              <PickerGroupCard
                group={item}
                stats={stats}
                stagedIds={stagedIds}
                excludeIds={excludeIds}
                onSelect={handleSelect}
              />
            )}
          />

          {/* ── Superset confirm footer ── */}
          {isSupersetMode && staged.length >= 2 && (
            <TouchableOpacity
              onPress={handleConfirmSuperset}
              style={{
                margin: 16, marginTop: 0, padding: 16,
                backgroundColor: '#ea580c', borderRadius: 14, alignItems: 'center',
              }}>
              <Text style={{ color: 'white', fontSize: 15, fontWeight: '700' }}>
                Add Superset ({staged.length} exercises)
              </Text>
            </TouchableOpacity>
          )}

          {/* ── Filters (bottom, same layout as exercises tab) ── */}
          <View style={{ borderTopWidth: 1, borderTopColor: '#18181b' }}>
            {/* Equipment */}
            <View style={{ height: 44 }}>
              <FlatList
                horizontal
                showsHorizontalScrollIndicator={false}
                data={[null, ...equipmentOptions]}
                keyExtractor={(item) => item ?? '__all__'}
                contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 6, gap: 7 }}
                renderItem={({ item: eq }) => (
                  <FilterChip
                    label={eq === null ? 'Any' : fmtEquipment(eq)}
                    active={activeEquipment === eq}
                    onPress={() => setActiveEquipment(activeEquipment === eq ? null : eq)}
                    accent="#2563eb"
                    compact
                  />
                )}
              />
            </View>

            {/* Sub-muscles (animated) */}
            <Animated.View style={{ height: subHeight, opacity: subOpacity, overflow: 'hidden' }}>
              <FlatList
                horizontal
                showsHorizontalScrollIndicator={false}
                data={[null, ...subOptions]}
                keyExtractor={(item, i) => item ? `${item.muscle}:${item.head ?? ''}` : '__allsub__'}
                contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 4, gap: 7 }}
                renderItem={({ item: sf }) => (
                  <FilterChip
                    label={sf === null
                      ? `All ${MUSCLE_GROUP_MAP[activeGroup ?? lastGroupRef.current ?? '']?.groupLabel ?? ''}`
                      : sf.label}
                    active={sf === null ? activeSub === null : (activeSub?.muscle === sf.muscle && activeSub?.head === sf.head)}
                    onPress={() => setActiveSub(sf === null ? null : (activeSub?.muscle === sf.muscle && activeSub?.head === sf.head ? null : sf))}
                    accent="#d97706"
                    compact
                  />
                )}
              />
            </Animated.View>

            {/* Muscle groups */}
            <FlatList
              horizontal
              showsHorizontalScrollIndicator={false}
              data={[{ id: '__all__', label: 'All' }, { id: '__fav__', label: '★ Fav' }, ...muscleGroups]}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 12, gap: 7 }}
              renderItem={({ item }) => {
                if (item.id === '__all__') {
                  return <FilterChip label="All" active={activeGroup === null && !showFavsOnly} onPress={() => { setActiveGroup(null); setActiveSub(null); setShowFavsOnly(false); }} accent="#ea580c" />;
                }
                if (item.id === '__fav__') {
                  return <FilterChip label="★ Fav" active={showFavsOnly} onPress={() => setShowFavsOnly(!showFavsOnly)} accent="#f59e0b" />;
                }
                return (
                  <FilterChip
                    label={item.label}
                    active={activeGroup === item.id}
                    onPress={() => {
                      const next = activeGroup === item.id ? null : item.id;
                      setActiveGroup(next);
                      setActiveSub(null);
                    }}
                    accent="#ea580c"
                  />
                );
              }}
            />
          </View>
        </View>
      </DialogContent>
    </Dialog>
  );
}
