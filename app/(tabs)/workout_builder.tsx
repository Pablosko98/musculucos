import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  BackHandler,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Text } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ExerciseDAL, RoutineDAL } from '@/lib/db';
import { type Exercise, HEAD_LABELS } from '@/lib/exercises';
import type { Routine, RoutineExercise } from '@/lib/types';
import { Search, X, ChevronLeft, Plus, Trash2, Link } from 'lucide-react-native';
import { useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';

const { width, height: screenHeight } = Dimensions.get('window');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(s: string) {
  if (s === 'ez_bar') return 'EZ Bar';
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function exerciseLabel(ex: Exercise): string {
  const base = ex.equipmentVariant ? `${fmt(ex.equipmentVariant)} ${fmt(ex.equipment)}` : fmt(ex.equipment);
  return base.trim();
}

// ─── Compact exercise picker (used inside routine builder) ───────────────────

function ExercisePicker({
  open,
  onClose,
  onSelect,
  excludeIds,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (ex: Exercise) => void;
  excludeIds?: Set<string>;
}) {
  const [search, setSearch] = useState('');
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [groupMap, setGroupMap] = useState<Record<string, { groupId: string; groupLabel: string }>>({});

  useEffect(() => {
    if (!open) return;
    Promise.all([ExerciseDAL.getAll(), ExerciseDAL.getMuscleGroupMap()]).then(([exs, map]) => {
      setExercises(exs);
      setGroupMap(map);
    });
  }, [open]);

  useEffect(() => {
    if (!open) {
      setSearch('');
      setSelectedGroup(null);
    }
  }, [open]);

  // Group exercises by movement name
  const grouped = useMemo(() => {
    const map = new Map<string, Exercise[]>();
    for (const ex of exercises) {
      const key = ex.name.toLowerCase();
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(ex);
    }
    return Array.from(map.entries()).map(([, variants]) => ({
      name: variants[0].name,
      variants,
      muscles: Array.from(
        new Set(
          variants.flatMap((v) =>
            v.muscleEmphasis.filter((m) => m.role === 'primary').map((m) => m.muscle)
          )
        )
      ),
    }));
  }, [exercises]);

  const availableGroups = useMemo(() => {
    const ids = new Set<string>();
    for (const g of grouped) {
      for (const v of g.variants) {
        for (const em of v.muscleEmphasis) {
          if (em.role === 'primary') {
            const gid = groupMap[em.muscle]?.groupId ?? em.muscle;
            ids.add(gid);
          }
        }
      }
    }
    return Array.from(ids).sort();
  }, [grouped, groupMap]);

  const filtered = useMemo(() => {
    let result = grouped;
    if (search) result = result.filter((g) => g.name.toLowerCase().includes(search.toLowerCase()));
    if (selectedGroup) {
      result = result.filter((g) =>
        g.variants.some((v) =>
          v.muscleEmphasis.some(
            (em) => em.role === 'primary' && (groupMap[em.muscle]?.groupId ?? em.muscle) === selectedGroup
          )
        )
      );
    }
    return result;
  }, [grouped, search, selectedGroup, groupMap]);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent
        className="gap-0 p-0"
        style={{
          backgroundColor: '#09090b',
          width,
          height: screenHeight * 0.88,
          marginTop: 'auto',
          padding: 0,
          gap: 0,
        }}>
        <View style={{ flex: 1 }}>
          {/* Header */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              padding: 16,
              borderBottomWidth: 1,
              borderBottomColor: '#262626',
            }}>
            <DialogTitle style={{ color: 'white', flex: 1 }}>Select Exercise</DialogTitle>
            <TouchableOpacity onPress={onClose}>
              <X size={20} color="#71717a" />
            </TouchableOpacity>
          </View>

          {/* Search */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: '#18181b',
              marginHorizontal: 16,
              marginVertical: 10,
              borderRadius: 12,
              paddingHorizontal: 12,
            }}>
            <Search size={16} color="#71717a" />
            <TextInput
              placeholder="Search…"
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

          {/* Muscle group chips */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 16, gap: 6, paddingBottom: 8 }}>
            <TouchableOpacity
              onPress={() => setSelectedGroup(null)}
              style={{
                paddingHorizontal: 10,
                paddingVertical: 4,
                borderRadius: 999,
                backgroundColor: !selectedGroup ? '#ea580c' : '#27272a',
              }}>
              <Text style={{ color: 'white', fontSize: 12, fontWeight: '600' }}>All</Text>
            </TouchableOpacity>
            {availableGroups.map((gid) => (
              <TouchableOpacity
                key={gid}
                onPress={() => setSelectedGroup(selectedGroup === gid ? null : gid)}
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 4,
                  borderRadius: 999,
                  backgroundColor: selectedGroup === gid ? '#ea580c' : '#27272a',
                }}>
                <Text style={{ color: 'white', fontSize: 12, fontWeight: '600' }}>{fmt(gid)}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Exercise list */}
          <ScrollView style={{ flex: 1 }}>
            {filtered.map((group) => (
              <View
                key={group.name}
                style={{ borderBottomWidth: 1, borderBottomColor: '#18181b', paddingVertical: 12, paddingHorizontal: 16 }}>
                <Text style={{ color: 'white', fontSize: 16, fontWeight: '600', marginBottom: 4 }}>
                  {group.name}
                </Text>
                <Text style={{ color: '#52525b', fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                  {group.muscles.map(fmt).join(' · ')}
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {group.variants.map((v) => {
                    const excluded = excludeIds?.has(v.id);
                    return (
                      <TouchableOpacity
                        key={v.id}
                        disabled={excluded}
                        onPress={() => {
                          onSelect(v);
                          onClose();
                        }}
                        style={{
                          paddingHorizontal: 12,
                          paddingVertical: 6,
                          borderRadius: 999,
                          backgroundColor: excluded ? '#1c1c1e' : '#27272a',
                          opacity: excluded ? 0.4 : 1,
                        }}>
                        <Text style={{ color: excluded ? '#52525b' : '#d4d4d8', fontSize: 12, fontWeight: '600' }}>
                          {exerciseLabel(v)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            ))}
          </ScrollView>
        </View>
      </DialogContent>
    </Dialog>
  );
}

// ─── Slot Editor ──────────────────────────────────────────────────────────────
// Shows all options in one exercise group and lets user add alternatives.

function SlotGroupEditor({
  groupIndex,
  options,
  allExercises,
  onChange,
  onRemoveGroup,
  canRemoveGroup,
}: {
  groupIndex: number;
  options: string[];
  allExercises: Map<string, Exercise>;
  onChange: (newOptions: string[]) => void;
  onRemoveGroup: () => void;
  canRemoveGroup: boolean;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);

  const usedIds = useMemo(() => new Set(options), [options]);

  return (
    <View
      style={{
        backgroundColor: '#18181b',
        borderRadius: 14,
        padding: 14,
        marginBottom: 10,
      }}>
      {canRemoveGroup && (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <Text style={{ color: '#71717a', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 }}>
            Exercise {groupIndex + 1}
          </Text>
          <TouchableOpacity onPress={onRemoveGroup}>
            <X size={16} color="#ef4444" />
          </TouchableOpacity>
        </View>
      )}

      {options.map((exId, i) => {
        const ex = allExercises.get(exId);
        const isPrimary = i === 0;
        return (
          <View
            key={exId}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingVertical: 10,
              borderBottomWidth: i < options.length - 1 ? 1 : 0,
              borderBottomColor: '#27272a',
              gap: 10,
            }}>
            {/* Position badge */}
            <View
              style={{
                width: 24,
                height: 24,
                borderRadius: 12,
                backgroundColor: isPrimary ? '#1d4ed8' : '#27272a',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
              <Text style={{ color: isPrimary ? '#93c5fd' : '#71717a', fontSize: 11, fontWeight: '800' }}>
                {i + 1}
              </Text>
            </View>

            <View style={{ flex: 1 }}>
              <Text style={{ color: isPrimary ? 'white' : '#a1a1aa', fontSize: 14, fontWeight: isPrimary ? '700' : '500' }}>
                {ex?.name ?? exId}
              </Text>
              {ex && (
                <Text style={{ color: '#52525b', fontSize: 12, marginTop: 2 }}>
                  {exerciseLabel(ex)}
                  <Text style={{ color: isPrimary ? '#3b82f6' : '#3f3f46' }}>
                    {isPrimary ? '  ·  Primary' : `  ·  Alt ${i}`}
                  </Text>
                </Text>
              )}
            </View>

            <TouchableOpacity
              onPress={() => {
                if (isPrimary) {
                  Alert.alert('Change Primary', 'Remove this exercise?', [
                    { text: 'Cancel' },
                    { text: 'Remove', style: 'destructive', onPress: () => onChange(options.filter((_, idx) => idx !== 0)) },
                  ]);
                } else {
                  onChange(options.filter((_, idx) => idx !== i));
                }
              }}
              style={{ padding: 6 }}>
              <X size={16} color="#52525b" />
            </TouchableOpacity>
          </View>
        );
      })}

      <TouchableOpacity
        onPress={() => setPickerOpen(true)}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          marginTop: 10,
          paddingVertical: 6,
        }}>
        <Plus size={14} color="#ea580c" />
        <Text style={{ color: '#ea580c', fontSize: 13, fontWeight: '600' }}>
          {options.length === 0 ? 'Add Exercise' : 'Add Alternative'}
        </Text>
      </TouchableOpacity>

      <ExercisePicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={(ex) => onChange([...options, ex.id])}
        excludeIds={usedIds}
      />
    </View>
  );
}

// ─── Slot Row (in routine editor) ────────────────────────────────────────────

function SlotRow({
  slot,
  allExercises,
  onEdit,
  onDelete,
}: {
  slot: RoutineExercise;
  allExercises: Map<string, Exercise>;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onEdit}
      onLongPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        Alert.alert('Remove Exercise', 'Remove this slot from the routine?', [
          { text: 'Cancel' },
          { text: 'Remove', style: 'destructive', onPress: onDelete },
        ]);
      }}
      style={{
        backgroundColor: '#18181b',
        borderRadius: 14,
        padding: 14,
        marginBottom: 8,
        borderWidth: 1,
        borderColor: '#27272a',
      }}>
      {slot.exerciseGroups.map((group, gi) => {
        const primaryEx = allExercises.get(group[0]);
        const allOptions = group.map((id) => allExercises.get(id)).filter(Boolean) as Exercise[];
        return (
          <View key={gi} style={{ marginBottom: gi < slot.exerciseGroups.length - 1 ? 10 : 0 }}>
            {slot.exerciseGroups.length > 1 && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                <Link size={10} color="#f97316" />
                <Text style={{ color: '#f97316', fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  {gi === 0 ? 'Superset' : 'with'}
                </Text>
              </View>
            )}
            <Text style={{ color: 'white', fontSize: 15, fontWeight: '700', marginBottom: 6 }}>
              {primaryEx ? primaryEx.name : group[0] ?? '—'}
            </Text>
            {allOptions.length > 0 && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>
                {allOptions.map((ex, optIdx) => {
                  const isPrimary = optIdx === 0;
                  const label = exerciseLabel(ex);
                  // Show "Name · Equipment" if this alt has a different movement name
                  const fullLabel = ex.name !== primaryEx?.name
                    ? `${ex.name} · ${label}`
                    : label;
                  return (
                    <View
                      key={ex.id}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 4,
                        backgroundColor: isPrimary ? '#27272a' : '#1c1c1e',
                        borderRadius: 8,
                        paddingHorizontal: 8,
                        paddingVertical: 4,
                        borderWidth: 1,
                        borderColor: isPrimary ? '#3f3f46' : '#27272a',
                      }}>
                      {isPrimary && (
                        <Text style={{ color: '#60a5fa', fontSize: 9, fontWeight: '800' }}>①</Text>
                      )}
                      <Text
                        style={{
                          color: isPrimary ? '#e4e4e7' : '#71717a',
                          fontSize: 12,
                          fontWeight: isPrimary ? '700' : '500',
                        }}>
                        {fullLabel}
                      </Text>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        );
      })}
    </TouchableOpacity>
  );
}

// ─── Slot Editor Modal ────────────────────────────────────────────────────────

function SlotEditorModal({
  open,
  slot,
  allExercises,
  onClose,
  onSave,
}: {
  open: boolean;
  slot: RoutineExercise | null;
  allExercises: Map<string, Exercise>;
  onClose: () => void;
  onSave: (updated: RoutineExercise) => void;
}) {
  const [groups, setGroups] = useState<string[][]>([]);
  const [addGroupPickerOpen, setAddGroupPickerOpen] = useState(false);

  useEffect(() => {
    if (open && slot) setGroups(slot.exerciseGroups.map((g) => [...g]));
  }, [open, slot]);

  if (!slot) return null;

  const updateGroup = (gi: number, newOptions: string[]) => {
    setGroups((prev) => prev.map((g, i) => (i === gi ? newOptions : g)));
  };

  const removeGroup = (gi: number) => {
    setGroups((prev) => prev.filter((_, i) => i !== gi));
  };

  const handleSave = () => {
    const valid = groups.filter((g) => g.length > 0);
    if (valid.length === 0) {
      onClose();
      return;
    }
    onSave({ ...slot, exerciseGroups: valid });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent
        className="gap-0 p-0"
        style={{
          backgroundColor: '#09090b',
          width,
          height: screenHeight * 0.8,
          marginTop: 'auto',
          padding: 0,
          gap: 0,
        }}>
        <View style={{ flex: 1 }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              padding: 16,
              borderBottomWidth: 1,
              borderBottomColor: '#262626',
            }}>
            <DialogTitle style={{ color: 'white', flex: 1 }}>Edit Exercise Slot</DialogTitle>
            <TouchableOpacity onPress={onClose}>
              <X size={20} color="#71717a" />
            </TouchableOpacity>
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
            {groups.map((group, gi) => (
              <SlotGroupEditor
                key={gi}
                groupIndex={gi}
                options={group}
                allExercises={allExercises}
                onChange={(opts) => updateGroup(gi, opts)}
                onRemoveGroup={() => removeGroup(gi)}
                canRemoveGroup={groups.length > 1}
              />
            ))}

            <TouchableOpacity
              onPress={() => setAddGroupPickerOpen(true)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                paddingVertical: 10,
                paddingHorizontal: 14,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: '#27272a',
                borderStyle: 'dashed',
                justifyContent: 'center',
                marginBottom: 20,
              }}>
              <Link size={14} color="#71717a" />
              <Text style={{ color: '#71717a', fontSize: 13, fontWeight: '600' }}>Add Superset Exercise</Text>
            </TouchableOpacity>
          </ScrollView>

          <View style={{ padding: 16, borderTopWidth: 1, borderTopColor: '#262626' }}>
            <Button
              onPress={handleSave}
              style={{ backgroundColor: '#ea580c', borderRadius: 12 }}>
              <Text style={{ color: 'white', fontWeight: '700', fontSize: 15 }}>Save</Text>
            </Button>
          </View>

          <ExercisePicker
            open={addGroupPickerOpen}
            onClose={() => setAddGroupPickerOpen(false)}
            onSelect={(ex) => {
              setGroups((prev) => [...prev, [ex.id]]);
            }}
          />
        </View>
      </DialogContent>
    </Dialog>
  );
}

// ─── Routine Editor ───────────────────────────────────────────────────────────

function RoutineEditor({
  routine,
  allExercises,
  onBack,
  onSave,
}: {
  routine: Routine;
  allExercises: Map<string, Exercise>;
  onBack: () => void;
  onSave: (r: Routine) => void;
}) {
  const [name, setName] = useState(routine.name);
  const [description, setDescription] = useState(routine.description ?? '');
  const [slots, setSlots] = useState<RoutineExercise[]>(routine.exercises);
  const [editingSlot, setEditingSlot] = useState<RoutineExercise | null>(null);
  const [slotEditorOpen, setSlotEditorOpen] = useState(false);
  const [addSlotPickerOpen, setAddSlotPickerOpen] = useState(false);
  const [supersetMode, setSupersetMode] = useState(false);
  const [supersetStaged, setSupersetStaged] = useState<string[]>([]);
  const [supersetPickerOpen, setSupersetPickerOpen] = useState(false);

  const handleSaveSlot = (updated: RoutineExercise) => {
    setSlots((prev) =>
      prev.map((s) => (s.id === updated.id ? updated : s))
    );
  };

  const handleAddSlot = (ex: Exercise) => {
    if (supersetMode) {
      setSupersetStaged((prev) => [...prev, ex.id]);
      setSupersetPickerOpen(true);
    } else {
      const newSlot: RoutineExercise = {
        id: `re_${Date.now()}`,
        routineId: routine.id,
        order: slots.length,
        exerciseGroups: [[ex.id]],
      };
      setSlots((prev) => [...prev, newSlot]);
    }
  };

  const handleFinishSuperset = () => {
    if (supersetStaged.length === 0) return;
    const newSlot: RoutineExercise = {
      id: `re_${Date.now()}`,
      routineId: routine.id,
      order: slots.length,
      exerciseGroups: supersetStaged.map((id) => [id]),
    };
    setSlots((prev) => [...prev, newSlot]);
    setSupersetMode(false);
    setSupersetStaged([]);
  };

  const handleSave = () => {
    const updated: Routine = {
      ...routine,
      name: name.trim() || 'Unnamed Routine',
      description: description.trim(),
      exercises: slots.map((s, i) => ({ ...s, order: i })),
    };
    onSave(updated);
    onBack();
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: 'black' }}>
      {/* Header */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 16,
          paddingTop: 16,
          paddingBottom: 12,
          borderBottomWidth: 1,
          borderBottomColor: '#1c1c1e',
          gap: 12,
        }}>
        <TouchableOpacity onPress={onBack} style={{ padding: 4 }}>
          <ChevronLeft size={24} color="white" />
        </TouchableOpacity>
        <Text style={{ color: 'white', fontSize: 18, fontWeight: '700', flex: 1 }}>Edit Routine</Text>
        <TouchableOpacity
          onPress={handleSave}
          style={{ backgroundColor: '#ea580c', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 }}>
          <Text style={{ color: 'white', fontWeight: '700', fontSize: 14 }}>Save</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16 }}
        keyboardShouldPersistTaps="handled">
        {/* Name */}
        <Text style={{ color: '#71717a', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
          Name
        </Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Routine name"
          placeholderTextColor="#3f3f46"
          style={{
            backgroundColor: '#18181b',
            color: 'white',
            borderRadius: 12,
            padding: 14,
            fontSize: 16,
            fontWeight: '600',
            marginBottom: 16,
          }}
        />

        {/* Description */}
        <Text style={{ color: '#71717a', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
          Description
        </Text>
        <TextInput
          value={description}
          onChangeText={setDescription}
          placeholder="Optional description"
          placeholderTextColor="#3f3f46"
          multiline
          style={{
            backgroundColor: '#18181b',
            color: 'white',
            borderRadius: 12,
            padding: 14,
            fontSize: 14,
            marginBottom: 24,
            minHeight: 60,
          }}
        />

        {/* Exercise Slots */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
          <Text style={{ color: '#71717a', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, flex: 1 }}>
            Exercises ({slots.length})
          </Text>
        </View>

        {slots.map((slot) => (
          <SlotRow
            key={slot.id}
            slot={slot}
            allExercises={allExercises}
            onEdit={() => {
              setEditingSlot(slot);
              setSlotEditorOpen(true);
            }}
            onDelete={() => setSlots((prev) => prev.filter((s) => s.id !== slot.id))}
          />
        ))}

        {/* Add exercise controls */}
        {supersetMode ? (
          <View
            style={{
              backgroundColor: '#18181b',
              borderRadius: 14,
              padding: 14,
              borderWidth: 1,
              borderColor: '#f97316',
              marginBottom: 12,
            }}>
            <Text style={{ color: '#f97316', fontWeight: '700', marginBottom: 8 }}>
              Superset mode — {supersetStaged.length} exercise{supersetStaged.length !== 1 ? 's' : ''} staged
            </Text>
            {supersetStaged.map((id, i) => {
              const ex = allExercises.get(id);
              return (
                <Text key={id} style={{ color: '#d4d4d8', fontSize: 13, marginBottom: 4 }}>
                  {i + 1}. {ex?.name ?? id} · {ex ? exerciseLabel(ex) : ''}
                </Text>
              );
            })}
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
              <TouchableOpacity
                onPress={() => setSupersetPickerOpen(true)}
                style={{
                  flex: 1,
                  backgroundColor: '#27272a',
                  borderRadius: 10,
                  padding: 10,
                  alignItems: 'center',
                }}>
                <Text style={{ color: 'white', fontWeight: '600', fontSize: 13 }}>+ Exercise</Text>
              </TouchableOpacity>
              {supersetStaged.length >= 2 && (
                <TouchableOpacity
                  onPress={handleFinishSuperset}
                  style={{
                    flex: 1,
                    backgroundColor: '#f97316',
                    borderRadius: 10,
                    padding: 10,
                    alignItems: 'center',
                  }}>
                  <Text style={{ color: 'white', fontWeight: '700', fontSize: 13 }}>Add Superset</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                onPress={() => {
                  setSupersetMode(false);
                  setSupersetStaged([]);
                }}
                style={{
                  backgroundColor: '#27272a',
                  borderRadius: 10,
                  padding: 10,
                  paddingHorizontal: 14,
                  alignItems: 'center',
                }}>
                <Text style={{ color: '#ef4444', fontWeight: '600', fontSize: 13 }}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 40 }}>
            <TouchableOpacity
              onPress={() => setAddSlotPickerOpen(true)}
              style={{
                flex: 1,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                backgroundColor: '#18181b',
                borderRadius: 12,
                padding: 12,
                borderWidth: 1,
                borderColor: '#27272a',
              }}>
              <Plus size={16} color="#ea580c" />
              <Text style={{ color: '#ea580c', fontWeight: '600', fontSize: 14 }}>Add Exercise</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                setSupersetMode(true);
                setSupersetPickerOpen(true);
              }}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                backgroundColor: '#18181b',
                borderRadius: 12,
                padding: 12,
                paddingHorizontal: 14,
                borderWidth: 1,
                borderColor: '#27272a',
              }}>
              <Link size={14} color="#f97316" />
              <Text style={{ color: '#f97316', fontWeight: '600', fontSize: 14 }}>Superset</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      <SlotEditorModal
        open={slotEditorOpen}
        slot={editingSlot}
        allExercises={allExercises}
        onClose={() => { setSlotEditorOpen(false); setEditingSlot(null); }}
        onSave={handleSaveSlot}
      />

      <ExercisePicker
        open={addSlotPickerOpen}
        onClose={() => setAddSlotPickerOpen(false)}
        onSelect={handleAddSlot}
      />
      <ExercisePicker
        open={supersetPickerOpen}
        onClose={() => setSupersetPickerOpen(false)}
        onSelect={(ex) => {
          setSupersetStaged((prev) => [...prev, ex.id]);
          setSupersetPickerOpen(false);
        }}
      />
    </KeyboardAvoidingView>
  );
}

// ─── Routine Card ─────────────────────────────────────────────────────────────

function RoutineCard({
  routine,
  allExercises,
  onEdit,
  onDelete,
}: {
  routine: Routine;
  allExercises: Map<string, Exercise>;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const exerciseNames = routine.exercises
    .slice(0, 4)
    .map((slot) => {
      const ex = allExercises.get(slot.exerciseGroups[0]?.[0] ?? '');
      return ex?.name ?? '—';
    });

  return (
    <TouchableOpacity
      onPress={onEdit}
      onLongPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        Alert.alert('Delete Routine', `Delete "${routine.name}"?`, [
          { text: 'Cancel' },
          { text: 'Delete', style: 'destructive', onPress: onDelete },
        ]);
      }}
      style={{
        backgroundColor: '#121212',
        borderRadius: 20,
        padding: 18,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: '#262626',
      }}>
      <Text style={{ color: 'white', fontSize: 20, fontWeight: '800', marginBottom: 4 }}>
        {routine.name}
      </Text>
      {routine.description ? (
        <Text style={{ color: '#71717a', fontSize: 13, marginBottom: 10 }}>{routine.description}</Text>
      ) : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {exerciseNames.map((name, i) => (
          <View
            key={i}
            style={{
              backgroundColor: '#1c1c1e',
              borderRadius: 8,
              paddingHorizontal: 8,
              paddingVertical: 4,
            }}>
            <Text style={{ color: '#a1a1aa', fontSize: 12, fontWeight: '600' }}>{name}</Text>
          </View>
        ))}
        {routine.exercises.length > 4 && (
          <View style={{ backgroundColor: '#1c1c1e', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
            <Text style={{ color: '#52525b', fontSize: 12, fontWeight: '600' }}>
              +{routine.exercises.length - 4} more
            </Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

// ─── WorkoutBuilder (main tab) ────────────────────────────────────────────────

export default function WorkoutBuilder() {
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [allExercises, setAllExercises] = useState<Map<string, Exercise>>(new Map());
  const [editingRoutine, setEditingRoutine] = useState<Routine | null>(null);

  // Intercept Android hardware back button while editing a routine
  // so it returns to the routine list instead of switching tabs.
  useEffect(() => {
    if (!editingRoutine) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setEditingRoutine(null);
      return true; // consumed
    });
    return () => sub.remove();
  }, [editingRoutine]);

  const loadData = useCallback(async () => {
    const [rts, exs] = await Promise.all([RoutineDAL.getAll(), ExerciseDAL.getAll()]);
    setRoutines(rts);
    setAllExercises(new Map(exs.map((e) => [e.id, e])));
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const handleSaveRoutine = useCallback(
    async (routine: Routine) => {
      await RoutineDAL.save(routine);
      await loadData();
    },
    [loadData]
  );

  const handleDeleteRoutine = useCallback(
    async (id: string) => {
      await RoutineDAL.delete(id);
      await loadData();
    },
    [loadData]
  );

  const handleNewRoutine = () => {
    const newRoutine: Routine = {
      id: `routine_${Date.now()}`,
      name: 'New Routine',
      description: '',
      order: routines.length,
      exercises: [],
    };
    setEditingRoutine(newRoutine);
  };

  if (editingRoutine) {
    return (
      <RoutineEditor
        routine={editingRoutine}
        allExercises={allExercises}
        onBack={() => setEditingRoutine(null)}
        onSave={handleSaveRoutine}
      />
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: 'black' }}>
      {/* Header */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 20,
          paddingTop: 20,
          paddingBottom: 16,
        }}>
        <Text style={{ color: 'white', fontSize: 28, fontWeight: '800', flex: 1 }}>Routines</Text>
        <TouchableOpacity
          onPress={handleNewRoutine}
          style={{
            backgroundColor: '#ea580c',
            width: 36,
            height: 36,
            borderRadius: 18,
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <Plus size={20} color="white" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}>
        {routines.length === 0 ? (
          <View style={{ alignItems: 'center', marginTop: 80 }}>
            <Text style={{ color: '#3f3f46', fontSize: 16, fontWeight: '600' }}>No routines yet</Text>
            <Text style={{ color: '#27272a', fontSize: 13, marginTop: 6 }}>Tap + to create one</Text>
          </View>
        ) : (
          routines.map((r) => (
            <RoutineCard
              key={r.id}
              routine={r}
              allExercises={allExercises}
              onEdit={() => setEditingRoutine(r)}
              onDelete={() => handleDeleteRoutine(r.id)}
            />
          ))
        )}
      </ScrollView>
    </View>
  );
}
