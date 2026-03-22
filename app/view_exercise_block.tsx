import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Pressable, Alert } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Text } from '@/components/ui/text';
import { Activity } from 'lucide-react-native';
import { router } from 'expo-router';
import type { Block } from '@/lib/types';
import type { Exercise } from '@/lib/exercises';
import { setActiveBlock } from '@/lib/block-state';
import { restTimer } from '@/lib/rest-timer';

function fmt(s: string) {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
function variantLabel(ex: Exercise): string {
  if (ex.equipmentVariant) {
    return `${fmt(ex.equipmentVariant)} ${fmt(ex.equipment === 'ez_bar' ? 'EZ Bar' : ex.equipment)}`.trim();
  }
  return fmt(ex.equipment === 'ez_bar' ? 'EZ Bar' : ex.equipment);
}

type ViewExerciseBlockProps = {
  exerciseBlock: Block;
  saveEditedBlock: (dateString: string, block: Block) => void;
  dateString: string;
  exerciseList?: Exercise[];
  onDeleteBlock: (blockId: string) => void;
};

function ViewExerciseBlock({
  exerciseBlock,
  saveEditedBlock,
  dateString,
  onDeleteBlock,
}: ViewExerciseBlockProps) {
  // Re-render when this block's rest state changes (active → done or started)
  const [, forceUpdate] = useState(0);
  const wasRestingRef = useRef(restTimer.isActiveBlock(exerciseBlock?.id ?? ''));
  useEffect(() => {
    const id = exerciseBlock?.id ?? '';
    const interval = setInterval(() => {
      const isResting = restTimer.isActiveBlock(id);
      if (isResting || isResting !== wasRestingRef.current) {
        wasRestingRef.current = isResting;
        forceUpdate((n) => n + 1);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [exerciseBlock?.id]);

  if (!exerciseBlock) return null;

  const isResting = restTimer.isActiveBlock(exerciseBlock.id);

  const blockSummary = useMemo(() => {
    const setEvents = exerciseBlock.events.filter((e) => e.type === 'set');
    const workingSetEvents = setEvents.filter((e) =>
      e.subSets.some((s) => s.rep_type !== 'warmup')
    );
    const allWorkingSubSets = workingSetEvents.flatMap((e) =>
      e.subSets.filter((s) => s.rep_type !== 'warmup')
    );
    const volume = allWorkingSubSets.reduce((sum, s) => sum + s.weightKg * s.reps, 0);
    const totalRest = exerciseBlock.events
      .filter((e): e is import('@/lib/types').RestEvent => e.type === 'rest')
      .reduce((sum, e) => sum + e.durationSeconds, 0);
    const variantLabels = [...new Set(
      (exerciseBlock.exercises ?? [])
        .filter((ex) => ex.equipment)
        .map((ex) => variantLabel(ex))
    )];
    return { sets: workingSetEvents.length, volume, totalRest, variantLabels };
  }, [exerciseBlock]);

  return (
    <Pressable
      className="mb-3 rounded-[22px] border border-zinc-800 bg-zinc-900 p-5"
      onPress={() => {
        setActiveBlock({ block: exerciseBlock, dateString, saveEditedBlock, onDeleteBlock });
        router.push('/exercise_block');
      }}
      onLongPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        Alert.alert('Delete', 'Delete block?', [
          { text: 'Cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: () => onDeleteBlock(exerciseBlock.id),
          },
        ]);
      }}>
      <View className="mb-3 flex-row items-center justify-between">
        <View style={{ flex: 1 }}>
          <Text className="text-xl font-black leading-tight text-white">{exerciseBlock.name}</Text>
          {blockSummary.variantLabels.length > 0 && (
            <Text style={{ color: '#52525b', fontSize: 12, fontWeight: '600', marginTop: 2 }}>
              {blockSummary.variantLabels.join(' · ')}
            </Text>
          )}
        </View>
        <Activity size={20} color="#22c55e" />
      </View>
      <View className="flex-row flex-wrap gap-2">
        {blockSummary.variantLabels.map((label, i) => (
          <View
            key={`${label}-${i}`}
            className="rounded-lg border border-blue-500/20 bg-blue-500/10 px-2 py-1">
            <Text className="text-[9px] font-black uppercase tracking-widest text-blue-400">
              {label}
            </Text>
          </View>
        ))}
        {blockSummary.sets > 0 && (
          <View className="rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1">
            <Text className="text-[9px] font-black uppercase tracking-widest text-zinc-300">
              {blockSummary.sets} sets
            </Text>
          </View>
        )}
        {blockSummary.volume > 0 && (
          <View className="rounded-lg border border-green-500/20 bg-green-500/10 px-2 py-1">
            <Text className="text-[9px] font-black uppercase tracking-widest text-green-400">
              {blockSummary.volume.toLocaleString()}kg vol
            </Text>
          </View>
        )}
        {isResting ? (
          <View className="rounded-lg border border-purple-500/40 bg-purple-500/20 px-2 py-1">
            <Text className="text-[9px] font-black uppercase tracking-widest text-purple-400">
              Resting…
            </Text>
          </View>
        ) : blockSummary.totalRest > 0 ? (
          <View className="rounded-lg border border-purple-500/20 bg-purple-500/10 px-2 py-1">
            <Text className="text-[9px] font-black uppercase tracking-widest text-purple-400">
              {Math.round(blockSummary.totalRest / 60)}m rest
            </Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

export default React.memo(
  ViewExerciseBlock,
  (prev, next) =>
    prev.exerciseBlock === next.exerciseBlock &&
    prev.dateString === next.dateString &&
    (prev.exerciseList?.length ?? 0) === (next.exerciseList?.length ?? 0)
);
