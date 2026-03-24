import React, { useCallback, useEffect, useState } from 'react';
import { Dimensions, ScrollView, TextInput, TouchableOpacity, View } from 'react-native';
import { Text } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { RoutineDAL, ExerciseDAL } from '@/lib/db';
import type { Routine, Block } from '@/lib/types';
import type { Exercise } from '@/lib/exercises';
import { ChevronLeft, Link, Search, X } from 'lucide-react-native';

const { width, height: screenHeight } = Dimensions.get('window');

function fmt(s: string) {
  if (s === 'ez_bar') return 'EZ Bar';
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function exerciseLabel(ex: Exercise): string {
  const base = ex.equipmentVariant
    ? `${fmt(ex.equipmentVariant)} ${fmt(ex.equipment)}`
    : fmt(ex.equipment);
  return base.trim();
}

function buildBlocksFromSlots(
  routine: Routine,
  slotIndices: number[],
  workoutId: string,
  startOrder: number,
  exerciseMap: Map<string, Exercise>
): Block[] {
  return slotIndices.map((slotIdx, i) => {
    const slot = routine.exercises[slotIdx];
    const exerciseIds = slot.exerciseGroups.map((group) => group[0]).filter(Boolean);
    const exercises = exerciseIds
      .map((id) => exerciseMap.get(id))
      .filter((e): e is Exercise => e != null);
    const type = exerciseIds.length > 1 ? 'superset' : 'standard';
    const name =
      exercises.map((e) => e.name).join(' / ') || (slot.exerciseGroups.flat()[0] ?? 'Exercise');

    return {
      id: `block_${Date.now()}_${i}`,
      workoutId,
      order: startOrder + i,
      type,
      name,
      exerciseIds,
      exercises,
      sets: 0,
      datetime: new Date().toISOString(),
      events: [],
      alternativeExerciseOptions: slot.exerciseGroups,
    };
  });
}

export default function AddRoutine({ onAdd }: { onAdd: (blocks: Block[]) => void }) {
  const [open, setOpen] = useState(false);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [exerciseMap, setExerciseMap] = useState<Map<string, Exercise>>(new Map());
  const [search, setSearch] = useState('');

  // Selection step state
  const [selectedRoutine, setSelectedRoutine] = useState<Routine | null>(null);
  const [selectedSlots, setSelectedSlots] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!open) return;
    Promise.all([RoutineDAL.getAll(), ExerciseDAL.getAll()]).then(([rts, exs]) => {
      setRoutines(rts);
      setExerciseMap(new Map(exs.map((e) => [e.id, e])));
    });
  }, [open]);

  useEffect(() => {
    if (!open) {
      setSearch('');
      setSelectedRoutine(null);
    }
  }, [open]);

  const filteredRoutines = search.trim()
    ? routines.filter((r) => r.name.toLowerCase().includes(search.toLowerCase()))
    : routines;

  const handleOpenRoutine = useCallback((routine: Routine) => {
    setSelectedRoutine(routine);
    setSelectedSlots(new Set(routine.exercises.map((_, i) => i)));
  }, []);

  const handleBack = useCallback(() => {
    setSelectedRoutine(null);
  }, []);

  const toggleSlot = useCallback((idx: number) => {
    setSelectedSlots((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    if (!selectedRoutine) return;
    setSelectedSlots((prev) =>
      prev.size === selectedRoutine.exercises.length
        ? new Set()
        : new Set(selectedRoutine.exercises.map((_, i) => i))
    );
  }, [selectedRoutine]);

  const handleAdd = useCallback(() => {
    if (!selectedRoutine || selectedSlots.size === 0) return;
    const indices = Array.from(selectedSlots).sort((a, b) => a - b);
    const blocks = buildBlocksFromSlots(
      selectedRoutine,
      indices,
      `workout_${Date.now()}`,
      0,
      exerciseMap
    );
    setOpen(false);
    setTimeout(() => onAdd(blocks), 300);
  }, [selectedRoutine, selectedSlots, exerciseMap, onAdd]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="rounded-full bg-violet-600" style={{ height: 44 }}>
          <Text className="font-bold text-white">+ Add Routine</Text>
        </Button>
      </DialogTrigger>

      <DialogContent
        className="gap-0 p-0"
        style={{
          backgroundColor: '#1c1b22',
          borderColor: '#32303d',
          width: width - 24,
          height: screenHeight * 0.92,
          marginTop: 'auto',
          padding: 0,
          gap: 0,
        }}>
        {/* Drag handle */}
        <View style={{ alignItems: 'center', paddingTop: 10, paddingBottom: 2 }}>
          <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: '#3d3b48' }} />
        </View>

        <View style={{ flex: 1 }}>
          {selectedRoutine ? (
            /* ── Exercise selection view ── */
            <>
              {/* Header */}
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  padding: 16,
                  paddingBottom: 12,
                  borderBottomWidth: 1,
                  borderBottomColor: '#32303d',
                  gap: 10,
                }}>
                <TouchableOpacity
                  onPress={handleBack}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <ChevronLeft size={22} color="#a1a1aa" />
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                  <DialogTitle
                    style={{ color: 'white', fontSize: 17, fontWeight: '700', marginBottom: 1 }}>
                    {selectedRoutine.name}
                  </DialogTitle>
                  <Text style={{ color: '#6b6880', fontSize: 12 }}>
                    Select exercises to add
                  </Text>
                </View>
              </View>

              {/* Exercise slots */}
              <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 16 }}>
                {/* Select all row */}
                <TouchableOpacity
                  onPress={toggleAll}
                  activeOpacity={0.7}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingVertical: 13,
                    paddingHorizontal: 20,
                    borderBottomWidth: 1,
                    borderBottomColor: '#32303d',
                    gap: 14,
                  }}>
                  <View
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 6,
                      borderWidth: 2,
                      borderColor: selectedSlots.size > 0 ? '#7c3aed' : '#4a4858',
                      backgroundColor: selectedSlots.size === selectedRoutine.exercises.length ? '#7c3aed' : 'transparent',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                    {selectedSlots.size === selectedRoutine.exercises.length && (
                      <Text style={{ color: 'white', fontSize: 13, fontWeight: '800', lineHeight: 16 }}>✓</Text>
                    )}
                    {selectedSlots.size > 0 && selectedSlots.size < selectedRoutine.exercises.length && (
                      <View style={{ width: 10, height: 2, backgroundColor: '#7c3aed', borderRadius: 1 }} />
                    )}
                  </View>
                  <Text style={{ color: '#c4c0d0', fontSize: 14, fontWeight: '600' }}>
                    Select all
                  </Text>
                  <Text style={{ color: '#4a4858', fontSize: 13, marginLeft: 'auto' }}>
                    {selectedSlots.size} / {selectedRoutine.exercises.length}
                  </Text>
                </TouchableOpacity>

                {selectedRoutine.exercises.map((slot, idx) => {
                  const isSuperset = slot.exerciseGroups.length > 1;
                  const names = slot.exerciseGroups.map(
                    (g) => exerciseMap.get(g[0] ?? '')?.name ?? '—'
                  );
                  const equipLabels = slot.exerciseGroups
                    .map((g) => {
                      const ex = exerciseMap.get(g[0] ?? '');
                      return ex ? exerciseLabel(ex) : null;
                    })
                    .filter(Boolean);
                  const selected = selectedSlots.has(idx);

                  return (
                    <TouchableOpacity
                      key={slot.id}
                      onPress={() => toggleSlot(idx)}
                      activeOpacity={0.7}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        paddingVertical: 13,
                        paddingHorizontal: 20,
                        borderBottomWidth: 1,
                        borderBottomColor: '#28262f',
                        gap: 14,
                      }}>
                      {/* Checkbox */}
                      <View
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: 6,
                          borderWidth: 2,
                          borderColor: selected ? '#7c3aed' : '#4a4858',
                          backgroundColor: selected ? '#7c3aed' : 'transparent',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}>
                        {selected && (
                          <Text style={{ color: 'white', fontSize: 13, fontWeight: '800', lineHeight: 16 }}>
                            ✓
                          </Text>
                        )}
                      </View>

                      {/* Exercise info */}
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                          {isSuperset && <Link size={11} color="#f97316" />}
                          <Text
                            style={{
                              color: selected ? '#fafafa' : '#5c5870',
                              fontSize: 15,
                              fontWeight: '600',
                            }}>
                            {names.join(' + ')}
                          </Text>
                        </View>
                        {equipLabels.length > 0 && (
                          <Text style={{ color: '#4a4858', fontSize: 12, marginTop: 2 }}>
                            {equipLabels.join(' · ')}
                          </Text>
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {/* Footer */}
              <View
                style={{
                  padding: 16,
                  borderTopWidth: 1,
                  borderTopColor: '#32303d',
                  backgroundColor: '#18171e',
                }}>
                <TouchableOpacity
                  onPress={handleAdd}
                  disabled={selectedSlots.size === 0}
                  style={{
                    backgroundColor: selectedSlots.size === 0 ? '#2a2832' : '#7c3aed',
                    borderRadius: 14,
                    paddingVertical: 14,
                    alignItems: 'center',
                  }}>
                  <Text
                    style={{
                      color: selectedSlots.size === 0 ? '#4a4858' : 'white',
                      fontSize: 15,
                      fontWeight: '700',
                    }}>
                    {selectedSlots.size === 0
                      ? 'No exercises selected'
                      : `Add ${selectedSlots.size} exercise${selectedSlots.size !== 1 ? 's' : ''}`}
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            /* ── Routine list view ── */
            <>
              {/* Header */}
              <View
                style={{
                  padding: 16,
                  paddingBottom: 12,
                  borderBottomWidth: 1,
                  borderBottomColor: '#32303d',
                }}>
                <DialogTitle
                  style={{ color: 'white', fontSize: 17, fontWeight: '700', marginBottom: 2 }}>
                  Add Routine
                </DialogTitle>
                <Text style={{ color: '#6b6880', fontSize: 13 }}>
                  Exercises are added as ghost slots — open each to log sets
                </Text>
              </View>

              {/* Search */}
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: '#14131a',
                  marginHorizontal: 16,
                  marginVertical: 10,
                  borderRadius: 12,
                  paddingHorizontal: 12,
                  borderWidth: 1,
                  borderColor: '#32303d',
                }}>
                <Search size={16} color="#5c5870" />
                <TextInput
                  placeholder="Search routines…"
                  placeholderTextColor="#4a4858"
                  value={search}
                  onChangeText={setSearch}
                  style={{
                    flex: 1,
                    color: 'white',
                    paddingVertical: 10,
                    paddingLeft: 8,
                    fontSize: 14,
                  }}
                />
                {search !== '' && (
                  <TouchableOpacity onPress={() => setSearch('')}>
                    <X size={16} color="#5c5870" />
                  </TouchableOpacity>
                )}
              </View>

              {/* Routine list */}
              <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 16 }}>
                {filteredRoutines.length === 0 ? (
                  <View style={{ padding: 32, alignItems: 'center' }}>
                    <Text style={{ color: '#4a4858', fontSize: 15, fontWeight: '600' }}>
                      {search ? 'No matches' : 'No routines yet'}
                    </Text>
                    {!search && (
                      <Text style={{ color: '#32303d', fontSize: 13, marginTop: 4 }}>
                        Create routines in the Routines tab
                      </Text>
                    )}
                  </View>
                ) : (
                  filteredRoutines.map((routine) => (
                    <TouchableOpacity
                      key={routine.id}
                      onPress={() => handleOpenRoutine(routine)}
                      style={{
                        paddingVertical: 14,
                        paddingHorizontal: 20,
                        borderBottomWidth: 1,
                        borderBottomColor: '#28262f',
                      }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                        <Text style={{ color: 'white', fontSize: 17, fontWeight: '700', flex: 1 }}>
                          {routine.name}
                        </Text>
                        <Text style={{ color: '#5c5870', fontSize: 12 }}>
                          {routine.exercises.length} exercises
                        </Text>
                      </View>
                      {routine.description ? (
                        <Text style={{ color: '#6b6880', fontSize: 13, marginBottom: 8 }}>
                          {routine.description}
                        </Text>
                      ) : null}
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                        {routine.exercises.map((slot) => {
                          const isSuperset = slot.exerciseGroups.length > 1;
                          const names = slot.exerciseGroups.map(
                            (g) => exerciseMap.get(g[0] ?? '')?.name ?? '—'
                          );
                          return (
                            <View
                              key={slot.id}
                              style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                backgroundColor: '#14131a',
                                borderRadius: 8,
                                paddingHorizontal: 8,
                                paddingVertical: 4,
                                gap: 4,
                                borderWidth: 1,
                                borderColor: '#32303d',
                              }}>
                              {isSuperset && <Link size={10} color="#f97316" />}
                              <Text style={{ color: '#9490a8', fontSize: 12, fontWeight: '600' }}>
                                {names.join(' + ')}
                              </Text>
                            </View>
                          );
                        })}
                      </View>
                    </TouchableOpacity>
                  ))
                )}
              </ScrollView>
            </>
          )}
        </View>
      </DialogContent>
    </Dialog>
  );
}
