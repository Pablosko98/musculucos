import React, { useCallback, useEffect, useState } from 'react';
import { Dimensions, ScrollView, TextInput, TouchableOpacity, View } from 'react-native';
import { Text } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { RoutineDAL, ExerciseDAL } from '@/lib/db';
import type { Routine, Block } from '@/lib/types';
import type { Exercise } from '@/lib/exercises';
import { Link, Search, X } from 'lucide-react-native';

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

function buildBlocksFromRoutine(
  routine: Routine,
  workoutId: string,
  startOrder: number,
  exerciseMap: Map<string, Exercise>
): Block[] {
  return routine.exercises.map((slot, i) => {
    const exerciseIds = slot.exerciseGroups.map((group) => group[0]).filter(Boolean);
    const exercises = exerciseIds
      .map((id) => exerciseMap.get(id))
      .filter((e): e is Exercise => e != null);
    const type = exerciseIds.length > 1 ? 'superset' : 'standard';
    const name = exercises.map((e) => e.name).join(' / ') || (slot.exerciseGroups.flat()[0] ?? 'Exercise');

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

  useEffect(() => {
    if (!open) return;
    Promise.all([RoutineDAL.getAll(), ExerciseDAL.getAll()]).then(([rts, exs]) => {
      setRoutines(rts);
      setExerciseMap(new Map(exs.map((e) => [e.id, e])));
    });
  }, [open]);

  useEffect(() => {
    if (!open) setSearch('');
  }, [open]);

  const filteredRoutines = search.trim()
    ? routines.filter((r) => r.name.toLowerCase().includes(search.toLowerCase()))
    : routines;

  const handleSelect = useCallback(
    (routine: Routine) => {
      const blocks = buildBlocksFromRoutine(routine, `workout_${Date.now()}`, 0, exerciseMap);
      setOpen(false);
      setTimeout(() => onAdd(blocks), 300);
    },
    [exerciseMap, onAdd]
  );

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
          backgroundColor: '#09090b',
          width,
          height: screenHeight * 0.62,
          marginTop: 'auto',
          padding: 0,
          gap: 0,
        }}>
        <View style={{ flex: 1 }}>
          {/* Header */}
          <View
            style={{
              padding: 16,
              paddingBottom: 12,
              borderBottomWidth: 1,
              borderBottomColor: '#262626',
            }}>
            <DialogTitle style={{ color: 'white', fontSize: 17, fontWeight: '700', marginBottom: 2 }}>
              Add Routine
            </DialogTitle>
            <Text style={{ color: '#52525b', fontSize: 13 }}>
              Exercises are added as ghost slots — open each to log sets
            </Text>
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
            <Search size={16} color="#52525b" />
            <TextInput
              placeholder="Search routines…"
              placeholderTextColor="#3f3f46"
              value={search}
              onChangeText={setSearch}
              style={{ flex: 1, color: 'white', paddingVertical: 10, paddingLeft: 8, fontSize: 14 }}
            />
            {search !== '' && (
              <TouchableOpacity onPress={() => setSearch('')}>
                <X size={16} color="#52525b" />
              </TouchableOpacity>
            )}
          </View>

          {/* Routine list */}
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 16 }}>
            {filteredRoutines.length === 0 ? (
              <View style={{ padding: 32, alignItems: 'center' }}>
                <Text style={{ color: '#3f3f46', fontSize: 15, fontWeight: '600' }}>
                  {search ? 'No matches' : 'No routines yet'}
                </Text>
                {!search && (
                  <Text style={{ color: '#27272a', fontSize: 13, marginTop: 4 }}>
                    Create routines in the Routines tab
                  </Text>
                )}
              </View>
            ) : (
              filteredRoutines.map((routine) => (
                <TouchableOpacity
                  key={routine.id}
                  onPress={() => handleSelect(routine)}
                  style={{
                    paddingVertical: 14,
                    paddingHorizontal: 20,
                    borderBottomWidth: 1,
                    borderBottomColor: '#18181b',
                  }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                    <Text style={{ color: 'white', fontSize: 17, fontWeight: '700', flex: 1 }}>
                      {routine.name}
                    </Text>
                    <Text style={{ color: '#52525b', fontSize: 12 }}>
                      {routine.exercises.length} exercises
                    </Text>
                  </View>
                  {routine.description ? (
                    <Text style={{ color: '#52525b', fontSize: 13, marginBottom: 8 }}>
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
                            backgroundColor: '#1c1c1e',
                            borderRadius: 8,
                            paddingHorizontal: 8,
                            paddingVertical: 4,
                            gap: 4,
                          }}>
                          {isSuperset && <Link size={10} color="#f97316" />}
                          <Text style={{ color: '#a1a1aa', fontSize: 12, fontWeight: '600' }}>
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
        </View>
      </DialogContent>
    </Dialog>
  );
}
