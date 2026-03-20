import React, { useMemo } from 'react';
import { View, Pressable, Alert } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Text } from '@/components/ui/text';
import { Activity } from 'lucide-react-native';
import { router } from 'expo-router';
import type { Block } from '@/lib/types';
import type { Exercise } from '@/lib/exercises';
import { setActiveBlock } from '@/lib/block-state';

function fmt(s: string) {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
function variantLabel(ex: Exercise): string {
  if (ex.equipmentVariant) {
    return `${fmt(ex.equipmentVariant)} ${fmt(ex.equipment === 'ez_bar' ? 'EZ Bar' : ex.equipment)}`.trim();
  }
  const suffix = ex.id.startsWith(`${ex.baseId}_`) ? ex.id.slice(ex.baseId.length + 1) : '';
  if (suffix) {
    return suffix.replace('ez_bar', 'EZ Bar').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
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
  if (!exerciseBlock) return null;

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
    const variantLabels = (exerciseBlock.exercises ?? [])
      .filter((ex) => ex.equipment)
      .map((ex) => variantLabel(ex));
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
        {blockSummary.variantLabels.map((label) => (
          <View key={label} className="rounded-lg border border-blue-500/20 bg-blue-500/10 px-2 py-1">
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
        {blockSummary.totalRest > 0 && (
          <View className="rounded-lg border border-purple-500/20 bg-purple-500/10 px-2 py-1">
            <Text className="text-[9px] font-black uppercase tracking-widest text-purple-400">
              {Math.round(blockSummary.totalRest / 60)}m rest
            </Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}

export default React.memo(ViewExerciseBlock, (prev, next) =>
  prev.exerciseBlock === next.exerciseBlock &&
  prev.dateString === next.dateString &&
  (prev.exerciseList?.length ?? 0) === (next.exerciseList?.length ?? 0)
);
