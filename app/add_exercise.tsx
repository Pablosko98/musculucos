import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  Alert,
  Animated,
  Dimensions,
  View,
  ScrollView,
  TouchableOpacity,
  TextInput,
} from 'react-native';
import { Text } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Exercise, HEAD_LABELS } from '@/lib/exercises';
import { ExerciseDAL } from '@/lib/db';
import { Search, Link, Star, X } from 'lucide-react-native';
import { router, useFocusEffect } from 'expo-router';
import { setActiveBlock } from '@/lib/block-state';
import { takePendingExerciseAdd } from '@/lib/pending-exercise-add';

const { width, height: screenHeight } = Dimensions.get('window');

type SubFilter = { label: string; muscle?: string; head?: string };
type FilterGroup = { groupId: string; groupLabel: string; subFilters: SubFilter[] };
type ExerciseGroup = {
  baseId: string;
  name: string;
  variants: Exercise[];
  primaryMuscles: string[];
  primaryEmphasis: { muscle: string; head?: string }[];
};

function buildFilterGroups(
  exs: Exercise[],
  groupMap: Record<string, { groupId: string; groupLabel: string }>
): FilterGroup[] {
  const groups = new Map<string, { label: string; subFilters: Map<string, SubFilter> }>();
  for (const ex of exs) {
    for (const em of ex.muscleEmphasis) {
      if (em.role !== 'primary') continue;
      const mapping = groupMap[em.muscle] ?? {
        groupId: em.muscle,
        groupLabel: formatMuscle(em.muscle),
      };
      if (!groups.has(mapping.groupId)) {
        groups.set(mapping.groupId, { label: mapping.groupLabel, subFilters: new Map() });
      }
      const group = groups.get(mapping.groupId)!;
      const sfKey = em.head ? `${em.muscle}:${em.head}` : em.muscle;
      if (!group.subFilters.has(sfKey)) {
        const label = em.head
          ? (HEAD_LABELS[em.head] ?? formatMuscle(em.head))
          : formatMuscle(em.muscle);
        group.subFilters.set(sfKey, { label, muscle: em.muscle, head: em.head });
      }
    }
  }
  return Array.from(groups.entries())
    .sort(([, a], [, b]) => a.label.localeCompare(b.label))
    .map(([groupId, g]) => ({
      groupId,
      groupLabel: g.label,
      subFilters: Array.from(g.subFilters.values()),
    }));
}

function buildExerciseGroups(exs: Exercise[]): ExerciseGroup[] {
  const map = new Map<string, Exercise[]>();
  exs.forEach((ex) => {
    if (!map.has(ex.baseId)) map.set(ex.baseId, []);
    map.get(ex.baseId)!.push(ex);
  });
  return Array.from(map.entries()).map(([baseId, variants]) => {
    const primaryEmphasisAll = variants.flatMap((v) =>
      v.muscleEmphasis
        .filter((m) => m.role === 'primary')
        .map((m) => ({ muscle: m.muscle, head: m.head }))
    );
    const primaryMuscles = Array.from(new Set(primaryEmphasisAll.map((e) => e.muscle)));
    return {
      baseId,
      name: variants[0].name,
      variants,
      primaryMuscles,
      primaryEmphasis: primaryEmphasisAll,
    };
  });
}

function variantLabel(ex: Exercise): string {
  if (ex.equipmentVariant) {
    const v = ex.equipmentVariant.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    return `${v} ${formatEquipment(ex.equipment)}`.trim();
  }
  const suffix = ex.id.startsWith(`${ex.baseId}_`) ? ex.id.slice(ex.baseId.length + 1) : '';
  if (suffix) {
    return suffix
      .replace('ez_bar', 'EZ Bar')
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return formatEquipment(ex.equipment);
}

function formatMuscle(muscle: string): string {
  return muscle.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatEquipment(eq: string): string {
  if (eq === 'ez_bar') return 'EZ Bar';
  return eq.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// Does a group match the active muscle/subfilter?
function matchesMuscle(
  group: ExerciseGroup,
  selectedGroup: string | null,
  selectedSubFilter: SubFilter | null,
  groupMap: Record<string, { groupId: string; groupLabel: string }>
): boolean {
  if (selectedSubFilter) {
    return group.primaryEmphasis.some(
      (e) =>
        (!selectedSubFilter.muscle || e.muscle === selectedSubFilter.muscle) &&
        (!selectedSubFilter.head || e.head === selectedSubFilter.head)
    );
  }
  if (selectedGroup) {
    return group.primaryEmphasis.some(
      (e) => (groupMap[e.muscle]?.groupId ?? e.muscle) === selectedGroup
    );
  }
  return true;
}

// Does a group have at least one variant with this equipment?
function matchesEquipment(group: ExerciseGroup, equipment: string | null): boolean {
  if (!equipment) return true;
  return group.variants.some((v) => v.equipment === equipment);
}

const EQUIPMENT_ORDER = [
  'barbell',
  'dumbbell',
  'cable',
  'machine',
  'bodyweight',
  'ez_bar',
  'kettlebell',
];

export default function AddExercise({
  onAdd,
  dateString,
}: {
  onAdd: (exercises: Exercise[]) => void;
  dateString: string;
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [showFavsOnly, setShowFavsOnly] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [selectedSubFilter, setSelectedSubFilter] = useState<SubFilter | null>(null);
  const [selectedEquipment, setSelectedEquipment] = useState<string | null>(null);
  const [isSupersetMode, setIsSupersetMode] = useState(false);
  const [staged, setStaged] = useState<Exercise[]>([]);
  const [open, setOpen] = useState(false);
  const [dbExercises, setDbExercises] = useState<Exercise[]>([]);
  const [groupMap, setGroupMap] = useState<Record<string, { groupId: string; groupLabel: string }>>(
    {}
  );
  const toastOpacity = useRef(new Animated.Value(0)).current;
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingAdd = useRef<Exercise[] | null>(null);
  const pendingNav = useRef<{ pathname: string; params?: Record<string, string> } | null>(null);

  const showToast = () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    Animated.sequence([
      Animated.timing(toastOpacity, { toValue: 1, duration: 150, useNativeDriver: true }),
      Animated.delay(1800),
      Animated.timing(toastOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start();
  };

  useEffect(() => {
    Promise.all([ExerciseDAL.getAll(), ExerciseDAL.getMuscleGroupMap()]).then(([exs, map]) => {
      setDbExercises(exs as Exercise[]);
      setGroupMap(map);
    });
  }, [open]);

  // Call onAdd only after the dialog's FadeOut animation has finished,
  // so it doesn't conflict with the navigation transition animation.
  useEffect(() => {
    if (open || !pendingAdd.current) return;
    const exercises = pendingAdd.current;
    pendingAdd.current = null;
    const timer = setTimeout(() => onAdd(exercises), 350);
    return () => clearTimeout(timer);
  }, [open]);

  // Navigate only after the dialog's FadeOut animation has finished,
  // so it doesn't conflict with the gesture handler view tree.
  useEffect(() => {
    if (open || !pendingNav.current) return;
    const nav = pendingNav.current;
    pendingNav.current = null;
    const timer = setTimeout(() => router.push(nav as any), 350);
    return () => clearTimeout(timer);
  }, [open]);

  // When returning from create_exercise, auto-add any newly created/edited exercises
  // Only this specific date's instance will match and consume the pending data
  useFocusEffect(
    useCallback(() => {
      const pendingIds = takePendingExerciseAdd(dateString);
      if (!pendingIds || pendingIds.length === 0) return;
      ExerciseDAL.getAll().then((all) => {
        const exercises = pendingIds
          .map((id) => all.find((e) => e.id === id))
          .filter(Boolean) as Exercise[];
        if (exercises.length > 0) onAdd(exercises);
      });
    }, [dateString, onAdd])
  );

  const allGroups = useMemo(() => buildExerciseGroups(dbExercises), [dbExercises]);
  const allFilterGroups = useMemo(
    () => buildFilterGroups(dbExercises, groupMap),
    [dbExercises, groupMap]
  );

  // Groups matching search + fav filter — base for deriving available filter options
  const searchFiltered = useMemo(() => {
    let result = allGroups.filter((g) => g.name.toLowerCase().includes(searchQuery.toLowerCase()));
    if (showFavsOnly) {
      result = result.filter((g) => g.variants.some((v) => v.isFavourite === 1));
    }
    return result;
  }, [allGroups, searchQuery, showFavsOnly]);

  // Muscle group chips: only show groups present in (search + equipment) filtered results
  const availableGroupIds = useMemo(
    () =>
      new Set(
        searchFiltered
          .filter((g) => matchesEquipment(g, selectedEquipment))
          .flatMap((g) => g.primaryEmphasis.map((e) => groupMap[e.muscle]?.groupId ?? e.muscle))
      ),
    [searchFiltered, selectedEquipment, groupMap]
  );

  // Sub-filter chips: only show subdivisions present in (search + group + equipment) filtered results
  const allSubFilters = useMemo(
    () => allFilterGroups.find((g) => g.groupId === selectedGroup)?.subFilters ?? [],
    [allFilterGroups, selectedGroup]
  );
  const availableSubFilterKeys = useMemo(
    () =>
      new Set(
        searchFiltered
          .filter((g) => matchesMuscle(g, selectedGroup, null, groupMap))
          .filter((g) => matchesEquipment(g, selectedEquipment))
          .flatMap((g) =>
            g.primaryEmphasis
              .filter((e) => (groupMap[e.muscle]?.groupId ?? e.muscle) === selectedGroup)
              .map((e) => (e.head ? `${e.muscle}:${e.head}` : e.muscle))
          )
      ),
    [searchFiltered, selectedGroup, selectedEquipment, groupMap]
  );

  // Equipment chips: only show equipment present in (search + muscle + subfilter) filtered results
  const availableEquipment = useMemo(
    () =>
      Array.from(
        new Set(
          searchFiltered
            .filter((g) => matchesMuscle(g, selectedGroup, selectedSubFilter, groupMap))
            .flatMap((g) => g.variants.map((v) => v.equipment))
        )
      ).sort((a, b) => {
        const ia = EQUIPMENT_ORDER.indexOf(a);
        const ib = EQUIPMENT_ORDER.indexOf(b);
        return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
      }),
    [searchFiltered, selectedGroup, selectedSubFilter, groupMap]
  );

  // Final displayed list: all filters applied
  const filteredGroups = useMemo(
    () =>
      searchFiltered
        .filter((g) => matchesMuscle(g, selectedGroup, selectedSubFilter, groupMap))
        .filter((g) => matchesEquipment(g, selectedEquipment)),
    [searchFiltered, selectedGroup, selectedSubFilter, selectedEquipment, groupMap]
  );

  const handleSelect = async (exercise: Exercise) => {
    if (isSupersetMode) {
      const alreadyStaged = staged.find((s) => s.id === exercise.id);
      if (alreadyStaged) {
        setStaged(staged.filter((s) => s.id !== exercise.id));
      } else {
        setStaged([...staged, exercise]);
      }
    } else {
      pendingAdd.current = [exercise];
      resetAndClose();
    }
  };

  const handleSupersetToggle = () => {
    if (isSupersetMode) setStaged([]);
    setIsSupersetMode(!isSupersetMode);
  };

  const resetAndClose = () => {
    setOpen(false);
    setSearchQuery('');
    setShowFavsOnly(false);
    setStaged([]);
    setSelectedGroup(null);
    setSelectedSubFilter(null);
    setSelectedEquipment(null);
    setIsSupersetMode(false);
  };

  const filterRowStyle = (bg = '#09090b') => ({
    height: 36,
    borderBottomWidth: 1,
    borderBottomColor: '#262626',
    backgroundColor: bg,
  });

  const chipStyle = { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999 };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="rounded-full bg-orange-600">
          <Text className="font-bold text-white">+ Add Exercise</Text>
        </Button>
      </DialogTrigger>

      <DialogContent
        className="gap-0 p-0"
        style={{
          backgroundColor: '#09090b',
          width,
          height: screenHeight * 0.9,
          marginTop: 'auto',
          gap: 0,
          padding: 0,
        }}>
        <View style={{ flex: 1 }}>
          <Animated.View
            pointerEvents="none"
            style={{
              position: 'absolute',
              bottom: 24,
              alignSelf: 'center',
              zIndex: 99,
              opacity: toastOpacity,
              backgroundColor: '#27272a',
              borderRadius: 999,
              paddingHorizontal: 18,
              paddingVertical: 10,
              borderWidth: 1,
              borderColor: '#3f3f46',
            }}>
            <Text style={{ color: 'white', fontSize: 13, fontWeight: '700' }}>
              Select equipment for exercise
            </Text>
          </Animated.View>

          {/* Header */}
          <View className="flex-row items-center border-b border-neutral-800 p-4">
            <DialogTitle className="text-white">Add Movement</DialogTitle>
            <TouchableOpacity
              style={{ marginLeft: 10 }}
              onPress={handleSupersetToggle}
              className={`flex-row items-center rounded-full px-3 py-1 ${isSupersetMode ? 'bg-orange-500' : 'bg-neutral-800'}`}>
              <Link size={14} color="white" />
              <Text className="ml-1 text-xs font-bold text-white">
                {isSupersetMode ? 'Superset ON' : 'Superset'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Search */}
          <View className="flex-row items-center bg-neutral-900/50 px-4 py-3">
            <Search size={18} color="#71717a" />
            <TextInput
              placeholder="Search exercises…"
              placeholderTextColor="#71717a"
              value={searchQuery}
              onChangeText={setSearchQuery}
              className="ml-3 h-10 flex-1 text-base text-white"
            />
            {searchQuery !== '' && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <X size={18} color="#71717a" />
              </TouchableOpacity>
            )}
          </View>

          {/* Muscle group chips */}
          <View style={filterRowStyle()}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingHorizontal: 16, alignItems: 'center', gap: 6 }}>
              <TouchableOpacity
                onPress={() => {
                  setSelectedGroup(null);
                  setSelectedSubFilter(null);
                  setShowFavsOnly(false);
                }}
                style={chipStyle}
                className={!selectedGroup && !showFavsOnly ? 'bg-orange-600' : 'bg-neutral-800'}>
                <Text className="text-xs font-semibold text-white">All</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setShowFavsOnly(!showFavsOnly)}
                style={[
                  chipStyle,
                  {
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 4,
                    backgroundColor: showFavsOnly ? '#78350f' : '#3f3f46',
                  },
                ]}>
                <Star size={10} color="#f59e0b" fill={showFavsOnly ? '#f59e0b' : 'transparent'} />
                <Text className="text-xs font-semibold text-white">Fav</Text>
              </TouchableOpacity>
              {allFilterGroups
                .filter((fg) => availableGroupIds.has(fg.groupId) || fg.groupId === selectedGroup)
                .map((fg) => (
                  <TouchableOpacity
                    key={fg.groupId}
                    onPress={() => {
                      if (selectedGroup === fg.groupId) {
                        setSelectedGroup(null);
                        setSelectedSubFilter(null);
                      } else {
                        setSelectedGroup(fg.groupId);
                        setSelectedSubFilter(null);
                      }
                    }}
                    style={chipStyle}
                    className={selectedGroup === fg.groupId ? 'bg-orange-600' : 'bg-neutral-800'}>
                    <Text className="text-xs font-semibold text-white">{fg.groupLabel}</Text>
                  </TouchableOpacity>
                ))}
            </ScrollView>
          </View>

          {/* Sub-filter chips */}
          {allSubFilters.length > 0 && (
            <View style={filterRowStyle('#0a0a0a')}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={{ flex: 1 }}
                contentContainerStyle={{ paddingHorizontal: 16, alignItems: 'center', gap: 6 }}>
                {allSubFilters
                  .filter((sf) => {
                    const key = sf.head ? `${sf.muscle}:${sf.head}` : (sf.muscle ?? '');
                    return availableSubFilterKeys.has(key) || selectedSubFilter?.label === sf.label;
                  })
                  .map((sf) => {
                    const isActive = selectedSubFilter?.label === sf.label;
                    return (
                      <TouchableOpacity
                        key={sf.label}
                        onPress={() => setSelectedSubFilter(isActive ? null : sf)}
                        style={chipStyle}
                        className={isActive ? 'bg-orange-500' : 'bg-neutral-700'}>
                        <Text className="text-xs font-medium text-white">{sf.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
              </ScrollView>
            </View>
          )}

          {/* Equipment chips */}
          <View style={filterRowStyle('#111111')}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingHorizontal: 16, alignItems: 'center', gap: 6 }}>
              <TouchableOpacity
                onPress={() => setSelectedEquipment(null)}
                style={chipStyle}
                className={!selectedEquipment ? 'bg-orange-600' : 'bg-neutral-800'}>
                <Text className="text-xs font-semibold text-white">All</Text>
              </TouchableOpacity>
              {availableEquipment
                .filter((eq) => eq || eq === selectedEquipment)
                .map((eq) => (
                  <TouchableOpacity
                    key={eq}
                    onPress={() => setSelectedEquipment(selectedEquipment === eq ? null : eq)}
                    style={chipStyle}
                    className={selectedEquipment === eq ? 'bg-orange-600' : 'bg-neutral-800'}>
                    <Text className="text-xs font-semibold text-white">{formatEquipment(eq)}</Text>
                  </TouchableOpacity>
                ))}
            </ScrollView>
          </View>

          {/* Exercise list */}
          <ScrollView style={{ flex: 1 }}>
            {filteredGroups.map((group) => {
              const displayVariants = group.variants
                .filter((v) => !selectedEquipment || v.equipment === selectedEquipment)
                .filter((v) => !showFavsOnly || v.isFavourite === 1);
              const isGroupStaged = displayVariants.some((v) => staged.some((s) => s.id === v.id));
              return (
                <TouchableOpacity
                  key={group.baseId}
                  activeOpacity={0.7}
                  onLongPress={() => {
                    if (displayVariants.length === 1) {
                      pendingNav.current = {
                        pathname: '/create_exercise',
                        params: { exerciseId: displayVariants[0].id, autoAdd: 'true', dateString },
                      };
                      resetAndClose();
                    }
                  }}
                  onPress={() => {
                    if (displayVariants.length === 1) {
                      handleSelect(displayVariants[0]);
                    } else {
                      showToast();
                    }
                  }}
                  className={`border-b border-neutral-900 px-5 py-4 ${isGroupStaged ? 'bg-orange-500/10' : ''}`}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text
                      className={`text-lg font-medium ${isGroupStaged ? 'text-orange-400' : 'text-white'}`}>
                      {group.name}
                    </Text>
                  </View>
                  <Text className="mb-3 mt-0.5 text-xs uppercase tracking-widest text-neutral-500">
                    {group.primaryMuscles.map(formatMuscle).join(' · ')}
                  </Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {displayVariants.map((variant) => {
                      const isStaged = staged.some((s) => s.id === variant.id);
                      return (
                        <TouchableOpacity
                          key={variant.id}
                          onPress={() => handleSelect(variant)}
                          onLongPress={() => {
                            pendingNav.current = {
                              pathname: '/create_exercise',
                              params: { exerciseId: variant.id, autoAdd: 'true', dateString },
                            };
                            resetAndClose();
                          }}
                          style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
                          className={`rounded-full px-3 py-1.5 ${isStaged ? 'bg-orange-500' : 'bg-neutral-800'}`}>
                          {!!variant.isFavourite && (
                            <Star size={11} color="#f59e0b" fill="#f59e0b" />
                          )}
                          <Text
                            className={`text-xs font-medium ${isStaged ? 'text-white' : 'text-neutral-300'}`}>
                            {variantLabel(variant)}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity
              className="border-b border-neutral-900 px-5 py-4 active:bg-neutral-800"
              onPress={() => {
                pendingNav.current = {
                  pathname: '/create_exercise',
                  params: { autoAdd: 'true', dateString },
                };
                resetAndClose();
              }}>
              <Text style={{ color: '#ea580c', fontWeight: '600' }}>+ Create new exercise</Text>
            </TouchableOpacity>
          </ScrollView>

          {/* Superset footer */}
          {isSupersetMode && staged.length > 0 && (
            <View className="border-t border-neutral-800 p-4">
              <Button
                className="w-full bg-orange-600"
                onPress={() => {
                  pendingAdd.current = staged;
                  resetAndClose();
                }}>
                <Text className="font-bold text-white">Finish Superset ({staged.length})</Text>
              </Button>
            </View>
          )}
        </View>
      </DialogContent>
    </Dialog>
  );
}
