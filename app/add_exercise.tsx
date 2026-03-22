import React, { useState, useEffect, useRef, useCallback } from 'react';
import { TouchableOpacity } from 'react-native';
import { Text } from '@/components/ui/text';
import { ExercisePickerSheet } from '@/components/ExercisePickerSheet';
import type { Exercise } from '@/lib/exercises';
import { ExerciseDAL } from '@/lib/db';
import { useFocusEffect } from 'expo-router';
import { takePendingExerciseAdd } from '@/lib/pending-exercise-add';
import { Plus } from 'lucide-react-native';

export default function AddExercise({
  onAdd,
  dateString,
}: {
  onAdd: (exercises: Exercise[]) => void;
  dateString: string;
}) {
  const [open, setOpen] = useState(false);
  const pendingAdd = useRef<Exercise[] | null>(null);

  // Delay onAdd until after Dialog close animation
  useEffect(() => {
    if (open || !pendingAdd.current) return;
    const exercises = pendingAdd.current;
    pendingAdd.current = null;
    const t = setTimeout(() => onAdd(exercises), 350);
    return () => clearTimeout(t);
  }, [open, onAdd]);

  // Auto-add exercises created via create_exercise screen
  useFocusEffect(
    useCallback(() => {
      const ids = takePendingExerciseAdd(dateString);
      if (!ids || ids.length === 0) return;
      ExerciseDAL.getAll().then((all) => {
        const exercises = ids.map((id) => all.find((e) => e.id === id)).filter(Boolean) as Exercise[];
        if (exercises.length > 0) onAdd(exercises);
      });
    }, [dateString, onAdd])
  );

  return (
    <>
      <TouchableOpacity
        onPress={() => setOpen(true)}
        style={{
          flexDirection: 'row', alignItems: 'center', gap: 6,
          backgroundColor: '#ea580c', borderRadius: 100,
          paddingHorizontal: 16, paddingVertical: 10,
        }}>
        <Plus size={16} color="white" />
        <Text style={{ color: 'white', fontWeight: '700', fontSize: 14 }}>Add Exercise</Text>
      </TouchableOpacity>

      <ExercisePickerSheet
        open={open}
        onClose={() => setOpen(false)}
        title="Add Exercise"
        onSelect={(ex) => { pendingAdd.current = [ex]; setOpen(false); }}
        onSelectMultiple={(exs) => { pendingAdd.current = exs; setOpen(false); }}
        createContext={{ type: 'workout', dateString }}
      />
    </>
  );
}
